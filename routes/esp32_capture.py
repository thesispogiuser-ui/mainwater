"""
routes/esp32_capture.py — Receives images POSTed by ESP32 (every hour),
runs Claude Vision OCR server-side to read both digit and analog values,
then saves the result to MeterReading + DailyConsumption tables.

ESP32 config.ini sets:
    [Webhook]
    Uri = https://watermonitoring.up.railway.app/api/esp32/image-upload
    ApiKey = ESP32_UPLOAD_KEY
    UploadImg = 1

The ESP32 (AI-on-the-Edge firmware) POSTs multipart/form-data with:
    - file: JPEG image of the meter face
    - value: pre-parsed reading (we ignore this — server does real OCR)
    - timestamp: ISO timestamp from device

Env vars required:
    ESP32_UPLOAD_KEY  — shared secret, must match ApiKey in config.ini
    ANTHROPIC_API_KEY — for Claude Vision OCR
"""

import os
import base64
import json
import requests
from flask import Blueprint, request, jsonify
from datetime import datetime, date
from database import db, MeterReading, Submeter, DailyConsumption, MonthlyConsumption, SystemLog

esp32_bp = Blueprint('esp32', __name__)

ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
ANTHROPIC_MODEL   = 'claude-opus-4-6'   # Use Vision-capable model

UPLOAD_KEY = os.environ.get('ESP32_UPLOAD_KEY', 'ESP32_UPLOAD_KEY')


def _verify_key(req) -> bool:
    """Accept key via X-Api-Key header OR ?apikey= query param (ESP32 firmware)."""
    provided = (
        req.headers.get('X-Api-Key')
        or req.args.get('apikey')
        or req.args.get('ApiKey')
        or req.form.get('apikey')
        or ''
    )
    return provided == UPLOAD_KEY


def _ocr_meter_image(jpeg_bytes: bytes) -> dict:
    """
    Send the meter image to Claude Vision.
    Returns { value: float|None, analog_values: list, raw_digits: str, error: str|None }
    """
    api_key = os.environ.get('ANTHROPIC_API_KEY', '')
    if not api_key:
        return {'value': None, 'error': 'ANTHROPIC_API_KEY not set', 'raw_digits': '', 'analog_values': []}

    b64 = base64.standard_b64encode(jpeg_bytes).decode()

    prompt = """You are reading a Herco-Tech water meter. Look at the meter face carefully.

1. Read the DIGITAL display (the black numbered rollers in the rectangular window). 
   These show the main reading in cubic meters (m³). 
   Read all 5 digits including leading zeros. Example: 00028 means 28 m³.

2. Read the ANALOG sub-dials (the small round dials with red needles).
   They show fractions of m³: ×0.0001, ×0.001, ×0.01, ×0.1

3. Combine them into a full reading like: 00028.450

Respond ONLY with a valid JSON object, no markdown, no explanation:
{
  "digits": "NNNNN",
  "analog": [0.0, 0.0, 0.0, 0.0],
  "full_value": 00028.450,
  "confidence": "high|medium|low",
  "notes": "optional short note if something is unclear"
}

If you cannot read the meter at all, set full_value to null and explain in notes."""

    try:
        resp = requests.post(
            ANTHROPIC_API_URL,
            headers={
                'Content-Type': 'application/json',
                'x-api-key': api_key,
                'anthropic-version': '2023-06-01',
            },
            json={
                'model': ANTHROPIC_MODEL,
                'max_tokens': 300,
                'messages': [{
                    'role': 'user',
                    'content': [
                        {
                            'type': 'image',
                            'source': {
                                'type': 'base64',
                                'media_type': 'image/jpeg',
                                'data': b64,
                            }
                        },
                        {'type': 'text', 'text': prompt}
                    ]
                }]
            },
            timeout=30,
        )
        resp.raise_for_status()
        content = resp.json().get('content', [])
        text = ''.join(c.get('text', '') for c in content if c.get('type') == 'text').strip()

        # Strip markdown fences if any
        if text.startswith('```'):
            text = text.split('```')[1]
            if text.startswith('json'):
                text = text[4:]
            text = text.strip()

        result = json.loads(text)
        return {
            'value': float(result['full_value']) if result.get('full_value') is not None else None,
            'analog_values': result.get('analog', []),
            'raw_digits': result.get('digits', ''),
            'confidence': result.get('confidence', 'unknown'),
            'notes': result.get('notes', ''),
            'error': None,
        }
    except json.JSONDecodeError as e:
        return {'value': None, 'error': f'JSON parse error: {e}', 'raw_digits': text[:100], 'analog_values': []}
    except Exception as e:
        return {'value': None, 'error': str(e), 'raw_digits': '', 'analog_values': []}


def _get_submeter_by_device_ip(ip: str) -> Submeter | None:
    """Find submeter by device IP address."""
    from database import ESP32Device
    device = ESP32Device.query.filter_by(ip_address=ip).first()
    if device:
        sub = Submeter.query.filter_by(device_id=device.id).first()
        return sub
    return None


@esp32_bp.route('/image-upload', methods=['POST'])
def image_upload():
    """
    Called by ESP32 AI-on-the-Edge firmware after every capture (every 60 min).
    Accepts multipart/form-data with an image file.
    """
    if not _verify_key(request):
        return jsonify({'error': 'Unauthorized — invalid API key'}), 401

    # Determine which submeter this image belongs to.
    # Strategy: use ?submeter_id=1 query param, or detect by client IP.
    submeter_id = request.args.get('submeter_id', type=int)
    device_ip   = request.remote_addr

    if not submeter_id:
        sub = _get_submeter_by_device_ip(device_ip)
        if sub:
            submeter_id = sub.id
        else:
            # Fall back to first submeter
            first_sub = Submeter.query.first()
            submeter_id = first_sub.id if first_sub else None

    if not submeter_id:
        return jsonify({'error': 'Cannot determine submeter — pass ?submeter_id='}), 400

    sub = Submeter.query.get(submeter_id)
    if not sub:
        return jsonify({'error': f'Submeter {submeter_id} not found'}), 404

    # Get image from multipart
    img_file = request.files.get('file') or request.files.get('image') or request.files.get('raw')
    if not img_file:
        # Maybe raw body
        raw_bytes = request.data
        if not raw_bytes:
            return jsonify({'error': 'No image data received'}), 400
        jpeg_bytes = raw_bytes
    else:
        jpeg_bytes = img_file.read()

    if not jpeg_bytes:
        return jsonify({'error': 'Empty image data'}), 400

    # Run Claude Vision OCR
    ocr_result = _ocr_meter_image(jpeg_bytes)

    if ocr_result['value'] is None:
        # Log the failure but don't crash
        db.session.add(SystemLog(
            log_type='esp32_ocr_fail',
            message=f'Submeter {submeter_id} OCR failed from {device_ip}: {ocr_result.get("error")} | notes: {ocr_result.get("notes")}',
        ))
        db.session.commit()
        return jsonify({
            'message': 'Image received but OCR failed',
            'error': ocr_result.get('error'),
            'notes': ocr_result.get('notes'),
        }), 422

    ocr_value = ocr_result['value']
    now = datetime.utcnow()

    # Validate: reading should be >= baseline and not jump irrationally
    baseline = float(sub.baseline) if sub.baseline else 0
    if ocr_value < baseline:
        db.session.add(SystemLog(
            log_type='esp32_ocr_invalid',
            message=f'Submeter {submeter_id} reading {ocr_value} < baseline {baseline} — skipped',
        ))
        db.session.commit()
        return jsonify({'message': 'Reading rejected — below baseline', 'ocr_value': ocr_value, 'baseline': baseline}), 422

    # Get previous reading for delta computation
    prev_reading = (
        MeterReading.query
        .filter_by(submeter_id=submeter_id)
        .order_by(MeterReading.reading_time.desc())
        .first()
    )
    prev_val = float(prev_reading.ocr_value) if prev_reading else baseline
    delta = max(0.0, ocr_value - prev_val)

    # Sanity check: more than 10 m³ in one hour is a burst/error
    if delta > 10.0:
        db.session.add(SystemLog(
            log_type='esp32_ocr_spike',
            message=f'Submeter {submeter_id} delta {delta:.4f} m³ in 1h — likely OCR error, skipped',
        ))
        db.session.commit()
        return jsonify({'message': 'Reading rejected — consumption spike', 'delta': delta}), 422

    # Save reading
    reading = MeterReading(
        submeter_id=submeter_id,
        ocr_value=ocr_value,
        reading_time=now,
    )
    db.session.add(reading)

    # Update today's daily consumption
    today = now.date()
    daily = DailyConsumption.query.filter_by(submeter_id=submeter_id, reading_date=today).first()
    if daily:
        daily.consumption = float(daily.consumption) + delta
    else:
        db.session.add(DailyConsumption(
            submeter_id=submeter_id,
            reading_date=today,
            consumption=delta,
        ))

    # Update this month's total
    month_start = date(today.year, today.month, 1)
    monthly = MonthlyConsumption.query.filter_by(submeter_id=submeter_id, month=month_start).first()
    if monthly:
        monthly.consumption = float(monthly.consumption) + delta
    else:
        db.session.add(MonthlyConsumption(
            submeter_id=submeter_id,
            month=month_start,
            consumption=delta,
        ))

    db.session.add(SystemLog(
        log_type='esp32_ocr_ok',
        message=(
            f'Submeter {submeter_id} from {device_ip} | '
            f'OCR={ocr_value:.4f} m³ | Δ={delta:.4f} m³ | '
            f'confidence={ocr_result.get("confidence")} | digits={ocr_result.get("raw_digits")}'
        ),
    ))
    db.session.commit()

    return jsonify({
        'message': 'Reading saved',
        'ocr_value': ocr_value,
        'delta_m3': round(delta, 4),
        'confidence': ocr_result.get('confidence'),
        'digits': ocr_result.get('raw_digits'),
        'analog': ocr_result.get('analog_values'),
        'notes': ocr_result.get('notes'),
        'reading_id': reading.id,
    }), 201


@esp32_bp.route('/status', methods=['GET'])
def esp32_status():
    """Quick health-check — also verifies API key."""
    if not _verify_key(request):
        return jsonify({'error': 'Unauthorized'}), 401
    return jsonify({'status': 'ok', 'server': 'watermonitoring.up.railway.app'}), 200


@esp32_bp.route('/latest-reading', methods=['GET'])
def latest_reading_for_esp():
    """Returns the latest OCR reading per submeter — for ESP32 to sync its prevalue."""
    if not _verify_key(request):
        return jsonify({'error': 'Unauthorized'}), 401
    submeter_id = request.args.get('submeter_id', type=int)
    query = MeterReading.query
    if submeter_id:
        query = query.filter_by(submeter_id=submeter_id)
    reading = query.order_by(MeterReading.reading_time.desc()).first()
    if not reading:
        return jsonify({'error': 'No readings'}), 404
    return jsonify(reading.to_dict()), 200

"""
routes/readings.py — Meter reading CRUD + ESP32 data ingestion endpoint.
"""

from flask import Blueprint, request, jsonify
from datetime import datetime
from database import db, MeterReading, Submeter, DailyConsumption, SystemLog
from auth_utils import login_required

readings_bp = Blueprint('readings', __name__)


# ── POST /api/readings/ingest ─────────────────────────────────────
# Called by the frontend (or a scheduled job) after polling the ESP32.
# Body: { "submeter_id": 1, "ocr_value": 521.171 }
@readings_bp.route('/ingest', methods=['POST'])
@login_required
def ingest_reading(current_user):
    data = request.get_json() or {}
    submeter_id = data.get('submeter_id')
    ocr_value   = data.get('ocr_value')

    if submeter_id is None or ocr_value is None:
        return jsonify({'error': 'submeter_id and ocr_value are required'}), 400

    sub = Submeter.query.get(submeter_id)
    if not sub:
        return jsonify({'error': f'Submeter {submeter_id} not found'}), 404

    # Save raw reading
    reading = MeterReading(
        submeter_id  = submeter_id,
        ocr_value    = ocr_value,
        reading_time = datetime.utcnow(),
    )
    db.session.add(reading)

    # Update today's daily consumption
    today = datetime.utcnow().date()
    daily = DailyConsumption.query.filter_by(
        submeter_id  = submeter_id,
        reading_date = today,
    ).first()

    # Find yesterday's last reading for delta
    prev = (
        MeterReading.query
        .filter(MeterReading.submeter_id == submeter_id)
        .filter(MeterReading.reading_time < reading.reading_time)
        .order_by(MeterReading.reading_time.desc())
        .first()
    )
    delta = max(0, float(ocr_value) - float(prev.ocr_value)) if prev else 0

    if daily:
        daily.consumption = float(daily.consumption) + delta
    else:
        new_daily = DailyConsumption(
            submeter_id  = submeter_id,
            reading_date = today,
            consumption  = delta,
        )
        db.session.add(new_daily)

    # System log
    db.session.add(SystemLog(
        log_type = 'reading',
        message  = f'Submeter {submeter_id} OCR={ocr_value} Δ={delta:.4f}',
    ))

    db.session.commit()
    return jsonify({'message': 'Reading saved', 'reading': reading.to_dict()}), 201


# ── GET /api/readings/ ────────────────────────────────────────────
@readings_bp.route('/', methods=['GET'])
@login_required
def list_readings(current_user):
    submeter_id = request.args.get('submeter_id', type=int)
    limit       = request.args.get('limit', 100, type=int)

    query = MeterReading.query
    if submeter_id:
        query = query.filter_by(submeter_id=submeter_id)
    readings = query.order_by(MeterReading.reading_time.desc()).limit(limit).all()
    return jsonify([r.to_dict() for r in readings]), 200


# ── GET /api/readings/latest ──────────────────────────────────────
@readings_bp.route('/latest', methods=['GET'])
@login_required
def latest_reading(current_user):
    submeter_id = request.args.get('submeter_id', type=int)
    query = MeterReading.query
    if submeter_id:
        query = query.filter_by(submeter_id=submeter_id)
    reading = query.order_by(MeterReading.reading_time.desc()).first()
    if not reading:
        return jsonify({'error': 'No readings found'}), 404
    return jsonify(reading.to_dict()), 200


# ── GET /api/readings/<id> ────────────────────────────────────────
@readings_bp.route('/<int:reading_id>', methods=['GET'])
@login_required
def get_reading(reading_id, current_user):
    reading = MeterReading.query.get_or_404(reading_id)
    return jsonify(reading.to_dict()), 200


# ── DELETE /api/readings/<id> (admin) ─────────────────────────────
@readings_bp.route('/<int:reading_id>', methods=['DELETE'])
@login_required
def delete_reading(reading_id, current_user):
    if not current_user.is_admin:
        return jsonify({'error': 'Admin required'}), 403
    reading = MeterReading.query.get_or_404(reading_id)
    db.session.delete(reading)
    db.session.commit()
    return jsonify({'message': 'Reading deleted'}), 200

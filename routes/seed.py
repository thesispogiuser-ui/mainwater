"""
routes/seed.py — One-time database seeding for April 2026 meter readings.

Seeds daily meter readings from April 1 (00001.650 m³) to April 30 (00030.554 m³)
for both submeters. Uses the REAL baseline values from the physical meters.

Submeter 1 (SUB-A): baseline 1746 m³  → April readings: 1746 + (0 to ~28.904)
Submeter 2 (SUB-B): baseline 1313 m³  → April readings: 1313 + (0 to ~28.904)

The "display" on the meter shows the cumulative value since it was first installed.
The CONSUMPTION for April = current reading – April 1 baseline.

April 1  → 00001.650 m³ consumed this month (meter reads e.g. 1747.650)
April 30 → 00030.554 m³ consumed this month (meter reads e.g. 1776.554)

Endpoints:
  POST /api/seed/april2026         — seeds April 2026 data (admin key required)
  POST /api/seed/clear-april2026   — clears April 2026 data (admin key required)
  GET  /api/seed/status            — shows what's seeded
"""

import os
from flask import Blueprint, request, jsonify
from datetime import date, datetime
from database import db, MeterReading, DailyConsumption, MonthlyConsumption, Submeter

seed_bp = Blueprint('seed', __name__)

# April 2026 daily meter readings (cumulative m³ consumed since April 1)
# April 1 = 1.650, April 30 = 30.554
# These represent how much water was consumed from the START of April
APRIL_DAILY_CONSUMED = [
    1.650,   # Apr 1
    2.810,   # Apr 2
    3.920,   # Apr 3
    5.110,   # Apr 4
    6.340,   # Apr 5
    7.480,   # Apr 6
    8.650,   # Apr 7
    9.830,   # Apr 8
    10.970,  # Apr 9
    12.100,  # Apr 10
    13.290,  # Apr 11
    14.450,  # Apr 12
    15.620,  # Apr 13
    16.780,  # Apr 14
    17.930,  # Apr 15
    19.050,  # Apr 16
    20.210,  # Apr 17
    21.360,  # Apr 18
    22.510,  # Apr 19
    23.640,  # Apr 20
    24.780,  # Apr 21
    25.900,  # Apr 22
    27.030,  # Apr 23
    27.980,  # Apr 24
    28.540,  # Apr 25
    28.940,  # Apr 26
    29.310,  # Apr 27
    29.760,  # Apr 28
    30.180,  # Apr 29
    30.554,  # Apr 30
]


def _get_admin_key():
    return os.environ.get('SEED_ADMIN_KEY', 'seed-admin-2026')


def _check_auth(req):
    key = req.headers.get('X-Seed-Key') or req.args.get('key', '')
    return key == _get_admin_key()


@seed_bp.route('/april2026', methods=['POST'])
def seed_april_2026():
    """
    Seeds April 1–30 meter readings and daily consumption for both submeters.
    Safe to call multiple times — skips dates that already have data.
    """
    if not _check_auth(request):
        return jsonify({'error': 'Unauthorized — pass X-Seed-Key header or ?key='}), 401

    submeters = Submeter.query.all()
    if not submeters:
        return jsonify({'error': 'No submeters found — run the app first to initialize DB'}), 404

    results = []
    month_start = date(2026, 4, 1)

    for sub in submeters:
        baseline = float(sub.baseline) if sub.baseline else 0.0
        seeded_days = 0
        skipped_days = 0
        readings_added = 0

        for day_idx, cumulative_consumed in enumerate(APRIL_DAILY_CONSUMED):
            day_num = day_idx + 1
            reading_date = date(2026, 4, day_num)

            # Daily consumption = today's cumulative - yesterday's cumulative
            prev_consumed = APRIL_DAILY_CONSUMED[day_idx - 1] if day_idx > 0 else 0.0
            day_consumption = round(cumulative_consumed - prev_consumed, 4)

            # Actual meter value = baseline + cumulative consumed so far
            meter_value = round(baseline + cumulative_consumed, 4)

            # Check if we already have a daily record for this date
            existing_daily = DailyConsumption.query.filter_by(
                submeter_id=sub.id,
                reading_date=reading_date
            ).first()

            if existing_daily:
                skipped_days += 1
                continue

            # Add daily consumption record
            db.session.add(DailyConsumption(
                submeter_id=sub.id,
                reading_date=reading_date,
                consumption=day_consumption,
            ))

            # Add a meter reading at noon PHT (04:00 UTC) for this day
            reading_dt = datetime(2026, 4, day_num, 4, 0, 0)  # noon PHT = 04:00 UTC
            existing_reading = MeterReading.query.filter_by(
                submeter_id=sub.id,
                reading_time=reading_dt,
            ).first()

            if not existing_reading:
                db.session.add(MeterReading(
                    submeter_id=sub.id,
                    ocr_value=meter_value,
                    reading_time=reading_dt,
                ))
                readings_added += 1

            seeded_days += 1

        # Upsert monthly total for April
        total_april = round(APRIL_DAILY_CONSUMED[-1], 4)  # 30.554 m³
        monthly = MonthlyConsumption.query.filter_by(
            submeter_id=sub.id,
            month=month_start
        ).first()
        if not monthly:
            db.session.add(MonthlyConsumption(
                submeter_id=sub.id,
                month=month_start,
                consumption=total_april,
            ))
        else:
            monthly.consumption = total_april

        results.append({
            'submeter_id': sub.id,
            'submeter_code': sub.submeter_code,
            'baseline_m3': baseline,
            'april_start_m3': round(baseline + APRIL_DAILY_CONSUMED[0], 4),
            'april_end_m3': round(baseline + APRIL_DAILY_CONSUMED[-1], 4),
            'total_april_consumed_m3': total_april,
            'days_seeded': seeded_days,
            'days_skipped_already_existed': skipped_days,
            'readings_added': readings_added,
        })

    db.session.commit()
    return jsonify({
        'message': 'April 2026 data seeded successfully',
        'submeters': results,
    }), 201


@seed_bp.route('/clear-april2026', methods=['POST'])
def clear_april_2026():
    """Removes all April 2026 seeded data — use with caution."""
    if not _check_auth(request):
        return jsonify({'error': 'Unauthorized'}), 401

    submeters = Submeter.query.all()
    month_start = date(2026, 4, 1)
    month_end = date(2026, 4, 30)

    deleted_daily = 0
    deleted_readings = 0
    deleted_monthly = 0

    for sub in submeters:
        d = DailyConsumption.query.filter(
            DailyConsumption.submeter_id == sub.id,
            DailyConsumption.reading_date >= month_start,
            DailyConsumption.reading_date <= month_end,
        ).delete()
        deleted_daily += d

        r = MeterReading.query.filter(
            MeterReading.submeter_id == sub.id,
            MeterReading.reading_time >= datetime(2026, 4, 1),
            MeterReading.reading_time < datetime(2026, 5, 1),
        ).delete()
        deleted_readings += r

        m = MonthlyConsumption.query.filter_by(
            submeter_id=sub.id,
            month=month_start,
        ).delete()
        deleted_monthly += m

    db.session.commit()
    return jsonify({
        'message': 'April 2026 data cleared',
        'deleted_daily_records': deleted_daily,
        'deleted_meter_readings': deleted_readings,
        'deleted_monthly_records': deleted_monthly,
    }), 200


@seed_bp.route('/status', methods=['GET'])
def seed_status():
    """Shows current seeded data status."""
    month_start = date(2026, 4, 1)
    month_end = date(2026, 4, 30)
    submeters = Submeter.query.all()
    result = []
    for sub in submeters:
        count = DailyConsumption.query.filter(
            DailyConsumption.submeter_id == sub.id,
            DailyConsumption.reading_date >= month_start,
            DailyConsumption.reading_date <= month_end,
        ).count()
        monthly = MonthlyConsumption.query.filter_by(
            submeter_id=sub.id, month=month_start
        ).first()
        result.append({
            'submeter_id': sub.id,
            'submeter_code': sub.submeter_code,
            'april_daily_records': count,
            'april_monthly_total': float(monthly.consumption) if monthly else None,
        })
    return jsonify({'april_2026': result}), 200

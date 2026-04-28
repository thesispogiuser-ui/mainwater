"""
routes/seed.py — Database seeder for April 2026 meter readings.

- Seeds April 1–30 with realistic, randomised-per-day values
- Each day's reading has a random digit (ones) and a random decimal (3 dp)
  so every day is different: e.g. 1747.382, 1748.610, 1749.053 …
- Seeds MeterReading (24 hourly rows/day), DailyConsumption, MonthlyConsumption
- Safe to call many times (skips already-seeded dates)
- Clear endpoint wipes just April so you can re-seed fresh

POST /api/seed/april2026          ?key=<SEED_ADMIN_KEY>
POST /api/seed/clear-april2026    ?key=<SEED_ADMIN_KEY>
GET  /api/seed/status
"""

import os, random
from flask import Blueprint, request, jsonify
from datetime import date, datetime, timedelta
from database import db, MeterReading, DailyConsumption, MonthlyConsumption, Submeter

seed_bp = Blueprint('seed', __name__)

# ── Deterministic-random per calendar date ───────────────────────
def _day_consumption(day_num: int) -> float:
    """
    Returns the consumption (m³) for a given day-of-April.
    Uses day_num as seed so the value is stable across re-runs
    but unique per day (different digit & decimal).
    Realistic household/building: 0.8 – 1.8 m³ / day.
    """
    rng = random.Random(day_num * 31337 + 2026)          # reproducible
    base = rng.uniform(0.80, 1.80)
    # round to a random 3-decimal value so digits differ every day
    return round(base, 3)


def _get_key():
    return os.environ.get('SEED_ADMIN_KEY', 'seed-admin-2026')


def _auth(req):
    k = req.headers.get('X-Seed-Key') or req.args.get('key', '')
    return k == _get_key()


# ── Build the full April schedule once ──────────────────────────
def _april_schedule():
    """
    Returns list of 30 dicts:
      { day, date, day_consumption, cumulative_consumed, meter_value_offset }
    meter_value_offset = cumulative m³ consumed since Apr 1 (added to baseline).
    """
    days = []
    cumulative = 0.0
    for d in range(1, 31):
        c = _day_consumption(d)
        cumulative = round(cumulative + c, 4)
        days.append({
            'day': d,
            'date': date(2026, 4, d),
            'day_consumption': c,
            'cumulative': cumulative,
        })
    return days


@seed_bp.route('/april2026', methods=['POST'])
def seed_april_2026():
    if not _auth(request):
        return jsonify({'error': 'Unauthorized — pass ?key= or X-Seed-Key header'}), 401

    submeters = Submeter.query.all()
    if not submeters:
        return jsonify({'error': 'No submeters — start the app first'}), 404

    schedule = _april_schedule()
    month_start = date(2026, 4, 1)
    results = []

    for sub in submeters:
        baseline = float(sub.baseline) if sub.baseline else 0.0
        seeded_days = skipped_days = readings_added = 0

        for entry in schedule:
            rd = entry['date']

            # Skip dates already seeded
            if DailyConsumption.query.filter_by(submeter_id=sub.id, reading_date=rd).first():
                skipped_days += 1
                continue

            day_c = entry['day_consumption']

            # ── Daily consumption record ──
            db.session.add(DailyConsumption(
                submeter_id  = sub.id,
                reading_date = rd,
                consumption  = day_c,
            ))

            # ── 24 hourly MeterReading rows for this day ──
            # Spread the day's consumption evenly across 24 hours with small random jitter
            meter_val_start = round(baseline + entry['cumulative'] - day_c, 4)
            rng = random.Random(sub.id * 9999 + entry['day'] * 17)
            per_hour = day_c / 24.0
            accumulated = 0.0
            for hr in range(24):
                # small jitter ±15% of per_hour
                jitter = rng.uniform(-0.15, 0.15) * per_hour
                hourly = max(0.0, per_hour + jitter)
                accumulated += hourly
                # clamp so we don't exceed day_c on last hour
                if hr == 23:
                    accumulated = day_c
                reading_dt = datetime(2026, 4, entry['day'], hr, 0, 0)  # UTC (PHT-8)
                meter_now = round(meter_val_start + accumulated, 4)
                if not MeterReading.query.filter_by(
                    submeter_id=sub.id, reading_time=reading_dt
                ).first():
                    db.session.add(MeterReading(
                        submeter_id  = sub.id,
                        ocr_value    = meter_now,
                        reading_time = reading_dt,
                    ))
                    readings_added += 1

            seeded_days += 1

        # ── Monthly total ──
        total_april = schedule[-1]['cumulative']
        monthly = MonthlyConsumption.query.filter_by(
            submeter_id=sub.id, month=month_start
        ).first()
        if not monthly:
            db.session.add(MonthlyConsumption(
                submeter_id=sub.id, month=month_start, consumption=total_april
            ))
        else:
            monthly.consumption = total_april

        results.append({
            'submeter_id':  sub.id,
            'submeter_code': sub.submeter_code,
            'baseline_m3':  baseline,
            'apr1_meter':   round(baseline + schedule[0]['cumulative'], 4),
            'apr30_meter':  round(baseline + total_april, 4),
            'total_april_m3': total_april,
            'days_seeded':  seeded_days,
            'days_skipped': skipped_days,
            'readings_added': readings_added,
        })

    db.session.commit()
    return jsonify({'message': 'April 2026 seeded OK', 'submeters': results}), 201


@seed_bp.route('/clear-april2026', methods=['POST'])
def clear_april_2026():
    if not _auth(request):
        return jsonify({'error': 'Unauthorized'}), 401

    submeters = Submeter.query.all()
    ms = date(2026, 4, 1)
    me = date(2026, 4, 30)
    dd = dr = dm = 0
    for sub in submeters:
        dd += DailyConsumption.query.filter(
            DailyConsumption.submeter_id == sub.id,
            DailyConsumption.reading_date >= ms,
            DailyConsumption.reading_date <= me,
        ).delete()
        dr += MeterReading.query.filter(
            MeterReading.submeter_id  == sub.id,
            MeterReading.reading_time >= datetime(2026, 4, 1),
            MeterReading.reading_time <  datetime(2026, 5, 1),
        ).delete()
        dm += MonthlyConsumption.query.filter_by(
            submeter_id=sub.id, month=ms
        ).delete()
    db.session.commit()
    return jsonify({
        'message': 'April 2026 cleared',
        'daily_deleted': dd, 'readings_deleted': dr, 'monthly_deleted': dm,
    }), 200


@seed_bp.route('/status', methods=['GET'])
def seed_status():
    ms, me = date(2026, 4, 1), date(2026, 4, 30)
    rows = []
    for sub in Submeter.query.all():
        dc = DailyConsumption.query.filter(
            DailyConsumption.submeter_id == sub.id,
            DailyConsumption.reading_date >= ms,
            DailyConsumption.reading_date <= me,
        ).count()
        mr = MeterReading.query.filter(
            MeterReading.submeter_id  == sub.id,
            MeterReading.reading_time >= datetime(2026, 4, 1),
            MeterReading.reading_time <  datetime(2026, 5, 1),
        ).count()
        m = MonthlyConsumption.query.filter_by(submeter_id=sub.id, month=ms).first()
        rows.append({
            'submeter_id': sub.id,
            'submeter_code': sub.submeter_code,
            'april_daily_records': dc,
            'april_hourly_readings': mr,
            'april_monthly_total': float(m.consumption) if m else None,
            'schedule_preview': [
                {'day': e['day'], 'day_m3': e['day_consumption'], 'cumulative': e['cumulative']}
                for e in _april_schedule()[:5]
            ],
        })
    return jsonify({'april_2026': rows}), 200

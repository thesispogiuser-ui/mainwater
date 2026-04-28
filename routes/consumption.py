"""
routes/consumption.py — Daily & monthly consumption + baseline management
"""
from flask import Blueprint, request, jsonify
from datetime import datetime, date
from calendar import month_name
from sqlalchemy import func, extract
from database import db, DailyConsumption, MonthlyConsumption, MeterReading, Submeter
from auth_utils import login_required, admin_required

consumption_bp = Blueprint('consumption', __name__)


@consumption_bp.route('/daily', methods=['GET'])
@login_required
def daily_consumption(current_user):
    submeter_id = request.args.get('submeter_id', type=int)
    start_str   = request.args.get('start')
    end_str     = request.args.get('end')
    query = DailyConsumption.query
    if submeter_id: query = query.filter_by(submeter_id=submeter_id)
    if start_str:   query = query.filter(DailyConsumption.reading_date >= start_str)
    if end_str:     query = query.filter(DailyConsumption.reading_date <= end_str)
    records = query.order_by(DailyConsumption.reading_date.asc()).all()
    return jsonify([r.to_dict() for r in records]), 200


@consumption_bp.route('/monthly', methods=['GET'])
@login_required
def monthly_consumption(current_user):
    submeter_id = request.args.get('submeter_id', type=int)
    query = MonthlyConsumption.query
    if submeter_id: query = query.filter_by(submeter_id=submeter_id)
    records = query.order_by(MonthlyConsumption.month.desc()).all()
    return jsonify([r.to_dict() for r in records]), 200


@consumption_bp.route('/summary', methods=['GET'])
@login_required
def summary(current_user):
    today = datetime.utcnow().date()
    this_year = today.year
    this_month = today.month
    submeters = Submeter.query.all()
    result = []
    for sub in submeters:
        today_rec = DailyConsumption.query.filter_by(submeter_id=sub.id, reading_date=today).first()
        today_val = float(today_rec.consumption) if today_rec else 0
        month_total = db.session.query(func.sum(DailyConsumption.consumption)).filter(
            DailyConsumption.submeter_id == sub.id,
            func.extract('year', DailyConsumption.reading_date) == this_year,
            func.extract('month', DailyConsumption.reading_date) == this_month,
        ).scalar() or 0
        result.append({
            'submeter_id': sub.id, 'submeter_code': sub.submeter_code,
            'type': sub.type, 'today_m3': round(today_val, 4),
            'month_m3': round(float(month_total), 4),
            'baseline': float(sub.baseline) if sub.baseline else 0,
        })
    return jsonify(result), 200


# ── Monthly History (months list) ─────────────────────────────────────────────
@consumption_bp.route('/history/months', methods=['GET'])
@login_required
def history_months(current_user):
    """
    Returns all months that have consumption data, grouped by submeter.
    Response shape:
    [
      {
        submeter_id: 1,
        submeter_code: "SUB-A",
        months: [
          { year: 2026, month: 4, month_name: "April 2026", total_m3: 30.554, days_with_data: 30 }
        ]
      }
    ]
    """
    submeter_id = request.args.get('submeter_id', type=int)
    submeters = Submeter.query.all()
    result = []

    for sub in submeters:
        if submeter_id and sub.id != submeter_id:
            continue

        # Get all months with daily data for this submeter
        rows = (
            db.session.query(
                extract('year', DailyConsumption.reading_date).label('yr'),
                extract('month', DailyConsumption.reading_date).label('mo'),
                func.sum(DailyConsumption.consumption).label('total'),
                func.count(DailyConsumption.id).label('days'),
            )
            .filter(DailyConsumption.submeter_id == sub.id)
            .group_by('yr', 'mo')
            .order_by('yr', 'mo')
            .all()
        )

        months = []
        for row in rows:
            yr = int(row.yr)
            mo = int(row.mo)
            months.append({
                'year': yr,
                'month': mo,
                'month_name': f'{month_name[mo]} {yr}',
                'total_m3': round(float(row.total or 0), 4),
                'days_with_data': int(row.days),
            })

        result.append({
            'submeter_id': sub.id,
            'submeter_code': sub.submeter_code,
            'type': sub.type,
            'baseline': float(sub.baseline) if sub.baseline else 0,
            'months': months,
        })

    return jsonify(result), 200


# ── Monthly History (day-level drill-down) ────────────────────────────────────
@consumption_bp.route('/history/days', methods=['GET'])
@login_required
def history_days(current_user):
    """
    Returns day-by-day consumption for a specific submeter + month.
    Query params: submeter_id, year, month
    Response shape:
    {
      submeter_id: 1,
      year: 2026,
      month: 4,
      month_name: "April 2026",
      total_m3: 30.554,
      baseline: 1746,
      days: [
        {
          day: 1,
          date: "2026-04-01",
          consumption_m3: 1.650,
          consumption_liters: 1650,
          meter_reading: 1747.650,      ← from MeterReading table (noon snapshot)
          meter_reading_time: "..."
        },
        ...
      ]
    }
    """
    submeter_id = request.args.get('submeter_id', type=int)
    year        = request.args.get('year', type=int)
    month_num   = request.args.get('month', type=int)

    if not all([submeter_id, year, month_num]):
        return jsonify({'error': 'submeter_id, year, and month are required'}), 400

    sub = Submeter.query.get(submeter_id)
    if not sub:
        return jsonify({'error': 'Submeter not found'}), 404

    # Get all daily records for this month
    import calendar
    _, days_in_month = calendar.monthrange(year, month_num)
    month_start = date(year, month_num, 1)
    month_end   = date(year, month_num, days_in_month)

    daily_records = (
        DailyConsumption.query
        .filter(
            DailyConsumption.submeter_id == submeter_id,
            DailyConsumption.reading_date >= month_start,
            DailyConsumption.reading_date <= month_end,
        )
        .order_by(DailyConsumption.reading_date.asc())
        .all()
    )

    daily_map = {r.reading_date: r for r in daily_records}

    # Get meter readings for this month (one per day if available)
    meter_readings = (
        MeterReading.query
        .filter(
            MeterReading.submeter_id == submeter_id,
            MeterReading.reading_time >= datetime(year, month_num, 1),
            MeterReading.reading_time < datetime(year, month_num, days_in_month) if month_num < 12
                else datetime(year + 1, 1, 1),
        )
        .order_by(MeterReading.reading_time.asc())
        .all()
    )

    # Map: date → latest reading that day
    reading_map = {}
    for r in meter_readings:
        d = r.reading_time.date()
        reading_map[d] = r  # last one wins (they're ascending so last = newest that day)

    baseline = float(sub.baseline) if sub.baseline else 0.0
    total_m3 = 0.0
    days = []

    for day_num in range(1, days_in_month + 1):
        d = date(year, month_num, day_num)
        daily = daily_map.get(d)
        reading = reading_map.get(d)

        consumption = float(daily.consumption) if daily else 0.0
        total_m3 += consumption

        meter_val = float(reading.ocr_value) if reading else None
        reading_time = reading.reading_time.isoformat() + 'Z' if reading else None

        days.append({
            'day': day_num,
            'date': d.isoformat(),
            'consumption_m3': round(consumption, 4),
            'consumption_liters': round(consumption * 1000, 1),
            'meter_reading': round(meter_val, 3) if meter_val is not None else None,
            'meter_reading_time': reading_time,
        })

    return jsonify({
        'submeter_id': sub.id,
        'submeter_code': sub.submeter_code,
        'year': year,
        'month': month_num,
        'month_name': f'{month_name[month_num]} {year}',
        'baseline': baseline,
        'total_m3': round(total_m3, 4),
        'days_in_month': days_in_month,
        'days': days,
    }), 200


# ── Baseline CRUD ──────────────────────────────────────────────────────────────
@consumption_bp.route('/baseline', methods=['GET'])
@login_required
def get_baselines(current_user):
    subs = Submeter.query.all()
    return jsonify([{'submeter_id':s.id,'type':s.type,'baseline':float(s.baseline) if s.baseline else 0} for s in subs]), 200


@consumption_bp.route('/baseline', methods=['PUT'])
@login_required
def set_baseline(current_user):
    data = request.get_json() or {}
    submeter_id = data.get('submeter_id')
    baseline = data.get('baseline')
    if submeter_id is None or baseline is None:
        return jsonify({'error': 'submeter_id and baseline required'}), 400
    sub = Submeter.query.get(submeter_id)
    if not sub:
        return jsonify({'error': 'Submeter not found'}), 404
    sub.baseline = baseline
    db.session.commit()
    return jsonify({'message': 'Baseline updated', 'submeter_id': sub.id, 'baseline': float(sub.baseline)}), 200

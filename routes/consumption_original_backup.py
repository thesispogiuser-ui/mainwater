"""
routes/consumption.py — Daily & monthly consumption + baseline management
"""
from flask import Blueprint, request, jsonify
from datetime import datetime, date
from sqlalchemy import func
from database import db, DailyConsumption, MonthlyConsumption, Submeter
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
    records = query.order_by(DailyConsumption.reading_date.desc()).all()
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


# ── Baseline CRUD ──
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

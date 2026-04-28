"""
routes/leaks.py — Leak event logging and retrieval.
"""

from flask import Blueprint, request, jsonify
from database import db, LeakEvent, Recommendation
from auth_utils import login_required, admin_required

leaks_bp = Blueprint('leaks', __name__)


# ── POST /api/leaks/ ──────────────────────────────────────────────
@leaks_bp.route('/', methods=['POST'])
@login_required
def log_leak(current_user):
    data = request.get_json() or {}
    if not data.get('submeter_id'):
        return jsonify({'error': 'submeter_id required'}), 400

    event = LeakEvent(
        submeter_id       = data['submeter_id'],
        severity          = data.get('severity', 'low'),
        ai_recommendation = data.get('ai_recommendation', ''),
    )
    db.session.add(event)

    # Also save as a recommendation if text provided
    if data.get('ai_recommendation'):
        db.session.add(Recommendation(
            submeter_id    = data['submeter_id'],
            recommendation = data['ai_recommendation'],
        ))

    db.session.commit()
    return jsonify(event.to_dict()), 201


# ── GET /api/leaks/ ───────────────────────────────────────────────
@leaks_bp.route('/', methods=['GET'])
@login_required
def list_leaks(current_user):
    submeter_id = request.args.get('submeter_id', type=int)
    severity    = request.args.get('severity')
    limit       = request.args.get('limit', 50, type=int)

    query = LeakEvent.query
    if submeter_id:
        query = query.filter_by(submeter_id=submeter_id)
    if severity:
        query = query.filter_by(severity=severity)

    events = query.order_by(LeakEvent.detected_at.desc()).limit(limit).all()
    return jsonify([e.to_dict() for e in events]), 200


# ── GET /api/leaks/recommendations ───────────────────────────────
@leaks_bp.route('/recommendations', methods=['GET'])
@login_required
def list_recommendations(current_user):
    submeter_id = request.args.get('submeter_id', type=int)
    query = Recommendation.query
    if submeter_id:
        query = query.filter_by(submeter_id=submeter_id)
    recs = query.order_by(Recommendation.created_at.desc()).limit(20).all()
    return jsonify([r.to_dict() for r in recs]), 200

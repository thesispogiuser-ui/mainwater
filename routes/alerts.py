"""
routes/alerts.py — System alert management.
"""

from flask import Blueprint, request, jsonify
from database import db, Alert
from auth_utils import login_required

alerts_bp = Blueprint('alerts', __name__)


# ── POST /api/alerts/ ────────────────────────────────────────────
@alerts_bp.route('/', methods=['POST'])
@login_required
def create_alert(current_user):
    data = request.get_json() or {}
    alert = Alert(
        user_id     = current_user.id,
        submeter_id = data.get('submeter_id'),
        alert_type  = data.get('alert_type', 'general'),
        message     = data.get('message', ''),
        resolved    = False,
    )
    db.session.add(alert)
    db.session.commit()
    return jsonify(alert.to_dict()), 201


# ── GET /api/alerts/ ─────────────────────────────────────────────
@alerts_bp.route('/', methods=['GET'])
@login_required
def list_alerts(current_user):
    resolved    = request.args.get('resolved', 'false').lower() == 'true'
    submeter_id = request.args.get('submeter_id', type=int)

    query = Alert.query.filter_by(resolved=resolved)
    if submeter_id:
        query = query.filter_by(submeter_id=submeter_id)
    # Regular users see only their own alerts; admins see all
    if not current_user.is_admin:
        query = query.filter_by(user_id=current_user.id)

    alerts = query.order_by(Alert.created_at.desc()).all()
    return jsonify([a.to_dict() for a in alerts]), 200


# ── PATCH /api/alerts/<id>/resolve ───────────────────────────────
@alerts_bp.route('/<int:alert_id>/resolve', methods=['PATCH'])
@login_required
def resolve_alert(alert_id, current_user):
    alert = Alert.query.get_or_404(alert_id)
    if alert.user_id != current_user.id and not current_user.is_admin:
        return jsonify({'error': 'Forbidden'}), 403
    alert.resolved = True
    db.session.commit()
    return jsonify(alert.to_dict()), 200

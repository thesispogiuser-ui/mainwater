"""
routes/admin.py — Admin-only endpoints: user management, system logs.
"""

from flask import Blueprint, request, jsonify, current_app
from werkzeug.security import generate_password_hash
from database import db, User, SystemLog
from auth_utils import admin_required

admin_bp = Blueprint('admin', __name__)


# ── GET /api/admin/users ─────────────────────────────────────────
@admin_bp.route('/users', methods=['GET'])
@admin_required
def list_users(current_user):
    users = User.query.order_by(User.created_at.desc()).all()
    return jsonify([u.to_dict() for u in users]), 200


# ── GET /api/admin/users/pending ─────────────────────────────────
@admin_bp.route('/users/pending', methods=['GET'])
@admin_required
def pending_users(current_user):
    users = User.query.filter_by(is_approved=False, is_admin=False).all()
    return jsonify([u.to_dict() for u in users]), 200


# ── GET /api/admin/users/count (debug) ──────────────────────────
@admin_bp.route('/users/count', methods=['GET'])
@admin_required
def user_count(current_user):
    total = User.query.count()
    pending = User.query.filter_by(is_approved=False, is_admin=False).count()
    approved = User.query.filter_by(is_approved=True, is_admin=False).count()
    admins = User.query.filter_by(is_admin=True).count()
    return jsonify({
        'total': total,
        'pending': pending,
        'approved': approved,
        'admins': admins,
        'db_uri': str(current_app.config.get('SQLALCHEMY_DATABASE_URI', 'unknown')),
    }), 200


# ── PATCH /api/admin/users/<id>/approve ──────────────────────────
@admin_bp.route('/users/<int:user_id>/approve', methods=['PATCH'])
@admin_required
def approve_user(user_id, current_user):
    user = User.query.get_or_404(user_id)
    user.is_approved = True
    db.session.add(SystemLog(
        log_type = 'admin',
        message  = f'User {user.username} approved by {current_user.username}',
    ))
    db.session.commit()
    return jsonify({'message': f'User {user.username} approved', 'user': user.to_dict()}), 200


# ── PATCH /api/admin/users/<id>/reject ───────────────────────────
@admin_bp.route('/users/<int:user_id>/reject', methods=['PATCH'])
@admin_required
def reject_user(user_id, current_user):
    user = User.query.get_or_404(user_id)
    user.is_approved = False
    db.session.commit()
    return jsonify({'message': f'User {user.username} rejected'}), 200


# ── PATCH /api/admin/users/<id>/toggle-admin ─────────────────────
@admin_bp.route('/users/<int:user_id>/toggle-admin', methods=['PATCH'])
@admin_required
def toggle_admin(user_id, current_user):
    if user_id == current_user.id:
        return jsonify({'error': 'Cannot change your own admin status'}), 400
    user = User.query.get_or_404(user_id)
    user.is_admin = not user.is_admin
    db.session.commit()
    status = 'granted' if user.is_admin else 'revoked'
    return jsonify({'message': f'Admin {status} for {user.username}', 'user': user.to_dict()}), 200


# ── DELETE /api/admin/users/<id> ─────────────────────────────────
@admin_bp.route('/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id, current_user):
    if user_id == current_user.id:
        return jsonify({'error': 'Cannot delete yourself'}), 400
    user = User.query.get_or_404(user_id)
    db.session.delete(user)
    db.session.commit()
    return jsonify({'message': f'User {user.username} deleted'}), 200


# ── GET /api/admin/logs ───────────────────────────────────────────
@admin_bp.route('/logs', methods=['GET'])
@admin_required
def system_logs(current_user):
    log_type = request.args.get('log_type')
    limit    = request.args.get('limit', 100, type=int)

    query = SystemLog.query
    if log_type:
        query = query.filter_by(log_type=log_type)
    logs = query.order_by(SystemLog.created_at.desc()).limit(limit).all()
    return jsonify([l.to_dict() for l in logs]), 200

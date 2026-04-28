"""
routes/auth.py — Registration, login, logout, and current-user endpoint.
"""

from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from database import db, User
from auth_utils import generate_token, login_required

auth_bp = Blueprint('auth', __name__)


# ── POST /api/auth/register ───────────────────────────────────────
@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json() or {}

    required = ('first_name', 'last_name', 'email', 'username', 'password')
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({'error': f'Missing fields: {", ".join(missing)}'}), 400

    if User.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'Email already registered'}), 409
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'error': 'Username already taken'}), 409

    user = User(
        first_name  = data['first_name'].strip(),
        last_name   = data['last_name'].strip(),
        email       = data['email'].strip().lower(),
        username    = data['username'].strip().lower(),
        password    = generate_password_hash(data['password']),
        is_admin    = False,
        is_approved = False,   # admin must approve
    )
    db.session.add(user)
    db.session.commit()

    return jsonify({
        'message': 'Registration successful. Awaiting admin approval.',
        'user': user.to_dict(),
    }), 201


# ── POST /api/auth/login ──────────────────────────────────────────
@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    username = data.get('username', '').strip().lower()
    password = data.get('password', '')

    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400

    user = User.query.filter_by(username=username).first()
    if not user or not check_password_hash(user.password, password):
        return jsonify({'error': 'Invalid credentials'}), 401
    if not user.is_approved:
        return jsonify({'error': 'Account pending admin approval'}), 403

    token = generate_token(user.id)
    return jsonify({
        'message': 'Login successful',
        'token':   token,
        'user':    user.to_dict(),
    }), 200


# ── GET /api/auth/me ──────────────────────────────────────────────
@auth_bp.route('/me', methods=['GET'])
@login_required
def me(current_user):
    return jsonify(current_user.to_dict()), 200


# ── POST /api/auth/change-password ───────────────────────────────
@auth_bp.route('/change-password', methods=['POST'])
@login_required
def change_password(current_user):
    data = request.get_json() or {}
    old_pw = data.get('old_password', '')
    new_pw = data.get('new_password', '')

    if not old_pw or not new_pw:
        return jsonify({'error': 'old_password and new_password required'}), 400
    if not check_password_hash(current_user.password, old_pw):
        return jsonify({'error': 'Current password is incorrect'}), 401
    if len(new_pw) < 6:
        return jsonify({'error': 'New password must be at least 6 characters'}), 400

    current_user.password = generate_password_hash(new_pw)
    db.session.commit()
    return jsonify({'message': 'Password updated successfully'}), 200

"""auth_utils.py — JWT helpers. Hardcoded secret for local dev."""
import jwt
from datetime import datetime, timedelta
from functools import wraps
from flask import request, jsonify
from database import User

SECRET_KEY = 'hydratrack-local-dev-secret-key-do-not-change'
TOKEN_EXP_HOURS = 24


def generate_token(user_id):
    payload = {
        'sub': str(user_id),
        'iat': datetime.utcnow(),
        'exp': datetime.utcnow() + timedelta(hours=TOKEN_EXP_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm='HS256')


def decode_token(token):
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
    except Exception as e:
        print(f'[auth] decode failed: {e}')
        return None


def _get_token():
    h = request.headers.get('Authorization', '')
    if h.startswith('Bearer '):
        return h[7:]
    return request.cookies.get('token')


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        token = _get_token()
        if not token:
            return jsonify({'error': 'Authentication required'}), 401
        payload = decode_token(token)
        if not payload:
            return jsonify({'error': 'Invalid or expired token'}), 401
        user = User.query.get(int(payload['sub']))
        if not user or not user.is_approved:
            return jsonify({'error': 'Account not approved'}), 401
        kwargs['current_user'] = user
        return f(*args, **kwargs)
    return wrapper


def admin_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        token = _get_token()
        if not token:
            return jsonify({'error': 'Authentication required'}), 401
        payload = decode_token(token)
        if not payload:
            return jsonify({'error': 'Invalid or expired token'}), 401
        user = User.query.get(int(payload['sub']))
        if not user or not user.is_admin:
            return jsonify({'error': 'Admin privileges required'}), 403
        kwargs['current_user'] = user
        return f(*args, **kwargs)
    return wrapper

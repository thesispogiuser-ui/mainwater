"""
routes/devices.py — ESP32 device and submeter management.
"""

from flask import Blueprint, request, jsonify
from database import db, ESP32Device, Submeter
from auth_utils import login_required, admin_required

devices_bp = Blueprint('devices', __name__)


# ── GET /api/devices/ ─────────────────────────────────────────────
@devices_bp.route('/', methods=['GET'])
@login_required
def list_devices(current_user):
    devices = ESP32Device.query.all()
    return jsonify([d.to_dict() for d in devices]), 200


# ── POST /api/devices/ ────────────────────────────────────────────
@devices_bp.route('/', methods=['POST'])
@admin_required
def create_device(current_user):
    data = request.get_json() or {}
    if not data.get('device_code'):
        return jsonify({'error': 'device_code is required'}), 400

    if ESP32Device.query.filter_by(device_code=data['device_code']).first():
        return jsonify({'error': 'device_code already exists'}), 409

    device = ESP32Device(
        device_code = data['device_code'],
        location    = data.get('location', ''),
        ip_address  = data.get('ip_address', ''),
        status      = data.get('status', 'active'),
    )
    db.session.add(device)
    db.session.commit()
    return jsonify(device.to_dict()), 201


# ── GET /api/devices/<id> ─────────────────────────────────────────
@devices_bp.route('/<int:device_id>', methods=['GET'])
@login_required
def get_device(device_id, current_user):
    device = ESP32Device.query.get_or_404(device_id)
    data = device.to_dict()
    data['submeters'] = [s.to_dict() for s in device.submeters]
    return jsonify(data), 200


# ── PUT /api/devices/<id> ─────────────────────────────────────────
@devices_bp.route('/<int:device_id>', methods=['PUT'])
@admin_required
def update_device(device_id, current_user):
    device = ESP32Device.query.get_or_404(device_id)
    data   = request.get_json() or {}

    device.location   = data.get('location',   device.location)
    device.ip_address = data.get('ip_address', device.ip_address)
    device.status     = data.get('status',     device.status)
    db.session.commit()
    return jsonify(device.to_dict()), 200


# ── DELETE /api/devices/<id> ──────────────────────────────────────
@devices_bp.route('/<int:device_id>', methods=['DELETE'])
@admin_required
def delete_device(device_id, current_user):
    device = ESP32Device.query.get_or_404(device_id)
    db.session.delete(device)
    db.session.commit()
    return jsonify({'message': 'Device deleted'}), 200


# ─────────────────────────────────────────────────────────────────
#  Submeters
# ─────────────────────────────────────────────────────────────────

# ── GET /api/devices/submeters/ ───────────────────────────────────
@devices_bp.route('/submeters/', methods=['GET'])
@login_required
def list_submeters(current_user):
    submeters = Submeter.query.all()
    return jsonify([s.to_dict() for s in submeters]), 200


# ── POST /api/devices/submeters/ ──────────────────────────────────
@devices_bp.route('/submeters/', methods=['POST'])
@admin_required
def create_submeter(current_user):
    data = request.get_json() or {}
    if not data.get('submeter_code'):
        return jsonify({'error': 'submeter_code is required'}), 400
    if Submeter.query.filter_by(submeter_code=data['submeter_code']).first():
        return jsonify({'error': 'submeter_code already exists'}), 409

    sub = Submeter(
        submeter_code = data['submeter_code'],
        device_id     = data.get('device_id'),
        type          = data.get('type', 'A'),
    )
    db.session.add(sub)
    db.session.commit()
    return jsonify(sub.to_dict()), 201


# ── GET /api/devices/submeters/<id> ──────────────────────────────
@devices_bp.route('/submeters/<int:sub_id>', methods=['GET'])
@login_required
def get_submeter(sub_id, current_user):
    sub = Submeter.query.get_or_404(sub_id)
    return jsonify(sub.to_dict()), 200


# ── PUT /api/devices/submeters/<id> ──────────────────────────────
@devices_bp.route('/submeters/<int:sub_id>', methods=['PUT'])
@admin_required
def update_submeter(sub_id, current_user):
    sub  = Submeter.query.get_or_404(sub_id)
    data = request.get_json() or {}

    sub.device_id = data.get('device_id', sub.device_id)
    sub.type      = data.get('type',      sub.type)
    db.session.commit()
    return jsonify(sub.to_dict()), 200

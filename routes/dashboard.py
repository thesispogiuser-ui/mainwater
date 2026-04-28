"""
routes/dashboard.py — Serves the HydraTrack Pro dashboard via Flask templates
and exposes a /health endpoint.

File layout (Flask convention):
  templates/index.html       ← The dashboard HTML shell
  static/css/hydratrack.css  ← All styles
  static/js/hydratrack.js    ← All JavaScript
"""

from flask import Blueprint, render_template, jsonify
import time

dashboard_bp = Blueprint('dashboard', __name__)


# ── GET / ─────────────────────────────────────────────────────────
@dashboard_bp.route('/', methods=['GET'])
@dashboard_bp.route('/index.html', methods=['GET'])
def index():
    return render_template('index.html')


# ── GET /health ───────────────────────────────────────────────────
@dashboard_bp.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'uptime': time.process_time()}), 200

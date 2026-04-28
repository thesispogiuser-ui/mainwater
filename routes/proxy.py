"""
routes/proxy.py — Multi-ESP aware proxy.

How it picks where to send requests:
  Frontend calls /api/proxy/...?ip=<LAN-IP>

  LOCAL DEV:  hits http://<ip>/... directly (same WiFi).
  PRODUCTION: uses ESP_PUBLIC_URL + ESP_IP_MAP env vars.

  ESP_PUBLIC_URL = https://your-tunnel.trycloudflare.com
  ESP_IP_MAP     = 192.168.1.222=esp1,192.168.1.223=esp2

  Requests for ?ip=192.168.1.222 go to .../esp1/..., etc.
"""

import os
import requests
from flask import Blueprint, request, jsonify, Response, stream_with_context

proxy_bp = Blueprint('proxy', __name__)

ESP32_TIMEOUT_STREAM  = 30
ESP32_TIMEOUT_DEFAULT = 8
ESP32_TIMEOUT_SHORT   = 4


def _parse_ip_map() -> dict:
    """Parse 'ip1=prefix1,ip2=prefix2' env var into a dict."""
    raw = os.environ.get('ESP_IP_MAP', '')
    out = {}
    for pair in raw.split(','):
        pair = pair.strip()
        if '=' in pair:
            k, v = pair.split('=', 1)
            out[k.strip()] = v.strip().strip('/')
    return out


def _esp_base(ip: str | None, port: int = 80) -> str | None:
    public = os.environ.get('ESP_PUBLIC_URL')
    if public:
        public = public.rstrip('/')
        ip_map = _parse_ip_map()
        if ip and ip in ip_map:
            return f"{public}/{ip_map[ip]}"
        return public
    if ip:
        return f'http://{ip}:{port}'
    return None


def _missing_ip():
    return jsonify({'error': 'Missing ?ip= query parameter (or set ESP_PUBLIC_URL)'}), 400


def _get_ip_port(default_port: int = 80):
    ip   = request.args.get('ip')
    port = int(request.args.get('port', default_port))
    return ip, port


@proxy_bp.route('/stream')
def proxy_stream():
    ip, port = _get_ip_port(default_port=81)
    base = _esp_base(ip, port)
    if not base:
        return _missing_ip()
    try:
        upstream = requests.get(f'{base}/stream', stream=True, timeout=ESP32_TIMEOUT_STREAM)
        content_type = upstream.headers.get('Content-Type', 'multipart/x-mixed-replace')
        def generate():
            try:
                for chunk in upstream.iter_content(chunk_size=4096):
                    yield chunk
            finally:
                upstream.close()
        return Response(stream_with_context(generate()), content_type=content_type, headers={'Cache-Control': 'no-cache'})
    except requests.exceptions.Timeout:
        return jsonify({'error': 'ESP32 stream timeout'}), 504
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 502


@proxy_bp.route('/capture')
def proxy_capture():
    ip, port = _get_ip_port(default_port=80)
    base = _esp_base(ip, port)
    if not base:
        return _missing_ip()
    try:
        resp = requests.get(f'{base}/capture', timeout=ESP32_TIMEOUT_DEFAULT)
        return Response(resp.content, content_type='image/jpeg', headers={'Cache-Control': 'no-cache'})
    except requests.exceptions.Timeout:
        return jsonify({'error': 'ESP32 capture timeout'}), 504
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 502


@proxy_bp.route('/status')
def proxy_status():
    ip, port = _get_ip_port(default_port=80)
    base = _esp_base(ip, port)
    if not base:
        return _missing_ip()
    try:
        resp = requests.get(f'{base}/status', timeout=ESP32_TIMEOUT_SHORT)
        try:
            return jsonify(resp.json()), 200
        except ValueError:
            return jsonify({'status': 'online', 'raw': resp.text}), 200
    except requests.exceptions.Timeout:
        return jsonify({'error': 'ESP32 offline or not reachable'}), 504
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 502


@proxy_bp.route('/flash')
def proxy_flash():
    ip  = request.args.get('ip')
    val = request.args.get('val', '0')
    base = _esp_base(ip)
    if not base:
        return _missing_ip()
    try:
        resp = requests.get(f'{base}/flash?val={val}', timeout=ESP32_TIMEOUT_SHORT)
        return jsonify({'flash': val, 'response': resp.text}), 200
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 502


@proxy_bp.route('/edge/json')
def edge_json():
    ip = request.args.get('ip')
    base = _esp_base(ip)
    if not base:
        return _missing_ip()
    try:
        resp = requests.get(f'{base}/json', timeout=6)
        return jsonify(resp.json()), 200
    except requests.exceptions.Timeout:
        return jsonify({'error': 'AI-on-the-edge device timeout'}), 504
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 502


def _proxy_image(ip: str, path: str):
    base = _esp_base(ip)
    if not base:
        return jsonify({'error': 'No ESP base URL'}), 400
    try:
        resp = requests.get(f'{base}/img_tmp/{path}.jpg', timeout=10)
        return Response(resp.content, content_type='image/jpeg', headers={'Cache-Control': 'no-cache'})
    except requests.exceptions.Timeout:
        return jsonify({'error': 'Image timeout'}), 504
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 502


@proxy_bp.route('/edge/raw')
def edge_raw():
    ip = request.args.get('ip')
    if not ip and not os.environ.get('ESP_PUBLIC_URL'):
        return _missing_ip()
    return _proxy_image(ip, 'raw')


@proxy_bp.route('/edge/alg')
def edge_alg():
    ip = request.args.get('ip')
    if not ip and not os.environ.get('ESP_PUBLIC_URL'):
        return _missing_ip()
    return _proxy_image(ip, 'alg')


@proxy_bp.route('/edge/alg_roi')
def edge_alg_roi():
    ip = request.args.get('ip')
    if not ip and not os.environ.get('ESP_PUBLIC_URL'):
        return _missing_ip()
    return _proxy_image(ip, 'alg_roi')


def _proxy_control(ip: str, endpoint: str):
    base = _esp_base(ip)
    if not base:
        return jsonify({'error': 'No ESP base URL'}), 400
    try:
        resp = requests.get(f'{base}/{endpoint}', timeout=ESP32_TIMEOUT_SHORT)
        try:
            return jsonify(resp.json()), 200
        except ValueError:
            return jsonify({'ok': True, 'raw': resp.text}), 200
    except requests.exceptions.Timeout:
        return jsonify({'error': 'timeout'}), 504
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 502


@proxy_bp.route('/edge/flow_start')
def edge_flow_start():
    return _proxy_control(request.args.get('ip'), 'flow_start')


@proxy_bp.route('/edge/statusflow')
def edge_statusflow():
    return _proxy_control(request.args.get('ip'), 'statusflow')


@proxy_bp.route('/edge/reboot')
def edge_reboot():
    return _proxy_control(request.args.get('ip'), 'reboot')


@proxy_bp.route('/edge/lighton')
def edge_lighton():
    return _proxy_control(request.args.get('ip'), 'lighton')


@proxy_bp.route('/edge/lightoff')
def edge_lightoff():
    return _proxy_control(request.args.get('ip'), 'lightoff')


@proxy_bp.route('/health')
def health():
    import time
    return jsonify({
        'status': 'ok',
        'uptime': time.process_time(),
        'esp_public_url_set': bool(os.environ.get('ESP_PUBLIC_URL')),
        'esp_ip_map': _parse_ip_map(),
    }), 200


@proxy_bp.route('/edge/setprevalue')
def edge_setprevalue():
    ip = request.args.get('ip')
    value = request.args.get('value', '0')
    base = _esp_base(ip)
    if not base:
        return _missing_ip()
    try:
        resp = requests.get(f'{base}/setPreValue?value={value}', timeout=ESP32_TIMEOUT_SHORT)
        try:
            return jsonify(resp.json()), 200
        except ValueError:
            return jsonify({'ok': True, 'raw': resp.text}), 200
    except requests.exceptions.Timeout:
        return jsonify({'error': 'timeout'}), 504
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 502

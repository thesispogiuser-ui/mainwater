"""
routes/ai.py — Server-side Claude AI proxy for leak recommendations.

The frontend calls POST /api/ai/recommend with a { prompt } body.
This route forwards it to the Anthropic API server-side so the API
key never needs to be embedded in the browser JS.

Set your Anthropic API key in .env:
    ANTHROPIC_API_KEY=sk-ant-...
"""

import os
import requests
from flask import Blueprint, request, jsonify
from auth_utils import login_required

ai_bp = Blueprint('ai', __name__)

ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
ANTHROPIC_MODEL   = 'claude-sonnet-4-20250514'


@ai_bp.route('/recommend', methods=['POST'])
@login_required
def recommend(current_user):
    data   = request.get_json() or {}
    prompt = data.get('prompt', '').strip()

    if not prompt:
        return jsonify({'error': 'prompt is required'}), 400

    api_key = os.environ.get('ANTHROPIC_API_KEY', '')
    if not api_key:
        return jsonify({
            'error': 'ANTHROPIC_API_KEY not configured on server.',
            'result': '<p>⚠ AI recommendations unavailable — API key not set. '
                      'Add ANTHROPIC_API_KEY to your .env file.</p>'
        }), 503

    try:
        resp = requests.post(
            ANTHROPIC_API_URL,
            headers={
                'Content-Type':      'application/json',
                'x-api-key':         api_key,
                'anthropic-version': '2023-06-01',
            },
            json={
                'model':      ANTHROPIC_MODEL,
                'max_tokens': 600,
                'messages':   [{'role': 'user', 'content': prompt}],
            },
            timeout=30,
        )
        resp.raise_for_status()
        content = resp.json().get('content', [])
        result  = ''.join(block.get('text', '') for block in content if block.get('type') == 'text')
        return jsonify({'result': result}), 200

    except requests.exceptions.Timeout:
        return jsonify({'error': 'AI service timed out', 'result': '<p>⚠ AI service timed out. Try again.</p>'}), 504
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e), 'result': f'<p>⚠ AI unavailable: {e}</p>'}), 502

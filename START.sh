#!/bin/bash
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║     VARANO DE AGUA — Water Monitor       ║"
echo "║     Starting server...                   ║"
echo "╚══════════════════════════════════════════╝"
echo ""

if [ ! -d ".venv" ]; then
    echo "[SETUP] Creating virtual environment..."
    python3 -m venv .venv
    echo "[SETUP] Installing dependencies..."
    .venv/bin/pip install -r requirements.txt -q
    echo "[SETUP] Done!"
fi

source .venv/bin/activate
echo "[OK] Starting Flask server on http://localhost:5000"
echo "[OK] Default login: admin / admin123"
echo ""
python app.py

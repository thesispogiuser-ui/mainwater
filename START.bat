@echo off
title Varano De Agua — Water Monitoring System
color 0B

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║     VARANO DE AGUA — Water Monitor       ║
echo  ║     Starting server...                   ║
echo  ╚══════════════════════════════════════════╝
echo.

:: Check if .venv exists
if not exist ".venv\Scripts\activate.bat" (
    echo  [SETUP] Creating virtual environment...
    python -m venv .venv
    echo  [SETUP] Installing dependencies...
    .venv\Scripts\pip install -r requirements.txt --quiet
    echo  [SETUP] Done!
    echo.
)

:: Activate and run
call .venv\Scripts\activate.bat
echo  [OK] Starting Flask server on http://localhost:5000
echo  [OK] Open your browser to: http://localhost:5000
echo  [OK] Default login: admin / admin123
echo.
echo  Press Ctrl+C to stop the server.
echo.
python app.py
pause

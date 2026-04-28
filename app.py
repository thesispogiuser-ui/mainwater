"""HydraTrack Pro — Flask backend.

Local dev:   python app.py
Production:  gunicorn app:app   (Railway uses the Procfile)
"""
import os
from flask import Flask
from flask_cors import CORS
from database import db, initialize_db
from routes.auth        import auth_bp
from routes.devices     import devices_bp
from routes.readings    import readings_bp
from routes.consumption import consumption_bp
from routes.reports     import reports_bp
from routes.proxy       import proxy_bp
from routes.admin       import admin_bp
from routes.ai          import ai_bp
from routes.dashboard   import dashboard_bp
from routes.esp32_capture import esp32_bp
from routes.seed        import seed_bp


def create_app():
    app = Flask(__name__, static_folder='static', template_folder='templates')

    # Secret key: read from env in production, fall back to dev key locally
    app.config['SECRET_KEY'] = os.environ.get(
        'SECRET_KEY', 'hydratrack-local-dev-secret-key-do-not-change'
    )

    # Database: Railway injects DATABASE_URL when you add Postgres.
    # Falls back to local SQLite for dev.
    db_url = os.environ.get('DATABASE_URL', 'sqlite:///hydratrack.db')
    # Railway/Heroku give postgres:// but SQLAlchemy 2.x wants postgresql://
    if db_url.startswith('postgres://'):
        db_url = db_url.replace('postgres://', 'postgresql://', 1)
    app.config['SQLALCHEMY_DATABASE_URI'] = db_url
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    CORS(app, resources={r'/api/*': {'origins': '*'}})
    db.init_app(app)

    app.register_blueprint(auth_bp,        url_prefix='/api/auth')
    app.register_blueprint(devices_bp,     url_prefix='/api/devices')
    app.register_blueprint(readings_bp,    url_prefix='/api/readings')
    app.register_blueprint(consumption_bp, url_prefix='/api/consumption')
    app.register_blueprint(reports_bp,     url_prefix='/api/reports')
    app.register_blueprint(proxy_bp,       url_prefix='/api/proxy')
    app.register_blueprint(admin_bp,       url_prefix='/api/admin')
    app.register_blueprint(ai_bp,          url_prefix='/api/ai')
    app.register_blueprint(dashboard_bp,   url_prefix='')
    # New: ESP32 image-upload + Claude Vision OCR
    app.register_blueprint(esp32_bp,       url_prefix='/api/esp32')
    # New: April 2026 database seeder
    app.register_blueprint(seed_bp,        url_prefix='/api/seed')

    with app.app_context():
        db.create_all()
        initialize_db()
        print('DATABASE PATH:', db.engine.url)

    return app


app = create_app()

if __name__ == '__main__':
    # Railway sets PORT; locally it defaults to 5000
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)

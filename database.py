"""
database.py — SQLAlchemy models for BSU-Lipa Water Monitoring System
"""
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from werkzeug.security import generate_password_hash

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'
    id          = db.Column(db.Integer, primary_key=True)
    first_name  = db.Column(db.String(255), nullable=False)
    last_name   = db.Column(db.String(255), nullable=False)
    email       = db.Column(db.String(255), unique=True, nullable=False)
    username    = db.Column(db.String(255), unique=True, nullable=False)
    password    = db.Column(db.Text, nullable=False)
    is_admin    = db.Column(db.Boolean, default=False)
    is_approved = db.Column(db.Boolean, default=False)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)
    reports     = db.relationship('Report', backref='author', lazy=True)
    sessions    = db.relationship('UserSession', backref='user', lazy=True)
    def to_dict(self):
        return {'id':self.id,'first_name':self.first_name,'last_name':self.last_name,
                'email':self.email,'username':self.username,'is_admin':self.is_admin,
                'is_approved':self.is_approved,
                'created_at':self.created_at.isoformat() if self.created_at else None}

class ESP32Device(db.Model):
    __tablename__ = 'esp32_devices'
    id          = db.Column(db.Integer, primary_key=True)
    device_code = db.Column(db.String(50), unique=True, nullable=False)
    location    = db.Column(db.String(255))
    ip_address  = db.Column(db.String(50))
    status      = db.Column(db.String(50), default='active')
    submeters   = db.relationship('Submeter', backref='device', lazy=True)
    def to_dict(self):
        return {'id':self.id,'device_code':self.device_code,'location':self.location,
                'ip_address':self.ip_address,'status':self.status}

class Submeter(db.Model):
    __tablename__ = 'submeters'
    id             = db.Column(db.Integer, primary_key=True)
    submeter_code  = db.Column(db.String(50), unique=True, nullable=False)
    device_id      = db.Column(db.Integer, db.ForeignKey('esp32_devices.id'))
    type           = db.Column(db.String(1))
    baseline       = db.Column(db.Numeric(12, 4), default=0)
    readings            = db.relationship('MeterReading', backref='submeter', lazy=True)
    daily_consumptions  = db.relationship('DailyConsumption', backref='submeter', lazy=True)
    monthly_consumptions = db.relationship('MonthlyConsumption', backref='submeter', lazy=True)
    recommendations     = db.relationship('Recommendation', backref='submeter', lazy=True)
    def to_dict(self):
        return {'id':self.id,'submeter_code':self.submeter_code,'device_id':self.device_id,
                'type':self.type,'baseline':float(self.baseline) if self.baseline else 0}

class MeterReading(db.Model):
    __tablename__ = 'meter_readings'
    id           = db.Column(db.Integer, primary_key=True)
    submeter_id  = db.Column(db.Integer, db.ForeignKey('submeters.id'))
    ocr_value    = db.Column(db.Numeric(12, 4), nullable=False)
    reading_time = db.Column(db.DateTime, default=datetime.utcnow)
    def to_dict(self):
        return {'id':self.id,'submeter_id':self.submeter_id,
                'ocr_value':float(self.ocr_value) if self.ocr_value is not None else None,
                'reading_time':self.reading_time.isoformat()+'Z' if self.reading_time else None}

class DailyConsumption(db.Model):
    __tablename__ = 'daily_consumption'
    id           = db.Column(db.Integer, primary_key=True)
    submeter_id  = db.Column(db.Integer, db.ForeignKey('submeters.id'))
    reading_date = db.Column(db.Date, nullable=False)
    consumption  = db.Column(db.Numeric(12, 4), default=0)
    def to_dict(self):
        return {'id':self.id,'submeter_id':self.submeter_id,
                'reading_date':self.reading_date.isoformat() if self.reading_date else None,
                'consumption':float(self.consumption) if self.consumption is not None else 0}

class MonthlyConsumption(db.Model):
    __tablename__ = 'monthly_consumption'
    id          = db.Column(db.Integer, primary_key=True)
    submeter_id = db.Column(db.Integer, db.ForeignKey('submeters.id'))
    month       = db.Column(db.Date, nullable=False)
    consumption = db.Column(db.Numeric(12, 4), default=0)
    def to_dict(self):
        return {'id':self.id,'submeter_id':self.submeter_id,
                'month':self.month.isoformat() if self.month else None,
                'consumption':float(self.consumption) if self.consumption is not None else 0}

class Report(db.Model):
    __tablename__ = 'reports'
    id           = db.Column(db.Integer, primary_key=True)
    report_name  = db.Column(db.String(255))
    report_date  = db.Column(db.DateTime, default=datetime.utcnow)
    generated_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    def to_dict(self):
        return {'id':self.id,'report_name':self.report_name,
                'report_date':self.report_date.isoformat() if self.report_date else None}

class SystemLog(db.Model):
    __tablename__ = 'system_logs'
    id         = db.Column(db.Integer, primary_key=True)
    log_type   = db.Column(db.String(50))
    message    = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    def to_dict(self):
        return {'id':self.id,'log_type':self.log_type,'message':self.message,
                'created_at':self.created_at.isoformat() if self.created_at else None}

class UserSession(db.Model):
    __tablename__ = 'user_sessions'
    id            = db.Column(db.Integer, primary_key=True)
    user_id       = db.Column(db.Integer, db.ForeignKey('users.id'))
    session_token = db.Column(db.Text)
    expires_at    = db.Column(db.DateTime)
    def to_dict(self):
        return {'id':self.id,'user_id':self.user_id}

class Recommendation(db.Model):
    __tablename__ = 'recommendations'
    id             = db.Column(db.Integer, primary_key=True)
    submeter_id    = db.Column(db.Integer, db.ForeignKey('submeters.id'))
    recommendation = db.Column(db.Text)
    created_at     = db.Column(db.DateTime, default=datetime.utcnow)
    def to_dict(self):
        return {'id':self.id,'submeter_id':self.submeter_id,
                'recommendation':self.recommendation,
                'created_at':self.created_at.isoformat() if self.created_at else None}

def initialize_db():
    if not User.query.filter_by(username='admin').first():
        db.session.add(User(first_name='Admin',last_name='User',email='admin@watermonitoring.local',
            username='admin',password=generate_password_hash('admin123'),is_admin=True,is_approved=True))
        db.session.commit()
        print('[Water Monitor] Default admin → admin / admin123')
    if not ESP32Device.query.first():
        dev = ESP32Device(device_code='ESP32-CAM-01',location='Water Meter',ip_address='',status='active')
        db.session.add(dev); db.session.flush()
        db.session.add(Submeter(submeter_code='SUB-A',device_id=dev.id,type='A',baseline=0))
        db.session.add(Submeter(submeter_code='SUB-B',device_id=dev.id,type='B',baseline=0))
        db.session.commit()
        print('[Water Monitor] Default device + 2 submeters seeded')

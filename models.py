from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import json

db = SQLAlchemy()

class AnalysisSession(db.Model):
    """Store information about each analysis session"""
    __tablename__ = 'analysis_sessions'
    
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    upload_timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    total_wells = db.Column(db.Integer, nullable=False)
    good_curves = db.Column(db.Integer, nullable=False)
    success_rate = db.Column(db.Float, nullable=False)
    cycle_min = db.Column(db.Integer)
    cycle_max = db.Column(db.Integer)
    cycle_count = db.Column(db.Integer)
    
    # Relationship to well results
    well_results = db.relationship('WellResult', backref='session', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'filename': self.filename,
            'upload_timestamp': self.upload_timestamp.isoformat(),
            'total_wells': self.total_wells,
            'good_curves': self.good_curves,
            'success_rate': self.success_rate,
            'cycle_range': f"{self.cycle_min}-{self.cycle_max}" if self.cycle_min and self.cycle_max else None,
            'cycle_count': self.cycle_count
        }

class WellResult(db.Model):
    """Store detailed results for each well"""
    __tablename__ = 'well_results'
    
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('analysis_sessions.id'), nullable=False)
    well_id = db.Column(db.String(50), nullable=False)
    
    # Analysis results
    is_good_scurve = db.Column(db.Boolean, nullable=False)
    r2_score = db.Column(db.Float)
    rmse = db.Column(db.Float)
    amplitude = db.Column(db.Float)
    steepness = db.Column(db.Float)
    midpoint = db.Column(db.Float)
    baseline = db.Column(db.Float)
    data_points = db.Column(db.Integer)
    cycle_range = db.Column(db.Float)
    
    # JSON fields for complex data
    fit_parameters = db.Column(db.Text)  # JSON string
    parameter_errors = db.Column(db.Text)  # JSON string
    fitted_curve = db.Column(db.Text)  # JSON string
    anomalies = db.Column(db.Text)  # JSON string
    raw_cycles = db.Column(db.Text)  # JSON string
    raw_rfu = db.Column(db.Text)  # JSON string
    cq_value = db.Column(db.Float)  # Integrated Cq value
    sample_name = db.Column(db.String(255))  # Integrated sample name
    
    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'well_id': self.well_id,
            'is_good_scurve': self.is_good_scurve,
            'r2_score': self.r2_score,
            'rmse': self.rmse,
            'amplitude': self.amplitude,
            'steepness': self.steepness,
            'midpoint': self.midpoint,
            'baseline': self.baseline,
            'data_points': self.data_points,
            'cycle_range': self.cycle_range,
            'fit_parameters': json.loads(self.fit_parameters) if self.fit_parameters else None,
            'parameter_errors': json.loads(self.parameter_errors) if self.parameter_errors else None,
            'fitted_curve': json.loads(self.fitted_curve) if self.fitted_curve else None,
            'anomalies': json.loads(self.anomalies) if self.anomalies else [],
            'raw_cycles': json.loads(self.raw_cycles) if self.raw_cycles else None,
            'raw_rfu': json.loads(self.raw_rfu) if self.raw_rfu else None,
            'cq_value': self.cq_value,
            'sample_name': self.sample_name
        }
    
    @classmethod
    def from_analysis_result(cls, session_id, well_id, analysis_result, raw_data):
        """Create WellResult from analysis output"""
        return cls(
            session_id=session_id,
            well_id=well_id,
            is_good_scurve=analysis_result.get('is_good_scurve', False),
            r2_score=analysis_result.get('r2_score'),
            rmse=analysis_result.get('rmse'),
            amplitude=analysis_result.get('amplitude'),
            steepness=analysis_result.get('steepness'),
            midpoint=analysis_result.get('midpoint'),
            baseline=analysis_result.get('baseline'),
            data_points=analysis_result.get('data_points'),
            cycle_range=analysis_result.get('cycle_range'),
            fit_parameters=json.dumps(analysis_result.get('fit_parameters', [])),
            parameter_errors=json.dumps(analysis_result.get('parameter_errors', [])),
            fitted_curve=json.dumps(analysis_result.get('fitted_curve', [])),
            anomalies=json.dumps(analysis_result.get('anomalies', [])),
            raw_cycles=json.dumps(raw_data.get('cycles', [])),
            raw_rfu=json.dumps(raw_data.get('rfu', [])),
            cq_value=raw_data.get('cq'),
            sample_name=raw_data.get('sampleName')
        )
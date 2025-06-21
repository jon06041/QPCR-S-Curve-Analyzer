from flask import Flask, request, jsonify, send_from_directory
import json
import os
import re
from qpcr_analyzer import process_csv_data, validate_csv_structure
from models import db, AnalysisSession, WellResult
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.exc import OperationalError, IntegrityError, DatabaseError

def extract_base_pattern(filename):
    """Extract base pattern from CFX Manager filename (e.g., AcBVAB_2578825_CFX367393)"""
    # Match pattern: prefix_numbers_CFXnumbers (allowing additional suffixes)
    pattern = r'^([A-Za-z][A-Za-z0-9]*_\d+_CFX\d+)'
    match = re.match(pattern, filename)
    if match:
        return match.group(1)
    return filename.split('.')[0]  # Fallback to filename without extension

def validate_file_pattern_consistency(filenames):
    """Validate that all files share the same base pattern"""
    if not filenames:
        return True, ""
    
    base_patterns = []
    for filename in filenames:
        base_pattern = extract_base_pattern(filename)
        base_patterns.append(base_pattern)
    
    # Check if all base patterns are the same
    unique_patterns = set(base_patterns)
    if len(unique_patterns) > 1:
        return False, f"Files have different base patterns: {', '.join(unique_patterns)}"
    
    return True, ""

class Base(DeclarativeBase):
    pass

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY") or "qpcr_analyzer_secret_key_2025"

# Global quota flag to prevent repeated database operations when quota exceeded
quota_exceeded = False

# Database configuration for both development (SQLite) and production (MySQL)
database_url = os.environ.get("DATABASE_URL")
if database_url and database_url.startswith("mysql"):
    # Production MySQL configuration
    app.config["SQLALCHEMY_DATABASE_URI"] = database_url
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "pool_recycle": 300,
        "pool_pre_ping": True,
        "pool_size": 10,
        "max_overflow": 20,
        "pool_timeout": 30,
    }
    print("Using MySQL database for production")
else:
    # Development SQLite configuration
    sqlite_path = os.path.join(os.path.dirname(__file__), 'qpcr_analysis.db')
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{sqlite_path}"
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "pool_recycle": 300,
        "pool_pre_ping": True,
    }
    print(f"Using SQLite database for development: {sqlite_path}")

db.init_app(app)

# Create tables for database
with app.app_context():
    db.create_all()
    if not database_url or not database_url.startswith("mysql"):
        sqlite_path = os.path.join(os.path.dirname(__file__), 'qpcr_analysis.db')
        print(f"SQLite database initialized at: {sqlite_path}")
    else:
        print("MySQL database tables initialized")

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/static/<path:filename>')
def static_files(filename):
    return send_from_directory('static', filename)

@app.route('/analyze', methods=['POST'])
def analyze_data():
    """Endpoint to analyze qPCR data and save results to database"""
    try:
        # Get JSON data from request
        request_data = request.get_json()
        filename = request.headers.get('X-Filename', 'unknown.csv')
        fluorophore = request.headers.get('X-Fluorophore', 'Unknown')
        
        if not request_data:
            return jsonify({'error': 'No data provided', 'success': False}), 400
        
        # Extract analysis data and samples data from payload
        if 'analysis_data' in request_data:
            # New format with SQL integration support
            data = request_data['analysis_data']
            samples_data = request_data.get('samples_data')
        else:
            # Legacy format for backward compatibility
            data = request_data
            samples_data = None
        
        # Validate data structure
        errors, warnings = validate_csv_structure(data)
        
        if errors:
            return jsonify({
                'error': 'Data validation failed',
                'validation_errors': errors,
                'validation_warnings': warnings,
                'success': False
            }), 400
        
        # Process the data with SQL integration if samples data available
        try:
            if samples_data:
                from sql_integration import process_with_sql_integration
                results = process_with_sql_integration(data, samples_data, fluorophore)
                print(f"SQL-based analysis completed for {len(data)} wells with {fluorophore}")
            else:
                results = process_csv_data(data)
                print(f"Standard analysis completed for {len(data)} wells")
            
            if not results.get('success', False):
                print(f"Analysis failed: {results.get('error', 'Unknown error')}")
                return jsonify(results), 500
        except Exception as analysis_error:
            print(f"Analysis processing error: {analysis_error}")
            return jsonify({
                'error': f'Analysis failed: {str(analysis_error)}',
                'success': False
            }), 500
        
        # Calculate summary from results structure first
        if 'summary' in results and isinstance(results['summary'], dict):
            summary = results['summary']
        else:
            individual_results = results.get('individual_results', {})
            good_curves = results.get('good_curves', [])
            total_wells = len(individual_results)
            good_count = len(good_curves)
            success_rate = (good_count / total_wells * 100) if total_wells > 0 else 0
            
            summary = {
                'total_wells': total_wells,
                'good_curves': good_count,
                'success_rate': success_rate
            }
        
        # Skip database saving for individual fluorophore analyses  
        # Let frontend handle combined multi-fluorophore session saving
        fluorophore = request.headers.get('X-Fluorophore', 'Unknown')
        is_multi_fluorophore = fluorophore in ['Cy5', 'FAM', 'HEX', 'Texas Red']
        
        if is_multi_fluorophore:
            print(f"Skipping database save for individual {fluorophore} analysis - frontend will handle combined session")
            database_saved = False
        else:
            database_saved = False
            print(f"Analysis complete - individual fluorophore saving disabled")
        
        # Include validation warnings in successful response
        if warnings:
            results['validation_warnings'] = warnings
        
        # Ensure all numpy data types are converted to Python types for JSON serialization
        try:
            import json
            json_str = json.dumps(results, default=str)  # Convert numpy types to strings
            return json_str, 200, {'Content-Type': 'application/json'}
        except Exception as json_error:
            print(f"JSON serialization error: {json_error}")
            return jsonify({
                'error': f'Response serialization failed: {str(json_error)}',
                'success': False
            }), 500
        
    except Exception as e:
        return jsonify({
            'error': f'Server error: {str(e)}',
            'success': False
        }), 500

@app.route('/sessions', methods=['GET'])
def get_sessions():
    """Get all analysis sessions"""
    try:
        sessions = AnalysisSession.query.order_by(AnalysisSession.upload_timestamp.desc()).all()
        return jsonify({
            'sessions': [session.to_dict() for session in sessions],
            'total': len(sessions)
        })
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500

@app.route('/sessions/<int:session_id>', methods=['GET'])
def get_session_details(session_id):
    """Get detailed results for a specific session"""
    try:
        session = AnalysisSession.query.get_or_404(session_id)
        wells = WellResult.query.filter_by(session_id=session_id).all()
        
        return jsonify({
            'session': session.to_dict(),
            'wells': [well.to_dict() for well in wells]
        })
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500

@app.route('/sessions/save-combined', methods=['POST'])
def save_combined_session():
    """Save a combined multi-fluorophore analysis session"""
    try:
        data = request.get_json()
        
        # Extract session info
        filename = data.get('filename', 'Multi-Fluorophore Analysis')
        combined_results = data.get('combined_results', {})
        fluorophores_list = data.get('fluorophores', [])
        
        # Extract base pattern from filename (filename format: Multi-Fluorophore_AcBVAB_2578825_CFX367393)
        if 'Multi-Fluorophore_' in filename:
            base_pattern = filename.replace('Multi-Fluorophore_', '')
        else:
            base_pattern = extract_base_pattern(filename)
        
        # Create session with intelligent naming using provided fluorophores
        if len(fluorophores_list) > 1:
            display_name = f"Multi-Fluorophore Analysis ({', '.join(sorted(fluorophores_list))}) {base_pattern}"
        elif len(fluorophores_list) == 1:
            display_name = f"Single Fluorophore Analysis ({fluorophores_list[0]}) {base_pattern}"
        else:
            display_name = f"qPCR Analysis {base_pattern}"
        
        # Calculate correct statistics from individual results
        individual_results = combined_results.get('individual_results', {})
        total_wells = len(individual_results)
        good_curves = sum(1 for well_data in individual_results.values() 
                         if isinstance(well_data, dict) and well_data.get('is_good_scurve', False))
        success_rate = (good_curves / total_wells * 100) if total_wells > 0 else 0
        
        # Create analysis session
        session = AnalysisSession()
        session.filename = display_name
        session.total_wells = total_wells
        session.good_curves = good_curves
        session.success_rate = success_rate
        
        db.session.add(session)
        db.session.flush()
        
        # Save well results
        well_count = 0
        for well_key, well_data in individual_results.items():
            try:
                well_result = WellResult()
                well_result.session_id = session.id
                well_result.well_id = well_key
                well_result.is_good_scurve = bool(well_data.get('is_good_scurve', False))
                well_result.r2_score = float(well_data.get('r2_score', 0)) if well_data.get('r2_score') is not None else None
                well_result.sample_name = str(well_data.get('sample_name', '')) if well_data.get('sample_name') else None
                well_result.cq_value = float(well_data.get('cq_value', 0)) if well_data.get('cq_value') is not None else None
                
                # Save all curve parameters
                well_result.rmse = float(well_data.get('rmse', 0)) if well_data.get('rmse') is not None else None
                well_result.amplitude = float(well_data.get('amplitude', 0)) if well_data.get('amplitude') is not None else None
                well_result.steepness = float(well_data.get('steepness', 0)) if well_data.get('steepness') is not None else None
                well_result.midpoint = float(well_data.get('midpoint', 0)) if well_data.get('midpoint') is not None else None
                well_result.baseline = float(well_data.get('baseline', 0)) if well_data.get('baseline') is not None else None
                well_result.data_points = int(well_data.get('data_points', 0)) if well_data.get('data_points') is not None else None
                well_result.cycle_range = float(well_data.get('cycle_range', 0)) if well_data.get('cycle_range') is not None else None
                
                # Save chart data
                if well_data.get('raw_cycles'):
                    well_result.raw_cycles = json.dumps(well_data['raw_cycles'])
                if well_data.get('raw_rfu'):
                    well_result.raw_rfu = json.dumps(well_data['raw_rfu'])
                
                # Save additional analysis data
                if well_data.get('fit_parameters'):
                    well_result.fit_parameters = json.dumps(well_data['fit_parameters'])
                if well_data.get('parameter_errors'):
                    well_result.parameter_errors = json.dumps(well_data['parameter_errors'])
                if well_data.get('fitted_curve'):
                    well_result.fitted_curve = json.dumps(well_data['fitted_curve'])
                if well_data.get('anomalies'):
                    well_result.anomalies = json.dumps(well_data['anomalies'])
                
                db.session.add(well_result)
                well_count += 1
                
                if well_count % 50 == 0:
                    db.session.commit()
                    
            except Exception as well_error:
                print(f"Error saving well {well_key}: {well_error}")
                continue
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Combined session saved with {well_count} wells',
            'session_id': session.id,
            'display_name': display_name
        })
        
    except Exception as e:
        db.session.rollback()
        print(f"Error saving combined session: {e}")
        return jsonify({'error': f'Failed to save combined session: {str(e)}'}), 500

@app.route('/sessions/<int:session_id>', methods=['DELETE'])
def delete_session(session_id):
    """Delete a specific session and its results"""
    try:
        session = AnalysisSession.query.get(session_id)
        if not session:
            return jsonify({'message': 'Session already deleted or does not exist'}), 200
        
        db.session.delete(session)  # Cascade will delete associated wells
        db.session.commit()
        
        return jsonify({'message': 'Session deleted successfully'})
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting session {session_id}: {e}")
        return jsonify({'error': f'Database error: {str(e)}'}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'message': 'qPCR S-Curve Analyzer with Database',
        'version': '2.1.0-database'
    })

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    # Ensure static directory exists
    if not os.path.exists('static'):
        os.makedirs('static')
    
    # Run the Flask app (Railway deployment compatible)
    import os
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)

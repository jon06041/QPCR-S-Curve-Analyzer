from flask import Flask, request, jsonify, send_from_directory
import json
import os
import re
from datetime import datetime
from qpcr_analyzer import process_csv_data, validate_csv_structure
from models import db, AnalysisSession, WellResult, ExperimentStatistics
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.exc import OperationalError, IntegrityError, DatabaseError

def extract_base_pattern(filename):
    """Extract base pattern from CFX Manager filename, handling trailing dashes"""
    # Match pattern: prefix_numbers_CFXnumbers (allowing additional suffixes)
    pattern = r'^([A-Za-z][A-Za-z0-9]*_\d+_CFX\d+)'
    match = re.match(pattern, filename)
    if match:
        # Clean up any trailing dashes or spaces from the extracted pattern
        return re.sub(r'[-\s]+$', '', match.group(1))
    # Fallback to filename without extension, also cleaning trailing dashes
    return re.sub(r'[-\s]+$', '', filename.split('.')[0])

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

def save_individual_channel_session(filename, results, fluorophore, summary):
    """Save individual channel session to database for channel tracking"""
    try:
        from models import AnalysisSession, WellResult
        
        # Use complete filename as experiment name for individual channels
        experiment_name = filename
        
        print(f"DEBUG: Individual channel session - filename: {filename}, fluorophore: {fluorophore}")
        
        # Enhanced fluorophore detection from filename if not provided
        if not fluorophore:
            # Extract fluorophore from CFX Manager filename format
            fluorophores = ['Cy5', 'FAM', 'HEX', 'Texas Red']
            for fluor in fluorophores:
                if f'_{fluor}.csv' in filename or f'_{fluor}_' in filename:
                    fluorophore = fluor
                    break
                elif fluor.lower() in filename.lower():
                    fluorophore = fluor
                    break
            
            print(f"DEBUG: Enhanced fluorophore detection result: {fluorophore}")
        
        # Calculate statistics from results
        individual_results = results.get('individual_results', {})
        total_wells = len(individual_results)
        
        # Count positive wells (POS classification: amplitude > 500 and no anomalies)
        positive_wells = 0
        if isinstance(individual_results, dict):
            for well_data in individual_results.values():
                if isinstance(well_data, dict):
                    amplitude = well_data.get('amplitude', 0)
                    anomalies = well_data.get('anomalies', [])
                    has_anomalies = False
                    
                    if anomalies and anomalies != ['None']:
                        has_anomalies = True
                    
                    if amplitude > 500 and not has_anomalies:
                        positive_wells += 1
        
        success_rate = (positive_wells / total_wells * 100) if total_wells > 0 else 0
        
        # Extract cycle information - handle both dict and list formats
        cycle_count = None
        cycle_min = None
        cycle_max = None
        
        # Handle both dict and list formats for cycle extraction
        if isinstance(individual_results, dict):
            well_data_items = individual_results.values()
        elif isinstance(individual_results, list):
            well_data_items = individual_results
        else:
            well_data_items = []
        
        for well_data in well_data_items:
            if isinstance(well_data, dict) and well_data.get('raw_cycles'):
                try:
                    cycles = well_data['raw_cycles']
                    if isinstance(cycles, list) and len(cycles) > 0:
                        cycle_count = len(cycles)
                        cycle_min = min(cycles)
                        cycle_max = max(cycles)
                        break
                except (ValueError, TypeError):
                    continue
        
        # Default cycle info if not found
        if cycle_count is None:
            cycle_count = 33
            cycle_min = 1
            cycle_max = 33
        
        # Calculate pathogen breakdown for individual channel
        pathogen_breakdown_display = None
        if fluorophore:
            # Extract test code from filename pattern (e.g., AcBVAB_2578825_CFX367393 -> BVAB)
            base_pattern = filename.replace(' -  Quantification Amplification Results_' + fluorophore + '.csv', '')
            test_code = base_pattern.split('_')[0]
            if test_code.startswith('Ac'):
                test_code = test_code[2:]  # Remove "Ac" prefix
            
            # Enhanced pathogen mapping for all test types
            pathogen_target = fluorophore  # Default fallback
            
            if test_code == 'BVAB':
                pathogen_mapping = {
                    'FAM': 'BVAB2',
                    'HEX': 'BVAB1', 
                    'Cy5': 'BVAB3'
                }
                pathogen_target = pathogen_mapping.get(fluorophore, fluorophore)
            elif test_code == 'Ngon' and fluorophore == 'HEX':
                pathogen_target = 'Neisseria gonhorrea'
            elif test_code == 'Calb' and fluorophore == 'HEX':
                pathogen_target = 'Candida albicans'
            elif test_code == 'Ctrach' and fluorophore == 'FAM':
                pathogen_target = 'Chlamydia trachomatis'
            elif test_code == 'Tvag' and fluorophore == 'FAM':
                pathogen_target = 'Trichomonas vaginalis'
            elif test_code == 'Mgen' and fluorophore == 'FAM':
                pathogen_target = 'Mycoplasma genitalium'
            elif test_code == 'Upar' and fluorophore == 'FAM':
                pathogen_target = 'Ureaplasma parvum'
            elif test_code == 'Uure' and fluorophore == 'FAM':
                pathogen_target = 'Ureaplasma urealyticum'
            
            print(f"Backend pathogen mapping: {test_code} + {fluorophore} -> {pathogen_target}")
            
            # Calculate positive percentage for this channel
            pos_count = 0
            total_count = len(individual_results)
            
            if isinstance(individual_results, dict):
                for well_data in individual_results.values():
                    if isinstance(well_data, dict) and well_data.get('amplitude', 0) > 500:
                        pos_count += 1
            
            positive_percentage = (pos_count / total_count * 100) if total_count > 0 else 0
            pathogen_breakdown_display = f"{pathogen_target}: {positive_percentage:.1f}%"
            
            print(f"Individual channel pathogen breakdown: {pathogen_breakdown_display} (fluorophore: {fluorophore}, target: {pathogen_target})")
        else:
            print(f"No fluorophore detected for individual channel session: {filename}")
        
        # Check for existing session with same complete filename and overwrite
        existing_session = AnalysisSession.query.filter_by(filename=experiment_name).first()
        
        if existing_session:
            # Update existing session
            session = existing_session
            WellResult.query.filter_by(session_id=session.id).delete()
            session.total_wells = total_wells
            session.good_curves = positive_wells
            session.success_rate = success_rate
            session.cycle_count = cycle_count
            session.cycle_min = cycle_min
            session.cycle_max = cycle_max
            session.pathogen_breakdown = pathogen_breakdown_display
            session.upload_timestamp = datetime.utcnow()
        else:
            # Create new session
            session = AnalysisSession()
            session.filename = experiment_name
            session.total_wells = total_wells
            session.good_curves = positive_wells
            session.success_rate = success_rate
            session.cycle_count = cycle_count
            session.cycle_min = cycle_min
            session.cycle_max = cycle_max
            session.pathogen_breakdown = pathogen_breakdown_display
            session.upload_timestamp = datetime.utcnow()
            db.session.add(session)
        
        # Commit session first to get ID
        db.session.commit()
        
        # Save well results with fluorophore information
        well_count = 0
        
        # Debug the individual_results structure
        print(f"Individual results type: {type(individual_results)}")
        if individual_results:
            first_key = next(iter(individual_results)) if isinstance(individual_results, dict) else None
            if first_key:
                print(f"First key: {first_key}, First value type: {type(individual_results[first_key])}")
        
        # Handle both dict and list formats for individual_results
        if isinstance(individual_results, dict):
            results_items = individual_results.items()
        elif isinstance(individual_results, list):
            # Convert list to dict format using well_id as key
            results_items = []
            for i, result in enumerate(individual_results):
                if isinstance(result, dict) and 'well_id' in result:
                    well_key = result['well_id']
                    # Add fluorophore suffix if not present
                    if fluorophore and not well_key.endswith(f'_{fluorophore}'):
                        well_key = f"{well_key}_{fluorophore}"
                    results_items.append((well_key, result))
                else:
                    print(f"Warning: List item {i} is not a valid dict or missing well_id: {type(result)}")
                    continue
        else:
            print(f"Warning: Unexpected individual_results type: {type(individual_results)}")
            results_items = []
        
        for well_key, well_data in results_items:
            # Ensure well_data is a dictionary
            if not isinstance(well_data, dict):
                print(f"Warning: well_data for {well_key} is not a dict: {type(well_data)}")
                continue
            try:
                well_result = WellResult()
                well_result.session_id = session.id
                well_result.well_id = well_key
                well_result.is_good_scurve = bool(well_data.get('is_good_scurve', False))
                well_result.r2_score = float(well_data.get('r2_score', 0)) if well_data.get('r2_score') is not None else None
                well_result.rmse = float(well_data.get('rmse', 0)) if well_data.get('rmse') is not None else None
                well_result.amplitude = float(well_data.get('amplitude', 0)) if well_data.get('amplitude') is not None else None
                well_result.steepness = float(well_data.get('steepness', 0)) if well_data.get('steepness') is not None else None
                well_result.midpoint = float(well_data.get('midpoint', 0)) if well_data.get('midpoint') is not None else None
                well_result.baseline = float(well_data.get('baseline', 0)) if well_data.get('baseline') is not None else None
                well_result.data_points = int(well_data.get('data_points', 0)) if well_data.get('data_points') is not None else None
                well_result.cycle_range = float(well_data.get('cycle_range', 0)) if well_data.get('cycle_range') is not None else None
                # JSON/text fields - ensure they are converted to JSON strings for database storage
                # Helper function to safely serialize to JSON, avoiding double-encoding
                def safe_json_dumps(value, default=None):
                    if value is None:
                        return None
                    # If already a string, assume it's already JSON-encoded
                    if isinstance(value, str):
                        try:
                            # Validate it's valid JSON
                            json.loads(value)
                            return value
                        except (json.JSONDecodeError, TypeError):
                            # If not valid JSON, treat as a raw string and encode it
                            return json.dumps(value)
                    # Otherwise, serialize the object/list to JSON
                    return json.dumps(value if value is not None else default)
                
                well_result.fit_parameters = safe_json_dumps(well_data.get('fit_parameters'), [])
                well_result.parameter_errors = safe_json_dumps(well_data.get('parameter_errors'), [])
                well_result.fitted_curve = safe_json_dumps(well_data.get('fitted_curve'), [])
                well_result.anomalies = safe_json_dumps(well_data.get('anomalies'), [])
                well_result.raw_cycles = safe_json_dumps(well_data.get('raw_cycles'), [])
                well_result.raw_rfu = safe_json_dumps(well_data.get('raw_rfu'), [])
                well_result.sample_name = str(well_data.get('sample_name', '')) if well_data.get('sample_name') else None
                well_result.cq_value = float(well_data.get('cq_value', 0)) if well_data.get('cq_value') is not None else None
                # Set fluorophore if present
                well_result.fluorophore = str(well_data.get('fluorophore', '')) if well_data.get('fluorophore') else None
                
                # Set threshold_value if present
                threshold_value = well_data.get('threshold_value')
                if threshold_value is not None:
                    try:
                        well_result.threshold_value = float(threshold_value)
                    except (ValueError, TypeError):
                        well_result.threshold_value = None
                else:
                    well_result.threshold_value = None
                    
                db.session.add(well_result)
                db.session.flush()  # Force write to DB after each well
                well_count += 1
                if well_count % 50 == 0:
                    db.session.commit()
                print(f"[DB DEBUG] Saved well {well_key}: {well_result.to_dict()}")
            except Exception as e:
                print(f"Error saving well {well_key}: {e}")
                continue
        
        # Final commit
        # Final commit
        try:
            db.session.commit()
            db.session.flush()
            print(f"[DB DEBUG] Final commit done for {well_count} wells.")
        except Exception as commit_error:
            db.session.rollback()
            print(f"Forced commit error: {commit_error}")
            raise
        
        print(f"Individual channel session saved: {experiment_name} with {well_count} wells")
        return True
        
    except Exception as e:
        db.session.rollback()
        print(f"Error saving individual channel session: {e}")
        return False

class Base(DeclarativeBase):
    pass

app = Flask(__name__, static_folder='static', static_url_path='/static')
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
        print(f"[ANALYZE] Starting analysis request")
        
        # Get JSON data from request
        request_data = request.get_json()
        filename = request.headers.get('X-Filename', 'unknown.csv')
        fluorophore = request.headers.get('X-Fluorophore', 'Unknown')
        
        print(f"[ANALYZE] Request headers - Filename: {filename}, Fluorophore: {fluorophore}")
        print(f"[ANALYZE] Request data type: {type(request_data)}, Length: {len(request_data) if request_data else 0}")
        
        if not request_data:
            print(f"[ANALYZE ERROR] No data provided")
            return jsonify({'error': 'No data provided', 'success': False}), 400
        
        # Extract analysis data and samples data from payload
        if 'analysis_data' in request_data:
            # New format with SQL integration support
            data = request_data['analysis_data']
            samples_data = request_data.get('samples_data')
            print(f"[ANALYZE] Using new format - analysis_data length: {len(data)}")
        else:
            # Legacy format for backward compatibility
            data = request_data
            samples_data = None
            print(f"[ANALYZE] Using legacy format - data length: {len(data)}")
        
        print(f"[ANALYZE] Starting validation...")
        # Validate data structure
        errors, warnings = validate_csv_structure(data)
        
        if errors:
            print(f"[ANALYZE ERROR] Validation failed: {errors}")
            return jsonify({
                'error': 'Data validation failed',
                'validation_errors': errors,
                'validation_warnings': warnings,
                'success': False
            }), 400
        
        print(f"[ANALYZE] Validation passed, starting processing...")
        # Process the data with SQL integration if samples data available
        try:
            if samples_data:
                from sql_integration import process_with_sql_integration
                results = process_with_sql_integration(data, samples_data, fluorophore)
                print(f"SQL-based analysis completed for {len(data)} wells with {fluorophore}")
            else:
                results = process_csv_data(data)
                print(f"Standard analysis completed for {len(data)} wells")
            
            # Inject fluorophore information into individual well results
            if 'individual_results' in results and fluorophore != 'Unknown':
                for well_key, well_data in results['individual_results'].items():
                    if isinstance(well_data, dict):
                        well_data['fluorophore'] = fluorophore
            
            if not results.get('success', False):
                print(f"Analysis failed: {results.get('error', 'Unknown error')}")
                return jsonify(results), 500
                
            print(f"[ANALYZE] Analysis completed successfully")
        except Exception as analysis_error:
            print(f"Analysis processing error: {analysis_error}")
            import traceback
            traceback.print_exc()
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
        
        # Save individual channel analyses to database for channel tracking
        fluorophore = request.headers.get('X-Fluorophore', 'Unknown')
        is_individual_channel = fluorophore in ['Cy5', 'FAM', 'HEX', 'Texas Red']
        
        print(f"[ANALYZE] Database save - fluorophore: {fluorophore}, is_individual: {is_individual_channel}")
        
        if is_individual_channel:
            # Save individual channel session with complete filename
            try:
                database_saved = save_individual_channel_session(filename, results, fluorophore, summary)
                print(f"Individual {fluorophore} channel saved to database: {database_saved}")
            except Exception as save_error:
                print(f"Failed to save individual {fluorophore} channel: {save_error}")
                import traceback
                traceback.print_exc()
                database_saved = False
        else:
            # For multi-fluorophore analysis, save combined session after all individual channels
            database_saved = False
            print(f"Analysis complete - individual channel for {fluorophore} (part of multi-fluorophore)")
        
        # Include validation warnings in successful response
        if warnings:
            results['validation_warnings'] = warnings
        
        print(f"[ANALYZE] Preparing JSON response...")
        # Ensure all numpy data types are converted to Python types for JSON serialization
        try:
            import json
            json_str = json.dumps(results, default=str)  # Convert numpy types to strings
            print(f"[ANALYZE] JSON serialization successful, response length: {len(json_str)}")
            return json_str, 200, {'Content-Type': 'application/json'}
        except Exception as json_error:
            print(f"JSON serialization error: {json_error}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'error': f'Response serialization failed: {str(json_error)}',
                'success': False
            }), 500
        
    except Exception as e:
        print(f"[ANALYZE ERROR] Server error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': f'Server error: {str(e)}',
            'success': False
        }), 500

@app.route('/sessions', methods=['GET'])
def get_sessions():
    """Get all analysis sessions"""
    try:
        sessions = AnalysisSession.query.order_by(AnalysisSession.upload_timestamp.desc()).all()
        sessions_data = []
        for session in sessions:
            session_dict = session.to_dict()
            # Robustly handle both dict and list for well_results
            individual_results = session.well_results
            # Convert to dict keyed by well_id if not already
            if isinstance(individual_results, dict):
                results_dict = individual_results
            else:
                results_dict = {}
                for well in individual_results:
                    well_dict = well.to_dict() if hasattr(well, 'to_dict') else well
                    if isinstance(well_dict, dict) and 'well_id' in well_dict:
                        results_dict[well_dict['well_id']] = well_dict
            session_dict['individual_results'] = results_dict
            sessions_data.append(session_dict)
        return jsonify({
            'sessions': sessions_data,
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
        # Robustly handle both dict and list for wells
        if isinstance(wells, dict):
            results_dict = wells
        else:
            results_dict = {}
            for well in wells:
                well_dict = well.to_dict() if hasattr(well, 'to_dict') else well
                if isinstance(well_dict, dict) and 'well_id' in well_dict:
                    results_dict[well_dict['well_id']] = well_dict
        return jsonify({
            'session': session.to_dict(),
            'wells': [well.to_dict() for well in wells],
            'individual_results': results_dict
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
        
        # Clean up filename to prevent duplicate naming
        if 'Multi-Fluorophore Analysis' in filename:
            # Extract just the base pattern for clean display
            import re
            pattern_match = re.search(r'([A-Za-z][A-Za-z0-9]*_\d+_CFX\d+)', filename)
            if pattern_match:
                base_pattern = pattern_match.group(1)
                # Create clean display name with fluorophores
                fluorophore_list = ', '.join(sorted(fluorophores_list))
                display_name = f"Multi-Fluorophore Analysis ({fluorophore_list}) {base_pattern}"
                experiment_name = base_pattern
            else:
                # Fallback
                display_name = filename
                experiment_name = filename
        elif 'Multi-Fluorophore_' in filename:
            # For combined sessions, extract the original multi-fluorophore pattern
            experiment_name = filename.replace('Multi-Fluorophore_', '')
            display_name = experiment_name
        else:
            # For individual channels, use the complete filename including channel
            experiment_name = filename
            display_name = filename
        
        # Calculate correct statistics from individual results for multi-fluorophore analysis
        individual_results = combined_results.get('individual_results', {})
        total_wells = len(individual_results)
        
        print(f"Multi-fluorophore session: {total_wells} total wells, fluorophores: {fluorophores_list}")
        
        # Calculate fluorophore-specific statistics for multi-fluorophore display
        fluorophore_breakdown = {}
        fluorophore_counts = {}
        
        for well_key, well_data in individual_results.items():
            if isinstance(well_data, dict):
                # Extract fluorophore from well key (e.g., "A1_FAM" -> "FAM")
                fluorophore = well_key.split('_')[-1] if '_' in well_key else 'Unknown'
                
                if fluorophore not in fluorophore_breakdown:
                    fluorophore_breakdown[fluorophore] = {'total': 0, 'positive': 0}
                
                fluorophore_breakdown[fluorophore]['total'] += 1
                
                # Check if well is positive (amplitude > 500)
                amplitude = well_data.get('amplitude', 0)
                if amplitude > 500:
                    fluorophore_breakdown[fluorophore]['positive'] += 1
                    
                # Count wells per fluorophore for validation
                fluorophore_counts[fluorophore] = fluorophore_counts.get(fluorophore, 0) + 1
        
        # Calculate overall statistics and create pathogen breakdown display
        positive_wells = sum(breakdown['positive'] for breakdown in fluorophore_breakdown.values())
        success_rate = (positive_wells / total_wells * 100) if total_wells > 0 else 0
        
        # Create pathogen breakdown string for multi-fluorophore display
        pathogen_breakdown_display = ""
        if len(fluorophore_breakdown) > 1:  # Multi-fluorophore session
            pathogen_rates = []
            fluorophore_order = ['Cy5', 'FAM', 'HEX', 'Texas Red']
            
            # Sort fluorophores in standard order
            sorted_fluorophores = sorted(fluorophore_breakdown.keys(), 
                                       key=lambda x: fluorophore_order.index(x) if x in fluorophore_order else 999)
            
            for fluorophore in sorted_fluorophores:
                breakdown = fluorophore_breakdown[fluorophore]
                rate = (breakdown['positive'] / breakdown['total'] * 100) if breakdown['total'] > 0 else 0
                
                # Map fluorophore to pathogen target
                pathogen_target = fluorophore
                if fluorophore == 'Cy5':
                    pathogen_target = 'BVAB3'
                elif fluorophore == 'FAM':
                    pathogen_target = 'BVAB2'
                elif fluorophore == 'HEX':
                    pathogen_target = 'BVAB1'
                
                pathogen_rates.append(f"{pathogen_target}: {rate:.1f}%")
            
            pathogen_breakdown_display = " | ".join(pathogen_rates)
            print(f"Multi-fluorophore breakdown: {pathogen_breakdown_display}")
        else:
            # Single fluorophore session
            for fluorophore, breakdown in fluorophore_breakdown.items():
                rate = (breakdown['positive'] / breakdown['total'] * 100) if breakdown['total'] > 0 else 0
                pathogen_target = fluorophore
                if fluorophore == 'Cy5':
                    pathogen_target = 'BVAB3'
                elif fluorophore == 'FAM':
                    pathogen_target = 'BVAB2'
                elif fluorophore == 'HEX':
                    pathogen_target = 'BVAB1'
                pathogen_breakdown_display = f"{pathogen_target}: {rate:.1f}%"
        
        # Extract cycle information from first available well
        cycle_count = None
        cycle_min = None
        cycle_max = None
        
        for well_data in individual_results.values():
            if isinstance(well_data, dict):
                try:
                    # Try different field names for cycle data
                    cycles = well_data.get('raw_cycles') or well_data.get('cycles') or well_data.get('x_data')
                    if isinstance(cycles, list) and len(cycles) > 0:
                        cycle_count = len(cycles)
                        cycle_min = min(cycles)
                        cycle_max = max(cycles)
                        break
                except (ValueError, TypeError):
                    continue
        
        # Default to 33 cycles for this dataset if not found
        if cycle_count is None:
            cycle_count = 33
            cycle_min = 1
            cycle_max = 33
        
        # Check for existing session with same base pattern and overwrite if found
        existing_session = AnalysisSession.query.filter_by(filename=display_name).first()
        
        if existing_session:
            # Delete existing well results for this session
            WellResult.query.filter_by(session_id=existing_session.id).delete()
            
            # Update existing session with new data
            session = existing_session
            session.total_wells = total_wells
            session.good_curves = positive_wells
            session.success_rate = success_rate
            session.cycle_count = cycle_count
            session.cycle_min = cycle_min
            session.cycle_max = cycle_max
            session.pathogen_breakdown = pathogen_breakdown_display
            session.upload_timestamp = datetime.utcnow()
        else:
            # Create new analysis session
            session = AnalysisSession()
            session.filename = display_name
            session.total_wells = total_wells
            session.good_curves = positive_wells
            session.success_rate = success_rate
            session.cycle_count = cycle_count
            session.cycle_min = cycle_min
            session.cycle_max = cycle_max
            session.pathogen_breakdown = pathogen_breakdown_display
            
            db.session.add(session)
        
        db.session.flush()
        
        # Save well results
        well_count = 0
        for well_key, well_data in individual_results.items():
            try:
                # Validate well_data structure
                if not isinstance(well_data, dict):
                    print(f"Warning: well_data for {well_key} is not a dict: {type(well_data)}")
                    continue
                well_result = WellResult()
                well_result.session_id = session.id
                well_result.well_id = well_key
                well_result.is_good_scurve = bool(well_data.get('is_good_scurve', False))
                well_result.r2_score = float(well_data.get('r2_score', 0)) if well_data.get('r2_score') is not None else None
                well_result.rmse = float(well_data.get('rmse', 0)) if well_data.get('rmse') is not None else None
                well_result.amplitude = float(well_data.get('amplitude', 0)) if well_data.get('amplitude') is not None else None
                well_result.steepness = float(well_data.get('steepness', 0)) if well_data.get('steepness') is not None else None
                well_result.midpoint = float(well_data.get('midpoint', 0)) if well_data.get('midpoint') is not None else None
                well_result.baseline = float(well_data.get('baseline', 0)) if well_data.get('baseline') is not None else None
                well_result.data_points = int(well_data.get('data_points', 0)) if well_data.get('data_points') is not None else None
                well_result.cycle_range = float(well_data.get('cycle_range', 0)) if well_data.get('cycle_range') is not None else None
                
                # JSON/text fields - ensure they are converted to JSON strings for database storage
                # Helper function to safely serialize to JSON, avoiding double-encoding
                def safe_json_dumps(value, default=None):
                    if value is None:
                        return None
                    # If already a string, assume it's already JSON-encoded
                    if isinstance(value, str):
                        try:
                            # Validate it's valid JSON
                            json.loads(value)
                            return value
                        except (json.JSONDecodeError, TypeError):
                            # If not valid JSON, treat as a raw string and encode it
                            return json.dumps(value)
                    # Otherwise, serialize the object/list to JSON
                    return json.dumps(value if value is not None else default)
                
                well_result.fit_parameters = safe_json_dumps(well_data.get('fit_parameters'), [])
                well_result.parameter_errors = safe_json_dumps(well_data.get('parameter_errors'), [])
                well_result.fitted_curve = safe_json_dumps(well_data.get('fitted_curve'), [])
                well_result.anomalies = safe_json_dumps(well_data.get('anomalies'), [])
                well_result.raw_cycles = safe_json_dumps(well_data.get('raw_cycles'), [])
                well_result.raw_rfu = safe_json_dumps(well_data.get('raw_rfu'), [])
                
                well_result.sample_name = str(well_data.get('sample_name', '')) if well_data.get('sample_name') else None
                well_result.cq_value = float(well_data.get('cq_value', 0)) if well_data.get('cq_value') is not None else None
                well_result.fluorophore = str(well_data.get('fluorophore', '')) if well_data.get('fluorophore') else None
                
                # Set threshold_value if present
                threshold_value = well_data.get('threshold_value')
                if threshold_value is not None:
                    try:
                        well_result.threshold_value = float(threshold_value)
                    except (ValueError, TypeError):
                        well_result.threshold_value = None
                else:
                    well_result.threshold_value = None
                db.session.add(well_result)
                well_count += 1
                if well_count % 50 == 0:
                    db.session.commit()
            except Exception as well_error:
                print(f"Error saving well {well_key}: {well_error}")
                continue
        
        try:
            db.session.commit()
        except Exception as commit_error:
            db.session.rollback()
            print(f"Forced commit error (combined): {commit_error}")
            raise
        
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



# --- Delete all sessions and their results ---
@app.route('/sessions', methods=['DELETE'])
def delete_all_sessions():
    """Delete all analysis sessions and their results"""
    try:
        num_sessions = AnalysisSession.query.count()
        if num_sessions == 0:
            return jsonify({'message': 'No sessions to delete'}), 200
        # Delete all WellResults first (if not using cascade)
        WellResult.query.delete()
        AnalysisSession.query.delete()
        db.session.commit()
        print(f"[API] Deleted all sessions and well results from database.")
        return jsonify({'message': f'All {num_sessions} sessions deleted successfully'})
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting all sessions: {e}")
        return jsonify({'error': f'Database error: {str(e)}'}), 500

# --- Delete a single session and its results ---
@app.route('/sessions/<int:session_id>', methods=['DELETE'])
def delete_session(session_id):
    """Delete a single analysis session and its results"""
    try:
        # Enable foreign key constraints for SQLite (if applicable)
        from flask import current_app
        from sqlalchemy import text as sql_text
        if current_app.config['SQLALCHEMY_DATABASE_URI'].startswith('sqlite:'):
            db.session.connection().execute(sql_text('PRAGMA foreign_keys = ON;'))
            print('[DEBUG] PRAGMA foreign_keys enabled for SQLite')
        session = AnalysisSession.query.get_or_404(session_id)
        print(f"[DEBUG] Attempting to delete WellResults for session {session_id}")
        num_deleted = WellResult.query.filter_by(session_id=session.id).delete()
        print(f"[DEBUG] Deleted {num_deleted} WellResults for session {session_id}")
        db.session.delete(session)
        db.session.commit()
        print(f"[API] Deleted session {session_id} and its well results.")
        return jsonify({'message': f'Session {session_id} deleted successfully'})
    except Exception as e:
        db.session.rollback()
        import traceback
        tb = traceback.format_exc()
        print(f"[ERROR] Exception deleting session {session_id}: {e}\nTraceback:\n{tb}")
        return jsonify({'error': f'Failed to delete session: {str(e)}', 'traceback': tb}), 500

@app.route('/experiments/statistics', methods=['POST'])
def save_experiment_statistics():
    """Save or update experiment statistics for trend analysis"""
    try:
        # Ensure database tables exist first
        db.create_all()
        
        data = request.get_json()
        
        experiment_name = data.get('experiment_name')
        test_name = data.get('test_name')
        fluorophore_breakdown = data.get('fluorophore_breakdown', {})
        
        if not experiment_name or not test_name:
            return jsonify({'error': 'experiment_name and test_name are required'}), 400
        
        from models import ExperimentStatistics
        success = ExperimentStatistics.create_or_update(
            experiment_name=experiment_name,
            test_name=test_name,
            fluorophore_breakdown=fluorophore_breakdown
        )
        
        if success:
            return jsonify({
                'success': True,
                'message': f'Experiment statistics saved for {experiment_name}'
            })
        else:
            return jsonify({'error': 'Failed to save experiment statistics'}), 500
            
    except Exception as e:
        print(f"Error saving experiment statistics: {e}")
        # Return empty data instead of error to prevent frontend crashes
        return jsonify({
            'success': False,
            'warning': f'Statistics service unavailable: {str(e)}',
            'message': 'Statistics could not be saved'
        })

@app.route('/experiments/statistics', methods=['GET'])
def get_experiment_statistics():
    """Retrieve experiment statistics for trend analysis"""
    try:
        from models import ExperimentStatistics
        
        # Ensure the table exists by attempting to create it
        db.create_all()
        
        # Get query parameters
        test_name = request.args.get('test_name')
        limit = request.args.get('limit', 100, type=int)
        
        query = ExperimentStatistics.query
        
        if test_name:
            query = query.filter_by(test_name=test_name)
        
        experiments = query.order_by(ExperimentStatistics.analysis_timestamp.desc()).limit(limit).all()
        
        # Return empty array if no experiments found
        return jsonify({
            'experiments': [exp.to_dict() for exp in experiments] if experiments else [],
            'total_count': len(experiments)
        })
        
    except Exception as e:
        print(f"Error retrieving experiment statistics: {e}")
        # Return empty data instead of error to prevent frontend crashes
        return jsonify({
            'experiments': [],
            'total_count': 0,
            'warning': f'Statistics service unavailable: {str(e)}'
        })

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

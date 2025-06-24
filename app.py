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
            
            # Map fluorophore to pathogen target for BVAB
            pathogen_mapping = {
                'FAM': 'BVAB2',
                'HEX': 'BVAB1', 
                'Cy5': 'BVAB3'
            }
            
            pathogen_target = pathogen_mapping.get(fluorophore, fluorophore)
            
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
            try:
                # Ensure well_data is a dictionary
                if not isinstance(well_data, dict):
                    print(f"Warning: well_data for {well_key} is not a dict: {type(well_data)}")
                    continue
                
                # Enhanced debugging for problematic wells
                if well_key in ['N20', 'N21', 'N22', 'O1', 'P1']:
                    print(f"\n=== DEBUGGING WELL {well_key} ===")
                    print(f"well_data type: {type(well_data)}")
                    if isinstance(well_data, dict):
                        print(f"well_data keys: {list(well_data.keys())}")
                        
                        # Check each field that could cause the list index error
                        problematic_fields = ['parameter_errors', 'fit_parameters', 'raw_cycles', 'raw_rfu', 'fitted_curve', 'anomalies']
                        for field in problematic_fields:
                            if field in well_data:
                                value = well_data[field]
                                print(f"  {field}: {type(value)}")
                                if isinstance(value, list):
                                    print(f"    LIST length: {len(value)}")
                                    if len(value) > 0:
                                        print(f"    First few items: {[type(x) for x in value[:3]]}")
                                        for i, item in enumerate(value[:2]):
                                            if hasattr(item, '__getitem__'):
                                                try:
                                                    # This might trigger the error
                                                    test_access = item['test'] if isinstance(item, dict) else item[0]
                                                    print(f"    [{i}] dict/list access OK")
                                                except Exception as e:
                                                    print(f"    [{i}] ERROR: {e}")
                                elif isinstance(value, dict):
                                    print(f"    DICT keys: {list(value.keys())}")
                                else:
                                    print(f"    VALUE: {str(value)[:50]}")
                    print("=== END DEBUG ===\n")
                
                well_result = WellResult()
                well_result.session_id = session.id
                well_result.well_id = well_key
                well_result.is_good_scurve = bool(well_data.get('is_good_scurve', False))
                well_result.r2_score = float(well_data.get('r2_score', 0)) if well_data.get('r2_score') is not None else None
                well_result.sample_name = str(well_data.get('sample_name', '')) if well_data.get('sample_name') else None
                well_result.cq_value = float(well_data.get('cq_value', 0)) if well_data.get('cq_value') is not None else None
                
                # Set fluorophore information in fit_parameters - FIXED LIST/DICT HANDLING
                fit_params = well_data.get('fit_parameters', [])
                if isinstance(fit_params, list) and len(fit_params) >= 4:
                    # Analyzer returns list: [L, k, x0, B]
                    # Convert to dict with fluorophore info
                    try:
                        param_dict = {
                            'L': float(fit_params[0]) if len(fit_params) > 0 else 0.0,
                            'k': float(fit_params[1]) if len(fit_params) > 1 else 0.0,
                            'x0': float(fit_params[2]) if len(fit_params) > 2 else 0.0,
                            'B': float(fit_params[3]) if len(fit_params) > 3 else 0.0,
                            'fluorophore': fluorophore
                        }
                        well_result.fit_parameters = json.dumps(param_dict)
                    except (ValueError, TypeError, IndexError):
                        well_result.fit_parameters = json.dumps({'fluorophore': fluorophore})
                elif isinstance(fit_params, dict):
                    # Already a dict, just add fluorophore
                    fit_params['fluorophore'] = fluorophore
                    well_result.fit_parameters = json.dumps(fit_params)
                elif isinstance(fit_params, str):
                    try:
                        parsed_params = json.loads(fit_params)
                        if isinstance(parsed_params, dict):
                            parsed_params['fluorophore'] = fluorophore
                            well_result.fit_parameters = json.dumps(parsed_params)
                        else:
                            well_result.fit_parameters = json.dumps({'fluorophore': fluorophore})
                    except json.JSONDecodeError:
                        well_result.fit_parameters = json.dumps({'fluorophore': fluorophore})
                else:
                    well_result.fit_parameters = json.dumps({'fluorophore': fluorophore})
                
                # Save curve parameters with enhanced error handling
                try:
                    well_result.rmse = float(well_data.get('rmse', 0)) if well_data.get('rmse') is not None else None
                except Exception as e:
                    if well_key in ['N20', 'N21', 'N22', 'O1', 'P1']:
                        print(f"RMSE error for {well_key}: {e}, value: {well_data.get('rmse')} type: {type(well_data.get('rmse'))}")
                    well_result.rmse = None
                
                try:
                    well_result.amplitude = float(well_data.get('amplitude', 0)) if well_data.get('amplitude') is not None else None
                except Exception as e:
                    if well_key in ['N20', 'N21', 'N22', 'O1', 'P1']:
                        print(f"Amplitude error for {well_key}: {e}, value: {well_data.get('amplitude')} type: {type(well_data.get('amplitude'))}")
                    well_result.amplitude = None
                
                try:
                    well_result.steepness = float(well_data.get('steepness', 0)) if well_data.get('steepness') is not None else None
                except Exception as e:
                    if well_key in ['N20', 'N21', 'N22', 'O1', 'P1']:
                        print(f"Steepness error for {well_key}: {e}, value: {well_data.get('steepness')} type: {type(well_data.get('steepness'))}")
                    well_result.steepness = None
                
                try:
                    well_result.midpoint = float(well_data.get('midpoint', 0)) if well_data.get('midpoint') is not None else None
                except Exception as e:
                    if well_key in ['N20', 'N21', 'N22', 'O1', 'P1']:
                        print(f"Midpoint error for {well_key}: {e}, value: {well_data.get('midpoint')} type: {type(well_data.get('midpoint'))}")
                    well_result.midpoint = None
                
                try:
                    well_result.baseline = float(well_data.get('baseline', 0)) if well_data.get('baseline') is not None else None
                except Exception as e:
                    if well_key in ['N20', 'N21', 'N22', 'O1', 'P1']:
                        print(f"Baseline error for {well_key}: {e}, value: {well_data.get('baseline')} type: {type(well_data.get('baseline'))}")
                    well_result.baseline = None
                
                try:
                    well_result.data_points = int(well_data.get('data_points', 0)) if well_data.get('data_points') is not None else None
                except Exception as e:
                    if well_key in ['N20', 'N21', 'N22', 'O1', 'P1']:
                        print(f"Data points error for {well_key}: {e}, value: {well_data.get('data_points')} type: {type(well_data.get('data_points'))}")
                    well_result.data_points = None
                
                try:
                    well_result.cycle_range = float(well_data.get('cycle_range', 0)) if well_data.get('cycle_range') is not None else None
                except Exception as e:
                    if well_key in ['N20', 'N21', 'N22', 'O1', 'P1']:
                        print(f"Cycle range error for {well_key}: {e}, value: {well_data.get('cycle_range')} type: {type(well_data.get('cycle_range'))}")
                    well_result.cycle_range = None
                
                # Save chart data with enhanced validation
                try:
                    # Try multiple field names for cycles data
                    raw_cycles = well_data.get('raw_cycles') or well_data.get('cycles') or well_data.get('x_data', [])
                    if isinstance(raw_cycles, (list, tuple)) and len(raw_cycles) > 0:
                        # Ensure all elements are numeric
                        clean_cycles = []
                        for i, x in enumerate(raw_cycles):
                            try:
                                if x is not None:
                                    clean_cycles.append(float(x))
                            except (ValueError, TypeError):
                                print(f"Error converting cycle value at index {i}: {x} (type: {type(x)})")
                                continue
                        well_result.raw_cycles = json.dumps(clean_cycles)
                    elif isinstance(raw_cycles, str):
                        well_result.raw_cycles = raw_cycles
                    else:
                        well_result.raw_cycles = json.dumps([])
                except Exception as e:
                    print(f"Error processing cycles for {well_key}: {e}")
                    import traceback
                    print(f"Traceback: {traceback.format_exc()}")
                    well_result.raw_cycles = json.dumps([])
                
                try:
                    # Try multiple field names for RFU data
                    raw_rfu = well_data.get('raw_rfu') or well_data.get('rfu') or well_data.get('y_data', [])
                    if isinstance(raw_rfu, (list, tuple)) and len(raw_rfu) > 0:
                        # Ensure all elements are numeric
                        clean_rfu = []
                        for i, x in enumerate(raw_rfu):
                            try:
                                if x is not None:
                                    clean_rfu.append(float(x))
                            except (ValueError, TypeError):
                                if well_key in ['N20', 'N21', 'N22', 'O1', 'P1']:
                                    print(f"RFU conversion error at index {i}: {x} (type: {type(x)})")
                                continue
                        well_result.raw_rfu = json.dumps(clean_rfu)
                    elif isinstance(raw_rfu, str):
                        well_result.raw_rfu = raw_rfu
                    else:
                        well_result.raw_rfu = json.dumps([])
                except Exception as e:
                    print(f"Error processing RFU for {well_key}: {e}")
                    import traceback
                    print(f"RFU Traceback: {traceback.format_exc()}")
                    well_result.raw_rfu = json.dumps([])
                
                # Save additional analysis data with validation - FIXED LIST/DICT HANDLING
                try:
                    param_errors = well_data.get('parameter_errors', [])
                    if isinstance(param_errors, list) and len(param_errors) >= 4:
                        # Analyzer returns list: [L_err, k_err, x0_err, B_err]
                        # Convert to dict with proper error handling
                        try:
                            param_dict = {
                                'L': float(param_errors[0]) if len(param_errors) > 0 else 0.0,
                                'k': float(param_errors[1]) if len(param_errors) > 1 else 0.0,
                                'x0': float(param_errors[2]) if len(param_errors) > 2 else 0.0,
                                'B': float(param_errors[3]) if len(param_errors) > 3 else 0.0
                            }
                            well_result.parameter_errors = json.dumps(param_dict)
                        except (ValueError, TypeError, IndexError) as e:
                            print(f"Error converting parameter_errors list for {well_key}: {e}")
                            well_result.parameter_errors = json.dumps({})
                    elif isinstance(param_errors, dict):
                        # Already a dict, just clean values
                        clean_dict = {}
                        for key, value in param_errors.items():
                            try:
                                clean_dict[str(key)] = float(value) if value is not None else 0.0
                            except (ValueError, TypeError):
                                clean_dict[str(key)] = 0.0
                        well_result.parameter_errors = json.dumps(clean_dict)
                    else:
                        well_result.parameter_errors = json.dumps({})
                except Exception as e:
                    print(f"Error processing parameter_errors for {well_key}: {e}")
                    well_result.parameter_errors = json.dumps({})
                
                try:
                    fitted_curve = well_data.get('fitted_curve', [])
                    if isinstance(fitted_curve, (list, tuple)) and len(fitted_curve) > 0:
                        clean_fitted = []
                        for i, x in enumerate(fitted_curve):
                            try:
                                if x is not None:
                                    clean_fitted.append(float(x))
                            except (ValueError, TypeError):
                                print(f"Error converting fitted_curve value at index {i}: {x} (type: {type(x)})")
                                continue
                        well_result.fitted_curve = json.dumps(clean_fitted)
                    else:
                        well_result.fitted_curve = json.dumps([])
                except Exception as e:
                    print(f"Error processing fitted_curve for {well_key}: {e}")
                    import traceback
                    print(f"Traceback: {traceback.format_exc()}")
                    well_result.fitted_curve = json.dumps([])
                
                try:
                    anomalies = well_data.get('anomalies', [])
                    if isinstance(anomalies, (list, tuple)):
                        well_result.anomalies = json.dumps(list(anomalies))
                    else:
                        well_result.anomalies = json.dumps([])
                except Exception as e:
                    print(f"Error processing anomalies for {well_key}: {e}")
                    well_result.anomalies = json.dumps([])
                
                db.session.add(well_result)
                well_count += 1
                
                if well_count % 50 == 0:
                    db.session.commit()
                    
            except Exception as well_error:
                print(f"Error saving well {well_key}: {well_error}")
                continue
        
        # Final commit
        db.session.commit()
        
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
            
            # Inject fluorophore information into individual well results
            if 'individual_results' in results and fluorophore != 'Unknown':
                for well_key, well_data in results['individual_results'].items():
                    if isinstance(well_data, dict):
                        well_data['fluorophore'] = fluorophore
            
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
        
        # Save individual channel analyses to database for channel tracking
        fluorophore = request.headers.get('X-Fluorophore', 'Unknown')
        is_individual_channel = fluorophore in ['Cy5', 'FAM', 'HEX', 'Texas Red']
        
        if is_individual_channel:
            # Save individual channel session with complete filename
            try:
                database_saved = save_individual_channel_session(filename, results, fluorophore, summary)
                print(f"Individual {fluorophore} channel saved to database: {database_saved}")
            except Exception as save_error:
                print(f"Failed to save individual {fluorophore} channel: {save_error}")
                database_saved = False
        else:
            # For multi-fluorophore analysis, save combined session after all individual channels
            database_saved = False
            print(f"Analysis complete - individual channel for {fluorophore} (part of multi-fluorophore)")
        
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
        sessions_data = []
        
        for session in sessions:
            session_dict = session.to_dict()
            # Include well_results for positive rate calculation
            session_dict['well_results'] = [well.to_dict() for well in session.well_results]
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
                well_result.sample_name = str(well_data.get('sample_name', '')) if well_data.get('sample_name') else None
                well_result.cq_value = float(well_data.get('cq_value', 0)) if well_data.get('cq_value') is not None else None
                
                # Extract fluorophore from well_data or fluorophores list
                fluorophore = well_data.get('fluorophore', 'Unknown')
                
                # If still Unknown, try to get from fluorophores list parameter
                if fluorophore == 'Unknown' and fluorophores_list:
                    fluorophore = fluorophores_list[0] if len(fluorophores_list) == 1 else 'Unknown'
                
                # For multi-fluorophore data, extract from well_key (A1_FAM -> FAM)
                if '_' in well_key:
                    parts = well_key.split('_')
                    if len(parts) > 1:
                        fluorophore = parts[-1]  # Take last part as fluorophore
                
                # Store fluorophore information properly - FIXED LIST/DICT HANDLING
                fit_params = well_data.get('fit_parameters', [])
                if isinstance(fit_params, list) and len(fit_params) >= 4:
                    # Analyzer returns list: [L, k, x0, B] - convert to dict
                    try:
                        param_dict = {
                            'L': float(fit_params[0]) if len(fit_params) > 0 else 0.0,
                            'k': float(fit_params[1]) if len(fit_params) > 1 else 0.0,
                            'x0': float(fit_params[2]) if len(fit_params) > 2 else 0.0,
                            'B': float(fit_params[3]) if len(fit_params) > 3 else 0.0,
                            'fluorophore': fluorophore
                        }
                        well_result.fit_parameters = json.dumps(param_dict)
                    except (ValueError, TypeError, IndexError):
                        well_result.fit_parameters = json.dumps({'fluorophore': fluorophore})
                elif isinstance(fit_params, dict):
                    # Already a dict, just add fluorophore
                    fit_params['fluorophore'] = fluorophore
                    well_result.fit_parameters = json.dumps(fit_params)
                elif isinstance(fit_params, str):
                    try:
                        parsed_params = json.loads(fit_params)
                        if isinstance(parsed_params, dict):
                            parsed_params['fluorophore'] = fluorophore
                            well_result.fit_parameters = json.dumps(parsed_params)
                        else:
                            well_result.fit_parameters = json.dumps({'fluorophore': fluorophore})
                    except json.JSONDecodeError:
                        well_result.fit_parameters = json.dumps({'fluorophore': fluorophore})
                else:
                    well_result.fit_parameters = json.dumps({'fluorophore': fluorophore})
                
                # Save all curve parameters
                well_result.rmse = float(well_data.get('rmse', 0)) if well_data.get('rmse') is not None else None
                well_result.amplitude = float(well_data.get('amplitude', 0)) if well_data.get('amplitude') is not None else None
                well_result.steepness = float(well_data.get('steepness', 0)) if well_data.get('steepness') is not None else None
                well_result.midpoint = float(well_data.get('midpoint', 0)) if well_data.get('midpoint') is not None else None
                well_result.baseline = float(well_data.get('baseline', 0)) if well_data.get('baseline') is not None else None
                well_result.data_points = int(well_data.get('data_points', 0)) if well_data.get('data_points') is not None else None
                well_result.cycle_range = float(well_data.get('cycle_range', 0)) if well_data.get('cycle_range') is not None else None
                
                # Safe chart data processing with enhanced validation
                def safe_process_array_data(data, field_name):
                    """Safely process array data that might be malformed"""
                    if data is None:
                        return json.dumps([])
                    
                    try:
                        # Handle different data types
                        if isinstance(data, dict):
                            # If it's a dict, it might be malformed - skip it
                            print(f"Warning: {field_name} for {well_key} is a dict, expected array")
                            return json.dumps([])
                        elif isinstance(data, (list, tuple)):
                            # Validate all elements are numeric for cycles/rfu
                            clean_data = []
                            for i, item in enumerate(data):
                                try:
                                    if isinstance(item, (int, float)):
                                        clean_data.append(float(item))
                                    elif isinstance(item, str) and item.replace('.', '').replace('-', '').isdigit():
                                        clean_data.append(float(item))
                                except (ValueError, TypeError):
                                    continue
                            return json.dumps(clean_data)
                        elif isinstance(data, str):
                            # Try to parse as JSON first
                            try:
                                parsed = json.loads(data)
                                if isinstance(parsed, list):
                                    return json.dumps(parsed)
                                elif isinstance(parsed, dict):
                                    print(f"Warning: {field_name} for {well_key} parsed to dict, expected array")
                                    return json.dumps([])
                            except json.JSONDecodeError:
                                pass
                            return data if data.startswith('[') else json.dumps([])
                        else:
                            return json.dumps([])
                    except Exception as e:
                        print(f"Error processing {field_name} for {well_key}: {e}")
                        print(f"Data type: {type(data)}, Data: {str(data)[:100]}")
                        return json.dumps([])
                
                try:
                    well_result.raw_cycles = safe_process_array_data(well_data.get('raw_cycles'), 'raw_cycles')
                except Exception as e:
                    print(f"Error in raw_cycles processing for {well_key}: {e}")
                    print(f"Raw cycles data: {well_data.get('raw_cycles')}")
                    well_result.raw_cycles = json.dumps([])
                
                try:
                    well_result.raw_rfu = safe_process_array_data(well_data.get('raw_rfu'), 'raw_rfu')
                except Exception as e:
                    print(f"Error in raw_rfu processing for {well_key}: {e}")
                    print(f"Raw RFU data: {well_data.get('raw_rfu')}")
                    well_result.raw_rfu = json.dumps([])
                
                # Save additional analysis data - FIXED LIST/DICT HANDLING
                try:
                    param_errors = well_data.get('parameter_errors', [])
                    if isinstance(param_errors, list) and len(param_errors) >= 4:
                        # Convert list to dict format
                        param_dict = {
                            'L': float(param_errors[0]) if len(param_errors) > 0 else 0.0,
                            'k': float(param_errors[1]) if len(param_errors) > 1 else 0.0,
                            'x0': float(param_errors[2]) if len(param_errors) > 2 else 0.0,
                            'B': float(param_errors[3]) if len(param_errors) > 3 else 0.0
                        }
                        well_result.parameter_errors = json.dumps(param_dict)
                    elif isinstance(param_errors, dict):
                        well_result.parameter_errors = json.dumps(param_errors)
                    else:
                        well_result.parameter_errors = json.dumps({})
                except Exception as e:
                    print(f"Error processing parameter_errors for {well_key}: {e}")
                    well_result.parameter_errors = json.dumps({})
                
                # fitted_curve and anomalies are already properly formatted as lists
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

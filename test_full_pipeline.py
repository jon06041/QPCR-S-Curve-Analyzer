#!/usr/bin/env python3
"""
Debug script to test the full upload and save pipeline for threshold values
"""

import json
import requests
import numpy as np

def create_test_data():
    """Create realistic qPCR data for testing"""
    cycles = list(range(1, 34))  # 33 cycles
    
    # Create test data for different wells and fluorophores
    test_data = {}
    
    # Generate different curve types
    np.random.seed(42)
    
    for well in ['A01', 'A02', 'A03']:
        for fluorophore in ['FAM', 'HEX']:
            well_key = f"{well}_{fluorophore}"
            
            # Generate different curve characteristics
            if well == 'A01':  # Good curve
                baseline = 10
                amplitude = 800
                midpoint = 18
                steepness = 0.6
            elif well == 'A02':  # Medium curve
                baseline = 8
                amplitude = 400
                midpoint = 22
                steepness = 0.4
            else:  # Weak curve
                baseline = 12
                amplitude = 150
                midpoint = 25
                steepness = 0.3
            
            # Add noise
            noise = np.random.normal(0, 3, len(cycles))
            
            rfu = []
            for cycle in cycles:
                value = baseline + amplitude / (1 + np.exp(-steepness * (cycle - midpoint)))
                rfu.append(value + noise[cycle-1])
            
            test_data[well_key] = {
                'cycles': cycles,
                'rfu': rfu,
                'sampleName': f'Test_{well}_{fluorophore}'
            }
    
    return test_data

def test_upload_endpoint():
    """Test the /analyze endpoint directly"""
    print("=== Testing /analyze endpoint ===")
    
    # Start the server in background for testing
    import subprocess
    import time
    
    # Kill any existing process first
    subprocess.run(['pkill', '-f', 'python.*app.py'], capture_output=True)
    time.sleep(1)
    
    # Start server in background
    print("Starting server...")
    server_process = subprocess.Popen(['python', 'app.py'], 
                                     stdout=subprocess.PIPE, 
                                     stderr=subprocess.PIPE)
    time.sleep(3)  # Give server time to start
    
    try:
        test_data = create_test_data()
        
        # Test individual fluorophore upload
        for fluorophore in ['FAM', 'HEX']:
            print(f"\n--- Testing {fluorophore} upload ---")
            
            # Filter data for this fluorophore
            fluor_data = {k: v for k, v in test_data.items() if k.endswith(f'_{fluorophore}')}
            
            headers = {
                'Content-Type': 'application/json',
                'X-Filename': f'test_data_{fluorophore}.csv',
                'X-Fluorophore': fluorophore
            }
            
            response = requests.post('http://localhost:5004/analyze', 
                                   json=fluor_data, 
                                   headers=headers)
            
            print(f"Status: {response.status_code}")
            if response.status_code == 200:
                result = response.json()
                print(f"Success: {result.get('success')}")
                
                # Check threshold values in individual results
                individual_results = result.get('individual_results', {})
                print(f"Wells analyzed: {len(individual_results)}")
                
                for well_key, well_data in individual_results.items():
                    threshold_val = well_data.get('threshold_value')
                    print(f"  {well_key}: threshold_value = {threshold_val}")
                    if threshold_val is None:
                        print(f"    ERROR: Missing threshold_value!")
                    
            else:
                print(f"Error: {response.text}")
    
    finally:
        # Clean up server process
        server_process.terminate()
        server_process.wait()

def test_database_direct():
    """Test the database saving directly"""
    print("\n=== Testing database save directly ===")
    
    from flask import Flask
    from models import db, AnalysisSession, WellResult
    from qpcr_analyzer import process_csv_data
    
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///qpcr_results.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)
    
    with app.app_context():
        test_data = create_test_data()
        
        # Process data with analyzer
        results = process_csv_data(test_data)
        print(f"Analysis success: {results.get('success')}")
        
        individual_results = results.get('individual_results', {})
        print(f"Wells analyzed: {len(individual_results)}")
        
        # Check threshold values before saving
        for well_key, well_data in individual_results.items():
            threshold_val = well_data.get('threshold_value')
            print(f"  {well_key}: threshold_value = {threshold_val}")
        
        # Save to database
        session = AnalysisSession()
        session.filename = 'test_threshold_debug'
        session.total_wells = len(individual_results)
        session.good_curves = len(results.get('good_curves', []))
        session.success_rate = 50.0
        session.cycle_count = 33
        session.cycle_min = 1
        session.cycle_max = 33
        session.session_type = 'S'
        
        db.session.add(session)
        db.session.flush()
        
        # Save well results
        for well_key, well_data in individual_results.items():
            well_result = WellResult()
            well_result.session_id = session.id
            well_result.well_id = well_key
            well_result.is_good_scurve = well_data.get('is_good_scurve', False)
            
            # Save threshold_value
            try:
                threshold_val = well_data.get('threshold_value')
                well_result.threshold_value = float(threshold_val) if threshold_val is not None else None
                print(f"Saving {well_key}: threshold_value = {well_result.threshold_value}")
            except Exception as e:
                print(f"Error saving threshold for {well_key}: {e}")
                well_result.threshold_value = None
            
            # Set other required fields
            well_result.r2_score = well_data.get('r2_score')
            well_result.amplitude = well_data.get('amplitude')
            well_result.fit_parameters = json.dumps(well_data.get('fit_parameters', []))
            well_result.raw_cycles = json.dumps(well_data.get('raw_cycles', []))
            well_result.raw_rfu = json.dumps(well_data.get('raw_rfu', []))
            
            db.session.add(well_result)
        
        db.session.commit()
        
        # Verify saved data
        print("\nVerifying saved data...")
        saved_wells = WellResult.query.filter_by(session_id=session.id).all()
        for well in saved_wells:
            print(f"  {well.well_id}: threshold_value = {well.threshold_value}")

if __name__ == '__main__':
    test_database_direct()
    test_upload_endpoint()  # Test full endpoint

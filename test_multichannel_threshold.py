#!/usr/bin/env python3
"""
Test to verify that multichannel qPCR sessions save and retrieve threshold values correctly
"""

import json
import numpy as np
from flask import Flask
from models import db, AnalysisSession, WellResult
from qpcr_analyzer import process_csv_data

def create_multichannel_test_data():
    """Create realistic multichannel qPCR data for testing"""
    cycles = list(range(1, 34))  # 33 cycles
    
    # Create test data for different wells and fluorophores
    test_data = {}
    
    np.random.seed(42)
    
    wells = ['A01', 'A02', 'A03', 'B01', 'B02']
    fluorophores = ['FAM', 'HEX', 'Cy5']
    
    for well in wells:
        for fluorophore in fluorophores:
            well_key = f"{well}_{fluorophore}"
            
            # Generate different curve characteristics
            if well in ['A01', 'B01']:  # Good curves
                baseline = 10
                amplitude = 800
                midpoint = 18
                steepness = 0.6
            elif well in ['A02', 'B02']:  # Medium curves
                baseline = 8
                amplitude = 400
                midpoint = 22
                steepness = 0.4
            else:  # Weak curves
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

def test_multichannel_threshold_pipeline():
    """Test the complete multichannel pipeline including threshold values"""
    print("=== Testing Multichannel Threshold Pipeline ===")
    
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///qpcr_results.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)
    
    with app.app_context():
        # Step 1: Create test data
        test_data = create_multichannel_test_data()
        print(f"Created test data for {len(test_data)} wells")
        
        # Step 2: Process data with analyzer
        results = process_csv_data(test_data)
        print(f"Analysis success: {results.get('success')}")
        
        individual_results = results.get('individual_results', {})
        print(f"Wells analyzed: {len(individual_results)}")
        
        # Step 3: Check threshold values in analysis results
        threshold_count = 0
        for well_key, well_data in individual_results.items():
            threshold_val = well_data.get('threshold_value')
            if threshold_val is not None:
                threshold_count += 1
            print(f"  {well_key}: threshold_value = {threshold_val}")
        
        print(f"Wells with threshold values: {threshold_count}/{len(individual_results)}")
        
        # Step 4: Simulate the multichannel save (like /sessions/save-combined)
        fluorophores_list = ['FAM', 'HEX', 'Cy5']
        
        # Calculate statistics
        total_wells = len(individual_results)
        positive_wells = 0
        
        for well_data in individual_results.values():
            amplitude = well_data.get('amplitude', 0)
            if amplitude > 500:
                positive_wells += 1
        
        success_rate = (positive_wells / total_wells * 100) if total_wells > 0 else 0
        
        # Create session
        session = AnalysisSession()
        session.filename = 'Multichannel_Threshold_Test'
        session.total_wells = total_wells
        session.good_curves = positive_wells
        session.success_rate = success_rate
        session.cycle_count = 33
        session.cycle_min = 1
        session.cycle_max = 33
        session.session_type = 'M'  # Multichannel
        session.pathogen_breakdown = f"FAM: 50% | HEX: 50% | Cy5: 50%"
        
        db.session.add(session)
        db.session.flush()
        
        # Step 5: Save well results (like in save_combined_session)
        saved_wells = 0
        saved_thresholds = 0
        
        for well_key, well_data in individual_results.items():
            well_result = WellResult()
            well_result.session_id = session.id
            well_result.well_id = well_key
            well_result.is_good_scurve = bool(well_data.get('is_good_scurve', False))
            well_result.r2_score = float(well_data.get('r2_score', 0)) if well_data.get('r2_score') is not None else None
            well_result.amplitude = float(well_data.get('amplitude', 0)) if well_data.get('amplitude') is not None else None
            
            # Extract fluorophore from well_key
            fluorophore = well_key.split('_')[-1] if '_' in well_key else 'Unknown'
            
            # Save threshold_value (this is the critical part)
            try:
                threshold_val = well_data.get('threshold_value')
                well_result.threshold_value = float(threshold_val) if threshold_val is not None else None
                if well_result.threshold_value is not None:
                    saved_thresholds += 1
                print(f"Saving {well_key}: threshold_value = {well_result.threshold_value}")
            except Exception as e:
                print(f"Error saving threshold for {well_key}: {e}")
                well_result.threshold_value = None
            
            # Set other required fields
            well_result.fit_parameters = json.dumps({'fluorophore': fluorophore})
            well_result.raw_cycles = json.dumps(well_data.get('raw_cycles', []))
            well_result.raw_rfu = json.dumps(well_data.get('raw_rfu', []))
            
            db.session.add(well_result)
            saved_wells += 1
        
        db.session.commit()
        print(f"Saved {saved_wells} wells with {saved_thresholds} threshold values")
        
        # Step 6: Retrieve saved session (like /sessions/<id> endpoint)
        saved_session = AnalysisSession.query.filter_by(filename='Multichannel_Threshold_Test').first()
        if saved_session:
            print(f"\nRetrieved session: {saved_session.filename} (ID: {saved_session.id})")
            print(f"Session type: {saved_session.session_type}")
            
            # Get well results (like the endpoint does)
            wells = WellResult.query.filter_by(session_id=saved_session.id).all()
            
            # Convert to dict (like the endpoint does)
            session_data = saved_session.to_dict()
            wells_data = [well.to_dict() for well in wells]
            
            print(f"Retrieved {len(wells_data)} wells")
            
            # Check threshold values in retrieved data
            retrieved_thresholds = 0
            for well_data in wells_data:
                threshold_val = well_data.get('threshold_value')
                if threshold_val is not None:
                    retrieved_thresholds += 1
                print(f"  {well_data.get('well_id')}: threshold_value = {threshold_val}")
            
            print(f"Wells with threshold values after retrieval: {retrieved_thresholds}/{len(wells_data)}")
            
            # Step 7: Final verification
            if retrieved_thresholds == saved_thresholds:
                print("\n✅ SUCCESS: All threshold values saved and retrieved correctly!")
                return True
            else:
                print(f"\n❌ FAILURE: Expected {saved_thresholds} threshold values, got {retrieved_thresholds}")
                return False
        else:
            print("\n❌ FAILURE: Could not retrieve saved session")
            return False

if __name__ == '__main__':
    success = test_multichannel_threshold_pipeline()
    exit(0 if success else 1)

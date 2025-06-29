#!/usr/bin/env python3
"""
Debug script to test threshold_value calculation in qPCR analysis
"""

import numpy as np
from qpcr_analyzer import analyze_curve_quality, process_csv_data

def test_threshold_calculation():
    """Test that threshold_value is calculated and returned"""
    
    # Create sample qPCR data (sigmoid curve)
    cycles = list(range(1, 34))  # 33 cycles
    
    # Generate realistic qPCR curve data
    baseline = 10
    amplitude = 500
    midpoint = 20
    steepness = 0.5
    
    # Add some noise
    np.random.seed(42)
    noise = np.random.normal(0, 5, len(cycles))
    
    # Sigmoid curve: baseline + amplitude / (1 + exp(-steepness * (x - midpoint)))
    rfu = []
    for cycle in cycles:
        value = baseline + amplitude / (1 + np.exp(-steepness * (cycle - midpoint)))
        rfu.append(value + noise[cycle-1])
    
    print("=== Testing analyze_curve_quality ===")
    result = analyze_curve_quality(cycles, rfu, plot=False)
    
    print(f"Analysis result keys: {list(result.keys())}")
    print(f"threshold_value present: {'threshold_value' in result}")
    if 'threshold_value' in result:
        print(f"threshold_value: {result['threshold_value']}")
    else:
        print("ERROR: threshold_value missing from analysis result!")
    
    print(f"is_good_scurve: {result.get('is_good_scurve')}")
    print(f"r2_score: {result.get('r2_score')}")
    print(f"amplitude: {result.get('amplitude')}")
    
    # Test with process_csv_data
    print("\n=== Testing process_csv_data ===")
    test_data = {
        'A01_HEX': {
            'cycles': cycles,
            'rfu': rfu
        }
    }
    
    batch_result = process_csv_data(test_data)
    print(f"Batch analysis success: {batch_result.get('success')}")
    
    if 'individual_results' in batch_result:
        well_result = batch_result['individual_results']['A01_HEX']
        print(f"Well result keys: {list(well_result.keys())}")
        print(f"threshold_value in well result: {'threshold_value' in well_result}")
        if 'threshold_value' in well_result:
            print(f"Well threshold_value: {well_result['threshold_value']}")
        else:
            print("ERROR: threshold_value missing from well result!")
    
    return result

if __name__ == '__main__':
    test_threshold_calculation()

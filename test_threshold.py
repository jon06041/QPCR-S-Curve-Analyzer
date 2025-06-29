#!/usr/bin/env python3
"""
Test script to check if threshold_value is being calculated and returned properly
"""

import json
from qpcr_analyzer import process_csv_data

# Create sample test data
test_data = {
    'A1_HEX': {
        'cycles': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
        'rfu': [5, 7, 8, 10, 12, 15, 18, 25, 35, 50, 75, 120, 180, 280, 420, 650, 950, 1300, 1650, 1950, 2200, 2400, 2550, 2650, 2700, 2720, 2730, 2735, 2738, 2740]
    }
}

print("Testing threshold_value calculation...")

# Process the test data
results = process_csv_data(test_data)

if results.get('success'):
    print("\nAnalysis successful!")
    individual_results = results.get('individual_results', {})
    
    for well_id, analysis in individual_results.items():
        print(f"\nWell {well_id}:")
        print(f"  is_good_scurve: {analysis.get('is_good_scurve')}")
        print(f"  threshold_value: {analysis.get('threshold_value')}")
        print(f"  amplitude: {analysis.get('amplitude')}")
        print(f"  baseline: {analysis.get('baseline')}")
        
        # Check all keys to see what's available
        print(f"  Available keys: {list(analysis.keys())}")
        
        if 'threshold_value' not in analysis:
            print("  ❌ threshold_value is MISSING!")
        else:
            print("  ✅ threshold_value is present")
else:
    print(f"Analysis failed: {results.get('error')}")

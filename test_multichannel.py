#!/usr/bin/env python3
"""
Test multichannel session saving
"""

import json

def test_multichannel_save():
    print("=== Testing Multichannel Session Save Endpoint ===")
    
    # Check if save-combined endpoint exists
    with open('/Users/jonsniffen/Desktop/MDL pcr-analyzer/app.py', 'r') as f:
        app_content = f.read()
    
    if '/sessions/save-combined' in app_content:
        print("✅ save-combined endpoint exists")
    else:
        print("❌ save-combined endpoint missing")
    
    # Check if threshold_value is being saved
    if 'threshold_value' in app_content:
        print("✅ threshold_value field referenced in app.py")
        
        # Count references
        threshold_refs = app_content.count('threshold_value')
        print(f"   Found {threshold_refs} references to threshold_value")
    else:
        print("❌ threshold_value field not found in app.py")

if __name__ == '__main__':
    test_multichannel_save()

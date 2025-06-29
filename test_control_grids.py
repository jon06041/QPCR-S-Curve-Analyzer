#!/usr/bin/env python3
"""
Test control grid loading
"""

def test_control_grids():
    print("=== Testing Control Grid Logic ===")
    
    # Check if control-grids endpoint exists
    with open('/Users/jonsniffen/Desktop/MDL pcr-analyzer/app.py', 'r') as f:
        app_content = f.read()
    
    if '/control-grids' in app_content:
        print("✅ control-grids endpoint exists")
    else:
        print("❌ control-grids endpoint missing")
    
    # Check for BVAB fallback in control grid logic
    if 'BVAB' in app_content and 'fallback' in app_content.lower():
        print("⚠️  Potential BVAB fallback in control grid logic")
    else:
        print("✅ No obvious BVAB fallback in app.py")

if __name__ == '__main__':
    test_control_grids()

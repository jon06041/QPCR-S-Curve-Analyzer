#!/usr/bin/env python3
"""
Quick test of core issues
"""

print("=== Core Issues Check ===\n")

# 1. Database schema
try:
    import sqlite3
    conn = sqlite3.connect('qpcr_analysis.db')
    cursor = conn.cursor()
    cursor.execute('PRAGMA table_info(well_results)')
    columns = [row[1] for row in cursor.fetchall()]
    threshold_exists = 'threshold_value' in columns
    print(f"1. Database threshold_value column: {'EXISTS' if threshold_exists else 'MISSING'}")
    conn.close()
except Exception as e:
    print(f"1. Database check failed: {e}")

# 2. Save endpoint
with open('app.py', 'r') as f:
    app_content = f.read()
save_endpoint_exists = '/sessions/save-combined' in app_content
threshold_saving = 'well_result.threshold_value' in app_content
print(f"2. Save-combined endpoint: {'EXISTS' if save_endpoint_exists else 'MISSING'}")
print(f"3. Threshold saving logic: {'EXISTS' if threshold_saving else 'MISSING'}")

# 4. BVAB fallbacks
with open('static/script.js', 'r') as f:
    script_content = f.read()
has_bvab_fallback = ": 'BVAB'" in script_content and 'extractTestCode' in script_content
print(f"4. BVAB fallbacks: {'STILL PRESENT' if has_bvab_fallback else 'REMOVED'}")

print("\n=== Summary ===")
print("Ready for testing multichannel uploads to verify threshold values are saved.")

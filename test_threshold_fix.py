#!/usr/bin/env python3
"""
Test threshold value saving in multichannel sessions
"""

print("=== Threshold Value Fix Verification ===\n")

# 1. Check if threshold propagation is called before saving
with open('/Users/jonsniffen/Desktop/MDL pcr-analyzer/static/script.js', 'r') as f:
    script_content = f.read()

# Look for the fix
if 'propagateThresholdsToWells(results.individual_results);' in script_content:
    # Find it in saveCombinedSessionToDatabase context
    lines = script_content.split('\n')
    for i, line in enumerate(lines):
        if 'saveCombinedSessionToDatabase' in line and 'function' in line:
            # Check next 10 lines for the fix
            context = '\n'.join(lines[i:i+10])
            if 'propagateThresholdsToWells(results.individual_results);' in context:
                print("✅ Threshold propagation added before session saving")
                break
    else:
        print("❌ Threshold propagation not found in saveCombinedSessionToDatabase")
else:
    print("❌ Threshold propagation fix not found")

# 2. Check if app.py saves threshold_value 
with open('/Users/jonsniffen/Desktop/MDL pcr-analyzer/app.py', 'r') as f:
    app_content = f.read()

if 'well_result.threshold_value' in app_content and '/sessions/save-combined' in app_content:
    print("✅ Backend saves threshold_value in save-combined endpoint")
else:
    print("❌ Backend threshold_value saving issue")

# 3. Check database schema
try:
    import sqlite3
    conn = sqlite3.connect('/Users/jonsniffen/Desktop/MDL pcr-analyzer/qpcr_analysis.db')
    cursor = conn.cursor()
    
    cursor.execute('PRAGMA table_info(well_results)')
    columns = [row[1] for row in cursor.fetchall()]
    
    if 'threshold_value' in columns:
        print("✅ Database schema supports threshold_value")
    else:
        print("❌ Database missing threshold_value column")
    
    conn.close()
except Exception as e:
    print(f"❌ Database check failed: {e}")

print(f"\n📊 Status: Threshold value saving should now work for multichannel sessions")
print("   Try uploading a multichannel CSV file to test")

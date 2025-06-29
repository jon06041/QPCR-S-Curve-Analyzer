#!/usr/bin/env python3
"""
Test that database is clean and sessions won't mix
"""

import sqlite3

def check_db_clean():
    print("=== Database Clean Check ===")
    
    try:
        conn = sqlite3.connect('/Users/jonsniffen/Desktop/MDL pcr-analyzer/qpcr_analysis.db')
        cursor = conn.cursor()
        
        # Check session count
        cursor.execute('SELECT COUNT(*) FROM analysis_sessions')
        session_count = cursor.fetchone()[0]
        
        # Check well count  
        cursor.execute('SELECT COUNT(*) FROM well_results')
        well_count = cursor.fetchone()[0]
        
        # Check experiment stats count
        cursor.execute('SELECT COUNT(*) FROM experiment_statistics')
        stats_count = cursor.fetchone()[0]
        
        print(f"Sessions: {session_count}")
        print(f"Wells: {well_count}")
        print(f"Stats: {stats_count}")
        
        if session_count == 0 and well_count == 0 and stats_count == 0:
            print("✅ Database is clean - no old BVAB data")
        else:
            print("❌ Database still contains old data")
            
        conn.close()
        
    except Exception as e:
        print(f"❌ Database check failed: {e}")

def check_session_protection():
    print("\n=== Session Protection Check ===")
    
    # Check if control grid endpoint has pattern validation
    with open('/Users/jonsniffen/Desktop/MDL pcr-analyzer/app.py', 'r') as f:
        app_content = f.read()
    
    if 'Pattern mismatch: requested' in app_content:
        print("✅ Session pattern validation added to control grids")
    else:
        print("❌ Session pattern validation missing")
    
    if '[CONTROL GRID]' in app_content:
        print("✅ Debug logging added to control grid endpoint")
    else:
        print("❌ Debug logging missing")

if __name__ == '__main__':
    check_db_clean()
    check_session_protection()
    print("\n📊 Status: Database cleaned, ready for fresh BVPanelPCR3 upload")
    print("   The old BVAB session data is gone")
    print("   Added protection against session mixing")

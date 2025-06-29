#!/usr/bin/env python3
"""
Summary test for all three main issues
"""

def main():
    print("=== qPCR Analyzer Issue Summary ===\n")
    
    # 1. Check BVAB fallbacks
    print("1. BVAB Fallback Check:")
    with open('/Users/jonsniffen/Desktop/MDL pcr-analyzer/static/script.js', 'r') as f:
        script_content = f.read()
    
    bvab_fallback_found = "|| 'BVAB'" in script_content or '|| "BVAB"' in script_content
    print(f"   Status: {'❌ FOUND' if bvab_fallback_found else '✅ CLEAN'}")
    
    # 2. Check multichannel session saving
    print("\n2. Multichannel Session Saving:")
    with open('/Users/jonsniffen/Desktop/MDL pcr-analyzer/app.py', 'r') as f:
        app_content = f.read()
    
    save_endpoint_exists = '/sessions/save-combined' in app_content
    threshold_referenced = 'threshold_value' in app_content
    
    print(f"   save-combined endpoint: {'✅ EXISTS' if save_endpoint_exists else '❌ MISSING'}")
    print(f"   threshold_value refs: {'✅ FOUND' if threshold_referenced else '❌ MISSING'}")
    
    # 3. Check database schema
    print("\n3. Database Schema:")
    try:
        import sqlite3
        conn = sqlite3.connect('/Users/jonsniffen/Desktop/MDL pcr-analyzer/qpcr_analysis.db')
        cursor = conn.cursor()
        
        cursor.execute('PRAGMA table_info(well_results)')
        columns = [row[1] for row in cursor.fetchall()]
        threshold_column_exists = 'threshold_value' in columns
        
        cursor.execute('SELECT COUNT(*) FROM analysis_sessions')
        session_count = cursor.fetchone()[0]
        
        conn.close()
        
        print(f"   threshold_value column: {'✅ EXISTS' if threshold_column_exists else '❌ MISSING'}")
        print(f"   Total sessions: {session_count}")
        
    except Exception as e:
        print(f"   Database check failed: {e}")
    
    print(f"\n📊 Overall Status:")
    print(f"   BVAB fallbacks: {'✅' if not bvab_fallback_found else '❌'}")
    print(f"   Session saving: {'✅' if save_endpoint_exists and threshold_referenced else '❌'}")
    print(f"   Database ready: {'✅' if threshold_column_exists else '❌'}")

if __name__ == '__main__':
    main()

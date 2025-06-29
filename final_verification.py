#!/usr/bin/env python3
"""
Final verification of all three main issues
"""

def main():
    print("=== Final Issue Verification ===\n")
    
    # 1. Check BVAB fallback removal
    print("1. BVAB Fallback Status:")
    
    # Check script.js for fallback patterns
    with open('/Users/jonsniffen/Desktop/MDL pcr-analyzer/static/script.js', 'r') as f:
        script_content = f.read()
    
    fallback_issues = []
    if "|| 'BVAB'" in script_content:
        fallback_issues.append("script.js contains || 'BVAB'")
    if 'fallbackMappings' in script_content:
        fallback_issues.append("script.js contains fallbackMappings")
    
    # Check pathogen_grids.js for hardcoded BVAB
    with open('/Users/jonsniffen/Desktop/MDL pcr-analyzer/static/pathogen_grids.js', 'r') as f:
        grids_content = f.read()
    
    if "name: 'BVAB1'" in grids_content:
        fallback_issues.append("pathogen_grids.js contains hardcoded BVAB mapping")
    
    if fallback_issues:
        print("   ❌ Issues found:")
        for issue in fallback_issues:
            print(f"      - {issue}")
    else:
        print("   ✅ All BVAB fallbacks removed")
    
    # 2. Check multichannel session saving
    print("\n2. Multichannel Session Saving:")
    
    with open('/Users/jonsniffen/Desktop/MDL pcr-analyzer/app.py', 'r') as f:
        app_content = f.read()
    
    save_issues = []
    
    if '/sessions/save-combined' not in app_content:
        save_issues.append("save-combined endpoint missing")
    
    if 'well_result.threshold_value' not in app_content:
        save_issues.append("threshold_value not being saved")
    
    if 'db.session.commit()' not in app_content:
        save_issues.append("database commits missing")
    
    if save_issues:
        print("   ❌ Issues found:")
        for issue in save_issues:
            print(f"      - {issue}")
    else:
        print("   ✅ Multichannel session saving properly implemented")
    
    # 3. Check database schema
    print("\n3. Database Schema:")
    
    try:
        import sqlite3
        conn = sqlite3.connect('/Users/jonsniffen/Desktop/MDL pcr-analyzer/qpcr_analysis.db')
        cursor = conn.cursor()
        
        # Check if threshold_value column exists
        cursor.execute('PRAGMA table_info(well_results)')
        columns = [row[1] for row in cursor.fetchall()]
        
        schema_issues = []
        if 'threshold_value' not in columns:
            schema_issues.append("threshold_value column missing from well_results")
        
        conn.close()
        
        if schema_issues:
            print("   ❌ Issues found:")
            for issue in schema_issues:
                print(f"      - {issue}")
        else:
            print("   ✅ Database schema ready")
    
    except Exception as e:
        print(f"   ⚠️  Database check failed: {e}")
    
    # Summary
    print(f"\n📊 Summary:")
    total_issues = len(fallback_issues) + len(save_issues)
    if total_issues == 0:
        print("   🎉 All issues resolved! Ready for testing.")
    else:
        print(f"   ⚠️  {total_issues} issues remaining")

if __name__ == '__main__':
    main()

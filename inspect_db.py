#!/usr/bin/env python3
"""
Quick database inspection script
"""

import sqlite3
import os

def inspect_database():
    """Quick inspection of the database"""
    
    db_path = '/Users/jonsniffen/Desktop/MDL pcr-analyzer/qpcr_analysis.db'
    
    if not os.path.exists(db_path):
        print("❌ Database file not found")
        return
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        print("=== QUICK DATABASE INSPECTION ===\n")
        
        # Session count
        cursor.execute("SELECT COUNT(*) FROM analysis_sessions")
        session_count = cursor.fetchone()[0]
        print(f"📊 Total sessions: {session_count}")
        
        # Recent sessions
        cursor.execute("""
            SELECT id, filename, upload_timestamp, total_wells 
            FROM analysis_sessions 
            ORDER BY upload_timestamp DESC 
            LIMIT 5
        """)
        recent_sessions = cursor.fetchall()
        
        print("\n📋 Most recent sessions:")
        for session_id, filename, upload_timestamp, total_wells in recent_sessions:
            print(f"  ID {session_id}: {filename} ({total_wells} wells) - {upload_timestamp}")
        
        # Well count
        cursor.execute("SELECT COUNT(*) FROM well_results")
        well_count = cursor.fetchone()[0]
        print(f"\n🧪 Total wells: {well_count}")
        
        # Fluorophore breakdown
        cursor.execute("""
            SELECT fluorophore, COUNT(*) as count
            FROM well_results 
            GROUP BY fluorophore 
            ORDER BY count DESC
        """)
        fluorophores = cursor.fetchall()
        
        print("\n🔬 Fluorophore breakdown:")
        for fluorophore, count in fluorophores:
            print(f"  {fluorophore}: {count} wells")
        
        # Check for BVAB sessions specifically
        cursor.execute("SELECT COUNT(*) FROM analysis_sessions WHERE filename LIKE '%BVAB%'")
        bvab_count = cursor.fetchone()[0]
        if bvab_count > 0:
            print(f"\n⚠️  Found {bvab_count} BVAB sessions in database")
        else:
            print(f"\n✅ No BVAB sessions found")
        
        conn.close()
        
    except sqlite3.Error as e:
        print(f"❌ Database error: {e}")

if __name__ == '__main__':
    inspect_database()

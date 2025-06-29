#!/usr/bin/env python3
"""
Database cleaning script to remove old sessions and prevent BVAB fallbacks
"""

import sqlite3
import os

def clean_database():
    """Clean the qPCR analysis database"""
    
    db_path = '/Users/jonsniffen/Desktop/MDL pcr-analyzer/qpcr_analysis.db'
    
    if not os.path.exists(db_path):
        print("❌ Database file not found at:", db_path)
        return
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Show current database contents
        print("=== CURRENT DATABASE STATE ===")
        
        # Count sessions
        cursor.execute("SELECT COUNT(*) FROM analysis_sessions")
        session_count = cursor.fetchone()[0]
        print(f"📊 Total sessions: {session_count}")
        
        # Show session breakdown by filename pattern
        cursor.execute("""
            SELECT filename, COUNT(*) as count, 
                   MIN(upload_timestamp) as first_created,
                   MAX(upload_timestamp) as last_created
            FROM analysis_sessions 
            GROUP BY filename 
            ORDER BY last_created DESC
        """)
        sessions = cursor.fetchall()
        
        print("\n📋 Sessions by filename:")
        for filename, count, first, last in sessions:
            print(f"  {filename}: {count} sessions (first: {first}, last: {last})")
        
        # Count wells
        cursor.execute("SELECT COUNT(*) FROM well_results")
        well_count = cursor.fetchone()[0]
        print(f"\n🧪 Total wells: {well_count}")
        
        # Show wells by fluorophore
        cursor.execute("""
            SELECT fluorophore, COUNT(*) as count
            FROM well_results 
            GROUP BY fluorophore 
            ORDER BY count DESC
        """)
        fluorophores = cursor.fetchall()
        
        print("\n🔬 Wells by fluorophore:")
        for fluorophore, count in fluorophores:
            print(f"  {fluorophore}: {count} wells")
        
        # Ask user what to clean
        print("\n=== CLEANING OPTIONS ===")
        print("1. Delete all sessions and wells (complete reset)")
        print("2. Delete only BVAB sessions")
        print("3. Delete sessions older than X days")
        print("4. Delete specific sessions by filename pattern")
        print("5. Show detailed session info only (no deletion)")
        print("6. Exit without changes")
        
        choice = input("\nEnter your choice (1-6): ").strip()
        
        if choice == "1":
            # Complete database reset
            if input("⚠️  This will delete ALL data. Type 'CONFIRM' to proceed: ") == "CONFIRM":
                cursor.execute("DELETE FROM well_results")
                cursor.execute("DELETE FROM analysis_sessions")
                print("✅ All sessions and wells deleted")
            else:
                print("❌ Operation cancelled")
                
        elif choice == "2":
            # Delete BVAB sessions only
            cursor.execute("SELECT id, filename FROM analysis_sessions WHERE filename LIKE '%BVAB%'")
            bvab_sessions = cursor.fetchall()
            
            if not bvab_sessions:
                print("✅ No BVAB sessions found")
            else:
                print(f"\n📋 Found {len(bvab_sessions)} BVAB sessions:")
                for session_id, filename in bvab_sessions:
                    print(f"  ID {session_id}: {filename}")
                
                if input("Delete these BVAB sessions? (y/n): ").lower() == 'y':
                    for session_id, _ in bvab_sessions:
                        cursor.execute("DELETE FROM well_results WHERE session_id = ?", (session_id,))
                        cursor.execute("DELETE FROM analysis_sessions WHERE id = ?", (session_id,))
                    print(f"✅ Deleted {len(bvab_sessions)} BVAB sessions")
                else:
                    print("❌ Operation cancelled")
                    
        elif choice == "3":
            # Delete old sessions
            days = input("Delete sessions older than how many days? ")
            try:
                days = int(days)
                cursor.execute("""
                    SELECT id, filename, upload_timestamp FROM analysis_sessions 
                    WHERE upload_timestamp < datetime('now', '-{} days')
                """.format(days))
                old_sessions = cursor.fetchall()
                
                if not old_sessions:
                    print(f"✅ No sessions older than {days} days found")
                else:
                    print(f"\n📋 Found {len(old_sessions)} sessions older than {days} days:")
                    for session_id, filename, upload_timestamp in old_sessions:
                        print(f"  ID {session_id}: {filename} ({upload_timestamp})")
                    
                    if input("Delete these old sessions? (y/n): ").lower() == 'y':
                        for session_id, _, _ in old_sessions:
                            cursor.execute("DELETE FROM well_results WHERE session_id = ?", (session_id,))
                            cursor.execute("DELETE FROM analysis_sessions WHERE id = ?", (session_id,))
                        print(f"✅ Deleted {len(old_sessions)} old sessions")
                    else:
                        print("❌ Operation cancelled")
            except ValueError:
                print("❌ Invalid number of days")
                
        elif choice == "4":
            # Delete by filename pattern
            pattern = input("Enter filename pattern to delete (e.g., '%BVAB%', '%test%'): ")
            cursor.execute("SELECT id, filename FROM analysis_sessions WHERE filename LIKE ?", (pattern,))
            matching_sessions = cursor.fetchall()
            
            if not matching_sessions:
                print(f"✅ No sessions matching pattern '{pattern}' found")
            else:
                print(f"\n📋 Found {len(matching_sessions)} sessions matching '{pattern}':")
                for session_id, filename in matching_sessions:
                    print(f"  ID {session_id}: {filename}")
                
                if input("Delete these sessions? (y/n): ").lower() == 'y':
                    for session_id, _ in matching_sessions:
                        cursor.execute("DELETE FROM well_results WHERE session_id = ?", (session_id,))
                        cursor.execute("DELETE FROM analysis_sessions WHERE id = ?", (session_id,))
                    print(f"✅ Deleted {len(matching_sessions)} sessions")
                else:
                    print("❌ Operation cancelled")
                    
        elif choice == "5":
            # Show detailed info only
            print("\n=== DETAILED SESSION INFO ===")
            cursor.execute("""
                SELECT s.id, s.filename, s.upload_timestamp, s.total_wells, 
                       COUNT(w.id) as actual_wells
                FROM analysis_sessions s
                LEFT JOIN well_results w ON s.id = w.session_id
                GROUP BY s.id, s.filename, s.upload_timestamp, s.total_wells
                ORDER BY s.upload_timestamp DESC
            """)
            detailed_sessions = cursor.fetchall()
            
            for session_id, filename, upload_timestamp, total_wells, actual_wells in detailed_sessions:
                print(f"\n📊 Session ID {session_id}")
                print(f"   Filename: {filename}")
                print(f"   Created: {upload_timestamp}")
                print(f"   Total wells: {total_wells}")
                print(f"   Actual wells in DB: {actual_wells}")
                
                # Show fluorophore breakdown for this session
                cursor.execute("""
                    SELECT fluorophore, COUNT(*) as count
                    FROM well_results 
                    WHERE session_id = ?
                    GROUP BY fluorophore
                """, (session_id,))
                session_fluorophores = cursor.fetchall()
                
                if session_fluorophores:
                    print(f"   Fluorophores: {', '.join([f'{f}({c})' for f, c in session_fluorophores])}")
            
        elif choice == "6":
            print("✅ Exiting without changes")
        else:
            print("❌ Invalid choice")
        
        # Commit changes and show final state
        if choice in ["1", "2", "3", "4"]:
            conn.commit()
            
            print("\n=== FINAL DATABASE STATE ===")
            cursor.execute("SELECT COUNT(*) FROM analysis_sessions")
            final_session_count = cursor.fetchone()[0]
            print(f"📊 Final session count: {final_session_count}")
            
            cursor.execute("SELECT COUNT(*) FROM well_results")
            final_well_count = cursor.fetchone()[0]
            print(f"🧪 Final well count: {final_well_count}")
        
        conn.close()
        print("✅ Database connection closed")
        
    except sqlite3.Error as e:
        print(f"❌ Database error: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")

if __name__ == '__main__':
    clean_database()

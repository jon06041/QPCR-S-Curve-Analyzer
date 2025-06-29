#!/usr/bin/env python3
"""
Migration script to add session_type column to analysis_sessions table.
This column will store 'S' for single/individual channel sessions and 'M' for multi-channel sessions.
"""

import sqlite3
import os

# Database path
DB_PATH = os.path.join(os.path.dirname(__file__), 'qpcr_analysis.db')

def add_session_type_column():
    """Add session_type column to analysis_sessions table"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Check if column already exists
        cursor.execute("PRAGMA table_info(analysis_sessions)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'session_type' not in columns:
            print("Adding session_type column to analysis_sessions table...")
            cursor.execute("ALTER TABLE analysis_sessions ADD COLUMN session_type VARCHAR(1)")
            
            # Populate existing sessions with default values based on filename patterns
            print("Populating existing sessions with session type values...")
            
            # Get all existing sessions
            cursor.execute("SELECT id, filename FROM analysis_sessions")
            sessions = cursor.fetchall()
            
            for session_id, filename in sessions:
                # Determine session type based on filename pattern
                if 'Multi-Fluorophore' in filename or '(' in filename:
                    # Old multi-fluorophore format or individual with fluorophore in parentheses
                    session_type = 'M' if 'Multi-Fluorophore' in filename else 'S'
                else:
                    # Default to single for simple patterns
                    session_type = 'S'
                
                cursor.execute("UPDATE analysis_sessions SET session_type = ? WHERE id = ?", 
                             (session_type, session_id))
                print(f"  Session {session_id} ({filename}) -> {session_type}")
            
            conn.commit()
            print("Migration completed successfully!")
            
        else:
            print("session_type column already exists, skipping migration.")
            
    except Exception as e:
        print(f"Error during migration: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    add_session_type_column()

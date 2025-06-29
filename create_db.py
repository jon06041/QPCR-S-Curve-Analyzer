#!/usr/bin/env python3
"""
Script to create database tables with proper session_type column
"""
from app import app, db

if __name__ == '__main__':
    with app.app_context():
        # Drop all tables and recreate
        db.drop_all()
        db.create_all()
        print("Database tables created successfully")
        
        # Verify the schema
        import sqlite3
        conn = sqlite3.connect('qpcr_analysis.db')
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(analysis_sessions);")
        columns = cursor.fetchall()
        
        print("\nAnalysisSession table columns:")
        for col in columns:
            print(f"  {col[1]} ({col[2]})")
        
        conn.close()

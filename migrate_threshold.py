"""
Database Migration Script: Add threshold_value to WellResult table

This script adds the threshold_value column to the well_results table
to store threshold values for chart rendering performance.

Run this script after updating the models.py file.
"""

from flask import Flask
from models import db

def create_app():
    """Create Flask app for migration"""
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///qpcr_results.db'  # Update as needed
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    db.init_app(app)
    return app

def migrate_database():
    """Add threshold_value column to existing database"""
    app = create_app()
    
    with app.app_context():
        try:
            # Create all tables if they don't exist
            db.create_all()
            print("Database tables created/verified")
            
            # Check if threshold_value column already exists using text() for newer SQLAlchemy
            from sqlalchemy import text
            result = db.session.execute(text("PRAGMA table_info(well_results)"))
            columns = [row[1] for row in result]
            
            if 'threshold_value' not in columns:
                print("Adding threshold_value column to well_results table...")
                db.session.execute(text("ALTER TABLE well_results ADD COLUMN threshold_value FLOAT"))
                db.session.commit()
                print("Migration completed successfully!")
            else:
                print("threshold_value column already exists in well_results table.")
                
        except Exception as e:
            print(f"Migration failed: {e}")
            db.session.rollback()
            raise

if __name__ == '__main__':
    migrate_database()

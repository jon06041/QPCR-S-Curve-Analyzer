# qPCR S-Curve Analyzer - GitHub Deployment

## Quick Start
1. Clone this repository
2. Install dependencies: `pip install -r requirements.txt`
3. Run: `python app.py`

## Database Setup
- PostgreSQL: Set DATABASE_URL environment variable
- SQLite: Automatic fallback for development

## Production Deployment
- Railway: Ready with Procfile and requirements.txt
- Heroku: Compatible with Python buildpack
- No Docker needed - standard Python deployment

## Latest Updates (June 21, 2025)
- Complete database storage for all curve parameters
- Multi-user history support with full chart data
- Enhanced fluorophore analysis (Cy5, FAM, HEX)
- Fixed chart restoration from database sessions
- Removed Docker dependencies for simplified deployment
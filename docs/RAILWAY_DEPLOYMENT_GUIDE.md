# qPCR Analyzer v2.0 - Railway Deployment Guide

## Quick Deployment Steps

1. **Extract Package**
   ```bash
   unzip qpcr-analyzer-production-v2.0-*.zip
   cd qpcr-analyzer-production-v2.0/
   ```

2. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "qPCR Analyzer v2.0 - Production Release"
   git remote add origin https://github.com/yourusername/qpcr-analyzer.git
   git push -u origin main
   ```

3. **Deploy to Railway**
   - Visit railway.app and create new project
   - Connect your GitHub repository
   - Railway auto-detects railway.toml configuration
   - Deploy automatically starts

## Configuration Files Included

- `railway.toml` - Railway deployment configuration
- `requirements-railway.txt` - Python dependencies
- `runtime.txt` - Python version specification
- `Procfile` - Process definition for Railway

## Key Features in v2.0

✓ Patient/control separation: (patient_pos / patient_wells) * 100
✓ Universal pathogen control grids for all test types
✓ Analysis Summary consistency with stored database values
✓ Complete Railway deployment readiness
✓ Enhanced control validation system
✓ Professional tabbed pathogen interface

## Database Notes

- Development: Uses SQLite (qpcr_analysis.db)
- Production: Railway auto-configures PostgreSQL
- All database operations handle both database types automatically

## Support

For issues or questions, refer to the README.md and replit.md files included in this package.

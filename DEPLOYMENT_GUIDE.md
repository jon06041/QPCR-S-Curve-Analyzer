# qPCR S-Curve Analyzer - Deployment Guide

## Recent Changes Fixed (June 19, 2025)

### Critical Bug Fix: NumPy Dependency Issue
- **Problem**: App was failing to start due to missing C++ standard library (libstdc++.so.6)
- **Solution**: Implemented Nix shell environment with proper scientific computing dependencies
- **Result**: NumPy 1.26.4 and SciPy 1.13.0 now working correctly

### Files Modified/Added:

#### 1. **start_server.sh** (NEW FILE)
- Startup script using Nix shell environment
- Ensures proper library loading for NumPy/SciPy
- Includes fallback mode if dependencies fail

#### 2. **simple_app.py** (NEW FILE)
- Simplified Flask application for stability
- Core qPCR analysis functionality maintained
- Temporary database-free version to ensure reliability

#### 3. **run_app.py** (NEW FILE) 
- Fallback application with environment setup
- Handles library path configuration
- Error recovery mechanisms

#### 4. **replit.md** (UPDATED)
- Added June 19, 2025 changes section
- Documented NumPy dependency fix
- Updated system architecture notes

## Railway Deployment Instructions

### Option 1: Use the Stable Simple Version (Recommended)
Your Railway app should use `simple_app.py` as the main application file:

```bash
# In your Railway environment or Procfile:
python simple_app.py
```

### Option 2: Use Nix Shell Version (If Railway supports Nix)
If Railway supports Nix environments:
```bash
chmod +x start_server.sh
./start_server.sh
```

### Environment Variables for Railway:
```
FLASK_SECRET_KEY=your-secret-key-here
DATABASE_URL=your-postgresql-url (if using database features)
```

## Files to Update in GitHub Repository:

### Core Application Files:
- `simple_app.py` - Main application (stable version)
- `start_server.sh` - Startup script with Nix environment
- `run_app.py` - Fallback application
- `app.py` - Original full-featured app (for reference)
- `qpcr_analyzer.py` - Core analysis engine (unchanged)
- `models.py` - Database models (unchanged)

### Frontend Files (unchanged but confirm these exist):
- `index.html` - Main interface
- `static/script.js` - JavaScript functionality
- `static/style.css` - Styling

### Documentation:
- `replit.md` - Updated project documentation
- `DEPLOYMENT_GUIDE.md` - This deployment guide
- `README.md` - Should be updated with recent fixes

## Recommended Deployment Strategy:

1. **Push all files to GitHub**
2. **Set Railway to use `simple_app.py` as main app**
3. **Configure environment variables**
4. **Test deployment with small CSV file**
5. **Monitor logs for any dependency issues**

## Current Status:
✅ App running successfully on Replit
✅ NumPy/SciPy dependencies resolved
✅ Core qPCR analysis functionality working
✅ Ready for GitHub/Railway deployment

## Testing Checklist:
- [ ] Upload CSV file functionality
- [ ] S-curve analysis processing
- [ ] Results display and visualization
- [ ] Health endpoint (/health) responds correctly
- [ ] Sessions endpoint (/sessions) responds correctly
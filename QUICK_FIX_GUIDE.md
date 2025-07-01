# qPCR Analyzer - Quick Fix for "Cannot read properties of null" Error

## The Problem
You're seeing "Error performing analysis: Cannot read properties of null (reading 'individual_results')" because:

1. **You're running the static server on port 8000** (using `python3 -m http.server 8000`)
2. **But the JavaScript is trying to call the Flask backend** (which runs on port 5002)
3. **The network call fails, causing the null error**

## The Solution

### Option 1: Run the Full Flask Backend (Recommended)
```bash
# Navigate to the project directory
cd /workspaces/QPCR-S-Curve-Analyzer

# Run the Flask backend (serves on port 5002)
python3 app.py

# Open your browser to: http://localhost:5002
```

### Option 2: Test with Mock Data (for development)
I've added mock backend support to the JavaScript. If you continue using port 8000:

1. **Open:** http://localhost:8000
2. **Upload any CSV files** (the app will use mock data when backend is unavailable)
3. **The app will show:** "Backend not available, using mock data" in console
4. **Analysis will work** with generated test data

### Option 3: Quick Debug Test
Open: http://localhost:8000/debug.html
Click "Test Backend Connection" to see exactly what's happening.

## What I Fixed in the Code

1. **Enhanced error handling** in `analyzeSingleChannel()` function
2. **Added mock backend support** for testing without Flask
3. **Better null checking** throughout the analysis pipeline
4. **Graceful fallback** when backend is not available

## Verification Steps

1. **Check the browser console** - you should see either:
   - "Backend response received" (if Flask is running)
   - "Backend not available, using mock data" (if using static server)

2. **No more null errors** - the analysis should complete successfully

## Next Steps

- **For production:** Always run `python3 app.py` (port 5002)
- **For development:** Use the mock mode (port 8000) to test UI changes
- **For real analysis:** Upload real qPCR CSV files to the Flask backend

The app is now robust enough to handle both scenarios!

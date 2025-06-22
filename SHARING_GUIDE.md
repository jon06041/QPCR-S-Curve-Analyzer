# Sharing Your qPCR Analyzer for Testing

## Quick Share Options

### Option 1: Replit Share (Fastest)
1. Click the "Share" button in Replit
2. Set to "Public" or "Unlisted" 
3. Copy the share link
4. Send to your testers: `https://replit.com/@yourusername/qpcr-analyzer`

### Option 2: Deploy to Railway (Recommended for Testing)
1. Sign up at [railway.app](https://railway.app)
2. Click "Deploy from GitHub repo"
3. Connect your GitHub account
4. Select your qPCR analyzer repository
5. Add PostgreSQL database from Railway marketplace
6. Share the generated URL: `https://your-app-name.up.railway.app`

### Option 3: Deploy to Render (Stable)
1. Sign up at [render.com](https://render.com)
2. Create "Web Service" from GitHub
3. Add PostgreSQL database
4. Share URL: `https://your-app-name.onrender.com`

## Testing Instructions for Your Team

### What to Tell Testers:
"Please test this qPCR curve analyzer with your CFX Manager data:

1. **Export your data**: 
   - Open .pcrd file in CFX Manager
   - Go to "Quantification" tab
   - Export → All Data Sheets → CSV
   - **Important**: Upload the "Quantification Amplification Results" CSV file

2. **Upload and analyze**:
   - Visit: [your-app-url]
   - Drag/drop your Quantification Amplification Results CSV file
   - Click "Analyze Data"

3. **Check results**:
   - Look for green ✓ (good curves) vs red ✗ (poor curves)
   - Click individual wells to see detailed analysis
   - Try "Show All Wells" to see overlay view

4. **Test features**:
   - Analysis history (past runs are saved)
   - Export results as CSV
   - Mobile/tablet compatibility

5. **Report issues**:
   - Any errors or unexpected behavior
   - Files that don't upload properly
   - Results that seem incorrect"

## Files They Can Test With:
- 30-45 cycle qPCR runs
- 96-well or 384-well plates
- CFX Manager CSV exports
- Different fluorophores/dyes

## What to Expect:
- Database stores all analyses for team access
- Handles variable cycle counts automatically
- Interactive S-curve visualization
- Export capabilities for further analysis
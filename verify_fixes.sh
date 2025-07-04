#!/bin/bash

# QPCR S-Curve Analyzer - Fix Verification Script
# Run this script to verify which fixes are actually working

echo "🔍 QPCR ANALYZER - FIX VERIFICATION SYSTEM"
echo "==========================================="
echo ""
echo "This script helps verify which fixes are actually working vs just claimed to be fixed."
echo ""

# Check if the app is running
echo "📊 CHECKING APPLICATION STATUS..."
if curl -s http://localhost:5000 > /dev/null 2>&1; then
    echo "✅ App is running on port 5000"
elif curl -s http://localhost:5002 > /dev/null 2>&1; then
    echo "✅ App is running on port 5002"
elif curl -s http://localhost:8000 > /dev/null 2>&1; then
    echo "✅ Static server running on port 8000"
else
    echo "❌ App is not running. Start it first with:"
    echo "   python app.py  (for Flask backend)"
    echo "   OR"
    echo "   python -m http.server 8000  (for static testing)"
fi
echo ""

# Check for critical files
echo "📁 CHECKING CRITICAL FILES..."
if [ -f "static/script.js" ]; then
    echo "✅ static/script.js exists"
    # Check for syntax errors
    if node -c static/script.js > /dev/null 2>&1; then
        echo "✅ static/script.js has no syntax errors"
    else
        echo "❌ static/script.js has syntax errors!"
        echo "🔧 Run: node -c static/script.js"
    fi
else
    echo "❌ static/script.js missing!"
fi

if [ -f "Agent_instructions.md" ]; then
    echo "✅ Agent_instructions.md exists"
else
    echo "❌ Agent_instructions.md missing!"
fi

if [ -f "qpcr_analysis.db" ]; then
    echo "✅ Database file exists"
    db_size=$(stat -f%z qpcr_analysis.db 2>/dev/null || stat -c%s qpcr_analysis.db 2>/dev/null)
    if [ "$db_size" -gt 1000 ]; then
        echo "✅ Database has data ($db_size bytes)"
    else
        echo "⚠️  Database might be empty ($db_size bytes)"
    fi
else
    echo "❌ Database file missing!"
fi
echo ""

# Check git status
echo "📋 CHECKING GIT STATUS..."
echo "Current branch: $(git branch --show-current)"
echo "Uncommitted changes:"
git status --porcelain | wc -l | awk '{print $1 " files modified"}'
echo ""

# Check for critical functions in script.js
echo "🔍 CHECKING FOR CRITICAL FUNCTIONS..."
if grep -q "emergencyReset" static/script.js; then
    echo "✅ emergencyReset() function found"
else
    echo "❌ emergencyReset() function missing!"
fi

if grep -q "setAnalysisResults" static/script.js; then
    echo "✅ setAnalysisResults() function found"
else
    echo "❌ setAnalysisResults() function missing!"
fi

if grep -q "displayHistorySession" static/script.js; then
    echo "✅ displayHistorySession() function found"
else
    echo "❌ displayHistorySession() function missing!"
fi

if grep -q "getCurrentFullPattern" static/script.js; then
    pattern_count=$(grep -c "function getCurrentFullPattern" static/script.js)
    if [ "$pattern_count" -eq 1 ]; then
        echo "✅ getCurrentFullPattern() function found (single version)"
    elif [ "$pattern_count" -gt 1 ]; then
        echo "❌ Multiple getCurrentFullPattern() functions found ($pattern_count)!"
    else
        echo "❌ getCurrentFullPattern() function missing!"
    fi
else
    echo "❌ getCurrentFullPattern() function missing!"
fi
echo ""

echo "🎯 MANUAL TESTING CHECKLIST:"
echo "1. Open the app in browser"
echo "2. Test emergency reset button (🔄 RESET EVERYTHING)"
echo "3. Upload a single-channel experiment file"
echo "4. Verify pattern recognition shows correct experiment name"
echo "5. Check that statistics display correctly"
echo "6. Upload a multi-channel experiment file"
echo "7. Verify all channels process correctly"
echo "8. Test loading from history"
echo "9. Verify no data contamination between experiments"
echo ""

echo "📝 UPDATE Agent_instructions.md with verification results!"
echo "🔄 Only mark fixes as 'VERIFIED' after testing confirms they work!"

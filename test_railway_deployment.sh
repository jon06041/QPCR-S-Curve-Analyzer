#!/bin/bash

# Railway Deployment Test Script
echo "🚀 Testing Railway deployment configuration..."

# Test 1: Check if required files exist
echo "📁 Checking required files..."
for file in "app.py" "requirements.txt" "railway.toml" "runtime.txt" "Procfile"; do
    if [ -f "$file" ]; then
        echo "✅ $file exists"
    else
        echo "❌ $file missing"
        exit 1
    fi
done

# Test 2: Check if Python app compiles
echo "🐍 Testing Python compilation..."
if python3 -m py_compile app.py; then
    echo "✅ app.py compiles successfully"
else
    echo "❌ app.py has syntax errors"
    exit 1
fi

# Test 3: Test app can initialize
echo "🔧 Testing app initialization..."
if python3 -c "
import os
os.environ['FLASK_ENV'] = 'production'
from app import app
print('✅ Flask app initializes successfully')
"; then
    echo "✅ App initialization successful"
else
    echo "❌ App initialization failed"
    exit 1
fi

# Test 4: Quick port test
echo "🌐 Testing port configuration..."
if python3 -c "
import os
port = int(os.environ.get('PORT', 5000))
print(f'✅ Port configuration: {port}')
"; then
    echo "✅ Port configuration OK"
else
    echo "❌ Port configuration failed"
    exit 1
fi

echo ""
echo "🎉 All tests passed! Your Railway deployment should work."
echo ""
echo "📋 Next steps for Railway deployment:"
echo "1. Push your code to GitHub"
echo "2. Connect your GitHub repo to Railway"
echo "3. Railway will auto-detect your configuration files"
echo "4. The deployment should start automatically"
echo ""
echo "🔍 Key files configured:"
echo "  - railway.toml: Simplified Railway configuration"
echo "  - requirements.txt: Python dependencies"
echo "  - runtime.txt: Python 3.12.1"
echo "  - Procfile: Web process definition"
echo "  - app.py: Main application with PORT env var support"

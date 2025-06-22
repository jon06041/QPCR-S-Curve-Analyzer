#!/bin/bash

# Start qPCR Flask Server with proper library environment
echo "Setting up qPCR Flask Server environment..."

# Create a Nix shell with all necessary dependencies
nix-shell -p python311 python311Packages.numpy python311Packages.scipy python311Packages.matplotlib python311Packages.scikit-learn python311Packages.pandas python311Packages.flask python311Packages.flask-sqlalchemy python311Packages.psycopg2 gcc stdenv.cc.cc.lib glibc --run "
export LD_LIBRARY_PATH=\$NIX_CC/lib:\$LD_LIBRARY_PATH
echo 'Testing NumPy import...'
python3 -c 'import numpy; print(\"NumPy version:\", numpy.__version__)' || {
    echo 'NumPy test failed, starting fallback mode...'
    python3 run_app.py
    exit 0
}

echo 'NumPy working correctly, starting application...'
python3 app.py
"
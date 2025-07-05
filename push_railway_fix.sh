#!/bin/bash
cd /workspaces/QPCR-S-Curve-Analyzer

echo "Current git status:"
git status

echo "Current branch:"
git branch

echo "Attempting to add Railway deployment files..."
git add railway.toml requirements.txt requirements-railway.txt runtime.txt test_railway_deployment.sh

echo "Committing changes..."
git commit -m "Fix Railway deployment configuration - simplified and working"

echo "Pushing to remote..."
git push origin fix/threshold-integrity-stats

echo "Done!"

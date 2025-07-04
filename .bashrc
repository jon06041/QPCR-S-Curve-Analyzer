#!/bin/bash

# Auto-run agent onboarding for new agents
# This runs every time a new shell session starts

ONBOARDING_FLAG="/tmp/.agent_onboarded_$$"

if [ ! -f "$ONBOARDING_FLAG" ]; then
    echo "🤖 NEW AGENT SESSION DETECTED - RUNNING ONBOARDING..."
    echo ""
    
    # Run the onboarding script
    if [ -f "/workspaces/QPCR-S-Curve-Analyzer/agent_onboarding.sh" ]; then
        chmod +x "/workspaces/QPCR-S-Curve-Analyzer/agent_onboarding.sh"
        "/workspaces/QPCR-S-Curve-Analyzer/agent_onboarding.sh"
        
        # Create flag to prevent re-running in same session
        touch "$ONBOARDING_FLAG"
        
        echo ""
        echo "📋 Quick Reference:"
        echo "- Main docs: Agent_instructions.md"
        echo "- Emergency reset: Call emergencyReset() before history operations"
        echo "- Safe data handling: Use setAnalysisResults() not direct assignment"
        echo ""
    else
        echo "⚠️  Onboarding script not found at expected location"
    fi
fi

# Set working directory
cd /workspaces/QPCR-S-Curve-Analyzer 2>/dev/null || true

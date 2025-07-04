#!/bin/bash

# Quick Agent Setup - Run this to trigger onboarding immediately
# Usage: ./trigger_agent_onboarding.sh

echo "🤖 TRIGGERING AGENT ONBOARDING..."
echo "=================================="

# Make sure we're in the right directory
cd "$(dirname "$0")"

# Run the onboarding script
if [ -f "agent_onboarding.sh" ]; then
    chmod +x agent_onboarding.sh
    ./agent_onboarding.sh
else
    echo "❌ agent_onboarding.sh not found!"
    exit 1
fi

echo ""
echo "✅ Onboarding completed!"
echo ""
echo "🔗 QUICK SETUP:"
echo "1. Source the auto-startup: source auto_agent_startup.sh"
echo "2. Open new terminal (will auto-run onboarding)"
echo "3. Use VS Code tasks: Ctrl+Shift+P → 'Run Task' → '🚨 Run Agent Onboarding'"
echo ""
echo "📚 Remember: Read Agent_instructions.md completely before proceeding!"

#!/usr/bin/env python3
"""
Test script to verify BVAB fallback removal and proper error handling
"""

import re

def check_bvab_fallbacks():
    """Check for remaining BVAB fallbacks in the codebase"""
    
    # Check script.js for problematic fallbacks
    with open('/Users/jonsniffen/Desktop/MDL pcr-analyzer/static/script.js', 'r') as f:
        script_content = f.read()
    
    # Look for BVAB fallbacks
    fallback_patterns = [
        r"|| 'BVAB'",
        r"|| \"BVAB\"",
        r"defaulting to BVAB",
        r"fallback.*BVAB"
    ]
    
    issues_found = []
    
    for pattern in fallback_patterns:
        matches = re.finditer(pattern, script_content, re.IGNORECASE)
        for match in matches:
            line_num = script_content[:match.start()].count('\n') + 1
            issues_found.append(f"Line {line_num}: {match.group()}")
    
    # Check for proper error handling
    error_handling_patterns = [
        r"console\.warn.*Failed to extract test code",
        r"console\.error.*No valid experiment pattern",
        r"alert.*Unable to determine experiment pattern"
    ]
    
    error_handling_found = []
    for pattern in error_handling_patterns:
        matches = re.finditer(pattern, script_content, re.IGNORECASE)
        for match in matches:
            line_num = script_content[:match.start()].count('\n') + 1
            error_handling_found.append(f"Line {line_num}: Found proper error handling")
    
    # Check pathogen_library.js for new functions
    with open('/Users/jonsniffen/Desktop/MDL pcr-analyzer/static/pathogen_library.js', 'r') as f:
        pathogen_content = f.read()
    
    new_functions = [
        'getRequiredChannels',
        'hasRequiredChannels'
    ]
    
    functions_found = []
    for func in new_functions:
        if func in pathogen_content:
            functions_found.append(f"✅ {func} function added")
        else:
            functions_found.append(f"❌ {func} function missing")
    
    print("=== BVAB Fallback Removal Verification ===\n")
    
    if issues_found:
        print("❌ BVAB fallbacks still found:")
        for issue in issues_found:
            print(f"  {issue}")
    else:
        print("✅ No BVAB fallbacks found!")
    
    print(f"\n🔍 Error handling implementations:")
    for handling in error_handling_found:
        print(f"  {handling}")
    
    print(f"\n📚 New pathogen library functions:")
    for func in functions_found:
        print(f"  {func}")
    
    # Check for dynamic channel validation
    if 'getRequiredChannels(testCode)' in script_content:
        print("\n✅ Dynamic channel validation implemented")
    else:
        print("\n❌ Dynamic channel validation not found")
    
    if 'requiredChannels.every(channel => availableChannels.includes(channel))' in script_content:
        print("✅ Proper channel requirement checking implemented")
    else:
        print("❌ Channel requirement checking not implemented")

    print(f"\n📊 Summary:")
    print(f"  - BVAB fallbacks removed: {'✅' if not issues_found else '❌'}")
    print(f"  - Error handling added: {'✅' if error_handling_found else '❌'}")
    print(f"  - Dynamic validation: {'✅' if 'getRequiredChannels' in script_content else '❌'}")

if __name__ == '__main__':
    check_bvab_fallbacks()

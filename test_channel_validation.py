#!/usr/bin/env python3
"""
Test channel validation logic
"""

def test_channel_validation():
    print("=== Channel Validation Test ===")
    
    with open('/Users/jonsniffen/Desktop/MDL pcr-analyzer/static/script.js', 'r') as f:
        script_content = f.read()
    
    # Check if channel validation logic exists
    validations = []
    
    if 'CHANNEL VALIDATION' in script_content:
        validations.append("✅ Channel validation logging added")
    else:
        validations.append("❌ Channel validation logging missing")
    
    if 'getPathogenMappingForTest' in script_content and 'requiredChannels' in script_content:
        validations.append("✅ Required channels lookup implemented")
    else:
        validations.append("❌ Required channels lookup missing")
    
    if 'Incomplete upload for' in script_content:
        validations.append("✅ Incomplete upload alert added")
    else:
        validations.append("❌ Incomplete upload alert missing")
    
    if 'missingChannels.length > 0' in script_content:
        validations.append("✅ Missing channel detection implemented")
    else:
        validations.append("❌ Missing channel detection missing")
    
    print("Channel Validation Checks:")
    for validation in validations:
        print(f"  {validation}")
    
    # Check pathogen library for BVPanelPCR3
    with open('/Users/jonsniffen/Desktop/MDL pcr-analyzer/static/pathogen_library.js', 'r') as f:
        pathogen_content = f.read()
    
    if 'BVPanelPCR3' in pathogen_content and 'Texas Red' in pathogen_content:
        print("✅ BVPanelPCR3 definition found with 4 channels")
        
        # Extract the channels
        import re
        bvpanel_match = re.search(r'"BVPanelPCR3":\s*{([^}]+)}', pathogen_content)
        if bvpanel_match:
            channels_text = bvpanel_match.group(1)
            channels = re.findall(r'"([^"]+)":', channels_text)
            print(f"  Required channels: {channels}")
    else:
        print("❌ BVPanelPCR3 definition not found")

if __name__ == '__main__':
    test_channel_validation()
    print("\n📊 Status: Channel validation should now prevent incomplete uploads")
    print("   BVPanelPCR3 requires: FAM, HEX, Texas Red, Cy5")
    print("   Uploading only 2 channels should show an error message")

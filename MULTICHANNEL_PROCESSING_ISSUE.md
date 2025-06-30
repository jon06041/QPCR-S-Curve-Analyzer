# Multichannel Processing Issue & Proposed Solution

## Current Date: June 30, 2025

## Problem Summary

We have timing/completion issues with multichannel qPCR processing that affect both fresh loads and historical data retrieval. The current implementation doesn't properly wait for all processes to complete before moving to the next step.

## Current Architecture

### Test Types
1. **Single Channel (Single Fluorophore)**: Tests 1 pathogen
   - Uses 1 of the 4 available machine channels for that specific test
   - Channel-pathogen mapping: 1:1 for the single pathogen being tested
2. **Multichannel (Multiple Fluorophores)**: Tests multiple pathogens simultaneously
   - **Machine Limitation**: Up to 4 channels (4 fluorophores) maximum per PCR machine
   - **Channel-Pathogen Mapping**: Each channel is grouped with a specific pathogen in that test
   - **Available Channels**: Same 4 machine channels, but within a test those channels are used with specific pathogens
   - **Sample Capacity**: Up to 384 wells per channel (368 samples + 16 controls = 384 total)
   - **Control Wells**: H, M, L, NTC controls used 4 times each = 16 control wells per channel
   - **Actual Sample Count**: 368 samples per channel (384 - 16 controls, or less for partial runs)
   - **Channel Definitions**: Each channel defined in `pathogen_library.js`

### Current Process Flow
1. **Data Loading** (fresh or from history)
2. **Chart.js Visualization** with thresholds
3. **Control Grid Creation** (for multichannel tests)

## Issues Identified

### 1. Threshold Display Problems
- **Symptom**: Thresholds sometimes don't show when loading from history
- **Suspected Cause**: Process doesn't finish completely before moving to next step
- **Impact**: Charts display without proper threshold lines

### 2. Control Grid Creation Issues
- **Symptom**: 
  - Fresh loads: Control grids have trouble displaying initially
  - History loads: All grids show up properly on reopen
- **Details**: 
  - Multichannel tests create different tabs (up to 16 controls per pathogen/channel)
  - Control types: H (High), M (Medium), L (Low), NTC (No Template Control)
  - **Control Usage**: Each control type used 4 times = 16 control wells per channel
  - **Well Distribution**: 368 samples + 16 controls = 384 total wells per channel (or less for partial runs)
  - Grid layout varies by pathogen/channel

### 3. Partial Channel Loading
- **Current Behavior**: Multichannel tests can load partial channel data
- **Database Behavior**: Partial results combine in DB, so full data available on reload
- **Problem**: Initial display incomplete, requires history reload to see everything

## Root Cause Analysis

The core issue is **lack of proper transaction-like processing**:
- Processes run asynchronously without proper completion waiting
- No guarantee that one channel completes before starting the next
- No final consolidation step that waits for all channels

## Proposed Solution

### New Branch Strategy: Background Channel Processing

#### 1. Process Isolation by Channel
- **Maximum 4 channels per test** (PCR machine hardware limitation)
- **Each channel = 1 pathogen** in that specific test
- Run each channel processing in the background
- Complete ALL operations for one channel before starting the next
- Implement transaction-like completion for each channel

#### 2. Channel Processing Transaction
For each channel, complete in order:
1. Data parsing and validation
2. Curve fitting and analysis
3. Threshold calculation and storage
4. Chart preparation
5. Control grid data preparation
6. Database storage

#### 3. Final Consolidation Step
- Wait for ALL channels to complete their transactions
- Combine results from all channels
- Update database with complete multichannel test
- Render final UI with all channels, thresholds, and control grids

#### 4. Implementation Approach
- Create new branch for this refactor
- Implement channel-by-channel background processing
- Add proper completion checking/waiting mechanisms
- Ensure transaction-like behavior for each channel
- Add final consolidation step

## Expected Benefits

1. **Reliable Threshold Display**: Thresholds will show consistently on both fresh and history loads
2. **Complete Control Grids**: All control grids will display properly on initial load
3. **Consistent Data**: No more partial channel loading issues
4. **Better Error Handling**: If one channel fails, others can still complete
5. **Improved User Experience**: More predictable and reliable results

## Next Steps

1. Create new feature branch for multichannel processing refactor
2. Implement background channel processing with transaction-like completion
3. Add proper waiting mechanisms between channel processing
4. Implement final consolidation step
5. Test with both single and multichannel runs
6. Verify threshold display and control grid creation work reliably

## Technical Notes

- **PCR Machine Architecture**: 4 fluorophore channels maximum (4 pathogens per test)
- **Channel-Pathogen Relationship**: 1:1 mapping per test run
- **Well Distribution**: 368 samples + 16 controls = 384 total wells per channel (H×4, M×4, L×4, NTC×4)
- Chart.js threshold drawing depends on channel-specific calculations
- `pathogen_library.js` contains channel definitions for up to 384 wells per channel
- Database schema supports partial and complete multichannel data
- Control grids use H/M/L/NTC classification with up to 16 controls per channel

## Files Involved

- `pathogen_library.js` - Channel/pathogen definitions
- Chart.js integration - Threshold rendering
- Database models - Multichannel data storage
- Main processing logic - Channel processing coordination

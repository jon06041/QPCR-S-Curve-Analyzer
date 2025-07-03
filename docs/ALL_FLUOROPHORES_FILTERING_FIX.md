# All Fluorophores Filtering Fix

## Summary
Fixed cross-experiment contamination issue where "All Fluorophores" dropdown showed wells from channels not valid for the current experiment.

## Problem
After loading a single-channel experiment (e.g., Ngon/HEX) from history, the "All Fluorophores" dropdown still showed wells from other channels (e.g., FAM, Cy5) from previous multi-channel experiments.

## Solution
Enhanced the `filterTable()` function in `static/script.js` to use the pathogen library's `getRequiredChannels()` function when "All Fluorophores" is selected, ensuring only wells with channels required for the current experiment are displayed.

## Technical Details

### Files Modified
- `/static/script.js` - Enhanced `filterTable()` function (lines ~9171+)
- `/docs/EXPERIMENT_ISOLATION_FIX.md` - Updated documentation

### Key Changes
1. **Experiment-Aware Filtering**: When "All Fluorophores" is selected, only shows wells with fluorophores listed in `getRequiredChannels(currentTestCode)`
2. **Pathogen Library Integration**: Uses the canonical channel definitions from `pathogen_library.js`
3. **Debug Logging**: Added console logging to track which channels are considered valid
4. **Backward Compatibility**: Falls back to showing all wells if pathogen library data is unavailable

### Code Changes
```javascript
// OLD CODE (problematic):
const matchesFluorophore = fluorophoreFilter === 'all' || 
                          fluorophore.toLowerCase().includes(fluorophoreFilter.toLowerCase());

// NEW CODE (fixed):
let matchesFluorophore = true;
if (fluorophoreFilter === 'all') {
    // When "All Fluorophores" is selected, only show wells with channels valid for current experiment
    if (validChannelsForExperiment.length > 0) {
        matchesFluorophore = validChannelsForExperiment.includes(fluorophore);
    }
} else {
    // Specific fluorophore selected - use exact match
    matchesFluorophore = fluorophore.toLowerCase().includes(fluorophoreFilter.toLowerCase());
}
```

## Testing Procedure
1. Load a multi-channel experiment (e.g., BVAB with FAM, HEX, Cy5)
2. Load a single-channel experiment (e.g., Ngon with HEX only) from history
3. Select "All Fluorophores" in the dropdown
4. **Expected Result**: Only HEX wells should be visible, not FAM or Cy5 wells
5. Test specific fluorophore selection still works correctly

## Example
**Before Fix**:
- Load BVAB (FAM, HEX, Cy5) → Load Ngon (HEX) → "All Fluorophores" shows FAM, HEX, Cy5 ❌

**After Fix**:
- Load BVAB (FAM, HEX, Cy5) → Load Ngon (HEX) → "All Fluorophores" shows only HEX ✅

## Benefits
- **Data Integrity**: Prevents confusion from seeing wells with channels not relevant to current experiment
- **Cleaner UI**: Results table only shows relevant data for the active experiment
- **Better UX**: Users can trust that "All Fluorophores" means "all fluorophores for THIS experiment"
- **Robust**: Uses the same pathogen library logic that defines experiment requirements

## Status
✅ **IMPLEMENTED** - The fix is complete and ready for testing.

## Future Considerations
- Could add UI indicator showing which channels are valid for current experiment
- Could add warning if unexpected channels are present in the data
- Could extend this logic to other parts of the UI that display channel information

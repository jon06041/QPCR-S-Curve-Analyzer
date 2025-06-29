/**
 * Real Control Data Integration for Pathogen Grids
 * Creates tabbed interface showing one pathogen's controls at a time
 *
 * CHANGE LOG ENTRY (2025-06-28):
 * Added extra debug logs to showPathogenGridsWithData and extractControlGridData (formerly getRealControlValidationData) for easier troubleshooting and rollback.
 * No functional changes, only logging for traceability.
 */

// Legacy function for production compatibility
function showPathogenGrids(testCode) {
    console.log('🔍 LEGACY - showPathogenGrids called, redirecting to showPathogenGridsWithData');
    // Redirect to the main function with empty control sets
    showPathogenGridsWithData(testCode, {});
}

function showPathogenGridsWithData(testCode, controlSets) {
    console.log('🔍 PATHOGEN GRID v111000 - showPathogenGridsWithData called with testCode:', testCode);
    console.log('🔍 PATHOGEN GRID v111000 - controlSets:', controlSets);
    console.log('🔍 PATHOGEN GRID v111000 - Cache timestamp: 1751029800');
    // CHANGE LOG: Log currentAnalysisResults and loadedSessionData for debugging
    console.log('🔍 [CHANGE LOG] window.currentAnalysisResults:', window.currentAnalysisResults);
    console.log('🔍 [CHANGE LOG] window.loadedSessionData:', window.loadedSessionData);
    
    const container = document.getElementById('pathogenControlGrids');
    if (!container) {
        console.log('🔍 PATHOGEN GRID - Container pathogenControlGrids not found');
        return;
    }
    
    // CLEAR ALL EXISTING PATHOGEN GRIDS to prevent duplicates
    container.innerHTML = '';
    container.style.display = 'block';
    console.log('🔍 PATHOGEN GRID - Container found and completely cleared to prevent duplicates');
    
    // Get real control validation data from current analysis
    console.log('🔍 PATHOGEN GRID - About to call extractControlGridData()');
    const controlValidationData = extractControlGridData();
    console.log('🔍 PATHOGEN GRID - Real control validation data received:', controlValidationData);
    console.log('🔍 PATHOGEN GRID - Control data keys count:', Object.keys(controlValidationData).length);
    
    // Universal pathogen grid creation based on pathogen library
    console.log('🔍 PATHOGEN GRID - Creating universal grid for testCode:', testCode);
    
    // Check if pathogen library functions are available
    if (typeof getPathogenMappingForTest === 'function') {
        const pathogenMapping = getPathogenMappingForTest(testCode);
        if (pathogenMapping && Object.keys(pathogenMapping).length > 0) {
            console.log('🔍 PATHOGEN GRID - Found pathogen mapping for', testCode, ':', pathogenMapping);
            createTabbedPathogenGrids(container, testCode, controlValidationData);
        } else {
            console.log('🔍 PATHOGEN GRID - No pathogen mapping found for', testCode, 'using fallback');
            createUniversalPathogenFallback(container, testCode, controlValidationData);
        }
    } else {
        console.log('🔍 PATHOGEN GRID - Pathogen library not available, using fallback');
        createUniversalPathogenFallback(container, testCode, controlValidationData);
    }
}

function createUniversalPathogenFallback(container, testCode, controlValidationData) {
    console.log('🔍 PATHOGEN GRID - Creating universal fallback for testCode:', testCode);
    
    // Analyze available controls and fluorophores
    const controlKeys = Object.keys(controlValidationData);
    const fluorophoreStats = {};
    
    controlKeys.forEach(key => {
        // Standard format: wellId_fluorophore (e.g., A1_Cy5, B2_FAM, etc.)
        const parts = key.split('_');
        if (parts.length >= 2) {
            const fluorophore = parts[parts.length - 1]; // Get the fluorophore part
            const commonFluorophores = ['FAM', 'HEX', 'Cy5', 'Texas Red', 'ROX', 'TAMRA'];
            
            if (commonFluorophores.includes(fluorophore)) {
                if (!fluorophoreStats[fluorophore]) {
                    fluorophoreStats[fluorophore] = 0;
                }
                fluorophoreStats[fluorophore]++;
            }
        }
    });
    
    let fallbackHTML = `
        <div class="universal-pathogen-container">
            <h4>Control Validation - ${testCode} Test</h4>
            <div class="pathogen-fallback-note">
                <p><strong>Universal Control Grid:</strong> Automatically detected ${Object.keys(fluorophoreStats).length} fluorophore(s)</p>
            </div>
            <div class="universal-control-summary">
                <p><strong>Controls found:</strong> ${controlKeys.length} samples</p>
    `;
    
    // Show fluorophore breakdown
    if (Object.keys(fluorophoreStats).length > 0) {
        fallbackHTML += '<div class="fluorophore-breakdown">';
        Object.entries(fluorophoreStats).forEach(([fluorophore, count]) => {
            fallbackHTML += `<div class="fluorophore-stat">
                <span class="fluorophore-name">${fluorophore}:</span> 
                <span class="control-count">${count} controls</span>
            </div>`;
        });
        fallbackHTML += '</div>';
    }
    
    fallbackHTML += `
                <p><em>Review individual controls in the results table using the Controls filter.</em></p>
            </div>
        </div>
    `;
    
    container.innerHTML = fallbackHTML;
}

function extractControlGridData() {
    console.log('🔍 CONTROL GRID DATA - Starting real control validation data extraction');
    // CHANGE LOG: Extra debug for easier rollback
    console.log('🔍 [CHANGE LOG] extractControlGridData called.');
    console.log('🔍 CONTROL GRID DATA - Current analysis results available:', !!window.currentAnalysisResults);
    console.log('🔍 CONTROL GRID DATA - Analysis results count:', window.currentAnalysisResults ? window.currentAnalysisResults.length : 0);
    console.log('🔍 CONTROL GRID DATA - *** DEBUG: DATA SOURCE DETECTION ***');
    console.log('🔍 CONTROL GRID DATA - window.currentAnalysisResults type:', typeof window.currentAnalysisResults);
    console.log('🔍 CONTROL GRID DATA - window.currentAnalysisResults is array:', Array.isArray(window.currentAnalysisResults));
    console.log('🔍 CONTROL GRID DATA - window.loadedSessionData available:', !!window.loadedSessionData);
    console.log('🔍 CONTROL GRID DATA - DATA SOURCE:', window.loadedSessionData ? 'HISTORY LOADING' : 'FRESH UPLOAD');
    
    const controlData = {};
    
    if (!window.currentAnalysisResults || window.currentAnalysisResults.length === 0) {
        console.log('🔍 CONTROL DATA - No current analysis results available, checking loaded session data');
        
        // Check if we have loaded session data
        if (window.loadedSessionData && window.loadedSessionData.well_results) {
            console.log('🔍 CONTROL DATA - Found loaded session well_results:', window.loadedSessionData.well_results.length);
            window.currentAnalysisResults = window.loadedSessionData.well_results;
        } else {
            console.log('🔍 CONTROL DATA - No loaded session data available either');
            return controlData;
        }
    }
    
    // CRITICAL DEBUG: Show complete data structure to identify differences
    console.log('🔍 CONTROL DATA - *** CRITICAL DEBUG: COMPLETE DATA STRUCTURE ***');
    console.log('🔍 CONTROL DATA - Sample of first well data:', window.currentAnalysisResults[0]);
    console.log('🔍 CONTROL DATA - Keys in first well:', Object.keys(window.currentAnalysisResults[0] || {}));
    
    // First, show all unique sample names for debugging
    const allSampleNames = [...new Set(window.currentAnalysisResults.map(w => w.sample_name || 'UNNAMED'))];
    console.log('🔍 CONTROL DATA - All sample names in session:', allSampleNames.slice(0, 50));
    
    // Show wells with their coordinates and sample names for debugging
    const wellsWithCoords = window.currentAnalysisResults.slice(0, 20).map(w => {
        let coordinate = 'Unknown';
        // Try well_id with _
        if (w.well_id && typeof w.well_id === 'string' && w.well_id.includes('_')) {
            const parts = w.well_id.split('_');
            coordinate = parts.length > 0 ? parts[0] : 'Unknown';
        } else if (w.well_id && typeof w.well_id === 'string') {
            coordinate = w.well_id;
        } else if (w.coordinate && typeof w.coordinate === 'string') {
            coordinate = w.coordinate;
        } else if (w.sample_name && typeof w.sample_name === 'string') {
            // Fallback: extract coordinate from sample name (e.g., A1H, B2NTC, etc.)
            const coordMatch = w.sample_name.match(/([A-P][0-9]{1,2})/i);
            if (coordMatch) {
                coordinate = coordMatch[1];
            }
        }
        return {
            wellId: w.well_id,
            coordinate: coordinate,
            sampleName: w.sample_name,
            amplitude: w.amplitude,
            fluorophore: w.fluorophore
        };
    });
    console.log('🔍 CONTROL DATA - First 20 wells with coordinates:', wellsWithCoords);
    
    // Show potential control samples
    const potentialControls = allSampleNames.filter(name => 
        name && (name.includes('H') || name.includes('M') || name.includes('L') || name.includes('NTC') || 
                 name.includes('Control') || name.includes('control') || name.includes('Pos') || name.includes('Neg'))
    );
    console.log('🔍 CONTROL DATA - Potential control samples:', potentialControls);
    
    // Group wells by coordinate to detect control sets
    const wellsByCoordinate = {};
    window.currentAnalysisResults.forEach(well => {
        let coordinate = 'Unknown';
        if (well.well_id && typeof well.well_id === 'string' && well.well_id.includes('_')) {
            const parts = well.well_id.split('_');
            coordinate = parts.length > 0 ? parts[0] : 'Unknown';
        } else if (well.well_id && typeof well.well_id === 'string') {
            coordinate = well.well_id;
        } else if (well.coordinate && typeof well.coordinate === 'string') {
            coordinate = well.coordinate;
        } else if (well.sample_name && typeof well.sample_name === 'string') {
            // Fallback: extract coordinate from sample name (e.g., A1H, B2NTC, etc.)
            const coordMatch = well.sample_name.match(/([A-P][0-9]{1,2})/i);
            if (coordMatch) {
                coordinate = coordMatch[1];
            }
        }
        if (!wellsByCoordinate[coordinate]) {
            wellsByCoordinate[coordinate] = [];
        }
        wellsByCoordinate[coordinate].push(well);
    });
    
    // Extract control samples directly from analysis results
    // Use the same logic as the results table "Controls" filter
    function extractTestPattern(sampleName) {
        if (!sampleName) return 'AcBVAB';
        const match = sampleName.match(/^(Ac[A-Za-z]+)/);
        return match && match[1] ? match[1] : 'AcBVAB';
    }
    
    const testPattern = window.currentAnalysisResults && window.currentAnalysisResults.length > 0 ? 
        extractTestPattern(window.currentAnalysisResults[0].sample_name || '') : 'AcBVAB';
    
    const controlSamples = [];
    
    if (window.currentAnalysisResults) {
        window.currentAnalysisResults.forEach(well => {
            const sampleName = well.sample_name || '';
            let coordinate = 'Unknown';
            let fluorophore = 'Unknown';
            if (well.well_id && well.well_id.includes('_')) {
                const parts = well.well_id.split('_');
                coordinate = parts.length > 0 ? parts[0] : 'Unknown';
                fluorophore = parts.length > 1 ? parts[1] : 'Unknown';
            }
            
            // Use actual control well positions from database (fresh uploads need coordinate-based detection)
            const actualControlPositions = {
                // From actual Mgen data - these are the real control coordinates
                'L5': 'L',    // AcMgen361652A14L-2576640
                'G10': 'NTC', // AcMgen361652B22NTC-2576640  
                'N14': 'H',   // AcMgen361652D06H-2576640
                'O14': 'M',   // AcMgen361652D11M-2576640
                'I19': 'M',   // AcMgen361652F08M-2576640
                'J5': 'H',    // AcMgen361652G05H-2576640
                'P14': 'L',   // AcMgen361652G14L-2576640
                'H19': 'H',   // AcMgen361652H05H-2576640
                'J19': 'L',   // AcMgen361652H14L-2576640
                'M5': 'NTC',  // AcMgen361652H24NTC-2576640
                'K5': 'M',    // AcMgen361652J11M-2576640
                'F10': 'L',   // AcMgen361652J14L-2576640
                'K19': 'NTC', // AcMgen361652J22NTC-2576640
                'D10': 'H',   // AcMgen361652K05H-2576640
                'E10': 'M',   // AcMgen361652L10M-2576640
                'A15': 'NTC'  // AcMgen361652N22NTC-2576640
            };
            
            // Check for controls by coordinate (fresh uploads) or sample name (history loading)
            const isControlByPosition = actualControlPositions.hasOwnProperty(coordinate);
            const isControlByName = sampleName.startsWith(testPattern) || // History loading pattern
                                   /AcMgen\d+[A-Z]\d+[HML]-\d+/.test(sampleName) || // H/M/L controls: AcMgen361652A14L-2576640
                                   /AcMgen\d+[A-Z]\d+NTC-\d+/.test(sampleName); // NTC controls: AcMgen361652B22NTC-2576640
            
            if (isControlByPosition || isControlByName) {
                controlSamples.push({
                    coordinate: coordinate,
                    sampleName: sampleName,
                    fluorophore: fluorophore,
                    amplitude: well.amplitude || 0,
                    wellId: well.well_id,
                    detectionMethod: isControlByPosition ? 'position' : 'name',
                    controlType: isControlByPosition ? actualControlPositions[coordinate] : null
                });
            }
        });
    }
    
    // ENHANCED DEBUG: Check expected control positions against actual data
    const actualControlPositions = {
        'L5': 'L', 'G10': 'NTC', 'N14': 'H', 'O14': 'M', 'I19': 'M', 'J5': 'H',
        'P14': 'L', 'H19': 'H', 'J19': 'L', 'M5': 'NTC', 'K5': 'M', 'F10': 'L',
        'K19': 'NTC', 'D10': 'H', 'E10': 'M', 'A15': 'NTC'
    };
    
    // Show first few wells to understand data structure
    console.log('🔍 DATA STRUCTURE DEBUG - First 5 wells:');
    allWells.slice(0, 5).forEach((well, index) => {
        console.log(`  ${index + 1}. well_id: "${well.well_id}" | sample_name: "${well.sample_name}" | amplitude: ${well.amplitude}`);
    });
    
    console.log('🔍 CONTROL DETECTION DEBUG - Expected vs Found:');
    Object.keys(actualControlPositions).forEach(expectedCoord => {
        const foundWell = allWells.find(well => {
            if (!well.well_id || !well.well_id.includes('_')) return false;
            const parts = well.well_id.split('_');
            const coordinate = parts.length > 0 ? parts[0] : 'Unknown';
            return coordinate === expectedCoord;
        });
        
        if (foundWell) {
            console.log(`✓ ${expectedCoord} (${actualControlPositions[expectedCoord]}) - FOUND: ${foundWell.sample_name || 'NO_SAMPLE_NAME'} - Amplitude: ${foundWell.amplitude || 0}`);
        } else {
            console.log(`✗ ${expectedCoord} (${actualControlPositions[expectedCoord]}) - MISSING from dataset`);
        }
    });
    
    console.log('🔍 CONTROL DATA - Real control samples found (enhanced detection):');
    console.log(`🔍 Test pattern: "${testPattern}"`);
    console.log(`🔍 Total control samples found: ${controlSamples.length}`);
    console.log(`🔍 EXPECTED: 16 controls for single-channel test (4H + 4M + 4L + 4NTC)`);
    controlSamples.forEach(control => {
        console.log(`  ${control.coordinate}: ${control.sampleName} (${control.fluorophore}, amp: ${control.amplitude.toFixed(1)}, detected by: ${control.detectionMethod})`);
    });
    
    // Also show all samples to see what we're missing
    console.log('🔍 CONTROL DATA - All samples in dataset (first 20):');
    const allSamples = window.currentAnalysisResults.slice(0, 20).map(well => {
        let coordinate = 'Unknown';
        let fluorophore = 'Unknown';
        if (well.well_id && typeof well.well_id === 'string' && well.well_id.includes('_')) {
            const parts = well.well_id.split('_');
            coordinate = parts.length > 0 ? parts[0] : 'Unknown';
            fluorophore = parts.length > 1 ? parts[1] : 'Unknown';
        } else if (well.well_id && typeof well.well_id === 'string') {
            coordinate = well.well_id;
        } else if (well.coordinate && typeof well.coordinate === 'string') {
            coordinate = well.coordinate;
        } else if (well.sample_name && typeof well.sample_name === 'string') {
            // Fallback: extract coordinate from sample name (e.g., A1H, B2NTC, etc.)
            const coordMatch = well.sample_name.match(/([A-P][0-9]{1,2})/i);
            if (coordMatch) {
                coordinate = coordMatch[1];
            }
        }
        return {
            coordinate: coordinate,
            sampleName: well.sample_name || 'UNNAMED',
            fluorophore: fluorophore
        };
    });
    allSamples.forEach(sample => {
        console.log(`  ${sample.coordinate}: ${sample.sampleName} (${sample.fluorophore})`);
    });
    
    // Group by coordinate to see all fluorophores for each control well
    const controlsByCoordinate = {};
    controlSamples.forEach(control => {
        if (!controlsByCoordinate[control.coordinate]) {
            controlsByCoordinate[control.coordinate] = [];
        }
        controlsByCoordinate[control.coordinate].push(control);
    });
    
    console.log('🔍 CONTROL DATA - Controls grouped by coordinate:');
    Object.keys(controlsByCoordinate).sort().forEach(coord => {
        const controls = controlsByCoordinate[coord];
        const fluorophores = controls.map(c => c.fluorophore).join(', ');
        const sampleName = controls[0].sampleName;
        console.log(`  ${coord}: ${sampleName} [${fluorophores}]`);
    });
    
    // Create coordinate-to-control mapping directly from the real control sample data
    const coordinateToControlInfo = {};
    
    // Analyze actual control samples found in the results
    controlSamples.forEach(control => {
        const { coordinate, sampleName, fluorophore, amplitude } = control;
        
        // Extract control type and set directly from the sample name pattern
        let controlType = null;
        let setNumber = null;
        
        // Use actual control positions for fresh uploads (coordinate-based detection)
        const actualControlPositions = {
            'L5': 'L', 'G10': 'NTC', 'N14': 'H', 'O14': 'M', 'I19': 'M', 'J5': 'H',
            'P14': 'L', 'H19': 'H', 'J19': 'L', 'M5': 'NTC', 'K5': 'M', 'F10': 'L',
            'K19': 'NTC', 'D10': 'H', 'E10': 'M', 'A15': 'NTC'
        };
        
        // Use stored controlType if available, otherwise detect from position or sample name
        if (sample.controlType) {
            controlType = sample.controlType;
        } else if (actualControlPositions[coordinate]) {
            controlType = actualControlPositions[coordinate];
        } else if (sampleName.includes('NTC') || /AcMgen\d+[A-Z]\d+NTC-\d+/.test(sampleName)) {
            controlType = 'NTC';
        } else if (/AcMgen\d+[A-Z]\d+H-\d+/.test(sampleName) || sampleName.includes('_H_') || sampleName.match(/H-\d/) || sampleName.endsWith('-H')) {
            controlType = 'H';
        } else if (/AcMgen\d+[A-Z]\d+M-\d+/.test(sampleName) || sampleName.includes('_M_') || sampleName.match(/M-\d/) || sampleName.endsWith('-M')) {
            controlType = 'M';
        } else if (/AcMgen\d+[A-Z]\d+L-\d+/.test(sampleName) || sampleName.includes('_L_') || sampleName.match(/L-\d/) || sampleName.endsWith('-L')) {
            controlType = 'L';
        }
        
        // Extract set number from sample name pattern (look for numbers after control type)
        let setMatch = sampleName.match(/-(\d+)$/);
        if (setMatch) {
            setNumber = parseInt(setMatch[1]);
        } else {
            // Try alternative patterns for set extraction
            setMatch = sampleName.match(/(\d+)$/);
            if (setMatch) {
                setNumber = parseInt(setMatch[1]);
            } else {
                // Use coordinate-based set assignment as last resort
                setNumber = 1; // Default to set 1
            }
        }
        
        if (controlType && setNumber) {
            coordinateToControlInfo[coordinate] = {
                set: setNumber,
                type: controlType,
                sampleName: sampleName,
                amplitude: amplitude,
                fluorophore: fluorophore
            };
            
            console.log(`🔍 CONTROL MAPPING - ${coordinate}: ${controlType} Set ${setNumber} (${sampleName}) [${fluorophore}]`);
        } else {
            console.log(`🔍 CONTROL MAPPING - Could not parse: ${coordinate}: ${sampleName} (type: ${controlType}, set: ${setNumber})`);
        }
    });
    
    console.log('🔍 CONTROL DATA - Coordinate to control mapping:', coordinateToControlInfo);
    
    // Extract control samples from current analysis results using coordinate mapping
    window.currentAnalysisResults.forEach(well => {
        const sampleName = well.sample_name || '';
        const amplitude = well.amplitude || 0;
        let fluorophore = 'Unknown';
        let coordinate = 'Unknown';
        
        // Enhanced well_id parsing with debugging
        if (well.well_id && typeof well.well_id === 'string') {
            if (well.well_id.includes('_')) {
                const parts = well.well_id.split('_');
                coordinate = parts.length > 0 && parts[0] ? parts[0] : 'Unknown';
                fluorophore = parts.length > 1 && parts[1] ? parts[1] : 'Unknown';
            } else {
                // If no underscore, assume the whole well_id is the coordinate
                coordinate = well.well_id;
            }
        }
        
        // Additional debug logging for problematic wells
        if (coordinate === 'Unknown' || coordinate === '') {
            console.log(`🔍 COORDINATE DEBUG - Problematic well_id: "${well.well_id}" (type: ${typeof well.well_id}), sample: "${sampleName}"`);
        } else {
            console.log(`🔍 COORDINATE DEBUG - Extracted coordinate: "${coordinate}" from sample: "${sampleName}"`);
        }
        
        // Check if this coordinate is a known control coordinate
        const controlInfo = coordinateToControlInfo[coordinate];
        if (controlInfo) {
            // Use coordinate-based control type (more reliable than sample name parsing)
            const controlType = controlInfo.type;
            const setNumber = controlInfo.set;
            
            if (controlType) {
                const key = `${fluorophore}_${controlType}_${setNumber}`;
                
                // Determine validation status using complete well data
                const expected = getExpectedResult(controlType);
                const actual = getActualResult(well);
                const isValid = (expected === actual);
                
                controlData[key] = {
                    fluorophore: fluorophore,
                    controlType: controlType,
                    setNumber: setNumber,
                    sampleName: sampleName,
                    amplitude: amplitude,
                    expected: expected,
                    actual: actual,
                    isValid: isValid,
                    wellId: well.well_id,
                    coordinate: coordinate
                };
                
                console.log(`🔍 CONTROL DATA - Found coordinate-based control: ${key}`, controlData[key]);
            }
        }
        
        // Fallback: try pattern-based detection for other naming formats
        const fallbackControlInfo = getControlTypeAndSetFromSample(sampleName);
        if (fallbackControlInfo && !coordinateToControlInfo[coordinate]) {
            // Extract fluorophore from well_id if not found from coordinate mapping
            let wellFluorophore = 'Unknown';
            if (well.well_id && well.well_id.includes('_')) {
                const parts = well.well_id.split('_');
                wellFluorophore = parts.length > 1 ? parts[1] : 'Unknown';
            }
            // Check if we can get fluorophore from the well object directly
            const directFluorophore = well.fluorophore || 'Unknown';
            // Use fallback hierarchy: coordinate mapping > well object > well_id > hardcoded FAM (for single-channel)
            const finalFluorophore = fluorophore || directFluorophore !== 'Unknown' ? directFluorophore : wellFluorophore || 'FAM';
            console.log(`🔍 FLUOROPHORE FIX DEBUG - well_id: ${well.well_id}, wellFluorophore: ${wellFluorophore}, directFluorophore: ${directFluorophore}, finalFluorophore: ${finalFluorophore}`);
            const key = `${finalFluorophore}_${fallbackControlInfo.type}_${fallbackControlInfo.set}`;
            
            // Only add if not already found via coordinate mapping
            if (!controlData[key]) {
                const expected = getExpectedResult(fallbackControlInfo.type);
                const actual = getActualResult(well);
                const isValid = (expected === actual);
                
                controlData[key] = {
                    fluorophore: finalFluorophore,
                    controlType: fallbackControlInfo.type,
                    setNumber: fallbackControlInfo.set,
                    sampleName: sampleName,
                    amplitude: amplitude,
                    expected: expected,
                    actual: actual,
                    isValid: isValid,
                    wellId: well.well_id,
                    coordinate: coordinate
                };
                
                console.log(`🔍 CONTROL DATA - Found pattern-based control: ${key} (FIXED FLUOROPHORE)`, controlData[key]);
            }
        }
        
        if (potentialControls.includes(sampleName) && !coordinateToControlInfo[coordinate] && !getControlTypeAndSetFromSample(sampleName)) {
            console.log(`🔍 CONTROL DATA - Unmatched potential control: "${sampleName}" in well ${well.well_id} (${coordinate})`);
        }
    });
    
    console.log('🔍 CONTROL DATA - *** FINAL CONTROL DATA ANALYSIS ***');
    console.log('🔍 CONTROL DATA - Total control keys found:', Object.keys(controlData).length);
    console.log('🔍 CONTROL DATA - All control keys:', Object.keys(controlData));
    console.log('🔍 CONTROL DATA - Sample control data entry:', controlData[Object.keys(controlData)[0]]);
    
    // Show breakdown by fluorophore for debugging
    const controlsByFluorophore = {};
    Object.values(controlData).forEach(control => {
        if (!controlsByFluorophore[control.fluorophore]) {
            controlsByFluorophore[control.fluorophore] = 0;
        }
        controlsByFluorophore[control.fluorophore]++;
    });
    console.log('🔍 CONTROL DATA - Controls by fluorophore:', controlsByFluorophore);
    
    return controlData;
}

function getControlTypeAndSetFromSample(sampleName) {
    if (!sampleName) return null;
    
    const name = sampleName.toString().trim();
    
    // Pattern matching for the actual BVAB control naming format: AcBVAB362273G23NTC-2578825
    const bvabPatterns = [
        { regex: /AcBVAB\d+[A-P]\d+([HML])-\d+/, typeIndex: 1 },        // AcBVAB362273G23H-2578825
        { regex: /AcBVAB\d+[A-P]\d+(NTC)-\d+/, typeIndex: 1 }           // AcBVAB362273G23NTC-2578825
    ];
    
    for (const pattern of bvabPatterns) {
        const match = name.match(pattern.regex);
        if (match) {
            const type = match[pattern.typeIndex];
            
            // Extract coordinate-based set number from the sample name
            // Map common control coordinates to set numbers
            let set = 1; // Default
            
            if (name.includes('G23') || name.includes('G10')) set = 1;      // Set 1
            else if (name.includes('P20') || name.includes('K19')) set = 2; // Set 2  
            else if (name.includes('L24') || name.includes('A15')) set = 3; // Set 3
            else if (name.includes('C20') || name.includes('M5')) set = 4;  // Set 4
            
            return {
                type: type,
                set: set
            };
        }
    }
    
    // Fallback: Legacy pattern matching for other formats
    const legacyPatterns = [
        { regex: /([HML])-(\d+)$/, typeIndex: 1, setIndex: 2 },        // H-1, M-2, L-3
        { regex: /([HML])(\d+)$/, typeIndex: 1, setIndex: 2 },          // H1, M2, L3
        { regex: /(NTC)-(\d+)$/, typeIndex: 1, setIndex: 2 },           // NTC-1
        { regex: /(NTC)(\d+)$/, typeIndex: 1, setIndex: 2 },            // NTC1
        { regex: /^([HML])-(\d+)/, typeIndex: 1, setIndex: 2 },         // H-1 at start
        { regex: /^(NTC)-(\d+)/, typeIndex: 1, setIndex: 2 }            // NTC-1 at start
    ];
    
    for (const pattern of legacyPatterns) {
        const match = name.match(pattern.regex);
        if (match) {
            return {
                type: match[pattern.typeIndex],
                set: parseInt(match[pattern.setIndex])
            };
        }
    }
    
    return null;
}

function getExpectedResult(controlType) {
    switch (controlType) {
        case 'H':
        case 'M':
        case 'L':
            return 'POS';
        case 'NTC':
            return 'NEG';
        default:
            return 'UNKNOWN';
    }
}

function getActualResult(wellData) {
    // Use the same exact criteria as main analysis results - identical to script.js
    const amplitude = wellData.amplitude || 0;
    const isGoodCurve = wellData.is_good_scurve || false;
    
    // Check for anomalies using the same logic as main analysis
    let hasAnomalies = false;
    if (wellData.anomalies) {
        try {
            const anomalies = typeof wellData.anomalies === 'string' ? 
                JSON.parse(wellData.anomalies) : wellData.anomalies;
            hasAnomalies = Array.isArray(anomalies) && anomalies.length > 0 && 
                          !(anomalies.length === 1 && (anomalies[0] === 'None' || anomalies[0] === 'none'));
        } catch (e) {
            hasAnomalies = true;
        }
    }
    
    // Apply same criteria as main analysis: POS requires good S-curve + amplitude > 500 + no anomalies
    if (isGoodCurve && amplitude > 500 && !hasAnomalies) {
        return 'POS';
    } else if (amplitude < 400) {
        return 'NEG';
    } else {
        return 'REDO';
    }
}

function extractCoordinateFromWellId(wellId) {
    if (!wellId) return 'Unknown';
    const parts = wellId.split('_');
    return parts[0] || 'Unknown';
}

function createTabbedPathogenGrids(container, testCode, controlData) {
    console.log('🔍 PATHOGEN GRID - Creating universal tabbed grids for testCode:', testCode);
    
    // Get pathogens dynamically from pathogen library
    let pathogens = [];
    
    if (typeof getPathogenMappingForTest === 'function') {
        const pathogenMapping = getPathogenMappingForTest(testCode);
        console.log('🔍 PATHOGEN GRID - Pathogen mapping from library:', pathogenMapping);
        
        // Convert mapping to pathogen array
        Object.entries(pathogenMapping).forEach(([fluorophore, pathogenName]) => {
            pathogens.push({
                name: pathogenName,
                fluorophore: fluorophore
            });
        });
    }
    
    // Fallback: if no mapping found, use control data to determine available fluorophores
    if (pathogens.length === 0) {
        console.log('🔍 PATHOGEN GRID - No pathogen mapping found, extracting from control data');
        console.log('🔍 PATHOGEN GRID - Control data keys:', Object.keys(controlData));
        
        // Extract fluorophores from standard wellId_fluorophore format
        const availableFluorophores = new Set();
        Object.keys(controlData).forEach(key => {
            // Standard format: wellId_fluorophore (e.g., A1_Cy5, B2_FAM, etc.)
            const parts = key.split('_');
            if (parts.length >= 2) {
                const lastPart = parts[parts.length - 1]; // Get the fluorophore part
                const commonFluorophores = ['FAM', 'HEX', 'Cy5', 'Texas Red', 'ROX', 'TAMRA'];
                if (commonFluorophores.includes(lastPart)) {
                    availableFluorophores.add(lastPart);
                }
            }
        });
        
        console.log('🔍 PATHOGEN GRID - Detected fluorophores:', Array.from(availableFluorophores));
        
        // Use pathogen library to get proper pathogen names if available
        Array.from(availableFluorophores).forEach(fluorophore => {
            let pathogenName = `${testCode} Target`;
            
            // Try to get pathogen name from library for this specific fluorophore
            if (typeof getPathogenMappingForTest === 'function') {
                const mapping = getPathogenMappingForTest(testCode);
                if (mapping && mapping[fluorophore]) {
                    pathogenName = mapping[fluorophore];
                }
            }
            
            pathogens.push({
                name: pathogenName,
                fluorophore: fluorophore
            });
        });
    }
    
    console.log('🔍 PATHOGEN GRID - Final pathogens array:', pathogens);
    
    // Create tabbed interface
    let tabsHTML = '<div class="pathogen-tabs-container">';
    
    // Tab headers
    tabsHTML += '<div class="pathogen-tab-headers">';
    pathogens.forEach((pathogen, index) => {
        const activeClass = index === 0 ? ' active' : '';
        tabsHTML += `<button class="pathogen-tab-header${activeClass}" onclick="showPathogenTab('${pathogen.fluorophore}')">${pathogen.name}</button>`;
    });
    tabsHTML += '</div>';
    
    // Tab content
    tabsHTML += '<div class="pathogen-tab-content">';
    pathogens.forEach((pathogen, index) => {
        const activeClass = index === 0 ? ' active' : '';
        tabsHTML += `<div id="tab-${pathogen.fluorophore}" class="pathogen-tab-panel${activeClass}">`;
        
        console.log(`🔍 PATHOGEN GRID - Creating grid for pathogen: ${pathogen.name} (${pathogen.fluorophore})`);
        const gridHTML = createSinglePathogenControlGrid(pathogen, controlData);
        console.log(`🔍 PATHOGEN GRID - Grid HTML length for ${pathogen.name}: ${gridHTML.length}`);
        
        tabsHTML += gridHTML;
        tabsHTML += '</div>';
    });
    tabsHTML += '</div>';
    
    tabsHTML += '</div>';
    
    console.log(`🔍 PATHOGEN GRID - Final tabbed HTML length: ${tabsHTML.length}`);
    container.innerHTML = tabsHTML;
    console.log('🔍 PATHOGEN GRID - HTML inserted into container, checking final state...');
    console.log('🔍 PATHOGEN GRID - Container innerHTML length after insert:', container.innerHTML.length);
    console.log('🔍 PATHOGEN GRID - Container display style:', container.style.display);
    console.log('🔍 PATHOGEN GRID - Container visible:', container.offsetHeight > 0 && container.offsetWidth > 0);
    
    // FORCE VISIBILITY - Add debugging styles
    container.style.cssText = 'display: block !important; visibility: visible !important; opacity: 1 !important; background: yellow !important; border: 3px solid red !important; min-height: 100px !important; padding: 20px !important;';
    console.log('🔍 PATHOGEN GRID - FORCED VISIBILITY with debug styles');
    console.log('🔍 PATHOGEN GRID - Container HTML preview:', container.innerHTML.substring(0, 500));
    
    console.log('Tabbed pathogen grids created for', testCode);
}

function createSinglePathogenControlGrid(pathogen, controlData) {
    console.log(`🔍 SINGLE GRID - Creating grid for ${pathogen.name} (${pathogen.fluorophore})`);
    console.log(`🔍 SINGLE GRID - Control data available:`, !!controlData, 'keys:', Object.keys(controlData).length);
    
    const controlTypes = ['H', 'M', 'L', 'NTC'];
    
    // Get actual control sets with their coordinates from the data
    const controlSets = getControlSetsForPathogen(pathogen.fluorophore, controlData);
    const setNumbers = Object.keys(controlSets).sort();
    
    console.log(`🔍 SINGLE GRID - ${pathogen.name} control sets:`, controlSets);
    console.log(`🔍 SINGLE GRID - Set numbers found:`, setNumbers);
    
    // If no control sets found, create a fallback display
    if (setNumbers.length === 0) {
        console.log(`🔍 SINGLE GRID - No control sets found for ${pathogen.name}, creating fallback`);
        return `
            <div class="single-pathogen-grid">
                <h4>${pathogen.name} (${pathogen.fluorophore})</h4>
                <div class="control-grid-fallback">
                    <p><strong>Control Grid:</strong> No control samples detected for ${pathogen.fluorophore} channel</p>
                    <p>Expected control types: H (High), M (Medium), L (Low), NTC (No Template Control)</p>
                    <p>Use the "Controls" filter in the results table to review individual control samples.</p>
                </div>
            </div>
        `;
    }
    
    // Always create a 4x4 grid layout
    let gridHTML = `
        <div class="single-pathogen-grid">
            <h4>${pathogen.name} (${pathogen.fluorophore}) - Control Grid</h4>
            <div class="control-grid-table" style="display: grid; grid-template-columns: 80px repeat(4, 1fr); gap: 2px; max-width: 600px;">
                <div class="grid-corner" style="background: #e9ecef; padding: 8px; text-align: center; font-weight: bold; font-size: 12px;">Control</div>
    `;
    
    // Create 4 set headers
    for (let i = 1; i <= 4; i++) {
        gridHTML += `<div class="set-header" style="background: #f8f9fa; padding: 8px; text-align: center; font-weight: bold; font-size: 12px;">Set ${i}</div>`;
    }
    
    // Create 4 rows for each control type
    controlTypes.forEach(controlType => {
        const labelClass = controlType === 'NTC' ? 'background: #f1f3f4;' : 'background: #f8f9fa;';
        gridHTML += `<div class="control-type-label" style="${labelClass} padding: 8px; text-align: center; font-weight: bold; font-size: 12px; color: #495057;">${controlType}</div>`;
        
        // Create 4 control cells for this type
        for (let setIndex = 1; setIndex <= 4; setIndex++) {
            const setKey = `Set${setIndex}`;
            const control = controlSets[setKey] ? controlSets[setKey][controlType] : null;
            
            let cellClass = 'missing';
            let symbol = '-';
            let coordinate = '--';
            let tooltip = `${controlType} Set ${setIndex}: No control found`;
            let cellStyle = 'background: #f8f9fa; border: 1px solid #dee2e6;';
            
            if (control) {
                cellClass = control.isValid ? 'valid' : 'invalid';
                symbol = control.isValid ? '✓' : '✗';
                coordinate = control.coordinate;
                tooltip = `${controlType} Set ${setIndex} (${coordinate}): ${control.amplitude.toFixed(1)} RFU`;
                
                if (control.isValid) {
                    cellStyle = 'background: #d4edda; border: 1px solid #c3e6cb; color: #155724;';
                } else {
                    cellStyle = 'background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24;';
                }
            }
            
            gridHTML += `<div class="control-cell ${cellClass}" title="${tooltip}" style="${cellStyle} padding: 8px; text-align: center; font-size: 11px; min-height: 40px; display: flex; flex-direction: column; justify-content: center;">
                <div class="control-symbol" style="font-size: 14px; font-weight: bold; margin-bottom: 2px;">${symbol}</div>
                <div class="control-coordinate" style="font-size: 10px;">${coordinate}</div>
            </div>`;
        }
    });
    
    gridHTML += `
            </div>
        </div>
    `;
    
    return gridHTML;
}

function getControlSetsForPathogen(fluorophore, controlData) {
    console.log(`🔍 PATHOGEN GRID - Getting control sets for fluorophore: ${fluorophore}`);
    console.log(`🔍 PATHOGEN GRID - Available control data keys:`, Object.keys(controlData));
    
    // Group controls by type for this fluorophore
    const controlsByType = {
        'H': [],
        'M': [],
        'L': [],
        'NTC': []
    };
    
    // Collect all controls for this fluorophore
    Object.keys(controlData).forEach(key => {
        const control = controlData[key];
        
        if (control.fluorophore === fluorophore) {
            controlsByType[control.controlType].push({
                coordinate: control.coordinate,
                amplitude: control.amplitude,
                isValid: control.isValid,
                expected: control.expected,
                actual: control.actual,
                controlType: control.controlType
            });
            
            console.log(`🔍 PATHOGEN GRID - Added ${control.controlType} at ${control.coordinate} for ${fluorophore}`);
        }
    });
    
    // Create control sets from the available controls
    const controlSets = {};
    
    // Safe access to control arrays with proper null/undefined checking
    const safeLength = (arr) => (arr && Array.isArray(arr)) ? arr.length : 0;
    const safeAccess = (arr, index) => (arr && Array.isArray(arr) && arr[index]) ? arr[index] : null;
    
    const maxSets = Math.max(
        safeLength(controlsByType.H),
        safeLength(controlsByType.M),
        safeLength(controlsByType.L),
        safeLength(controlsByType.NTC),
        1 // Ensure at least 1 set
    );
    
    console.log(`🔍 PATHOGEN GRID - Control sets analysis: maxSets=${maxSets}, by type:`, {
        H: safeLength(controlsByType.H),
        M: safeLength(controlsByType.M), 
        L: safeLength(controlsByType.L),
        NTC: safeLength(controlsByType.NTC)
    });
    
    // Always create 4 sets for 4x4 grid display - both single and multi-channel tests have 4 sets
    for (let i = 0; i < 4; i++) {
        controlSets[`Set${i + 1}`] = {
            'H': safeAccess(controlsByType.H, i),
            'M': safeAccess(controlsByType.M, i),
            'L': safeAccess(controlsByType.L, i),
            'NTC': safeAccess(controlsByType.NTC, i)
        };
    }
    
    console.log(`🔍 PATHOGEN GRID - Final control sets for ${fluorophore}:`, controlSets);
    return controlSets;
}

function showPathogenTab(fluorophore) {
    console.log('🔍 TAB NAVIGATION - showPathogenTab called with fluorophore:', fluorophore);
    
    // Hide all tab panels - check both possible class names
    const panels = document.querySelectorAll('.pathogen-tab-panel, .tab-panel');
    console.log('🔍 TAB NAVIGATION - Found', panels.length, 'tab panels to hide');
    panels.forEach(panel => {
        panel.classList.remove('active');
        panel.style.display = 'none'; // Force hide
    });
    
    // Remove active class from all tab headers - check both possible class names
    const headers = document.querySelectorAll('.pathogen-tab-header, .tab-button');
    console.log('🔍 TAB NAVIGATION - Found', headers.length, 'tab headers to deactivate');
    headers.forEach(header => header.classList.remove('active'));
    
    // Show selected tab panel
    const selectedPanel = document.getElementById(`tab-${fluorophore}`);
    console.log('🔍 TAB NAVIGATION - Looking for panel with ID:', `tab-${fluorophore}`);
    if (selectedPanel) {
        selectedPanel.classList.add('active');
        selectedPanel.style.display = 'block'; // Force show
        console.log('🔍 TAB NAVIGATION - Successfully activated panel for:', fluorophore);
    } else {
        console.error('🔍 TAB NAVIGATION - Panel not found for:', fluorophore);
    }
    
    // Add active class to clicked tab header - try multiple approaches
    let selectedHeader = document.querySelector(`[data-fluorophore="${fluorophore}"]`);
    console.log('🔍 TAB NAVIGATION - Looking for header with data-fluorophore:', fluorophore);
    
    // Fallback: try finding by onclick attribute (for history mode)
    if (!selectedHeader) {
        selectedHeader = document.querySelector(`[onclick*="showPathogenTab('${fluorophore}')"]`);
        console.log('🔍 TAB NAVIGATION - Fallback: Looking for header with onclick containing:', fluorophore);
    }
    
    // Another fallback: find button that contains fluorophore name in text
    if (!selectedHeader) {
        const buttons = document.querySelectorAll('.tab-button, .pathogen-tab-header');
        for (const button of buttons) {
            if (button.textContent && button.textContent.includes(fluorophore)) {
                selectedHeader = button;
                console.log('🔍 TAB NAVIGATION - Found header by text content:', fluorophore);
                break;
            }
        }
    }
    
    if (selectedHeader) {
        selectedHeader.classList.add('active');
        console.log('🔍 TAB NAVIGATION - Successfully activated header for:', fluorophore);
    } else {
        console.error('🔍 TAB NAVIGATION - Header not found for:', fluorophore);
    }
    
    console.log('🔍 TAB NAVIGATION - Tab switch completed for:', fluorophore);
}

function createBVPanelPCR3GridsWithData(container, controlSets) {
    const pathogens = [
        { name: 'Bifidobacterium breve', fluorophore: 'Cy5', coordinates: ['A1', 'A5', 'A9', 'A13'] },
        { name: 'Gardnerella vaginalis', fluorophore: 'FAM', coordinates: ['B1', 'B5', 'B9', 'B13'] },
        { name: 'Lactobacillus acidophilus', fluorophore: 'HEX', coordinates: ['C1', 'C5', 'C9', 'C13'] },
        { name: 'Prevotella bivia', fluorophore: 'Texas Red', coordinates: ['D1', 'D5', 'D9', 'D13'] }
    ];
    
    let gridHTML = '';
    
    pathogens.forEach(pathogen => {
        gridHTML += createSinglePathogenGrid(pathogen, controlSets);
    });
    
    container.innerHTML = gridHTML;
    console.log('Real data pathogen grids created for BVPanelPCR3 test');
}

function createSinglePathogenGrid(pathogen, controlSets) {
    const controlTypes = ['H', 'M', 'L', 'NTC'];
    const sets = [1, 2, 3, 4];
    
    let gridHTML = `
        <div class="pathogen-control-grid">
            <h5>${pathogen.name} (${pathogen.fluorophore})</h5>
            <div class="pathogen-grid">
                <div class="pathogen-grid-corner"></div>
                <div class="pathogen-grid-corner"></div>
                <div class="pathogen-set-header">1</div>
                <div class="pathogen-set-header">2</div>
                <div class="pathogen-set-header">3</div>
                <div class="pathogen-set-header">4</div>
    `;
    
    controlTypes.forEach((controlType, typeIndex) => {
        const coordinate = pathogen.coordinates[typeIndex];
        const ntcClass = controlType === 'NTC' ? ' ntc-label' : '';
        
        gridHTML += `
            <div class="pathogen-coord-label">${coordinate}</div>
            <div class="pathogen-type-label${ntcClass}">${controlType}</div>
        `;
        
        sets.forEach(setNum => {
            const controlResult = getControlResult(controlSets, pathogen.fluorophore, controlType, setNum);
            gridHTML += `<div class="pathogen-control-cell ${controlResult.class}" title="${controlResult.tooltip}">${controlResult.symbol}</div>`;
        });
    });
    
    gridHTML += `
            </div>
        </div>
    `;
    
    return gridHTML;
}



// Export functions for use in main script
window.showPathogenGridsWithData = showPathogenGridsWithData;
window.createTabbedPathogenGrids = createTabbedPathogenGrids;
window.showPathogenTab = showPathogenTab;
window.extractControlGridData = extractControlGridData;
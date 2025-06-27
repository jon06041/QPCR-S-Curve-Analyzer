/**
 * Real Control Data Integration for Pathogen Grids
 * Creates tabbed interface showing one pathogen's controls at a time
 */

function showPathogenGridsWithData(testCode, controlSets) {
    console.log('🔍 PATHOGEN GRID - showPathogenGridsWithData called with testCode:', testCode);
    console.log('🔍 PATHOGEN GRID - controlSets:', controlSets);
    
    const container = document.getElementById('pathogenControlGrids');
    if (!container) {
        console.log('🔍 PATHOGEN GRID - Container pathogenControlGrids not found');
        return;
    }
    
    // Get real control validation data from current analysis
    console.log('🔍 PATHOGEN GRID - About to call getRealControlValidationData()');
    const controlValidationData = getRealControlValidationData();
    console.log('🔍 PATHOGEN GRID - Real control validation data received:', controlValidationData);
    console.log('🔍 PATHOGEN GRID - Control data keys count:', Object.keys(controlValidationData).length);
    
    container.style.display = 'block';
    container.innerHTML = '';
    
    if (testCode === 'BVAB') {
        createTabbedPathogenGrids(container, 'BVAB', controlValidationData);
    } else if (testCode === 'BVPanelPCR3') {
        createTabbedPathogenGrids(container, 'BVPanelPCR3', controlValidationData);
    } else if (testCode === 'Cglab') {
        createTabbedPathogenGrids(container, 'Cglab', controlValidationData);
    } else if (testCode === 'Ngon') {
        createTabbedPathogenGrids(container, 'Ngon', controlValidationData);
    } else {
        // Fallback to static grids for unknown test codes
        showPathogenGrids(testCode);
    }
}

function getRealControlValidationData() {
    console.log('🔍 CONTROL GRID DATA - Starting real control validation data extraction');
    console.log('🔍 CONTROL GRID DATA - Current analysis results available:', !!window.currentAnalysisResults);
    console.log('🔍 CONTROL GRID DATA - Analysis results count:', window.currentAnalysisResults ? window.currentAnalysisResults.length : 0);
    const controlData = {};
    
    if (!window.currentAnalysisResults || window.currentAnalysisResults.length === 0) {
        console.log('🔍 CONTROL DATA - No current analysis results available');
        return controlData;
    }
    
    // First, show all unique sample names for debugging
    const allSampleNames = [...new Set(window.currentAnalysisResults.map(w => w.sample_name || 'UNNAMED'))];
    console.log('🔍 CONTROL DATA - All sample names in session:', allSampleNames.slice(0, 50));
    
    // Show wells with their coordinates and sample names for debugging
    const wellsWithCoords = window.currentAnalysisResults.slice(0, 20).map(w => ({
        wellId: w.well_id,
        coordinate: w.well_id ? w.well_id.split('_')[0] : 'Unknown',
        sampleName: w.sample_name,
        amplitude: w.amplitude
    }));
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
        const coordinate = well.well_id ? well.well_id.split('_')[0] : 'Unknown';
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
        return match ? match[1] : 'AcBVAB';
    }
    
    const testPattern = window.currentAnalysisResults && window.currentAnalysisResults.length > 0 ? 
        extractTestPattern(window.currentAnalysisResults[0].sample_name || '') : 'AcBVAB';
    
    const controlSamples = [];
    
    if (window.currentAnalysisResults) {
        window.currentAnalysisResults.forEach(well => {
            const sampleName = well.sample_name || '';
            const coordinate = well.well_id ? well.well_id.split('_')[0] : 'Unknown';
            const fluorophore = well.well_id ? well.well_id.split('_')[1] : 'Unknown';
            
            // Same logic as the results table filter: samples that start with test pattern
            if (sampleName.startsWith(testPattern)) {
                controlSamples.push({
                    coordinate: coordinate,
                    sampleName: sampleName,
                    fluorophore: fluorophore,
                    amplitude: well.amplitude || 0,
                    wellId: well.well_id
                });
            }
        });
    }
    
    console.log('🔍 CONTROL DATA - Real control samples found (from results table logic):');
    console.log(`🔍 Test pattern: "${testPattern}"`);
    controlSamples.forEach(control => {
        console.log(`  ${control.coordinate}: ${control.sampleName} (${control.fluorophore}, amp: ${control.amplitude.toFixed(1)})`);
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
        
        // Parse control type from sample name (priority order for better matching)
        if (sampleName.includes('NTC')) {
            controlType = 'NTC';
        } else if (sampleName.match(/\bH\b/) || sampleName.match(/H-\d/) || sampleName.match(/H\d/)) {
            controlType = 'H';
        } else if (sampleName.match(/\bM\b/) || sampleName.match(/M-\d/) || sampleName.match(/M\d/)) {
            controlType = 'M';
        } else if (sampleName.match(/\bL\b/) || sampleName.match(/L-\d/) || sampleName.match(/L\d/)) {
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
        const fluorophore = well.well_id ? well.well_id.split('_')[1] : 'Unknown';
        const coordinate = well.well_id ? well.well_id.split('_')[0] : 'Unknown';
        
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
            const key = `${fluorophore}_${fallbackControlInfo.type}_${fallbackControlInfo.set}`;
            
            // Only add if not already found via coordinate mapping
            if (!controlData[key]) {
                const expected = getExpectedResult(fallbackControlInfo.type);
                const actual = getActualResult(well);
                const isValid = (expected === actual);
                
                controlData[key] = {
                    fluorophore: fluorophore,
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
                
                console.log(`🔍 CONTROL DATA - Found pattern-based control: ${key}`, controlData[key]);
            }
        }
        
        if (potentialControls.includes(sampleName) && !coordinateToControlInfo[coordinate] && !getControlTypeAndSetFromSample(sampleName)) {
            console.log(`🔍 CONTROL DATA - Unmatched potential control: "${sampleName}" in well ${well.well_id} (${coordinate})`);
        }
    });
    
    console.log('🔍 CONTROL DATA - Final control data keys:', Object.keys(controlData));
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
    // Use the same comprehensive validation logic as the main analysis
    const amplitude = wellData.amplitude || 0;
    const isGoodCurve = wellData.is_good_scurve || false;
    
    // Check for anomalies using the same logic as main analysis
    let hasAnomalies = false;
    if (wellData.anomalies) {
        try {
            const anomalies = typeof wellData.anomalies === 'string' ? 
                JSON.parse(wellData.anomalies) : wellData.anomalies;
            hasAnomalies = Array.isArray(anomalies) && anomalies.length > 0 && 
                          !(anomalies.length === 1 && anomalies[0] === 'None');
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
    let pathogens = [];
    
    if (testCode === 'BVAB') {
        pathogens = [
            { name: 'BVAB1', fluorophore: 'HEX' },
            { name: 'BVAB2', fluorophore: 'FAM' },
            { name: 'BVAB3', fluorophore: 'Cy5' }
        ];
    } else if (testCode === 'BVPanelPCR3') {
        pathogens = [
            { name: 'Bifidobacterium breve', fluorophore: 'Cy5' },
            { name: 'Gardnerella vaginalis', fluorophore: 'FAM' },
            { name: 'Lactobacillus acidophilus', fluorophore: 'HEX' },
            { name: 'Prevotella bivia', fluorophore: 'Texas Red' }
        ];
    } else if (testCode === 'Cglab') {
        pathogens = [
            { name: 'Candida glabrata', fluorophore: 'FAM' }
        ];
    } else if (testCode === 'Ngon') {
        pathogens = [
            { name: 'Neisseria gonhorrea', fluorophore: 'HEX' }
        ];
    }
    
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
        tabsHTML += createSinglePathogenControlGrid(pathogen, controlData);
        tabsHTML += '</div>';
    });
    tabsHTML += '</div>';
    
    tabsHTML += '</div>';
    
    container.innerHTML = tabsHTML;
    console.log('Tabbed pathogen grids created for', testCode);
}

function createSinglePathogenControlGrid(pathogen, controlData) {
    const controlTypes = ['H', 'M', 'L', 'NTC'];
    
    // Get actual control sets with their coordinates from the data
    const controlSets = getControlSetsForPathogen(pathogen.fluorophore, controlData);
    const setNumbers = Object.keys(controlSets).sort();
    
    console.log(`🔍 PATHOGEN GRID - ${pathogen.name} control sets:`, controlSets);
    
    let gridHTML = `
        <div class="single-pathogen-grid">
            <h4>${pathogen.name} (${pathogen.fluorophore})</h4>
            <div class="control-grid-table" data-sets="${setNumbers.length}">
                <div class="grid-header">
                    <div class="grid-corner">Control</div>
    `;
    
    // Dynamic set headers based on actual data
    setNumbers.forEach(setNum => {
        gridHTML += `<div class="set-header">Set ${setNum}</div>`;
    });
    gridHTML += `</div>`;
    
    controlTypes.forEach(controlType => {
        const ntcClass = controlType === 'NTC' ? ' ntc-row' : '';
        gridHTML += `<div class="control-row${ntcClass}">`;
        gridHTML += `<div class="control-type-label">${controlType}</div>`;
        
        setNumbers.forEach(setNum => {
            const key = `${pathogen.fluorophore}_${controlType}_${setNum}`;
            const controlInfo = controlData[key];
            
            let cellClass = 'pending';
            let symbol = '-';
            let coordinate = '?';
            let tooltip = `${controlType} Set ${setNum}: No data available`;
            
            if (controlInfo) {
                cellClass = controlInfo.isValid ? 'valid' : 'invalid';
                symbol = controlInfo.isValid ? '✓' : '✗';
                coordinate = controlInfo.coordinate;
                tooltip = `${controlType} Set ${setNum} (${coordinate}): Expected ${controlInfo.expected}, Got ${controlInfo.actual} (Amplitude: ${controlInfo.amplitude.toFixed(1)})`;
            } else {
                // Check if this set exists for this fluorophore
                const setData = controlSets[setNum];
                if (setData && setData[controlType]) {
                    coordinate = setData[controlType].coordinate;
                    tooltip = `${controlType} Set ${setNum} (${coordinate}): Expected data not found`;
                }
            }
            
            gridHTML += `<div class="control-cell ${cellClass}" title="${tooltip}">
                <span class="control-symbol">${symbol}</span>
                <span class="control-coordinate">${coordinate}</span>
            </div>`;
        });
        
        gridHTML += '</div>';
    });
    
    gridHTML += `
            </div>
        </div>
    `;
    
    return gridHTML;
}

function getControlSetsForPathogen(fluorophore, controlData) {
    const controlSets = {};
    
    // Group control data by set number for this specific fluorophore
    Object.keys(controlData).forEach(key => {
        const control = controlData[key];
        if (control.fluorophore === fluorophore) {
            const setNum = control.setNumber;
            if (!controlSets[setNum]) {
                controlSets[setNum] = {};
            }
            controlSets[setNum][control.controlType] = {
                coordinate: control.coordinate,
                amplitude: control.amplitude,
                isValid: control.isValid
            };
        }
    });
    
    return controlSets;
}

function showPathogenTab(fluorophore) {
    // Hide all tab panels
    const panels = document.querySelectorAll('.pathogen-tab-panel');
    panels.forEach(panel => panel.classList.remove('active'));
    
    // Remove active class from all tab headers
    const headers = document.querySelectorAll('.pathogen-tab-header');
    headers.forEach(header => header.classList.remove('active'));
    
    // Show selected tab panel
    const selectedPanel = document.getElementById(`tab-${fluorophore}`);
    if (selectedPanel) {
        selectedPanel.classList.add('active');
    }
    
    // Add active class to clicked tab header
    const selectedHeader = document.querySelector(`[onclick="showPathogenTab('${fluorophore}')"]`);
    if (selectedHeader) {
        selectedHeader.classList.add('active');
    }
    
    console.log('Switched to pathogen tab:', fluorophore);
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
window.getRealControlValidationData = getRealControlValidationData;
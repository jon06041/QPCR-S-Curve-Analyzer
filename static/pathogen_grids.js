// Main Control Grid System - Separate grid for each pathogen showing its 4 control sets
function createPathogenGridsDisplay(controlSets) {
    console.log('🔍 PATHOGEN GRIDS - Creating pathogen-specific control grids');
    
    const pathogenSection = document.getElementById('pathogen-grids-section');
    if (!pathogenSection) {
        console.log('🔍 PATHOGEN GRIDS - Section not found');
        return;
    }

    // Detect available pathogens from current analysis
    const pathogens = detectAvailablePathogens();
    
    if (pathogens.length === 0) {
        console.log('🔍 PATHOGEN GRIDS - No pathogens detected');
        pathogenSection.innerHTML = '<p>No pathogen data available for control validation.</p>';
        return;
    }

    // Create tabbed interface for multiple pathogens
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'pathogen-tabs-container';
    
    // Create tab buttons
    const tabButtons = document.createElement('div');
    tabButtons.className = 'pathogen-tab-buttons';
    
    // Create tab contents
    const tabContents = document.createElement('div');
    tabContents.className = 'pathogen-tab-contents';
    
    let firstTab = true;
    
    pathogens.forEach(pathogen => {
        // Create tab button
        const button = document.createElement('button');
        button.className = `pathogen-tab-button ${firstTab ? 'active' : ''}`;
        button.textContent = `${pathogen.name} (${pathogen.fluorophore})`;
        button.onclick = () => switchPathogenTab(pathogen.key);
        tabButtons.appendChild(button);
        
        // Create tab content with pathogen-specific control grid
        const content = document.createElement('div');
        content.className = `pathogen-tab-content ${firstTab ? 'active' : ''}`;
        content.id = `pathogen-tab-${pathogen.key}`;
        
        // Create pathogen-specific control grid
        const pathogenGrid = createPathogenSpecificControlGrid(pathogen);
        content.appendChild(pathogenGrid);
        
        tabContents.appendChild(content);
        firstTab = false;
    });
    
    tabsContainer.appendChild(tabButtons);
    tabsContainer.appendChild(tabContents);
    
    // Clear and add to section
    pathogenSection.innerHTML = '';
    pathogenSection.appendChild(tabsContainer);
    
    console.log('🔍 PATHOGEN GRIDS - Created grids for', pathogens.length, 'pathogens');
}

// Detect available pathogens from current analysis results
function detectAvailablePathogens() {
    const pathogens = [];
    
    if (!window.currentAnalysisResults || window.currentAnalysisResults.length === 0) {
        console.log('🔍 PATHOGEN GRIDS - No current analysis results available');
        return pathogens;
    }
    
    // Get unique fluorophores from current results
    let fluorophores = [];
    
    // Check if currentAnalysisResults is an array or object
    if (Array.isArray(window.currentAnalysisResults)) {
        fluorophores = [...new Set(window.currentAnalysisResults.map(result => {
            if (result.well_id && result.well_id.includes('_')) {
                return result.well_id.split('_')[1];
            }
            return null;
        }).filter(f => f))];
    } else if (window.currentAnalysisResults && typeof window.currentAnalysisResults === 'object') {
        // Handle individual_results object structure
        fluorophores = [...new Set(Object.keys(window.currentAnalysisResults).map(wellKey => {
            if (wellKey.includes('_')) {
                return wellKey.split('_')[1];
            }
            return null;
        }).filter(f => f))];
    }
    
    console.log('🔍 PATHOGEN GRIDS - Detected fluorophores:', fluorophores);
    
    // Map fluorophores to pathogen targets
    const pathogenMapping = {
        'HEX': { name: 'BVAB1', key: 'BVAB1' },
        'FAM': { name: 'BVAB2', key: 'BVAB2' },
        'Cy5': { name: 'BVAB3', key: 'BVAB3' },
        'Texas Red': { name: 'BVPanelPCR3-TexasRed', key: 'BVPanelPCR3_TexasRed' }
    };
    
    fluorophores.forEach(fluorophore => {
        if (pathogenMapping[fluorophore]) {
            pathogens.push({
                ...pathogenMapping[fluorophore],
                fluorophore: fluorophore
            });
        }
    });
    
    console.log('🔍 PATHOGEN GRIDS - Mapped pathogens:', pathogens);
    return pathogens;
}

// Create pathogen-specific control grid showing 4 control sets for this pathogen's fluorophore
function createPathogenSpecificControlGrid(pathogen) {
    console.log('🔍 PATHOGEN GRIDS - Building control grid for', pathogen.name, pathogen.fluorophore);
    
    // Use real extracted coordinates from control sets instead of hardcoded mapping
    const controlCoordinates = {};
    
    // Extract real coordinates from the pathogen control data
    if (pathogen.controls) {
        Object.entries(pathogen.controls).forEach(([controlType, coordinates]) => {
            coordinates.forEach((coord, index) => {
                const controlKey = `${controlType}${index + 1}`;
                controlCoordinates[controlKey] = coord;
                console.log(`🔍 PATHOGEN GRIDS - Real coordinate mapping: ${controlKey} -> ${coord}`);
            });
        });
    } else {
        console.log('🔍 PATHOGEN GRIDS - No real control data available, using fallback coordinates');
        // Fallback to hardcoded coordinates if no real data
        const fallbackCoordinates = {
            'H1': 'G10', 'M1': 'G11', 'L1': 'G12', 'NTC1': 'G13',
            'H2': 'K19', 'M2': 'K20', 'L2': 'K21', 'NTC2': 'K22',
            'H3': 'A15', 'M3': 'A16', 'L3': 'A17', 'NTC3': 'A18',
            'H4': 'M5',  'M4': 'M6',  'L4': 'M7',  'NTC4': 'M8'
        };
        Object.assign(controlCoordinates, fallbackCoordinates);
    }
    
    // Create grid container
    const gridContainer = document.createElement('div');
    gridContainer.className = 'pathogen-control-grid';
    
    // Remove title per user request - "validation" is understood
    
    // Create grid with 5 columns (empty corner + 4 sets)
    const grid = document.createElement('div');
    grid.className = 'control-grid-layout';
    
    // Header row
    grid.appendChild(createGridCell('', 'grid-corner'));
    grid.appendChild(createGridCell('Set 1', 'set-header'));
    grid.appendChild(createGridCell('Set 2', 'set-header'));
    grid.appendChild(createGridCell('Set 3', 'set-header'));
    grid.appendChild(createGridCell('Set 4', 'set-header'));
    
    // Control type rows
    const controlTypes = ['H', 'M', 'L', 'NTC'];
    
    controlTypes.forEach(controlType => {
        // Row label
        grid.appendChild(createGridCell(controlType, 'control-type-label'));
        
        // Control cells for each set
        for (let set = 1; set <= 4; set++) {
            const controlKey = `${controlType}${set}`;
            const coordinate = controlCoordinates[controlKey];
            const validation = getControlValidation(coordinate, pathogen.fluorophore);
            
            const cell = createControlCell(coordinate, validation, controlKey);
            grid.appendChild(cell);
        }
    });
    
    gridContainer.appendChild(grid);
    return gridContainer;
}

// Switch between pathogen tabs
function switchPathogenTab(pathogenKey) {
    console.log('🔍 PATHOGEN GRIDS - Switching to pathogen tab:', pathogenKey);
    
    // Update tab buttons
    document.querySelectorAll('.pathogen-tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Update tab contents
    document.querySelectorAll('.pathogen-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const targetContent = document.getElementById(`pathogen-tab-${pathogenKey}`);
    if (targetContent) {
        targetContent.classList.add('active');
    }
}

// Create a grid cell with specified content and class
function createGridCell(content, className) {
    const cell = document.createElement('div');
    cell.className = className;
    cell.textContent = content;
    return cell;
}

// Create a control cell with coordinate and validation
function createControlCell(coordinate, validation, controlKey) {
    const cell = document.createElement('div');
    cell.className = `control-cell ${validation.status}`;
    cell.setAttribute('title', `${controlKey}: ${coordinate} - ${validation.message}`);
    
    // Add data attributes for real coordinate updating
    let controlType, setNumber;
    if (controlKey.startsWith('NTC')) {
        controlType = 'NTC';
        setNumber = controlKey.slice(3); // Get number after "NTC"
    } else {
        controlType = controlKey.charAt(0); // H, M, or L
        setNumber = controlKey.slice(1); // Get number after letter
    }
    cell.setAttribute('data-control-type', controlType);
    cell.setAttribute('data-set', setNumber);
    
    // Add validation symbol
    const symbol = document.createElement('div');
    symbol.className = 'validation-symbol';
    symbol.textContent = validation.symbol;
    cell.appendChild(symbol);
    
    // Add coordinate (will be replaced with real coordinates)
    const coordDiv = document.createElement('div');
    coordDiv.className = 'coordinate-text';
    coordDiv.textContent = coordinate;
    cell.appendChild(coordDiv);
    
    console.log(`🔍 PATHOGEN GRIDS - Created cell for ${controlKey} at ${coordinate}: ${validation.symbol} (data-control-type: ${controlType}, data-set: ${setNumber})`);
    return cell;
    
    return cell;
}

// Get validation status for a control coordinate with specific fluorophore
function getControlValidation(coordinate, fluorophore) {
    console.log(`🔍 PATHOGEN GRIDS - Checking validation for coordinate: ${coordinate} (${fluorophore})`);
    
    // Check if we have current analysis results
    if (!window.currentAnalysisResults || 
        (Array.isArray(window.currentAnalysisResults) && window.currentAnalysisResults.length === 0) ||
        (typeof window.currentAnalysisResults === 'object' && Object.keys(window.currentAnalysisResults).length === 0)) {
        console.log('🔍 PATHOGEN GRIDS - No current analysis results');
        return { symbol: '−', status: 'missing', message: 'No data available' };
    }
    
    // Look for this coordinate + fluorophore combination in current results
    let coordinateResults = [];
    
    // Handle both array and object structures
    if (Array.isArray(window.currentAnalysisResults)) {
        coordinateResults = window.currentAnalysisResults.filter(result => {
            if (!result.well_id) return false;
            const wellParts = result.well_id.split('_');
            const wellCoord = wellParts[0]; // Extract coordinate part
            const wellFluor = wellParts[1]; // Extract fluorophore part
            return wellCoord === coordinate && wellFluor === fluorophore;
        });
    } else if (window.currentAnalysisResults && typeof window.currentAnalysisResults === 'object') {
        // Handle individual_results object structure
        const targetWellKey = `${coordinate}_${fluorophore}`;
        if (window.currentAnalysisResults[targetWellKey]) {
            coordinateResults = [window.currentAnalysisResults[targetWellKey]];
        }
    }
    
    if (coordinateResults.length === 0) {
        console.log(`🔍 PATHOGEN GRIDS - No results found for coordinate ${coordinate}_${fluorophore}`);
        return { symbol: '−', status: 'missing', message: 'No data for this coordinate/fluorophore' };
    }
    
    console.log(`🔍 PATHOGEN GRIDS - Found ${coordinateResults.length} results for ${coordinate}_${fluorophore}`);
    
    // Check validation based on control type using same POS/NEG/REDO criteria as main analysis
    const controlType = getControlTypeFromCoordinate(coordinate);
    let isValid = false;
    let message = '';
    
    // Validate based on control type expectations using the first result
    const result = coordinateResults[0];
    const amplitude = result.amplitude || 0;
    const isGoodCurve = result.is_good_scurve || false;
    const anomalies = result.anomalies || 'None';
    const r2Score = result.r2_score || 0;
    
    // Use same POS/NEG/REDO classification as main analysis
    function getResultClassification(wellData) {
        const amplitude = wellData.amplitude || 0;
        
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
        const isGoodSCurve = wellData.is_good_scurve || false;
        if (isGoodSCurve && amplitude > 500 && !hasAnomalies) {
            return 'POS';
        } else if (amplitude < 400) {
            return 'NEG';
        } else {
            return 'REDO';
        }
    }
    
    const actualResult = getResultClassification(result);
    
    if (controlType === 'NTC') {
        // NTC controls should be NEG
        isValid = (actualResult === 'NEG');
        if (isValid) {
            message = `NTC valid: ${actualResult} (amp: ${amplitude.toFixed(1)}, curve: ${isGoodCurve ? 'Good' : 'Poor'})`;
        } else {
            message = `NTC invalid: ${actualResult} (amp: ${amplitude.toFixed(1)}, curve: ${isGoodCurve ? 'Good' : 'Poor'}, R²: ${r2Score.toFixed(3)})`;
        }
    } else {
        // H, M, L controls should be POS
        isValid = (actualResult === 'POS');
        if (isValid) {
            message = `${controlType} valid: ${actualResult} (amp: ${amplitude.toFixed(1)}, curve: ${isGoodCurve ? 'Good' : 'Poor'})`;
        } else {
            if (actualResult === 'NEG') {
                message = `${controlType} invalid: ${actualResult} (amp: ${amplitude.toFixed(1)} < 400)`;
            } else {
                message = `${controlType} invalid: ${actualResult} (amp: ${amplitude.toFixed(1)}, curve: ${isGoodCurve ? 'Good' : 'Poor'}, anomalies: ${anomalies})`;
            }
        }
    }
    
    const validation = {
        symbol: isValid ? '✓' : '✗',
        status: isValid ? 'valid' : 'invalid',
        message: message
    };
    
    console.log(`🔍 PATHOGEN GRIDS - Validation for ${coordinate}_${fluorophore}: ${validation.symbol} (${validation.message})`);
    
    // Additional debug for specific controls
    if (coordinate === 'K5') {
        console.log(`🔍 K5 DEBUG - amplitude: ${amplitude}, actualResult: ${actualResult}, isValid: ${isValid}, controlType: ${controlType}`);
        console.log(`🔍 K5 DEBUG - isGoodCurve: ${result.is_good_scurve}, anomalies: ${result.anomalies}`);
    }
    
    return validation;
}

// Determine control type from coordinate using the mapping
function getControlTypeFromCoordinate(coordinate) {
    const coordinateMap = {
        'G10': 'H', 'G11': 'M', 'G12': 'L', 'G13': 'NTC',
        'K19': 'H', 'K20': 'M', 'K21': 'L', 'K22': 'NTC',
        'A15': 'H', 'A16': 'M', 'A17': 'L', 'A18': 'NTC',
        'M5': 'H',  'M6': 'M',  'M7': 'L',  'M8': 'NTC'
    };
    
    return coordinateMap[coordinate] || 'Unknown';
}

// Initialize pathogen grids when called
function initializePathogenGrids() {
    console.log('🔍 PATHOGEN GRIDS - Initializing main control grid system');
    createPathogenGridsDisplay();
}

// Export functions for global access
window.createPathogenGridsDisplay = createPathogenGridsDisplay;
window.initializePathogenGrids = initializePathogenGrids;
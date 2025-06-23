// Global variables
let amplificationFiles = {}; // Store multiple fluorophore files
let cqData = null;
let samplesData = null;
let analysisResults = {};
let currentChart = null;
let selectedFluorophore = null;

// DOM elements
const fileUpload = document.getElementById('fileUpload');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const analyzeBtn = document.getElementById('analyzeBtn');
const analysisSection = document.getElementById('analysisSection');
const loadingIndicator = document.getElementById('loadingIndicator');

// File upload handling
fileUpload.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileUpload.classList.add('dragover');
});

fileUpload.addEventListener('dragleave', () => {
    fileUpload.classList.remove('dragover');
});

fileUpload.addEventListener('drop', (e) => {
    e.preventDefault();
    fileUpload.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileUpload(files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        // Handle multiple files
        for (let i = 0; i < e.target.files.length; i++) {
            handleFileUpload(e.target.files[i], 'amplification');
        }
    }
});

// Add event listeners for additional file inputs
const cqInput = document.getElementById('cqInput');
const samplesInput = document.getElementById('samplesInput');

if (cqInput) {
    cqInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0], 'cq');
        }
    });
}

if (samplesInput) {
    samplesInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0], 'samples');
        }
    });
}

function handleFileUpload(file, type = 'amplification') {
    if (!file.name.toLowerCase().endsWith('.csv')) {
        alert('Please upload a CSV file');
        return;
    }

    // Validate filename pattern: testName_1234567_CFX123456 (allows additional suffixes)
    const filenamePattern = /^[A-Za-z][A-Za-z0-9]*_\d+_CFX\d+/i;
    if (!filenamePattern.test(file.name)) {
        alert(`Invalid filename pattern. Expected format: testName_1234567_CFX123456\nYour file: ${file.name}`);
        return;
    }

    Papa.parse(file, {
        complete: function(results) {
            if (results.errors.length > 0) {
                alert(`Error parsing ${type} CSV file: ` + results.errors[0].message);
                return;
            }
            
            if (!results.data || results.data.length === 0) {
                alert(`${type} CSV file appears to be empty`);
                return;
            }
            
            console.log(`Parsed ${type} data:`, results.data.slice(0, 3));
            
            // Store data based on type
            switch(type) {
                case 'amplification':
                    const fluorophore = detectFluorophoreFromFilename(file.name);
                    amplificationFiles[fluorophore] = {
                        data: results.data,
                        fileName: file.name,
                        fluorophore: fluorophore
                    };
                    updateAmplificationFilesList();
                    updateFileStatus('amplificationStatus', `${Object.keys(amplificationFiles).length} file(s) uploaded`, true);
                    break;
                case 'samples':
                    samplesData = results.data;
                    samplesData.fileName = file.name;
                    updateFileStatus('samplesStatus', file.name, true);
                    break;
            }
            
            // Check if we can enable analysis
            checkAnalysisReady();
        },
        header: false,
        skipEmptyLines: true,
        dynamicTyping: true
    });
}

function updateFileStatus(statusId, fileName, success) {
    const statusElement = document.getElementById(statusId);
    if (statusElement) {
        if (success) {
            statusElement.textContent = `✓ ${fileName}`;
            statusElement.className = 'file-status uploaded';
        } else {
            statusElement.textContent = `✗ Error loading file`;
            statusElement.className = 'file-status error';
        }
    }
}

function checkAnalysisReady() {
    const analyzeBtn = document.getElementById('analyzeBtn');
    const hasAmplificationData = Object.keys(amplificationFiles).length > 0;
    
    if (hasAmplificationData && analyzeBtn) {
        analyzeBtn.style.display = 'block';
        
        // Update button text based on available data
        const fluorophoreCount = Object.keys(amplificationFiles).length;
        let btnText = `🧬 Analyze ${fluorophoreCount} File${fluorophoreCount > 1 ? 's' : ''}`;
        if (samplesData) {
            btnText += ' with Cq Values';
        }
        analyzeBtn.textContent = btnText;
    } else if (analyzeBtn) {
        analyzeBtn.style.display = 'none';
    }
}

function displayFileInfo(file, data) {
    // Parse the CSV data to extract cycle information
    if (data.length < 2) {
        alert('CSV file appears to be empty or invalid');
        return;
    }

    console.log('Total CSV rows:', data.length);
    console.log('First few rows:', data.slice(0, 3));

    // First row should contain headers (cycle, well names)
    const headers = data[0];
    const wellNames = headers.slice(1); // Remove first column (cycles)
    
    // Extract cycle data - check both first and second columns for cycle numbers
    const cycles = [];
    const invalidRows = [];
    let cycleColumnIndex = 0;
    
    // Smart detection of cycle column - same logic as prepareAnalysisData
    for (let i = 0; i < headers.length; i++) {
        if (headers[i] && headers[i].toLowerCase().includes('cycle')) {
            cycleColumnIndex = i;
            console.log(`Found "Cycle" header in column ${i}`);
            break;
        }
    }
    
    // Auto-detect by examining data patterns if no "Cycle" header found
    if (cycleColumnIndex === 0 && (!headers[0] || !headers[0].toLowerCase().includes('cycle'))) {
        for (let col = 0; col < Math.min(3, headers.length); col++) {
            let validNumbers = 0;
            let sequentialPattern = true;
            let lastNum = 0;
            
            for (let row = 1; row < Math.min(6, data.length); row++) {
                if (data[row] && data[row][col] !== undefined && data[row][col] !== '' && !isNaN(data[row][col])) {
                    const num = parseFloat(data[row][col]);
                    validNumbers++;
                    
                    if (row === 1) {
                        lastNum = num;
                    } else if (num !== lastNum + 1) {
                        sequentialPattern = false;
                    } else {
                        lastNum = num;
                    }
                }
            }
            
            if (validNumbers >= 3 && sequentialPattern) {
                cycleColumnIndex = col;
                console.log(`Auto-detected cycle column ${col} with sequential pattern`);
                break;
            }
        }
    }
    
    for (let i = 1; i < data.length; i++) {
        const cellValue = data[i][cycleColumnIndex];
        if (cellValue !== undefined && cellValue !== '' && !isNaN(cellValue)) {
            cycles.push(parseFloat(cellValue));
        } else {
            invalidRows.push({row: i, value: cellValue, column: cycleColumnIndex});
        }
    }
    
    console.log('Valid cycles found:', cycles.length);
    console.log('Invalid rows:', invalidRows.slice(0, 5)); // Show first 5 invalid rows
    console.log('Cycle range detected:', cycles.length > 0 ? `${Math.min(...cycles)} to ${Math.max(...cycles)}` : 'none');
    
    if (cycles.length === 0) {
        alert('No valid cycle data found in CSV. Check console for details.');
        return;
    }

    const minCycle = Math.min(...cycles);
    const maxCycle = Math.max(...cycles);
    const cycleCount = cycles.length;

    // Update file info display
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = (file.size / 1024).toFixed(1) + ' KB';
    document.getElementById('cycleRange').textContent = `${minCycle} - ${maxCycle} (${cycleCount} cycles)`;
    document.getElementById('wellCount').textContent = wellNames.length;

    fileInfo.style.display = 'block';
}

// Analysis button handler
analyzeBtn.addEventListener('click', performAnalysis);

async function performAnalysis() {
    if (Object.keys(amplificationFiles).length === 0) {
        alert('Please upload at least one amplification CSV file first');
        return;
    }
    
    if (!samplesData) {
        alert('Please upload the Quantification Summary CSV file for sample names and Cq values');
        return;
    }

    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) loadingIndicator.style.display = 'flex';

    try {
        // Analyze ALL uploaded fluorophores
        const allResults = {};
        const fluorophores = Object.keys(amplificationFiles);
        
        for (const fluorophore of fluorophores) {
            console.log(`Analyzing ${fluorophore}...`);
            
            const selectedFile = amplificationFiles[fluorophore];
            const analysisData = prepareAnalysisData(selectedFile.data);
            
            // Validate we have data to analyze
            if (!analysisData || Object.keys(analysisData).length === 0) {
                console.warn(`No valid well data found for ${fluorophore}`);
                continue;
            }
            
            console.log('Sending analysis data for', fluorophore, ':', analysisData);
            
            // Send to backend for analysis
            const response = await fetch('/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Filename': selectedFile.fileName,
                    'X-Fluorophore': fluorophore
                },
                body: JSON.stringify(analysisData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Server error response:', errorData);
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            let results;
            try {
                const responseText = await response.text();
                console.log(`Raw response for ${fluorophore}:`, responseText.substring(0, 500) + '...');
                results = JSON.parse(responseText);
                console.log(`Analysis results for ${fluorophore}:`, results);
                
                // Store results for this fluorophore
                allResults[fluorophore] = results;
                
            } catch (parseError) {
                console.error('JSON parsing error:', parseError);
                throw new Error('Failed to parse server response: ' + parseError.message);
            }
        }
        
        // If only one fluorophore was analyzed, use simple display
        if (fluorophores.length === 1) {
            const singleResult = allResults[fluorophores[0]];
            analysisResults = singleResult;
            
            const filename = amplificationFiles[fluorophores[0]].fileName;
            saveAnalysisToHistory(filename, singleResult);
            displayAnalysisResults(singleResult);
        } else {
            // Combine all fluorophore results for multi-fluorophore display
            const combinedResults = combineMultiFluorophoreResults(allResults);
            analysisResults = combinedResults;
            
            const filename = `Multi-Fluorophore Analysis (${fluorophores.join(', ')})`;
            saveAnalysisToHistory(filename, combinedResults);
            displayMultiFluorophoreResults(combinedResults);
        }
        
    } catch (error) {
        console.error('Analysis error:', error);
        alert('Error performing analysis: ' + error.message);
    } finally {
        loadingIndicator.style.display = 'none';
    }
}

function prepareAnalysisData(data = null) {
    // Use selected fluorophore data if no specific data provided
    if (!data && selectedFluorophore && amplificationFiles[selectedFluorophore]) {
        data = amplificationFiles[selectedFluorophore].data;
    }
    
    console.log('Raw CSV data:', data);
    
    if (!data || data.length < 2) {
        console.error('Insufficient CSV data');
        return {};
    }
    
    const headers = data[0];
    console.log('Headers:', headers);
    
    if (!headers || headers.length < 2) {
        console.error('Invalid headers');
        return {};
    }
    
    // Smart detection of cycle column - handle all CFX Manager formats
    let cycleColumnIndex = -1;
    let wellNames = [];
    
    // Method 1: Look for "Cycle" in headers
    for (let i = 0; i < headers.length; i++) {
        if (headers[i] && headers[i].toLowerCase().includes('cycle')) {
            cycleColumnIndex = i;
            wellNames = headers.slice(i + 1).filter(name => name && name.trim() && !name.toLowerCase().includes('cycle'));
            console.log(`Found "Cycle" header in column ${i}`);
            break;
        }
    }
    
    // Method 2: Auto-detect by examining data patterns
    if (cycleColumnIndex === -1) {
        for (let col = 0; col < Math.min(3, headers.length); col++) {
            let validNumbers = 0;
            let sequentialPattern = true;
            let lastNum = 0;
            
            // Check first 10 rows for numeric sequence
            for (let row = 1; row < Math.min(11, data.length); row++) {
                if (data[row] && data[row][col] !== undefined && data[row][col] !== '' && !isNaN(data[row][col])) {
                    const num = parseFloat(data[row][col]);
                    validNumbers++;
                    
                    if (row === 1) {
                        lastNum = num;
                    } else if (num !== lastNum + 1) {
                        sequentialPattern = false;
                    } else {
                        lastNum = num;
                    }
                }
            }
            
            // If we found a column with sequential numbers, likely cycle data
            if (validNumbers >= 5 && sequentialPattern) {
                cycleColumnIndex = col;
                wellNames = headers.slice(col + 1).filter(name => name && name.trim() && !name.toLowerCase().includes('cycle'));
                console.log(`Auto-detected cycle column ${col} with sequential pattern`);
                break;
            }
        }
    }
    
    // Method 3: Fallback - use first column with most numeric data
    if (cycleColumnIndex === -1) {
        let bestColumn = 0;
        let maxValidNumbers = 0;
        
        for (let col = 0; col < Math.min(3, headers.length); col++) {
            let validNumbers = 0;
            for (let row = 1; row < data.length; row++) {
                if (data[row] && data[row][col] !== undefined && data[row][col] !== '' && !isNaN(data[row][col])) {
                    validNumbers++;
                }
            }
            
            if (validNumbers > maxValidNumbers) {
                maxValidNumbers = validNumbers;
                bestColumn = col;
            }
        }
        
        if (maxValidNumbers > 0) {
            cycleColumnIndex = bestColumn;
            wellNames = headers.slice(bestColumn + 1).filter(name => name && name.trim());
            console.log(`Fallback: using column ${bestColumn} with ${maxValidNumbers} valid numbers`);
        }
    }
    
    if (cycleColumnIndex === -1) {
        console.error('Could not detect cycle column');
        return {};
    }
    
    console.log('Well names:', wellNames);
    
    const wellData = {};
    
    // Extract cycles
    const cycles = [];
    for (let i = 1; i < data.length; i++) {
        if (data[i] && data[i][cycleColumnIndex] !== undefined && data[i][cycleColumnIndex] !== '' && !isNaN(data[i][cycleColumnIndex])) {
            cycles.push(parseFloat(data[i][cycleColumnIndex]));
        }
    }
    
    console.log('Cycles extracted:', cycles.length, 'Range:', cycles.length > 0 ? `${Math.min(...cycles)}-${Math.max(...cycles)}` : 'none', 'First 5:', cycles.slice(0, 5));
    
    if (cycles.length === 0) {
        console.error('No valid cycles found');
        return {};
    }
    
    // Extract RFU data for each well
    const wellStartColumn = cycleColumnIndex + 1;
    wellNames.forEach((wellName, wellIndex) => {
        if (!wellName || wellName.trim() === '') return;
        
        const rfuColumnIndex = wellStartColumn + wellIndex;
        const rfu = [];
        
        for (let i = 1; i < data.length; i++) {
            if (data[i] && data[i][rfuColumnIndex] !== undefined && data[i][rfuColumnIndex] !== '' && !isNaN(data[i][rfuColumnIndex])) {
                rfu.push(parseFloat(data[i][rfuColumnIndex]));
            }
        }
        
        console.log(`Well ${wellName}: ${rfu.length} RFU values from column ${rfuColumnIndex}`);
        
        if (rfu.length === cycles.length && rfu.length > 0) {
            const wellEntry = {
                cycles: cycles,
                rfu: rfu
            };
            
            // Add Cq value if available
            const cqValues = parseCqData();
            if (cqValues && cqValues[wellName.trim()]) {
                wellEntry.cq = cqValues[wellName.trim()];
            }
            
            // Add sample name if available
            const sampleNames = parseSampleNames();
            if (sampleNames && sampleNames[wellName.trim()]) {
                wellEntry.sampleName = sampleNames[wellName.trim()];
            }
            
            wellData[wellName.trim()] = wellEntry;
        } else {
            console.warn(`Well ${wellName}: RFU length (${rfu.length}) doesn't match cycles length (${cycles.length})`);
        }
    });
    
    console.log('Final well data:', Object.keys(wellData));
    return wellData;
}

function parseCqData() {
    if (!cqData || cqData.length === 0) {
        return null;
    }
    
    const cqValues = {};
    const headerRow = cqData[0];
    
    // Find well and Cq columns
    let wellColumn = -1;
    let cqColumn = -1;
    
    for (let i = 0; i < headerRow.length; i++) {
        const header = headerRow[i]?.toString().toLowerCase() || '';
        if (header.includes('well')) {
            wellColumn = i;
        }
        if (header.includes('cq') || header.includes('ct')) {
            cqColumn = i;
        }
    }
    
    if (wellColumn === -1 || cqColumn === -1) {
        console.warn('Could not find well or Cq columns in Cq data');
        return null;
    }
    
    // Parse Cq values
    for (let i = 1; i < cqData.length; i++) {
        const wellName = cqData[i][wellColumn];
        const cqValue = cqData[i][cqColumn];
        
        if (wellName && cqValue !== null && cqValue !== undefined && cqValue !== '') {
            cqValues[wellName.toString()] = Number(cqValue);
        }
    }
    
    console.log('Parsed Cq values for', Object.keys(cqValues).length, 'wells');
    return cqValues;
}

function parseSampleNames() {
    if (!samplesData || samplesData.length === 0) {
        return null;
    }
    
    const sampleNames = {};
    const headerRow = samplesData[0];
    
    // Check if this is a Quantification Summary file (has Fluor column)
    let wellColumn = -1;
    let sampleColumn = -1;
    let fluorColumn = -1;
    
    for (let i = 0; i < headerRow.length; i++) {
        const header = headerRow[i]?.toString().toLowerCase() || '';
        if (header.includes('well')) {
            wellColumn = i;
        }
        if (header.includes('sample')) {
            sampleColumn = i;
        }
        if (header.includes('fluor')) {
            fluorColumn = i;
        }
    }
    
    if (wellColumn === -1 || sampleColumn === -1) {
        console.warn('Could not find well or sample columns in sample data');
        return null;
    }
    
    // Determine the current fluorophore from the amplification file name
    const currentFluor = detectCurrentFluorophore();
    console.log('Detected current fluorophore:', currentFluor);
    
    // Parse sample names
    for (let i = 1; i < samplesData.length; i++) {
        const wellName = samplesData[i][wellColumn];
        const sampleName = samplesData[i][sampleColumn];
        const fluor = samplesData[i][fluorColumn];
        
        if (wellName && sampleName) {
            // If we have a fluor column, only include matching fluorophore
            if (fluorColumn !== -1) {
                if (fluor && fluor.toString().toLowerCase() === currentFluor?.toLowerCase()) {
                    // Convert well format A01 to A1 if needed
                    const normalizedWell = normalizeWellName(wellName.toString());
                    sampleNames[normalizedWell] = sampleName.toString().trim();
                }
            } else {
                // No fluor column, use all samples
                const normalizedWell = normalizeWellName(wellName.toString());
                sampleNames[normalizedWell] = sampleName.toString().trim();
            }
        }
    }
    
    console.log('Parsed sample names for', Object.keys(sampleNames).length, 'wells');
    return sampleNames;
}

function parseCqData() {
    if (!cqData || cqData.length === 0) {
        return null;
    }
    
    const cqValues = {};
    const headerRow = cqData[0];
    
    // Find well, Cq, and fluor columns
    let wellColumn = -1;
    let cqColumn = -1;
    let fluorColumn = -1;
    
    for (let i = 0; i < headerRow.length; i++) {
        const header = headerRow[i]?.toString().toLowerCase() || '';
        if (header.includes('well')) {
            wellColumn = i;
        }
        if (header.includes('cq') || header.includes('ct')) {
            cqColumn = i;
        }
        if (header.includes('fluor')) {
            fluorColumn = i;
        }
    }
    
    if (wellColumn === -1 || cqColumn === -1) {
        console.warn('Could not find well or Cq columns in Cq data');
        return null;
    }
    
    // Determine the current fluorophore
    const currentFluor = detectCurrentFluorophore();
    
    // Parse Cq values
    for (let i = 1; i < cqData.length; i++) {
        const wellName = cqData[i][wellColumn];
        const cqValue = cqData[i][cqColumn];
        const fluor = cqData[i][fluorColumn];
        
        if (wellName && cqValue !== null && cqValue !== undefined && cqValue !== '') {
            // If we have a fluor column, only include matching fluorophore
            if (fluorColumn !== -1) {
                if (fluor && fluor.toString().toLowerCase() === currentFluor?.toLowerCase()) {
                    const normalizedWell = normalizeWellName(wellName.toString());
                    // Convert NaN to 0 as specified
                    const parsedCq = (cqValue.toString().toLowerCase() === 'nan') ? 0 : Number(cqValue);
                    cqValues[normalizedWell] = parsedCq;
                }
            } else {
                // No fluor column, use all values
                const normalizedWell = normalizeWellName(wellName.toString());
                const parsedCq = (cqValue.toString().toLowerCase() === 'nan') ? 0 : Number(cqValue);
                cqValues[normalizedWell] = parsedCq;
            }
        }
    }
    
    console.log('Parsed Cq values for', Object.keys(cqValues).length, 'wells');
    return cqValues;
}

function extractBasePattern(fileName) {
    // Extract the base pattern (everything before the file type description)
    // Example: "AcBVAB_2578825_CFX367393 -  Quantification Summary_0_1750375595462.csv"
    // Returns: "AcBVAB_2578825_CFX367393"
    const match = fileName.match(/^([A-Za-z0-9]+_\d+_CFX\d+)/);
    return match ? match[1] : null;
}

function filesMatchPattern(fileName1, fileName2) {
    // Check if two files have the same base pattern
    const pattern1 = extractBasePattern(fileName1);
    const pattern2 = extractBasePattern(fileName2);
    return pattern1 && pattern2 && pattern1 === pattern2;
}

function detectFluorophoreFromFilename(fileName) {
    const name = fileName.toLowerCase();
    if (name.includes('cy5')) return 'Cy5';
    if (name.includes('fam')) return 'FAM';
    if (name.includes('hex')) return 'HEX';
    if (name.includes('texas') || name.includes('texasred')) return 'Texas Red';
    if (name.includes('rox')) return 'ROX';
    if (name.includes('alexa')) return 'Alexa';
    
    // Default naming
    return 'Unknown';
}

function detectCurrentFluorophore() {
    // Return selected fluorophore or first available
    if (selectedFluorophore && amplificationFiles[selectedFluorophore]) {
        return selectedFluorophore;
    }
    
    const available = Object.keys(amplificationFiles);
    return available.length > 0 ? available[0] : 'Cy5';
}

function updateAmplificationFilesList() {
    const uploadedFilesDiv = document.getElementById('uploadedFiles');
    if (!uploadedFilesDiv) return;
    
    const fluorophores = Object.keys(amplificationFiles);
    if (fluorophores.length === 0) {
        uploadedFilesDiv.innerHTML = '';
        return;
    }
    
    let html = '<div class="fluorophore-list"><h5>Uploaded Fluorophores:</h5>';
    fluorophores.forEach(fluor => {
        const file = amplificationFiles[fluor];
        const isSelected = fluor === selectedFluorophore;
        html += `<div class="fluorophore-item ${isSelected ? 'selected' : ''}" 
                      onclick="selectFluorophore('${fluor}')">
                    <strong>${fluor}</strong><br>
                    <small>${file.fileName}</small>
                 </div>`;
    });
    html += '</div>';
    
    uploadedFilesDiv.innerHTML = html;
    
    // Auto-select first if none selected
    if (!selectedFluorophore && fluorophores.length > 0) {
        selectFluorophore(fluorophores[0]);
    }
}

function selectFluorophore(fluorophore) {
    selectedFluorophore = fluorophore;
    updateAmplificationFilesList();
    
    // Update file info display
    const fileData = amplificationFiles[fluorophore];
    if (fileData) {
        displayFileInfo({ name: fileData.fileName }, fileData.data);
    }
    
    // Enable analysis if we have data
    checkAnalysisReady();
}

function normalizeWellName(wellName) {
    // Convert A01 to A1 format or vice versa to match between files
    const match = wellName.match(/([A-P])(\d+)/i);
    if (match) {
        const letter = match[1].toUpperCase();
        const number = parseInt(match[2]);
        return letter + number; // Return A1 format
    }
    return wellName;
}

function combineMultiFluorophoreResults(allResults) {
    // Combine results from multiple fluorophores into a single structure
    const combinedResults = {
        individual_results: {},
        good_curves: [],
        fluorophores: Object.keys(allResults),
        total_wells: 0,
        total_good_curves: 0,
        cycle_info: null
    };
    
    // Combine individual results with fluorophore prefix
    Object.keys(allResults).forEach(fluorophore => {
        const results = allResults[fluorophore];
        
        if (results.individual_results) {
            Object.keys(results.individual_results).forEach(wellId => {
                const fluorophoreWellId = `${wellId}_${fluorophore}`;
                const wellResult = { ...results.individual_results[wellId] };
                wellResult.fluorophore = fluorophore;
                wellResult.original_well_id = wellId;
                
                combinedResults.individual_results[fluorophoreWellId] = wellResult;
                
                if (wellResult.is_good_scurve) {
                    combinedResults.good_curves.push(fluorophoreWellId);
                }
            });
        }
        
        // Update cycle info from first fluorophore
        if (!combinedResults.cycle_info && results.cycle_info) {
            combinedResults.cycle_info = results.cycle_info;
        }
    });
    
    combinedResults.total_wells = Object.keys(combinedResults.individual_results).length;
    combinedResults.total_good_curves = combinedResults.good_curves.length;
    
    return combinedResults;
}

function displayMultiFluorophoreResults(results) {
    analysisSection.style.display = 'block';
    
    // Update summary statistics
    const totalWells = results.total_wells;
    const goodCurves = results.total_good_curves;
    const successRate = totalWells > 0 ? ((goodCurves / totalWells) * 100).toFixed(1) : 0;
    
    document.getElementById('totalWells').textContent = totalWells;
    document.getElementById('goodCurves').textContent = goodCurves;
    document.getElementById('successRate').textContent = successRate + '%';
    
    // Update cycle range
    if (results.cycle_info) {
        document.getElementById('cycleRangeResult').textContent = 
            `${results.cycle_info.min} - ${results.cycle_info.max} (${results.cycle_info.count} cycles)`;
    }
    
    // Add fluorophore filter dropdown
    addFluorophoreFilter(results.fluorophores);
    
    // Populate well selector
    populateWellSelector(results.individual_results);
    
    // Populate results table with multi-fluorophore support
    populateMultiFluorophoreTable(results.individual_results);
    
    // Show first well by default
    const firstWell = Object.keys(results.individual_results)[0];
    if (firstWell) {
        showWellDetails(firstWell);
    }
}

function addFluorophoreFilter(fluorophores) {
    // Add fluorophore filter dropdown to results table
    const tableHeader = document.querySelector('#resultsTable thead tr');
    if (!tableHeader) return;
    
    // Check if filter already exists
    let filterRow = document.querySelector('#fluorophoreFilterRow');
    if (!filterRow) {
        filterRow = document.createElement('tr');
        filterRow.id = 'fluorophoreFilterRow';
        filterRow.innerHTML = `
            <td colspan="12" style="background: #f8f9fa; padding: 10px; border-bottom: 2px solid #dee2e6;">
                <label for="fluorophoreFilter" style="margin-right: 10px; font-weight: bold;">Filter by Fluorophore:</label>
                <select id="fluorophoreFilter" style="padding: 5px 10px; border: 1px solid #ddd; border-radius: 4px;">
                    <option value="all">All Fluorophores</option>
                </select>
                <span id="filterStats" style="margin-left: 15px; color: #666;"></span>
            </td>
        `;
        tableHeader.parentNode.insertBefore(filterRow, tableHeader.nextSibling);
    }
    
    const filterSelect = document.getElementById('fluorophoreFilter');
    
    // Clear existing options except "All"
    filterSelect.innerHTML = '<option value="all">All Fluorophores</option>';
    
    // Add fluorophore options
    fluorophores.forEach(fluorophore => {
        const option = document.createElement('option');
        option.value = fluorophore;
        option.textContent = fluorophore;
        filterSelect.appendChild(option);
    });
    
    // Add event listener
    filterSelect.addEventListener('change', filterTableByFluorophore);
}

function filterTableByFluorophore() {
    const filterValue = document.getElementById('fluorophoreFilter').value;
    const tableRows = document.querySelectorAll('#resultsTable tbody tr');
    let visibleCount = 0;
    
    tableRows.forEach(row => {
        const fluorophoreCell = row.cells[1]; // Fluorophore column
        if (fluorophoreCell) {
            const fluorophore = fluorophoreCell.textContent.trim();
            if (filterValue === 'all' || fluorophore === filterValue) {
                row.style.display = '';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }
        }
    });
    
    // Update filter stats
    const filterStats = document.getElementById('filterStats');
    if (filterStats) {
        const totalRows = tableRows.length;
        filterStats.textContent = `Showing ${visibleCount} of ${totalRows} wells`;
    }
}

function populateMultiFluorophoreTable(individualResults) {
    const resultsTableBody = document.querySelector('#resultsTable tbody');
    if (!resultsTableBody) return;
    
    resultsTableBody.innerHTML = '';
    
    Object.keys(individualResults).forEach(wellId => {
        const result = individualResults[wellId];
        const row = document.createElement('tr');
        
        // Extract well name and fluorophore
        const originalWell = result.original_well_id || wellId.split('_')[0];
        const fluorophore = result.fluorophore || 'Unknown';
        
        const status = result.is_good_scurve ? 'Good S-Curve' : 'Poor Fit';
        const statusClass = result.is_good_scurve ? 'good-curve' : 'poor-curve';
        
        const anomaliesText = Array.isArray(result.anomalies) && result.anomalies.length > 0 
            ? result.anomalies.join(', ') 
            : 'None';
        
        row.innerHTML = `
            <td>${originalWell}</td>
            <td><span class="fluorophore-tag fluorophore-${fluorophore.toLowerCase()}">${fluorophore}</span></td>
            <td><span class="status ${statusClass}">${status}</span></td>
            <td>${result.r2_score ? result.r2_score.toFixed(4) : 'N/A'}</td>
            <td>${result.rmse ? result.rmse.toFixed(2) : 'N/A'}</td>
            <td>${result.amplitude ? result.amplitude.toFixed(1) : 'N/A'}</td>
            <td>${result.steepness ? result.steepness.toFixed(3) : 'N/A'}</td>
            <td>${result.midpoint ? result.midpoint.toFixed(1) : 'N/A'}</td>
            <td>${result.baseline ? result.baseline.toFixed(1) : 'N/A'}</td>
            <td>${result.sample_name || 'N/A'}</td>
            <td>${result.cq_value !== null && result.cq_value !== undefined ? result.cq_value : 'N/A'}</td>
            <td>${anomaliesText}</td>
        `;
        
        row.addEventListener('click', () => showWellDetails(wellId));
        resultsTableBody.appendChild(row);
    });
    
    // Initialize filter
    filterTableByFluorophore();
}

function displayAnalysisResults(results) {
    analysisSection.style.display = 'block';
    
    // Handle different response structures
    const individualResults = results.individual_results || {};
    const goodCurves = results.good_curves || [];
    const cycleInfo = results.cycle_info || results.summary?.cycle_info;
    
    // Update summary statistics
    const totalWells = Object.keys(individualResults).length;
    const goodCurvesCount = goodCurves.length;
    const successRate = totalWells > 0 ? ((goodCurvesCount / totalWells) * 100).toFixed(1) : 0;
    
    document.getElementById('totalWells').textContent = totalWells;
    document.getElementById('goodCurves').textContent = goodCurvesCount;
    document.getElementById('successRate').textContent = successRate + '%';
    
    // Update cycle range
    if (cycleInfo) {
        document.getElementById('cycleRangeResult').textContent = 
            `${cycleInfo.min} - ${cycleInfo.max} (${cycleInfo.count} cycles)`;
    }
    
    // Remove any existing fluorophore filter
    const existingFilter = document.querySelector('#fluorophoreFilterRow');
    if (existingFilter) {
        existingFilter.remove();
    }
    
    // Populate well selector
    populateWellSelector(individualResults);
    
    // Populate results table (use standard table for single fluorophore)
    populateResultsTable(individualResults);
    
    // Show first well by default
    const firstWell = Object.keys(individualResults)[0];
    if (firstWell) {
        showWellDetails(firstWell);
    }
}

function populateWellSelector(individualResults) {
    const wellSelect = document.getElementById('wellSelect');
    wellSelect.innerHTML = '';
    
    // Add "All Wells" option
    const allOption = document.createElement('option');
    allOption.value = 'ALL_WELLS';
    allOption.textContent = 'All Wells Overlay';
    wellSelect.appendChild(allOption);
    
    // Add separator
    const separator = document.createElement('option');
    separator.disabled = true;
    separator.textContent = '────────────';
    wellSelect.appendChild(separator);
    
    // Group results by well ID and fluorophore
    const wellGroups = {};
    Object.keys(individualResults).forEach(key => {
        const result = individualResults[key];
        const wellId = result.well_id || key;
        const fluorophore = result.fluorophore || 'Unknown';
        const sampleName = result.sample || result.sample_name || 'N/A';
        
        if (!wellGroups[wellId]) {
            wellGroups[wellId] = [];
        }
        wellGroups[wellId].push({
            key: key,
            fluorophore: fluorophore,
            sampleName: sampleName,
            result: result
        });
    });
    
    // Sort well IDs naturally (A1, A2, ..., A10, A11, etc.)
    const sortedWellIds = Object.keys(wellGroups).sort((a, b) => {
        const aMatch = a.match(/([A-Z]+)(\d+)/);
        const bMatch = b.match(/([A-Z]+)(\d+)/);
        if (aMatch && bMatch) {
            const letterCompare = aMatch[1].localeCompare(bMatch[1]);
            if (letterCompare !== 0) return letterCompare;
            return parseInt(aMatch[2]) - parseInt(bMatch[2]);
        }
        return a.localeCompare(b);
    });
    
    // Add well options with fluorophore info
    sortedWellIds.forEach(wellId => {
        const fluorophores = wellGroups[wellId];
        
        if (fluorophores.length === 1) {
            // Single fluorophore for this well
            const fluor = fluorophores[0];
            const option = document.createElement('option');
            option.value = fluor.key;
            // Prioritize sample name in display
            if (fluor.sampleName && fluor.sampleName !== 'N/A') {
                option.textContent = `${wellId}: ${fluor.sampleName} (${fluor.fluorophore})`;
            } else {
                option.textContent = `${wellId} (${fluor.fluorophore})`;
            }
            wellSelect.appendChild(option);
        } else {
            // Multiple fluorophores for this well
            fluorophores.forEach(fluor => {
                const option = document.createElement('option');
                option.value = fluor.key;
                // Prioritize sample name in display
                if (fluor.sampleName && fluor.sampleName !== 'N/A') {
                    option.textContent = `${wellId}: ${fluor.sampleName} (${fluor.fluorophore})`;
                } else {
                    option.textContent = `${wellId} (${fluor.fluorophore})`;
                }
                wellSelect.appendChild(option);
            });
        }
    });
    
    wellSelect.addEventListener('change', (e) => {
        if (e.target.value === 'ALL_WELLS') {
            showAllWellsOverlay();
        } else {
            showWellDetails(e.target.value);
        }
    });
}

function showWellDetails(wellKey) {
    const wellResult = analysisResults.individual_results[wellKey];
    if (!wellResult) return;
    
    // Extract well ID and fluorophore info for display
    const wellId = wellResult.well_id || wellKey;
    const fluorophore = wellResult.fluorophore || 'Unknown';
    const sampleName = wellResult.sample_name || 'N/A';
    
    // Update curve details with enhanced analysis from original assets
    const detailsContent = document.getElementById('curveDetails');
    
    let statusClass = wellResult.is_good_scurve ? 'status-good' : 'status-poor';
    let statusText = wellResult.is_good_scurve ? 'Good S-Curve' : 'Poor Curve';
    
    // Enhanced parameter display with error bars from original assets
    const paramErrors = wellResult.parameter_errors || [0, 0, 0, 0];
    
    // Enhanced anomaly detection display
    let anomaliesHtml = '';
    if (wellResult.anomalies && wellResult.anomalies.length > 0) {
        const anomalyDescriptions = wellResult.anomalies.map(anomaly => getAnomalyDescription(anomaly));
        anomaliesHtml = `
            <div class="anomaly-section">
                <h4 class="anomaly-title">⚠ Detected Issues:</h4>
                <div class="anomaly-list">
                    ${anomalyDescriptions.map(desc => `<div class="anomaly-item">${desc}</div>`).join('')}
                </div>
            </div>
        `;
    } else {
        anomaliesHtml = `
            <div class="anomaly-section">
                <div class="no-anomalies">✓ No anomalies detected - curve looks good!</div>
            </div>
        `;
    }
    
    // Enhanced residuals analysis
    let residualsHtml = '';
    if (wellResult.residuals && wellResult.residuals.length > 0) {
        const meanResidual = wellResult.residuals.reduce((a, b) => a + b, 0) / wellResult.residuals.length;
        const stdDev = calculateStdDev(wellResult.residuals);
        residualsHtml = `
            <div class="residuals-section">
                <h4>Residuals Analysis</h4>
                <div class="residuals-stats">
                    <div class="stat-item">
                        <span class="stat-label">Mean Residual:</span>
                        <span class="stat-value">${meanResidual.toFixed(3)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Std Deviation:</span>
                        <span class="stat-value">${stdDev.toFixed(3)}</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    detailsContent.innerHTML = `
        <div class="well-header">
            <div class="parameter-item">
                <span class="parameter-label">Well ID:</span>
                <span class="parameter-value well-id-highlight">${wellId}</span>
            </div>
            <div class="parameter-item">
                <span class="parameter-label">Fluorophore:</span>
                <span class="fluorophore-tag fluorophore-${fluorophore.toLowerCase()}">${fluorophore}</span>
            </div>
            <div class="parameter-item">
                <span class="parameter-label">Sample:</span>
                <span class="parameter-value">${sampleName}</span>
            </div>
            <div class="parameter-item">
                <span class="parameter-label">Status:</span>
                <span class="${statusClass}">${statusText}</span>
            </div>
        </div>
        
        <div class="enhanced-parameters">
            <h4>Curve Parameters (with uncertainties)</h4>
            <div class="parameter-grid">
                <div class="parameter-item enhanced">
                    <span class="parameter-label">Amplitude (L):</span>
                    <span class="parameter-value">${wellResult.amplitude ? wellResult.amplitude.toFixed(2) : 'N/A'} ± ${paramErrors[0] ? paramErrors[0].toFixed(2) : '0.00'}</span>
                </div>
                <div class="parameter-item enhanced">
                    <span class="parameter-label">Steepness (k):</span>
                    <span class="parameter-value">${wellResult.steepness ? wellResult.steepness.toFixed(4) : 'N/A'} ± ${paramErrors[1] ? paramErrors[1].toFixed(4) : '0.0000'}</span>
                </div>
                <div class="parameter-item enhanced">
                    <span class="parameter-label">Midpoint (x0):</span>
                    <span class="parameter-value">${wellResult.midpoint ? wellResult.midpoint.toFixed(2) : 'N/A'} ± ${paramErrors[2] ? paramErrors[2].toFixed(2) : '0.00'}</span>
                </div>
                <div class="parameter-item enhanced">
                    <span class="parameter-label">Baseline (B):</span>
                    <span class="parameter-value">${wellResult.baseline ? wellResult.baseline.toFixed(2) : 'N/A'} ± ${paramErrors[3] ? paramErrors[3].toFixed(2) : '0.00'}</span>
                </div>
            </div>
        </div>
        
        <div class="quality-metrics-section">
            <h4>Quality Metrics</h4>
            <div class="metrics-grid">
                <div class="metric-item">
                    <span class="metric-label">R² Score:</span>
                    <span class="metric-value r2-score">${wellResult.r2_score ? wellResult.r2_score.toFixed(4) : 'N/A'}</span>
                    <div class="quality-bar">
                        <div class="quality-fill" style="width: ${wellResult.r2_score ? Math.min(100, wellResult.r2_score * 100) : 0}%"></div>
                    </div>
                </div>
                <div class="metric-item">
                    <span class="metric-label">RMSE:</span>
                    <span class="metric-value">${wellResult.rmse ? wellResult.rmse.toFixed(2) : 'N/A'}</span>
                </div>
                <div class="metric-item">
                    <span class="metric-label">Data Points:</span>
                    <span class="metric-value">${wellResult.data_points || 'N/A'}</span>
                </div>
                <div class="metric-item">
                    <span class="metric-label">Cycle Range:</span>
                    <span class="metric-value">${wellResult.cycle_range ? wellResult.cycle_range.toFixed(0) : 'N/A'}</span>
                </div>
            </div>
        </div>
        
        ${anomaliesHtml}
        ${residualsHtml}
    `;
    
    // Update chart for selected well
    updateChart(wellKey);
}

function showAllWellsOverlay() {
    // Update curve details for overlay view
    const detailsContent = document.getElementById('curveDetails');
    const totalWells = Object.keys(analysisResults.individual_results).length;
    const goodWells = analysisResults.good_curves.length;
    
    detailsContent.innerHTML = `
        <div class="parameter-item">
            <span class="parameter-label">View:</span>
            <span class="parameter-value">All Wells Overlay</span>
        </div>
        <div class="parameter-item">
            <span class="parameter-label">Total Wells:</span>
            <span class="parameter-value">${totalWells}</span>
        </div>
        <div class="parameter-item">
            <span class="parameter-label">Good S-Curves:</span>
            <span class="parameter-value">${goodWells}</span>
        </div>
        <div class="parameter-item">
            <span class="parameter-label">Success Rate:</span>
            <span class="parameter-value">${((goodWells/totalWells)*100).toFixed(1)}%</span>
        </div>
        <p style="margin-top: 15px; color: #7f8c8d; font-size: 0.9rem;">
            <strong>Legend:</strong> Green = Good S-curves, Red = Poor curves, Blue = Fitted curves
        </p>
    `;
    
    // Update chart with all wells
    updateAllWellsChart();
}

function updateChart(wellKey) {
    const wellResult = analysisResults.individual_results[wellKey];
    if (!wellResult) return;
    
    const wellId = wellResult.well_id || wellKey;
    const fluorophore = wellResult.fluorophore || 'Unknown';
    
    // Extract raw data from wellResult (stored as JSON strings)
    let cycles = [];
    let rfu = [];
    
    try {
        if (wellResult.raw_cycles) {
            cycles = typeof wellResult.raw_cycles === 'string' ? 
                JSON.parse(wellResult.raw_cycles) : wellResult.raw_cycles;
        }
        if (wellResult.raw_rfu) {
            rfu = typeof wellResult.raw_rfu === 'string' ? 
                JSON.parse(wellResult.raw_rfu) : wellResult.raw_rfu;
        }
    } catch (e) {
        console.error('Error parsing raw data for well:', wellKey, e);
        return;
    }
    
    if (!cycles || cycles.length === 0 || !rfu || rfu.length === 0) {
        console.log('No chart data available for well:', wellKey);
        return;
    }
    
    const ctx = document.getElementById('amplificationChart').getContext('2d');
    
    // Destroy existing chart
    if (currentChart) {
        currentChart.destroy();
    }
    
    // Prepare fit data if available
    let fitData = [];
    if (wellResult.fitted_curve) {
        let fittedCurve = [];
        try {
            fittedCurve = typeof wellResult.fitted_curve === 'string' ? 
                JSON.parse(wellResult.fitted_curve) : wellResult.fitted_curve;
        } catch (e) {
            console.error('Error parsing fitted curve data:', e);
        }
        
        if (fittedCurve.length > 0) {
            fitData = fittedCurve.map((rfuValue, index) => ({
                x: cycles[index],
                y: rfuValue
            }));
        }
    }
    
    const datasets = [
        {
            label: `${wellId} (${fluorophore}) - Raw Data`,
            data: cycles.map((cycle, index) => ({
                x: cycle,
                y: rfu[index]
            })),
            backgroundColor: 'rgba(52, 152, 219, 0.8)',
            borderColor: 'rgba(41, 128, 185, 1)',
            borderWidth: 1,
            pointRadius: 3,
            pointHoverRadius: 5,
            showLine: false,
            pointStyle: 'circle'
        }
    ];
    
    if (fitData.length > 0) {
        datasets.push({
            label: `Sigmoid Fit (R²=${wellResult.r2_score ? wellResult.r2_score.toFixed(3) : 'N/A'})`,
            data: fitData,
            backgroundColor: 'rgba(231, 76, 60, 0.2)',
            borderColor: 'rgba(192, 57, 43, 1)',
            borderWidth: 4,
            pointRadius: 0,
            showLine: true,
            tension: 0.1,
            fill: false
        });
    }
    
    // Calculate better Y-axis range to highlight the S-curve with enhanced scaling
    const allRFUValues = rfu.concat(fitData.map(point => point.y));
    const minRFU = Math.min(...allRFUValues);
    const maxRFU = Math.max(...allRFUValues);
    const rfuRange = maxRFU - minRFU;
    const padding = Math.max(rfuRange * 0.15, 100); // Minimum 15% padding or 100 RFU units for better visibility
    
    currentChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            aspectRatio: 1.8, // Make chart wider than tall for better curve visualization
            plugins: {
                title: {
                    display: true,
                    text: `qPCR Amplification Curve - ${wellId}`,
                    font: { size: 18, weight: 'bold' }
                },
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        font: { size: 12 }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Cycle Number',
                        font: { size: 14, weight: 'bold' }
                    },
                    grid: {
                        display: true,
                        color: 'rgba(0,0,0,0.1)'
                    },
                    min: Math.min(...cycles) - 1,
                    max: Math.max(...cycles) + 1,
                    ticks: {
                        font: { size: 12 }
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'RFU (Relative Fluorescence Units)',
                        font: { size: 14, weight: 'bold' }
                    },
                    grid: {
                        display: true,
                        color: 'rgba(0,0,0,0.1)'
                    },
                    min: Math.max(0, minRFU - padding),
                    max: maxRFU + padding,
                    ticks: {
                        font: { size: 12 }
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'point'
            },
            layout: {
                padding: {
                    top: 20,
                    bottom: 20,
                    left: 20,
                    right: 20
                }
            }
        }
    });
}

function populateResultsTable(individualResults) {
    const tableBody = document.querySelector('#resultsTable tbody');
    if (!tableBody) {
        console.error('Results table body not found');
        return;
    }
    
    tableBody.innerHTML = '';
    
    // Get additional data for integration
    const cqValues = parseCqData();
    const sampleNames = parseSampleNames();
    
    Object.entries(individualResults).forEach(([wellId, result]) => {
        const row = document.createElement('tr');
        
        const statusClass = result.is_good_scurve ? 'status-good' : 'status-poor';
        const statusText = result.is_good_scurve ? 'Good S-Curve' : 'Poor Fit';
        
        const anomaliesText = result.anomalies && result.anomalies.length > 0 
            ? result.anomalies.join(', ') 
            : 'None';
        
        // Get integrated data (use result's integrated data if available, otherwise parse)
        const sampleName = result.sample || result.sample_name || (sampleNames && sampleNames[wellId]) || 'N/A';
        const cqValue = result.cq_value !== null && result.cq_value !== undefined ? 
            result.cq_value.toFixed(2) : 
            (cqValues && cqValues[wellId] ? cqValues[wellId].toFixed(2) : 'N/A');
        
        // Determine fluorophore (for single fluorophore analysis, detect from filename)
        const fluorophore = result.fluorophore || selectedFluorophore || 'Unknown';
        
        row.innerHTML = `
            <td><strong>${wellId}</strong></td>
            <td><span class="fluorophore-tag fluorophore-${fluorophore.toLowerCase()}">${fluorophore}</span></td>
            <td><span class="status ${statusClass}">${statusText}</span></td>
            <td>${result.r2_score ? result.r2_score.toFixed(4) : 'N/A'}</td>
            <td>${result.rmse ? result.rmse.toFixed(2) : 'N/A'}</td>
            <td>${result.amplitude ? result.amplitude.toFixed(1) : 'N/A'}</td>
            <td>${result.steepness ? result.steepness.toFixed(3) : 'N/A'}</td>
            <td>${result.midpoint ? result.midpoint.toFixed(1) : 'N/A'}</td>
            <td>${result.baseline ? result.baseline.toFixed(1) : 'N/A'}</td>
            <td>${sampleName}</td>
            <td>${cqValue}</td>
            <td>${anomaliesText}</td>
        `;
        
        row.addEventListener('click', () => {
            const wellSelect = document.getElementById('wellSelect');
            if (wellSelect) {
                wellSelect.value = wellId;
            }
            showWellDetails(wellId);
        });
        
        tableBody.appendChild(row);
    });
}

// Control button handlers
document.getElementById('showAllBtn').addEventListener('click', () => {
    showAllWells();
});

document.getElementById('goodCurvesBtn').addEventListener('click', () => {
    showGoodCurvesOnly();
});

document.getElementById('exportBtn').addEventListener('click', () => {
    exportResults();
});

function showAllWells() {
    // Implementation for showing all wells in chart
    if (!analysisResults.individual_results) return;
    
    const ctx = document.getElementById('amplificationChart').getContext('2d');
    
    if (currentChart) {
        currentChart.destroy();
    }
    
    const datasets = [];
    
    const colors = [
        'rgba(52, 152, 219, 0.8)',
        'rgba(231, 76, 60, 0.8)',
        'rgba(46, 204, 113, 0.8)',
        'rgba(155, 89, 182, 0.8)',
        'rgba(241, 196, 15, 0.8)',
        'rgba(230, 126, 34, 0.8)'
    ];
    
    Object.keys(analysisResults.individual_results).forEach((wellKey, index) => {
        const result = analysisResults.individual_results[wellKey];
        if (result && result.raw_cycles && result.raw_rfu) {
            try {
                const cycles = typeof result.raw_cycles === 'string' ? 
                    JSON.parse(result.raw_cycles) : result.raw_cycles;
                const rfu = typeof result.raw_rfu === 'string' ? 
                    JSON.parse(result.raw_rfu) : result.raw_rfu;
                
                const wellId = result.well_id || wellKey;
                const fluorophore = result.fluorophore || 'Unknown';
                const sampleName = result.sample || result.sample_name || 'N/A';
                
                datasets.push({
                    label: `${wellId} (${fluorophore})`,
                    data: cycles.map((cycle, idx) => ({
                        x: cycle,
                        y: rfu[idx]
                    })),
                    borderColor: colors[index % colors.length],
                    backgroundColor: colors[index % colors.length].replace('0.8', '0.3'),
                    borderWidth: 2,
                    pointRadius: 2,
                    showLine: true,
                    tension: 0.1
                });
            } catch (e) {
                console.error('Error parsing data for well:', wellKey, e);
            }
        }
    });
    
    currentChart = new Chart(ctx, {
        type: 'scatter',
        data: { datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'All Wells - qPCR Amplification Curves',
                    font: { size: 16, weight: 'bold' }
                },
                legend: {
                    display: true,
                    position: 'right'
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Cycle Number' }
                },
                y: {
                    title: { display: true, text: 'RFU' }
                }
            }
        }
    });
}

function showGoodCurvesOnly() {
    if (!analysisResults.good_curves) return;
    
    const ctx = document.getElementById('amplificationChart').getContext('2d');
    
    if (currentChart) {
        currentChart.destroy();
    }
    
    const datasets = [];
    
    const colors = [
        'rgba(46, 204, 113, 0.8)',
        'rgba(52, 152, 219, 0.8)',
        'rgba(155, 89, 182, 0.8)',
        'rgba(241, 196, 15, 0.8)'
    ];
    
    analysisResults.good_curves.forEach((wellId, index) => {
        const wellKey = Object.keys(analysisResults.individual_results).find(key => {
            const result = analysisResults.individual_results[key];
            return result.well_id === wellId && result.is_good_scurve;
        });
        
        if (wellKey) {
            const result = analysisResults.individual_results[wellKey];
            try {
                const cycles = typeof result.raw_cycles === 'string' ? 
                    JSON.parse(result.raw_cycles) : result.raw_cycles;
                const rfu = typeof result.raw_rfu === 'string' ? 
                    JSON.parse(result.raw_rfu) : result.raw_rfu;
                
                const fluorophore = result.fluorophore || 'Unknown';
                const sampleName = result.sample || result.sample_name || 'N/A';
                
                datasets.push({
                    label: `${wellId}: ${sampleName} (${fluorophore})`,
                    data: cycles.map((cycle, idx) => ({
                        x: cycle,
                        y: rfu[idx]
                    })),
                    borderColor: colors[index % colors.length],
                    backgroundColor: colors[index % colors.length].replace('0.8', '0.3'),
                    borderWidth: 2,
                    pointRadius: 2,
                    showLine: true,
                    tension: 0.1
                });
            } catch (e) {
                console.error('Error parsing data for good curve:', wellId, e);
            }
        }
    });
    
    currentChart = new Chart(ctx, {
        type: 'scatter',
        data: { datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Good S-Curves Only - qPCR Amplification Curves',
                    font: { size: 16, weight: 'bold' }
                },
                legend: {
                    display: true,
                    position: 'right'
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Cycle Number' }
                },
                y: {
                    title: { display: true, text: 'RFU' }
                }
            }
        }
    });
}

function exportResults() {
    if (!analysisResults) return;
    
    // Prepare CSV data for export
    const csvContent = generateResultsCSV();
    
    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qpcr_analysis_results.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

function generateResultsCSV() {
    // Get additional data for integration
    const cqValues = parseCqData();
    const sampleNames = parseSampleNames();
    
    const headers = [
        'Well', 'Sample_Name', 'Cq_Value', 'Status', 'R2_Score', 'RMSE', 'Amplitude', 'Steepness', 
        'Midpoint', 'Baseline', 'Anomalies'
    ];
    
    let csvContent = headers.join(',') + '\n';
    
    Object.entries(analysisResults.individual_results).forEach(([wellId, result]) => {
        // Get integrated data
        const sampleName = sampleNames && sampleNames[wellId] ? `"${sampleNames[wellId]}"` : 'N/A';
        const cqValue = cqValues && cqValues[wellId] ? cqValues[wellId].toFixed(2) : 'N/A';
        
        const row = [
            wellId,
            sampleName,
            cqValue,
            result.is_good_scurve ? 'Good' : 'Poor',
            result.r2_score ? result.r2_score.toFixed(4) : 'N/A',
            result.rmse ? result.rmse.toFixed(2) : 'N/A',
            result.amplitude ? result.amplitude.toFixed(2) : 'N/A',
            result.steepness ? result.steepness.toFixed(4) : 'N/A',
            result.midpoint ? result.midpoint.toFixed(2) : 'N/A',
            result.baseline ? result.baseline.toFixed(2) : 'N/A',
            result.anomalies && result.anomalies.length > 0 ? `"${result.anomalies.join(';')}"` : 'None'
        ];
        
        csvContent += row.join(',') + '\n';
    });
    
    return csvContent;
}

// Local storage functions for history
function saveAnalysisToHistory(filename, results) {
    // Calculate summary statistics from results structure
    const individualResults = results.individual_results || {};
    const goodCurves = results.good_curves || [];
    const totalWells = Object.keys(individualResults).length;
    const successRate = totalWells > 0 ? ((goodCurves.length / totalWells) * 100).toFixed(1) : 0;
    
    const historyItem = {
        id: Date.now(),
        filename: filename || 'unknown.csv',
        timestamp: new Date().toISOString(),
        totalWells: totalWells,
        goodCurves: goodCurves.length,
        successRate: parseFloat(successRate),
        cycleInfo: results.cycle_info,
        summary: {
            total_wells: totalWells,
            good_curves: goodCurves.length,
            success_rate: parseFloat(successRate)
        },
        analysisData: results // Store complete analysis data for restoration
    };
    
    let history = JSON.parse(localStorage.getItem('qpcr_analysis_history') || '[]');
    history.unshift(historyItem); // Add to beginning
    
    // Keep only last 50 analyses
    history = history.slice(0, 50);
    
    localStorage.setItem('qpcr_analysis_history', JSON.stringify(history));
}

function getLocalAnalysisHistory() {
    return JSON.parse(localStorage.getItem('qpcr_analysis_history') || '[]');
}

function clearLocalHistory() {
    localStorage.removeItem('qpcr_analysis_history');
    loadAnalysisHistory();
}

// History functionality
async function loadAnalysisHistory() {
    try {
        // Try to load from server first
        const response = await fetch('/sessions');
        const data = await response.json();
        
        if (data.sessions && data.sessions.length > 0) {
            displayAnalysisHistory(data.sessions);
        } else {
            // Fallback to local storage
            const localHistory = getLocalAnalysisHistory();
            displayLocalAnalysisHistory(localHistory);
        }
    } catch (error) {
        console.error('Error loading history:', error);
        // Fallback to local storage
        const localHistory = getLocalAnalysisHistory();
        displayLocalAnalysisHistory(localHistory);
    }
}

function displayLocalAnalysisHistory(history) {
    const historyContent = document.getElementById('historyContent');
    
    if (!history || history.length === 0) {
        historyContent.innerHTML = `
            <div class="empty-history">
                <p>No analysis history found</p>
                <p class="history-note">Analyses will be saved locally in your browser</p>
            </div>
        `;
        return;
    }
    
    const tableHtml = `
        <div class="history-header-note">
            <p><strong>Local Analysis History</strong> (stored in your browser)</p>
            <button class="control-btn" onclick="clearLocalHistory()">Clear History</button>
        </div>
        <table class="history-table">
            <thead>
                <tr>
                    <th>File Name</th>
                    <th>Date</th>
                    <th>Wells</th>
                    <th>Success Rate</th>
                    <th>Cycles</th>
                </tr>
            </thead>
            <tbody>
                ${history.map((session, index) => `
                    <tr onclick="loadLocalSessionDetails(${index})" class="clickable-row">
                        <td><strong>${session.filename}</strong></td>
                        <td>${new Date(session.timestamp).toLocaleString()}</td>
                        <td>
                            <div class="session-stats">
                                <span class="session-stat">${session.totalWells} total</span>
                                <span class="session-stat">${session.goodCurves} good</span>
                            </div>
                        </td>
                        <td>${session.successRate.toFixed(1)}%</td>
                        <td>${session.cycleInfo ? `${session.cycleInfo.min}-${session.cycleInfo.max}` : 'N/A'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    historyContent.innerHTML = tableHtml;
}

function displayAnalysisHistory(sessions) {
    const historyContent = document.getElementById('historyContent');
    
    if (!sessions || sessions.length === 0) {
        // Fallback to local history
        const localHistory = getLocalAnalysisHistory();
        displayLocalAnalysisHistory(localHistory);
        return;
    }
    
    const tableHtml = `
        <table class="history-table">
            <thead>
                <tr>
                    <th>File Name</th>
                    <th>Date</th>
                    <th>Wells</th>
                    <th>Success Rate</th>
                    <th>Cycles</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${sessions.map(session => `
                    <tr onclick="loadSessionDetails(${session.id})" data-session-id="${session.id}">
                        <td><strong>${session.filename}</strong></td>
                        <td>${new Date(session.upload_timestamp).toLocaleString()}</td>
                        <td>
                            <div class="session-stats">
                                <span class="session-stat">${session.total_wells} total</span>
                                <span class="session-stat">${session.good_curves} good</span>
                            </div>
                        </td>
                        <td>${session.success_rate.toFixed(1)}%</td>
                        <td>${session.cycle_range || 'N/A'}</td>
                        <td>
                            <button class="delete-btn" onclick="deleteSession(${session.id}, event)">Delete</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    historyContent.innerHTML = tableHtml;
}

async function loadSessionDetails(sessionId) {
    try {
        const response = await fetch(`/sessions/${sessionId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Loaded session data:', data);
        
        // Convert session data to analysisResults format
        analysisResults = {
            individual_results: {},
            good_curves: [],
            cycle_info: {
                min: data.session.cycle_min || 0,
                max: data.session.cycle_max || 0,
                count: data.session.cycle_count || 0
            },
            summary: {
                total_wells: data.session.total_wells,
                good_curves: data.session.good_curves,
                success_rate: data.session.success_rate
            }
        };
        
        // Convert well data with proper JSON parsing for chart display
        data.wells.forEach(well => {
            const wellResult = {
                r2_score: well.r2_score,
                rmse: well.rmse,
                amplitude: well.amplitude,
                steepness: well.steepness,
                midpoint: well.midpoint,
                baseline: well.baseline,
                is_good_scurve: well.is_good_scurve,
                anomalies: (() => {
                    try {
                        // If it's already an array, return it directly
                        if (Array.isArray(well.anomalies)) {
                            return well.anomalies;
                        }
                        // If it's a string, try to parse it
                        const anomaliesStr = well.anomalies || '[]';
                        return JSON.parse(anomaliesStr);
                    } catch (e) {
                        console.warn('Failed to parse anomalies for well', well.well_id, ':', e, 'Raw value:', well.anomalies);
                        return [];
                    }
                })(),
                fitted_curve: Array.isArray(well.fitted_curve) ? well.fitted_curve : (() => {
                    try {
                        return JSON.parse(well.fitted_curve || '[]');
                    } catch (e) {
                        return [];
                    }
                })(),
                data_points: well.data_points,
                cycle_range: well.cycle_range,
                cycles: (() => {
                    if (Array.isArray(well.raw_cycles)) {
                        return well.raw_cycles;
                    }
                    try {
                        const parsed = JSON.parse(well.raw_cycles || '[]');
                        return Array.isArray(parsed) ? parsed : [];
                    } catch (e) {
                        console.warn('Failed to parse raw_cycles for well', well.well_id, ':', well.raw_cycles);
                        return [];
                    }
                })(),
                rfu: (() => {
                    if (Array.isArray(well.raw_rfu)) {
                        return well.raw_rfu;
                    }
                    try {
                        const parsed = JSON.parse(well.raw_rfu || '[]');
                        return Array.isArray(parsed) ? parsed : [];
                    } catch (e) {
                        console.warn('Failed to parse raw_rfu for well', well.well_id, ':', well.raw_rfu);
                        return [];
                    }
                })(),
                fit_parameters: typeof well.fit_parameters === 'object' ? well.fit_parameters : (() => {
                    try {
                        return JSON.parse(well.fit_parameters || '{}');
                    } catch (e) {
                        return {};
                    }
                })(),
                parameter_errors: typeof well.parameter_errors === 'object' ? well.parameter_errors : (() => {
                    try {
                        return JSON.parse(well.parameter_errors || '{}');
                    } catch (e) {
                        return {};
                    }
                })()
            };
            
            analysisResults.individual_results[well.well_id] = wellResult;
            
            if (well.is_good_scurve) {
                analysisResults.good_curves.push(well.well_id);
            }
        });
        
        // Mark analysis section as success for proper display
        analysisResults.success = true;
        
        // Clear amplification files to indicate this is from history
        amplificationFiles = {};
        selectedFluorophore = null;
        
        // Display session filename in file info section
        const fileInfo = document.getElementById('fileInfo');
        if (fileInfo) {
            fileInfo.innerHTML = `
                <div class="file-details">
                    <h3>📁 Loaded from History</h3>
                    <p><strong>File:</strong> <span id="fileName">${data.session.filename}</span></p>
                    <p><strong>Analyzed:</strong> ${new Date(data.session.upload_timestamp).toLocaleString()}</p>
                    <p><strong>Wells:</strong> ${data.session.total_wells} total, ${data.session.good_curves} good curves (${data.session.success_rate.toFixed(1)}%)</p>
                    <p><strong>Cycles:</strong> ${data.session.cycle_count} cycles (${data.session.cycle_min}-${data.session.cycle_max})</p>
                </div>
            `;
            fileInfo.style.display = 'block';
        }
        
        // Show analysis section and populate with session data
        const analysisSection = document.getElementById('analysisSection');
        if (analysisSection) {
            analysisSection.style.display = 'block';
        }
        
        displayAnalysisResults(analysisResults);
        
        // Wait for DOM to be ready before populating selectors
        setTimeout(() => {
            // Populate well selector and results table
            populateWellSelector(analysisResults.individual_results);
            populateResultsTable(analysisResults.individual_results);
            
            // Set first well as default and show its chart
            const firstWell = Object.keys(analysisResults.individual_results)[0];
            if (firstWell) {
                // Ensure chart container exists and is ready
                const chartContainer = document.querySelector('.chart-container');
                if (chartContainer) {
                    chartContainer.style.display = 'block';
                }
                
                // Check if wellSelector exists before setting value
                const wellSelector = document.getElementById('wellSelector');
                if (wellSelector) {
                    wellSelector.value = firstWell;
                }
                
                // Small delay to ensure DOM is ready for chart rendering
                setTimeout(() => {
                    updateChart(firstWell);
                    showWellDetails(firstWell);
                }, 200);
            }
        }, 100);
        
        // Hide analyze button since this is historical data
        const analyzeBtn = document.getElementById('analyzeBtn');
        if (analyzeBtn) {
            analyzeBtn.style.display = 'none';
        }
        
        // Scroll to analysis section
        document.getElementById('analysisSection').scrollIntoView({ behavior: 'smooth' });
        
    } catch (error) {
        console.error('Error loading session details:', error);
        alert('Error loading session details: ' + error.message);
    }
}

async function deleteSession(sessionId, event) {
    event.stopPropagation(); // Prevent row click
    
    if (!confirm('Are you sure you want to delete this analysis session?')) {
        return;
    }
    
    // Disable the delete button to prevent multiple clicks
    const deleteBtn = event.target;
    const originalText = deleteBtn.textContent;
    deleteBtn.disabled = true;
    deleteBtn.textContent = 'Deleting...';
    
    try {
        const response = await fetch(`/sessions/${sessionId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            console.error('Delete error:', result);
            alert('Error deleting session: ' + (result.error || `HTTP error! status: ${response.status}`));
        } else {
            console.log('Session deleted:', result.message);
        }
        
        // Reload history regardless of success/failure to refresh the list
        loadAnalysisHistory();
        
    } catch (error) {
        console.error('Error deleting session:', error);
        alert('Error deleting session: ' + error.message);
    } finally {
        // Re-enable the button
        deleteBtn.disabled = false;
        deleteBtn.textContent = originalText;
    }
}

// History control handlers
document.getElementById('refreshHistoryBtn').addEventListener('click', loadAnalysisHistory);
document.getElementById('clearHistoryBtn').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to delete ALL analysis history? This cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch('/sessions');
        const data = await response.json();
        
        // Delete all sessions
        for (const session of data.sessions) {
            await fetch(`/sessions/${session.id}`, { method: 'DELETE' });
        }
        
        loadAnalysisHistory();
    } catch (error) {
        console.error('Error clearing history:', error);
        alert('Error clearing history: ' + error.message);
    }
});

// Load history on page load
document.addEventListener('DOMContentLoaded', loadAnalysisHistory);

// Table search and filter functionality
document.getElementById('searchWells').addEventListener('input', filterTable);
document.getElementById('filterStatus').addEventListener('change', filterTable);

function filterTable() {
    const searchTerm = document.getElementById('searchWells').value.toLowerCase();
    const statusFilter = document.getElementById('filterStatus').value;
    const tableRows = document.querySelectorAll('#resultsTableBody tr');
    
    tableRows.forEach(row => {
        const wellName = row.cells[0].textContent.toLowerCase();
        const status = row.cells[1].textContent.toLowerCase();
        
        const matchesSearch = wellName.includes(searchTerm);
        const matchesStatus = statusFilter === 'all' || 
                             (statusFilter === 'good' && status.includes('good')) ||
                             (statusFilter === 'poor' && status.includes('poor'));
        
        row.style.display = matchesSearch && matchesStatus ? '' : 'none';
    });
}

// Enhanced helper functions from original assets for individual curve analysis
function getAnomalyDescription(anomaly) {
    const descriptions = {
        'low_amplitude': 'Low signal amplitude - may indicate poor amplification',
        'early_plateau': 'Early plateau detected - possible saturation or inhibition',
        'unstable_baseline': 'Unstable baseline - check for contamination or pipetting errors',
        'negative_amplification': 'Negative amplification detected - possible degradation',
        'high_noise': 'High noise levels detected in signal',
        'irregular_curve': 'Irregular curve shape - check reaction conditions',
        'late_amplification': 'Late amplification start - may indicate low template concentration'
    };
    return descriptions[anomaly] || `Unknown anomaly: ${anomaly}`;
}

function calculateStdDev(values) {
    if (!values || values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(avgSquaredDiff);
}

function loadLocalSessionDetails(sessionIndex) {
    try {
        const history = getLocalAnalysisHistory();
        if (!history || sessionIndex >= history.length) {
            console.error('Session not found in local history');
            return;
        }
        
        const session = history[sessionIndex];
        
        // Restore the analysis results from local storage
        analysisResults = session.analysisData;
        
        // Show analysis section and populate with session data
        document.getElementById('analysisSection').style.display = 'block';
        displayAnalysisResults(analysisResults);
        
        // Scroll to analysis section
        document.getElementById('analysisSection').scrollIntoView({ behavior: 'smooth' });
        
        console.log('Loaded local session:', session.filename);
        
    } catch (error) {
        console.error('Error loading local session details:', error);
        alert('Error loading analysis history: ' + error.message);
    }
}

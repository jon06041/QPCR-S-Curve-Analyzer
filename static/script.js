// qPCR S-Curve Analyzer - Frontend JavaScript
// Global variables
let csvData = null;
let samplesData = null;
let analysisResults = null;
let currentChart = null;
let amplificationFiles = {}; // Store multiple fluorophore files
let currentFilterMode = 'all'; // Track current filter mode (all, pos, neg, redo)
let currentFluorophore = 'all'; // Track current fluorophore filter
let currentAnalysisResults = null; // Current analysis results
let currentChartMode = 'all'; // Track current chart display mode

// Production-specific error handling
window.addEventListener('error', function(event) {
    console.error('Global error caught:', event.error);
    // Prevent error propagation that might crash the app in production
    if (event.error && event.error.message) {
        if (event.error.message.includes('Cannot read property') || 
            event.error.message.includes('Cannot read properties') ||
            event.error.message.includes('null is not an object')) {
            console.warn('DOM access error handled gracefully in production');
            event.preventDefault();
            return false;
        }
    }
});

window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    // Handle async errors that might behave differently in production
    event.preventDefault();
});

// Safe DOM access wrapper for production environments
function safeGetElement(id, context = 'Unknown') {
    try {
        const element = document.getElementById(id);
        if (!element) {
            console.warn(`Element '${id}' not found in context: ${context}`);
        }
        return element;
    } catch (error) {
        console.error(`Error accessing element '${id}' in context: ${context}`, error);
        return null;
    }
}

// Safe function execution wrapper
function safeExecute(fn, context = 'Unknown', fallback = null) {
    try {
        return fn();
    } catch (error) {
        console.error(`Error in ${context}:`, error);
        return fallback;
    }
}

// Initialize filters to default state on page load
function initializeFilters() {
    // Reset status filter to "All Wells"
    const statusFilter = safeGetElement('filterStatus', 'Initialize filters');
    if (statusFilter) {
        statusFilter.value = 'all';
    }
    
    // Reset fluorophore filter to "All"
    const fluorophoreFilter = safeGetElement('fluorophoreFilter', 'Initialize filters');
    if (fluorophoreFilter) {
        fluorophoreFilter.value = 'all';
    }
    
    // Reset search input
    const searchInput = safeGetElement('searchWells', 'Initialize filters');
    if (searchInput) {
        searchInput.value = '';
    }
    
    // Apply the reset filters
    if (typeof filterTable === 'function') {
        filterTable();
    }
    
    // Also reset current filter mode
    currentFilterMode = 'all';
    currentFluorophore = 'all';
}

// Pathogen target functions
function getPathogenTarget(testCode, fluorophore) {
    // Use PATHOGEN_LIBRARY directly if available, otherwise fallback
    if (typeof PATHOGEN_LIBRARY !== 'undefined' && testCode && fluorophore) {
        const testData = PATHOGEN_LIBRARY[testCode];
        if (testData && testData[fluorophore]) {
            return testData[fluorophore];
        }
    }
    return "Unknown";
}

function extractTestCode(experimentPattern) {
    if (!experimentPattern) return "";
    const testName = experimentPattern.split('_')[0];
    return testName.startsWith('Ac') ? testName.substring(2) : testName;
}

// Modal navigation state
let modalNavigationList = [];
let currentModalIndex = -1;

// File upload handling
function extractBasePattern(filename) {
    // Handle Multi-Fluorophore Analysis names first
    if (filename.includes('Multi-Fluorophore Analysis')) {
        // Extract the actual experiment pattern from the end
        // "Multi-Fluorophore Analysis (Cy5, FAM, HEX) AcBVAB_2578825_CFX367393" -> "AcBVAB_2578825_CFX367393"
        const match = filename.match(/([A-Za-z][A-Za-z0-9]*_\d+_CFX\d+)$/i);
        if (match) {
            return match[1];
        }
        
        // Try alternative pattern if the above fails
        const parts = filename.split(' ');
        for (let i = parts.length - 1; i >= 0; i--) {
            const part = parts[i];
            if (/^[A-Za-z][A-Za-z0-9]*_\d+_CFX\d+$/.test(part)) {
                return part;
            }
        }
    }
    
    // Extract base pattern from CFX Manager filename, handling trailing dashes
    // Examples: AcBVAB_2578825_CFX367393, AcBVAB_2578826_CFX367394-, AcBVAB_2578826_CFX367394-
    const pattern = /^([A-Za-z][A-Za-z0-9]*_\d+_CFX\d+)/i;
    const match = filename.match(pattern);
    if (match) {
        // Clean up any trailing dashes or spaces from the extracted pattern
        return match[1].replace(/[-\s]+$/, '');
    }
    return filename.split('.')[0].replace(/[-\s]+$/, '');
}

function extractTestName(filename) {
    // Extract test name from pattern (e.g., "AcBVAB" from "AcBVAB_2578825_CFX367393")
    const basePattern = extractBasePattern(filename);
    const testMatch = basePattern.match(/^([A-Za-z][A-Za-z0-9]*)/i);
    return testMatch ? testMatch[1] : basePattern;
}

function validateFilePattern(filename) {
    // Validate CFX Manager filename pattern
    const pattern = /^[A-Za-z][A-Za-z0-9]*_\d+_CFX\d+/i;
    return pattern.test(filename);
}

function handleFileUpload(file, type = 'amplification') {
    if (!file) return;
    
    console.log(`Uploading file: ${file.name}, type: ${type}`);
    
    // Validate filename pattern for CFX Manager format
    if (!validateFilePattern(file.name)) {
        alert(`Invalid filename pattern. Expected CFX Manager format: testName_1234567_CFX123456\nYour file: ${file.name}`);
        return;
    }
    
    // Enhanced validation for file naming conventions
    if (type === 'amplification') {
        // Validate that amplification files contain "Quantification Amplification Results"
        if (!file.name.includes('Quantification Amplification Results')) {
            alert(`Invalid amplification file name. File must contain "Quantification Amplification Results".\nYour file: ${file.name}\nExpected format: AcBVAB_2578825_CFX367393 - Quantification Amplification Results_Cy5.csv`);
            return;
        }
        
        // Check for duplicate amplification files
        const fluorophore = detectFluorophoreFromFilename(file.name);
        if (amplificationFiles[fluorophore]) {
            alert(`Duplicate amplification file detected for ${fluorophore}. Please remove the existing ${fluorophore} file before uploading a new one.\nExisting file: ${amplificationFiles[fluorophore].fileName}\nNew file: ${file.name}`);
            return;
        }
    } else if (type === 'samples') {
        // Validate that summary files contain "Quantification Summary"
        if (!file.name.includes('Quantification Summary')) {
            alert(`Invalid summary file name. File must contain "Quantification Summary".\nYour file: ${file.name}\nExpected format: AcBVAB_2578825_CFX367393 - Quantification Summary_0.csv`);
            return;
        }
        
        // Check for duplicate summary files
        if (samplesData && samplesData.fileName) {
            alert(`Duplicate summary file detected. Please remove the existing summary file before uploading a new one.\nExisting file: ${samplesData.fileName}\nNew file: ${file.name}`);
            return;
        }
    }
    
    // For amplification files, check base pattern consistency with existing files and summary
    if (type === 'amplification') {
        let referencePattern = null;
        
        // Check against existing amplification files
        if (Object.keys(amplificationFiles).length > 0) {
            const existingFiles = Object.values(amplificationFiles).map(f => f.fileName);
            referencePattern = extractBasePattern(existingFiles[0]);
        }
        // Check against summary file if no amplification files but summary exists
        else if (samplesData && samplesData.fileName) {
            referencePattern = extractBasePattern(samplesData.fileName);
        }
        
        if (referencePattern) {
            const newBasePattern = extractBasePattern(file.name);
            if (referencePattern !== newBasePattern) {
                alert(`File pattern mismatch! All files must share the same base pattern.\nExisting pattern: ${referencePattern}\nNew file pattern: ${newBasePattern}\n\nExample: AcBVAB_2578825_CFX367393 - only this part must match, suffixes can differ.`);
                return;
            }
        }
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const csv = e.target.result;
        Papa.parse(csv, {
            complete: function(results) {
                console.log(`Parsed ${file.name}:`, results);
                
                if (type === 'amplification') {
                    // Detect fluorophore from filename
                    const fluorophore = detectFluorophoreFromFilename(file.name);
                    console.log(`Detected fluorophore: ${fluorophore} for file: ${file.name}`);
                    
                    amplificationFiles[fluorophore] = {
                        data: results.data,
                        file: file,
                        fileName: file.name
                    };
                    updateAmplificationFilesList();
                    // Don't show status for amplification files - use the file list instead
                } else if (type === 'samples') {
                    // For summary files, check pattern consistency with existing amplification files
                    if (Object.keys(amplificationFiles).length > 0) {
                        const existingFiles = Object.values(amplificationFiles).map(f => f.fileName);
                        const existingBasePattern = extractBasePattern(existingFiles[0]);
                        const summaryBasePattern = extractBasePattern(file.name);
                        
                        if (existingBasePattern !== summaryBasePattern) {
                            alert(`Summary file pattern mismatch! Must match amplification files.\nAmplification files: ${existingBasePattern}\nSummary file: ${summaryBasePattern}\n\nAll files must share the same base pattern.`);
                            return;
                        }
                    }
                    
                    samplesData = {
                        data: results.data,
                        file: file,
                        fileName: file.name
                    };
                    updateFileStatus('samplesStatus', file.name, true);
                    console.log('Samples data loaded:', samplesData);
                }
                
                displayFileInfo(file, results.data);
                checkAnalysisReady();
            },
            header: false,
            error: function(error) {
                console.error('Papa Parse error:', error);
                updateFileStatus(type === 'amplification' ? 'amplificationStatus' : 'samplesStatus', file.name, false);
            }
        });
    };
    
    reader.onerror = function(error) {
        console.error('FileReader error:', error);
        updateFileStatus(type === 'amplification' ? 'amplificationStatus' : 'samplesStatus', file.name, false);
    };
    
    reader.readAsText(file);
}

function updateFileStatus(statusId, fileName, success) {
    const statusElement = document.getElementById(statusId);
    if (statusElement) {
        if (success) {
            statusElement.innerHTML = `✓ ${fileName}`;
            statusElement.className = 'file-status success';
        } else {
            statusElement.innerHTML = `✗ Upload failed: ${fileName}`;
            statusElement.className = 'file-status error';
        }
    }
}

function clearFileStatus(statusId) {
    const statusElement = document.getElementById(statusId);
    if (statusElement) {
        statusElement.innerHTML = '';
        statusElement.className = 'file-status';
    }
}

function checkAnalysisReady() {
    const analysisButton = document.getElementById('analyzeBtn');
    const hasAmplificationFiles = Object.keys(amplificationFiles).length > 0;
    const hasSamplesData = samplesData !== null;
    
    console.log('Check analysis ready:', {
        amplificationFiles: Object.keys(amplificationFiles),
        hasAmplificationFiles,
        hasSamplesData,
        samplesData: samplesData ? 'loaded' : 'null'
    });
    
    if (analysisButton) {
        analysisButton.disabled = !(hasAmplificationFiles && hasSamplesData);
        analysisButton.textContent = hasAmplificationFiles && hasSamplesData ? 
            'Analyze qPCR Data' : 
            'Upload Files to Analyze';
    }
    
    // Always ensure upload buttons remain enabled
    ensureUploadButtonsEnabled();
}

function displayFileInfo(file, data) {
    console.log(`File: ${file.name}`);
    console.log('Data preview:', data.slice(0, 5));
    
    // Show file info section and update with comprehensive data
    updateFileInfoDisplay();
}

function updateFileInfoDisplay() {
    const fileInfo = document.getElementById('fileInfo');
    if (!fileInfo) return;
    
    // Only show if we have files
    if (Object.keys(amplificationFiles).length === 0 && !samplesData) {
        fileInfo.style.display = 'none';
        return;
    }
    
    fileInfo.style.display = 'block';
    
    // Get well count from any uploaded amplification file
    let wellCount = 0;
    let cycleCount = 0;
    let totalSize = 0;
    let fileNames = [];
    
    // Count wells from amplification files
    Object.values(amplificationFiles).forEach(fileData => {
        if (fileData && fileData.data && fileData.data.length > 0) {
            // Count wells from header row
            for (let colIndex = 0; colIndex < fileData.data[0].length; colIndex++) {
                const header = fileData.data[0][colIndex];
                if (header && header.match(/^[A-P](0?[1-9]|1[0-9]|2[0-4])$/)) {
                    wellCount++;
                }
            }
            // Calculate actual cycle count from unique cycle values
            const cycles = [];
            let cycleColumnIndex = 0;
            
            // Find cycle column (first column with 'cycle' in name or sequential numbers)
            const headers = fileData.data[0];
            for (let i = 0; i < headers.length; i++) {
                if (headers[i] && headers[i].toLowerCase().includes('cycle')) {
                    cycleColumnIndex = i;
                    break;
                }
            }
            
            // Extract unique cycle values
            for (let i = 1; i < fileData.data.length; i++) {
                const cellValue = fileData.data[i][cycleColumnIndex];
                if (cellValue !== undefined && cellValue !== '' && !isNaN(cellValue)) {
                    const cycleValue = parseFloat(cellValue);
                    if (!cycles.includes(cycleValue)) {
                        cycles.push(cycleValue);
                    }
                }
            }
            
            cycleCount = cycles.length;
            
            // Safe file size access
            if (fileData.file && fileData.file.size) {
                totalSize += fileData.file.size;
                fileNames.push(fileData.file.name);
            }
        }
    });
    
    // Add samples file info
    if (samplesData) {
        if (samplesData.file && samplesData.file.size) {
            totalSize += samplesData.file.size;
            fileNames.push(samplesData.file.name);
        }
    }
    
    // Update display elements
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const cycleRange = document.getElementById('cycleRange');
    const wellCountElement = document.getElementById('wellCount');
    
    if (fileName) {
        const fluorophores = Object.keys(amplificationFiles);
        const fluorophoreCount = fluorophores.length;
        const hassamples = samplesData ? ' + Summary' : '';
        
        if (fluorophoreCount > 0) {
            const fluorophoreList = fluorophores.join(', ');
            fileName.textContent = `${fluorophoreList}${hassamples}`;
        } else {
            fileName.textContent = hassamples ? 'Summary file only' : 'No files uploaded';
        }
    }
    if (fileSize) fileSize.textContent = `${(totalSize / 1024).toFixed(1)} KB total`;
    if (cycleRange) cycleRange.textContent = cycleCount > 0 ? `${cycleCount} cycles` : 'No cycles';
    if (wellCountElement) wellCountElement.textContent = `${wellCount} wells`;
}

// Analysis functions
async function performAnalysis() {
    if (Object.keys(amplificationFiles).length === 0) {
        alert('Please upload at least one amplification CSV file (Cy5, FAM, HEX, or Texas Red)');
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
            
            // Prepare request payload with samples data for SQL integration
            const requestPayload = {
                analysis_data: analysisData,
                samples_data: null
            };
            
            // Include samples data for SQL integration if available
            if (samplesData) {
                // Convert samples data to CSV string for backend processing
                let samplesCSV = '';
                if (typeof samplesData === 'string') {
                    samplesCSV = samplesData;
                } else if (samplesData.data) {
                    // Convert Papa Parse object back to CSV
                    samplesCSV = Papa.unparse(samplesData.data);
                }
                
                if (samplesCSV) {
                    requestPayload.samples_data = samplesCSV;
                    console.log(`Including samples data for SQL integration (${samplesCSV.length} chars)`);
                }
            }
            
            // Send to backend for analysis
            const response = await fetch('/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Filename': selectedFile.fileName,
                    'X-Fluorophore': fluorophore
                },
                body: JSON.stringify(requestPayload)
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
        
        // If only one fluorophore was analyzed, save it properly to database
        if (fluorophores.length === 1) {
            const singleResult = allResults[fluorophores[0]];
            analysisResults = singleResult;
            
            const filename = amplificationFiles[fluorophores[0]].fileName;
            
            // Save single fluorophore session to database with proper well counts
            await saveSingleFluorophoreSession(filename, singleResult, fluorophores[0]);
            displayAnalysisResults(singleResult);
        } else {
            // Combine all fluorophore results for multi-fluorophore display (SQL-integrated)
            const combinedResults = combineMultiFluorophoreResultsSQL(allResults);
            analysisResults = combinedResults;
            
            // Use the base pattern from the first file for consistent naming
            const firstFileName = Object.values(amplificationFiles)[0].fileName;
            const basePattern = extractBasePattern(firstFileName);
            const filename = `Multi-Fluorophore_${basePattern}`;
            
            // Save combined session to database
            await saveCombinedSession(filename, combinedResults, fluorophores);
            
            // Save experiment statistics for trend analysis
            await saveExperimentStatistics(basePattern, allResults, fluorophores);
            
            displayMultiFluorophoreResults(combinedResults);
        }
        
    } catch (error) {
        console.error('Analysis error:', error);
        alert('Error performing analysis: ' + error.message);
    } finally {
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    }
}

// Display functions
function displayAnalysisResults(results) {
    console.log('Displaying analysis results:', results);
    
    if (!results || !results.individual_results) {
        console.error('Invalid results structure:', results);
        alert('Error: Invalid analysis results received');
        return;
    }
    
    const analysisSection = document.getElementById('analysisSection');
    if (analysisSection) {
        analysisSection.style.display = 'block';
    }
    
    // Handle different response structures
    const individualResults = results.individual_results || {};
    const cycleInfo = results.cycle_info || results.summary?.cycle_info;
    
    // Calculate positive results based on amplitude thresholds (POS = amplitude > 500)
    const fluorophoreStats = calculateFluorophoreStats(individualResults);
    const totalWells = Object.keys(individualResults).length;
    const totalPositive = fluorophoreStats.totalPositive;
    const positivePercentage = totalWells > 0 ? ((totalPositive / totalWells) * 100).toFixed(1) : 0;
    
    // Get experiment pattern name
    const experimentPattern = getCurrentFullPattern();
    
    // Update summary statistics with safety checks
    const experimentPatternEl = document.getElementById('experimentPattern');
    const totalPositiveEl = document.getElementById('totalPositive');
    const positivePercentageEl = document.getElementById('positivePercentage');
    const cycleRangeEl = document.getElementById('cycleRangeResult');
    
    if (experimentPatternEl) experimentPatternEl.textContent = experimentPattern;
    if (totalPositiveEl) totalPositiveEl.textContent = totalPositive;
    if (positivePercentageEl) positivePercentageEl.textContent = positivePercentage + '%';
    
    // Update cycle range
    if (cycleInfo && cycleRangeEl) {
        cycleRangeEl.textContent = `${cycleInfo.min} - ${cycleInfo.max} (${cycleInfo.count} cycles)`;
    } else if (cycleRangeEl) {
        // Try to calculate cycle range from individual results
        const calculatedCycleInfo = calculateCycleRangeFromResults(individualResults);
        if (calculatedCycleInfo) {
            cycleRangeEl.textContent = `${calculatedCycleInfo.min} - ${calculatedCycleInfo.max} (${calculatedCycleInfo.count} cycles)`;
        } else {
            cycleRangeEl.textContent = 'N/A';
        }
    }
    
    // Display fluorophore-specific breakdown
    displayFluorophoreBreakdown(fluorophoreStats.byFluorophore);
    
    // Update wells analysis title with experiment name
    const wellsTitle = document.getElementById('wellsAnalysisTitle');
    if (wellsTitle) {
        wellsTitle.textContent = `${experimentPattern} - All Wells Analysis`;
    }
    
    // Always add fluorophore filter for context, even with single fluorophore
    addFluorophoreFilter(individualResults);
    
    // Validate controls and display alerts if needed
    const controlIssues = validateControls(individualResults);
    displayControlValidationAlerts(controlIssues);
    
    populateWellSelector(individualResults);
    populateResultsTable(individualResults);
    
    // Show first well by default
    const firstWell = Object.keys(individualResults)[0];
    if (firstWell) {
        showWellDetails(firstWell);
    }
    
    document.getElementById('analysisSection').scrollIntoView({ behavior: 'smooth' });
}

function displayMultiFluorophoreResults(results) {
    console.log('Displaying multi-fluorophore results:', results);
    
    if (!results || !results.individual_results) {
        console.error('Invalid multi-fluorophore results structure:', results);
        alert('Error: Invalid multi-fluorophore analysis results received');
        return;
    }
    
    const analysisSection = document.getElementById('analysisSection');
    analysisSection.style.display = 'block';
    
    // Calculate positive results based on amplitude thresholds (POS = amplitude > 500)
    const individualResults = results.individual_results;
    const fluorophoreStats = calculateFluorophoreStats(individualResults);
    const totalWells = Object.keys(individualResults).length;
    const totalPositive = fluorophoreStats.totalPositive;
    const positivePercentage = totalWells > 0 ? ((totalPositive / totalWells) * 100).toFixed(1) : 0;
    
    // Get experiment pattern name
    const experimentPattern = getCurrentFullPattern();
    
    // Update summary statistics
    document.getElementById('experimentPattern').textContent = experimentPattern;
    document.getElementById('totalPositive').textContent = totalPositive;
    document.getElementById('positivePercentage').textContent = positivePercentage + '%';
    
    // Update cycle range if available
    if (results.cycle_info) {
        document.getElementById('cycleRangeResult').textContent = 
            `${results.cycle_info.min} - ${results.cycle_info.max} (${results.cycle_info.count} cycles)`;
    } else {
        // Try to calculate cycle range from individual results
        const cycleInfo = calculateCycleRangeFromResults(individualResults);
        if (cycleInfo) {
            document.getElementById('cycleRangeResult').textContent = 
                `${cycleInfo.min} - ${cycleInfo.max} (${cycleInfo.count} cycles)`;
        }
    }
    
    // Display fluorophore-specific breakdown
    displayFluorophoreBreakdown(fluorophoreStats.byFluorophore);
    
    // Update wells analysis title with experiment name
    const wellsTitle = document.getElementById('wellsAnalysisTitle');
    if (wellsTitle) {
        wellsTitle.textContent = `${experimentPattern} - All Wells Analysis`;
    }
    
    // Add fluorophore filter for multi-fluorophore results
    addFluorophoreFilter(results.individual_results);
    
    // Validate controls and display alerts if needed
    const controlIssues = validateControls(results.individual_results);
    displayControlValidationAlerts(controlIssues);
    
    // Populate well selector and results table
    populateWellSelector(results.individual_results);
    populateResultsTable(results.individual_results);
    
    // Show first well by default
    const firstWell = Object.keys(results.individual_results)[0];
    if (firstWell) {
        showWellDetails(firstWell);
    }
    
    // Save multi-fluorophore session to database
    if (results.individual_results && Object.keys(results.individual_results).length > 0) {
        saveCombinedSessionToDatabase(results, experimentPattern);
    }
    
    // Initialize chart display after DOM updates complete
    setTimeout(() => {
        initializeChartDisplay();
        // Reset filters to default state after loading results
        initializeFilters();
    }, 400);
    
    document.getElementById('analysisSection').scrollIntoView({ behavior: 'smooth' });
}

// Save combined multi-fluorophore session to database
async function saveCombinedSessionToDatabase(results, experimentPattern) {
    try {
        console.log('Saving combined multi-fluorophore session to database...');
        
        // Get fluorophores from results
        const fluorophores = [];
        for (const wellKey in results.individual_results) {
            const fluorophore = extractFluorophoreFromWellId(wellKey);
            if (fluorophore && !fluorophores.includes(fluorophore)) {
                fluorophores.push(fluorophore);
            }
        }
        
        // Only save multi-fluorophore session if we have data from multiple fluorophores
        if (fluorophores.length < 2) {
            console.log('Skipping combined session save - only single fluorophore detected');
            return;
        }
        
        const sessionData = {
            filename: `Multi-Fluorophore_${experimentPattern}`,
            combined_results: results,
            fluorophores: fluorophores
        };
        
        const response = await fetch('/sessions/save-combined', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(sessionData)
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('Combined session saved successfully:', result.session_id);
        } else {
            const error = await response.json();
            console.warn('Failed to save combined session:', error.error);
        }
    } catch (error) {
        console.warn('Error saving combined session:', error);
    }
}

// Initialize chart display with first available well
function initializeChartDisplay() {
    if (!currentAnalysisResults || !currentAnalysisResults.individual_results) return;
    
    const wellSelector = document.getElementById('wellSelect');
    if (wellSelector && wellSelector.options.length > 1) {
        // Select first actual well (skip "All Wells" option)
        wellSelector.selectedIndex = 1;
        const selectedWell = wellSelector.value;
        if (selectedWell && selectedWell !== 'ALL_WELLS') {
            showWellDetails(selectedWell);
            console.log('Chart initialized with well:', selectedWell);
        }
    }
}

// Global variable to store current results for filtering (already declared at top)

function populateFluorophoreSelector(individualResults) {
    const fluorophoreSelector = document.getElementById('fluorophoreSelect');
    if (!fluorophoreSelector) return;
    
    // Store results globally for filtering
    currentAnalysisResults = { individual_results: individualResults };
    
    // Clear existing options except "All Fluorophores"
    fluorophoreSelector.innerHTML = '<option value="all">All Fluorophores</option>';
    
    // Get unique fluorophores
    const fluorophores = [...new Set(Object.values(individualResults).map(result => result.fluorophore || 'Unknown'))];
    const fluorophoreOrder = ['Cy5', 'FAM', 'HEX', 'Texas Red'];
    
    // Sort fluorophores
    fluorophores.sort((a, b) => {
        const aIndex = fluorophoreOrder.indexOf(a);
        const bIndex = fluorophoreOrder.indexOf(b);
        
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return a.localeCompare(b);
    });
    
    // Get current experiment pattern and extract test code for pathogen targets
    const experimentPattern = getCurrentFullPattern();
    const testCode = extractTestCode(experimentPattern);
    
    // Add fluorophore options with well counts and pathogen targets
    fluorophores.forEach(fluorophore => {
        const count = Object.values(individualResults).filter(result => 
            (result.fluorophore || 'Unknown') === fluorophore
        ).length;
        
        // Get pathogen target for this fluorophore
        const pathogenTarget = getPathogenTarget(testCode, fluorophore);
        const displayTarget = pathogenTarget !== "Unknown" ? ` - ${pathogenTarget}` : "";
        
        const option = document.createElement('option');
        option.value = fluorophore;
        option.textContent = `${fluorophore}${displayTarget} (${count} wells)`;
        fluorophoreSelector.appendChild(option);
    });
    
    // Add event listener for fluorophore filtering
    fluorophoreSelector.addEventListener('change', function() {
        const selectedFluorophore = this.value;
        filterWellsByFluorophore(selectedFluorophore);
        
        // Apply current table filter to the new fluorophore selection
        // Don't reset the filter dropdown, just re-apply the current filter
        filterTable(); // This will apply the current POS/NEG/REDO filter to the new fluorophore
        
        // Reset chart mode to 'all' and update display
        currentChartMode = 'all';
        updateChartDisplayMode();
        
        // Update button states to reflect 'all' mode
        const buttons = document.querySelectorAll('.view-controls .control-btn');
        buttons.forEach(btn => btn.classList.remove('active'));
        const showAllBtn = document.getElementById('showAllBtn');
        if (showAllBtn) {
            showAllBtn.classList.add('active');
        }
    });
}

function filterWellsByFluorophore(selectedFluorophore) {
    if (!currentAnalysisResults) return;
    
    const wellSelector = document.getElementById('wellSelect');
    if (!wellSelector) return;
    
    wellSelector.innerHTML = '';
    
    // Add "All Wells" option for the selected fluorophore
    const allOption = document.createElement('option');
    allOption.value = 'ALL_WELLS';
    allOption.textContent = selectedFluorophore === 'all' ? 'All Wells Overlay' : `All ${selectedFluorophore} Wells`;
    wellSelector.appendChild(allOption);
    
    // Filter results by fluorophore
    const filteredResults = Object.entries(currentAnalysisResults.individual_results).filter(([wellKey, result]) => {
        if (selectedFluorophore === 'all') return true;
        return (result.fluorophore || 'Unknown') === selectedFluorophore;
    });
    
    // Sort wells naturally (A1, A2, ..., A10, A11, etc.)
    filteredResults.sort(([aWellKey, aResult], [bWellKey, bResult]) => {
        const aWellId = aResult.well_id || aWellKey;
        const bWellId = bResult.well_id || bWellKey;
        
        const aMatch = aWellId.match(/([A-Z]+)(\d+)/);
        const bMatch = bWellId.match(/([A-Z]+)(\d+)/);
        
        if (aMatch && bMatch) {
            const letterCompare = aMatch[1].localeCompare(bMatch[1]);
            if (letterCompare !== 0) return letterCompare;
            return parseInt(aMatch[2]) - parseInt(bMatch[2]);
        }
        return aWellId.localeCompare(bWellId);
    });
    
    // Populate filtered wells
    filteredResults.forEach(([wellKey, result]) => {
        const option = document.createElement('option');
        option.value = wellKey;
        
        const wellId = result.well_id || wellKey;
        const sampleName = result.sample || result.sample_name || 'N/A';
        const status = result.is_good_scurve ? '✓' : '✗';
        
        option.textContent = `${status} ${wellId}: ${sampleName}`;
        wellSelector.appendChild(option);
    });
    
    // Add event listener for well selection
    wellSelector.removeEventListener('change', handleWellChange);
    wellSelector.addEventListener('change', handleWellChange);
}

function handleWellChange(event) {
    const selectedWell = event.target.value;
    if (selectedWell && selectedWell !== 'ALL_WELLS') {
        showWellDetails(selectedWell);
    } else if (selectedWell === 'ALL_WELLS') {
        // Handle "All Wells" selection based on current chart mode
        const fluorophoreSelector = document.getElementById('fluorophoreSelect');
        const selectedFluorophore = fluorophoreSelector ? fluorophoreSelector.value : 'all';
        
        if (currentChartMode === 'all') {
            showAllCurves(selectedFluorophore);
        } else if (currentChartMode === 'good') {
            showGoodCurves(selectedFluorophore);
        }
    }
}

function populateWellSelector(individualResults) {
    // First populate the fluorophore selector
    populateFluorophoreSelector(individualResults);
    
    // Then populate wells with all fluorophores initially
    filterWellsByFluorophore('all');
}

function populateResultsTable(individualResults) {
    try {
        const tableBody = document.getElementById('resultsTableBody');
        if (!tableBody) {
            console.error('Results table body not found');
            return;
        }
        
        tableBody.innerHTML = '';
        
        Object.entries(individualResults).forEach(([wellKey, result]) => {
        const row = document.createElement('tr');
        row.setAttribute('data-well-key', wellKey); // Store actual wellKey for modal navigation
        
        // Existing quality badge
        const statusClass = result.is_good_scurve ? 'status-good' : 'status-poor';
        const statusText = result.is_good_scurve ? 'Good S-Curve' : 'Poor Fit';
        
        // New stricter criteria badges
        let strictBadgeClass = '';
        let strictBadgeText = '';
        
        const r2Score = result.r2_score || 0;
        const steepness = result.steepness || 0;
        const amplitude = result.amplitude || 0;
        
        // Apply strict criteria using amplitude thresholds AND anomaly check
        try {
            // First get anomalies data
            let hasAnomalies = false;
            if (result.anomalies) {
                try {
                    const anomalies = typeof result.anomalies === 'string' ? 
                        JSON.parse(result.anomalies) : result.anomalies;
                    hasAnomalies = Array.isArray(anomalies) && anomalies.length > 0 && 
                                  !(anomalies.length === 1 && anomalies[0] === 'None');
                } catch (e) {
                    hasAnomalies = true; // If can't parse, assume there are anomalies
                }
            }
            
            // Apply enhanced criteria
            if (amplitude > 500 && !hasAnomalies) {
                strictBadgeClass = 'strict-pos';
                strictBadgeText = 'POS';
            } else if (amplitude < 400) {
                strictBadgeClass = 'strict-neg';
                strictBadgeText = 'NEG';
            } else {
                // REDO: amplitude 400-500 OR amplitude > 500 with anomalies
                strictBadgeClass = 'strict-redo';
                strictBadgeText = 'REDO';
            }
        } catch (e) {
            console.error('Error applying strict criteria:', e.message);
            strictBadgeClass = 'strict-redo';
            strictBadgeText = 'REDO';
        }
        
        // Handle anomalies data properly
        let anomaliesText = 'None';
        if (result.anomalies) {
            try {
                const anomalies = typeof result.anomalies === 'string' ? 
                    JSON.parse(result.anomalies) : result.anomalies;
                anomaliesText = Array.isArray(anomalies) && anomalies.length > 0 ? 
                    anomalies.join(', ') : 'None';
            } catch (e) {
                anomaliesText = 'Parse Error';
            }
        }
        
        let wellId = result.well_id || wellKey.split('_')[0];
        const fluorophore = result.fluorophore || 'Unknown';
        const sampleName = result.sample || result.sample_name || 'N/A';
        
        // Debug sample name for troubleshooting
        if (wellKey.includes('A1')) {
            console.log(`Sample debug for ${wellKey}:`, {
                sample: result.sample,
                sample_name: result.sample_name,
                final: sampleName
            });
        }
        const cqValue = result.cq_value !== null && result.cq_value !== undefined ? 
            result.cq_value.toFixed(2) : 'N/A';
        
        // Only show strict badge if criteria are met
        const strictBadgeHTML = strictBadgeText ? 
            `<span class="strict-badge ${strictBadgeClass}">${strictBadgeText}</span>` : 
            '-';

        row.innerHTML = `
            <td><strong>${wellId}</strong></td>
            <td>${sampleName}</td>
            <td><span class="fluorophore-tag fluorophore-${fluorophore.toLowerCase()}">${fluorophore}</span></td>
            <td>${strictBadgeHTML}</td>
            <td><span class="status ${statusClass}">${statusText}</span></td>
            <td>${result.r2_score ? result.r2_score.toFixed(4) : 'N/A'}</td>
            <td>${result.rmse ? result.rmse.toFixed(2) : 'N/A'}</td>
            <td>${result.amplitude ? result.amplitude.toFixed(1) : 'N/A'}</td>
            <td>${result.steepness ? result.steepness.toFixed(3) : 'N/A'}</td>
            <td>${result.midpoint ? result.midpoint.toFixed(1) : 'N/A'}</td>
            <td>${result.baseline ? result.baseline.toFixed(1) : 'N/A'}</td>
            <td>${cqValue}</td>
            <td>${anomaliesText}</td>
        `;
        
        row.addEventListener('click', () => {
            const wellSelect = document.getElementById('wellSelect');
            if (wellSelect) {
                wellSelect.value = wellKey;
            }
            showWellModal(wellKey);
        });
        
        tableBody.appendChild(row);
    });
    

    } catch (mainError) {
        console.error('Error in populateResultsTable function:', mainError.message);
        console.error('Stack trace:', mainError.stack);
        
        // Still try to populate basic table without advanced features
        const tableBody = document.getElementById('resultsTableBody');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="10">Error loading results. Check console for details.</td></tr>';
        }
    }
}

function showWellDetails(wellKey) {
    if (!currentAnalysisResults || !currentAnalysisResults.individual_results) {
        console.error('No analysis results available');
        return;
    }
    
    const wellResult = currentAnalysisResults.individual_results[wellKey];
    if (!wellResult) {
        console.error('Well result not found:', wellKey);
        return;
    }
    
    updateChart(wellKey);
    
    let wellId = wellResult.well_id || wellKey;
    const fluorophore = wellResult.fluorophore || 'Unknown';
    const sampleName = wellResult.sample || wellResult.sample_name || 'N/A';
    
    // Check if we should show filtered samples list
    // Use currentChartMode for filtering logic since POS/NEG/REDO buttons update that
    const effectiveFilterMode = (currentChartMode === 'pos' || currentChartMode === 'neg' || currentChartMode === 'redo') ? currentChartMode : currentFilterMode;
    const shouldShowFilteredSamples = (effectiveFilterMode === 'pos' || effectiveFilterMode === 'neg' || effectiveFilterMode === 'redo') && 
                                     currentFluorophore && currentFluorophore !== 'all';
    
    let filteredSamplesHtml = '';
    if (shouldShowFilteredSamples) {
        filteredSamplesHtml = generateFilteredSamplesHtml(effectiveFilterMode);
    }
    
    const detailsHtml = `
        <h3>${wellId}: ${sampleName} (${fluorophore})</h3>
        <div class="quality-status ${wellResult.is_good_scurve ? 'good' : 'poor'}">
            <strong>Quality:</strong> ${wellResult.is_good_scurve ? 'Good S-Curve ✓' : 'Poor S-Curve ✗'}
        </div>
        <div class="metrics-grid">
            <div class="metric">
                <span class="metric-label">R² Score:</span>
                <span class="metric-value">${(wellResult.r2_score || 0).toFixed(4)}</span>
            </div>
            <div class="metric">
                <span class="metric-label">RMSE:</span>
                <span class="metric-value">${(wellResult.rmse || 0).toFixed(2)}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Amplitude:</span>
                <span class="metric-value">${(wellResult.amplitude || 0).toFixed(2)}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Midpoint:</span>
                <span class="metric-value">${(wellResult.midpoint || 0).toFixed(2)}</span>
            </div>
        </div>
        ${filteredSamplesHtml}
    `;
    
    document.getElementById('curveDetails').innerHTML = detailsHtml;
}

function updateSelectedCurveDetails() {
    // Get currently selected well from the dropdown
    const wellSelector = document.getElementById('wellSelect');
    if (!wellSelector || !wellSelector.value) {
        return;
    }
    
    const selectedWell = wellSelector.value;
    if (selectedWell && selectedWell !== 'Select a well') {
        showWellDetails(selectedWell);
    }
}

function showFilteredCurveDetails(fluorophore, filterMode) {
    if (!fluorophore || fluorophore === 'all' || !filterMode || filterMode === 'all') {
        return;
    }
    
    // Set the current fluorophore for filtering
    currentFluorophore = fluorophore;
    
    // Generate filtered samples HTML
    const filteredSamplesHtml = generateFilteredSamplesHtml(filterMode);
    
    const filterTypeLabel = filterMode.toUpperCase();
    const detailsHtml = `
        <h3>${filterTypeLabel} Results for ${fluorophore}</h3>
        <div class="quality-status good">
            <strong>Filter Mode:</strong> ${filterTypeLabel} Results Only
        </div>
        <div class="metrics-grid">
            <div class="metric">
                <span class="metric-label">Fluorophore:</span>
                <span class="metric-value">${fluorophore}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Filter:</span>
                <span class="metric-value">${filterTypeLabel}</span>
            </div>
        </div>
        ${filteredSamplesHtml}
    `;
    
    document.getElementById('curveDetails').innerHTML = detailsHtml;
}

function generateFilteredSamplesHtml(effectiveFilterMode = null) {
    if (!currentAnalysisResults || !currentAnalysisResults.individual_results) {
        return '';
    }
    
    // Use passed parameter or fall back to currentFilterMode
    const filterMode = effectiveFilterMode || currentFilterMode;
    
    // Ensure filter variables are defined (defensive programming for historical sessions)
    if (!filterMode || !currentFluorophore || filterMode === 'all' || currentFluorophore === 'all') {
        return '';
    }
    
    // Filter samples by current fluorophore and filter mode
    const filteredSamples = [];
    const filterType = filterMode === 'pos' ? 'POS' : filterMode === 'neg' ? 'NEG' : 'REDO';
    
    Object.entries(currentAnalysisResults.individual_results).forEach(([wellKey, result]) => {
        const resultFluorophore = result.fluorophore || 'Unknown';
        if (resultFluorophore !== currentFluorophore) return;
        
        const amplitude = result.amplitude || 0;
        
        // Check for anomalies
        let hasAnomalies = false;
        if (result.anomalies) {
            try {
                const anomalies = typeof result.anomalies === 'string' ? 
                    JSON.parse(result.anomalies) : result.anomalies;
                hasAnomalies = Array.isArray(anomalies) && anomalies.length > 0 && 
                              !(anomalies.length === 1 && anomalies[0] === 'None');
            } catch (e) {
                hasAnomalies = true;
            }
        }
        
        // Apply filter criteria
        let matchesFilter = false;
        if (filterMode === 'pos') {
            matchesFilter = amplitude > 500 && !hasAnomalies;
        } else if (filterMode === 'neg') {
            matchesFilter = amplitude < 400;
        } else if (filterMode === 'redo') {
            matchesFilter = (amplitude >= 400 && amplitude <= 500) || (amplitude > 500 && hasAnomalies);
        }
        
        if (matchesFilter) {
            filteredSamples.push({
                wellId: result.well_id || wellKey,
                sampleName: result.sample || result.sample_name || 'N/A',
                amplitude: amplitude
            });
        }
    });
    
    // Sort by well ID
    filteredSamples.sort((a, b) => {
        const aMatch = a.wellId.match(/([A-Z]+)(\d+)/);
        const bMatch = b.wellId.match(/([A-Z]+)(\d+)/);
        
        if (aMatch && bMatch) {
            const letterCompare = aMatch[1].localeCompare(bMatch[1]);
            if (letterCompare !== 0) return letterCompare;
            return parseInt(aMatch[2]) - parseInt(bMatch[2]);
        }
        return a.wellId.localeCompare(b.wellId);
    });
    
    // Calculate statistics
    const totalCount = filteredSamples.length;
    const avgAmplitude = totalCount > 0 ? 
        filteredSamples.reduce((sum, sample) => sum + sample.amplitude, 0) / totalCount : 0;
    
    // Generate sample list HTML
    const sampleListHtml = filteredSamples.map(sample => `
        <div class="sample-item">
            <span class="sample-well">${sample.wellId}</span>
            <span class="sample-name">${sample.sampleName}</span>
            <span class="sample-amplitude">${sample.amplitude.toFixed(0)}</span>
        </div>
    `).join('');
    
    return `
        <div class="filtered-samples-section">
            <h4>${filterType} Samples (${currentFluorophore})</h4>
            <div class="filtered-samples-list">
                ${sampleListHtml}
            </div>
            <div class="filtered-stats">
                <div class="filtered-stats-row">
                    <span class="filtered-stats-label">Count:</span>
                    <span class="filtered-stats-value">${totalCount}</span>
                </div>
                <div class="filtered-stats-row">
                    <span class="filtered-stats-label">Avg Amplitude:</span>
                    <span class="filtered-stats-value">${avgAmplitude.toFixed(1)}</span>
                </div>
            </div>
        </div>
    `;
}

function updateChart(wellKey, cyclesData = null, rfuData = null, wellData = null) {
    // Use currentAnalysisResults for global access
    if (!currentAnalysisResults || !currentAnalysisResults.individual_results) return;
    
    const wellResult = wellData || currentAnalysisResults.individual_results[wellKey];
    if (!wellResult) return;
    
    let wellId = wellResult.well_id || wellKey.split('_')[0];
    const fluorophore = wellResult.fluorophore || 'Unknown';
    
    // Use provided data or extract from wellResult
    let cycles = [];
    let rfu = [];
    
    if (cyclesData && rfuData) {
        cycles = cyclesData;
        rfu = rfuData;
    } else {
        try {
            if (wellResult.raw_cycles) {
                let parsedCycles = typeof wellResult.raw_cycles === 'string' ? 
                    JSON.parse(wellResult.raw_cycles) : wellResult.raw_cycles;
                
                // Convert object to array if needed (database sometimes stores as object)
                if (parsedCycles && typeof parsedCycles === 'object' && !Array.isArray(parsedCycles)) {
                    cycles = Object.values(parsedCycles);
                } else {
                    cycles = parsedCycles;
                }
            }
            if (wellResult.raw_rfu) {
                let parsedRfu = typeof wellResult.raw_rfu === 'string' ? 
                    JSON.parse(wellResult.raw_rfu) : wellResult.raw_rfu;
                
                // Convert object to array if needed (database sometimes stores as object)
                if (parsedRfu && typeof parsedRfu === 'object' && !Array.isArray(parsedRfu)) {
                    rfu = Object.values(parsedRfu);
                } else {
                    rfu = parsedRfu;
                }
            }
        } catch (e) {
            console.error('Error parsing raw data for well:', wellKey, e);
            return;
        }
    }
    
    if (!cycles || cycles.length === 0 || !rfu || rfu.length === 0) {
        console.log('No chart data available for well:', wellKey, {
            wellResult: !!wellResult,
            rawCycles: wellResult?.raw_cycles ? (typeof wellResult.raw_cycles) + ' length:' + (wellResult.raw_cycles.length || 'N/A') : 'missing',
            rawRfu: wellResult?.raw_rfu ? (typeof wellResult.raw_rfu) + ' length:' + (wellResult.raw_rfu.length || 'N/A') : 'missing',
            cycles: cycles,
            rfu: rfu
        });
        return;
    }
    
    const ctx = document.getElementById('amplificationChart').getContext('2d');
    
    // Destroy existing chart
    if (window.amplificationChart) {
        safeDestroyChart();
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
            label: `${wellId} (${fluorophore}) - Fitted Curve`,
            data: fitData,
            backgroundColor: 'rgba(231, 76, 60, 0.3)',
            borderColor: 'rgba(192, 57, 43, 1)',
            borderWidth: 2,
            pointRadius: 0,
            showLine: true,
            tension: 0.4
        });
    }
    
    window.amplificationChart = new Chart(ctx, {
        type: 'scatter',
        data: { datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            aspectRatio: 1.8,
            plugins: {
                title: {
                    display: true,
                    text: `${getCurrentFullPattern()} - qPCR Amplification Curve - ${wellId} (${fluorophore})`,
                    font: { size: 16, weight: 'bold' }
                },
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                x: {
                    title: { 
                        display: true, 
                        text: 'Cycle Number',
                        font: { size: 14, weight: 'bold' }
                    },
                    grid: { color: 'rgba(0,0,0,0.1)' }
                },
                y: {
                    title: { 
                        display: true, 
                        text: 'RFU (Relative Fluorescence Units)',
                        font: { size: 14, weight: 'bold' }
                    },
                    grid: { color: 'rgba(0,0,0,0.1)' },
                    min: function(context) {
                        const data = context.chart.data.datasets[0].data;
                        const minVal = Math.min(...data.map(point => point.y));
                        return minVal - (minVal * 0.15);
                    },
                    max: function(context) {
                        const data = context.chart.data.datasets[0].data;
                        const maxVal = Math.max(...data.map(point => point.y));
                        return maxVal + (maxVal * 0.15);
                    }
                }
            }
        }
    });
}

// Utility functions
function prepareAnalysisData(data = null) {
    if (!data) {
        console.error('No data provided to prepareAnalysisData');
        return {};
    }
    
    if (data.length < 2) {
        console.error('Insufficient data rows');
        return {};
    }
    
    const wellData = {};
    let cycleColumnIndex = -1;
    let wellColumns = [];
    
    // Find the "Cycle" column and well columns
    for (let colIndex = 0; colIndex < data[0].length; colIndex++) {
        const header = data[0][colIndex];
        if (header && header.toLowerCase().includes('cycle')) {
            cycleColumnIndex = colIndex;
        } else if (header && header.match(/^[A-P](0?[1-9]|1[0-9]|2[0-4])$/)) {
            wellColumns.push({ index: colIndex, wellId: header });
        }
    }
    
    if (cycleColumnIndex === -1) {
        console.error('Could not find Cycle column');
        return {};
    }
    
    if (wellColumns.length === 0) {
        console.error('Could not find any well columns');
        return {};
    }
    
    // Extract data for each well
    wellColumns.forEach(wellCol => {
        const cycles = [];
        const rfu = [];
        
        for (let rowIndex = 1; rowIndex < data.length; rowIndex++) {
            const cycleValue = parseFloat(data[rowIndex][cycleColumnIndex]);
            const rfuValue = parseFloat(data[rowIndex][wellCol.index]);
            
            if (!isNaN(cycleValue) && !isNaN(rfuValue)) {
                cycles.push(cycleValue);
                rfu.push(rfuValue);
            }
        }
        
        if (cycles.length > 0 && rfu.length > 0) {
            wellData[wellCol.wellId] = {
                cycles: cycles,
                rfu: rfu
            };
        }
    });
    
    // Integrate sample names and Cq values
    console.log('=== INTEGRATING SAMPLE DATA ===');
    const cqData = parseCqData();
    const sampleNames = parseSampleNames();
    
    console.log('Available sample names keys:', Object.keys(sampleNames).slice(0, 10));
    console.log('Available Cq data keys:', Object.keys(cqData).slice(0, 10));
    console.log('Well data keys to integrate:', Object.keys(wellData).slice(0, 10));
    
    // Add sample names and Cq values to well data
    Object.keys(wellData).forEach(wellKey => {
        // Extract base well ID from fluorophore-tagged key (A1_Cy5 -> A1)
        const baseWellId = wellKey.split('_')[0];
        
        const sampleName = sampleNames[baseWellId] || 'Unknown';
        const cqValue = cqData[baseWellId] || null;
        
        wellData[wellKey].sample_name = sampleName;
        wellData[wellKey].cq_value = cqValue;
        
        // Debug first few wells
        if (['A1_Cy5', 'A2_Cy5', 'A3_Cy5'].includes(wellKey)) {
            console.log(`Well ${wellKey} integration:`, {
                baseWellId: baseWellId,
                availableInSamples: baseWellId in sampleNames,
                sampleFromParsing: sampleNames[baseWellId],
                finalSample: sampleName,
                availableInCq: baseWellId in cqData,
                cqFromParsing: cqData[baseWellId],
                finalCq: cqValue
            });
        }
    });
    
    console.log(`Prepared analysis data for ${Object.keys(wellData).length} wells`);
    return wellData;
}

function parseCqData(specificFluorophore = null) {
    console.log('=== PARSING CQ DATA ===');
    console.log('samplesData exists:', !!samplesData);
    console.log('specificFluorophore filter:', specificFluorophore);
    
    if (!samplesData) {
        console.log('No samples data available for Cq parsing');
        return {};
    }
    
    // Handle both string and parsed data
    let data;
    if (typeof samplesData === 'string') {
        const parsed = Papa.parse(samplesData, { header: false });
        data = parsed.data;
    } else if (samplesData.data) {
        data = samplesData.data;
    } else {
        console.log('Unknown samplesData format');
        return {};
    }
    
    console.log('Parsed Cq CSV rows:', data.length);
    console.log('First row (headers):', data[0]);
    
    if (data.length < 2) {
        console.log('Not enough data rows for Cq parsing');
        return {};
    }
    
    const cqDataResults = {};
    let wellColumnIndex = -1;
    let fluorColumnIndex = -1;
    let cqColumnIndex = -1;
    
    // Find Well, Fluorophore, and Cq columns
    for (let colIndex = 0; colIndex < data[0].length; colIndex++) {
        const header = data[0][colIndex];
        if (header) {
            const headerLower = header.toLowerCase().trim();
            if (headerLower.includes('well') || headerLower === 'well') {
                wellColumnIndex = colIndex;
            } else if (headerLower.includes('fluor') || headerLower === 'fluor') {
                fluorColumnIndex = colIndex;
            } else if (headerLower.includes('cq') || headerLower === 'cq' || headerLower.includes('ct')) {
                cqColumnIndex = colIndex;
            }
        }
    }
    
    // Use fixed indices for CFX Manager format if not found by header
    if (wellColumnIndex === -1 && data[0].length > 1) wellColumnIndex = 1;
    if (fluorColumnIndex === -1 && data[0].length > 2) fluorColumnIndex = 2;
    if (cqColumnIndex === -1 && data[0].length > 6) cqColumnIndex = 6;
    
    console.log(`Cq parsing: Well=${wellColumnIndex}, Fluor=${fluorColumnIndex}, Cq=${cqColumnIndex}`);
    
    if (wellColumnIndex === -1 || fluorColumnIndex === -1 || cqColumnIndex === -1) {
        console.warn('Could not find required columns in samples data');
        console.log('Available headers:', data[0]);
        return {};
    }
    
    // Extract Cq values with fluorophore filtering
    for (let rowIndex = 1; rowIndex < data.length; rowIndex++) {
        const currentWellId = data[rowIndex][wellColumnIndex];
        const fluorophore = data[rowIndex][fluorColumnIndex];
        const cqValue = parseFloat(data[rowIndex][cqColumnIndex]);
        
        // Skip if filtering for specific fluorophore and this doesn't match
        if (specificFluorophore && fluorophore !== specificFluorophore) {
            continue;
        }
        
        if (currentWellId && fluorophore && !isNaN(cqValue)) {
            // Convert A01 format to A1 format to match amplification files
            const convertedWellId = currentWellId.replace(/^([A-P])0(\d)$/, '$1$2');
            const wellKey = specificFluorophore ? convertedWellId : `${convertedWellId}_${fluorophore}`;
            cqDataResults[wellKey] = cqValue;
            
            if (rowIndex <= 5) { // Debug first few rows
                console.log(`Cq mapping: ${currentWellId}+${fluorophore} -> ${wellKey} = ${cqValue}`);
            }
        }
    }
    
    return cqDataResults;
}

function parseSampleNames(specificFluorophore = null) {
    console.log('=== PARSING SAMPLE NAMES ===');
    console.log('samplesData exists:', !!samplesData);
    console.log('specificFluorophore filter:', specificFluorophore);
    
    if (!samplesData) {
        console.log('No samples data available');
        return {};
    }
    
    // Handle both string and parsed data
    let data;
    if (typeof samplesData === 'string') {
        const parsed = Papa.parse(samplesData, { header: false });
        data = parsed.data;
    } else if (samplesData.data) {
        data = samplesData.data;
    } else {
        console.log('Unknown samplesData format');
        return {};
    }
    
    console.log('Parsed sample CSV rows:', data.length);
    console.log('First row (headers):', data[0]);
    
    if (data.length < 2) {
        console.log('Not enough data rows for sample parsing');
        return {};
    }
    
    const sampleNames = {};
    let wellColumnIndex = -1;
    let fluorColumnIndex = -1;
    let sampleColumnIndex = -1;
    
    // Find Well, Fluorophore, and Sample columns
    for (let colIndex = 0; colIndex < data[0].length; colIndex++) {
        const header = data[0][colIndex];
        if (header) {
            const headerLower = header.toLowerCase().trim();
            if (headerLower.includes('well') || headerLower === 'well') {
                wellColumnIndex = colIndex;
            } else if (headerLower.includes('fluor') || headerLower === 'fluor') {
                fluorColumnIndex = colIndex;
            } else if (headerLower.includes('sample') || headerLower === 'sample' || headerLower === 'target') {
                sampleColumnIndex = colIndex;
            }
        }
    }
    
    // Use fixed indices for CFX Manager format if not found by header
    if (wellColumnIndex === -1 && data[0].length > 1) wellColumnIndex = 1;
    if (fluorColumnIndex === -1 && data[0].length > 2) fluorColumnIndex = 2;
    if (sampleColumnIndex === -1 && data[0].length > 5) sampleColumnIndex = 5;
    
    console.log(`Sample parsing: Well=${wellColumnIndex}, Fluor=${fluorColumnIndex}, Sample=${sampleColumnIndex}`);
    
    if (wellColumnIndex === -1 || fluorColumnIndex === -1 || sampleColumnIndex === -1) {
        console.warn('Could not find required columns in samples data');
        console.log('Available headers:', data[0]);
        return {};
    }
    
    // Extract sample names with fluorophore filtering
    for (let rowIndex = 1; rowIndex < data.length; rowIndex++) {
        const currentWellId = data[rowIndex][wellColumnIndex];
        const fluorophore = data[rowIndex][fluorColumnIndex];
        const sampleName = data[rowIndex][sampleColumnIndex];
        
        // Skip if filtering for specific fluorophore and this doesn't match
        if (specificFluorophore && fluorophore !== specificFluorophore) {
            continue;
        }
        
        if (currentWellId && fluorophore && sampleName) {
            // Convert A01 format to A1 format to match amplification files
            const convertedWellId = currentWellId.replace(/^([A-P])0(\d)$/, '$1$2');
            const wellKey = specificFluorophore ? convertedWellId : `${convertedWellId}_${fluorophore}`;
            sampleNames[wellKey] = sampleName;
            
            if (rowIndex <= 5) { // Debug first few rows
                console.log(`Sample mapping: ${currentWellId}+${fluorophore} -> ${wellKey} = ${sampleName}`);
            }
        }
    }
    
    console.log('Parsed sample names:', Object.keys(sampleNames).length, 'samples found');
    console.log('Sample examples:', Object.keys(sampleNames).slice(0, 5).map(k => `${k}: ${sampleNames[k]}`));
    console.log('First few rows of sample data:', data.slice(1, 4).map(row => `${row[wellColumnIndex]} -> ${row[sampleColumnIndex]}`));
    
    return sampleNames;
}

// Multi-fluorophore support functions
function detectFluorophoreFromFilename(fileName) {
    console.log(`Detecting fluorophore from filename: ${fileName}`);
    
    // Enhanced detection for CFX Manager format: "Results_Cy5.csv"
    const fluorophores = ['Cy5', 'FAM', 'HEX', 'Texas Red'];
    
    for (const fluorophore of fluorophores) {
        // Check for exact match at end of filename (e.g., "Results_Cy5.csv")
        if (fileName.includes(`_${fluorophore}.csv`) || fileName.includes(`_${fluorophore}_`)) {
            console.log(`Found fluorophore: ${fluorophore}`);
            return fluorophore;
        }
        // Fallback to case-insensitive search
        if (fileName.toLowerCase().includes(fluorophore.toLowerCase())) {
            console.log(`Found fluorophore (fallback): ${fluorophore}`);
            return fluorophore;
        }
    }
    
    console.log(`No fluorophore detected in: ${fileName}`);
    return 'Unknown';
}

function updateAmplificationFilesList() {
    const filesList = document.getElementById('uploadedFiles');
    if (!filesList) return;
    
    const fluorophores = Object.keys(amplificationFiles);
    if (fluorophores.length === 0) {
        filesList.innerHTML = '<p>No amplification files uploaded</p>';
        return;
    }
    
    const filesHtml = fluorophores.map(fluorophore => {
        const file = amplificationFiles[fluorophore];
        return `<div class="file-item">
            <span class="fluorophore-tag ${fluorophore.toLowerCase().replace(' ', '-')}">${fluorophore}</span>
            <span class="file-name">${file.fileName}</span>
            <button onclick="removeFile('${fluorophore}')" style="margin-left: 10px; color: red; background: none; border: none; cursor: pointer;">✗</button>
        </div>`;
    }).join('');
    
    filesList.innerHTML = `<div><strong>Uploaded Files (${fluorophores.length}):</strong></div>` + filesHtml;
}

function removeFile(fluorophore) {
    delete amplificationFiles[fluorophore];
    updateAmplificationFilesList();
    checkAnalysisReady();
    console.log(`Removed ${fluorophore} file`);
}



function combineMultiFluorophoreResults(allResults) {
    console.log('=== COMBINING MULTI-FLUOROPHORE RESULTS ===');
    const fluorophores = Object.keys(allResults);
    const firstResult = allResults[fluorophores[0]];
    
    console.log('Uploaded fluorophores:', fluorophores);
    console.log('Processing fluorophore-specific sample integration...');
    
    const combined = {
        total_wells: firstResult.total_wells || 0,
        good_curves: [],
        success_rate: 0,
        individual_results: {},
        fluorophore_count: fluorophores.length
    };
    
    let totalGoodCurves = 0;
    let totalAnalyzedRecords = 0;
    
    fluorophores.forEach(fluorophore => {
        const results = allResults[fluorophore];
        
        // Parse fluorophore-specific sample names and Cq data
        const fluorSampleNames = parseSampleNames(fluorophore);
        const fluorCqData = parseCqData(fluorophore);
        
        console.log(`${fluorophore} - samples: ${Object.keys(fluorSampleNames).length}, Cq: ${Object.keys(fluorCqData).length}`);
        
        if (results.good_curves) {
            totalGoodCurves += results.good_curves.length;
            combined.good_curves.push(...results.good_curves.map(well => `${well}_${fluorophore}`));
        }
        
        if (results.individual_results) {
            totalAnalyzedRecords += Object.keys(results.individual_results).length;
            Object.keys(results.individual_results).forEach(wellKey => {
                const wellResult = results.individual_results[wellKey];
                const newWellKey = `${wellKey}_${fluorophore}`;
                
                // Use fluorophore-specific sample data
                const sampleName = fluorSampleNames[wellKey] || 'Unknown';
                const cqValue = fluorCqData[wellKey] || null;
                
                combined.individual_results[newWellKey] = {
                    ...wellResult,
                    fluorophore: fluorophore,
                    sample_name: sampleName,
                    cq_value: cqValue
                };
                
                // Debug first few integrations
                if (['A1', 'A2', 'A3'].includes(wellKey) && fluorophore === 'Cy5') {
                    console.log(`${fluorophore} integration ${newWellKey}:`, {
                        wellKey: wellKey,
                        sampleName: sampleName,
                        cqValue: cqValue,
                        fluorophore: fluorophore
                    });
                }
            });
        }
    });
    
    // Calculate success rate as percentage of good curves vs total analyzed records
    combined.success_rate = totalAnalyzedRecords > 0 ? 
        (totalGoodCurves / totalAnalyzedRecords * 100) : 0;
    
    console.log('Multi-fluorophore combination complete:', {
        fluorophores: fluorophores,
        totalRecords: Object.keys(combined.individual_results).length,
        totalGoodCurves: totalGoodCurves,
        successRate: combined.success_rate
    });
    
    return combined;
}

function combineMultiFluorophoreResultsSQL(allResults) {
    console.log('=== COMBINING SQL-INTEGRATED MULTI-FLUOROPHORE RESULTS ===');
    const fluorophores = Object.keys(allResults);
    const firstResult = allResults[fluorophores[0]];
    
    console.log('SQL-integrated fluorophores:', fluorophores);
    
    const combined = {
        total_wells: firstResult.total_wells || 0,
        good_curves: [],
        success_rate: 0,
        individual_results: {},
        fluorophore_count: fluorophores.length
    };
    
    let totalGoodCurves = 0;
    let totalAnalyzedRecords = 0;
    
    fluorophores.forEach(fluorophore => {
        const results = allResults[fluorophore];
        
        if (results.good_curves) {
            totalGoodCurves += results.good_curves.length;
            combined.good_curves.push(...results.good_curves.map(well => `${well}_${fluorophore}`));
        }
        
        if (results.individual_results) {
            totalAnalyzedRecords += Object.keys(results.individual_results).length;
            Object.keys(results.individual_results).forEach(wellKey => {
                const wellResult = results.individual_results[wellKey];
                const newWellKey = `${wellKey}_${fluorophore}`;
                
                // SQL integration already provided sample_name and cq_value
                combined.individual_results[newWellKey] = {
                    ...wellResult,
                    fluorophore: fluorophore
                };
            });
        }
    });
    
    // Calculate success rate
    combined.success_rate = totalAnalyzedRecords > 0 ? 
        (totalGoodCurves / totalAnalyzedRecords * 100) : 0;
    
    console.log('SQL-based multi-fluorophore combination complete:', {
        fluorophores: fluorophores,
        totalRecords: Object.keys(combined.individual_results).length,
        totalGoodCurves: totalGoodCurves,
        successRate: combined.success_rate
    });
    
    return combined;
}

// Clear any cached data on page load
function clearCachedData() {
    amplificationFiles = {};
    samplesData = null;
    analysisResults = null;
    currentAnalysisResults = null;
    
    // Reset filter states to prevent persistence on refresh
    currentFilterMode = 'all';
    currentFluorophore = 'all';
    currentChartMode = 'all';
    
    if (currentChart) {
        currentChart.destroy();
        currentChart = null;
    }
    
    // Clear file inputs
    const fileInput = document.getElementById('fileInput');
    const samplesInput = document.getElementById('samplesInput');
    if (fileInput) fileInput.value = '';
    if (samplesInput) samplesInput.value = '';
    
    // Reset dropdown selections
    const filterDropdown = document.getElementById('filterSelect');
    if (filterDropdown) {
        filterDropdown.value = 'all';
    }
    
    const fluorophoreDropdown = document.getElementById('fluorophoreFilter');
    if (fluorophoreDropdown) {
        fluorophoreDropdown.value = 'all';
    }
    
    // Reset chart mode buttons
    const chartButtons = ['showSelectedBtn', 'showAllBtn', 'showPosBtn', 'showNegBtn', 'showRedoBtn'];
    chartButtons.forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) {
            button.classList.remove('active');
        }
    });
    
    // Aggressively clear all status displays
    const statusElements = ['amplificationStatus', 'samplesStatus'];
    statusElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.innerHTML = '';
            element.textContent = '';
            element.className = 'file-status';
            element.removeAttribute('class');
            element.setAttribute('class', 'file-status');
        }
    });
    
    const uploadedFiles = document.getElementById('uploadedFiles');
    if (uploadedFiles) {
        uploadedFiles.innerHTML = '';
        uploadedFiles.textContent = '';
    }
    
    // Hide file info and analysis sections
    const fileInfo = document.getElementById('fileInfo');
    const analysisSection = document.getElementById('analysisSection');
    if (fileInfo) fileInfo.style.display = 'none';
    if (analysisSection) analysisSection.style.display = 'none';
    
    // Force DOM refresh
    setTimeout(() => {
        checkAnalysisReady();
    }, 100);
    
    console.log('Cleared all cached data aggressively');
}

// Clear amplification files specifically
function clearAmplificationFiles() {
    amplificationFiles = {};
    
    // Clear file input
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
    
    // Clear all status displays
    clearFileStatus('amplificationStatus');
    const uploadedFiles = document.getElementById('uploadedFiles');
    if (uploadedFiles) uploadedFiles.innerHTML = '';
    
    checkAnalysisReady();
    console.log('Cleared amplification files');
}

// Clear summary file specifically
function clearSummaryFile() {
    samplesData = null;
    
    // Clear file input
    const samplesInput = document.getElementById('samplesInput');
    if (samplesInput) samplesInput.value = '';
    
    // Clear status display properly
    clearFileStatus('samplesStatus');
    
    checkAnalysisReady();
    console.log('Cleared summary file');
}

// Function to ensure upload buttons are always enabled
function ensureUploadButtonsEnabled() {
    // AGGRESSIVE CACHE FIX: Force enable all upload buttons with multiple selectors
    const uploadButtons = document.querySelectorAll('.upload-btn, button[onclick*="fileInput"], button[onclick*="samplesInput"]');
    
    uploadButtons.forEach(button => {
        button.disabled = false;
        button.removeAttribute('disabled');
        button.style.opacity = '1';
        button.style.pointerEvents = 'auto';
        button.style.cursor = 'pointer';
        button.classList.remove('disabled');
        
        // Force visual state update
        button.style.backgroundColor = '';
        button.style.color = '';
    });
    
    // Direct ID-based targeting as backup
    const fileInputBtn = document.querySelector('button[onclick="document.getElementById(\'fileInput\').click()"]');
    const samplesInputBtn = document.querySelector('button[onclick="document.getElementById(\'samplesInput\').click()"]');
    
    [fileInputBtn, samplesInputBtn].forEach(button => {
        if (button) {
            button.disabled = false;
            button.removeAttribute('disabled');
            button.style.opacity = '1';
            button.style.pointerEvents = 'auto';
            button.style.cursor = 'pointer';
            button.classList.remove('disabled');
        }
    });
    
    console.log('CACHE-BUST: Upload buttons force-enabled with aggressive clearing');
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Clear any cached data first
    clearCachedData();
    
    // Ensure upload buttons are always enabled - Force immediate execution
    setTimeout(() => {
        ensureUploadButtonsEnabled();
        console.log('Force-enabled upload buttons after cache clear');
    }, 100);
    
    // File upload event listeners
    const fileInput = document.getElementById('fileInput');
    const samplesInput = document.getElementById('samplesInput');
    
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            const files = Array.from(e.target.files);
            files.forEach(file => handleFileUpload(file, 'amplification'));
        });
    }
    
    if (samplesInput) {
        samplesInput.addEventListener('change', function(e) {
            if (e.target.files[0]) {
                handleFileUpload(e.target.files[0], 'samples');
            }
        });
    }
    
    // Analysis button
    const analyzeBtn = document.getElementById('analyzeBtn');
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', performAnalysis);
    }
    
    // Well selector
    const wellSelector = document.getElementById('wellSelect');
    if (wellSelector) {
        wellSelector.addEventListener('change', function(e) {
            showWellDetails(e.target.value);
        });
    }
    
    // Export button
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportResults);
    }
    
    // Status filter dropdown
    const filterStatus = document.getElementById('filterStatus');
    if (filterStatus) {
        filterStatus.addEventListener('change', filterTable);
    }
    
    // Search wells input
    const searchWells = document.getElementById('searchWells');
    if (searchWells) {
        searchWells.addEventListener('input', filterTable);
    }
    
    // Delete all button
    const deleteAllBtn = document.getElementById('deleteAllBtn');
    if (deleteAllBtn) {
        deleteAllBtn.addEventListener('click', deleteAllSessions);
    }
    
    // Load analysis history on page load
    loadAnalysisHistory();
});

// Export and history functions (simplified)
function saveAnalysisToHistory(filename, results) {
    // Save to local storage as backup
    const history = getLocalAnalysisHistory();
    history.push({
        filename: filename,
        timestamp: new Date().toISOString(),
        results: results
    });
    
    // Keep only last 10 analyses
    if (history.length > 10) {
        history.splice(0, history.length - 10);
    }
    
    try {
        localStorage.setItem('qpcrAnalysisHistory', JSON.stringify(history));
    } catch (e) {
        console.warn('Unable to save to local storage (data too large):', e);
        // Continue without local storage
    }
    loadAnalysisHistory();
}

async function saveSingleFluorophoreSession(filename, results, fluorophore) {
    try {
        const response = await fetch('/sessions/save-combined', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filename: filename,
                combined_results: results,
                fluorophores: [fluorophore]
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            console.log('Single fluorophore session saved:', result.display_name);
            // Refresh history display
            loadAnalysisHistory();
        } else {
            console.error('Failed to save single fluorophore session:', result.error);
            // Fallback to local storage
            saveAnalysisToHistory(filename, results);
        }
        
    } catch (error) {
        console.error('Error saving single fluorophore session:', error);
        // Fallback to local storage
        saveAnalysisToHistory(filename, results);
    }
}

async function saveCombinedSession(filename, combinedResults, fluorophores = []) {
    // Disable combined session saving due to data structure issues
    // Only individual fluorophore sessions will be saved
    console.log('Combined session saving disabled - using individual sessions only');
    console.log('Individual sessions working correctly:', fluorophores);
    
    // Still refresh history to show the individual sessions
    loadAnalysisHistory();
}

function getLocalAnalysisHistory() {
    try {
        return JSON.parse(localStorage.getItem('qpcrAnalysisHistory') || '[]');
    } catch (e) {
        return [];
    }
}

async function loadAnalysisHistory() {
    try {
        // Try to load from server first
        const response = await fetch('/sessions');
        const data = await response.json();
        
        if (data.sessions && data.sessions.length > 0) {
            displayAnalysisHistory(data.sessions);
            // Always validate channel completeness and update UI after loading history
            validateAndUpdateUI(data.sessions);
        } else {
            // Fallback to local storage
            const localHistory = getLocalAnalysisHistory();
            displayLocalAnalysisHistory(localHistory);
            // Clear channel completion status if no sessions
            const statusContainer = document.getElementById('channelCompletionStatus');
            if (statusContainer) {
                statusContainer.innerHTML = '<p>No analysis history available for channel validation.</p>';
            }
        }
    } catch (error) {
        console.error('Error loading history:', error);
        // Fallback to local storage
        const localHistory = getLocalAnalysisHistory();
        displayLocalAnalysisHistory(localHistory);
    }
}

// Channel validation and UI update functions
function validateAndUpdateUI(sessions) {
    if (typeof getTestCompletionStatus !== 'function') {
        console.warn('Pathogen library not loaded - skipping validation');
        return;
    }
    
    // Filter sessions to only current experiment pattern if we have loaded analysis results
    let sessionsToValidate = sessions;
    if (currentAnalysisResults && currentAnalysisResults.individual_results) {
        const currentPattern = getCurrentFullPattern();
        if (currentPattern) {
            sessionsToValidate = sessions.filter(session => {
                const sessionPattern = extractBasePattern(session.filename);
                return sessionPattern === currentPattern;
            });
        }
    }
    
    const testStatus = getTestCompletionStatus(sessionsToValidate);
    console.log('Test completion status:', testStatus);
    
    // Check if any test has incomplete channels - only for current experiment
    let hasIncompleteCurrentTests = false;
    let incompleteTestsInfo = [];
    
    // Count complete experiments for trend analysis
    let hasCompleteExperiments = false;
    
    Object.values(testStatus).forEach(test => {
        test.experiments.forEach(experiment => {
            if (experiment.validation.isComplete) {
                hasCompleteExperiments = true;
            } else {
                // Only flag as incomplete if it's a recent experiment (has recent sessions)
                const recentSessions = experiment.sessionIds.filter(id => {
                    const session = sessions.find(s => s.id === id);
                    if (!session) return false;
                    const sessionDate = new Date(session.upload_timestamp);
                    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                    return sessionDate > oneDayAgo;
                });
                
                if (recentSessions.length > 0) {
                    hasIncompleteCurrentTests = true;
                    incompleteTestsInfo.push({
                        testCode: test.testCode,
                        experimentPattern: experiment.experimentPattern,
                        missing: experiment.validation.missingChannels,
                        completion: experiment.validation.completionRate
                    });
                }
            }
        });
    });
    
    // Enable trend analysis unless we have incomplete current tests AND no complete experiments
    // Always enable if there are complete experiments OR if there are no experiments at all
    const shouldDisableTrends = hasIncompleteCurrentTests && !hasCompleteExperiments && Object.keys(testStatus).length > 0;
    updateTrendAnalysisButton(shouldDisableTrends, incompleteTestsInfo);
    
    // Export still requires current session completeness
    updateExportButton(hasIncompleteCurrentTests, incompleteTestsInfo);
    
    // Channel completion status no longer needed - system handles grouping correctly
}

function updateTrendAnalysisButton(hasIncompleteTests, incompleteTestsInfo) {
    // Find trend analysis button by multiple methods
    const trendButton = document.querySelector('[onclick="viewTrendAnalysis()"]') || 
                       document.querySelector('button[onclick="viewTrendAnalysis()"]') ||
                       Array.from(document.querySelectorAll('button')).find(btn => 
                           btn.textContent.includes('View Trends') || btn.textContent.includes('Trend'));
    
    if (trendButton) {
        // Always enable trend analysis - only check for complete experiments, not incomplete ones
        trendButton.disabled = false;
        trendButton.style.opacity = '1';
        trendButton.title = 'View trend analysis across all completed experiments';
        trendButton.innerHTML = 'View Trends';
    }
}

function updateExportButton(hasIncompleteTests, incompleteTestsInfo) {
    // Find export button by ID first, then fallback methods
    const exportButton = document.getElementById('exportBtn') ||
                         document.querySelector('[onclick="exportResults()"]') || 
                         document.querySelector('button[onclick="exportResults()"]') ||
                         Array.from(document.querySelectorAll('button')).find(btn => 
                             btn.textContent.includes('Export') || btn.textContent.includes('CSV'));
    
    if (exportButton) {
        // Check if current experiment is complete by looking at loaded data
        const isCurrentExperimentComplete = checkCurrentExperimentComplete();
        
        // FIXED LOGIC: Enable export when experiment IS complete
        if (isCurrentExperimentComplete) {
            exportButton.disabled = false;
            exportButton.style.opacity = '1';
            exportButton.style.cursor = 'pointer';
            exportButton.title = 'Export analysis results to CSV';
            exportButton.textContent = 'Export Results';
        } else if (hasIncompleteTests) {
            exportButton.disabled = true;
            exportButton.style.opacity = '0.5';
            exportButton.style.cursor = 'not-allowed';
            const missingTests = incompleteTestsInfo.map(test => test.testCode).join(', ');
            exportButton.title = `Export disabled: Missing channels for ${missingTests}. Complete all required pathogen channels first.`;
            exportButton.textContent = 'Export Disabled';
        } else {
            exportButton.disabled = true;
            exportButton.style.opacity = '0.5';
            exportButton.style.cursor = 'not-allowed';
            exportButton.title = 'Load experiment analysis first to enable export';
            exportButton.textContent = 'Export Disabled';
        }
    }
}

function checkCurrentExperimentComplete() {
    // Check if we have loaded analysis results
    if (!currentAnalysisResults || !currentAnalysisResults.individual_results) {
        return false;
    }
    
    // Get current experiment pattern
    const currentPattern = getCurrentFullPattern();
    if (!currentPattern) {
        return Object.keys(currentAnalysisResults.individual_results).length > 0;
    }
    
    // Check how many channels this experiment type requires
    const testCode = extractTestCode(currentPattern);
    const requiredChannels = ['FAM', 'HEX', 'Cy5']; // BVAB requires 3 channels
    
    // Count available fluorophores in current results
    const results = currentAnalysisResults.individual_results;
    const fluorophores = new Set();
    
    Object.keys(results).forEach(wellKey => {
        const fluorophore = wellKey.split('_').pop() || 'Unknown';
        if (fluorophore !== 'Unknown') {
            fluorophores.add(fluorophore);
        }
    });
    
    // For BVAB experiments, require all 3 channels
    if (testCode === 'BVAB' || testCode === 'AcBVAB') {
        return fluorophores.size >= 3;
    }
    
    // For other experiments, consider complete if has data
    return fluorophores.size > 0;
}

function displayChannelCompletionStatus(testStatus) {
    const statusContainer = safeGetElement('channelCompletionStatus', 'displayChannelCompletionStatus');
    if (!statusContainer) {
        return;
    }
    
    console.log('Displaying channel completion status for tests:', Object.keys(testStatus));
    
    if (Object.keys(testStatus).length === 0) {
        statusContainer.style.display = 'none';
        return;
    }
    
    let statusHtml = '<h3>Pathogen Channel Completion Status</h3>';
    
    Object.values(testStatus).forEach(test => {
        const requiredChannels = getRequiredChannels ? getRequiredChannels(test.testCode) : [];
        
        statusHtml += `
            <div class="test-completion-card">
                <h4>${test.testCode} Test</h4>
                <p>Required channels: ${requiredChannels.join(', ')}</p>
                
                ${test.experiments.map(experiment => `
                    <div class="experiment-status ${experiment.validation.isComplete ? 'complete' : 'incomplete'}">
                        <div class="experiment-name">${experiment.experimentName || experiment.experimentPattern}</div>
                        <div class="channel-progress">
                            <span class="completion-rate">${experiment.validation.completionRate}% complete</span>
                            <div class="channel-indicators">
                                ${requiredChannels.map(channel => {
                                    const isPresent = experiment.uploadedChannels.includes(channel);
                                    const pathogenTarget = getPathogenTarget ? getPathogenTarget(test.testCode, channel) : channel;
                                    return `<span class="channel-indicator ${isPresent ? 'present' : 'missing'}" 
                                                  title="${pathogenTarget}">
                                              ${channel}${isPresent ? ' ✓' : ' ✗'}
                                            </span>`;
                                }).join('')}
                            </div>
                        </div>
                        ${!experiment.validation.isComplete ? 
                            `<div class="missing-channels">Missing: ${experiment.validation.missingChannels.join(', ')}</div>` : 
                            '<div class="complete-status">✓ All channels complete - Trend analysis enabled</div>'
                        }
                    </div>
                `).join('')}
            </div>
        `;
    });
    
    statusContainer.innerHTML = statusHtml;
    statusContainer.style.display = 'block';
}

async function updatePathogenChannelStatusInBreakdown() {
    try {
        // Check if we have current analysis results first
        if (currentAnalysisResults && currentAnalysisResults.individual_results) {
            // For current analysis, check fluorophores directly from results
            const currentPattern = getCurrentFullPattern();
            const testCode = extractTestCode(currentPattern);
            
            if (testCode && getRequiredChannels) {
                const requiredChannels = getRequiredChannels(testCode);
                const availableChannels = new Set();
                
                // Extract fluorophores from current results
                Object.keys(currentAnalysisResults.individual_results).forEach(wellKey => {
                    const fluorophore = wellKey.split('_').pop();
                    if (fluorophore && ['Cy5', 'FAM', 'HEX', 'Texas Red'].includes(fluorophore)) {
                        availableChannels.add(fluorophore);
                    }
                });
                
                const availableChannelsArray = Array.from(availableChannels);
                const validation = validateChannelCompleteness(testCode, availableChannelsArray);
                
                console.log('Current analysis validation:', {
                    testCode,
                    requiredChannels,
                    availableChannels: availableChannelsArray,
                    validation
                });
                
                // Display status based on current analysis
                const statusContainer = document.getElementById('pathogenChannelStatus');
                if (statusContainer) {
                    if (!validation.isComplete) {
                        statusContainer.innerHTML = `
                            <div class="pathogen-status-header">
                                <h5>⚠️ Add all channels for complete stats</h5>
                                <div class="channel-status-alert">
                                    <strong>${testCode} - ${currentPattern}</strong>: 
                                    ${validation.completionRate}% complete 
                                    (Missing: ${validation.missingChannels.join(', ')})
                                    <div class="channel-indicators">
                                        ${requiredChannels.map(channel => {
                                            const isPresent = availableChannelsArray.includes(channel);
                                            const pathogenTarget = getPathogenTarget ? getPathogenTarget(testCode, channel) : channel;
                                            return `<span class="channel-indicator ${isPresent ? 'present' : 'missing'}" 
                                                          title="${pathogenTarget}">
                                                      ${channel}
                                                    </span>`;
                                        }).join('')}
                                    </div>
                                </div>
                            </div>
                        `;
                    } else {
                        statusContainer.innerHTML = '<div class="all-complete">✓ All pathogen channels complete</div>';
                    }
                }
                return;
            }
        }
        
        // Fallback to database sessions check for loaded sessions
        const response = await fetch('/sessions');
        const data = await response.json();
        
        if (data.sessions && data.sessions.length > 0) {
            // Filter sessions to only current experiment pattern to prevent mixing data
            let sessionsToValidate = data.sessions;
            const currentPattern = getCurrentFullPattern();
            if (currentPattern) {
                sessionsToValidate = data.sessions.filter(session => {
                    const sessionPattern = extractBasePattern(session.filename);
                    return sessionPattern === currentPattern;
                });
                console.log('Filtered sessions for validation:', sessionsToValidate.length, 'matching pattern:', currentPattern);
            }
            
            const testStatus = getTestCompletionStatus(sessionsToValidate);
            displayPathogenChannelStatusInBreakdown(testStatus);
        }
    } catch (error) {
        console.error('Error updating pathogen channel status:', error);
    }
}

function displayPathogenChannelStatusInBreakdown(testStatus) {
    const statusContainer = document.getElementById('pathogenChannelStatus');
    if (!statusContainer) return;
    
    if (Object.keys(testStatus).length === 0) {
        statusContainer.innerHTML = '';
        return;
    }
    
    // Get the current experiment pattern from loaded analysis results
    const currentPattern = getCurrentFullPattern();
    
    let statusHtml = '';
    let hasCurrentExperiment = false;
    
    Object.values(testStatus).forEach(test => {
        const requiredChannels = getRequiredChannels ? getRequiredChannels(test.testCode) : [];
        
        test.experiments.forEach(experiment => {
            // Only show status for the currently loaded experiment
            if (currentPattern && experiment.experimentPattern === currentPattern) {
                hasCurrentExperiment = true;
                
                if (!experiment.validation.isComplete) {
                    statusHtml += `
                        <div class="channel-status-alert">
                            <strong>${test.testCode} - ${experiment.experimentPattern}</strong>: 
                            ${experiment.validation.completionRate}% complete 
                            (Missing: ${experiment.validation.missingChannels.join(', ')})
                            <div class="channel-indicators">
                                ${requiredChannels.map(channel => {
                                    const isPresent = experiment.uploadedChannels.includes(channel);
                                    const pathogenTarget = getPathogenTarget ? getPathogenTarget(test.testCode, channel) : channel;
                                    return `<span class="channel-indicator ${isPresent ? 'present' : 'missing'}" 
                                                  title="${pathogenTarget}">
                                              ${channel}
                                            </span>`;
                                }).join('')}
                            </div>
                        </div>
                    `;
                }
            }
        });
    });
    
    if (statusHtml) {
        statusContainer.innerHTML = `
            <div class="pathogen-status-header">
                <h5>Pending Channel Requirements:</h5>
                ${statusHtml}
            </div>
        `;
    } else if (hasCurrentExperiment) {
        // Only show complete if we actually found a complete experiment
        const anyComplete = Object.values(testStatus).some(test => 
            test.experiments.some(exp => 
                exp.experimentPattern === currentPattern && exp.validation && exp.validation.isComplete
            )
        );
        
        if (anyComplete) {
            statusContainer.innerHTML = '<div class="all-complete">✓ All pathogen channels complete</div>';
        } else {
            statusContainer.innerHTML = '';
        }
    } else {
        statusContainer.innerHTML = '';
    }
}

// Helper functions for history display
function groupSessionsByExperiment(sessions) {
    // Group sessions by experiment pattern
    const experimentGroups = {};
    
    sessions.forEach(session => {
        const experimentPattern = extractBasePattern(session.filename);
        console.log(`Grouping session: ${session.filename} -> Pattern: ${experimentPattern}`);
        if (!experimentGroups[experimentPattern]) {
            experimentGroups[experimentPattern] = [];
        }
        experimentGroups[experimentPattern].push(session);
    });
    
    // Create combined multi-fluorophore sessions
    const combinedSessions = [];
    
    Object.entries(experimentGroups).forEach(([experimentPattern, groupSessions]) => {
        // Filter out sessions without detectable fluorophores for multi-fluorophore combinations
        const validSessions = groupSessions.filter(session => {
            const fluorophore = detectFluorophoreFromFilename(session.filename);
            return fluorophore && fluorophore !== 'Unknown';
        });
        
        if (validSessions.length === 0) {
            // No valid sessions with detectable fluorophores - skip this group
            console.log(`Skipping experiment group ${experimentPattern} - no valid fluorophore sessions`);
            return;
        } else if (validSessions.length === 1) {
            // Single valid session - keep as is with original filename for proper fluorophore detection
            const session = validSessions[0];
            // Don't modify filename to preserve fluorophore detection for pathogen targets
            combinedSessions.push(session);
        } else {
            // Multiple valid sessions - combine into multi-fluorophore session
            const combinedSession = createCombinedSession(experimentPattern, validSessions);
            combinedSessions.push(combinedSession);
        }
    });
    
    return combinedSessions;
}

function createCombinedSession(experimentPattern, sessions) {
    // Sort sessions by upload timestamp to get the latest as base
    const sortedSessions = sessions.sort((a, b) => 
        new Date(b.upload_timestamp) - new Date(a.upload_timestamp)
    );
    
    // Combine all well results from all sessions
    const allWellResults = [];
    const fluorophores = [];
    let totalPositive = 0;
    let totalWells = 0;
    
    sessions.forEach(session => {
        // Add all well results from this session
        if (session.well_results && session.well_results.length > 0) {
            allWellResults.push(...session.well_results);
            totalWells += session.well_results.length;
            
            // Count positive results from this session
            const sessionPositive = session.well_results.filter(well => {
                const amplitude = well.amplitude || 0;
                let hasAnomalies = false;
                
                if (well.anomalies) {
                    try {
                        const anomalies = typeof well.anomalies === 'string' ? 
                            JSON.parse(well.anomalies) : well.anomalies;
                        hasAnomalies = Array.isArray(anomalies) && anomalies.length > 0 && 
                                      !(anomalies.length === 1 && anomalies[0] === 'None');
                    } catch (e) {
                        hasAnomalies = true;
                    }
                }
                
                return amplitude > 500 && !hasAnomalies;
            }).length;
            
            totalPositive += sessionPositive;
        }
        
        // Extract fluorophore from filename
        const fluorophore = detectFluorophoreFromFilename(session.filename);
        console.log(`Detecting fluorophore from filename: ${session.filename}`);
        console.log(`Found fluorophore: ${fluorophore}`);
        
        // Only include sessions with detectable fluorophores
        if (fluorophore && fluorophore !== 'Unknown' && !fluorophores.includes(fluorophore)) {
            fluorophores.push(fluorophore);
        }
    });
    
    // Calculate pathogen breakdown
    const pathogenBreakdown = calculatePathogenBreakdownFromSessions(sessions);
    
    // Create combined session object
    return {
        id: `combined_${experimentPattern}`,
        filename: experimentPattern,
        upload_timestamp: sortedSessions[0].upload_timestamp,
        total_wells: allWellResults.length,
        good_curves: totalPositive,
        success_rate: allWellResults.length > 0 ? (totalPositive / allWellResults.length) * 100 : 0,
        cycle_min: Math.min(...sessions.map(s => s.cycle_min).filter(c => c)),
        cycle_max: Math.max(...sessions.map(s => s.cycle_max).filter(c => c)),
        cycle_count: sessions[0].cycle_count,
        pathogen_breakdown: pathogenBreakdown,
        well_results: allWellResults,
        session_ids: sessions.map(s => s.id),
        is_combined: true
    };
}

function calculatePathogenBreakdownFromSessions(sessions) {
    const fluorophoreStats = {};
    
    sessions.forEach(session => {
        let fluorophore = detectFluorophoreFromFilename(session.filename);
        
        // Enhanced fluorophore detection for single channel sessions
        if (!fluorophore || fluorophore === 'Unknown') {
            // Try to extract from stored pathogen_breakdown if available
            if (session.pathogen_breakdown && session.pathogen_breakdown !== 'Unknown: 0.0%') {
                const matches = session.pathogen_breakdown.match(/^(BVAB[123]|Cy5|FAM|HEX|Texas Red):/);
                if (matches) {
                    const pathogenTarget = matches[1];
                    // Map pathogen target back to fluorophore
                    if (pathogenTarget === 'BVAB1') fluorophore = 'HEX';
                    else if (pathogenTarget === 'BVAB2') fluorophore = 'FAM';
                    else if (pathogenTarget === 'BVAB3') fluorophore = 'Cy5';
                    else fluorophore = pathogenTarget;
                }
            }
            
            // Try to extract from well results fluorophore data
            if ((!fluorophore || fluorophore === 'Unknown') && session.well_results && session.well_results.length > 0) {
                for (const well of session.well_results) {
                    let wellFluorophore = well.fluorophore;
                    
                    // Try fit_parameters if direct fluorophore not available
                    if (!wellFluorophore || wellFluorophore === 'Unknown') {
                        try {
                            const fitParams = typeof well.fit_parameters === 'string' ? 
                                JSON.parse(well.fit_parameters) : well.fit_parameters;
                            if (fitParams && fitParams.fluorophore && fitParams.fluorophore !== 'Unknown') {
                                wellFluorophore = fitParams.fluorophore;
                            }
                        } catch (e) {
                            // Continue trying other methods
                        }
                    }
                    
                    // Try well_id extraction (A1_Cy5 -> Cy5)
                    if ((!wellFluorophore || wellFluorophore === 'Unknown') && well.well_id && well.well_id.includes('_')) {
                        const parts = well.well_id.split('_');
                        if (parts.length > 1) {
                            const possibleFluorophore = parts[parts.length - 1];
                            if (['Cy5', 'FAM', 'HEX', 'Texas Red'].includes(possibleFluorophore)) {
                                wellFluorophore = possibleFluorophore;
                            }
                        }
                    }
                    
                    if (wellFluorophore && wellFluorophore !== 'Unknown') {
                        fluorophore = wellFluorophore;
                        break;
                    }
                }
            }
        }
        
        // Skip only if truly no fluorophore can be detected
        if (!fluorophore || fluorophore === 'Unknown') return;
        
        let positive = 0;
        const total = session.well_results ? session.well_results.length : 0;
        
        if (session.well_results) {
            session.well_results.forEach(well => {
                const amplitude = well.amplitude || 0;
                if (amplitude > 500) {
                    positive++;
                }
            });
        }
        
        const rate = total > 0 ? (positive / total * 100).toFixed(1) : '0.0';
        const pathogenTarget = getPathogenTarget('BVAB', fluorophore) || fluorophore;
        
        fluorophoreStats[fluorophore] = `${pathogenTarget}: ${rate}%`;
    });
    
    // Order by standard fluorophore sequence
    const orderedFluorophores = ['Cy5', 'FAM', 'HEX', 'Texas Red'];
    const orderedStats = [];
    
    orderedFluorophores.forEach(fluorophore => {
        if (fluorophoreStats[fluorophore]) {
            orderedStats.push(fluorophoreStats[fluorophore]);
        }
    });
    
    return orderedStats.join(' | ');
}

function calculatePositiveRate(session) {
    // Use stored pathogen breakdown if available for multi-fluorophore sessions
    if (session.pathogen_breakdown) {
        return session.pathogen_breakdown;
    }
    
    // Calculate pathogen-specific positive rates for sessions without stored breakdown
    if (!session.well_results || session.well_results.length === 0) {
        return "0.0";
    }
    
    // Group wells by fluorophore/pathogen
    const fluorophoreGroups = {};
    session.well_results.forEach(well => {
        let fluorophore = well.fluorophore || 'Unknown';
        
        // Try to extract from fit_parameters if not directly available
        if (fluorophore === 'Unknown' && well.fit_parameters) {
            try {
                const fitParams = typeof well.fit_parameters === 'string' ? 
                    JSON.parse(well.fit_parameters) : well.fit_parameters;
                if (fitParams.fluorophore && fitParams.fluorophore !== 'Unknown') {
                    fluorophore = fitParams.fluorophore;
                }
            } catch (e) {
                // Continue with fallback methods
            }
        }
        
        // Try to extract from well_id if still unknown (A1_Cy5 -> Cy5)
        if (fluorophore === 'Unknown' && well.well_id && well.well_id.includes('_')) {
            const parts = well.well_id.split('_');
            if (parts.length > 1) {
                const possibleFluorophore = parts[parts.length - 1];
                if (['Cy5', 'FAM', 'HEX', 'Texas Red'].includes(possibleFluorophore)) {
                    fluorophore = possibleFluorophore;
                }
            }
        }
        
        // For single-channel sessions, try to extract fluorophore from session filename
        if (fluorophore === 'Unknown' && session.filename) {
            const detectedFluorophore = detectFluorophoreFromFilename(session.filename);
            if (detectedFluorophore && detectedFluorophore !== 'Unknown') {
                fluorophore = detectedFluorophore;
            }
        }
        
        // Fallback to extractFluorophoreFromWellId function if still unknown
        if (fluorophore === 'Unknown') {
            fluorophore = extractFluorophoreFromWellId(well.well_id) || 'Unknown';
        }
        
        if (!fluorophoreGroups[fluorophore]) {
            fluorophoreGroups[fluorophore] = { total: 0, positive: 0 };
        }
        fluorophoreGroups[fluorophore].total++;
        
        const amplitude = well.amplitude || 0;
        let hasAnomalies = false;
        
        if (well.anomalies) {
            try {
                const anomalies = typeof well.anomalies === 'string' ? 
                    JSON.parse(well.anomalies) : well.anomalies;
                hasAnomalies = Array.isArray(anomalies) && anomalies.length > 0 && 
                              !(anomalies.length === 1 && anomalies[0] === 'None');
            } catch (e) {
                hasAnomalies = true;
            }
        }
        
        // POS criteria: amplitude > 500 AND no anomalies
        if (amplitude > 500 && !hasAnomalies) {
            fluorophoreGroups[fluorophore].positive++;
        }
    });
    
    // Create pathogen-specific display with debugging
    const pathogenRates = [];
    const fluorophoreOrder = ['Cy5', 'FAM', 'HEX', 'Texas Red'];
    
    console.log('Positive rate calculation debug:', {
        fluorophoreGroups,
        sessionFilename: session.filename,
        sessionId: session.id,
        wellResultsCount: session.well_results ? session.well_results.length : 0,
        firstWellSample: session.well_results && session.well_results.length > 0 ? {
            well_id: session.well_results[0].well_id,
            fluorophore: session.well_results[0].fluorophore,
            amplitude: session.well_results[0].amplitude
        } : null
    });
    
    // Sort fluorophores in standard order
    const sortedFluorophores = Object.keys(fluorophoreGroups).sort((a, b) => {
        const aIndex = fluorophoreOrder.indexOf(a);
        const bIndex = fluorophoreOrder.indexOf(b);
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return a.localeCompare(b);
    });
    
    sortedFluorophores.forEach(fluorophore => {
        const group = fluorophoreGroups[fluorophore];
        const rate = (group.positive / group.total * 100).toFixed(1);
        
        // Get pathogen target for display - extract test code from session filename
        let pathogenTarget = fluorophore;
        if (typeof getPathogenTarget === 'function') {
            const testCode = extractTestCode(session.filename || '');
            pathogenTarget = getPathogenTarget(testCode, fluorophore) || fluorophore;
        }
        
        pathogenRates.push(`${pathogenTarget}: ${rate}%`);
    });
    
    // For multi-fluorophore sessions with no fluorophore data, check if we have individual sessions
    if (pathogenRates.length === 0 && session.well_results && session.well_results.length > 1000) {
        // This appears to be a multi-fluorophore session with missing fluorophore data
        // Try to extract from well_id patterns instead
        const wellIdGroups = {};
        session.well_results.forEach(well => {
            if (well.well_id && well.well_id.includes('_')) {
                const parts = well.well_id.split('_');
                if (parts.length > 1) {
                    const possibleFluorophore = parts[parts.length - 1];
                    if (['Cy5', 'FAM', 'HEX', 'Texas Red'].includes(possibleFluorophore)) {
                        if (!wellIdGroups[possibleFluorophore]) {
                            wellIdGroups[possibleFluorophore] = { total: 0, positive: 0 };
                        }
                        wellIdGroups[possibleFluorophore].total++;
                        
                        const amplitude = well.amplitude || 0;
                        let hasAnomalies = false;
                        
                        if (well.anomalies) {
                            try {
                                const anomalies = typeof well.anomalies === 'string' ? 
                                    JSON.parse(well.anomalies) : well.anomalies;
                                hasAnomalies = Array.isArray(anomalies) && anomalies.length > 0 && 
                                              !(anomalies.length === 1 && anomalies[0] === 'None');
                            } catch (e) {
                                hasAnomalies = true;
                            }
                        }
                        
                        if (amplitude > 500 && !hasAnomalies) {
                            wellIdGroups[possibleFluorophore].positive++;
                        }
                    }
                }
            }
        });
        
        // Create rates from well_id extraction with proper pathogen mapping
        const extractedRates = [];
        const fluorophoreOrder = ['Cy5', 'FAM', 'HEX', 'Texas Red'];
        
        fluorophoreOrder.forEach(fluorophore => {
            if (wellIdGroups[fluorophore]) {
                const group = wellIdGroups[fluorophore];
                const rate = (group.positive / group.total * 100).toFixed(1);
                
                // Extract test code from session filename for pathogen target mapping
                let pathogenTarget = fluorophore;
                if (typeof getPathogenTarget === 'function') {
                    const testCode = extractTestCode(session.filename) || 'BVAB';
                    pathogenTarget = getPathogenTarget(testCode, fluorophore) || fluorophore;
                }
                
                extractedRates.push(`${pathogenTarget}: ${rate}%`);
            }
        });
        
        if (extractedRates.length > 0) {
            return extractedRates.join(' | ');
        }
    }
    
    // For multi-fluorophore sessions, show all rates with separators
    if (pathogenRates.length > 1) {
        return pathogenRates.join(' | ');
    } else if (pathogenRates.length === 1) {
        return pathogenRates[0];
    }
    
    return "0.0";
}

function extractFluorophoreFromWellId(wellId) {
    // Extract fluorophore from well_id format like "A1_Cy5" -> "Cy5"
    if (!wellId || typeof wellId !== 'string') return null;
    const parts = wellId.split('_');
    return parts.length > 1 ? parts[1] : null;
}

function extractCycleInfo(session) {
    // Primary: Use session cycle_count if available
    if (session.cycle_count && session.cycle_count > 0) {
        return session.cycle_count.toString();
    }
    
    // Secondary: Use cycle range from session data
    if (session.cycle_max && session.cycle_min) {
        return session.cycle_count ? session.cycle_count.toString() : `${session.cycle_min}-${session.cycle_max}`;
    }
    
    // Extract cycle information from well results if session data unavailable
    if (session.well_results && session.well_results.length > 0) {
        for (const well of session.well_results) {
            if (well.raw_cycles) {
                try {
                    const cycles = typeof well.raw_cycles === 'string' ? 
                        JSON.parse(well.raw_cycles) : well.raw_cycles;
                    if (Array.isArray(cycles) && cycles.length > 0) {
                        return cycles.length.toString();
                    }
                } catch (e) {
                    continue;
                }
            }
            
            // Try data_points field as fallback
            if (well.data_points && well.data_points > 0) {
                return well.data_points.toString();
            }
        }
    }
    
    return "N/A";
}

function clearPathogenBreakdownDisplay() {
    // Clear pathogen breakdown section to prevent mixing data from different experiments
    const pathogenBreakdownSection = document.querySelector('.pathogen-breakdown-section');
    if (pathogenBreakdownSection) {
        pathogenBreakdownSection.innerHTML = '';
    }
    
    // Clear pending channel requirements display
    const pendingChannelSection = document.querySelector('#pendingChannelRequirements');
    if (pendingChannelSection) {
        pendingChannelSection.innerHTML = '';
    }
    
    // Clear channel completion status
    const channelStatusSection = document.querySelector('#channelCompletionStatus');
    if (channelStatusSection) {
        channelStatusSection.innerHTML = '';
    }
}

function disableChannelValidationForHistoryView(sessionFilename) {
    // Hide or disable channel validation UI when viewing historical sessions
    // This prevents showing pending requirements from other unrelated experiments
    
    const channelStatusElements = document.querySelectorAll('.channel-completion-status, .pathogen-status-card');
    channelStatusElements.forEach(element => {
        element.style.display = 'none';
    });
    
    // Also hide any pending channel requirement messages
    const pendingMessages = document.querySelectorAll('.pending-channel-message, .channel-requirements');
    pendingMessages.forEach(element => {
        element.style.display = 'none';
    });
    
    console.log('Disabled channel validation UI for historical session:', sessionFilename);
}

function displayAnalysisHistory(sessions) {
    const historyContent = safeGetElement('historyContent', 'displayAnalysisHistory');
    if (!historyContent) return;
    
    if (!sessions || sessions.length === 0) {
        historyContent.innerHTML = '<p>No analysis history available.</p>';
        return;
    }
    
    // Group sessions by experiment pattern and create multi-fluorophore sessions
    const groupedSessions = groupSessionsByExperiment(sessions);
    
    // Store grouped sessions globally for reference
    window.currentCombinedSessions = groupedSessions;
    
    // Sort grouped sessions by upload timestamp (newest first)
    const sortedSessions = [...groupedSessions].sort((a, b) => 
        new Date(b.upload_timestamp) - new Date(a.upload_timestamp)
    );
    
    const tableHtml = `
        <table class="history-table">
            <thead>
                <tr>
                    <th>File Name</th>
                    <th>Date</th>
                    <th>Wells</th>
                    <th>Positive Rate</th>
                    <th>Cycles</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${sortedSessions.map(session => `
                    <tr data-session-id="${session.id}" class="history-row">
                        <td><strong><a href="javascript:void(0)" onclick="loadSessionDetails('${session.id}')" class="session-link">${session.display_name || session.filename}</a></strong></td>
                        <td>${new Date(session.upload_timestamp).toLocaleString()}</td>
                        <td>
                            <div class="session-stats">
                                <span class="session-stat">${session.total_wells} total</span>
                            </div>
                        </td>
                        <td>${calculatePositiveRate(session)}${!session.is_combined ? '<br><small style="color: #e67e22;">⚠️ Add all channels for complete stats</small>' : ''}</td>
                        <td>${extractCycleInfo(session)}</td>
                        <td onclick="event.stopPropagation()">
                            <button onclick="loadSessionDetails('${session.id}')" class="btn-small btn-primary">View</button>
                            <button onclick="deleteSessionGroup('${session.id}', event)" class="btn-small btn-danger">Delete</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    historyContent.innerHTML = tableHtml;
}

function displayLocalAnalysisHistory(history) {
    const historyContent = document.getElementById('historyContent');
    if (!historyContent) return;
    
    if (history.length === 0) {
        historyContent.innerHTML = '<p>No local analysis history available.</p>';
        return;
    }
    
    const tableHtml = `
        <table class="history-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Filename</th>
                    <th>Wells</th>
                    <th>Good Curves</th>
                    <th>Positive Rate</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${history.map((session, index) => `
                    <tr>
                        <td>${new Date(session.timestamp).toLocaleDateString()}</td>
                        <td>${session.filename}</td>
                        <td>${session.results.total_wells || 0}</td>
                        <td>${session.results.good_curves ? session.results.good_curves.length : 0}</td>
                        <td>${session.results.success_rate ? (session.results.success_rate * 100).toFixed(1) : 0}%</td>
                        <td>
                            <button onclick="loadLocalSessionDetails(${index})" class="btn-small btn-primary">View</button>
                            <button onclick="deleteLocalSession(${index})" class="btn-small btn-danger">Delete</button>
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
        console.log('Loading session details for ID:', sessionId);
        
        // Check if this is a fresh load after refresh
        const pendingSessionLoad = localStorage.getItem('pendingSessionLoad');
        if (!pendingSessionLoad) {
            // First time - store session ID and refresh
            console.log('Storing session ID and refreshing browser');
            localStorage.setItem('pendingSessionLoad', sessionId);
            window.location.reload();
            return;
        } else if (pendingSessionLoad !== sessionId) {
            // Different session ID - store new one and refresh
            console.log('Different session - storing new ID and refreshing');
            localStorage.setItem('pendingSessionLoad', sessionId);
            window.location.reload();
            return;
        }
        
        // This is after refresh - clear the flag and proceed with loading
        localStorage.removeItem('pendingSessionLoad');
        console.log('Loading session after refresh:', sessionId);
        
        // Handle combined sessions
        if (typeof sessionId === 'string' && sessionId.startsWith('combined_')) {
            const combinedSession = window.currentCombinedSessions?.find(s => s.id === sessionId);
            if (combinedSession) {
                console.log('Loading combined session data:', combinedSession);
                displaySessionResults(combinedSession);
                return;
            } else {
                throw new Error('Combined session not found');
            }
        }
        
        // Handle individual database sessions
        const response = await fetch(`/sessions/${sessionId}`);
        const sessionData = await response.json();
        
        if (!sessionData.session) {
            throw new Error('Session not found');
        }
        
        const session = sessionData.session;
        const wells = sessionData.wells || [];
        console.log('Loaded session data:', {sessionName: session.filename, wellCount: wells.length});
        
        // Store session filename for pattern extraction
        window.currentSessionFilename = session.filename;
        
        // Transform the session data into the expected format
        const transformedResults = {
            total_wells: session.total_wells,
            good_curves: wells.filter(well => well.is_good_scurve).map(well => well.well_id),
            success_rate: session.success_rate,
            filename: session.filename, // Add filename to results
            individual_results: {}
        };
        
        // Transform well results
        wells.forEach((well, index) => {
            // Enhanced fluorophore detection for history loading
            let fluorophore = 'Unknown';
            let baseWellId = well.well_id;
            
            // Method 1: Extract from well_id if it contains fluorophore suffix (A1_Cy5)
            if (well.well_id.includes('_')) {
                const parts = well.well_id.split('_');
                baseWellId = parts[0];
                const possibleFluorophore = parts[1];
                if (['Cy5', 'FAM', 'HEX', 'Texas Red'].includes(possibleFluorophore)) {
                    fluorophore = possibleFluorophore;
                }
            }
            
            // Method 2: Try to get from well.fluorophore field
            if (fluorophore === 'Unknown' && well.fluorophore && well.fluorophore !== 'Unknown') {
                fluorophore = well.fluorophore;
            }
            
            // Method 3: Extract from fit_parameters if available
            if (fluorophore === 'Unknown' && well.fit_parameters) {
                try {
                    const fitParams = typeof well.fit_parameters === 'string' ? 
                        JSON.parse(well.fit_parameters) : well.fit_parameters;
                    if (fitParams && fitParams.fluorophore && fitParams.fluorophore !== 'Unknown') {
                        fluorophore = fitParams.fluorophore;
                    }
                } catch (e) {
                    console.warn('Failed to parse fit_parameters for fluorophore detection:', e);
                }
            }
            
            // Method 4: Detect from session filename pattern
            if (fluorophore === 'Unknown') {
                fluorophore = detectFluorophoreFromFilename(session.filename);
            }
            
            const wellKey = well.well_id; // Use the full well_id as stored in database
            
            // Debug first few wells from database
            if (index < 3) {
                console.log(`History well ${well.well_id} raw data:`, {
                    rmse: well.rmse,
                    amplitude: well.amplitude,
                    steepness: well.steepness,
                    midpoint: well.midpoint,
                    baseline: well.baseline,
                    raw_cycles: typeof well.raw_cycles + ' length:' + (well.raw_cycles?.length || 'N/A'),
                    raw_rfu: typeof well.raw_rfu + ' length:' + (well.raw_rfu?.length || 'N/A')
                });
            }
            
            transformedResults.individual_results[wellKey] = {
                well_id: baseWellId,
                fluorophore: fluorophore,
                is_good_scurve: well.is_good_scurve,
                r2_score: well.r2_score,
                rmse: well.rmse,
                amplitude: well.amplitude,
                steepness: well.steepness,
                midpoint: well.midpoint,
                baseline: well.baseline,
                data_points: well.data_points,
                cycle_range: well.cycle_range,
                sample: well.sample_name,
                sample_name: well.sample_name,
                cq_value: well.cq_value,
                
                // Debug parameter values during history loading
                _debug_params: {
                    rmse: well.rmse,
                    amplitude: well.amplitude,
                    steepness: well.steepness,
                    midpoint: well.midpoint,
                    baseline: well.baseline
                },
                anomalies: (() => {
                    try {
                        if (Array.isArray(well.anomalies)) {
                            return well.anomalies;
                        }
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
                raw_cycles: (() => {
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
                raw_rfu: (() => {
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
        });
        
        // Set global analysis results for chart functionality
        analysisResults = transformedResults;
        currentAnalysisResults = transformedResults;
        
        // Store session data globally for pathogen target extraction
        window.currentSessionData = sessionData;
        
        // Auto-detect fluorophore for individual channel sessions and set filter
        const sessionFluorophores = [...new Set(Object.values(transformedResults.individual_results).map(well => well.fluorophore))];
        let autoSelectedFluorophore = 'all';
        
        if (sessionFluorophores.length === 1 && sessionFluorophores[0] !== 'Unknown') {
            // Single fluorophore session - auto-select it
            autoSelectedFluorophore = sessionFluorophores[0];
            currentFluorophore = autoSelectedFluorophore;
        } else {
            // Multi-fluorophore or unknown - reset to all
            currentFluorophore = 'all';
        }
        
        // Reset other filter states
        currentFilterMode = 'all';
        currentChartMode = 'all';
        
        // Use appropriate display method based on session type
        if (sessionFluorophores.length === 1 && sessionFluorophores[0] !== 'Unknown') {
            // Single fluorophore session - use standard display
            displayAnalysisResults(transformedResults);
        } else {
            // Multi-fluorophore session - use combined display
            displayMultiFluorophoreResults(transformedResults);
        }
        
        // Reset filter state when loading from history
        resetFilterState();
        
        // Clear any existing pathogen breakdown from other experiments
        clearPathogenBreakdownDisplay();
        
        // Disable channel validation UI when viewing historical sessions
        // This prevents showing pending requirements from other experiments
        disableChannelValidationForHistoryView(session.filename);
        
        // Auto-select fluorophore filter for single-channel sessions
        if (autoSelectedFluorophore !== 'all') {
            const fluorophoreFilter = document.getElementById('fluorophoreFilter');
            if (fluorophoreFilter) {
                // Update dropdown to show the specific fluorophore
                fluorophoreFilter.value = autoSelectedFluorophore;
                
                // Update experiment pattern display with pathogen target
                updateExperimentPatternWithPathogen(session.filename, autoSelectedFluorophore);
                
                // Apply the fluorophore filter to show only relevant wells
                setTimeout(() => {
                    filterTableByFluorophore();
                    
                    // Initialize chart for single-channel session
                    if (sessionFluorophores.length === 1) {
                        initializeChart();
                        showAllWellsChart();
                    }
                }, 200);
            }
        }
        
        // Scroll to analysis section
        document.getElementById('analysisSection').scrollIntoView({ behavior: 'smooth' });
        
        console.log('Session loading complete - transformedResults keys:', Object.keys(transformedResults.individual_results).slice(0, 5));
        
    } catch (error) {
        console.error('Error loading session details:', error);
        alert('Error loading session details: ' + error.message);
    }
}

function loadLocalSessionDetails(sessionIndex) {
    try {
        const history = getLocalAnalysisHistory();
        if (!history || sessionIndex >= history.length) {
            console.error('Session not found in local history');
            return;
        }
        
        const session = history[sessionIndex];
        analysisResults = session.results;
        
        displayAnalysisResults(session.results);
        
        // Scroll to analysis section
        document.getElementById('analysisSection').scrollIntoView({ behavior: 'smooth' });
        
        console.log('Loaded local session:', session.filename);
        
    } catch (error) {
        console.error('Error loading local session details:', error);
        alert('Error loading analysis history: ' + error.message);
    }
}

async function deleteSession(sessionId, event) {
    if (!confirm('Are you sure you want to delete this analysis session?')) {
        return;
    }
    
    const deleteBtn = event.target;
    deleteBtn.disabled = true;
    
    try {
        const response = await fetch(`/sessions/${sessionId}`, { method: 'DELETE' });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to delete session');
        }
        
        // Reload history regardless of success/failure to refresh the list
        loadAnalysisHistory();
        
    } catch (error) {
        console.error('Error deleting session:', error);
        alert('Error deleting session: ' + error.message);
    } finally {
        // Re-enable the button
        deleteBtn.disabled = false;
    }
}

function deleteLocalSession(index) {
    if (!confirm('Are you sure you want to delete this local analysis session?')) {
        return;
    }
    
    const history = getLocalAnalysisHistory();
    history.splice(index, 1);
    localStorage.setItem('qpcr_analysis_history', JSON.stringify(history));
    
    // Reload history to refresh the display
    loadAnalysisHistory();
}

function clearAllLocalData() {
    if (!confirm('Are you sure you want to clear all local analysis data? This will remove all locally stored sessions.')) {
        return;
    }
    
    localStorage.removeItem('qpcr_analysis_history');
    localStorage.removeItem('qpcr_current_analysis');
    
    // Reload history to refresh the display
    loadAnalysisHistory();
    
    alert('All local analysis data has been cleared.');
}

async function deleteAllSessions() {
    if (!confirm('Are you sure you want to delete ALL analysis sessions? This action cannot be undone.')) {
        return;
    }
    
    try {
        // Get all sessions first
        const response = await fetch('/sessions');
        const data = await response.json();
        
        if (!data.sessions || data.sessions.length === 0) {
            alert('No sessions to delete.');
            return;
        }
        
        // Delete each session
        const deletePromises = data.sessions.map(session => 
            fetch(`/sessions/${session.id}`, { method: 'DELETE' })
        );
        
        await Promise.all(deletePromises);
        
        // Clear local storage as well
        localStorage.removeItem('qpcrAnalysisHistory');
        
        // Refresh the analysis history
        loadAnalysisHistory();
        
        alert(`Successfully deleted ${data.sessions.length} sessions.`);
        
    } catch (error) {
        console.error('Error deleting all sessions:', error);
        alert('Error deleting sessions: ' + error.message);
    }
}

function addFluorophoreFilter(individualResults) {
    // Extract unique fluorophores from results
    const fluorophores = [...new Set(Object.values(individualResults).map(result => result.fluorophore).filter(Boolean))];
    
    console.log('Fluorophores found in results:', fluorophores);
    console.log('Number of fluorophores:', fluorophores.length);
    
    // Always show fluorophore filter for context, even with single fluorophore
    // Single fluorophore sessions benefit from showing pathogen target information
    
    // Check if filter already exists
    let filterRow = document.querySelector('#fluorophoreFilterRow');
    if (!filterRow) {
        // Create filter row above table headers
        const tableHeader = document.querySelector('#resultsTable thead tr');
        if (tableHeader) {
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
    }
    
    const filterSelect = document.getElementById('fluorophoreFilter');
    if (filterSelect) {
        // Clear existing options except "All"
        filterSelect.innerHTML = '<option value="all">All Fluorophores</option>';
        
        // Add fluorophore options with pathogen targets
        const experimentPattern = getCurrentFullPattern();
        const testCode = extractTestCode(experimentPattern);
        
        fluorophores.forEach(fluorophore => {
            const option = document.createElement('option');
            option.value = fluorophore;
            const pathogenTarget = getPathogenTarget(testCode, fluorophore);
            option.textContent = pathogenTarget !== 'Unknown' ? `${fluorophore} (${pathogenTarget})` : fluorophore;
            filterSelect.appendChild(option);
        });
        
        // Add event listener
        filterSelect.removeEventListener('change', filterTableByFluorophore);
        filterSelect.addEventListener('change', filterTableByFluorophore);
    }
}

function filterTableByFluorophore() {
    // Instead of having separate filtering logic, just call the main filterTable function
    // which already handles both fluorophore and status filtering together
    filterTable();
}

// Export Results Function for Multi-Fluorophore Data
function exportResults() {
    if (!analysisResults) {
        alert('No analysis results to export');
        return;
    }
    
    const csvContent = generateResultsCSV();
    
    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qpcr_analysis_results_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

// Generate CSV with Multi-Fluorophore Support
function generateResultsCSV() {
    const headers = [
        'Well', 'Sample_Name', 'Fluorophore', 'Cq_Value', 'Status', 'R2_Score', 'RMSE', 
        'Amplitude', 'Steepness', 'Midpoint', 'Baseline', 'Data_Points', 'Cycle_Range', 'Anomalies'
    ];
    
    let csvContent = headers.join(',') + '\n';
    
    // Sort wells to group by fluorophore for better CSV organization
    const sortedEntries = Object.entries(analysisResults.individual_results).sort((a, b) => {
        const [wellKeyA, resultA] = a;
        const [wellKeyB, resultB] = b;
        
        // Sort by fluorophore first, then by well
        const fluorA = resultA.fluorophore || 'Unknown';
        const fluorB = resultB.fluorophore || 'Unknown';
        
        if (fluorA !== fluorB) {
            return fluorA.localeCompare(fluorB);
        }
        
        return wellKeyA.localeCompare(wellKeyB);
    });
    
    sortedEntries.forEach(([wellKey, result]) => {
        const wellId = result.well_id || wellKey.split('_')[0];
        const sampleName = result.sample || result.sample_name || 'N/A';
        const fluorophore = result.fluorophore || 'Unknown';
        const cqValue = result.cq_value !== null && result.cq_value !== undefined ? 
            result.cq_value.toFixed(2) : 'N/A';
        
        // Handle anomalies data
        let anomaliesText = 'None';
        if (result.anomalies) {
            try {
                const anomalies = typeof result.anomalies === 'string' ? 
                    JSON.parse(result.anomalies) : result.anomalies;
                anomaliesText = Array.isArray(anomalies) && anomalies.length > 0 ? 
                    anomalies.join(';') : 'None';
            } catch (e) {
                anomaliesText = 'Parse Error';
            }
        }
        
        const row = [
            wellId,
            `"${sampleName}"`, // Quote sample names to handle commas
            fluorophore,
            cqValue,
            result.is_good_scurve ? 'Good' : 'Poor',
            result.r2_score ? result.r2_score.toFixed(4) : 'N/A',
            result.rmse ? result.rmse.toFixed(2) : 'N/A',
            result.amplitude ? result.amplitude.toFixed(2) : 'N/A',
            result.steepness ? result.steepness.toFixed(4) : 'N/A',
            result.midpoint ? result.midpoint.toFixed(2) : 'N/A',
            result.baseline ? result.baseline.toFixed(2) : 'N/A',
            result.data_points || 'N/A',
            result.cycle_range ? result.cycle_range.toFixed(1) : 'N/A',
            `"${anomaliesText}"` // Quote anomalies to handle semicolons
        ];
        
        csvContent += row.join(',') + '\n';
    });
    
    return csvContent;
}

// Enhanced Filter Table Function
// Helper function to extract test pattern from current analysis
function getCurrentTestPattern() {
    // Try to get pattern from current amplification files
    if (amplificationFiles && Object.keys(amplificationFiles).length > 0) {
        const firstFile = Object.values(amplificationFiles)[0];
        if (firstFile && firstFile.fileName) {
            const basePattern = extractBasePattern(firstFile.fileName);
            // Extract test name (part before first underscore)
            return basePattern.split('_')[0];
        }
    }
    
    // Try to get pattern from samples data
    if (samplesData && samplesData.fileName) {
        const basePattern = extractBasePattern(samplesData.fileName);
        return basePattern.split('_')[0];
    }
    
    // Default fallback - look for any sample name starting with "Ac"
    return 'Ac';
}

function updateExperimentPatternWithPathogen(filename, fluorophore) {
    const experimentPatternElement = document.getElementById('experimentPattern');
    if (!experimentPatternElement) return;
    
    // Extract base pattern from filename
    const basePattern = extractBasePattern(filename);
    const testCode = extractTestCode(basePattern);
    
    // Get pathogen target for the fluorophore
    const pathogenTarget = getPathogenTarget ? getPathogenTarget(testCode, fluorophore) : fluorophore;
    
    // Display pattern with pathogen target
    if (pathogenTarget && pathogenTarget !== 'Unknown') {
        experimentPatternElement.textContent = `${basePattern} (${fluorophore} - ${pathogenTarget})`;
    } else {
        experimentPatternElement.textContent = `${basePattern} (${fluorophore})`;
    }
}

// Reset filter state to defaults
function resetFilterState() {
    // Reset filter dropdown to 'all'
    const filterStatus = document.getElementById('filterStatus');
    if (filterStatus) {
        filterStatus.value = 'all';
    }
    
    // Reset fluorophore filter to 'all'
    const fluorophoreFilter = document.getElementById('fluorophoreFilter');
    if (fluorophoreFilter) {
        fluorophoreFilter.value = 'all';
    }
    
    // Reset search input
    const searchWells = document.getElementById('searchWells');
    if (searchWells) {
        searchWells.value = '';
    }
    
    // Reset chart mode buttons
    const buttons = document.querySelectorAll('.view-controls .control-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    const showAllBtn = document.getElementById('showAllBtn');
    if (showAllBtn) {
        showAllBtn.classList.add('active');
    }
    
    // Reset global filter states
    currentFilterMode = 'all';
    currentFluorophore = 'all';
    currentChartMode = 'all';
    
    // Apply the reset filters
    filterTable();
}

// Helper function to get full experiment pattern
function getCurrentFullPattern() {
    // Try to get full pattern from current amplification files
    if (amplificationFiles && Object.keys(amplificationFiles).length > 0) {
        const firstFile = Object.values(amplificationFiles)[0];
        if (firstFile && firstFile.fileName) {
            return extractBasePattern(firstFile.fileName);
        }
    }
    
    // Try to get pattern from samples data
    if (samplesData && samplesData.fileName) {
        return extractBasePattern(samplesData.fileName);
    }
    
    // Try to get pattern from current analysis results (for history loading)
    if (analysisResults && analysisResults.filename) {
        return extractBasePattern(analysisResults.filename);
    }
    
    // Try to get pattern from loaded session data
    if (window.currentSessionFilename) {
        return extractBasePattern(window.currentSessionFilename);
    }
    
    return 'Unknown Pattern';
}

// Save experiment statistics for trend analysis
async function saveExperimentStatistics(experimentPattern, allResults, fluorophores) {
    try {
        console.log('Saving experiment statistics for:', experimentPattern, 'with fluorophores:', fluorophores);
        console.log('Results structure:', allResults);
        
        // Extract test name from experiment pattern (e.g., AcBVAB_2578825_CFX367393 -> AcBVAB)
        const testName = experimentPattern.split('_')[0] || 'Unknown';
        
        // Calculate fluorophore breakdown
        const fluorophoreBreakdown = {};
        
        // Handle both new analysis results and loaded session results
        if (allResults.individual_results) {
            // This is a loaded session - process differently
            const fluorophoreGroups = {};
            
            Object.entries(allResults.individual_results).forEach(([wellKey, wellData]) => {
                const fluorophore = wellData.fluorophore || wellKey.split('_').pop() || 'Unknown';
                if (fluorophore === 'Unknown') return;
                
                if (!fluorophoreGroups[fluorophore]) {
                    fluorophoreGroups[fluorophore] = { positive: 0, negative: 0, redo: 0, total: 0 };
                }
                
                fluorophoreGroups[fluorophore].total++;
                
                const amplitude = wellData.amplitude || 0;
                
                // Check for anomalies
                let hasAnomalies = false;
                if (wellData.anomalies) {
                    try {
                        const anomalies = Array.isArray(wellData.anomalies) ? 
                            wellData.anomalies : JSON.parse(wellData.anomalies || '[]');
                        hasAnomalies = Array.isArray(anomalies) && anomalies.length > 0 && 
                                      !(anomalies.length === 1 && anomalies[0] === 'None');
                    } catch (e) {
                        hasAnomalies = true;
                    }
                }
                
                // Apply enhanced criteria
                if (amplitude > 500 && !hasAnomalies) {
                    fluorophoreGroups[fluorophore].positive++;
                } else if (amplitude < 400) {
                    fluorophoreGroups[fluorophore].negative++;
                } else {
                    fluorophoreGroups[fluorophore].redo++;
                }
            });
            
            // Convert to final format
            Object.entries(fluorophoreGroups).forEach(([fluorophore, stats]) => {
                const posPercentage = stats.total > 0 ? (stats.positive / stats.total * 100) : 0;
                fluorophoreBreakdown[fluorophore] = {
                    total: stats.total,
                    positive: stats.positive,
                    negative: stats.negative,
                    redo: stats.redo,
                    pos_percentage: parseFloat(posPercentage.toFixed(1))
                };
            });
        } else {
            // This is new analysis results - original logic
            fluorophores.forEach(fluorophore => {
                const results = allResults[fluorophore];
                if (!results || !results.individual_results) return;
                
                let positive = 0, negative = 0, redo = 0;
                const wellResults = Object.values(results.individual_results);
                
                wellResults.forEach(well => {
                    const amplitude = well.amplitude || 0;
                    
                    // Check for anomalies
                    let hasAnomalies = false;
                    if (well.anomalies) {
                        try {
                            const anomalies = typeof well.anomalies === 'string' ? 
                                JSON.parse(well.anomalies) : well.anomalies;
                            hasAnomalies = Array.isArray(anomalies) && anomalies.length > 0 && 
                                          !(anomalies.length === 1 && anomalies[0] === 'None');
                        } catch (e) {
                            hasAnomalies = true;
                        }
                    }
                    
                    // Apply enhanced criteria
                    if (amplitude > 500 && !hasAnomalies) {
                        positive++;
                    } else if (amplitude < 400) {
                        negative++;
                    } else {
                        redo++;
                    }
                });
                
                const total = wellResults.length;
                const posPercentage = total > 0 ? (positive / total * 100) : 0;
                
                fluorophoreBreakdown[fluorophore] = {
                    total: total,
                    positive: positive,
                    negative: negative,
                    redo: redo,
                    pos_percentage: parseFloat(posPercentage.toFixed(1))
                };
            });
        }
        
        const payload = {
            experiment_name: experimentPattern,
            test_name: testName,
            fluorophore_breakdown: fluorophoreBreakdown
        };
        
        console.log('Statistics payload:', payload);
        
        const response = await fetch('/experiments/statistics', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('Experiment statistics saved successfully:', result.message);
        } else {
            console.error('Failed to save experiment statistics:', response.statusText);
        }
        
    } catch (error) {
        console.error('Error saving experiment statistics:', error);
    }
}

// View trend analysis data
async function viewTrendAnalysis() {
    try {
        console.log('Loading trend analysis data...');
        
        // First ensure all complete experiments have statistics saved
        await ensureAllExperimentStatistics();
        
        const response = await fetch('/experiments/statistics');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText || 'Server error'}`);
        }
        
        const data = await response.json();
        console.log('Trend analysis data:', data);
        
        if (!data || !data.experiments || data.experiments.length === 0) {
            console.warn('No trend analysis data available');
            const historyContent = safeGetElement('historyContent', 'viewTrendAnalysis');
            if (historyContent) {
                historyContent.innerHTML = `
                    <div class="trend-analysis-section">
                        <h3>Test Trend Analysis</h3>
                        <p>No trend analysis data available. Complete some analyses first to build trend history.</p>
                        <div class="trend-controls">
                            <button class="control-btn" onclick="loadAnalysisHistory()">Back to History</button>
                        </div>
                    </div>
                `;
            }
            return;
        }
        
        displayTrendAnalysis(data.experiments);
        
    } catch (error) {
        console.error('Error loading trend analysis:', error);
        const errorMessage = error.message || 'Unknown error occurred';
        alert('Error loading trend analysis: ' + errorMessage);
        return;
    }
}

// Ensure all complete experiments have statistics saved
async function ensureAllExperimentStatistics() {
    try {
        console.log('Checking for missing experiment statistics...');
        
        // Get all sessions to identify complete experiments
        const sessionsResponse = await fetch('/sessions');
        if (!sessionsResponse.ok) return;
        
        const sessionsData = await sessionsResponse.json();
        const sessions = sessionsData.sessions || [];
        
        // Group sessions by experiment pattern to find complete experiments
        const experimentGroups = {};
        sessions.forEach(session => {
            const pattern = extractBasePattern(session.filename);
            if (!experimentGroups[pattern]) {
                experimentGroups[pattern] = [];
            }
            experimentGroups[pattern].push(session);
        });
        
        // Check each experiment group for completeness
        const completeExperiments = [];
        Object.entries(experimentGroups).forEach(([pattern, groupSessions]) => {
            const fluorophores = [];
            groupSessions.forEach(session => {
                const fluorophore = detectFluorophoreFromFilename(session.filename);
                if (fluorophore && fluorophore !== 'Unknown' && !fluorophores.includes(fluorophore)) {
                    fluorophores.push(fluorophore);
                }
            });
            
            // BVAB requires all 3 channels
            if (fluorophores.length >= 3 && fluorophores.includes('Cy5') && fluorophores.includes('FAM') && fluorophores.includes('HEX')) {
                completeExperiments.push({
                    pattern,
                    sessions: groupSessions,
                    fluorophores
                });
            }
        });
        
        console.log(`Found ${completeExperiments.length} complete experiments`);
        
        // Get existing experiment statistics
        const statsResponse = await fetch('/experiments/statistics');
        const existingStats = statsResponse.ok ? (await statsResponse.json()).experiments || [] : [];
        const existingPatterns = existingStats.map(stat => stat.experiment_name);
        
        // Save statistics for missing complete experiments
        for (const experiment of completeExperiments) {
            if (!existingPatterns.includes(experiment.pattern)) {
                console.log(`Saving missing statistics for: ${experiment.pattern}`);
                
                // Create combined session data from individual sessions
                const combinedResults = await createCombinedResultsFromSessions(experiment.sessions);
                if (combinedResults) {
                    await saveExperimentStatisticsFromCombined(experiment.pattern, combinedResults, experiment.fluorophores);
                }
            }
        }
        
    } catch (error) {
        console.warn('Error ensuring experiment statistics:', error);
    }
}

// Create combined results from individual sessions for statistics
async function createCombinedResultsFromSessions(sessions) {
    try {
        const allWellResults = {};
        
        for (const session of sessions) {
            // Get detailed session data
            const sessionResponse = await fetch(`/sessions/${session.id}`);
            if (!sessionResponse.ok) continue;
            
            const sessionData = await sessionResponse.json();
            if (sessionData.well_results) {
                sessionData.well_results.forEach(well => {
                    const wellKey = well.well_id || `${well.well_id}_${well.fluorophore}`;
                    allWellResults[wellKey] = {
                        amplitude: well.amplitude || 0,
                        anomalies: well.anomalies,
                        fluorophore: well.fluorophore || detectFluorophoreFromFilename(session.filename)
                    };
                });
            }
        }
        
        return { individual_results: allWellResults };
        
    } catch (error) {
        console.warn('Error creating combined results:', error);
        return null;
    }
}

// Save experiment statistics from combined results
async function saveExperimentStatisticsFromCombined(experimentPattern, combinedResults, fluorophores) {
    try {
        const testName = experimentPattern.split('_')[0] || 'Unknown';
        const fluorophoreBreakdown = {};
        
        fluorophores.forEach(fluorophore => {
            const wells = Object.values(combinedResults.individual_results).filter(well => 
                well.fluorophore === fluorophore
            );
            
            let positive = 0, negative = 0, redo = 0;
            
            wells.forEach(well => {
                const amplitude = well.amplitude || 0;
                
                // Check for anomalies
                let hasAnomalies = false;
                if (well.anomalies) {
                    try {
                        const anomalies = typeof well.anomalies === 'string' ? 
                            JSON.parse(well.anomalies) : well.anomalies;
                        hasAnomalies = Array.isArray(anomalies) && anomalies.length > 0 && 
                                      !(anomalies.length === 1 && anomalies[0] === 'None');
                    } catch (e) {
                        hasAnomalies = true;
                    }
                }
                
                // Apply enhanced criteria
                if (amplitude > 500 && !hasAnomalies) {
                    positive++;
                } else if (amplitude < 400) {
                    negative++;
                } else {
                    redo++;
                }
            });
            
            const total = wells.length;
            const posPercentage = total > 0 ? (positive / total * 100) : 0;
            
            fluorophoreBreakdown[fluorophore] = {
                subtest: fluorophore,
                total_wells: total,
                positive: positive,
                negative: negative,
                redo: redo,
                pos_percentage: parseFloat(posPercentage.toFixed(1))
            };
        });
        
        const payload = {
            experiment_name: experimentPattern,
            test_name: testName,
            fluorophore_breakdown: fluorophoreBreakdown
        };
        
        const response = await fetch('/experiments/statistics', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            console.log(`Statistics saved for ${experimentPattern}`);
        }
        
    } catch (error) {
        console.warn('Error saving statistics from combined results:', error);
    }
}

// Control validation functions
function identifyControlType(sampleName) {
    if (!sampleName) return null;
    
    // Check for NTC controls
    if (sampleName.includes('NTC')) {
        return 'NTC';
    }
    
    // Check for positive controls (H, M, L)
    if (sampleName.match(/[HML]\d*-/)) {
        return 'POSITIVE';
    }
    
    return null;
}

function validateControls(individualResults) {
    const controlIssues = [];
    
    Object.entries(individualResults).forEach(([wellKey, result]) => {
        const sampleName = result.sample_name || result.sample || '';
        const amplitude = result.amplitude || 0;
        const controlType = identifyControlType(sampleName);
        
        if (controlType === 'NTC') {
            // NTC should be negative (amplitude < 400)
            if (amplitude >= 400) {
                controlIssues.push({
                    wellKey,
                    sampleName,
                    type: 'NTC',
                    expected: 'NEG',
                    actual: amplitude >= 500 ? 'POS' : 'REDO',
                    amplitude,
                    fluorophore: result.fluorophore
                });
            }
        } else if (controlType === 'POSITIVE') {
            // Positive controls should be positive (amplitude > 500)
            if (amplitude < 500) {
                controlIssues.push({
                    wellKey,
                    sampleName,
                    type: 'POSITIVE',
                    expected: 'POS',
                    actual: amplitude < 400 ? 'NEG' : 'REDO',
                    amplitude,
                    fluorophore: result.fluorophore
                });
            }
        }
    });
    
    return controlIssues;
}

function displayControlValidationAlerts(controlIssues) {
    const alertContainer = document.getElementById('controlValidationAlerts');
    if (!alertContainer) {
        // Create alert container if it doesn't exist
        const analysisSection = document.getElementById('analysisSection');
        if (analysisSection) {
            const alertDiv = document.createElement('div');
            alertDiv.id = 'controlValidationAlerts';
            alertDiv.className = 'control-validation-alerts';
            analysisSection.insertBefore(alertDiv, analysisSection.firstChild);
        }
    }
    
    const container = document.getElementById('controlValidationAlerts');
    if (!container) return;
    
    if (controlIssues.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    container.innerHTML = `
        <div class="control-alerts-header">
            <h4>⚠️ Control Validation Issues (${controlIssues.length})</h4>
        </div>
        <div class="control-issues-list">
            ${controlIssues.map(issue => `
                <div class="control-issue-item ${issue.type.toLowerCase()}">
                    <div class="issue-details">
                        <strong>${issue.sampleName}</strong> (${issue.wellKey}, ${getPathogenTarget(issue.fluorophore) || issue.fluorophore})
                        <span class="issue-type">${issue.type} Control</span>
                    </div>
                    <div class="issue-problem">
                        Expected: <span class="expected">${issue.expected}</span> | 
                        Actual: <span class="actual ${issue.actual.toLowerCase()}">${issue.actual}</span> |
                        Amplitude: ${issue.amplitude.toFixed(1)}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// Display trend analysis data
function displayTrendAnalysis(experiments) {
    return safeExecute(() => {
        const historyContent = safeGetElement('historyContent', 'displayTrendAnalysis');
        if (!historyContent) {
            // Production-friendly error handling - no alerts, just console logging
            console.warn('History container not found for trend analysis');
            return;
        }
    
    let html = '<div class="trend-analysis-section">';
    html += '<h3>Test Trend Analysis</h3>';
    
    // Group experiments by test name and aggregate statistics correctly
    const testSummary = {};
    experiments.forEach(exp => {
        const testName = exp.test_name || 'Unknown';
        if (!testSummary[testName]) {
            testSummary[testName] = {
                experimentCount: 0,
                fluorophores: {},
                latestTimestamp: null,
                experimentNames: []
            };
        }
        
        testSummary[testName].experimentCount++;
        testSummary[testName].experimentNames.push(exp.experiment_name);
        
        // Track latest timestamp
        const expTimestamp = new Date(exp.analysis_timestamp);
        if (!testSummary[testName].latestTimestamp || expTimestamp > testSummary[testName].latestTimestamp) {
            testSummary[testName].latestTimestamp = expTimestamp;
        }
        
        // Aggregate fluorophore statistics across all experiments for this test
        const stats = safeExecute(() => {
            return typeof exp.fluorophore_stats === 'string' ? 
                JSON.parse(exp.fluorophore_stats) : (exp.fluorophore_stats || {});
        }, 'parsing fluorophore_stats', {});
        
        safeExecute(() => {
            Object.entries(stats).forEach(([fluorophore, fluorStats]) => {
                if (!testSummary[testName].fluorophores[fluorophore]) {
                    testSummary[testName].fluorophores[fluorophore] = {
                        total_wells: 0,
                        positive: 0,
                        negative: 0,
                        redo: 0,
                        experiments: 0
                    };
                }
                
                const fluor = testSummary[testName].fluorophores[fluorophore];
                fluor.total_wells += fluorStats.total_wells || 0;
                fluor.positive += fluorStats.positive || 0;
                fluor.negative += fluorStats.negative || 0;
                fluor.redo += fluorStats.redo || 0;
                fluor.experiments++;
            });
        }, `processing fluorophore stats for ${testName}`);
    });
    
    // Display aggregated test results with correct experiment counting
    Object.entries(testSummary).forEach(([testName, summary]) => {
        html += `<div class="test-group">`;
        const experimentText = summary.experimentCount === 1 ? 'experiment' : 'experiments';
        html += `<h4>${testName} Test Results (${summary.experimentCount} ${experimentText})</h4>`;
        html += `<div class="test-summary-card">`;
        
        html += `<div class="fluorophore-trend-stats">`;
        Object.entries(summary.fluorophores).forEach(([fluorophore, fluorStats]) => {
            const posPercent = fluorStats.total_wells > 0 ? 
                ((fluorStats.positive / fluorStats.total_wells) * 100) : 0;
            const barWidth = Math.min(posPercent, 100);
            
            html += `<div class="fluorophore-trend-row">`;
            // Extract test code from test name (AcBVAB -> BVAB)
            const testCode = testName.startsWith('Ac') ? testName.substring(2) : testName;
            let pathogenTarget = 'Unknown';
            let fluorophoreColor = '#666';
            
            pathogenTarget = safeExecute(() => {
                return typeof getPathogenTarget === 'function' ? 
                    getPathogenTarget(testCode, fluorophore) : 'Unknown';
            }, 'getPathogenTarget', 'Unknown');
            
            fluorophoreColor = safeExecute(() => {
                return typeof getFluorophoreColor === 'function' ? 
                    getFluorophoreColor(fluorophore) : '#666';
            }, 'getFluorophoreColor', '#666');
            
            const displayTarget = pathogenTarget !== 'Unknown' ? ` - ${pathogenTarget}` : '';
            html += `<div class="fluorophore-trend-label">${fluorophore}${displayTarget}:</div>`;
            html += `<div class="fluorophore-trend-bar">`;
            html += `<div class="trend-bar-fill" style="width: ${barWidth}%; background: ${fluorophoreColor}"></div>`;
            html += `</div>`;
            html += `<div class="fluorophore-trend-values">`;
            html += `${fluorStats.positive}/${fluorStats.total_wells} (${posPercent.toFixed(1)}%)`;
            html += `</div>`;
            html += `</div>`;
        });
        html += `</div>`;
        html += `</div>`;
        html += `</div>`;
    });
    
        html += '</div>';
        
        // Add back button
        html += '<div class="trend-controls">';
        html += '<button class="control-btn" onclick="loadAnalysisHistory()">Back to History</button>';
        html += '</div>';
        
        historyContent.innerHTML = html;
    }, 'displayTrendAnalysis complete function');
}

// Calculate fluorophore-specific statistics based on Results column (POS/NEG/REDO)
function calculateFluorophoreStats(individualResults) {
    const stats = {
        totalPositive: 0,
        byFluorophore: {}
    };
    
    Object.entries(individualResults).forEach(([wellKey, result]) => {
        // Enhanced fluorophore extraction
        let fluorophore = result.fluorophore || 'Unknown';
        
        // Try to extract from fit_parameters if not directly available
        if (fluorophore === 'Unknown' && result.fit_parameters) {
            try {
                const fitParams = typeof result.fit_parameters === 'string' ? 
                    JSON.parse(result.fit_parameters) : result.fit_parameters;
                if (fitParams.fluorophore && fitParams.fluorophore !== 'Unknown') {
                    fluorophore = fitParams.fluorophore;
                }
            } catch (e) {
                // Continue with fallback methods
            }
        }
        
        // Try to extract from well key if still unknown (A1_Cy5 -> Cy5)
        if (fluorophore === 'Unknown' && wellKey.includes('_')) {
            const parts = wellKey.split('_');
            if (parts.length > 1) {
                const possibleFluorophore = parts[parts.length - 1];
                if (['Cy5', 'FAM', 'HEX', 'Texas Red'].includes(possibleFluorophore)) {
                    fluorophore = possibleFluorophore;
                }
            }
        }
        
        const amplitude = result.amplitude || 0;
        
        // Initialize fluorophore stats if not exists
        if (!stats.byFluorophore[fluorophore]) {
            stats.byFluorophore[fluorophore] = {
                total: 0,
                positive: 0,
                negative: 0,
                redo: 0
            };
        }
        
        stats.byFluorophore[fluorophore].total++;
        
        // Check for anomalies
        let hasAnomalies = false;
        if (result.anomalies) {
            try {
                const anomalies = typeof result.anomalies === 'string' ? 
                    JSON.parse(result.anomalies) : result.anomalies;
                hasAnomalies = Array.isArray(anomalies) && anomalies.length > 0 && 
                              !(anomalies.length === 1 && anomalies[0] === 'None');
            } catch (e) {
                hasAnomalies = true; // If can't parse, assume there are anomalies
            }
        }
        
        // Apply enhanced criteria
        if (amplitude > 500 && !hasAnomalies) {
            stats.byFluorophore[fluorophore].positive++;
            stats.totalPositive++;
        } else if (amplitude < 400) {
            stats.byFluorophore[fluorophore].negative++;
        } else {
            // REDO: amplitude 400-500 OR amplitude > 500 with anomalies
            stats.byFluorophore[fluorophore].redo++;
        }
    });
    
    return stats;
}

// Calculate cycle range from individual results
function calculateCycleRangeFromResults(individualResults) {
    let minCycle = Infinity;
    let maxCycle = -Infinity;
    let cycleCount = 0;
    
    Object.values(individualResults).forEach(result => {
        if (result.raw_cycles) {
            try {
                const cycles = typeof result.raw_cycles === 'string' ? 
                    JSON.parse(result.raw_cycles) : result.raw_cycles;
                
                if (Array.isArray(cycles) && cycles.length > 0) {
                    const resultMin = Math.min(...cycles);
                    const resultMax = Math.max(...cycles);
                    const resultCount = cycles.length;
                    
                    minCycle = Math.min(minCycle, resultMin);
                    maxCycle = Math.max(maxCycle, resultMax);
                    cycleCount = Math.max(cycleCount, resultCount);
                }
            } catch (e) {
                console.warn('Error parsing cycles for cycle range calculation:', e);
            }
        }
    });
    
    if (minCycle !== Infinity && maxCycle !== -Infinity) {
        return {
            min: minCycle,
            max: maxCycle,
            count: cycleCount
        };
    }
    
    return null;
}

// Display fluorophore-specific breakdown
function displayFluorophoreBreakdown(fluorophoreStats) {
    const breakdownDiv = document.getElementById('fluorophoreBreakdown');
    if (!breakdownDiv) return;
    
    // Get current experiment pattern and extract test code
    const experimentPattern = getCurrentFullPattern();
    const testCode = extractTestCode(experimentPattern);
    
    let breakdownHTML = '<h4>Pathogen Breakdown</h4>';
    
    // Add channel completion status container
    breakdownHTML += '<div id="pathogenChannelStatus" style="margin-bottom: 15px;"></div>';
    
    breakdownHTML += '<div class="fluorophore-stats">';
    
    Object.entries(fluorophoreStats).forEach(([fluorophore, stats]) => {
        const positivePercentage = stats.total > 0 ? ((stats.positive / stats.total) * 100).toFixed(1) : 0;
        
        // Get pathogen target for this fluorophore
        const pathogenTarget = getPathogenTarget(testCode, fluorophore);
        const displayTarget = pathogenTarget !== "Unknown" ? ` - ${pathogenTarget}` : "";
        
        breakdownHTML += `
            <div class="fluorophore-stat-card">
                <div class="fluorophore-name">${fluorophore}${displayTarget}</div>
                <div class="fluorophore-metrics">
                    <div class="metric">
                        <span class="metric-label">Total:</span>
                        <span class="metric-value">${stats.total}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Positive:</span>
                        <span class="metric-value pos-result">${stats.positive}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Pos %:</span>
                        <span class="metric-value">${positivePercentage}%</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    breakdownHTML += '</div>';
    breakdownDiv.innerHTML = breakdownHTML;
    
    // Update channel completion status after rendering
    updatePathogenChannelStatusInBreakdown();
}

function filterTable() {
    const searchTerm = document.getElementById('searchWells') ? 
        document.getElementById('searchWells').value.toLowerCase() : '';
    const statusFilter = document.getElementById('filterStatus') ? 
        document.getElementById('filterStatus').value : 'all';
    const fluorophoreFilter = document.getElementById('fluorophoreFilter') ? 
        document.getElementById('fluorophoreFilter').value : 'all';
    
    const tableRows = document.querySelectorAll('#resultsTableBody tr');
    let visibleCount = 0;
    
    // Get current test pattern for controls filtering
    const testPattern = getCurrentTestPattern();
    
    tableRows.forEach(row => {
        const wellName = row.cells[0] ? row.cells[0].textContent.toLowerCase() : '';
        const sampleName = row.cells[1] ? row.cells[1].textContent.toLowerCase() : '';
        const fluorophore = row.cells[2] ? row.cells[2].textContent : '';
        const results = row.cells[3] ? row.cells[3].textContent.toLowerCase() : '';
        const status = row.cells[4] ? row.cells[4].textContent.toLowerCase() : '';
        
        // Search matches well name or sample name
        const matchesSearch = wellName.includes(searchTerm) || sampleName.includes(searchTerm);
        
        // Updated status filter to work with Results column (POS/NEG/REDO) and Controls
        let matchesStatus = true;
        if (statusFilter !== 'all') {
            if (statusFilter === 'pos') {
                matchesStatus = results.includes('pos');
            } else if (statusFilter === 'neg') {
                matchesStatus = results.includes('neg');
            } else if (statusFilter === 'redo') {
                matchesStatus = results.includes('redo');
            } else if (statusFilter === 'controls') {
                // Controls are samples that start with the test pattern (e.g., AcBVAB)
                const sampleNameOriginal = row.cells[1] ? row.cells[1].textContent : '';
                matchesStatus = sampleNameOriginal.startsWith(testPattern);
            }
        }
        
        // Fluorophore filter
        const matchesFluorophore = fluorophoreFilter === 'all' || 
                                  fluorophore.toLowerCase().includes(fluorophoreFilter.toLowerCase());
        
        const shouldShow = matchesSearch && matchesStatus && matchesFluorophore;
        row.style.display = shouldShow ? '' : 'none';
        
        if (shouldShow) {
            visibleCount++;
        }
    });
    
    // Update filter stats if available
    const filterStats = document.getElementById('filterStats');
    if (filterStats) {
        const totalRows = tableRows.length;
        filterStats.textContent = `Showing ${visibleCount} of ${totalRows} wells`;
    }
}

// Chart display mode tracking (already declared at top)

// Helper function to safely destroy chart
function safeDestroyChart() {
    if (window.amplificationChart && typeof window.amplificationChart.destroy === 'function') {
        try {
            window.amplificationChart.destroy();
        } catch (e) {
            console.warn('Error destroying chart:', e);
        }
        window.amplificationChart = null;
    }
}

// Initialize chart display event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Show Selected Curve button
    const showSelectedBtn = document.getElementById('showSelectedBtn');
    if (showSelectedBtn) {
        showSelectedBtn.addEventListener('click', function() {
            currentChartMode = 'selected';
            updateChartDisplayMode();
            updateActiveButton(this);
            // Clear any filtered curve details when switching to selected mode
            const wellSelector = document.getElementById('wellSelect');
            if (wellSelector && wellSelector.value && wellSelector.value !== 'ALL_WELLS') {
                showWellDetails(wellSelector.value);
            }
        });
        // Set as active by default
        showSelectedBtn.classList.add('active');
    }
    
    // Show All Wells button
    const showAllBtn = document.getElementById('showAllBtn');
    if (showAllBtn) {
        showAllBtn.addEventListener('click', function() {
            console.log('Show All Wells button clicked');
            currentChartMode = 'all';
            updateChartDisplayMode();
            updateActiveButton(this);
            // Clear any filtered curve details when switching to all wells mode
            document.getElementById('curveDetails').innerHTML = '<p>Select a well to view individual curve details</p>';
        });
    }
    
    // POS Results button
    const showPosBtn = document.getElementById('showPosBtn');
    if (showPosBtn) {
        showPosBtn.addEventListener('click', function() {
            console.log('POS Results button clicked');
            currentChartMode = 'pos';
            updateChartDisplayMode();
            updateActiveButton(this);
        });
    }
    
    // NEG Results button
    const showNegBtn = document.getElementById('showNegBtn');
    if (showNegBtn) {
        showNegBtn.addEventListener('click', function() {
            console.log('NEG Results button clicked');
            currentChartMode = 'neg';
            updateChartDisplayMode();
            updateActiveButton(this);
        });
    }
    
    // REDO Results button
    const showRedoBtn = document.getElementById('showRedoBtn');
    if (showRedoBtn) {
        showRedoBtn.addEventListener('click', function() {
            console.log('REDO Results button clicked');
            currentChartMode = 'redo';
            updateChartDisplayMode();
            updateActiveButton(this);
        });
    }
    
    // Export button with channel validation
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', function(e) {
            // Check channel completeness before allowing export
            if (exportBtn.disabled) {
                e.preventDefault();
                alert('Export disabled: Please complete all required pathogen channels before exporting results.');
                return;
            }
            exportResults();
        });
    }
    
    // Trend Analysis button
    const trendAnalysisBtn = document.getElementById('trendAnalysisBtn');
    if (trendAnalysisBtn) {
        trendAnalysisBtn.addEventListener('click', viewTrendAnalysis);
    }
    
    // Check for pending session load after page refresh
    const pendingSessionLoad = localStorage.getItem('pendingSessionLoad');
    if (pendingSessionLoad) {
        console.log('Found pending session load after refresh:', pendingSessionLoad);
        // Small delay to ensure page is fully loaded
        setTimeout(() => {
            loadSessionDetails(pendingSessionLoad);
        }, 500);
    }
});

function updateActiveButton(activeBtn) {
    // Remove active class from all buttons
    const buttons = document.querySelectorAll('.view-controls .control-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    // Add active class to clicked button
    activeBtn.classList.add('active');
}

function updateChartDisplayMode() {
    console.log('updateChartDisplayMode called with mode:', currentChartMode);
    
    if (!currentAnalysisResults) {
        console.error('No currentAnalysisResults in updateChartDisplayMode');
        return;
    }
    
    const fluorophoreSelector = document.getElementById('fluorophoreSelect');
    const wellSelector = document.getElementById('wellSelect');
    
    if (!fluorophoreSelector || !wellSelector) {
        console.error('Missing selectors in updateChartDisplayMode');
        return;
    }
    
    const selectedFluorophore = fluorophoreSelector.value;
    const selectedWell = wellSelector.value;
    
    console.log('Chart mode:', currentChartMode, 'Fluorophore:', selectedFluorophore, 'Well:', selectedWell);
    
    switch (currentChartMode) {
        case 'selected':
            if (selectedWell && selectedWell !== 'ALL_WELLS') {
                console.log('Calling showSelectedCurve for:', selectedWell);
                showSelectedCurve(selectedWell);
            } else {
                // Clear curve details when no specific well is selected in selected mode
                document.getElementById('curveDetails').innerHTML = '<p>Select a well to view curve details</p>';
            }
            break;
        case 'all':
            console.log('Calling showAllCurves for:', selectedFluorophore);
            showAllCurves(selectedFluorophore);
            // Clear curve details when showing all curves
            document.getElementById('curveDetails').innerHTML = '<p>Select a well to view individual curve details</p>';
            break;
        case 'pos':
            console.log('Calling showResultsFiltered for POS:', selectedFluorophore);
            showResultsFiltered(selectedFluorophore, 'pos');
            showFilteredCurveDetails(selectedFluorophore, 'pos');
            break;
        case 'neg':
            console.log('Calling showResultsFiltered for NEG:', selectedFluorophore);
            showResultsFiltered(selectedFluorophore, 'neg');
            showFilteredCurveDetails(selectedFluorophore, 'neg');
            break;
        case 'redo':
            console.log('Calling showResultsFiltered for REDO:', selectedFluorophore);
            showResultsFiltered(selectedFluorophore, 'redo');
            showFilteredCurveDetails(selectedFluorophore, 'redo');
            break;
    }
}

function showSelectedCurve(wellKey) {
    const wellData = currentAnalysisResults.individual_results[wellKey];
    if (!wellData) return;
    
    // Parse raw data for the selected well
    let cycles, rfu;
    try {
        cycles = typeof wellData.raw_cycles === 'string' ? 
            JSON.parse(wellData.raw_cycles) : wellData.raw_cycles;
        rfu = typeof wellData.raw_rfu === 'string' ? 
            JSON.parse(wellData.raw_rfu) : wellData.raw_rfu;
    } catch (e) {
        console.error('Error parsing well data:', e);
        return;
    }
    
    updateChart(wellKey, cycles, rfu, wellData);
}

function showAllCurves(selectedFluorophore) {
    if (!currentAnalysisResults || !currentAnalysisResults.individual_results) {
        console.error('No analysis results available for showAllCurves');
        return;
    }
    
    console.log('Showing all curves for fluorophore:', selectedFluorophore);
    
    const ctx = document.getElementById('amplificationChart').getContext('2d');
    
    // Destroy existing chart safely
    safeDestroyChart();
    
    const datasets = [];
    const results = currentAnalysisResults.individual_results;
    
    Object.keys(results).forEach((wellKey, index) => {
        const wellData = results[wellKey];
        
        // Filter by fluorophore if specified
        if (selectedFluorophore !== 'all' && wellData.fluorophore !== selectedFluorophore) {
            return;
        }
        
        try {
            const cycles = typeof wellData.raw_cycles === 'string' ? 
                JSON.parse(wellData.raw_cycles) : wellData.raw_cycles;
            const rfu = typeof wellData.raw_rfu === 'string' ? 
                JSON.parse(wellData.raw_rfu) : wellData.raw_rfu;
            
            if (cycles && rfu && cycles.length === rfu.length) {
                const wellId = wellData.well_id || wellKey.split('_')[0];
                const fluorophore = wellData.fluorophore || 'Unknown';
                const isGood = wellData.is_good_scurve;
                
                datasets.push({
                    label: `${wellId} (${fluorophore})`,
                    data: cycles.map((cycle, i) => ({ x: cycle, y: rfu[i] })),
                    borderColor: isGood ? getFluorophoreColor(fluorophore) : '#cccccc',
                    backgroundColor: 'transparent',
                    borderWidth: isGood ? 2 : 1,
                    pointRadius: 0,
                    tension: 0.1
                });
            }
        } catch (e) {
            console.error(`Error parsing data for ${wellKey}:`, e);
        }
    });
    
    console.log(`Prepared ${datasets.length} datasets for showAllCurves`);
    
    if (datasets.length === 0) {
        console.warn('No datasets found for showAllCurves');
        return;
    }
    
    // Debug: Check first dataset structure
    if (datasets.length > 0) {
        console.log('First dataset sample:', {
            label: datasets[0].label,
            dataLength: datasets[0].data.length,
            firstPoint: datasets[0].data[0],
            lastPoint: datasets[0].data[datasets[0].data.length - 1]
        });
    }
    
    // Temporarily remove performance limit to debug chart rendering
    // if (datasets.length > 50) {
    //     console.log(`Limiting display to first 50 curves (out of ${datasets.length})`);
    //     datasets.splice(50);
    // }
    
    // Create chart with all curves
    window.amplificationChart = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `${getCurrentFullPattern()} - All Curves - ${selectedFluorophore === 'all' ? 'All Fluorophores' : selectedFluorophore}`,
                    font: { size: 16, weight: 'bold' }
                },
                legend: {
                    display: false // Too many curves for legend
                },
                tooltip: {
                    enabled: false // Disable tooltips for better performance with many curves
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: 'Cycle Number', font: { size: 14 } },
                    grid: { color: 'rgba(0,0,0,0.1)' }
                },
                y: {
                    type: 'linear',
                    title: { display: true, text: 'RFU', font: { size: 14 } },
                    grid: { color: 'rgba(0,0,0,0.1)' }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            },
            elements: {
                point: {
                    radius: 0
                },
                line: {
                    tension: 0.1
                }
            }
        }
    });
}

function showGoodCurves(selectedFluorophore) {
    if (!currentAnalysisResults || !currentAnalysisResults.individual_results) {
        console.error('No analysis results available for showGoodCurves');
        return;
    }
    
    console.log('Showing positive curves (amplitude > 500) for fluorophore:', selectedFluorophore);
    
    const ctx = document.getElementById('amplificationChart').getContext('2d');
    
    // Destroy existing chart safely
    safeDestroyChart();
    
    const datasets = [];
    const results = currentAnalysisResults.individual_results;
    
    Object.keys(results).forEach((wellKey, index) => {
        const wellData = results[wellKey];
        
        // Only show positive curves (amplitude > 500, same as POS in Results column)
        const amplitude = wellData.amplitude || 0;
        if (amplitude <= 500) return;
        
        // Filter by fluorophore if specified
        if (selectedFluorophore !== 'all' && wellData.fluorophore !== selectedFluorophore) {
            return;
        }
        
        try {
            const cycles = typeof wellData.raw_cycles === 'string' ? 
                JSON.parse(wellData.raw_cycles) : wellData.raw_cycles;
            const rfu = typeof wellData.raw_rfu === 'string' ? 
                JSON.parse(wellData.raw_rfu) : wellData.raw_rfu;
            
            if (cycles && rfu && cycles.length === rfu.length) {
                const wellId = wellData.well_id || wellKey.split('_')[0];
                const fluorophore = wellData.fluorophore || 'Unknown';
                
                datasets.push({
                    label: `${wellId} (${fluorophore})`,
                    data: cycles.map((cycle, i) => ({ x: cycle, y: rfu[i] })),
                    borderColor: getFluorophoreColor(fluorophore),
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.1
                });
            }
        } catch (e) {
            console.error(`Error parsing data for ${wellKey}:`, e);
        }
    });
    
    console.log(`Prepared ${datasets.length} datasets for showGoodCurves`);
    
    if (datasets.length === 0) {
        console.warn('No good curves found for showGoodCurves');
        return;
    }
    
    // Debug: Check first dataset structure
    if (datasets.length > 0) {
        console.log('First good curve dataset sample:', {
            label: datasets[0].label,
            dataLength: datasets[0].data.length,
            firstPoint: datasets[0].data[0],
            lastPoint: datasets[0].data[datasets[0].data.length - 1]
        });
    }
    
    // Create chart with good curves only
    window.amplificationChart = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `${getCurrentFullPattern()} - Positive Results Only - ${selectedFluorophore === 'all' ? 'All Fluorophores' : selectedFluorophore}`,
                    font: { size: 16, weight: 'bold' }
                },
                legend: {
                    display: datasets.length <= 10 // Show legend only for reasonable number of curves
                },
                tooltip: {
                    enabled: datasets.length <= 20 // Disable tooltips for better performance with many curves
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: 'Cycle Number', font: { size: 14 } },
                    grid: { color: 'rgba(0,0,0,0.1)' }
                },
                y: {
                    type: 'linear',
                    title: { display: true, text: 'RFU', font: { size: 14 } },
                    grid: { color: 'rgba(0,0,0,0.1)' }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            },
            elements: {
                point: {
                    radius: 0
                },
                line: {
                    tension: 0.1
                }
            }
        }
    });
}

function showResultsFiltered(selectedFluorophore, resultType) {
    if (!currentAnalysisResults || !currentAnalysisResults.individual_results) {
        console.error('No analysis results available for showResultsFiltered');
        return;
    }
    
    console.log(`Showing ${resultType.toUpperCase()} curves for fluorophore:`, selectedFluorophore);
    
    const ctx = document.getElementById('amplificationChart').getContext('2d');
    
    // Destroy existing chart safely
    safeDestroyChart();
    
    const datasets = [];
    const results = currentAnalysisResults.individual_results;
    
    Object.keys(results).forEach((wellKey, index) => {
        const wellData = results[wellKey];
        
        // Filter by amplitude thresholds based on result type
        const amplitude = wellData.amplitude || 0;
        let shouldInclude = false;
        
        switch (resultType) {
            case 'pos':
                shouldInclude = amplitude > 500;
                break;
            case 'neg':
                shouldInclude = amplitude < 400;
                break;
            case 'redo':
                shouldInclude = amplitude >= 400 && amplitude <= 500;
                break;
        }
        
        if (!shouldInclude) return;
        
        // Filter by fluorophore if specified
        if (selectedFluorophore !== 'all' && wellData.fluorophore !== selectedFluorophore) {
            return;
        }
        
        try {
            const cycles = typeof wellData.raw_cycles === 'string' ? 
                JSON.parse(wellData.raw_cycles) : wellData.raw_cycles;
            const rfu = typeof wellData.raw_rfu === 'string' ? 
                JSON.parse(wellData.raw_rfu) : wellData.raw_rfu;
            
            if (cycles && rfu && cycles.length === rfu.length) {
                const wellId = wellData.well_id || wellKey.split('_')[0];
                const fluorophore = wellData.fluorophore || 'Unknown';
                
                // Use result-specific colors
                let borderColor;
                switch (resultType) {
                    case 'pos':
                        borderColor = '#e74c3c'; // Red for POS
                        break;
                    case 'neg':
                        borderColor = '#27ae60'; // Green for NEG
                        break;
                    case 'redo':
                        borderColor = '#f39c12'; // Yellow for REDO
                        break;
                    default:
                        borderColor = getFluorophoreColor(fluorophore);
                }
                
                datasets.push({
                    label: `${wellId} (${fluorophore})`,
                    data: cycles.map((cycle, i) => ({ x: cycle, y: rfu[i] })),
                    borderColor: borderColor,
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.1
                });
            }
        } catch (e) {
            console.error(`Error parsing data for ${wellKey}:`, e);
        }
    });
    
    console.log(`Prepared ${datasets.length} datasets for ${resultType.toUpperCase()} results`);
    
    // Handle case when no results found - show empty chart with message
    if (datasets.length === 0) {
        console.warn(`No ${resultType.toUpperCase()} curves found`);
        
        // Create empty chart with informative message
        window.amplificationChart = new Chart(ctx, {
            type: 'line',
            data: { datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: `${getCurrentFullPattern()} - No ${resultType.toUpperCase()} Results Found - ${selectedFluorophore === 'all' ? 'All Fluorophores' : selectedFluorophore}`,
                        font: { size: 16, weight: 'bold' }
                    },
                    legend: { display: false }
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: 'Cycle Number', font: { size: 14 } },
                        grid: { color: 'rgba(0,0,0,0.1)' },
                        min: 0,
                        max: 45
                    },
                    y: {
                        type: 'linear',
                        title: { display: true, text: 'RFU', font: { size: 14 } },
                        grid: { color: 'rgba(0,0,0,0.1)' },
                        min: 0,
                        max: 1000
                    }
                },
                layout: {
                    padding: 20
                }
            },
            plugins: [{
                id: 'noDataMessage',
                afterDraw: function(chart) {
                    if (chart.data.datasets.length === 0) {
                        const ctx = chart.ctx;
                        const width = chart.width;
                        const height = chart.height;
                        
                        ctx.save();
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.font = '18px Arial';
                        ctx.fillStyle = '#666';
                        ctx.fillText(`No ${resultType.toUpperCase()} results found for ${selectedFluorophore === 'all' ? 'all fluorophores' : selectedFluorophore}`, width / 2, height / 2);
                        ctx.restore();
                    }
                }
            }]
        });
        return;
    }
    
    // Create chart with filtered results
    window.amplificationChart = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `${getCurrentFullPattern()} - ${resultType.toUpperCase()} Results Only - ${selectedFluorophore === 'all' ? 'All Fluorophores' : selectedFluorophore}`,
                    font: { size: 16, weight: 'bold' }
                },
                legend: {
                    display: datasets.length <= 10 // Show legend only for reasonable number of curves
                },
                tooltip: {
                    enabled: datasets.length <= 20 // Disable tooltips for better performance with many curves
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: 'Cycle Number', font: { size: 14 } },
                    grid: { color: 'rgba(0,0,0,0.1)' }
                },
                y: {
                    type: 'linear',
                    title: { display: true, text: 'RFU (Relative Fluorescence Units)', font: { size: 14 } },
                    grid: { color: 'rgba(0,0,0,0.1)' }
                }
            },
            elements: {
                point: {
                    radius: 0
                },
                line: {
                    tension: 0.1
                }
            }
        }
    });
}

function getFluorophoreColor(fluorophore) {
    const colors = {
        'Cy5': '#ff4444',    // Red
        'FAM': '#44ff44',    // Green  
        'HEX': '#4444ff',    // Blue
        'Texas Red': '#ff8800', // Orange
        'ROX': '#ff44ff',    // Magenta
        'Unknown': '#888888' // Gray
    };
    return colors[fluorophore] || colors['Unknown'];
}

// Modal functionality
let modalChart = null;

function showWellModal(wellKey) {
    if (!currentAnalysisResults || !currentAnalysisResults.individual_results) {
        console.error('No analysis results available');
        return;
    }
    
    const wellResult = currentAnalysisResults.individual_results[wellKey];
    if (!wellResult) {
        console.error('Well result not found:', wellKey);
        return;
    }
    
    // Build navigation list from currently visible table rows
    buildModalNavigationList();
    
    // Find current item in navigation list
    currentModalIndex = modalNavigationList.findIndex(item => item.wellKey === wellKey);
    
    // Show modal
    const modal = document.getElementById('chartModal');
    modal.style.display = 'flex';
    
    // Update modal with current well data
    updateModalContent(wellKey);
    
    // Update navigation buttons
    updateNavigationButtons();
}

function buildModalNavigationList() {
    modalNavigationList = [];
    
    // Get all visible table rows (respecting current filters)
    const tableRows = document.querySelectorAll('#resultsTableBody tr');
    
    tableRows.forEach(row => {
        if (row.style.display !== 'none') {
            const wellKey = row.getAttribute('data-well-key'); // Use actual wellKey with fluorophore
            const sampleName = row.cells[1].textContent; // Second column contains sample
            if (wellKey) {
                modalNavigationList.push({
                    wellKey: wellKey,
                    sampleName: sampleName
                });
            }
        }
    });
}

function updateModalContent(wellKey) {
    const wellResult = currentAnalysisResults.individual_results[wellKey];
    if (!wellResult) {
        console.error(`No well result found for key: ${wellKey}`);
        return;
    }
    
    console.log(`Updating modal content for well: ${wellKey}`);
    
    // Set the modal well key globally for Well ID extraction
    window.currentModalWellKey = wellKey;
    
    // Update modal title
    const modalTitle = document.getElementById('modalTitle');
    // Always extract Well ID from the well key for consistency
    const wellId = wellKey.split('_')[0];
    const fluorophore = wellResult.fluorophore || 'Unknown';
    const experimentPattern = getCurrentFullPattern();
    modalTitle.textContent = `${experimentPattern} - ${wellId} (${fluorophore})`;
    
    // Create chart in modal
    createModalChart(wellKey, wellResult);
    
    // Update modal details
    updateModalDetails(wellResult);
}

function updateNavigationButtons() {
    const prevBtn = document.getElementById('modalPrevBtn');
    const nextBtn = document.getElementById('modalNextBtn');
    
    if (prevBtn && nextBtn) {
        // Enable/disable buttons based on position
        prevBtn.disabled = currentModalIndex <= 0;
        nextBtn.disabled = currentModalIndex >= modalNavigationList.length - 1;
        
        // Update button text with position info (convert to 1-based indexing)
        if (modalNavigationList.length > 1) {
            prevBtn.textContent = `← Previous (${currentModalIndex + 1}/${modalNavigationList.length})`;
            nextBtn.textContent = `Next (${currentModalIndex + 1}/${modalNavigationList.length}) →`;
        } else {
            prevBtn.textContent = '← Previous';
            nextBtn.textContent = 'Next →';
        }
    }
}

function navigateModal(direction) {
    if (modalNavigationList.length === 0) return;
    
    const newIndex = currentModalIndex + direction;
    
    if (newIndex >= 0 && newIndex < modalNavigationList.length) {
        currentModalIndex = newIndex;
        const wellKey = modalNavigationList[currentModalIndex].wellKey;
        console.log(`Navigating to well: ${wellKey}, index: ${currentModalIndex}`);
        
        // Update modal content (chart and details)
        updateModalContent(wellKey);
        updateNavigationButtons();
    }
}

function updateModalDetails(wellResult) {
    const modalDetails = document.getElementById('modalDetails');
    
    // Extract well ID - always prioritize current modal well key
    let wellId = 'Unknown';
    
    // Extract Well ID from the current modal well key (set in updateModalContent)
    if (window.currentModalWellKey) {
        wellId = window.currentModalWellKey.split('_')[0];
    }
    // If no modal key, try wellResult.well_id
    else if (wellResult.well_id && wellResult.well_id !== 'Unknown') {
        if (wellResult.well_id.includes('_')) {
            wellId = wellResult.well_id.split('_')[0];
        } else {
            wellId = wellResult.well_id;
        }
    }
    // Final fallback: extract from the first available well key in currentAnalysisResults
    else if (wellId === 'Unknown' && currentAnalysisResults && currentAnalysisResults.individual_results) {
        // Find the well key that matches this result by fluorophore
        const fluorophore = wellResult.fluorophore;
        for (const [key, result] of Object.entries(currentAnalysisResults.individual_results)) {
            if (result === wellResult || (result.fluorophore === fluorophore && 
                result.amplitude === wellResult.amplitude && 
                result.r2_score === wellResult.r2_score)) {
                wellId = key.split('_')[0];
                break;
            }
        }
    }
    
    console.log('Well ID extraction debug:', {
        modalWellKey: window.currentModalWellKey,
        wellResultId: wellResult.well_id,
        extractedWellId: wellId
    });
    
    const fluorophore = wellResult.fluorophore || 'Unknown';
    const sampleName = wellResult.sample || wellResult.sample_name || 'N/A';
    const amplitude = wellResult.amplitude || 0;
    
    // Get pathogen target for this fluorophore - use session data if available
    let experimentPattern = getCurrentFullPattern();
    if (!experimentPattern && window.currentSessionData && window.currentSessionData.filename) {
        experimentPattern = window.currentSessionData.filename;
    }
    const testCode = extractTestCode(experimentPattern);
    const pathogenTarget = getPathogenTarget(testCode, fluorophore);
    
    console.log('Modal details debug:', {
        wellId,
        fluorophore,
        testCode,
        pathogenTarget,
        experimentPattern
    });
    
    // Determine result classification
    let resultClass = 'modal-result-redo';
    let resultText = 'REDO';
    
    // Check for anomalies
    let hasAnomalies = false;
    if (wellResult.anomalies) {
        try {
            const anomalies = typeof wellResult.anomalies === 'string' ? 
                JSON.parse(wellResult.anomalies) : wellResult.anomalies;
            hasAnomalies = Array.isArray(anomalies) && anomalies.length > 0 && 
                          !(anomalies.length === 1 && anomalies[0] === 'None');
        } catch (e) {
            hasAnomalies = true;
        }
    }
    
    if (amplitude > 500 && !hasAnomalies) {
        resultClass = 'modal-result-pos';
        resultText = 'POS';
    } else if (amplitude < 400) {
        resultClass = 'modal-result-neg';
        resultText = 'NEG';
    }
    
    modalDetails.innerHTML = `
        <h4>Sample Details</h4>
        <div class="modal-parameter-grid">
            <div class="modal-parameter-item">
                <span class="modal-parameter-label">Well ID:</span>
                <span class="modal-parameter-value">${wellId}</span>
            </div>
            <div class="modal-parameter-item">
                <span class="modal-parameter-label">Sample:</span>
                <span class="modal-parameter-value">${sampleName}</span>
            </div>
            <div class="modal-parameter-item">
                <span class="modal-parameter-label">Pathogen:</span>
                <span class="modal-parameter-value">${pathogenTarget !== 'Unknown' ? `${pathogenTarget} (${fluorophore})` : fluorophore}</span>
            </div>
            <div class="modal-parameter-item">
                <span class="modal-parameter-label">Result:</span>
                <span class="modal-result-badge ${resultClass}">${resultText}</span>
            </div>
            <div class="modal-parameter-item">
                <span class="modal-parameter-label">R² Score:</span>
                <span class="modal-parameter-value">${(wellResult.r2_score || 0).toFixed(4)}</span>
            </div>
            <div class="modal-parameter-item">
                <span class="modal-parameter-label">RMSE:</span>
                <span class="modal-parameter-value">${(wellResult.rmse || 0).toFixed(2)}</span>
            </div>
            <div class="modal-parameter-item">
                <span class="modal-parameter-label">Amplitude:</span>
                <span class="modal-parameter-value">${amplitude.toFixed(2)}</span>
            </div>
            <div class="modal-parameter-item">
                <span class="modal-parameter-label">Steepness:</span>
                <span class="modal-parameter-value">${(wellResult.steepness || 0).toFixed(3)}</span>
            </div>
            <div class="modal-parameter-item">
                <span class="modal-parameter-label">Midpoint:</span>
                <span class="modal-parameter-value">${(wellResult.midpoint || 0).toFixed(2)}</span>
            </div>
            <div class="modal-parameter-item">
                <span class="modal-parameter-label">Baseline:</span>
                <span class="modal-parameter-value">${(wellResult.baseline || 0).toFixed(2)}</span>
            </div>
            <div class="modal-parameter-item">
                <span class="modal-parameter-label">Cq Value:</span>
                <span class="modal-parameter-value">${wellResult.cq_value ? wellResult.cq_value.toFixed(2) : 'N/A'}</span>
            </div>
        </div>
    `;
}

function createModalChart(wellKey, wellData) {
    const ctx = document.getElementById('modalChart').getContext('2d');
    
    // Destroy existing modal chart
    if (modalChart) {
        modalChart.destroy();
    }
    
    // Parse raw data
    let cycles, rfu;
    try {
        cycles = typeof wellData.raw_cycles === 'string' ? 
            JSON.parse(wellData.raw_cycles) : wellData.raw_cycles;
        rfu = typeof wellData.raw_rfu === 'string' ? 
            JSON.parse(wellData.raw_rfu) : wellData.raw_rfu;
    } catch (e) {
        console.error('Error parsing well data for modal:', e);
        return;
    }
    
    // Parse fitted curve data if available
    let fitData = [];
    if (wellData.fitted_curve) {
        try {
            const fittedCurve = typeof wellData.fitted_curve === 'string' ? 
                JSON.parse(wellData.fitted_curve) : wellData.fitted_curve;
            
            if (Array.isArray(fittedCurve) && fittedCurve.length > 0) {
                fitData = fittedCurve.map((rfuValue, index) => ({
                    x: cycles[index],
                    y: rfuValue
                }));
            }
        } catch (e) {
            console.error('Error parsing fitted curve data for modal:', e);
        }
    }
    
    const wellId = wellData.well_id || wellKey.split('_')[0];
    const fluorophore = wellData.fluorophore || 'Unknown';
    
    const datasets = [
        {
            label: `${wellId} (${fluorophore}) - Raw Data`,
            data: cycles.map((cycle, index) => ({
                x: cycle,
                y: rfu[index]
            })),
            backgroundColor: 'rgba(52, 152, 219, 0.8)',
            borderColor: 'rgba(41, 128, 185, 1)',
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            showLine: false,
            pointStyle: 'circle'
        }
    ];
    
    if (fitData.length > 0) {
        datasets.push({
            label: `${wellId} (${fluorophore}) - Fitted Curve`,
            data: fitData,
            backgroundColor: 'rgba(231, 76, 60, 0.3)',
            borderColor: 'rgba(192, 57, 43, 1)',
            borderWidth: 3,
            pointRadius: 0,
            showLine: true,
            tension: 0.4
        });
    }
    
    modalChart = new Chart(ctx, {
        type: 'scatter',
        data: { datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `qPCR Amplification Curve - ${wellId} (${fluorophore})`,
                    font: { size: 16, weight: 'bold' }
                },
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                x: {
                    title: { 
                        display: true, 
                        text: 'Cycle Number',
                        font: { size: 14, weight: 'bold' }
                    },
                    grid: { color: 'rgba(0,0,0,0.1)' }
                },
                y: {
                    title: { 
                        display: true, 
                        text: 'RFU (Relative Fluorescence Units)',
                        font: { size: 14, weight: 'bold' }
                    },
                    grid: { color: 'rgba(0,0,0,0.1)' }
                }
            }
        }
    });
}

function populateModalDetails(wellKey, wellData) {
    const modalDetails = document.getElementById('modalDetails');
    
    const wellId = wellData.well_id || wellKey.split('_')[0];
    const fluorophore = wellData.fluorophore || 'Unknown';
    const sampleName = wellData.sample || wellData.sample_name || 'N/A';
    const amplitude = wellData.amplitude || 0;
    
    // Determine result classification
    let resultClass = 'modal-result-redo';
    let resultText = 'REDO';
    
    if (amplitude > 500) {
        resultClass = 'modal-result-pos';
        resultText = 'POS';
    } else if (amplitude < 400) {
        resultClass = 'modal-result-neg';
        resultText = 'NEG';
    }
    
    // Parse anomalies
    let anomaliesText = 'None';
    if (wellData.anomalies) {
        try {
            const anomalies = typeof wellData.anomalies === 'string' ? 
                JSON.parse(wellData.anomalies) : wellData.anomalies;
            anomaliesText = Array.isArray(anomalies) && anomalies.length > 0 ? 
                anomalies.join(', ') : 'None';
        } catch (e) {
            anomaliesText = 'Parse Error';
        }
    }
    
    modalDetails.innerHTML = `
        <h4>Sample Details</h4>
        <div class="modal-parameter-grid">
            <div class="modal-parameter-item">
                <span class="modal-parameter-label">Well:</span>
                <span class="modal-parameter-value">${wellId}</span>
            </div>
            <div class="modal-parameter-item">
                <span class="modal-parameter-label">Sample:</span>
                <span class="modal-parameter-value">${sampleName}</span>
            </div>
            <div class="modal-parameter-item">
                <span class="modal-parameter-label">Fluorophore:</span>
                <span class="modal-parameter-value">${fluorophore}</span>
            </div>
            <div class="modal-parameter-item">
                <span class="modal-parameter-label">Result:</span>
                <span class="modal-result-badge ${resultClass}">${resultText}</span>
            </div>
            <div class="modal-parameter-item">
                <span class="modal-parameter-label">R² Score:</span>
                <span class="modal-parameter-value">${wellData.r2_score ? wellData.r2_score.toFixed(4) : 'N/A'}</span>
            </div>
            <div class="modal-parameter-item">
                <span class="modal-parameter-label">RMSE:</span>
                <span class="modal-parameter-value">${wellData.rmse ? wellData.rmse.toFixed(2) : 'N/A'}</span>
            </div>
            <div class="modal-parameter-item">
                <span class="modal-parameter-label">Amplitude:</span>
                <span class="modal-parameter-value">${wellData.amplitude ? wellData.amplitude.toFixed(1) : 'N/A'}</span>
            </div>
            <div class="modal-parameter-item">
                <span class="modal-parameter-label">Steepness:</span>
                <span class="modal-parameter-value">${wellData.steepness ? wellData.steepness.toFixed(3) : 'N/A'}</span>
            </div>
            <div class="modal-parameter-item">
                <span class="modal-parameter-label">Midpoint:</span>
                <span class="modal-parameter-value">${wellData.midpoint ? wellData.midpoint.toFixed(1) : 'N/A'}</span>
            </div>
            <div class="modal-parameter-item">
                <span class="modal-parameter-label">Baseline:</span>
                <span class="modal-parameter-value">${wellData.baseline ? wellData.baseline.toFixed(1) : 'N/A'}</span>
            </div>
            <div class="modal-parameter-item">
                <span class="modal-parameter-label">Cq Value:</span>
                <span class="modal-parameter-value">${wellData.cq_value !== null && wellData.cq_value !== undefined ? wellData.cq_value.toFixed(2) : 'N/A'}</span>
            </div>
            <div class="modal-parameter-item">
                <span class="modal-parameter-label">Anomalies:</span>
                <span class="modal-parameter-value">${anomaliesText}</span>
            </div>
        </div>
    `;
}

function closeModal() {
    const modal = document.getElementById('chartModal');
    modal.style.display = 'none';
    
    // Destroy modal chart
    if (modalChart) {
        modalChart.destroy();
        modalChart = null;
    }
}

// Initialize event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // File upload event listeners
    const fileInput = document.getElementById('fileInput');
    const samplesInput = document.getElementById('samplesInput');
    const analyzeBtn = document.getElementById('analyzeBtn');
    
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            if (e.target.files.length > 0) {
                for (let i = 0; i < e.target.files.length; i++) {
                    handleFileUpload(e.target.files[i], 'amplification');
                }
            }
        });
    }
    
    if (samplesInput) {
        samplesInput.addEventListener('change', function(e) {
            if (e.target.files.length > 0) {
                handleFileUpload(e.target.files[0], 'samples');
            }
        });
    }
    
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', performAnalysis);
    }
    
    // Drag and drop functionality
    const fileUpload = document.getElementById('fileUpload');
    if (fileUpload) {
        fileUpload.addEventListener('dragover', function(e) {
            e.preventDefault();
            fileUpload.classList.add('dragover');
        });
        
        fileUpload.addEventListener('dragleave', function() {
            fileUpload.classList.remove('dragover');
        });
        
        fileUpload.addEventListener('drop', function(e) {
            e.preventDefault();
            fileUpload.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                for (let i = 0; i < files.length; i++) {
                    handleFileUpload(files[i], 'amplification');
                }
            }
        });
    }
    
    // Modal close button
    const modalClose = document.getElementById('modalClose');
    if (modalClose) {
        modalClose.addEventListener('click', closeModal);
    }
    
    // Modal navigation buttons
    const modalPrevBtn = document.getElementById('modalPrevBtn');
    if (modalPrevBtn) {
        modalPrevBtn.addEventListener('click', function() {
            navigateModal(-1);
        });
    }
    
    const modalNextBtn = document.getElementById('modalNextBtn');
    if (modalNextBtn) {
        modalNextBtn.addEventListener('click', function() {
            navigateModal(1);
        });
    }
    
    // Close modal when clicking outside
    const modal = document.getElementById('chartModal');
    if (modal) {
        modal.addEventListener('click', function(event) {
            if (event.target === modal) {
                closeModal();
            }
        });
    }
    
    // Add keyboard navigation for modal
    document.addEventListener('keydown', function(event) {
        const modal = document.getElementById('chartModal');
        if (modal && modal.style.display === 'flex') {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                event.preventDefault();
                navigateModal(-1);
            } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                event.preventDefault();
                navigateModal(1);
            } else if (event.key === 'Escape') {
                event.preventDefault();
                closeModal();
            }
        }
    });
    
    // Initialize cache clearing and load sessions
    clearCachedData();
    loadAnalysisHistory();
});

// Display combined session results
async function displaySessionResults(session) {
    console.log('Loading combined session with IDs:', session.session_ids);
    
    try {
        // Fetch data from all constituent sessions
        const sessionPromises = session.session_ids.map(id => 
            fetch(`/sessions/${id}`).then(response => response.json())
        );
        
        const sessionDataArray = await Promise.all(sessionPromises);
        console.log('Loaded individual session data for combination:', sessionDataArray.length, 'sessions');
        
        // Debug: log each session's data and detect fluorophores
        const sessionFluorophoreMap = new Map();
        sessionDataArray.forEach((sessionData, index) => {
            const sessionFilename = sessionData.session?.filename || '';
            const detectedFluorophore = detectFluorophoreFromFilename(sessionFilename);
            sessionFluorophoreMap.set(index, detectedFluorophore);
            
            console.log(`Session ${index + 1}:`, {
                sessionName: sessionFilename,
                detectedFluorophore: detectedFluorophore,
                wellCount: sessionData.wells?.length || 0,
                firstWellId: sessionData.wells?.[0]?.well_id,
                sampleWellIds: sessionData.wells?.slice(0, 3).map(w => w.well_id)
            });
        });
        
        // Combine all wells from all sessions with proper fluorophore mapping
        const allWells = [];
        let totalWells = 0;
        let totalPositive = 0;
        
        sessionDataArray.forEach((sessionData, sessionIndex) => {
            if (sessionData.wells) {
                // Get fluorophore from pre-computed map for reliability
                const sessionFluorophore = sessionFluorophoreMap.get(sessionIndex) || 'Unknown';
                
                console.log(`Adding ${sessionData.wells.length} wells from session ${sessionIndex + 1} (${sessionFluorophore})`);
                
                // Add fluorophore information to each well from this session
                sessionData.wells.forEach(well => {
                    well.session_fluorophore = sessionFluorophore; // Add session-level fluorophore
                    allWells.push(well);
                    totalWells++;
                    
                    // Count positive wells
                    if (well.amplitude > 500) {
                        totalPositive++;
                    }
                });
            }
        });
        
        console.log('Total wells combined:', allWells.length, 'Expected:', sessionDataArray.length * 384);
        
        // Transform combined session to analysisResults format
        const transformedResults = {
            total_wells: totalWells,
            good_curves: allWells.filter(well => well.amplitude > 500).map(well => 
                well.well_id.includes('_') ? well.well_id : `${well.well_id}_${well.fluorophore}`
            ),
            success_rate: totalWells > 0 ? (totalPositive / totalWells) * 100 : 0,
            filename: session.filename,
            individual_results: {}
        };
        
        // Transform all well results from all sessions
        allWells.forEach((well, index) => {
            // Production-safe fluorophore detection with comprehensive fallbacks
            let fluorophore = 'Unknown';
            
            try {
                // Method 1: Use session-level fluorophore from filename (most reliable)
                if (well.session_fluorophore && well.session_fluorophore !== 'Unknown' && 
                    ['Cy5', 'FAM', 'HEX', 'Texas Red'].includes(well.session_fluorophore)) {
                    fluorophore = well.session_fluorophore;
                }
                // Method 2: Try well.fluorophore field
                else if (well.fluorophore && well.fluorophore !== 'Unknown' &&
                        ['Cy5', 'FAM', 'HEX', 'Texas Red'].includes(well.fluorophore)) {
                    fluorophore = well.fluorophore;
                }
                // Method 3: Extract from well_id if it has fluorophore suffix
                else if (well.well_id && well.well_id.includes('_')) {
                    const parts = well.well_id.split('_');
                    if (parts.length > 1 && ['Cy5', 'FAM', 'HEX', 'Texas Red'].includes(parts[1])) {
                        fluorophore = parts[1];
                    }
                }
                // Method 4: Try fit_parameters with production-safe parsing
                else if (well.fit_parameters) {
                    try {
                        let fitParams = well.fit_parameters;
                        if (typeof fitParams === 'string') {
                            fitParams = JSON.parse(fitParams);
                        }
                        if (fitParams && fitParams.fluorophore && 
                            ['Cy5', 'FAM', 'HEX', 'Texas Red'].includes(fitParams.fluorophore)) {
                            fluorophore = fitParams.fluorophore;
                        }
                    } catch (parseError) {
                        // Silently continue with Unknown for production stability
                    }
                }
                
                // Production fallback: Use index-based fluorophore assignment as last resort
                if (fluorophore === 'Unknown' && sessionDataArray.length === 3) {
                    const sessionIndex = Math.floor(index / 384); // Assuming 384 wells per session
                    const sessionFluorphoreOrder = ['HEX', 'FAM', 'Cy5']; // Common order
                    if (sessionIndex >= 0 && sessionIndex < sessionFluorphoreOrder.length) {
                        fluorophore = sessionFluorphoreOrder[sessionIndex];
                    }
                }
            } catch (error) {
                // Production error handling - log but don't crash
                console.warn('Fluorophore detection error for well', well.well_id, ':', error);
                fluorophore = 'Unknown';
            }
            
            const baseWellId = well.well_id.includes('_') ? well.well_id.split('_')[0] : well.well_id;
            
            // Create unique well key with fluorophore suffix
            const wellKey = `${baseWellId}_${fluorophore}`;
            
            // Debug well key generation for first few wells
            if (index < 5) {
                console.log(`Well ${index}: original=${well.well_id}, session_fluorophore=${well.session_fluorophore}, detected=${fluorophore}, key=${wellKey}`);
            }
            
            transformedResults.individual_results[wellKey] = {
                well_id: baseWellId,
                fluorophore: fluorophore,
                is_good_scurve: well.amplitude > 500,
                r2_score: well.r2_score,
                rmse: well.rmse,
                amplitude: well.amplitude,
                steepness: well.steepness,
                midpoint: well.midpoint,
                baseline: well.baseline,
                data_points: well.data_points,
                cycle_range: well.cycle_range,
                sample: well.sample_name,
                sample_name: well.sample_name,
                cq_value: well.cq_value,
                anomalies: (() => {
                    try {
                        if (Array.isArray(well.anomalies)) {
                            return well.anomalies;
                        }
                        const anomaliesStr = well.anomalies || '[]';
                        return JSON.parse(anomaliesStr);
                    } catch (e) {
                        return [];
                    }
                })(),
                fitted_curve: (() => {
                    try {
                        if (Array.isArray(well.fitted_curve)) {
                            return well.fitted_curve;
                        }
                        return JSON.parse(well.fitted_curve || '[]');
                    } catch (e) {
                        return [];
                    }
                })(),
                raw_cycles: (() => {
                    try {
                        if (Array.isArray(well.raw_cycles)) {
                            return well.raw_cycles;
                        }
                        return JSON.parse(well.raw_cycles || '[]');
                    } catch (e) {
                        return [];
                    }
                })(),
                raw_rfu: (() => {
                    try {
                        if (Array.isArray(well.raw_rfu)) {
                            return well.raw_rfu;
                        }
                        return JSON.parse(well.raw_rfu || '[]');
                    } catch (e) {
                        return [];
                    }
                })(),
                fit_parameters: (() => {
                    try {
                        if (typeof well.fit_parameters === 'object') {
                            return well.fit_parameters;
                        }
                        return JSON.parse(well.fit_parameters || '{}');
                    } catch (e) {
                        return {};
                    }
                })(),
                parameter_errors: (() => {
                    try {
                        if (typeof well.parameter_errors === 'object') {
                            return well.parameter_errors;
                        }
                        return JSON.parse(well.parameter_errors || '{}');
                    } catch (e) {
                        return {};
                    }
                })()
            };
        });
        
        // Set global analysis results
        analysisResults = transformedResults;
        currentAnalysisResults = transformedResults;
        
        console.log('Combined session transformed - total wells:', totalWells, 'individual results:', Object.keys(transformedResults.individual_results).length);
        console.log('Sample well keys:', Object.keys(transformedResults.individual_results).slice(0, 10));
        
        // Display using multi-fluorophore layout
        displayMultiFluorophoreResults(transformedResults);
        
        // Force save experiment statistics for trend analysis when loading complete multi-fluorophore session
        if (transformedResults && transformedResults.individual_results) {
            const fluorophores = new Set();
            Object.keys(transformedResults.individual_results).forEach(wellKey => {
                const fluorophore = wellKey.split('_').pop();
                if (fluorophore && fluorophore !== 'Unknown') {
                    fluorophores.add(fluorophore);
                }
            });
            
            const experimentPattern = extractBasePattern(session.filename);
            const fluorophoreArray = Array.from(fluorophores);
            console.log('Saving statistics for loaded session:', experimentPattern, 'with fluorophores:', fluorophoreArray);
            
            // Save statistics regardless of count to enable trend analysis for all sessions
            if (fluorophoreArray.length > 0) {
                saveExperimentStatistics(experimentPattern, transformedResults, fluorophoreArray);
            }
        }
        
        // Initialize filters to default state after loading results
        setTimeout(() => {
            initializeFilters();
        }, 100);
        
        // Show analysis section
        const analysisSection = document.getElementById('analysisSection');
        if (analysisSection) {
            analysisSection.style.display = 'block';
        }
        
        // Scroll to analysis section
        document.getElementById('analysisSection').scrollIntoView({ behavior: 'smooth' });
        
        console.log('Combined session loaded successfully:', session.filename, 'with', Object.keys(transformedResults.individual_results).length, 'wells');
        
    } catch (error) {
        console.error('Error loading combined session:', error);
        alert('Error loading combined session: ' + error.message);
    }
}

// Handle combined session deletion
async function deleteSessionGroup(sessionId, event) {
    if (event) {
        event.stopPropagation();
    }
    
    // Find the session to determine if it's combined or individual
    let session = window.currentCombinedSessions?.find(s => s.id === sessionId);
    
    // If not found in combined sessions, it might be an individual session ID (numeric)
    if (!session && !isNaN(sessionId)) {
        // Handle direct database session ID
        if (!confirm('Are you sure you want to delete this analysis session?')) {
            return;
        }
        
        try {
            const response = await fetch(`/sessions/${sessionId}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                loadAnalysisHistory();
            } else {
                const errorData = await response.json();
                alert('Failed to delete session: ' + (errorData.error || 'Unknown error'));
            }
            return;
        } catch (error) {
            console.error('Error deleting session:', error);
            alert('Failed to delete session: ' + error.message);
            return;
        }
    }
    
    if (!session) {
        alert('Session not found. Please refresh and try again.');
        return;
    }
    
    let confirmMessage;
    if (session.is_combined) {
        confirmMessage = `Are you sure you want to delete this multi-fluorophore analysis? This will delete ${session.session_ids.length} individual sessions.`;
    } else {
        confirmMessage = 'Are you sure you want to delete this analysis session?';
    }
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        if (session.is_combined) {
            // Delete all individual sessions that make up the combined session
            const deletePromises = session.session_ids.map(id => 
                fetch(`/sessions/${id}`, { method: 'DELETE' })
            );
            
            const responses = await Promise.all(deletePromises);
            const allSuccessful = responses.every(response => response.ok);
            
            if (allSuccessful) {
                loadAnalysisHistory();
            } else {
                alert('Some sessions could not be deleted. Please try again.');
            }
        } else {
            // Delete single session
            const response = await fetch(`/sessions/${sessionId}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                loadAnalysisHistory();
            } else {
                alert('Failed to delete session. Please try again.');
            }
        }
    } catch (error) {
        console.error('Error deleting session:', error);
        alert('Failed to delete session. Please try again.');
    }
}
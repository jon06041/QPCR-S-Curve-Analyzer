// qPCR S-Curve Analyzer - Frontend JavaScript
// Global variables
let csvData = null;
let samplesData = null;
let analysisResults = null;
let currentChart = null;
let amplificationFiles = {}; // Store multiple fluorophore files

// File upload handling
function extractBasePattern(filename) {
    // Extract base pattern from CFX Manager filename (e.g., AcBVAB_2578825_CFX367393)
    const pattern = /^([A-Za-z][A-Za-z0-9]*_\d+_CFX\d+)/i;
    const match = filename.match(pattern);
    return match ? match[1] : filename.split('.')[0];
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
            cycleCount = fileData.data.length - 1; // Subtract header row
            
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
        
        // If only one fluorophore was analyzed, use simple display
        if (fluorophores.length === 1) {
            const singleResult = allResults[fluorophores[0]];
            analysisResults = singleResult;
            
            const filename = amplificationFiles[fluorophores[0]].fileName;
            saveAnalysisToHistory(filename, singleResult);
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
    
    document.getElementById('analysisSection').style.display = 'block';
    
    // Update individual stat elements
    const totalWellsEl = document.getElementById('totalWells');
    const goodCurvesEl = document.getElementById('goodCurves');
    const successRateEl = document.getElementById('successRate');
    
    if (totalWellsEl) totalWellsEl.textContent = results.total_wells || 0;
    if (goodCurvesEl) goodCurvesEl.textContent = results.good_curves ? results.good_curves.length : 0;
    if (successRateEl) successRateEl.textContent = results.success_rate ? (results.success_rate * 100).toFixed(1) + '%' : '0%';
    
    populateWellSelector(results.individual_results);
    populateResultsTable(results.individual_results);
    
    // Show first well by default
    const firstWell = Object.keys(results.individual_results)[0];
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
    
    // Update summary statistics
    const totalWells = results.total_wells || 0;
    const goodCurves = results.good_curves ? results.good_curves.length : 0;
    const successRate = results.success_rate || 0;
    
    document.getElementById('totalWells').textContent = totalWells;
    document.getElementById('goodCurves').textContent = goodCurves;
    document.getElementById('successRate').textContent = successRate.toFixed(1) + '%';
    
    // Update cycle range if available
    if (results.cycle_info) {
        document.getElementById('cycleRangeResult').textContent = 
            `${results.cycle_info.min} - ${results.cycle_info.max} (${results.cycle_info.count} cycles)`;
    }
    
    // Add fluorophore filter for multi-fluorophore results
    addFluorophoreFilter(results.individual_results);
    
    // Populate well selector and results table
    populateWellSelector(results.individual_results);
    populateResultsTable(results.individual_results);
    
    // Show first well by default
    const firstWell = Object.keys(results.individual_results)[0];
    if (firstWell) {
        showWellDetails(firstWell);
    }
    
    // Initialize chart display after DOM updates complete
    setTimeout(() => {
        initializeChartDisplay();
    }, 400);
    
    document.getElementById('analysisSection').scrollIntoView({ behavior: 'smooth' });
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

// Global variable to store current results for filtering
let currentAnalysisResults = null;

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
    
    // Add fluorophore options with well counts
    fluorophores.forEach(fluorophore => {
        const count = Object.values(individualResults).filter(result => 
            (result.fluorophore || 'Unknown') === fluorophore
        ).length;
        
        const option = document.createElement('option');
        option.value = fluorophore;
        option.textContent = `${fluorophore} (${count} wells)`;
        fluorophoreSelector.appendChild(option);
    });
    
    // Add event listener for fluorophore filtering
    fluorophoreSelector.addEventListener('change', function() {
        filterWellsByFluorophore(this.value);
        // Auto-select first well (A1) for the selected fluorophore and show curve
        const wellSelector = document.getElementById('wellSelect');
        if (wellSelector && wellSelector.options.length > 1) {
            // Skip "All Wells" option and select first actual well
            wellSelector.selectedIndex = 1;
            const selectedWell = wellSelector.value;
            showWellDetails(selectedWell);
            // Update chart to show selected curve if in selected mode
            if (currentChartMode === 'selected') {
                updateChart(selectedWell);
            }
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
        
        // Existing quality badge
        const statusClass = result.is_good_scurve ? 'status-good' : 'status-poor';
        const statusText = result.is_good_scurve ? 'Good S-Curve' : 'Poor Fit';
        
        // New stricter criteria badges
        let strictBadgeClass = '';
        let strictBadgeText = '';
        
        const r2Score = result.r2_score || 0;
        const steepness = result.steepness || 0;
        const amplitude = result.amplitude || 0;
        
        // Apply strict criteria using amplitude thresholds
        // Badge based on amplitude values only
        try {
            if (amplitude > 500) {
                strictBadgeClass = 'strict-pos';
                strictBadgeText = 'POS';
            } else if (amplitude < 400) {
                strictBadgeClass = 'strict-neg';
                strictBadgeText = 'NEG';
            } else if (amplitude >= 400 && amplitude <= 500) {
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
            showWellDetails(wellKey);
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
    `;
    
    document.getElementById('curveDetails').innerHTML = detailsHtml;
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
    const fluorophores = ['Cy5', 'FAM', 'HEX', 'Texas Red'];
    
    for (const fluorophore of fluorophores) {
        if (fileName.toLowerCase().includes(fluorophore.toLowerCase())) {
            return fluorophore;
        }
    }
    
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
    if (currentChart) {
        currentChart.destroy();
        currentChart = null;
    }
    
    // Clear file inputs
    const fileInput = document.getElementById('fileInput');
    const samplesInput = document.getElementById('samplesInput');
    if (fileInput) fileInput.value = '';
    if (samplesInput) samplesInput.value = '';
    
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

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Clear any cached data first
    clearCachedData();
    
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

async function saveCombinedSession(filename, combinedResults, fluorophores = []) {
    try {
        const response = await fetch('/sessions/save-combined', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filename: filename,
                combined_results: combinedResults,
                fluorophores: fluorophores
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            console.log('Combined session saved:', result.display_name);
            // Refresh history display
            loadAnalysisHistory();
        } else {
            console.error('Failed to save combined session:', result.error);
            // Fallback to local storage
            saveAnalysisToHistory(filename, combinedResults);
        }
        
    } catch (error) {
        console.error('Error saving combined session:', error);
        // Fallback to local storage
        saveAnalysisToHistory(filename, combinedResults);
    }
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

function displayAnalysisHistory(sessions) {
    const historyContent = document.getElementById('historyContent');
    if (!historyContent) return;
    
    if (!sessions || sessions.length === 0) {
        historyContent.innerHTML = '<p>No analysis history available.</p>';
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
                    <tr onclick="loadSessionDetails(${session.id})" data-session-id="${session.id}" class="history-row">
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
                        <td onclick="event.stopPropagation()">
                            <button onclick="loadSessionDetails(${session.id})" class="btn-small btn-primary">View</button>
                            <button onclick="deleteSession(${session.id}, event)" class="btn-small btn-danger">Delete</button>
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
                    <th>Success Rate</th>
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
                            <button onclick="loadLocalSessionDetails(${index})" class="btn-small">View</button>
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
        const response = await fetch(`/sessions/${sessionId}`);
        const sessionData = await response.json();
        
        if (!sessionData.session) {
            throw new Error('Session not found');
        }
        
        const session = sessionData.session;
        const wells = sessionData.wells || [];
        console.log('Loaded session data:', {sessionName: session.filename, wellCount: wells.length});
        
        // Transform the session data into the expected format
        const transformedResults = {
            total_wells: session.total_wells,
            good_curves: wells.filter(well => well.is_good_scurve).map(well => well.well_id),
            success_rate: session.success_rate,
            individual_results: {}
        };
        
        // Transform well results
        wells.forEach((well, index) => {
            // Extract fluorophore from well_id (format: A1_Cy5, B2_FAM, etc.)
            const fluorophore = well.well_id.includes('_') ? well.well_id.split('_')[1] : (well.fluorophore || 'Unknown');
            const baseWellId = well.well_id.includes('_') ? well.well_id.split('_')[0] : well.well_id;
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
        
        // Always use multi-fluorophore display for history data (since all current sessions are multi-fluorophore)
        displayMultiFluorophoreResults(transformedResults);
        

        
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
    
    if (fluorophores.length <= 1) return; // Don't show filter for single fluorophore
    
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
        
        // Add fluorophore options
        fluorophores.forEach(fluorophore => {
            const option = document.createElement('option');
            option.value = fluorophore;
            option.textContent = fluorophore;
            filterSelect.appendChild(option);
        });
        
        // Add event listener
        filterSelect.removeEventListener('change', filterTableByFluorophore);
        filterSelect.addEventListener('change', filterTableByFluorophore);
    }
}

function filterTableByFluorophore() {
    const filterValue = document.getElementById('fluorophoreFilter').value;
    const tableRows = document.querySelectorAll('#resultsTable tbody tr');
    let visibleCount = 0;
    
    tableRows.forEach(row => {
        const fluorophoreCell = row.cells[2]; // Fluorophore is 3rd column (index 2)
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
function filterTable() {
    const searchTerm = document.getElementById('searchWells') ? 
        document.getElementById('searchWells').value.toLowerCase() : '';
    const statusFilter = document.getElementById('filterStatus') ? 
        document.getElementById('filterStatus').value : 'all';
    const fluorophoreFilter = document.getElementById('fluorophoreFilter') ? 
        document.getElementById('fluorophoreFilter').value : 'all';
    
    const tableRows = document.querySelectorAll('#resultsTableBody tr');
    let visibleCount = 0;
    
    tableRows.forEach(row => {
        const wellName = row.cells[0] ? row.cells[0].textContent.toLowerCase() : '';
        const sampleName = row.cells[1] ? row.cells[1].textContent.toLowerCase() : '';
        const fluorophore = row.cells[2] ? row.cells[2].textContent : '';
        const strictCriteria = row.cells[3] ? row.cells[3].textContent.toLowerCase() : '';
        const status = row.cells[4] ? row.cells[4].textContent.toLowerCase() : '';
        
        // Search matches well name or sample name
        const matchesSearch = wellName.includes(searchTerm) || sampleName.includes(searchTerm);
        
        // Status filter
        const matchesStatus = statusFilter === 'all' || 
                             (statusFilter === 'good' && status.includes('good')) ||
                             (statusFilter === 'poor' && status.includes('poor'));
        
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

// Chart display mode tracking
let currentChartMode = 'selected'; // 'selected', 'all', 'good'

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
        });
    }
    
    // Good S-Curves Only button
    const goodCurvesBtn = document.getElementById('goodCurvesBtn');
    if (goodCurvesBtn) {
        goodCurvesBtn.addEventListener('click', function() {
            console.log('Good S-Curves Only button clicked');
            currentChartMode = 'good';
            updateChartDisplayMode();
            updateActiveButton(this);
        });
    }
    
    // Export button (existing functionality)
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportResults);
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
            }
            break;
        case 'all':
            console.log('Calling showAllCurves for:', selectedFluorophore);
            showAllCurves(selectedFluorophore);
            break;
        case 'good':
            console.log('Calling showGoodCurves for:', selectedFluorophore);
            showGoodCurves(selectedFluorophore);
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
                    text: `All Curves - ${selectedFluorophore === 'all' ? 'All Fluorophores' : selectedFluorophore}`,
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
    
    console.log('Showing good curves for fluorophore:', selectedFluorophore);
    
    const ctx = document.getElementById('amplificationChart').getContext('2d');
    
    // Destroy existing chart safely
    safeDestroyChart();
    
    const datasets = [];
    const results = currentAnalysisResults.individual_results;
    
    Object.keys(results).forEach((wellKey, index) => {
        const wellData = results[wellKey];
        
        // Only show good curves
        if (!wellData.is_good_scurve) return;
        
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
                    text: `Good S-Curves Only - ${selectedFluorophore === 'all' ? 'All Fluorophores' : selectedFluorophore}`,
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
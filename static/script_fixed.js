// qPCR S-Curve Analyzer - Frontend JavaScript
// Global variables
let csvData = null;
let samplesData = null;
let analysisResults = null;
let currentChart = null;
let amplificationFiles = {}; // Store multiple fluorophore files

// File upload handling
function handleFileUpload(file, type = 'amplification') {
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const csv = e.target.result;
        Papa.parse(csv, {
            complete: function(results) {
                if (type === 'amplification') {
                    // Detect fluorophore from filename
                    const fluorophore = detectFluorophoreFromFilename(file.name);
                    amplificationFiles[fluorophore] = {
                        data: results.data,
                        fileName: file.name
                    };
                    updateAmplificationFilesList();
                    updateFileStatus('amplificationStatus', file.name, true);
                } else if (type === 'samples') {
                    samplesData = results.data;
                    updateFileStatus('samplesStatus', file.name, true);
                }
                
                displayFileInfo(file, results.data);
                checkAnalysisReady();
            },
            header: false
        });
    };
    reader.readAsText(file);
}

function updateFileStatus(statusId, fileName, success) {
    const statusElement = document.getElementById(statusId);
    if (statusElement) {
        statusElement.innerHTML = success ? 
            `✓ ${fileName}` : 
            `✗ Upload failed: ${fileName}`;
        statusElement.className = success ? 'file-status success' : 'file-status error';
    }
}

function checkAnalysisReady() {
    const analysisButton = document.getElementById('analyzeBtn');
    const hasAmplificationFiles = Object.keys(amplificationFiles).length > 0;
    const hasSamplesData = samplesData !== null;
    
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
    document.getElementById('summaryStats').innerHTML = `
        <div class="stat-item">
            <span class="stat-label">Total Wells:</span>
            <span class="stat-value">${results.total_wells || 0}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Good S-Curves:</span>
            <span class="stat-value">${results.good_curves ? results.good_curves.length : 0}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Success Rate:</span>
            <span class="stat-value">${results.success_rate ? (results.success_rate * 100).toFixed(1) : 0}%</span>
        </div>
    `;
    
    populateWellSelector(results.individual_results);
    populateResultsTable(results.individual_results);
    
    // Show first well by default
    const firstWell = Object.keys(results.individual_results)[0];
    if (firstWell) {
        showWellDetails(firstWell);
    }
    
    document.getElementById('analysisSection').scrollIntoView({ behavior: 'smooth' });
}

function populateWellSelector(individualResults) {
    const selector = document.getElementById('wellSelector');
    selector.innerHTML = '';
    
    Object.keys(individualResults).forEach(wellKey => {
        const result = individualResults[wellKey];
        const option = document.createElement('option');
        option.value = wellKey;
        
        const wellId = result.well_id || wellKey;
        const fluorophore = result.fluorophore || 'Unknown';
        const sampleName = result.sample || result.sample_name || 'N/A';
        const status = result.is_good_scurve ? '✓' : '✗';
        
        option.textContent = `${status} ${wellId}: ${sampleName} (${fluorophore})`;
        selector.appendChild(option);
    });
}

function showWellDetails(wellKey) {
    if (!analysisResults || !analysisResults.individual_results) {
        console.error('No analysis results available');
        return;
    }
    
    const wellResult = analysisResults.individual_results[wellKey];
    if (!wellResult) {
        console.error('Well result not found:', wellKey);
        return;
    }
    
    updateChart(wellKey);
    
    const wellId = wellResult.well_id || wellKey;
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
    
    document.getElementById('wellDetails').innerHTML = detailsHtml;
}

function updateChart(wellKey) {
    if (!analysisResults || !analysisResults.individual_results) return;
    
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
    
    currentChart = new Chart(ctx, {
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
    const cqData = parseCqData();
    const sampleNames = parseSampleNames();
    
    // Add sample names and Cq values to well data
    Object.keys(wellData).forEach(wellId => {
        wellData[wellId].sample_name = sampleNames[wellId] || 'Unknown';
        wellData[wellId].cq_value = cqData[wellId] || null;
    });
    
    console.log(`Prepared analysis data for ${Object.keys(wellData).length} wells`);
    return wellData;
}

function parseCqData() {
    if (!samplesData || samplesData.length < 2) {
        return {};
    }
    
    const cqData = {};
    let wellColumnIndex = -1;
    let cqColumnIndex = -1;
    
    // Find Well and Cq columns
    for (let colIndex = 0; colIndex < samplesData[0].length; colIndex++) {
        const header = samplesData[0][colIndex];
        if (header && header.toLowerCase().includes('well')) {
            wellColumnIndex = colIndex;
        } else if (header && header.toLowerCase().includes('cq')) {
            cqColumnIndex = colIndex;
        }
    }
    
    if (wellColumnIndex === -1 || cqColumnIndex === -1) {
        console.warn('Could not find Well or Cq columns in samples data');
        return {};
    }
    
    // Extract Cq values
    for (let rowIndex = 1; rowIndex < samplesData.length; rowIndex++) {
        const wellId = samplesData[rowIndex][wellColumnIndex];
        const cqValue = parseFloat(samplesData[rowIndex][cqColumnIndex]);
        
        if (wellId && !isNaN(cqValue)) {
            cqData[wellId] = cqValue;
        }
    }
    
    return cqData;
}

function parseSampleNames() {
    if (!samplesData || samplesData.length < 2) {
        return {};
    }
    
    const sampleNames = {};
    let wellColumnIndex = -1;
    let sampleColumnIndex = -1;
    
    // Find Well and Sample columns
    for (let colIndex = 0; colIndex < samplesData[0].length; colIndex++) {
        const header = samplesData[0][colIndex];
        if (header && header.toLowerCase().includes('well')) {
            wellColumnIndex = colIndex;
        } else if (header && header.toLowerCase().includes('sample')) {
            sampleColumnIndex = colIndex;
        }
    }
    
    if (wellColumnIndex === -1 || sampleColumnIndex === -1) {
        console.warn('Could not find Well or Sample columns in samples data');
        return {};
    }
    
    // Extract sample names
    for (let rowIndex = 1; rowIndex < samplesData.length; rowIndex++) {
        const wellId = samplesData[rowIndex][wellColumnIndex];
        const sampleName = samplesData[rowIndex][sampleColumnIndex];
        
        if (wellId && sampleName) {
            sampleNames[wellId] = sampleName;
        }
    }
    
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
    const filesList = document.getElementById('amplificationFilesList');
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
        </div>`;
    }).join('');
    
    filesList.innerHTML = filesHtml;
}

function combineMultiFluorophoreResults(allResults) {
    const combined = {
        total_wells: 0,
        good_curves: [],
        success_rate: 0,
        individual_results: {}
    };
    
    Object.keys(allResults).forEach(fluorophore => {
        const results = allResults[fluorophore];
        
        combined.total_wells += results.total_wells || 0;
        
        if (results.good_curves) {
            combined.good_curves.push(...results.good_curves);
        }
        
        if (results.individual_results) {
            Object.keys(results.individual_results).forEach(wellKey => {
                const wellResult = results.individual_results[wellKey];
                const newWellKey = `${wellKey}_${fluorophore}`;
                combined.individual_results[newWellKey] = {
                    ...wellResult,
                    fluorophore: fluorophore
                };
            });
        }
    });
    
    combined.success_rate = combined.total_wells > 0 ? 
        combined.good_curves.length / combined.total_wells : 0;
    
    return combined;
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // File upload event listeners
    const amplificationUpload = document.getElementById('amplificationUpload');
    const samplesUpload = document.getElementById('samplesUpload');
    
    if (amplificationUpload) {
        amplificationUpload.addEventListener('change', function(e) {
            const files = Array.from(e.target.files);
            files.forEach(file => handleFileUpload(file, 'amplification'));
        });
    }
    
    if (samplesUpload) {
        samplesUpload.addEventListener('change', function(e) {
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
    const wellSelector = document.getElementById('wellSelector');
    if (wellSelector) {
        wellSelector.addEventListener('change', function(e) {
            showWellDetails(e.target.value);
        });
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
    
    localStorage.setItem('qpcrAnalysisHistory', JSON.stringify(history));
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
                    <th>Date</th>
                    <th>Filename</th>
                    <th>Wells</th>
                    <th>Good Curves</th>
                    <th>Success Rate</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${sessions.map(session => `
                    <tr>
                        <td>${new Date(session.upload_timestamp).toLocaleDateString()}</td>
                        <td>${session.filename}</td>
                        <td>${session.total_wells}</td>
                        <td>${session.good_curves}</td>
                        <td>${(session.success_rate * 100).toFixed(1)}%</td>
                        <td>
                            <button onclick="loadSessionDetails(${session.id})" class="btn-small">View</button>
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
        const response = await fetch(`/sessions/${sessionId}`);
        const sessionData = await response.json();
        
        if (!sessionData.session) {
            throw new Error('Session not found');
        }
        
        const session = sessionData.session;
        
        // Transform the session data into the expected format
        const transformedResults = {
            total_wells: session.total_wells,
            good_curves: session.well_results.filter(well => well.is_good_scurve).map(well => well.well_id),
            success_rate: session.success_rate,
            individual_results: {}
        };
        
        // Transform well results
        session.well_results.forEach(well => {
            const wellKey = well.fluorophore ? `${well.well_id}_${well.fluorophore}` : well.well_id;
            transformedResults.individual_results[wellKey] = {
                well_id: well.well_id,
                fluorophore: well.fluorophore || 'Unknown',
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
        
        // Set global analysis results and display
        analysisResults = transformedResults;
        
        // Determine if this is multi-fluorophore
        const hasFluorophores = session.well_results.some(well => well.fluorophore);
        
        if (hasFluorophores) {
            displayMultiFluorophoreResults(transformedResults);
        } else {
            displayAnalysisResults(transformedResults);
        }
        
        // Scroll to analysis section
        document.getElementById('analysisSection').scrollIntoView({ behavior: 'smooth' });
        
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
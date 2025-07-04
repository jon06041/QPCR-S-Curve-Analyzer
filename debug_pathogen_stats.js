// Debug script to test pathogen statistics calculation
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

// Load the pathogen library
const pathogenLibContent = fs.readFileSync('./static/pathogen_library.js', 'utf8');
eval(pathogenLibContent);

function getPathogenTarget(testCode, fluorophore) {
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

function isControlSample(sampleName, testName) {
    if (!sampleName || typeof sampleName !== 'string') return false;
    const sample = sampleName.toLowerCase();
    
    // Standard control patterns
    if (sample.includes('neg') || sample.includes('pos') || 
        sample.includes('blank') || sample.includes('ntc') ||
        sample.includes('control') || sample.includes('std')) {
        return true;
    }
    
    return false;
}

// Connect to database and test a real session
const db = new sqlite3.Database('./qpcr_analysis.db');

db.get(`
    SELECT id, filename, pathogen_breakdown, well_results 
    FROM analysis_sessions 
    WHERE pathogen_breakdown IS NOT NULL 
    AND pathogen_breakdown != '' 
    AND pathogen_breakdown != '0.0'
    ORDER BY created_at DESC 
    LIMIT 1
`, (err, session) => {
    if (err) {
        console.error('Database error:', err);
        return;
    }
    
    if (!session) {
        console.log('No sessions found with pathogen breakdown data');
        return;
    }
    
    console.log('=== DEBUGGING SESSION ===');
    console.log('ID:', session.id);
    console.log('Filename:', session.filename);
    console.log('Stored pathogen_breakdown:', session.pathogen_breakdown);
    
    // Test extractTestCode
    const testCode = extractTestCode(session.filename);
    console.log('Extracted test code:', testCode);
    
    // Check if test code exists in pathogen library
    console.log('Test code in pathogen library?', testCode in PATHOGEN_LIBRARY);
    if (testCode in PATHOGEN_LIBRARY) {
        console.log('Available fluorophores for', testCode, ':', Object.keys(PATHOGEN_LIBRARY[testCode]));
    }
    
    // Parse well results
    if (session.well_results) {
        try {
            const wellResults = JSON.parse(session.well_results);
            console.log('Total wells:', wellResults.length);
            
            // Check first few wells
            const firstWells = wellResults.slice(0, 5);
            console.log('First 5 wells:');
            firstWells.forEach((well, i) => {
                console.log(`  Well ${i+1}:`, {
                    well_id: well.well_id,
                    sample_name: well.sample_name,
                    fluorophore: well.fluorophore,
                    amplitude: well.amplitude,
                    is_good_scurve: well.is_good_scurve,
                    isControl: isControlSample(well.sample_name, testCode)
                });
            });
            
            // Count fluorophores
            const fluorophoreCount = {};
            const patientWells = wellResults.filter(well => 
                !isControlSample(well.sample_name, testCode)
            );
            
            console.log('Patient wells (non-control):', patientWells.length);
            
            patientWells.forEach(well => {
                const fluor = well.fluorophore || 'Unknown';
                fluorophoreCount[fluor] = (fluorophoreCount[fluor] || 0) + 1;
            });
            
            console.log('Fluorophore distribution in patient wells:', fluorophoreCount);
            
            // Test pathogen target resolution
            Object.keys(fluorophoreCount).forEach(fluorophore => {
                const target = getPathogenTarget(testCode, fluorophore);
                console.log(`${fluorophore} -> ${target}`);
            });
            
        } catch (e) {
            console.error('Error parsing well_results:', e.message);
        }
    }
    
    db.close();
});

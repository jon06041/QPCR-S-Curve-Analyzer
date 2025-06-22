# qPCR S-Curve Analyzer

## Overview

This is a web-based qPCR (quantitative Polymerase Chain Reaction) S-Curve analyzer built with Flask and Python. The application allows users to upload CFX Manager CSV files containing qPCR amplification data and performs sophisticated curve analysis to identify S-shaped amplification patterns. The system provides real-time analysis with interactive visualizations and supports variable cycle lengths for flexible data processing.

## System Architecture

### Frontend Architecture
- **Technology**: Vanilla HTML5, CSS3, and JavaScript
- **UI Framework**: Custom responsive design with modern CSS Grid and Flexbox
- **Charting**: Chart.js for interactive data visualization
- **File Processing**: PapaParse for client-side CSV parsing
- **Design Pattern**: Single Page Application (SPA) with progressive enhancement

### Backend Architecture
- **Framework**: Flask (Python web framework)
- **Architecture Pattern**: RESTful API with stateless design
- **File Structure**: Modular separation with dedicated analysis module
- **Error Handling**: Comprehensive validation and error response system

## Key Components

### Core Analysis Engine (`qpcr_analyzer.py`)
- **Sigmoid Function Fitting**: Uses scipy.optimize.curve_fit for mathematical modeling
- **Quality Metrics**: R² score calculation, RMSE analysis, and curve parameter extraction
- **Adaptive Parameter Estimation**: Dynamic initial guesses based on data characteristics
- **Validation System**: Multi-tier data validation with error and warning classification

### Web Application (`app.py`)
- **API Endpoints**: 
  - `/` - Serves main application interface
  - `/static/<path>` - Static file serving
  - `/analyze` - POST endpoint for qPCR data analysis
- **Data Processing Pipeline**: JSON input validation → CSV structure validation → Analysis execution
- **Response Format**: Standardized JSON responses with success/error states

### Frontend Interface
- **File Upload**: Drag-and-drop and click-to-browse functionality
- **Real-time Feedback**: Dynamic file information display and progress indicators
- **Interactive Analysis**: Well selection and curve visualization
- **Responsive Design**: Mobile-first approach with adaptive layouts

## Data Flow

1. **File Upload**: User uploads CFX Manager CSV file via web interface
2. **Client-side Processing**: PapaParse converts CSV to JSON structure
3. **Data Transmission**: JSON payload sent to Flask `/analyze` endpoint
4. **Validation**: Server validates CSV structure and data integrity
5. **Analysis**: Sigmoid curve fitting performed on amplification data
6. **Response**: Analysis results returned as JSON with quality metrics
7. **Visualization**: Chart.js renders interactive curves and results

## External Dependencies

### Python Dependencies
- **Flask 3.1.1+**: Web framework for API and static file serving
- **NumPy 2.3.0+**: Numerical computing and array operations
- **SciPy 1.15.3+**: Scientific computing, specifically curve fitting optimization
- **matplotlib 3.10.3+**: Plotting and visualization backend
- **scikit-learn 1.7.0+**: Machine learning metrics (R² score calculation)
- **pandas 2.3.0+**: Data manipulation and CSV processing

### Frontend Dependencies (CDN)
- **Chart.js 3.9.1**: Interactive charting and data visualization
- **PapaParse 5.4.1**: Client-side CSV parsing and validation

### System Dependencies
- **Cairo**: Graphics rendering support
- **FFmpeg**: Media processing capabilities
- **FreeType**: Font rendering
- **GTK3**: GUI toolkit support

## Deployment Strategy

### Development Environment
- **Platform**: Replit with Nix package management
- **Python Version**: 3.11
- **Package Management**: pip with automatic dependency installation
- **Port Configuration**: Flask development server on port 5000

### Production Deployment
- **Containerization**: Ready for Docker deployment with pip-based dependency management
- **Scalability**: Stateless design supports horizontal scaling
- **Performance**: Optimized for CPU-intensive curve fitting operations

### Environment Configuration
- **Nix Channel**: stable-24_05 for consistent package versions
- **Workflow**: Parallel execution with automatic dependency installation
- **Resource Requirements**: CPU-optimized for scientific computing workloads

## Recent Changes

### June 22, 2025 - Trend Analysis Database Implementation & Enhanced Result Criteria
- ✓ **Added ExperimentStatistics Database Table**: New SQLite table stores fluorophore statistics for each experiment with unique experiment name tracking
- ✓ **Automatic Statistics Saving**: System automatically saves fluorophore breakdown (POS/NEG/REDO counts and percentages) after multi-fluorophore analysis completion
- ✓ **Database Overwrite Capability**: Re-analyzing same experiment pattern overwrites existing statistics rather than creating duplicates
- ✓ **Trend Analysis View Button**: Added "View Trends" button in Analysis History section to display experiment statistics over time
- ✓ **Multi-Test Support**: Enhanced system to support multiple tests (AcBVAB, AcNgon, AcCtrach, AcTvag, etc.) with aggregated statistics display
- ✓ **Subtest Functionality**: Each fluorophore channel (Cy5, FAM, HEX, Texas Red) functions as an individual subtest within each experiment
- ✓ **Correct Experiment Counting**: Single multi-fluorophore analysis counts as 1 experiment with multiple fluorophore subtests (e.g., AcBVAB Test Results (1 experiment))
- ✓ **Enhanced Result Criteria**: Implemented anomaly-aware classification system:
  - **POS**: amplitude > 500 AND anomalies = "None"
  - **REDO**: amplitude 400-500 OR (amplitude > 500 BUT has anomalies)
  - **NEG**: amplitude < 400
- ✓ **Aggregated Test Display**: Trend view groups experiments by test name and aggregates fluorophore statistics across all experiments for each test
- ✓ **Smart Test Grouping**: System shows "AcBVAB Test Results (X experiment/experiments)" with proper singular/plural grammar
- ✓ **API Endpoints**: Created `/experiments/statistics` GET/POST endpoints for saving and retrieving trend analysis data
- ✓ **Test Name Extraction**: System extracts test name from experiment pattern (e.g., AcBVAB_2578825_CFX367393 → AcBVAB) for intelligent grouping
- ✓ **Enhanced CSS Styling**: Added comprehensive styling for trend analysis cards, progress bars, and interactive elements

### June 22, 2025 - Complete Selected Curve Details & Modal Enhancement
- ✓ **Fixed Modal Sizing Issues**: Increased modal width to 90% (max 1100px) and height to 90vh for better content display
- ✓ **Enhanced Modal Scrolling**: Added proper overflow handling to prevent content cutoff
- ✓ **Complete Selected Curve Details Implementation**: POS/NEG/REDO buttons now show filtered sample lists in curve details section
- ✓ **Added showFilteredCurveDetails Function**: Displays filtered samples with counts and statistics when filters are active
- ✓ **Proper State Management Across All Modes**: All chart buttons (Show Selected Curve, Show All Wells, POS, NEG, REDO) properly manage curve details
- ✓ **Fixed Mode Switching**: Curve details properly clear when switching between filtered and non-filtered modes
- ✓ **Enhanced User Experience**: Filtered sample lists appear only for POS/REDO modes with specific fluorophore selection
- ✓ **Fixed JavaScript Syntax Errors**: Resolved duplicate variable declarations for currentAnalysisResults and currentChartMode
- ✓ **Restored Complete File Upload**: Fixed missing function references (clearAllCachedData → clearCachedData, loadSessions → loadAnalysisHistory)

### June 22, 2025 - Enhanced Zero Results Handling & Filter Integration
- ✓ **Zero Results Message**: Added informative display when POS/NEG/REDO filters return 0 results for a fluorophore
- ✓ **Experiment Name in Empty Charts**: Chart titles include experiment pattern even when no data matches filter criteria
- ✓ **Clean Empty Chart Display**: Shows simple "No results found" message without exposing internal amplitude criteria
- ✓ **Fixed POS/NEG/REDO Filter Bug**: Resolved issue where POS filter showed NEG results when fluorophore changed
- ✓ **Integrated Filter Systems**: Combined fluorophore and status filtering to work together instead of overriding each other
- ✓ **Maintained Filter State**: Fluorophore switching now preserves active POS/NEG/REDO filter and applies it to new fluorophore
- ✓ **Simplified Session Names**: Removed "Multi-Fluorophore Analysis" prefix, now shows just experiment pattern

### June 21, 2025 - Enhanced Modal Interface & Improved Clickability  
- ✓ **Enhanced Row Clickability**: Added visual indicators with "👁️ Click to view" tooltip, blue border highlights, and enhanced hover effects
- ✓ **Optimized Modal Size**: Reduced modal dimensions (85% width, 85vh height) to eliminate scrolling and show all information
- ✓ **Compact Layout**: Adjusted chart size (400px height), reduced padding, and optimized spacing for better content fit
- ✓ **Responsive Design**: Improved mobile layout with smaller modal and chart dimensions for better mobile experience
- ✓ **Chart Modal Implementation**: Added interactive modal that displays individual qPCR curves when clicking on sample rows in the results table
- ✓ **Modal Design**: Professional modal with slide-in animation, blur backdrop, and responsive 2-column layout (chart + details)
- ✓ **Complete Sample Details**: Modal shows all curve parameters, result classification (POS/NEG/REDO), and fitted curve overlay
- ✓ **Modal Event Handling**: Close modal via X button, clicking outside, or Escape key with proper chart cleanup
- ✓ **Focused Chart View**: Modal chart displays both raw data points and fitted curve with enhanced visibility
- ✓ **Button Separation**: Replaced single "Positive Results Only" button with three separate POS (red), NEG (green), REDO (yellow) buttons
- ✓ **Color-Coded Styling**: Added distinct CSS styling for each button type with gradient backgrounds and hover effects
- ✓ **Amplitude-Based Filtering**: Each button filters charts by exact Results column logic (POS >500, NEG <400, REDO 400-500)
- ✓ **Chart Color Coordination**: POS charts display in red (#e74c3c), NEG in green (#27ae60), REDO in yellow (#f39c12)
- ✓ **Chart Title Integration**: Dynamic titles show experiment name and specific result type (e.g., "AcBVAB_2578825_CFX367393 - POS Results Only - Cy5")
- ✓ **Complete Event Handler**: Added separate click handlers for showPosBtn, showNegBtn, and showRedoBtn with mode tracking
- ✓ **Chart Title Enhancement**: All chart titles now include experiment name for better context (e.g., "AcBVAB_2578825_CFX367393 - qPCR Amplification Curve - A1 (Cy5)")
- ✓ **Table Header Update**: "All Wells Analysis" header dynamically shows experiment name based on uploaded files
- ✓ **Multi-Chart Title Integration**: Both "All Curves" and "Positive Results Only" chart views display experiment pattern in titles
- ✓ **Consistent Experiment Context**: getCurrentFullPattern() function ensures consistent experiment name display across all chart types
- ✓ **Redesigned Analysis Summary**: Changed "Good S-Curves" to "Total Positive" and "Success Rate" to "Positive Percentage" based on amplitude thresholds
- ✓ **Fluorophore-Specific Breakdown**: Added detailed statistics cards for each fluorophore showing Total Wells, Positive, Negative, REDO counts and percentages
- ✓ **Enhanced UI Layout**: Analysis summary now displays 2 items per row for better space utilization
- ✓ **Consistent Styling**: Fluorophore breakdown cards match existing summary stat styling with color-coded results (Green=POS, Red=NEG, Orange=REDO)
- ✓ **Fixed Cycle Range Detection**: System now extracts cycle range from individual well results when main cycle info is missing

### June 21, 2025 - Enhanced Results Filtering & Controls Detection
- ✓ **Updated Results Column**: Changed "Strict Criteria" heading to "Results" for clearer data interpretation
- ✓ **Enhanced Filter Options**: Replaced "Good S-Curves/Poor Curves" with "POS/NEG/REDO Results" based on amplitude thresholds
- ✓ **Smart Controls Detection**: Added "Controls" filter that automatically identifies samples starting with test pattern (e.g., AcBVAB)
- ✓ **Pattern-Based Filtering**: System extracts test name from uploaded file pattern (AcTest_1234567_CFX123456 → AcTest) for intelligent controls identification
- ✓ **Railway Deployment Success**: Application now successfully deploys on Railway platform with resolved dependency conflicts

### June 21, 2025 - Complete Database Storage Fix & Multi-User History Support
- ✓ **Fixed Critical Database Save Issue**: Sessions now store complete curve parameters (RMSE, amplitude, steepness, midpoint, baseline)
- ✓ **Enhanced Chart Data Storage**: Raw cycles and RFU data properly stored as JSON for full chart restoration
- ✓ **Multi-User Database Access**: Complete analysis history now available to all users with full parameter data
- ✓ **Added Comprehensive Parameter Storage**: fit_parameters, parameter_errors, fitted_curve, and anomalies data included
- ✓ **Verified Database Fix**: Test session (ID: 5) confirms complete data storage and retrieval functionality
- ✓ **Legacy Session Handling**: Sessions 1-4 have incomplete data due to pre-fix storage limitations
- ✓ **History Loading Enhanced**: Fluorophore extraction from well_id format (A1_Cy5 → Cy5) working correctly
- ✓ **Chart Data Conversion**: Object-to-array conversion for database-stored chart data functioning properly

### June 21, 2025 - Enhanced qPCR Chart Visualization & Navigation
- ✓ **Fixed Critical Syntax Error**: Resolved unterminated string literal in qPCR analyzer causing startup failures
- ✓ **JavaScript Console Errors Fixed**: Eliminated duplicate `const wellId` declarations causing browser errors
- ✓ **Complete Database Cleanup**: Removed all persistent history files and session data per user request
- ✓ **Enhanced Negative RFU Filtering**: Improved anomaly detection to handle baseline offset cases properly
- ✓ **Smart Amplitude Thresholds**: Curves with negative baselines but low maximums (<20 RFU) no longer flagged incorrectly
- ✓ **Two-Level Fluorophore Filtering**: Separate fluorophore and well dropdowns eliminate scrolling through 136+ mixed wells
- ✓ **Focused Well Selection**: Select fluorophore first (Cy5, FAM, HEX), then choose from filtered wells (35-61 per group)
- ✓ **Natural Well Sorting**: Wells sorted correctly (A1, A2...A10, A11) within each fluorophore group
- ✓ **Enhanced Chart Visualization**: Increased chart container to 600px height for better RFU point visibility
- ✓ **Smart Fluorophore Switching**: Auto-selects A1 curve when switching between fluorophores (Cy5→FAM→HEX)
- ✓ **Multi-Mode Chart Display**: Added "Show Selected Curve", "Show All Wells", and "Good S-Curves Only" buttons
- ✓ **Interactive Chart Modes**: Switch between individual curve analysis and overlay views with visual feedback
- ✓ **Fluorophore Color Coding**: Each fluorophore displays in distinct colors (Cy5=Red, FAM=Green, HEX=Blue)
- ✓ **Server Stability Restored**: Flask server running smoothly with NumPy 1.26.4 and all dependencies working
- ✓ **Multi-fluorophore Analysis Verified**: System successfully processing Cy5, FAM, HEX with proper SQL integration
- ✓ **Multi-Curve Chart Rendering Fixed**: Resolved "bubbles at edge" issue with proper chart scaling and linear axis configuration
- ✓ **Chart Performance Optimized**: Enhanced multi-curve display with improved rendering and data structure debugging
- ✓ **Full Dataset Support**: System now properly displays overlay charts for all 384 wells across multiple fluorophores
- ✓ **Results Table Filter Fixed**: Corrected dropdown filter functionality for "All Wells", "Good S-Curves", and "Poor Curves" options
- ✓ **Column Index Correction**: Fixed filter to check correct Status column instead of Strict Criteria column

### June 20, 2025 - Multi-Fluorophore Session Saving System Restructured
- ✓ **Fixed Major Session Saving Issue**: System now saves one combined multi-fluorophore session instead of individual fluorophore sessions
- ✓ **Enhanced Session Naming**: Fixed to show proper experiment patterns like "Multi-Fluorophore Analysis (Cy5, FAM, HEX) AcBVAB_2578825_CFX367393"
- ✓ **Added Combined Session Endpoint**: New `/sessions/save-combined` endpoint for proper multi-fluorophore session storage
- ✓ **Improved Statistics Calculation**: Backend now calculates correct well counts and success rates from individual results
- ✓ **Frontend-Backend Integration**: Updated to pass fluorophore information from frontend to backend for accurate naming
- ✓ **Skip Individual Saves**: Backend no longer saves individual fluorophore analyses during multi-fluorophore workflows
- ✓ **Maintained Fallback**: Local storage backup still works if database saves fail

### June 20, 2025 - Enhanced Pattern Recognition & Intelligent History Management
- ✓ **Smart Pattern Validation**: Files must share base pattern (AcBVAB_2578825_CFX367393) but suffixes can differ
- ✓ **Intelligent History Naming**: "Multi-Fluorophore Analysis (Cy5, FAM, HEX) AcBVAB_2578825_CFX367393"
- ✓ **Pattern Extraction Function**: Automatic detection of CFX Manager base patterns from filenames
- ✓ **File Consistency Checking**: Prevents mixing different experiment patterns during upload
- ✓ **Enhanced User Feedback**: Clear error messages explaining pattern requirements with examples
- ✓ **Railway Deployment**: Working with `python app.py` start command after Docker conflicts resolved
- ✓ **SQL Integration**: Complete multi-fluorophore analysis with fluorophore-specific Cq values
- ✓ **Selective Upload Support**: Handles single OR multiple amplification files intelligently
- ✓ **Analysis Performance**: Successfully processing 384-well plates (Cy5: 51, FAM: 53, HEX: 80 good curves)

### June 20, 2025 - File Upload Fix & System Reset
- ✓ Fixed JavaScript file upload event listeners to match HTML element IDs (fileInput, samplesInput)
- ✓ Added comprehensive debugging and error handling for file upload process
- ✓ Implemented automatic cache clearing on page load to prevent stale data
- ✓ Successfully restored multi-fluorophore file upload functionality
- ✓ Confirmed file detection working for Cy5, FAM, HEX fluorophores and Summary CSV
- ✓ Flask server restart resolved cached file issues, now ready for analysis
- ✓ Updated upload button descriptions per user requirements
- ✓ Added Clear File buttons for both amplification and summary uploads
- ✓ Enhanced file management with individual file removal and precise upload control

### June 20, 2025 - Database Quota Management & Error Handling
- ✓ Implemented batch database operations to handle large multi-fluorophore datasets (1,152+ records)
- ✓ Added quota-specific error handling and graceful degradation when database limits are reached
- ✓ Enhanced database save process with 50-record batches to avoid connection limits
- ✓ Fixed multi-fluorophore curve display with proper wellKey parameter handling
- ✓ Updated interface to clearly specify Texas Red fluorophore support
- ✓ Improved error messages for quota exceeded scenarios with user-friendly explanations
- ✓ Analysis continues to work even when database saves fail, ensuring user gets results

### June 19, 2025 - Comprehensive Multi-Fluorophore Analysis System
- ✓ Implemented complete multi-fluorophore analysis (384 wells × 3 fluorophores = 1,152 records)
- ✓ Fixed CFX Manager filename validation to support real export formats with spaces and suffixes
- ✓ Enhanced pattern matching to recognize file sets from same experiment (AcBVAB_2578825_CFX367393)
- ✓ Added comprehensive multi-fluorophore results combining system
- ✓ Implemented fluorophore filter dropdown for table navigation
- ✓ Created visual fluorophore tags with color coding (Cy5=red, FAM=green, HEX=blue)
- ✓ Enhanced results table with fluorophore column and sample integration
- ✓ Fixed JavaScript errors by updating all csvData references to new multi-fluorophore system
- ✓ System now analyzes ALL uploaded fluorophores simultaneously for complete workflow
- ✓ Each well displays 3 separate analysis records (one per fluorophore) with identical sample names

### June 19, 2025 - Chart Display & History Loading Fixes
- ✓ Fixed "string pattern" analysis error with enhanced JSON serialization handling
- ✓ Increased chart height to 500px for better qPCR curve visualization 
- ✓ Enhanced y-axis scaling with 15% padding for improved curve visibility
- ✓ Fixed chart display when loading sessions from analysis history
- ✓ Added proper raw data parsing for stored sessions (cycles and RFU values)
- ✓ Improved chart typography with larger fonts and better grid styling
- ✓ Enhanced CSV parsing with better error handling and null data checks
- ✓ Optimized chart aspect ratio (1.8) for better amplification curve display
- ✓ Fixed JSON parsing errors for anomalies data with robust error handling
- ✓ Successfully analyzing 384-well plates with 101 good curves detected
- ✓ Complete session history loading functionality working with database storage

### June 19, 2025 - Enhanced Individual Curve Analysis & UI Improvements
- ✓ Restored and enhanced individual curve analysis features from original assets
- ✓ Added parameter uncertainties display with ± error values for all curve parameters
- ✓ Integrated comprehensive anomaly detection with detailed problem descriptions
- ✓ Implemented residuals analysis with statistical metrics (mean, std deviation)
- ✓ Enhanced UI with quality metrics visualization and progress bars
- ✓ Resized layout: curve details window now 2x wider, condensed summary sections
- ✓ Added scrolling support for enhanced curve details panel
- ✓ Updated GitHub deployment package with all improvements

### June 19, 2025 - NumPy Dependency Fix & Stability Improvements
- ✓ Resolved critical NumPy/SciPy dependency issue with C++ standard library (libstdc++.so.6)
- ✓ Implemented Nix shell environment for proper scientific computing library support
- ✓ Created simplified app version to ensure core functionality remains available
- ✓ Fixed history loading errors with temporary /sessions endpoint
- ✓ Confirmed scientific libraries working: NumPy 1.26.4, SciPy 1.13.0
- ✓ Flask server stable and running on port 5000 with debug mode
- ✓ Core qPCR S-curve analysis functionality fully operational

### June 18, 2025 - Database Integration & Enhanced Features
- ✓ Added PostgreSQL database storage for analysis results
- ✓ Created comprehensive data models for sessions and well results  
- ✓ Implemented analysis history viewing and management
- ✓ Enhanced UI with database-driven history section
- ✓ Fixed JSON serialization issues with numpy data types
- ✓ Added endpoints for session management (view, delete)
- ✓ Integrated filename tracking from frontend uploads
- ✓ Added detailed CFX Manager export instructions
- ✓ Enhanced error handling and CSV parsing validation
- ✓ Successfully tested with 384-well plate data (A1-P21)
- ✓ Fixed CSV parser to handle CFX Manager format with empty first column
- ✓ Auto-detection of cycle column location for variable CSV formats

### June 18, 2025 - Variable Cycle Count Support
- ✓ Removed fixed 40-cycle limitation
- ✓ Added dynamic parameter bounds for curve fitting
- ✓ Enhanced anomaly detection for different run lengths
- ✓ Improved validation for variable-length data
- ✓ Updated UI to display actual cycle ranges

### June 18, 2025 - Initial Setup
- ✓ Created Flask-based web application
- ✓ Implemented sigmoid curve fitting analysis
- ✓ Built responsive frontend interface
- ✓ Added comprehensive CSV upload and validation

## Database Schema

### AnalysisSession Table
- Stores metadata for each analysis run
- Tracks filename, timestamps, summary statistics
- Links to detailed well results

### WellResult Table  
- Stores detailed analysis for each well
- Includes curve parameters, fit quality metrics
- Stores raw data and fitted curves as JSON

## User Preferences

- **Communication style**: Simple, everyday language
- **Deployment priority**: GitHub repository for team sharing and work deployment
- **Testing approach**: Share with specific people for feedback before work deployment
- **Cycle support**: Ensure 30+ cycle compatibility (30, 35, 38, 40, 45+ cycles)
- **Target users**: Laboratory teams using CFX Manager qPCR data
- **Next phase priority**: FDA 21 CFR Part 11 compliance for regulated pharmaceutical/medical device environments

## Planned Features (Next Development Phase)

### FDA 21 CFR Part 11 Compliance
- **User Authentication System**: Secure login with unique user identification
- **Electronic Signatures**: Digital signature capabilities for critical data approval
- **Comprehensive Audit Trail**: Complete tracking of user actions (who, what, when, why)
- **Access Controls**: Role-based permissions (analyst, reviewer, administrator)
- **Enhanced Data Validation**: Advanced input validation and error checking
- **System Documentation**: Formal validation protocols and Standard Operating Procedures
- **Backup/Recovery Procedures**: Validated data backup and recovery systems
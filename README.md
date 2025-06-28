# qPCR S-Curve Analyzer

A web-based qPCR (quantitative Polymerase Chain Reaction) S-Curve analyzer that processes CFX Manager CSV files and performs sophisticated sigmoid curve fitting to identify quality amplification patterns.

## Features

- **Upload CFX Manager CSV files** - Drag and drop interface for easy file handling
- **S-Curve Analysis** - Advanced sigmoid curve fitting using NumPy and SciPy
- **Quality Metrics** - R² score, RMSE, amplitude, steepness, and midpoint calculations
- **Interactive Visualization** - Chart.js powered curve displays
- **Variable Cycle Support** - Handles 30, 35, 38, 40, 45+ cycle runs
- **Anomaly Detection** - Identifies common qPCR curve problems
- **Responsive Design** - Works on desktop and mobile devices

## Recent Updates (June 2025)

✅ **Critical NumPy dependency issue resolved**  
✅ **384-well plate support confirmed**  
✅ **Variable cycle count processing (30-45+ cycles)**  
✅ **Stable deployment configuration**  

## Quick Start

### Railway Deployment
1. Connect your GitHub repository to Railway
2. Set environment variables:
   ```
   FLASK_SECRET_KEY=your-secret-key
   ```
3. Railway will automatically detect and run `simple_app.py`

### Local Development
```bash
# Install dependencies
pip install flask numpy scipy matplotlib scikit-learn pandas

# Run the application
python simple_app.py
```

## Technical Stack

- **Backend**: Flask (Python)
- **Scientific Computing**: NumPy 1.26.4, SciPy 1.13.0
- **Frontend**: Vanilla JavaScript, Chart.js
- **CSV Processing**: PapaParse
- **Analysis**: Sigmoid curve fitting with quality metrics

## Usage

1. **Upload CSV**: Drag and drop CFX Manager exported CSV file
2. **Analyze**: Click "Analyze Data" to process qPCR curves
3. **Review Results**: View quality metrics and curve visualizations
4. **Export**: Download results as CSV format

## Supported Formats

- CFX Manager CSV exports (Bio-Rad)
- Variable cycle counts (30, 35, 38, 40, 45+ cycles)
- 96-well and 384-well plate formats
- RFU (Relative Fluorescence Units) data

## API Endpoints

- `GET /` - Main application interface
- `POST /analyze` - qPCR data analysis
- `GET /health` - System health check
- `GET /sessions` - Analysis history (simplified mode)

## Quality Metrics

The analyzer provides comprehensive quality assessment:

- **R² Score**: Goodness of fit for sigmoid curve
- **RMSE**: Root mean square error
- **Amplitude**: Signal range (max - min RFU)
- **Steepness**: Curve slope parameter
- **Midpoint**: Cycle number at 50% amplitude
- **Anomaly Detection**: Identifies curve problems

## Laboratory Integration

Designed for qPCR laboratory workflows:
- Compatible with Bio-Rad CFX Manager
- Batch processing capabilities
- Quality control metrics
- Export functionality for lab reporting

## License

MIT License - Feel free to use and modify for your laboratory needs.

## Support

For issues or questions, please check the deployment guide or create an issue in the repository.
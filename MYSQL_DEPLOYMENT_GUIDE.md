# MySQL Production Deployment Guide

## Overview
This guide covers deploying the qPCR S-Curve Analyzer to a production MySQL server environment with proper database configuration and quota handling.

## Production Database Configuration

### Environment Variables
Set the following environment variables in your production environment:

```bash
DATABASE_URL=mysql://username:password@hostname:port/database_name
FLASK_SECRET_KEY=your_secure_secret_key_here
FLASK_ENV=production
```

### MySQL Database Setup
1. Create a MySQL database for the application
2. Ensure the MySQL user has the following permissions:
   - CREATE, ALTER, DROP (for initial table creation)
   - SELECT, INSERT, UPDATE, DELETE (for data operations)
   - INDEX (for performance optimization)

### Dependencies Installation
For production deployment, use the MySQL-specific requirements:

```bash
pip install -r requirements-mysql.txt
```

## Database Schema Migration
The application will automatically create tables on first run. For existing deployments:

1. The application uses SQLAlchemy with automatic table creation
2. Tables created: `analysis_sessions` and `well_results`
3. No manual migration required - tables are created automatically

## Production Features

### Quota Handling System
- Graceful degradation when database quotas are exceeded
- Analysis continues even if database save fails
- User-friendly error messages for storage limitations
- Intelligent detection of quota/connection/timeout errors

### Connection Pool Configuration
- Pool size: 10 connections
- Max overflow: 20 connections
- Pool timeout: 30 seconds
- Connection recycling: 300 seconds
- Pre-ping enabled for connection health checks

### Error Handling
The system handles various MySQL-specific errors:
- Connection limits (`max_user_connections`)
- Storage quotas and disk space limitations
- Network timeouts and connection drops
- General database operational errors

## Deployment Steps

1. **Environment Setup**
   ```bash
   export DATABASE_URL="mysql://user:pass@host:port/dbname"
   export FLASK_SECRET_KEY="your-secure-key"
   ```

2. **Install Dependencies**
   ```bash
   pip install -r requirements-mysql.txt
   ```

3. **Database Initialization**
   - Tables are created automatically on first application start
   - No manual schema setup required

4. **Start Application**
   ```bash
   python app.py
   ```

## Monitoring and Troubleshooting

### Database Connection Issues
- Check MySQL server status and connectivity
- Verify user permissions and connection limits
- Monitor connection pool usage in application logs

### Storage Quota Issues
- Application continues to function when quota is exceeded
- Users receive analysis results even if history can't be saved
- Monitor database size and implement cleanup procedures if needed

### Performance Optimization
- Connection pooling reduces database overhead
- Large multi-fluorophore datasets are processed in batches
- Automatic connection recycling prevents long-running connection issues

## Security Considerations

1. **Database Credentials**
   - Use environment variables for sensitive information
   - Never commit database credentials to version control
   - Use strong, unique passwords for MySQL users

2. **Network Security**
   - Enable SSL/TLS for database connections in production
   - Restrict database access to application servers only
   - Use firewall rules to limit database port access

3. **Application Security**
   - Set secure FLASK_SECRET_KEY for session management
   - Enable production mode (FLASK_ENV=production)
   - Configure appropriate logging levels for production

## File Structure for Production
```
project/
├── app.py                    # Main Flask application
├── models.py                 # Database models
├── qpcr_analyzer.py         # Core analysis engine
├── requirements-mysql.txt    # Production dependencies
├── static/                  # Frontend assets
├── templates/               # HTML templates (if any)
└── MYSQL_DEPLOYMENT_GUIDE.md # This guide
```

## Support and Maintenance

### Regular Maintenance
- Monitor database size and performance
- Review connection pool metrics
- Update dependencies regularly for security patches

### Backup Strategy
- Implement regular database backups
- Test backup restoration procedures
- Consider automated backup scheduling

This deployment configuration ensures robust operation in production MySQL environments with proper error handling and graceful degradation when database limitations are encountered.
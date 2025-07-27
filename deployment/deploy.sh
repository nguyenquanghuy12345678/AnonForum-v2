#!/bin/bash

# AnonForum Deployment Script
# Usage: ./deploy.sh [production|staging|development]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default environment
ENVIRONMENT=${1:-production}

echo -e "${BLUE}🚀 Starting AnonForum deployment for ${ENVIRONMENT}...${NC}"

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_warning ".env file not found. Creating from .env.example..."
    cp .env.example .env
    print_warning "Please edit .env file with your actual configuration before continuing."
    read -p "Press Enter to continue after editing .env file..."
fi

# Generate encryption keys if not set
if grep -q "your-32-character-hex-encryption-key-here" .env; then
    print_warning "Generating new encryption key..."
    ENCRYPTION_KEY=$(openssl rand -hex 32)
    sed -i "s/your-32-character-hex-encryption-key-here/${ENCRYPTION_KEY}/g" .env
    print_status "Encryption key generated and updated in .env"
fi

if grep -q "your-unique-salt-for-ip-hashing-2024" .env; then
    print_warning "Generating new IP salt..."
    IP_SALT=$(openssl rand -hex 16)
    sed -i "s/your-unique-salt-for-ip-hashing-2024/${IP_SALT}/g" .env
    print_status "IP salt generated and updated in .env"
fi

# Create necessary directories
print_status "Creating necessary directories..."
mkdir -p logs
mkdir -p backups
mkdir -p ssl

# Set proper permissions
chmod 755 logs backups ssl

# Stop existing containers
print_status "Stopping existing containers..."
docker-compose down --remove-orphans

# Pull latest images
print_status "Pulling latest Docker images..."
docker-compose pull

# Build images
print_status "Building Docker images..."
docker-compose build --no-cache

# Start containers
print_status "Starting containers..."
if [ "$ENVIRONMENT" = "production" ]; then
    docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
elif [ "$ENVIRONMENT" = "staging" ]; then
    docker-compose -f docker-compose.yml -f docker-compose.staging.yml up -d
else
    docker-compose up -d
fi

# Wait for services to be ready
print_status "Waiting for services to be ready..."
sleep 30

# Health check
print_status "Performing health checks..."

# Check MongoDB
if docker-compose exec -T mongodb mongosh --eval "db.adminCommand('ismaster')" > /dev/null 2>&1; then
    print_status "MongoDB is healthy"
else
    print_error "MongoDB health check failed"
    exit 1
fi

# Check Backend API
if curl -f http://localhost:5000/api/health > /dev/null 2>&1; then
    print_status "Backend API is healthy"
else
    print_error "Backend API health check failed"
    exit 1
fi

# Check Frontend
if curl -f http://localhost:3000 > /dev/null 2>&1; then
    print_status "Frontend is healthy"
else
    print_error "Frontend health check failed"
    exit 1
fi

# Setup logrotate for log management
print_status "Setting up log rotation..."
sudo tee /etc/logrotate.d/anonforum > /dev/null <<EOF
/var/lib/docker/containers/*/*.log {
    daily
    missingok
    rotate 7
    compress
    notifempty
    create 0644 root root
    postrotate
        docker kill --signal="USR1" \$(docker ps -q) 2>/dev/null || true
    endscript
}
EOF

# Setup firewall rules (if ufw is available)
if command -v ufw &> /dev/null; then
    print_status "Configuring firewall..."
    sudo ufw allow 22/tcp comment 'SSH'
    sudo ufw allow 80/tcp comment 'HTTP'
    sudo ufw allow 443/tcp comment 'HTTPS'
    sudo ufw --force enable
fi

# Setup SSL certificates (if certbot is available)
if command -v certbot &> /dev/null && [ "$ENVIRONMENT" = "production" ]; then
    print_warning "SSL certificate setup available. Run the following command with your domain:"
    echo "sudo certbot --nginx -d your-domain.com"
fi

# Database initialization
print_status "Initializing database..."
docker-compose exec -T backend node -e "
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
.then(() => {
    console.log('Database connected successfully');
    process.exit(0);
})
.catch(err => {
    console.error('Database connection failed:', err);
    process.exit(1);
});
"

# Create admin user (optional)
if [ "$ENVIRONMENT" = "production" ]; then
    read -p "Do you want to create an admin monitoring account? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Admin account creation would be implemented here..."
        # This would create a special admin account for monitoring
    fi
fi

# Setup monitoring (if requested)
read -p "Do you want to enable monitoring with Prometheus/Grafana? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Starting monitoring stack..."
    docker-compose -f docker-compose.monitoring.yml up -d
    print_status "Monitoring available at http://localhost:3001 (Grafana)"
fi

# Setup backup cron job
print_status "Setting up automatic backups..."
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/anonforum/backup.sh") | crontab -

# Create backup script
cat > backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/anonforum/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
docker-compose exec -T mongodb mongodump --archive=/tmp/backup_$DATE.archive
docker cp anonforum-mongodb:/tmp/backup_$DATE.archive $BACKUP_DIR/

# Cleanup old backups (keep last 7 days)
find $BACKUP_DIR -name "backup_*.archive" -mtime +7 -delete

echo "Backup completed: backup_$DATE.archive"
EOF

chmod +x backup.sh

# Display deployment summary
echo
echo -e "${BLUE}🎉 Deployment completed successfully!${NC}"
echo
echo -e "${GREEN}📊 Service Status:${NC}"
docker-compose ps

echo
echo -e "${GREEN}🔗 Access URLs:${NC}"
echo "Frontend: http://localhost:3000"
echo "Backend API: http://localhost:5000"
if [ "$ENVIRONMENT" = "production" ]; then
    echo "Health Check: http://localhost:5000/api/health"
fi

echo
echo -e "${GREEN}📁 Important Files:${NC}"
echo "Environment config: .env"
echo "Logs directory: ./logs"
echo "Backups directory: ./backups"
echo "SSL certificates: ./ssl"

echo
echo -e "${GREEN}🛡️ Security Reminders:${NC}"
echo "1. Change default passwords in .env file"
echo "2. Enable firewall (ufw enable)"
echo "3. Setup SSL certificates for production"
echo "4. Monitor logs regularly: docker-compose logs -f"
echo "5. Update containers regularly: docker-compose pull && docker-compose up -d"

echo
echo -e "${GREEN}📋 Useful Commands:${NC}"
echo "View logs: docker-compose logs -f [service_name]"
echo "Restart services: docker-compose restart [service_name]"
echo "Update: docker-compose pull && docker-compose up -d"
echo "Backup: ./backup.sh"
echo "Stop all: docker-compose down"

echo
echo -e "${YELLOW}⚠️  Post-deployment checklist:${NC}"
echo "□ Test all functionality (create post, comment, like)"
echo "□ Verify security headers are working"
echo "□ Check SSL certificate (if production)"
echo "□ Monitor resource usage"
echo "□ Setup external monitoring (optional)"
echo "□ Configure backup retention policy"
echo "□ Test backup restoration process"

if [ "$ENVIRONMENT" = "production" ]; then
    echo
    echo -e "${RED}🚨 Production Security Notice:${NC}"
    echo "Make sure to:"
    echo "1. Use strong passwords for all services"
    echo "2. Enable fail2ban for additional protection"
    echo "3. Regular security updates"
    echo "4. Monitor for suspicious activities"
    echo "5. Setup external backup storage"
fi

echo
echo -e "${BLUE}🎯 AnonForum is now running securely!${NC}"
print_status "Deployment script completed successfully"
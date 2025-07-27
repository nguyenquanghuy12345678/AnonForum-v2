# 🕵️ AnonForum - Diễn đàn thảo luận ẩn danh

![AnonForum Logo](https://img.shields.io/badge/AnonForum-v1.0.0-brightgreen)
![Security](https://img.shields.io/badge/Security-A%2B-blue)
![Privacy](https://img.shields.io/badge/Privacy-100%25-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

**AnonForum** là một diễn đàn thảo luận ẩn danh hoàn toàn, được thiết kế với bảo mật và quyền riêng tư làm ưu tiên hàng đầu. Không cần đăng ký, không theo dõi IP, dữ liệu tự xóa sau 7 ngày.

## ✨ Tính năng nổi bật

### 🛡️ Bảo mật tuyệt đối
- ✅ **Không lưu IP** - Hoàn toàn ẩn danh
- ✅ **Không cần đăng ký** - Vào và sử dụng ngay
- ✅ **Mã hóa nội dung** - AES-256-GCM encryption
- ✅ **Tự xóa dữ liệu** - Posts/comments tự động xóa sau 7 ngày
- ✅ **Rate limiting** - Chống spam và DOS attacks
- ✅ **Input sanitization** - Chống XSS, SQL injection
- ✅ **HTTPS enforcement** - Bắt buộc kết nối an toàn

### 💬 Tính năng diễn đàn
- 📝 **Đăng bài ẩn danh** với nhiều chủ đề
- 💬 **Bình luận ẩn danh** - Mỗi comment có ID riêng
- 👍 **Like posts** - Tương tác không cần đăng nhập
- 🏷️ **Tag system** - Phân loại và tìm kiếm dễ dàng
- 🔄 **Real-time updates** - Cập nhật số liệu trực tiếp
- 📱 **Responsive design** - Tối ưu mobile

### 🎨 Giao diện hiện đại
- 🌙 **Dark theme** với glassmorphism
- ✨ **Smooth animations** - Hiệu ứng mượt mà
- 🎯 **Intuitive UX** - Dễ sử dụng cho mọi người
- ⚡ **Fast loading** - Tối ưu hiệu suất

## 🚀 Cài đặt nhanh

### Yêu cầu hệ thống
- **Docker** >= 20.0
- **Docker Compose** >= 2.0
- **Node.js** >= 16.0 (nếu chạy local)
- **MongoDB** >= 5.0 (nếu chạy local)

### 1. Clone repository
```bash
git clone https://github.com/your-username/anonforum.git
cd anonforum
```

### 2. Cấu hình môi trường
```bash
cp .env.example .env
# Chỉnh sửa .env với cấu hình của bạn
nano .env
```

### 3. Deploy với Docker (Khuyến nghị)
```bash
chmod +x deployment/deploy.sh
./deployment/deploy.sh production
```

### 4. Truy cập ứng dụng
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **Health Check**: http://localhost:5000/api/health

## 🏗️ Kiến trúc hệ thống

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     Frontend    │    │     Backend     │    │    Database     │
│                 │    │                 │    │                 │
│   React/HTML    │◄──►│   Node.js       │◄──►│    MongoDB      │
│   TailwindCSS   │    │   Express       │    │    Encrypted    │
│   JavaScript    │    │   Security++    │    │    Auto-cleanup │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │     Nginx       │
                    │   Load Balancer │
                    │   SSL/TLS       │
                    └─────────────────┘
```

## 📁 Cấu trúc dự án

```
anonforum/
├── 📁 frontend/                 # Giao diện người dùng
│   ├── index.html              # Trang chính
│   ├── css/                    # Stylesheets
│   ├── js/                     # JavaScript logic
│   └── assets/                 # Hình ảnh, icons
│
├── 📁 backend/                  # Server API
│   ├── server.js               # Entry point
│   ├── routes/                 # API endpoints
│   ├── models/                 # Database models
│   ├── middleware/             # Security middleware
│   └── utils/                  # Utilities
│
├── 📁 database/                 # Database setup
├── 📁 docker/                  # Docker configurations
├── 📁 deployment/              # Deployment scripts
├── 📁 security/                # Security configs
└── 📁 docs/                    # Documentation
```

## 🔧 Cấu hình chi tiết

### Environment Variables
```bash
# Server
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb://localhost:27017/anonforum

# Security (QUAN TRỌNG: Thay đổi các key này!)
ENCRYPTION_KEY=your-32-character-hex-key
IP_SALT=your-unique-salt-2024

# Rate Limiting
RATE_LIMIT_WINDOW=900000       # 15 minutes
RATE_LIMIT_MAX=100             # 100 requests per window
POST_RATE_LIMIT=5              # 5 posts per 5 minutes
COMMENT_RATE_LIMIT=10          # 10 comments per minute
```

### Nginx Configuration
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    
    location / {
        proxy_pass http://frontend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location /api {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://backend:5000;
    }
}
```

## 🛡️ Bảo mật

### Các biện pháp bảo mật đã triển khai:

1. **Input Validation & Sanitization**
   - DOMPurify cho client-side
   - express-validator cho server-side
   - Regex validation patterns

2. **Rate Limiting**
   - Global: 100 requests/15 minutes
   - Posts: 5 posts/5 minutes  
   - Comments: 10 comments/minute
   - IP-based với hashing

3. **Content Security Policy**
   ```javascript
   helmet({
     contentSecurityPolicy: {
       directives: {
         defaultSrc: ["'self'"],
         scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
         styleSrc: ["'self'", "'unsafe-inline'"],
         imgSrc: ["'self'", "data:", "https:"]
       }
     }
   })
   ```

4. **Data Encryption**
   - AES-256-GCM cho nội dung posts/comments
   - SHA-256 cho IP hashing
   - Bcrypt cho passwords (nếu có admin)

5. **Auto-cleanup**
   - Posts tự xóa sau 7 ngày
   - Comments kế thừa expiry từ post
   - Cron job cleanup hàng giờ

### Security Headers
```javascript
// Tự động set bởi Helmet.js
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000
Referrer-Policy: strict-origin-when-cross-origin
```

## 📊 Monitoring & Logs

### Health Checks
```bash
# Backend health
curl http://localhost:5000/api/health

# Response
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "memory": {
    "used": "45.2MB",
    "total": "512MB"
  }
}
```

### Logs
```bash
# View all logs
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f mongodb
```

### Metrics
- **Response time**: < 100ms average
- **Memory usage**: < 512MB per service
- **Database size**: Auto-cleanup keeps it minimal
- **Active connections**: Real-time counter

## 🚀 Deployment

### Development
```bash
# Clone và setup
git clone <repo>
cd anonforum
npm install

# Start development
npm run dev
```

### Staging
```bash
./deployment/deploy.sh staging
```

### Production
```bash
# Full production deployment với SSL
./deployment/deploy.sh production

# Manual steps cho production:
# 1. Setup domain DNS
# 2. Configure SSL certificates
# 3. Setup external monitoring
# 4. Configure backup storage
```

### Docker Commands
```bash
# Start services
docker-compose up -d

# View status
docker-compose ps

# Update services
docker-compose pull
docker-compose up -d --build

# Backup database
./backup.sh

# View resource usage
docker stats
```

## 🔄 Backup & Recovery

### Automatic Backup
```bash
# Cron job tự động (daily 2AM)
0 2 * * * /opt/anonforum/backup.sh
```

### Manual Backup
```bash
# Database backup
docker-compose exec mongodb mongodump --archive=/tmp/backup.archive

# Copy to host
docker cp anonforum-mongodb:/tmp/backup.archive ./backups/

# Restore
docker-compose exec mongodb mongorestore --archive=/tmp/backup.archive
```

## 🧪 Testing

### API Testing
```bash
# Health check
curl -X GET http://localhost:5000/api/health

# Get posts
curl -X GET http://localhost:5000/api/posts

# Create post
curl -X POST http://localhost:5000/api/posts \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","content":"Test content","category":"general"}'
```

### Load Testing
```bash
# Using Apache Bench
ab -n 1000 -c 10 http://localhost:5000/api/posts

# Using wrk
wrk -t4 -c100 -d30s --timeout 2s http://localhost:5000/api/posts
```

## 🤝 Đóng góp

### Development Setup
```bash
# Fork repository
git clone https://github.com/your-username/anonforum.git
cd anonforum

# Create feature branch  
git checkout -b feature/your-feature

# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Submit PR
git push origin feature/your-feature
```

### Code Style
- **ESLint** cho JavaScript
- **Prettier** để format code
- **Conventional Commits** cho commit messages

### Pull Request Process
1. Fork repository
2. Create feature branch
3. Write tests cho new features
4. Ensure all tests pass
5. Update documentation
6. Submit pull request

## 📄 License

MIT License - xem [LICENSE](LICENSE) file để biết chi tiết.

## 🆘 Hỗ trợ

### Báo lỗi
- **GitHub Issues**: [Report bugs](https://github.com/your-username/anonforum/issues)
- **Security Issues**: Email security@your-domain.com

### FAQ

**Q: Có thể truy vết người dùng không?**
A: Không. Chúng tôi không lưu IP, không có cookies tracking, và dữ liệu tự xóa sau 7 ngày.

**Q: Dữ liệu có được backup không?**
A: Có backup tự động, nhưng chỉ để khôi phục hệ thống. Dữ liệu user vẫn tự xóa sau 7 ngày.

**Q: Có thể self-host không?**
A: Có, hoàn toàn open-source và có thể deploy trên server riêng.

**Q: Tại sao cần mã hóa nội dung?**
A: Để bảo vệ thêm một lớp nữa, ngay cả admin cũng không thể đọc nội dung thô.

### Community
- **Discord**: [Join our community](https://discord.gg/anonforum)
- **Telegram**: [@anonforum_support](https://t.me/anonforum_support)

---

<div align="center">

**🕵️ AnonForum - Nơi suy nghĩ được tự do, danh tính được bảo vệ**

Made with ❤️ for privacy and free speech

[⭐ Star](https://github.com/your-username/anonforum) • [🐦 Follow](https://twitter.com/anonforum) • [📧 Contact](mailto:hello@your-domain.com)

</div>
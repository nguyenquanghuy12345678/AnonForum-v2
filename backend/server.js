const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const mongoose = require('mongoose');
const cron = require('node-cron');
require('dotenv').config();

const logger = require('./utils/logger');
const securityMiddleware = require('./middleware/security');
const cleanupService = require('./utils/cleanup');

// Import routes
const postsRoutes = require('./routes/posts');
const commentsRoutes = require('./routes/comments');
const healthRoutes = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: false, // No cookies for anonymity
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Accept']
}));

// Compression
app.use(compression());

// Rate limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/api/health';
  }
});

const postLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // limit to 5 posts per 5 minutes
  message: {
    error: 'Too many posts created, please wait before posting again.'
  }
});

const commentLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // limit to 10 comments per minute
  message: {
    error: 'Too many comments, please slow down.'
  }
});

// Slow down middleware
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 50, // allow 50 requests per windowMs without delay
  delayMs: 500 // add 500ms delay per request after delayAfter
});

app.use('/api', globalLimiter, speedLimiter);

// Body parsing with size limits
app.use(express.json({ 
  limit: '10kb',
  strict: true
}));
app.use(express.urlencoded({ 
  extended: false,
  limit: '10kb'
}));

// Security middleware
app.use(securityMiddleware.sanitizeInput);
app.use(securityMiddleware.validateRequest);

// Logging
const morgan = require('morgan');
app.use(morgan('combined', { 
  stream: { write: message => logger.info(message.trim()) }
}));

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/anonforum', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  logger.info('Connected to MongoDB');
})
.catch((error) => {
  logger.error('MongoDB connection error:', error);
  process.exit(1);
});

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/posts/:postId/comments', commentLimiter, commentsRoutes);

// Apply post limiter specifically to POST requests
app.use('/api/posts', (req, res, next) => {
  if (req.method === 'POST') {
    return postLimiter(req, res, next);
  }
  next();
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('../frontend'));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  });
}

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  // Don't leak error details in production
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : error.message;

  res.status(error.status || 500).json({
    error: message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    timestamp: new Date().toISOString()
  });
});

// Cleanup job - run every hour
cron.schedule('0 * * * *', () => {
  logger.info('Running cleanup job...');
  cleanupService.cleanupExpiredPosts();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  mongoose.connection.close(() => {
    logger.info('MongoDB connection closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  mongoose.connection.close(() => {
    logger.info('MongoDB connection closed');
    process.exit(0);
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`AnonForum backend running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
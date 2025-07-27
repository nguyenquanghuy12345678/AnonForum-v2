const { body, validationResult } = require('express-validator');
const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

// Initialize DOMPurify with jsdom
const window = new JSDOM('').window;
const purify = DOMPurify(window);

// Content sanitization
const sanitizeInput = (req, res, next) => {
  try {
    // Sanitize all string inputs
    const sanitizeObject = (obj) => {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          // Remove HTML tags and potentially dangerous characters
          obj[key] = purify.sanitize(obj[key], { 
            ALLOWED_TAGS: [], 
            ALLOWED_ATTR: [] 
          });
          
          // Additional cleaning
          obj[key] = obj[key]
            .replace(/[<>]/g, '') // Remove remaining < >
            .replace(/javascript:/gi, '') // Remove javascript: protocol
            .replace(/data:/gi, '') // Remove data: protocol
            .replace(/vbscript:/gi, '') // Remove vbscript: protocol
            .trim();
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObject(obj[key]);
        }
      }
    };

    if (req.body) sanitizeObject(req.body);
    if (req.query) sanitizeObject(req.query);
    if (req.params) sanitizeObject(req.params);

    next();
  } catch (error) {
    logger.error('Sanitization error:', error);
    res.status(400).json({ error: 'Invalid input data' });
  }
};

// Request validation
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('Validation failed:', {
      errors: errors.array(),
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.param,
        message: err.msg
      }))
    });
  }
  next();
};

// Post validation rules
const postValidationRules = () => {
  return [
    body('title')
      .isLength({ min: 3, max: 200 })
      .withMessage('Title must be between 3 and 200 characters')
      .matches(/^[a-zA-Z0-9\s\u00C0-\u017F\u1EA0-\u1EF9.,!?()-]+$/)
      .withMessage('Title contains invalid characters'),
    
    body('content')
      .isLength({ min: 10, max: 5000 })
      .withMessage('Content must be between 10 and 5000 characters')
      .custom((value) => {
        // Check for potential spam patterns
        const spamPatterns = [
          /(.)\1{10,}/, // Repeated characters
          /(https?:\/\/[^\s]+){3,}/, // Multiple URLs
          /[A-Z]{20,}/, // All caps spam
          /(\b\w+\b\s*){1,3}\1{5,}/ // Repeated words
        ];
        
        for (const pattern of spamPatterns) {
          if (pattern.test(value)) {
            throw new Error('Content appears to be spam');
          }
        }
        return true;
      }),
    
    body('category')
      .isIn(['general', 'tech', 'crypto', 'society', 'random', 'confession', 'question'])
      .withMessage('Invalid category'),
    
    body('tags')
      .optional()
      .isArray({ max: 5 })
      .withMessage('Maximum 5 tags allowed')
      .custom((tags) => {
        if (tags && Array.isArray(tags)) {
          for (const tag of tags) {
            if (typeof tag !== 'string' || tag.length > 50) {
              throw new Error('Each tag must be a string with maximum 50 characters');
            }
            if (!/^[a-zA-Z0-9\u00C0-\u017F\u1EA0-\u1EF9\s-]+$/.test(tag)) {
              throw new Error('Tags contain invalid characters');
            }
          }
        }
        return true;
      })
  ];
};

// Comment validation rules
const commentValidationRules = () => {
  return [
    body('content')
      .isLength({ min: 1, max: 2000 })
      .withMessage('Comment must be between 1 and 2000 characters')
      .custom((value) => {
        // Check for spam patterns
        const spamPatterns = [
          /(.)\1{10,}/,
          /(https?:\/\/[^\s]+){2,}/,
          /[A-Z]{15,}/
        ];
        
        for (const pattern of spamPatterns) {
          if (pattern.test(value)) {
            throw new Error('Comment appears to be spam');
          }
        }
        return true;
      })
  ];
};

// IP-based rate limiting for anonymous users
const createIPRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    keyGenerator: (req) => {
      // Use a combination of IP and User-Agent for better rate limiting
      const crypto = require('crypto');
      const identifier = req.ip + (req.get('User-Agent') || '');
      return crypto.createHash('sha256').update(identifier).digest('hex');
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded:', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method
      });
      
      res.status(429).json({
        error: message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });
};

// Content filtering for inappropriate content
const contentFilter = (req, res, next) => {
  const checkContent = (text) => {
    if (!text) return true;
    
    // Basic profanity and inappropriate content detection
    const inappropriatePatterns = [
      // Add patterns for content you want to filter
      /\b(spam|scam|fake)\b/gi,
      /\b(buy now|click here|urgent)\b/gi,
      // Add more patterns as needed
    ];
    
    for (const pattern of inappropriatePatterns) {
      if (pattern.test(text)) {
        return false;
      }
    }
    return true;
  };

  try {
    const title = req.body.title;
    const content = req.body.content;

    if (!checkContent(title) || !checkContent(content)) {
      logger.warn('Inappropriate content detected:', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        title: title?.substring(0, 50),
        content: content?.substring(0, 100)
      });
      
      return res.status(400).json({
        error: 'Content violates community guidelines'
      });
    }

    next();
  } catch (error) {
    logger.error('Content filter error:', error);
    next();
  }
};

// Security headers middleware
const securityHeaders = (req, res, next) => {
  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Remove server information
  res.removeHeader('X-Powered-By');
  
  next();
};

// Request size limiter
const requestSizeLimiter = (req, res, next) => {
  const contentLength = req.get('Content-Length');
  const maxSize = 50 * 1024; // 50KB max request size
  
  if (contentLength && parseInt(contentLength) > maxSize) {
    logger.warn('Request too large:', {
      size: contentLength,
      ip: req.ip,
      path: req.path
    });
    
    return res.status(413).json({
      error: 'Request too large'
    });
  }
  
  next();
};

// Suspicious activity detector
const suspiciousActivityDetector = (req, res, next) => {
  const suspicious = [
    // Check for common attack patterns
    /union\s+select/gi,
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /onload\s*=/gi,
    /onerror\s*=/gi
  ];

  const checkSuspicious = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        for (const pattern of suspicious) {
          if (pattern.test(obj[key])) {
            return true;
          }
        }
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        if (checkSuspicious(obj[key])) return true;
      }
    }
    return false;
  };

  if (checkSuspicious(req.body) || checkSuspicious(req.query)) {
    logger.error('Suspicious activity detected:', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method,
      body: JSON.stringify(req.body).substring(0, 200),
      query: JSON.stringify(req.query)
    });
    
    return res.status(403).json({
      error: 'Suspicious activity detected'
    });
  }

  next();
};

module.exports = {
  sanitizeInput,
  validateRequest,
  postValidationRules,
  commentValidationRules,
  createIPRateLimiter,
  contentFilter,
  securityHeaders,
  requestSizeLimiter,
  suspiciousActivityDetector
};
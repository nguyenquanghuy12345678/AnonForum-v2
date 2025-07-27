const mongoose = require('mongoose');
const crypto = require('crypto');

const postSchema = new mongoose.Schema({
  // Anonymous identifier (not tied to user)
  anonId: {
    type: String,
    required: true,
    index: true
  },
  
  // Post content (encrypted)
  title: {
    type: String,
    required: true,
    maxlength: 200,
    trim: true
  },
  
  content: {
    type: String,
    required: true,
    maxlength: 5000
  },
  
  // Metadata
  category: {
    type: String,
    required: true,
    enum: ['general', 'tech', 'crypto', 'society', 'random', 'confession', 'question'],
    default: 'general'
  },
  
  tags: [{
    type: String,
    maxlength: 50,
    trim: true
  }],
  
  // Engagement
  likes: {
    type: Number,
    default: 0,
    min: 0
  },
  
  commentCount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Security & Privacy
  ipHash: {
    type: String,
    required: true,
    index: true
  },
  
  userAgent: {
    type: String,
    maxlength: 500
  },
  
  // Auto-deletion
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  
  // Status
  isDeleted: {
    type: Boolean,
    default: false
  },
  
  deletedAt: {
    type: Date
  },
  
  // Content moderation
  isFlagged: {
    type: Boolean,
    default: false
  },
  
  flagCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  versionKey: false
});

// Indexes for performance
postSchema.index({ createdAt: -1 });
postSchema.index({ category: 1, createdAt: -1 });
postSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
postSchema.index({ isDeleted: 1, createdAt: -1 });

// Static methods
postSchema.statics.generateAnonId = function() {
  const prefixes = ['Anon', 'Ghost', 'Shadow', 'Phantom', 'Mystery', 'Unknown', 'Cipher', 'Void'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const number = Math.floor(Math.random() * 9999) + 1000;
  return `${prefix}${number}`;
};

postSchema.statics.hashIP = function(ip) {
  // Hash IP with salt for privacy while allowing rate limiting
  const salt = process.env.IP_SALT || 'anonforum-salt-2024';
  return crypto.createHash('sha256').update(ip + salt).digest('hex');
};

postSchema.statics.encryptContent = function(content) {
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex'), 'hex');
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipher(algorithm, key);
  cipher.setAAD(Buffer.from('anonforum', 'utf8'));
  
  let encrypted = cipher.update(content, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    content: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
};

postSchema.statics.decryptContent = function(encryptedData) {
  try {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex'), 'hex');
    
    const decipher = crypto.createDecipher(algorithm, key);
    decipher.setAAD(Buffer.from('anonforum', 'utf8'));
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.content, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    return '[Content could not be decrypted]';
  }
};

// Instance methods
postSchema.methods.incrementLikes = function() {
  this.likes += 1;
  return this.save();
};

postSchema.methods.incrementComments = function() {
  this.commentCount += 1;
  return this.save();
};

postSchema.methods.decrementComments = function() {
  if (this.commentCount > 0) {
    this.commentCount -= 1;
  }
  return this.save();
};

postSchema.methods.softDelete = function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

postSchema.methods.flag = function() {
  this.flagCount += 1;
  if (this.flagCount >= 5) {
    this.isFlagged = true;
  }
  return this.save();
};

// Pre-save middleware
postSchema.pre('save', function(next) {
  // Set expiration date if not set (7 days from creation)
  if (!this.expiresAt) {
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    this.expiresAt = new Date(Date.now() + sevenDays);
  }
  
  // Generate anonymous ID if not set
  if (!this.anonId) {
    this.anonId = this.constructor.generateAnonId();
  }
  
  next();
});

// Virtual for time until expiration
postSchema.virtual('timeUntilExpiry').get(function() {
  if (!this.expiresAt) return null;
  
  const now = new Date();
  const timeLeft = this.expiresAt - now;
  
  if (timeLeft <= 0) return 'Expired';
  
  const days = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
  const hours = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  
  if (days > 0) return `${days} ngày`;
  if (hours > 0) return `${hours} giờ`;
  return 'Dưới 1 giờ';
});

// Transform output
postSchema.set('toJSON', {
  transform: function(doc, ret) {
    // Remove sensitive data
    delete ret.ipHash;
    delete ret.userAgent;
    delete ret.__v;
    
    // Add virtual fields
    ret.timeUntilExpiry = doc.timeUntilExpiry;
    
    return ret;
  }
});

module.exports = mongoose.model('Post', postSchema);
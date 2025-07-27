const mongoose = require('mongoose');
const crypto = require('crypto');

const commentSchema = new mongoose.Schema({
  // Reference to parent post
  postId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: true,
    index: true
  },
  
  // Anonymous identifier
  anonId: {
    type: String,
    required: true
  },
  
  // Comment content (encrypted)
  content: {
    type: String,
    required: true,
    maxlength: 2000
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
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // Auto-deletion (inherits from parent post)
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
  
  // Moderation
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

// Indexes
commentSchema.index({ postId: 1, createdAt: 1 });
commentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
commentSchema.index({ isDeleted: 1, createdAt: -1 });

// Static methods
commentSchema.statics.generateAnonId = function() {
  const prefixes = ['Anon', 'Ghost', 'Shadow', 'Phantom', 'Mystery', 'Unknown', 'Cipher', 'Void'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const number = Math.floor(Math.random() * 9999) + 1000;
  return `${prefix}${number}`;
};

commentSchema.statics.hashIP = function(ip) {
  const salt = process.env.IP_SALT || 'anonforum-salt-2024';
  return crypto.createHash('sha256').update(ip + salt).digest('hex');
};

commentSchema.statics.encryptContent = function(content) {
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

commentSchema.statics.decryptContent = function(encryptedData) {
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
commentSchema.methods.softDelete = function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

commentSchema.methods.flag = function() {
  this.flagCount += 1;
  if (this.flagCount >= 3) { // Lower threshold for comments
    this.isFlagged = true;
  }
  return this.save();
};

// Pre-save middleware
commentSchema.pre('save', function(next) {
  // Generate anonymous ID if not set
  if (!this.anonId) {
    this.anonId = this.constructor.generateAnonId();
  }
  
  // Set expiration date to match parent post if not set
  if (!this.expiresAt && this.postId) {
    const Post = mongoose.model('Post');
    Post.findById(this.postId)
      .then(post => {
        if (post) {
          this.expiresAt = post.expiresAt;
        }
        next();
      })
      .catch(next);
  } else {
    next();
  }
});

// Post-save middleware to update parent post comment count
commentSchema.post('save', function() {
  const Post = mongoose.model('Post');
  Post.findById(this.postId)
    .then(post => {
      if (post && !this.isDeleted) {
        post.incrementComments();
      }
    })
    .catch(console.error);
});

// Post-remove middleware to update parent post comment count
commentSchema.post('remove', function() {
  const Post = mongoose.model('Post');
  Post.findById(this.postId)
    .then(post => {
      if (post) {
        post.decrementComments();
      }
    })
    .catch(console.error);
});

// Transform output
commentSchema.set('toJSON', {
  transform: function(doc, ret) {
    // Remove sensitive data
    delete ret.ipHash;
    delete ret.userAgent;
    delete ret.__v;
    
    return ret;
  }
});

module.exports = mongoose.model('Comment', commentSchema);
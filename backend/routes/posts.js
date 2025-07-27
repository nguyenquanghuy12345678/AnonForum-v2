const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const logger = require('../utils/logger');
const security = require('../middleware/security');

// Get all posts with pagination and filtering
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    
    const category = req.query.category;
    const sortBy = req.query.sort || 'createdAt';
    const sortOrder = req.query.order === 'asc' ? 1 : -1;
    
    // Build query
    const query = {
      isDeleted: false,
      isFlagged: false,
      expiresAt: { $gt: new Date() }
    };
    
    if (category && category !== 'all') {
      query.category = category;
    }
    
    // Validate sort field
    const allowedSortFields = ['createdAt', 'likes', 'commentCount'];
    const finalSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    
    const posts = await Post.find(query)
      .sort({ [finalSortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();
    
    const total = await Post.countDocuments(query);
    
    // Decrypt content for response
    const decryptedPosts = posts.map(post => ({
      ...post,
      content: Post.decryptContent(post.content),
      totalPages: Math.ceil(total / limit),
      currentPage: page
    }));
    
    res.json({
      posts: decryptedPosts,
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      total
    });
    
  } catch (error) {
    logger.error('Error fetching posts:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Get single post with comments
router.get('/:id', async (req, res) => {
  try {
    const postId = req.params.id;
    
    // Validate ObjectId format
    if (!postId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid post ID format' });
    }
    
    const post = await Post.findOne({
      _id: postId,
      isDeleted: false,
      isFlagged: false,
      expiresAt: { $gt: new Date() }
    }).lean();
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found or expired' });
    }
    
    // Get comments for this post
    const comments = await Comment.find({
      postId: postId,
      isDeleted: false,
      isFlagged: false,
      expiresAt: { $gt: new Date() }
    })
    .sort({ createdAt: 1 })
    .limit(100)
    .lean();
    
    // Decrypt content
    const decryptedPost = {
      ...post,
      content: Post.decryptContent(post.content)
    };
    
    const decryptedComments = comments.map(comment => ({
      ...comment,
      content: Comment.decryptContent(comment.content)
    }));
    
    res.json({
      post: decryptedPost,
      comments: decryptedComments
    });
    
  } catch (error) {
    logger.error('Error fetching post:', error);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

// Create new post
router.post('/', [
  security.requestSizeLimiter,
  security.suspiciousActivityDetector,
  ...security.postValidationRules(),
  security.validateRequest,
  security.contentFilter
], async (req, res) => {
  try {
    const { title, content, category, tags } = req.body;
    
    // Get client IP (considering proxy headers)
    const clientIP = req.headers['x-forwarded-for'] || 
                    req.headers['x-real-ip'] || 
                    req.connection.remoteAddress || 
                    req.socket.remoteAddress || 
                    req.ip;
    
    // Create encrypted content
    const encryptedContent = Post.encryptContent(content);
    
    const newPost = new Post({
      title,
      content: encryptedContent,
      category,
      tags: tags || [],
      ipHash: Post.hashIP(clientIP),
      userAgent: req.get('User-Agent'),
      anonId: Post.generateAnonId()
    });
    
    const savedPost = await newPost.save();
    
    logger.info('New post created:', {
      postId: savedPost._id,
      category: savedPost.category,
      ipHash: savedPost.ipHash.substring(0, 8) + '...'
    });
    
    // Return post without sensitive data
    const responsePost = savedPost.toJSON();
    responsePost.content = content; // Return original content for immediate display
    
    res.status(201).json({
      message: 'Post created successfully',
      post: responsePost
    });
    
  } catch (error) {
    logger.error('Error creating post:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation failed',
        details: Object.values(error.errors).map(err => err.message)
      });
    }
    
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Like a post
router.post('/:id/like', [
  security.createIPRateLimiter(60 * 1000, 10, 'Too many likes, please slow down')
], async (req, res) => {
  try {
    const postId = req.params.id;
    
    if (!postId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid post ID format' });
    }
    
    const post = await Post.findOne({
      _id: postId,
      isDeleted: false,
      isFlagged: false,
      expiresAt: { $gt: new Date() }
    });
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found or expired' });
    }
    
    await post.incrementLikes();
    
    res.json({
      message: 'Post liked successfully',
      likes: post.likes
    });
    
  } catch (error) {
    logger.error('Error liking post:', error);
    res.status(500).json({ error: 'Failed to like post' });
  }
});

// Flag a post for moderation
router.post('/:id/flag', [
  security.createIPRateLimiter(5 * 60 * 1000, 3, 'Too many flags, please wait')
], async (req, res) => {
  try {
    const postId = req.params.id;
    
    if (!postId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid post ID format' });
    }
    
    const post = await Post.findOne({
      _id: postId,
      isDeleted: false,
      expiresAt: { $gt: new Date() }
    });
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found or expired' });
    }
    
    await post.flag();
    
    logger.info('Post flagged:', {
      postId: post._id,
      flagCount: post.flagCount,
      isFlagged: post.isFlagged
    });
    
    res.json({
      message: 'Post flagged for review',
      flagged: post.isFlagged
    });
    
  } catch (error) {
    logger.error('Error flagging post:', error);
    res.status(500).json({ error: 'Failed to flag post' });
  }
});

// Get posts by category
router.get('/category/:category', async (req, res) => {
  try {
    const category = req.params.category;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    
    const validCategories = ['general', 'tech', 'crypto', 'society', 'random', 'confession', 'question'];
    
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    
    const posts = await Post.find({
      category,
      isDeleted: false,
      isFlagged: false,
      expiresAt: { $gt: new Date() }
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
    
    const total = await Post.countDocuments({
      category,
      isDeleted: false,
      isFlagged: false,
      expiresAt: { $gt: new Date() }
    });
    
    const decryptedPosts = posts.map(post => ({
      ...post,
      content: Post.decryptContent(post.content)
    }));
    
    res.json({
      posts: decryptedPosts,
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      category,
      total
    });
    
  } catch (error) {
    logger.error('Error fetching posts by category:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Get forum statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const now = new Date();
    const stats = await Promise.all([
      Post.countDocuments({ 
        isDeleted: false, 
        expiresAt: { $gt: now } 
      }),
      Comment.countDocuments({ 
        isDeleted: false, 
        expiresAt: { $gt: now } 
      }),
      Post.countDocuments({ 
        isDeleted: false, 
        expiresAt: { $gt: now },
        createdAt: { $gte: new Date(now - 24 * 60 * 60 * 1000) }
      }),
      Post.find({ 
        isDeleted: false, 
        expiresAt: { $gt: now } 
      }).distinct('category')
    ]);
    
    res.json({
      totalPosts: stats[0],
      totalComments: stats[1],
      postsToday: stats[2],
      activeCategories: stats[3].length,
      lastUpdated: now.toISOString()
    });
    
  } catch (error) {
    logger.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

module.exports = router;
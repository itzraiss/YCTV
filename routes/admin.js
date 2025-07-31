const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const User = require('../models/User');
const Media = require('../models/Media');
const auth = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Admin authentication middleware
const adminAuth = async (req, res, next) => {
  try {
    // First check regular authentication
    await auth(req, res, () => {});
    
    // Check if user is admin (you might want to add an isAdmin field to User model)
    // For now, check if user email is in admin list
    const adminEmails = process.env.ADMIN_EMAILS?.split(',') || [];
    
    if (!adminEmails.includes(req.user.email)) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }
};

// All routes require admin authentication
router.use(adminAuth);

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// @route   GET /api/admin/dashboard
// @desc    Get admin dashboard stats
// @access  Admin
router.get('/dashboard', async (req, res) => {
  try {
    // Get various statistics
    const [
      totalUsers,
      activeUsers,
      totalMedia,
      activeMedia,
      totalSubscriptions
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      Media.countDocuments(),
      Media.countDocuments({ isActive: true }),
      User.countDocuments({ 'subscription.status': 'active', 'subscription.plan': { $ne: 'free' } })
    ]);

    // Get user registrations in last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const newUsers = await User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });

    // Get subscription revenue (simplified calculation)
    const subscriptionUsers = await User.find({
      'subscription.status': 'active',
      'subscription.plan': { $ne: 'free' }
    }).select('subscription.plan');

    const planPrices = { basic: 7.99, premium: 12.99, family: 16.99 };
    const monthlyRevenue = subscriptionUsers.reduce((total, user) => {
      return total + (planPrices[user.subscription.plan] || 0);
    }, 0);

    res.json({
      success: true,
      data: {
        stats: {
          users: {
            total: totalUsers,
            active: activeUsers,
            newThisMonth: newUsers
          },
          media: {
            total: totalMedia,
            active: activeMedia
          },
          subscriptions: {
            total: totalSubscriptions,
            monthlyRevenue: Math.round(monthlyRevenue * 100) / 100
          }
        }
      }
    });

  } catch (error) {
    logger.error('Admin dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching dashboard data'
    });
  }
});

// @route   GET /api/admin/users
// @desc    Get all users with pagination
// @access  Admin
router.get('/users', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString(),
  query('status').optional().isIn(['active', 'inactive']),
  query('plan').optional().isIn(['free', 'basic', 'premium', 'family'])
], handleValidationErrors, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      plan
    } = req.query;

    // Build query
    const query = {};
    
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { displayName: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status === 'active') query.isActive = true;
    if (status === 'inactive') query.isActive = false;
    if (plan) query['subscription.plan'] = plan;

    // Execute query
    const users = await User.find(query)
      .select('email displayName isActive subscription createdAt lastLogin totalWatchTime')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    logger.error('Admin users fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching users'
    });
  }
});

// @route   PUT /api/admin/users/:userId/status
// @desc    Update user status (activate/deactivate)
// @access  Admin
router.put('/users/:userId/status', [
  param('userId').isMongoId().withMessage('Invalid user ID'),
  body('isActive').isBoolean().withMessage('isActive must be a boolean')
], handleValidationErrors, async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.isActive = isActive;
    await user.save();

    logger.info(`Admin ${req.user._id} ${isActive ? 'activated' : 'deactivated'} user ${userId}`);

    res.json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: { user: { id: user._id, email: user.email, isActive: user.isActive } }
    });

  } catch (error) {
    logger.error('User status update error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating user status'
    });
  }
});

// @route   GET /api/admin/media
// @desc    Get all media with admin details
// @access  Admin
router.get('/media', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString(),
  query('type').optional().isIn(['movie', 'series', 'anime', 'cartoon', 'game', 'documentary']),
  query('status').optional().isIn(['active', 'inactive'])
], handleValidationErrors, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      type,
      status
    } = req.query;

    // Build query
    const query = {};
    
    if (search) {
      query.$text = { $search: search };
    }
    
    if (type) query.type = type;
    if (status === 'active') query.isActive = true;
    if (status === 'inactive') query.isActive = false;

    // Execute query
    const media = await Media.find(query)
      .populate('createdBy', 'displayName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Media.countDocuments(query);

    res.json({
      success: true,
      data: {
        media,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    logger.error('Admin media fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching media'
    });
  }
});

// @route   POST /api/admin/media
// @desc    Create new media
// @access  Admin
router.post('/media', [
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title must be between 1 and 200 characters'),
  body('type').isIn(['movie', 'series', 'anime', 'cartoon', 'game', 'documentary']).withMessage('Invalid media type'),
  body('genre').isArray({ min: 1 }).withMessage('At least one genre is required'),
  body('year').isInt({ min: 1900, max: new Date().getFullYear() + 5 }).withMessage('Invalid year'),
  body('poster').isURL().withMessage('Poster must be a valid URL'),
  body('description').optional().isLength({ max: 2000 }).withMessage('Description too long')
], handleValidationErrors, async (req, res) => {
  try {
    const mediaData = {
      ...req.body,
      createdBy: req.user._id
    };

    const media = new Media(mediaData);
    await media.save();

    logger.info(`Admin ${req.user._id} created new media: ${media.title}`);

    res.status(201).json({
      success: true,
      message: 'Media created successfully',
      data: { media }
    });

  } catch (error) {
    logger.error('Media creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while creating media'
    });
  }
});

// @route   PUT /api/admin/media/:mediaId
// @desc    Update media
// @access  Admin
router.put('/media/:mediaId', [
  param('mediaId').isMongoId().withMessage('Invalid media ID'),
  body('title').optional().trim().isLength({ min: 1, max: 200 }).withMessage('Title must be between 1 and 200 characters'),
  body('type').optional().isIn(['movie', 'series', 'anime', 'cartoon', 'game', 'documentary']).withMessage('Invalid media type'),
  body('genre').optional().isArray({ min: 1 }).withMessage('At least one genre is required'),
  body('year').optional().isInt({ min: 1900, max: new Date().getFullYear() + 5 }).withMessage('Invalid year'),
  body('description').optional().isLength({ max: 2000 }).withMessage('Description too long')
], handleValidationErrors, async (req, res) => {
  try {
    const { mediaId } = req.params;
    const updateData = req.body;

    const media = await Media.findByIdAndUpdate(
      mediaId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!media) {
      return res.status(404).json({
        success: false,
        message: 'Media not found'
      });
    }

    logger.info(`Admin ${req.user._id} updated media: ${media.title}`);

    res.json({
      success: true,
      message: 'Media updated successfully',
      data: { media }
    });

  } catch (error) {
    logger.error('Media update error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating media'
    });
  }
});

// @route   PUT /api/admin/media/:mediaId/status
// @desc    Update media status (activate/deactivate)
// @access  Admin
router.put('/media/:mediaId/status', [
  param('mediaId').isMongoId().withMessage('Invalid media ID'),
  body('isActive').isBoolean().withMessage('isActive must be a boolean')
], handleValidationErrors, async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { isActive } = req.body;

    const media = await Media.findByIdAndUpdate(
      mediaId,
      { isActive },
      { new: true }
    );

    if (!media) {
      return res.status(404).json({
        success: false,
        message: 'Media not found'
      });
    }

    logger.info(`Admin ${req.user._id} ${isActive ? 'activated' : 'deactivated'} media: ${media.title}`);

    res.json({
      success: true,
      message: `Media ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: { media: { id: media._id, title: media.title, isActive: media.isActive } }
    });

  } catch (error) {
    logger.error('Media status update error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating media status'
    });
  }
});

// @route   DELETE /api/admin/media/:mediaId
// @desc    Delete media
// @access  Admin
router.delete('/media/:mediaId', [
  param('mediaId').isMongoId().withMessage('Invalid media ID')
], handleValidationErrors, async (req, res) => {
  try {
    const { mediaId } = req.params;

    const media = await Media.findByIdAndDelete(mediaId);

    if (!media) {
      return res.status(404).json({
        success: false,
        message: 'Media not found'
      });
    }

    logger.info(`Admin ${req.user._id} deleted media: ${media.title}`);

    res.json({
      success: true,
      message: 'Media deleted successfully'
    });

  } catch (error) {
    logger.error('Media deletion error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while deleting media'
    });
  }
});

// @route   GET /api/admin/analytics
// @desc    Get system analytics
// @access  Admin
router.get('/analytics', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    // Calculate date range
    let dateRange;
    switch (period) {
      case '7d':
        dateRange = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        dateRange = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        dateRange = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        dateRange = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get analytics data
    const [
      userGrowth,
      topMedia,
      subscriptionDistribution
    ] = await Promise.all([
      // User growth over time
      User.aggregate([
        {
          $match: { createdAt: { $gte: dateRange } }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      
      // Top viewed media
      Media.find({ isActive: true })
        .select('title views type genre')
        .sort({ views: -1 })
        .limit(10),
      
      // Subscription plan distribution
      User.aggregate([
        {
          $group: {
            _id: "$subscription.plan",
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    res.json({
      success: true,
      data: {
        userGrowth,
        topMedia,
        subscriptionDistribution,
        period
      }
    });

  } catch (error) {
    logger.error('Analytics fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching analytics'
    });
  }
});

// @route   GET /api/admin/logs
// @desc    Get system logs
// @access  Admin
router.get('/logs', [
  query('level').optional().isIn(['error', 'warn', 'info', 'debug']),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000')
], handleValidationErrors, async (req, res) => {
  try {
    const { level = 'info', limit = 100 } = req.query;

    // This is a simplified version - in production you'd read from log files
    // or use a proper log management system
    res.json({
      success: true,
      data: {
        logs: [
          {
            timestamp: new Date(),
            level: 'info',
            message: 'System running normally',
            service: 'streamvault-api'
          }
        ],
        message: 'Log reading not fully implemented - use log files or external log management'
      }
    });

  } catch (error) {
    logger.error('Logs fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching logs'
    });
  }
});

module.exports = router;
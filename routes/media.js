const express = require('express');
const { query, param, validationResult } = require('express-validator');
const Media = require('../models/Media');
const auth = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

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

// @route   GET /api/media
// @desc    Get media with filters and pagination
// @access  Public
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('type').optional().isIn(['movie', 'series', 'anime', 'cartoon', 'game', 'documentary']),
  query('genre').optional().isString(),
  query('year').optional().isInt({ min: 1900, max: new Date().getFullYear() + 5 }),
  query('sort').optional().isIn(['newest', 'oldest', 'rating', 'views', 'title'])
], handleValidationErrors, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      type,
      genre,
      year,
      sort = 'newest',
      featured,
      trending
    } = req.query;

    // Build query
    const query = { isActive: true };
    
    if (type) query.type = type;
    if (genre) query.genre = { $in: [genre] };
    if (year) query.year = parseInt(year);
    if (featured === 'true') query.isFeatured = true;
    if (trending === 'true') query.isTrending = true;

    // Build sort
    let sortQuery = {};
    switch (sort) {
      case 'newest':
        sortQuery = { createdAt: -1 };
        break;
      case 'oldest':
        sortQuery = { createdAt: 1 };
        break;
      case 'rating':
        sortQuery = { 'rating.internal.average': -1 };
        break;
      case 'views':
        sortQuery = { views: -1 };
        break;
      case 'title':
        sortQuery = { title: 1 };
        break;
      default:
        sortQuery = { createdAt: -1 };
    }

    // Execute query
    const media = await Media.find(query)
      .select('title poster year genre rating views type duration totalSeasons totalEpisodes slug')
      .sort(sortQuery)
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
    logger.error('Media fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching media'
    });
  }
});

// @route   GET /api/media/trending
// @desc    Get trending media
// @access  Public
router.get('/trending', [
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50')
], handleValidationErrors, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    
    const media = await Media.findTrending(limit);
    
    res.json({
      success: true,
      data: { media }
    });

  } catch (error) {
    logger.error('Trending media fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching trending media'
    });
  }
});

// @route   GET /api/media/featured
// @desc    Get featured media
// @access  Public
router.get('/featured', [
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50')
], handleValidationErrors, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const media = await Media.findFeatured(limit);
    
    res.json({
      success: true,
      data: { media }
    });

  } catch (error) {
    logger.error('Featured media fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching featured media'
    });
  }
});

// @route   GET /api/media/search
// @desc    Search media
// @access  Public
router.get('/search', [
  query('q').notEmpty().withMessage('Search query is required'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50')
], handleValidationErrors, async (req, res) => {
  try {
    const { q, page = 1, limit = 20, type, genre } = req.query;
    
    const filters = {};
    if (type) filters.type = type;
    if (genre) filters.genre = { $in: [genre] };
    
    const media = await Media.searchMedia(q, filters)
      .select('title poster year genre rating views type duration totalSeasons totalEpisodes slug')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    res.json({
      success: true,
      data: {
        media,
        query: q,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    logger.error('Media search error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while searching media'
    });
  }
});

// @route   GET /api/media/:id
// @desc    Get single media by ID or slug
// @access  Public
router.get('/:id', [
  param('id').notEmpty().withMessage('Media ID or slug is required')
], handleValidationErrors, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Try to find by ID first, then by slug
    let media = await Media.findById(id).populate('createdBy', 'displayName');
    
    if (!media) {
      media = await Media.findBySlug(id).populate('createdBy', 'displayName');
    }
    
    if (!media) {
      return res.status(404).json({
        success: false,
        message: 'Media not found'
      });
    }
    
    // Increment view count (don't await to avoid blocking)
    media.addView().catch(err => logger.error('View count update error:', err));
    
    res.json({
      success: true,
      data: { media }
    });

  } catch (error) {
    logger.error('Single media fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching media'
    });
  }
});

// @route   GET /api/media/:id/similar
// @desc    Get similar media
// @access  Public
router.get('/:id/similar', [
  param('id').notEmpty().withMessage('Media ID is required'),
  query('limit').optional().isInt({ min: 1, max: 20 }).withMessage('Limit must be between 1 and 20')
], handleValidationErrors, async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    
    const media = await Media.findById(id);
    if (!media) {
      return res.status(404).json({
        success: false,
        message: 'Media not found'
      });
    }
    
    // Find similar media based on genre and type
    const similar = await Media.find({
      _id: { $ne: id },
      type: media.type,
      genre: { $in: media.genre },
      isActive: true
    })
    .select('title poster year genre rating views type duration totalSeasons totalEpisodes slug')
    .sort({ 'rating.internal.average': -1 })
    .limit(limit);
    
    res.json({
      success: true,
      data: { similar }
    });

  } catch (error) {
    logger.error('Similar media fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching similar media'
    });
  }
});

// @route   POST /api/media/:id/rate
// @desc    Rate media
// @access  Private
router.post('/:id/rate', auth, [
  param('id').notEmpty().withMessage('Media ID is required'),
  query('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5')
], handleValidationErrors, async (req, res) => {
  try {
    const { id } = req.params;
    const { rating } = req.body;
    const userId = req.user._id;
    
    const media = await Media.findById(id);
    if (!media) {
      return res.status(404).json({
        success: false,
        message: 'Media not found'
      });
    }
    
    // TODO: Check if user already rated and update accordingly
    await media.addRating(rating, userId);
    
    logger.info(`User ${userId} rated media ${id} with ${rating} stars`);
    
    res.json({
      success: true,
      message: 'Rating submitted successfully',
      data: {
        newRating: media.rating.internal.average,
        totalRatings: media.rating.internal.count
      }
    });

  } catch (error) {
    logger.error('Media rating error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while rating media'
    });
  }
});

// @route   GET /api/media/:id/watch-url
// @desc    Get streaming URL for media
// @access  Private
router.get('/:id/watch-url', auth, [
  param('id').notEmpty().withMessage('Media ID is required'),
  query('quality').optional().isIn(['480p', '720p', '1080p', '4k']),
  query('season').optional().isInt({ min: 1 }),
  query('episode').optional().isInt({ min: 1 })
], handleValidationErrors, async (req, res) => {
  try {
    const { id } = req.params;
    const { quality = '720p', season, episode } = req.query;
    const user = req.user;
    
    const media = await Media.findById(id);
    if (!media) {
      return res.status(404).json({
        success: false,
        message: 'Media not found'
      });
    }
    
    // Check if user can access content
    if (!user.canAccessContent('premium')) {
      return res.status(403).json({
        success: false,
        message: 'Premium subscription required to watch this content'
      });
    }
    
    const watchUrl = media.getWatchUrl(quality, season, episode);
    
    if (!watchUrl) {
      return res.status(404).json({
        success: false,
        message: 'No streaming source available for the requested quality/episode'
      });
    }
    
    res.json({
      success: true,
      data: {
        url: watchUrl,
        quality,
        ...(season && { season }),
        ...(episode && { episode })
      }
    });

  } catch (error) {
    logger.error('Watch URL fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while getting watch URL'
    });
  }
});

module.exports = router;
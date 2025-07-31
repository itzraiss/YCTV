const express = require('express');
const { param, body, validationResult } = require('express-validator');
const User = require('../models/User');
const Media = require('../models/Media');
const auth = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(auth);

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

// @route   GET /api/user/watchlist
// @desc    Get user's watchlist
// @access  Private
router.get('/watchlist', async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate({
        path: 'watchlist.mediaId',
        select: 'title poster year genre rating views type duration totalSeasons totalEpisodes slug'
      });

    const watchlist = user.watchlist
      .filter(item => item.mediaId) // Filter out any null references
      .map(item => ({
        ...item.mediaId.toObject(),
        addedAt: item.addedAt
      }));

    res.json({
      success: true,
      data: { watchlist }
    });

  } catch (error) {
    logger.error('Watchlist fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching watchlist'
    });
  }
});

// @route   POST /api/user/watchlist/:mediaId
// @desc    Add media to watchlist
// @access  Private
router.post('/watchlist/:mediaId', [
  param('mediaId').isMongoId().withMessage('Invalid media ID')
], handleValidationErrors, async (req, res) => {
  try {
    const { mediaId } = req.params;
    const user = req.user;

    // Check if media exists
    const media = await Media.findById(mediaId);
    if (!media) {
      return res.status(404).json({
        success: false,
        message: 'Media not found'
      });
    }

    // Add to watchlist
    user.addToWatchlist(mediaId);
    await user.save();

    // Update media watchlist count
    await Media.findByIdAndUpdate(mediaId, { $inc: { watchlistCount: 1 } });

    logger.info(`User ${user._id} added media ${mediaId} to watchlist`);

    res.json({
      success: true,
      message: 'Media added to watchlist successfully'
    });

  } catch (error) {
    logger.error('Add to watchlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while adding to watchlist'
    });
  }
});

// @route   DELETE /api/user/watchlist/:mediaId
// @desc    Remove media from watchlist
// @access  Private
router.delete('/watchlist/:mediaId', [
  param('mediaId').isMongoId().withMessage('Invalid media ID')
], handleValidationErrors, async (req, res) => {
  try {
    const { mediaId } = req.params;
    const user = req.user;

    // Remove from watchlist
    user.removeFromWatchlist(mediaId);
    await user.save();

    // Update media watchlist count
    await Media.findByIdAndUpdate(mediaId, { $inc: { watchlistCount: -1 } });

    logger.info(`User ${user._id} removed media ${mediaId} from watchlist`);

    res.json({
      success: true,
      message: 'Media removed from watchlist successfully'
    });

  } catch (error) {
    logger.error('Remove from watchlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while removing from watchlist'
    });
  }
});

// @route   GET /api/user/history
// @desc    Get user's watch history
// @access  Private
router.get('/history', async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate({
        path: 'watchHistory.mediaId',
        select: 'title poster year genre rating type duration totalSeasons totalEpisodes slug'
      });

    const history = user.watchHistory
      .filter(item => item.mediaId) // Filter out any null references
      .sort((a, b) => b.lastWatched - a.lastWatched) // Most recent first
      .slice(0, 100) // Limit to last 100 items
      .map(item => ({
        media: item.mediaId,
        progress: item.progress,
        duration: item.duration,
        lastWatched: item.lastWatched,
        completed: item.completed,
        seasonNumber: item.seasonNumber,
        episodeNumber: item.episodeNumber
      }));

    res.json({
      success: true,
      data: { history }
    });

  } catch (error) {
    logger.error('Watch history fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching watch history'
    });
  }
});

// @route   POST /api/user/history/:mediaId
// @desc    Update watch progress
// @access  Private
router.post('/history/:mediaId', [
  param('mediaId').isMongoId().withMessage('Invalid media ID'),
  body('progress').isInt({ min: 0 }).withMessage('Progress must be a non-negative integer'),
  body('duration').isInt({ min: 1 }).withMessage('Duration must be a positive integer'),
  body('seasonNumber').optional().isInt({ min: 1 }).withMessage('Season number must be a positive integer'),
  body('episodeNumber').optional().isInt({ min: 1 }).withMessage('Episode number must be a positive integer')
], handleValidationErrors, async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { progress, duration, seasonNumber, episodeNumber } = req.body;
    const user = req.user;

    // Check if media exists
    const media = await Media.findById(mediaId);
    if (!media) {
      return res.status(404).json({
        success: false,
        message: 'Media not found'
      });
    }

    // Update watch history
    user.addToWatchHistory(mediaId, progress, duration, seasonNumber, episodeNumber);
    
    // Update total watch time (convert seconds to minutes)
    const watchTimeMinutes = Math.floor(progress / 60);
    user.totalWatchTime += watchTimeMinutes;

    await user.save();

    logger.info(`User ${user._id} updated watch progress for media ${mediaId}`);

    res.json({
      success: true,
      message: 'Watch progress updated successfully'
    });

  } catch (error) {
    logger.error('Watch progress update error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating watch progress'
    });
  }
});

// @route   GET /api/user/continue-watching
// @desc    Get continue watching list
// @access  Private
router.get('/continue-watching', async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate({
        path: 'watchHistory.mediaId',
        select: 'title poster year genre rating type duration totalSeasons totalEpisodes slug seasons'
      });

    // Get incomplete items from watch history
    const continueWatching = user.watchHistory
      .filter(item => item.mediaId && !item.completed && item.progress > 0)
      .sort((a, b) => b.lastWatched - a.lastWatched)
      .slice(0, 20) // Limit to 20 items
      .map(item => ({
        media: item.mediaId,
        progress: item.progress,
        duration: item.duration,
        lastWatched: item.lastWatched,
        progressPercentage: Math.round((item.progress / item.duration) * 100),
        seasonNumber: item.seasonNumber,
        episodeNumber: item.episodeNumber
      }));

    res.json({
      success: true,
      data: { continueWatching }
    });

  } catch (error) {
    logger.error('Continue watching fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching continue watching list'
    });
  }
});

// @route   GET /api/user/recommendations
// @desc    Get personalized recommendations
// @access  Private
router.get('/recommendations', async (req, res) => {
  try {
    const user = req.user;
    const limit = parseInt(req.query.limit) || 20;

    // Get user's favorite genres based on watch history
    const watchedGenres = {};
    user.watchHistory.forEach(item => {
      // This would need the media populated, simplified for now
      // In a real implementation, you'd aggregate this data
    });

    // For now, return trending content as recommendations
    // TODO: Implement proper recommendation algorithm
    const recommendations = await Media.find({
      isActive: true,
      isTrending: true
    })
    .select('title poster year genre rating views type duration totalSeasons totalEpisodes slug')
    .sort({ views: -1 })
    .limit(limit);

    res.json({
      success: true,
      data: { recommendations }
    });

  } catch (error) {
    logger.error('Recommendations fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching recommendations'
    });
  }
});

// @route   GET /api/user/profiles
// @desc    Get user profiles
// @access  Private
router.get('/profiles', async (req, res) => {
  try {
    const user = req.user;

    res.json({
      success: true,
      data: {
        profiles: user.profiles,
        activeProfileId: user.activeProfileId
      }
    });

  } catch (error) {
    logger.error('Profiles fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching profiles'
    });
  }
});

// @route   POST /api/user/profiles
// @desc    Create new profile
// @access  Private
router.post('/profiles', [
  body('name').trim().isLength({ min: 1, max: 50 }).withMessage('Profile name must be between 1 and 50 characters'),
  body('avatar').optional().isURL().withMessage('Avatar must be a valid URL'),
  body('isKid').optional().isBoolean().withMessage('isKid must be a boolean'),
  body('language').optional().isLength({ min: 2, max: 5 }).withMessage('Language must be a valid language code')
], handleValidationErrors, async (req, res) => {
  try {
    const { name, avatar, isKid = false, language = 'en' } = req.body;
    const user = req.user;

    // Check profile limit (max 5 profiles)
    if (user.profiles.length >= 5) {
      return res.status(400).json({
        success: false,
        message: 'Maximum of 5 profiles allowed per account'
      });
    }

    // Add new profile
    user.profiles.push({
      name,
      avatar: avatar || 'https://res.cloudinary.com/streamvault/image/upload/v1/avatars/default.png',
      isKid,
      language
    });

    await user.save();

    logger.info(`User ${user._id} created new profile: ${name}`);

    res.status(201).json({
      success: true,
      message: 'Profile created successfully',
      data: {
        profile: user.profiles[user.profiles.length - 1]
      }
    });

  } catch (error) {
    logger.error('Profile creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while creating profile'
    });
  }
});

// @route   PUT /api/user/profiles/:profileId
// @desc    Update profile
// @access  Private
router.put('/profiles/:profileId', [
  param('profileId').isMongoId().withMessage('Invalid profile ID'),
  body('name').optional().trim().isLength({ min: 1, max: 50 }).withMessage('Profile name must be between 1 and 50 characters'),
  body('avatar').optional().isURL().withMessage('Avatar must be a valid URL'),
  body('isKid').optional().isBoolean().withMessage('isKid must be a boolean'),
  body('language').optional().isLength({ min: 2, max: 5 }).withMessage('Language must be a valid language code')
], handleValidationErrors, async (req, res) => {
  try {
    const { profileId } = req.params;
    const { name, avatar, isKid, language } = req.body;
    const user = req.user;

    // Find profile
    const profile = user.profiles.id(profileId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    // Update profile
    if (name) profile.name = name;
    if (avatar) profile.avatar = avatar;
    if (typeof isKid === 'boolean') profile.isKid = isKid;
    if (language) profile.language = language;

    await user.save();

    logger.info(`User ${user._id} updated profile ${profileId}`);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { profile }
    });

  } catch (error) {
    logger.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating profile'
    });
  }
});

// @route   DELETE /api/user/profiles/:profileId
// @desc    Delete profile
// @access  Private
router.delete('/profiles/:profileId', [
  param('profileId').isMongoId().withMessage('Invalid profile ID')
], handleValidationErrors, async (req, res) => {
  try {
    const { profileId } = req.params;
    const user = req.user;

    // Can't delete if it's the only profile
    if (user.profiles.length <= 1) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete the last profile'
      });
    }

    // Find and remove profile
    const profile = user.profiles.id(profileId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    user.profiles.pull(profileId);

    // If this was the active profile, set the first profile as active
    if (user.activeProfileId && user.activeProfileId.toString() === profileId) {
      user.activeProfileId = user.profiles[0]._id;
    }

    await user.save();

    logger.info(`User ${user._id} deleted profile ${profileId}`);

    res.json({
      success: true,
      message: 'Profile deleted successfully'
    });

  } catch (error) {
    logger.error('Profile deletion error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while deleting profile'
    });
  }
});

// @route   POST /api/user/profiles/:profileId/activate
// @desc    Set active profile
// @access  Private
router.post('/profiles/:profileId/activate', [
  param('profileId').isMongoId().withMessage('Invalid profile ID')
], handleValidationErrors, async (req, res) => {
  try {
    const { profileId } = req.params;
    const user = req.user;

    // Check if profile exists
    const profile = user.profiles.id(profileId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    // Set as active profile
    user.activeProfileId = profileId;
    await user.save();

    logger.info(`User ${user._id} activated profile ${profileId}`);

    res.json({
      success: true,
      message: 'Profile activated successfully',
      data: { activeProfile: profile }
    });

  } catch (error) {
    logger.error('Profile activation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while activating profile'
    });
  }
});

module.exports = router;
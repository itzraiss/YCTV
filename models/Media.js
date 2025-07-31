const mongoose = require('mongoose');

const sourceSchema = new mongoose.Schema({
  quality: {
    type: String,
    enum: ['480p', '720p', '1080p', '4k'],
    required: true
  },
  url: {
    type: String,
    required: true
  },
  size: {
    type: Number, // in bytes
    required: true
  },
  format: {
    type: String,
    enum: ['mp4', 'webm', 'hls', 'm3u8'],
    default: 'mp4'
  },
  language: {
    type: String,
    default: 'original'
  }
});

const subtitleSchema = new mongoose.Schema({
  language: {
    type: String,
    required: true
  },
  languageCode: {
    type: String,
    required: true // e.g., 'en', 'es', 'fr'
  },
  url: {
    type: String,
    required: true
  },
  format: {
    type: String,
    enum: ['srt', 'vtt', 'ass'],
    default: 'srt'
  },
  isDefault: {
    type: Boolean,
    default: false
  }
});

const dubbingSchema = new mongoose.Schema({
  language: {
    type: String,
    required: true
  },
  languageCode: {
    type: String,
    required: true
  },
  url: {
    type: String,
    required: true
  },
  isDefault: {
    type: Boolean,
    default: false
  }
});

const episodeSchema = new mongoose.Schema({
  number: {
    type: Number,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    maxlength: 1000
  },
  duration: {
    type: Number, // in minutes
    required: true
  },
  airDate: {
    type: Date
  },
  poster: {
    type: String
  },
  sources: [sourceSchema],
  subtitles: [subtitleSchema],
  dubbing: [dubbingSchema],
  views: {
    type: Number,
    default: 0
  },
  rating: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    count: {
      type: Number,
      default: 0
    }
  }
});

const seasonSchema = new mongoose.Schema({
  number: {
    type: Number,
    required: true
  },
  title: {
    type: String
  },
  description: {
    type: String,
    maxlength: 1000
  },
  poster: {
    type: String
  },
  releaseDate: {
    type: Date
  },
  episodes: [episodeSchema]
});

const ratingSchema = new mongoose.Schema({
  imdb: {
    type: Number,
    min: 0,
    max: 10
  },
  tmdb: {
    type: Number,
    min: 0,
    max: 10
  },
  internal: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    count: {
      type: Number,
      default: 0
    }
  },
  ageRating: {
    type: String,
    enum: ['G', 'PG', 'PG-13', 'R', 'NC-17', 'TV-Y', 'TV-Y7', 'TV-G', 'TV-PG', 'TV-14', 'TV-MA']
  }
});

const availabilitySchema = new mongoose.Schema({
  platform: {
    type: String,
    required: true
  },
  region: {
    type: String,
    default: 'US'
  },
  url: {
    type: String
  },
  isPremium: {
    type: Boolean,
    default: false
  },
  lastChecked: {
    type: Date,
    default: Date.now
  }
});

const mediaSchema = new mongoose.Schema({
  // Basic Information
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  originalTitle: {
    type: String,
    trim: true,
    maxlength: 200
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true
  },
  type: {
    type: String,
    enum: ['movie', 'series', 'anime', 'cartoon', 'game', 'documentary'],
    required: true
  },
  
  // Content Details
  description: {
    type: String,
    maxlength: 2000
  },
  tagline: {
    type: String,
    maxlength: 200
  },
  genre: [{
    type: String,
    required: true
  }],
  tags: [String],
  
  // Media Information
  year: {
    type: Number,
    min: 1900,
    max: new Date().getFullYear() + 5
  },
  releaseDate: {
    type: Date
  },
  duration: {
    type: Number, // in minutes (for movies, null for series)
  },
  
  // Visual Assets
  poster: {
    type: String,
    required: true
  },
  backdrop: {
    type: String
  },
  logo: {
    type: String
  },
  gallery: [String], // Additional images
  
  // Video Content
  trailer: {
    type: String
  },
  
  // For Movies
  sources: [sourceSchema],
  subtitles: [subtitleSchema],
  dubbing: [dubbingSchema],
  
  // For Series/Anime
  seasons: [seasonSchema],
  totalSeasons: {
    type: Number,
    default: 0
  },
  totalEpisodes: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['ongoing', 'completed', 'cancelled', 'hiatus'],
    default: 'completed'
  },
  
  // Ratings and Reviews
  rating: ratingSchema,
  
  // Production Information
  cast: [{
    name: String,
    character: String,
    photo: String
  }],
  crew: [{
    name: String,
    job: String,
    photo: String
  }],
  director: [String],
  producer: [String],
  writer: [String],
  studio: String,
  network: String,
  
  // Location and Language
  country: [String],
  language: {
    type: String,
    default: 'en'
  },
  originalLanguage: {
    type: String
  },
  
  // Platform Availability
  availability: [availabilitySchema],
  
  // Analytics
  views: {
    type: Number,
    default: 0
  },
  likes: {
    type: Number,
    default: 0
  },
  dislikes: {
    type: Number,
    default: 0
  },
  watchlistCount: {
    type: Number,
    default: 0
  },
  
  // Content Flags
  isAdult: {
    type: Boolean,
    default: false
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  isTrending: {
    type: Boolean,
    default: false
  },
  isRecommended: {
    type: Boolean,
    default: false
  },
  
  // External IDs
  externalIds: {
    imdb: String,
    tmdb: String,
    tvdb: String,
    mal: String, // MyAnimeList
    anilist: String
  },
  
  // SEO and Metadata
  keywords: [String],
  seoTitle: String,
  seoDescription: String,
  
  // Admin
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for performance
mediaSchema.index({ title: 'text', description: 'text', tags: 'text' });
mediaSchema.index({ type: 1, genre: 1 });
mediaSchema.index({ year: -1 });
mediaSchema.index({ 'rating.internal.average': -1 });
mediaSchema.index({ views: -1 });
mediaSchema.index({ isFeatured: 1 });
mediaSchema.index({ isTrending: 1 });
mediaSchema.index({ slug: 1 });
mediaSchema.index({ createdAt: -1 });
mediaSchema.index({ 'availability.platform': 1 });

// Pre-save middleware
mediaSchema.pre('save', function(next) {
  // Update timestamp
  this.updatedAt = new Date();
  
  // Generate slug if not provided
  if (!this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  
  // Calculate total seasons and episodes for series
  if (this.type === 'series' || this.type === 'anime') {
    this.totalSeasons = this.seasons.length;
    this.totalEpisodes = this.seasons.reduce((total, season) => total + season.episodes.length, 0);
  }
  
  next();
});

// Instance methods
mediaSchema.methods.addView = function() {
  this.views += 1;
  return this.save();
};

mediaSchema.methods.addRating = function(rating, userId) {
  // This would typically involve checking if user already rated
  // and updating accordingly
  const currentTotal = this.rating.internal.average * this.rating.internal.count;
  this.rating.internal.count += 1;
  this.rating.internal.average = (currentTotal + rating) / this.rating.internal.count;
  return this.save();
};

mediaSchema.methods.getWatchUrl = function(quality = '720p', season = null, episode = null) {
  if (this.type === 'movie') {
    const source = this.sources.find(s => s.quality === quality) || this.sources[0];
    return source?.url;
  } else if (season && episode) {
    const seasonData = this.seasons.find(s => s.number === season);
    const episodeData = seasonData?.episodes.find(e => e.number === episode);
    const source = episodeData?.sources.find(s => s.quality === quality) || episodeData?.sources[0];
    return source?.url;
  }
  return null;
};

mediaSchema.methods.isAvailableOn = function(platform) {
  return this.availability.some(avail => avail.platform.toLowerCase() === platform.toLowerCase());
};

// Static methods
mediaSchema.statics.findBySlug = function(slug) {
  return this.findOne({ slug, isActive: true });
};

mediaSchema.statics.findTrending = function(limit = 20) {
  return this.find({ isTrending: true, isActive: true })
    .sort({ views: -1 })
    .limit(limit);
};

mediaSchema.statics.findFeatured = function(limit = 10) {
  return this.find({ isFeatured: true, isActive: true })
    .sort({ createdAt: -1 })
    .limit(limit);
};

mediaSchema.statics.findByGenre = function(genre, limit = 20, page = 1) {
  return this.find({ genre: { $in: [genre] }, isActive: true })
    .sort({ 'rating.internal.average': -1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

mediaSchema.statics.searchMedia = function(query, filters = {}) {
  const searchQuery = {
    $text: { $search: query },
    isActive: true,
    ...filters
  };
  
  return this.find(searchQuery, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } });
};

// Virtual for average rating
mediaSchema.virtual('averageRating').get(function() {
  return this.rating.internal.average;
});

// Virtual for total runtime (for series)
mediaSchema.virtual('totalRuntime').get(function() {
  if (this.type === 'movie') return this.duration;
  
  return this.seasons.reduce((total, season) => {
    return total + season.episodes.reduce((seasonTotal, episode) => {
      return seasonTotal + (episode.duration || 0);
    }, 0);
  }, 0);
});

// Transform output
mediaSchema.methods.toJSON = function() {
  const media = this.toObject({ virtuals: true });
  
  // Don't expose internal admin fields in API responses
  delete media.__v;
  
  return media;
};

module.exports = mongoose.model('Media', mediaSchema);
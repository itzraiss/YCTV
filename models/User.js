const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const profileSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  avatar: {
    type: String,
    default: 'https://res.cloudinary.com/streamvault/image/upload/v1/avatars/default.png'
  },
  isKid: {
    type: Boolean,
    default: false
  },
  restrictions: [{
    type: String,
    enum: ['violence', 'adult', 'language', 'drugs']
  }],
  language: {
    type: String,
    default: 'en'
  }
});

const subscriptionSchema = new mongoose.Schema({
  plan: {
    type: String,
    enum: ['free', 'basic', 'premium', 'family'],
    default: 'free'
  },
  status: {
    type: String,
    enum: ['active', 'cancelled', 'expired', 'past_due'],
    default: 'active'
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date,
    default: function() {
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
    }
  },
  paymentMethod: {
    type: String,
    enum: ['card', 'paypal', 'apple_pay', 'google_pay']
  },
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  autoRenew: {
    type: Boolean,
    default: true
  }
});

const preferencesSchema = new mongoose.Schema({
  language: {
    type: String,
    default: 'en'
  },
  subtitle: {
    type: String,
    default: 'off'
  },
  quality: {
    type: String,
    enum: ['auto', '480p', '720p', '1080p', '4k'],
    default: 'auto'
  },
  notifications: {
    email: {
      type: Boolean,
      default: true
    },
    push: {
      type: Boolean,
      default: true
    },
    marketing: {
      type: Boolean,
      default: false
    }
  },
  privacy: {
    shareWatchHistory: {
      type: Boolean,
      default: false
    },
    showInSearch: {
      type: Boolean,
      default: true
    }
  },
  playback: {
    autoplay: {
      type: Boolean,
      default: true
    },
    skipIntros: {
      type: Boolean,
      default: false
    },
    skipCredits: {
      type: Boolean,
      default: false
    }
  }
});

const watchHistorySchema = new mongoose.Schema({
  mediaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Media',
    required: true
  },
  progress: {
    type: Number,
    default: 0,
    min: 0
  },
  duration: {
    type: Number,
    required: true
  },
  lastWatched: {
    type: Date,
    default: Date.now
  },
  completed: {
    type: Boolean,
    default: false
  },
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  // For series
  seasonNumber: Number,
  episodeNumber: Number
});

const userSchema = new mongoose.Schema({
  // Basic Information
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    sparse: true,
    unique: true,
    match: [/^\+?[\d\s-()]+$/, 'Please enter a valid phone number']
  },
  displayName: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 50
  },
  photoURL: {
    type: String,
    default: 'https://res.cloudinary.com/streamvault/image/upload/v1/avatars/default.png'
  },
  
  // Authentication
  password: {
    type: String,
    minlength: 8,
    select: false // Don't return password by default
  },
  providers: [{
    type: String,
    enum: ['email', 'google', 'facebook', 'phone']
  }],
  firebaseUID: {
    type: String,
    sparse: true,
    unique: true
  },
  
  // Account Status
  isVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  
  // Subscription
  subscription: subscriptionSchema,
  
  // User Preferences
  preferences: preferencesSchema,
  
  // Multiple Profiles (like Netflix)
  profiles: [profileSchema],
  activeProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    default: function() {
      return this.profiles[0]?._id;
    }
  },
  
  // Watch Data
  watchHistory: [watchHistorySchema],
  watchlist: [{
    mediaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Media'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Social Features
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Analytics
  totalWatchTime: {
    type: Number,
    default: 0 // in minutes
  },
  favoriteGenres: [{
    genre: String,
    count: Number
  }],
  
  // Security
  refreshTokens: [{
    token: String,
    createdAt: {
      type: Date,
      default: Date.now,
      expires: '7d'
    }
  }],
  passwordResetToken: String,
  passwordResetExpires: Date,
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  
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
userSchema.index({ email: 1 });
userSchema.index({ firebaseUID: 1 });
userSchema.index({ 'subscription.status': 1 });
userSchema.index({ 'watchHistory.mediaId': 1 });
userSchema.index({ 'watchlist.mediaId': 1 });
userSchema.index({ createdAt: -1 });

// Pre-save middleware
userSchema.pre('save', async function(next) {
  // Update timestamp
  this.updatedAt = new Date();
  
  // Hash password if modified
  if (this.isModified('password') && this.password) {
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
    this.password = await bcrypt.hash(this.password, saltRounds);
  }
  
  // Create default profile if none exists
  if (this.isNew && this.profiles.length === 0) {
    this.profiles.push({
      name: this.displayName,
      avatar: this.photoURL,
      isKid: false,
      language: 'en'
    });
  }
  
  next();
});

// Instance methods
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.addToWatchHistory = function(mediaId, progress, duration, seasonNumber = null, episodeNumber = null) {
  const existingEntry = this.watchHistory.find(entry => 
    entry.mediaId.toString() === mediaId.toString() &&
    entry.seasonNumber === seasonNumber &&
    entry.episodeNumber === episodeNumber
  );
  
  if (existingEntry) {
    existingEntry.progress = progress;
    existingEntry.lastWatched = new Date();
    existingEntry.completed = progress >= duration * 0.9; // 90% completion
  } else {
    this.watchHistory.push({
      mediaId,
      progress,
      duration,
      seasonNumber,
      episodeNumber,
      completed: progress >= duration * 0.9
    });
  }
  
  // Keep only last 1000 entries
  if (this.watchHistory.length > 1000) {
    this.watchHistory = this.watchHistory
      .sort((a, b) => b.lastWatched - a.lastWatched)
      .slice(0, 1000);
  }
};

userSchema.methods.addToWatchlist = function(mediaId) {
  const exists = this.watchlist.some(item => item.mediaId.toString() === mediaId.toString());
  if (!exists) {
    this.watchlist.push({ mediaId });
  }
};

userSchema.methods.removeFromWatchlist = function(mediaId) {
  this.watchlist = this.watchlist.filter(item => item.mediaId.toString() !== mediaId.toString());
};

userSchema.methods.isSubscriptionActive = function() {
  return this.subscription.status === 'active' && this.subscription.endDate > new Date();
};

userSchema.methods.canAccessContent = function(contentType = 'premium') {
  if (contentType === 'free') return true;
  
  const activePlans = ['basic', 'premium', 'family'];
  return this.isSubscriptionActive() && activePlans.includes(this.subscription.plan);
};

// Static methods
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

userSchema.statics.findByFirebaseUID = function(uid) {
  return this.findOne({ firebaseUID: uid });
};

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return this.displayName;
});

// Transform output
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.refreshTokens;
  delete user.passwordResetToken;
  delete user.passwordResetExpires;
  delete user.emailVerificationToken;
  delete user.emailVerificationExpires;
  return user;
};

module.exports = mongoose.model('User', userSchema);
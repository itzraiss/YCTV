const mongoose = require('mongoose');
const slug = require('slug');

const mediaSchema = new mongoose.Schema({
  // IDs de referência (como o Acteia usa TMDB/IMDB IDs)
  tmdbId: {
    type: Number,
    required: true,
    index: true
  },
  imdbId: {
    type: String,
    index: true
  },
  
  // Informações básicas
  title: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  originalTitle: {
    type: String,
    trim: true
  },
  slug: {
    type: String,
    unique: true,
    index: true
  },
  type: {
    type: String,
    enum: ['movie', 'series', 'anime', 'documentary', 'cartoon'],
    required: true,
    index: true
  },
  
  // Datas
  year: {
    type: Number,
    index: true
  },
  releaseDate: Date,
  firstAirDate: Date,
  lastAirDate: Date,
  
  // Conteúdo
  description: {
    type: String,
    required: true
  },
  tagline: String,
  
  // Duração
  duration: Number, // em minutos para filmes
  episodeRuntime: [Number], // para séries
  
  // Visuais (URLs do TMDB)
  poster: String,
  backdrop: String,
  logo: String,
  
  // Classificação e gêneros
  genre: [{
    type: String,
    index: true
  }],
  rating: {
    ageRating: {
      type: String,
      default: 'L'
    },
    tmdb: {
      average: {
        type: Number,
        default: 0,
        index: true
      },
      count: {
        type: Number,
        default: 0
      }
    },
    internal: {
      average: {
        type: Number,
        default: 0
      },
      count: {
        type: Number,
        default: 0
      }
    }
  },
  
  // Estrutura para séries (como o Acteia organiza temporadas/episódios)
  seasons: [{
    seasonNumber: Number,
    name: String,
    overview: String,
    airDate: Date,
    episodeCount: Number,
    poster: String,
    episodes: [{
      episodeNumber: Number,
      name: String,
      overview: String,
      airDate: Date,
      runtime: Number,
      stillPath: String,
      voteAverage: Number,
      voteCount: Number,
      // URLs dos vídeos (seria preenchido com links reais)
      videoUrls: {
        '480p': String,
        '720p': String,
        '1080p': String,
        '4k': String,
        hls: String
      }
    }]
  }],
  totalSeasons: {
    type: Number,
    default: 0
  },
  totalEpisodes: {
    type: Number,
    default: 0
  },
  
  // Produção
  cast: [{
    name: String,
    character: String,
    profileImage: String,
    order: Number
  }],
  crew: [{
    name: String,
    job: String,
    department: String,
    profileImage: String
  }],
  productionCompanies: [String],
  productionCountries: [String],
  networks: [String],
  
  // Idiomas
  originalLanguage: {
    type: String,
    default: 'en'
  },
  spokenLanguages: [String],
  originCountry: [String],
  
  // Disponibilidade (onde está disponível oficialmente)
  availableOn: [{
    type: String // Netflix, Amazon Prime, Globoplay, etc.
  }],
  
  // URLs de streaming (seria integrado com CDN real)
  streamingInfo: {
    videoUrls: {
      '480p': String,
      '720p': String,
      '1080p': String,
      '4k': String,
      hls: String // HTTP Live Streaming
    },
    subtitles: [{
      language: String,
      url: String
    }],
    dubbing: [String],
    quality: [String],
    downloadable: {
      type: Boolean,
      default: false
    }
  },
  
  // URLs e embed (como o Acteia faz)
  embedUrl: String, // /embed/movie/550 ou /embed/series/1399/1/1
  
  // Metadados adicionais
  keywords: [String],
  popularity: {
    type: Number,
    default: 0,
    index: true
  },
  status: {
    type: String,
    enum: ['Rumored', 'Planned', 'In Production', 'Post Production', 'Released', 'Canceled', 'Returning Series', 'Ended'],
    default: 'Released'
  },
  budget: Number,
  revenue: Number,
  
  // Analytics (como o Acteia rastreia visualizações)
  analytics: {
    views: {
      type: Number,
      default: 0,
      index: true
    },
    uniqueViews: {
      type: Number,
      default: 0
    },
    totalWatchTime: {
      type: Number,
      default: 0
    },
    averageWatchTime: {
      type: Number,
      default: 0
    },
    completionRate: {
      type: Number,
      default: 0
    },
    ratings: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
    viewHistory: [{
      userId: mongoose.Schema.Types.ObjectId,
      timestamp: Date,
      duration: Number,
      quality: String,
      userAgent: String,
      ip: String
    }]
  },
  
  // Controle de conteúdo
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  featured: {
    type: Boolean,
    default: false,
    index: true
  },
  trending: {
    type: Boolean,
    default: false,
    index: true
  },
  premium: {
    type: Boolean,
    default: false
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastSyncAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes compostos para melhor performance
mediaSchema.index({ type: 1, genre: 1 });
mediaSchema.index({ type: 1, year: 1 });
mediaSchema.index({ featured: 1, trending: 1 });
mediaSchema.index({ isActive: 1, type: 1 });
mediaSchema.index({ 'rating.tmdb.average': -1, popularity: -1 });

// Text index para busca
mediaSchema.index({
  title: 'text',
  originalTitle: 'text',
  description: 'text',
  keywords: 'text'
});

// Middleware para gerar slug automaticamente
mediaSchema.pre('save', function(next) {
  if (!this.slug && this.title) {
    this.slug = slug(this.title, { lower: true });
  }
  
  // Gerar URL de embed
  if (!this.embedUrl) {
    if (this.type === 'movie') {
      this.embedUrl = `/embed/movie/${this.tmdbId}`;
    } else {
      this.embedUrl = `/embed/series/${this.tmdbId}`;
    }
  }
  
  this.updatedAt = new Date();
  next();
});

// Middleware para contar episódios automaticamente
mediaSchema.pre('save', function(next) {
  if (this.type === 'series' && this.seasons) {
    this.totalSeasons = this.seasons.length;
    this.totalEpisodes = this.seasons.reduce((total, season) => {
      return total + (season.episodeCount || season.episodes?.length || 0);
    }, 0);
  }
  next();
});

// Métodos do schema
mediaSchema.methods.updateRating = function(newRating, userId) {
  // Atualizar rating interno
  const existingRating = this.analytics.ratings.find(r => r.userId.toString() === userId);
  
  if (existingRating) {
    existingRating.rating = newRating;
  } else {
    this.analytics.ratings.push({
      userId,
      rating: newRating,
      createdAt: new Date()
    });
  }
  
  // Recalcular média
  const totalRatings = this.analytics.ratings.length;
  const sum = this.analytics.ratings.reduce((acc, r) => acc + r.rating, 0);
  this.rating.internal.average = totalRatings > 0 ? sum / totalRatings : 0;
  this.rating.internal.count = totalRatings;
  
  return this.save();
};

mediaSchema.methods.incrementView = function(userId, duration, quality) {
  this.analytics.views += 1;
  
  if (userId) {
    // Verificar se é visualização única
    const hasViewed = this.analytics.viewHistory.some(v => 
      v.userId && v.userId.toString() === userId
    );
    
    if (!hasViewed) {
      this.analytics.uniqueViews += 1;
    }
  }
  
  // Adicionar ao histórico
  this.analytics.viewHistory.push({
    userId,
    timestamp: new Date(),
    duration: duration || 0,
    quality: quality || 'auto'
  });
  
  // Atualizar tempo total assistido
  if (duration) {
    this.analytics.totalWatchTime += duration;
    this.analytics.averageWatchTime = this.analytics.totalWatchTime / this.analytics.views;
  }
  
  return this.save();
};

mediaSchema.methods.getWatchProgress = function(userId) {
  if (!userId) return null;
  
  const userViews = this.analytics.viewHistory.filter(v => 
    v.userId && v.userId.toString() === userId
  );
  
  if (userViews.length === 0) return null;
  
  const totalDuration = userViews.reduce((sum, view) => sum + (view.duration || 0), 0);
  const mediaDuration = this.duration || (this.episodeRuntime?.[0] || 45) * 60; // em segundos
  
  return {
    watchedDuration: totalDuration,
    totalDuration: mediaDuration,
    progress: Math.min((totalDuration / mediaDuration) * 100, 100),
    lastWatched: userViews[userViews.length - 1].timestamp
  };
};

// Métodos estáticos
mediaSchema.statics.findByTmdbId = function(tmdbId, type) {
  return this.findOne({ tmdbId, type, isActive: true });
};

mediaSchema.statics.search = function(query, options = {}) {
  const {
    type,
    genre,
    year,
    minRating = 0,
    limit = 20,
    page = 1,
    sortBy = 'popularity'
  } = options;
  
  const searchQuery = {
    isActive: true,
    $text: { $search: query }
  };
  
  if (type) searchQuery.type = type;
  if (genre) searchQuery.genre = { $in: Array.isArray(genre) ? genre : [genre] };
  if (year) searchQuery.year = year;
  if (minRating > 0) searchQuery['rating.tmdb.average'] = { $gte: minRating };
  
  const sortOptions = {
    popularity: { popularity: -1 },
    rating: { 'rating.tmdb.average': -1 },
    year: { year: -1 },
    title: { title: 1 },
    views: { 'analytics.views': -1 }
  };
  
  return this.find(searchQuery)
    .sort(sortOptions[sortBy] || sortOptions.popularity)
    .limit(limit)
    .skip((page - 1) * limit)
    .select('-analytics.viewHistory -analytics.ratings');
};

mediaSchema.statics.getTrending = function(type, limit = 20) {
  const query = { isActive: true, trending: true };
  if (type) query.type = type;
  
  return this.find(query)
    .sort({ popularity: -1, 'analytics.views': -1 })
    .limit(limit)
    .select('-analytics.viewHistory -analytics.ratings');
};

mediaSchema.statics.getFeatured = function(type, limit = 20) {
  const query = { isActive: true, featured: true };
  if (type) query.type = type;
  
  return this.find(query)
    .sort({ 'rating.tmdb.average': -1, popularity: -1 })
    .limit(limit)
    .select('-analytics.viewHistory -analytics.ratings');
};

mediaSchema.statics.getByGenre = function(genre, type, limit = 20) {
  const query = {
    isActive: true,
    genre: { $in: Array.isArray(genre) ? genre : [genre] }
  };
  if (type) query.type = type;
  
  return this.find(query)
    .sort({ 'rating.tmdb.average': -1, popularity: -1 })
    .limit(limit)
    .select('-analytics.viewHistory -analytics.ratings');
};

mediaSchema.statics.getRecommendations = function(userId, limit = 10) {
  // Implementação básica - pode ser melhorada com ML
  return this.find({ isActive: true })
    .sort({ 'rating.tmdb.average': -1, popularity: -1 })
    .limit(limit)
    .select('-analytics.viewHistory -analytics.ratings');
};

// Transform para JSON (remover dados sensíveis)
mediaSchema.methods.toJSON = function() {
  const obj = this.toObject();
  
  // Remover dados sensíveis do analytics
  if (obj.analytics) {
    delete obj.analytics.viewHistory;
    delete obj.analytics.ratings;
  }
  
  return obj;
};

module.exports = mongoose.model('Media', mediaSchema);
const cron = require('node-cron');
const mongoose = require('mongoose');
const Media = require('../models/Media');
const tmdbService = require('../services/tmdbService');
const logger = require('../utils/logger');

class CatalogSyncer {
  constructor() {
    this.isRunning = false;
    this.stats = {
      totalSynced: 0,
      moviesAdded: 0,
      seriesAdded: 0,
      animesAdded: 0,
      updated: 0,
      errors: 0,
      startTime: null,
      endTime: null
    };

    // Configurações de sincronização (como o Acteia faz)
    this.config = {
      maxPagesPerSync: 20,
      minRating: 6.0,
      maxItemsPerGenre: 50,
      apiDelay: 250, // ms entre requests
      batchSize: 10, // processar em lotes
      
      // Gêneros prioritários para sincronização
      priorityGenres: {
        movies: [28, 35, 18, 53, 878, 27, 12, 14], // Ação, Comédia, Drama, Thriller, Sci-Fi, Terror, Aventura, Fantasia
        tv: [18, 35, 80, 10759, 9648, 16], // Drama, Comédia, Crime, Ação & Aventura, Mistério, Animação
        anime: [16] // Animação (com filtro japonês)
      },
      
      // Países de interesse
      regions: ['BR', 'US', 'GB', 'JP', 'KR'], // Brasil, EUA, Reino Unido, Japão, Coreia do Sul
      
      // Idiomas prioritários
      languages: ['pt', 'en', 'ja', 'ko', 'es']
    };
  }

  // Inicializar sincronizador
  async initialize() {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.warn('Database not connected, skipping sync initialization');
        return false;
      }

      logger.info('✅ Catalog syncer initialized successfully');
      return true;
    } catch (error) {
      logger.error('❌ Error initializing catalog syncer:', error);
      return false;
    }
  }

  // Sincronização completa (como o Acteia faz automaticamente)
  async fullSync() {
    if (this.isRunning) {
      logger.warn('⚠️ Sync already in progress');
      return;
    }

    this.isRunning = true;
    this.resetStats();
    
    logger.info('🚀 Starting full catalog synchronization...');

    try {
      // 1. Sincronizar filmes populares
      await this.syncPopularMovies();
      
      // 2. Sincronizar séries populares
      await this.syncPopularSeries();
      
      // 3. Sincronizar animes populares
      await this.syncPopularAnimes();
      
      // 4. Sincronizar por gêneros prioritários
      await this.syncByGenres();
      
      // 5. Sincronizar conteúdo brasileiro
      await this.syncBrazilianContent();
      
      // 6. Sincronizar trending content
      await this.syncTrendingContent();
      
      // 7. Atualizar conteúdo existente
      await this.updateExistingContent();
      
      // 8. Limpar conteúdo obsoleto
      await this.cleanupObsoleteContent();

      this.stats.endTime = new Date();
      const duration = (this.stats.endTime - this.stats.startTime) / 1000 / 60;

      logger.info(`✅ Full sync completed in ${duration.toFixed(1)} minutes`);
      logger.info(`📊 Stats: ${this.stats.moviesAdded} movies, ${this.stats.seriesAdded} series, ${this.stats.animesAdded} animes, ${this.stats.updated} updated`);

      // Enviar estatísticas para analytics
      await this.sendSyncStats();

    } catch (error) {
      logger.error('❌ Error in full sync:', error);
      this.stats.errors++;
    } finally {
      this.isRunning = false;
    }
  }

  // Sincronizar filmes populares
  async syncPopularMovies() {
    logger.info('🎬 Syncing popular movies...');
    
    try {
      let moviesAdded = 0;
      
      // Filmes populares globais
      for (let page = 1; page <= this.config.maxPagesPerSync; page++) {
        const popularMovies = await tmdbService.getPopularMovies(page);
        
        const batch = [];
        for (const movie of popularMovies.results) {
          if (movie.rating.tmdb.average >= this.config.minRating) {
            batch.push(movie);
          }
          
          if (batch.length >= this.config.batchSize) {
            const processed = await this.processBatch(batch, 'movie');
            moviesAdded += processed;
            batch.length = 0;
          }
        }
        
        // Processar último lote
        if (batch.length > 0) {
          const processed = await this.processBatch(batch, 'movie');
          moviesAdded += processed;
        }

        await this.delay(this.config.apiDelay);
      }

      // Filmes em cartaz
      const nowPlaying = await tmdbService.getNowPlayingMovies();
      const nowPlayingBatch = nowPlaying.results
        .filter(movie => movie.rating.tmdb.average >= this.config.minRating)
        .slice(0, 50);
      
      const nowPlayingProcessed = await this.processBatch(nowPlayingBatch, 'movie');
      moviesAdded += nowPlayingProcessed;

      // Filmes mais bem avaliados
      const topRated = await tmdbService.getTopRatedMovies();
      const topRatedBatch = topRated.results.slice(0, 30);
      const topRatedProcessed = await this.processBatch(topRatedBatch, 'movie');
      moviesAdded += topRatedProcessed;

      this.stats.moviesAdded += moviesAdded;
      logger.info(`✅ ${moviesAdded} movies processed`);

    } catch (error) {
      logger.error('❌ Error syncing popular movies:', error);
      this.stats.errors++;
    }
  }

  // Sincronizar séries populares
  async syncPopularSeries() {
    logger.info('📺 Syncing popular series...');
    
    try {
      let seriesAdded = 0;
      
      for (let page = 1; page <= this.config.maxPagesPerSync; page++) {
        const popularSeries = await tmdbService.getPopularTVShows(page);
        
        const batch = [];
        for (const series of popularSeries.results) {
          if (series.rating.tmdb.average >= this.config.minRating && series.type === 'series') {
            batch.push(series);
          }
          
          if (batch.length >= this.config.batchSize) {
            const processed = await this.processBatch(batch, 'series');
            seriesAdded += processed;
            batch.length = 0;
          }
        }
        
        if (batch.length > 0) {
          const processed = await this.processBatch(batch, 'series');
          seriesAdded += processed;
        }

        await this.delay(this.config.apiDelay);
      }

      // Séries mais bem avaliadas
      const topRated = await tmdbService.getTopRatedTVShows();
      const topRatedBatch = topRated.results
        .filter(series => series.type === 'series')
        .slice(0, 30);
      const topRatedProcessed = await this.processBatch(topRatedBatch, 'series');
      seriesAdded += topRatedProcessed;

      this.stats.seriesAdded += seriesAdded;
      logger.info(`✅ ${seriesAdded} series processed`);

    } catch (error) {
      logger.error('❌ Error syncing popular series:', error);
      this.stats.errors++;
    }
  }

  // Sincronizar animes populares (como o Acteia categoriza)
  async syncPopularAnimes() {
    logger.info('🎌 Syncing popular animes...');
    
    try {
      let animesAdded = 0;
      
      // Buscar animes (séries de animação japonesas)
      const animes = await tmdbService.discoverTVShows({
        with_genres: 16, // Animação
        with_origin_country: 'JP',
        sort_by: 'popularity.desc',
        'vote_average.gte': 6.5,
        page: 1
      });

      const animeBatch = animes.results
        .filter(anime => anime.type === 'anime')
        .slice(0, 100);
      
      const processed = await this.processBatch(animeBatch, 'anime');
      animesAdded += processed;

      // Buscar animes trending
      const trendingAnimes = await tmdbService.getTrending('tv', 'week');
      const trendingAnimeBatch = trendingAnimes.results
        .filter(item => item.type === 'anime')
        .slice(0, 20);
      
      const trendingProcessed = await this.processBatch(trendingAnimeBatch, 'anime');
      animesAdded += trendingProcessed;

      this.stats.animesAdded += animesAdded;
      logger.info(`✅ ${animesAdded} animes processed`);

    } catch (error) {
      logger.error('❌ Error syncing animes:', error);
      this.stats.errors++;
    }
  }

  // Sincronizar por gêneros
  async syncByGenres() {
    logger.info('🎭 Syncing by priority genres...');

    try {
      // Filmes por gênero
      for (const genreId of this.config.priorityGenres.movies) {
        const movies = await tmdbService.discoverMovies({
          with_genres: genreId,
          'vote_average.gte': this.config.minRating,
          sort_by: 'popularity.desc',
          page: 1
        });

        const batch = movies.results
          .slice(0, this.config.maxItemsPerGenre)
          .filter(movie => movie.rating.tmdb.average >= this.config.minRating);
        
        const processed = await this.processBatch(batch, 'movie');
        logger.debug(`📊 Genre ${genreId}: ${processed} movies processed`);
        
        await this.delay(this.config.apiDelay);
      }

      // Séries por gênero
      for (const genreId of this.config.priorityGenres.tv) {
        const series = await tmdbService.discoverTVShows({
          with_genres: genreId,
          'vote_average.gte': this.config.minRating,
          sort_by: 'popularity.desc',
          page: 1
        });

        const batch = series.results
          .slice(0, this.config.maxItemsPerGenre)
          .filter(show => show.rating.tmdb.average >= this.config.minRating && show.type === 'series');
        
        const processed = await this.processBatch(batch, 'series');
        logger.debug(`📊 Genre ${genreId}: ${processed} series processed`);
        
        await this.delay(this.config.apiDelay);
      }

      logger.info('✅ Genre sync completed');

    } catch (error) {
      logger.error('❌ Error syncing by genres:', error);
      this.stats.errors++;
    }
  }

  // Sincronizar conteúdo brasileiro
  async syncBrazilianContent() {
    logger.info('🇧🇷 Syncing Brazilian content...');

    try {
      // Filmes brasileiros
      const brazilianMovies = await tmdbService.discoverMovies({
        with_origin_country: 'BR',
        sort_by: 'popularity.desc',
        'vote_average.gte': 5.0, // Critério mais baixo para conteúdo nacional
        page: 1
      });

      const movieBatch = brazilianMovies.results.slice(0, 50);
      const moviesProcessed = await this.processBatch(movieBatch, 'movie');

      // Séries brasileiras
      const brazilianSeries = await tmdbService.discoverTVShows({
        with_origin_country: 'BR',
        sort_by: 'popularity.desc',
        'vote_average.gte': 5.0,
        page: 1
      });

      const seriesBatch = brazilianSeries.results
        .filter(series => series.type === 'series')
        .slice(0, 30);
      const seriesProcessed = await this.processBatch(seriesBatch, 'series');

      logger.info(`✅ Brazilian content: ${moviesProcessed} movies, ${seriesProcessed} series`);

    } catch (error) {
      logger.error('❌ Error syncing Brazilian content:', error);
      this.stats.errors++;
    }
  }

  // Sincronizar conteúdo trending (como o Acteia destaca)
  async syncTrendingContent() {
    logger.info('📈 Syncing trending content...');

    try {
      // Resetar trending anterior
      await Media.updateMany({}, { trending: false });

      // Buscar trending da semana
      const trendingWeek = await tmdbService.getTrending('all', 'week');
      const trendingIds = [];

      for (const item of trendingWeek.results.slice(0, 50)) {
        // Verificar se já existe no banco
        const exists = await Media.findByTmdbId(item.tmdbId, item.type);
        
        if (exists) {
          trendingIds.push(exists._id);
        } else {
          // Se não existe, adicionar ao banco
          const processed = await this.processBatch([item], item.type);
          if (processed > 0) {
            const newMedia = await Media.findByTmdbId(item.tmdbId, item.type);
            if (newMedia) {
              trendingIds.push(newMedia._id);
            }
          }
        }
      }

      // Marcar como trending
      await Media.updateMany(
        { _id: { $in: trendingIds } },
        { trending: true, updatedAt: new Date() }
      );

      logger.info(`✅ ${trendingIds.length} items marked as trending`);

    } catch (error) {
      logger.error('❌ Error syncing trending content:', error);
      this.stats.errors++;
    }
  }

  // Atualizar conteúdo existente
  async updateExistingContent() {
    logger.info('🔄 Updating existing content...');

    try {
      // Buscar conteúdo que não foi atualizado há mais de 7 dias
      const existingMedia = await Media.find({
        tmdbId: { $exists: true },
        lastSyncAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }).limit(200);

      let updated = 0;

      // Processar em lotes
      for (let i = 0; i < existingMedia.length; i += this.config.batchSize) {
        const batch = existingMedia.slice(i, i + this.config.batchSize);
        
        for (const media of batch) {
          try {
            let updatedDetails;
            
            if (media.type === 'movie') {
              updatedDetails = await tmdbService.getMovieDetails(media.tmdbId);
            } else {
              updatedDetails = await tmdbService.getTVDetails(media.tmdbId);
            }

            // Atualizar dados mantendo informações internas
            const updateData = this.convertTMDBToMediaFormat(updatedDetails);
            updateData.lastSyncAt = new Date();
            updateData.updatedAt = new Date();
            
            // Manter dados específicos da plataforma
            updateData.analytics = media.analytics;
            updateData.createdAt = media.createdAt;

            await Media.findByIdAndUpdate(media._id, updateData);
            updated++;

          } catch (error) {
            logger.warn(`Failed to update media ${media.tmdbId}:`, error.message);
          }
        }

        await this.delay(this.config.apiDelay * this.config.batchSize);
      }

      this.stats.updated += updated;
      logger.info(`✅ ${updated} items updated`);

    } catch (error) {
      logger.error('❌ Error updating existing content:', error);
      this.stats.errors++;
    }
  }

  // Limpar conteúdo obsoleto
  async cleanupObsoleteContent() {
    logger.info('🧹 Cleaning up obsolete content...');

    try {
      // Marcar como inativo conteúdo muito antigo sem visualizações
      const obsoleteContent = await Media.updateMany({
        isActive: true,
        'analytics.views': { $lt: 5 },
        createdAt: { $lt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }, // 1 ano
        'rating.tmdb.average': { $lt: 5.0 }
      }, {
        isActive: false,
        updatedAt: new Date()
      });

      logger.info(`✅ ${obsoleteContent.modifiedCount} obsolete items deactivated`);

    } catch (error) {
      logger.error('❌ Error in cleanup:', error);
      this.stats.errors++;
    }
  }

  // Processar lote de itens
  async processBatch(items, type) {
    let processed = 0;

    for (const item of items) {
      try {
        // Verificar se já existe
        const exists = await Media.findByTmdbId(item.tmdbId, type);
        if (exists) {
          continue;
        }

        // Buscar detalhes completos
        let details;
        if (type === 'movie') {
          details = await tmdbService.getMovieDetails(item.tmdbId);
        } else {
          details = await tmdbService.getTVDetails(item.tmdbId);
        }

        // Converter e salvar
        const mediaData = this.convertTMDBToMediaFormat(details);
        const media = new Media(mediaData);
        await media.save();

        processed++;
        logger.debug(`✅ Added: ${details.title} (${details.year})`);

      } catch (error) {
        logger.warn(`Failed to process ${type} ${item.tmdbId}:`, error.message);
        this.stats.errors++;
      }

      await this.delay(100); // Pequeno delay entre itens
    }

    return processed;
  }

  // Converter dados do TMDB para formato da mídia
  convertTMDBToMediaFormat(details) {
    return {
      tmdbId: details.tmdbId,
      imdbId: details.imdbId,
      title: details.title,
      originalTitle: details.originalTitle,
      type: details.type,
      year: details.year,
      releaseDate: details.releaseDate,
      firstAirDate: details.firstAirDate,
      lastAirDate: details.lastAirDate,
      description: details.description,
      tagline: details.tagline,
      duration: details.duration,
      poster: details.poster,
      backdrop: details.backdrop,
      genre: details.genre,
      rating: {
        ageRating: details.rating.ageRating,
        tmdb: details.rating.tmdb,
        internal: { average: 0, count: 0 }
      },
      cast: details.cast,
      crew: details.crew,
      availableOn: details.availableOn,
      keywords: details.keywords,
      popularity: details.popularity,
      status: details.status,
      slug: tmdbService.generateSlug(details.title),
      embedUrl: details.type === 'movie' ? 
        `/embed/movie/${details.tmdbId}` : 
        `/embed/series/${details.tmdbId}`,
      
      // Campos específicos para séries
      ...(details.type !== 'movie' && {
        seasons: details.seasons,
        totalSeasons: details.numberOfSeasons,
        totalEpisodes: details.numberOfEpisodes,
        episodeRuntime: details.episodeRuntime
      }),

      // Controle
      isActive: true,
      featured: details.popularity > 50,
      trending: false,
      
      // Timestamps
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSyncAt: new Date()
    };
  }

  // Enviar estatísticas
  async sendSyncStats() {
    try {
      // Aqui você poderia enviar para um serviço de analytics
      const stats = {
        ...this.stats,
        timestamp: new Date(),
        totalContent: await Media.countDocuments({ isActive: true }),
        contentByType: await Media.aggregate([
          { $match: { isActive: true } },
          { $group: { _id: '$type', count: { $sum: 1 } } }
        ])
      };

      logger.info('📊 Sync statistics:', JSON.stringify(stats, null, 2));

    } catch (error) {
      logger.error('Error sending sync stats:', error);
    }
  }

  // Configurar jobs automáticos (como o Acteia faz)
  setupCronJobs() {
    logger.info('⏰ Setting up cron jobs...');

    // Sincronização completa semanal (domingo às 2h)
    cron.schedule('0 2 * * 0', () => {
      logger.info('⏰ Running scheduled full sync');
      this.fullSync();
    }, {
      scheduled: true,
      timezone: "America/Sao_Paulo"
    });

    // Novos lançamentos diário (6h)
    cron.schedule('0 6 * * *', () => {
      logger.info('⏰ Running scheduled new releases sync');
      this.syncNewReleases();
    }, {
      scheduled: true,
      timezone: "America/Sao_Paulo"
    });

    // Atualização de trending a cada 4 horas
    cron.schedule('0 */4 * * *', () => {
      logger.info('⏰ Running scheduled trending sync');
      this.syncTrendingContent();
    }, {
      scheduled: true,
      timezone: "America/Sao_Paulo"
    });

    // Limpeza semanal (segunda às 3h)
    cron.schedule('0 3 * * 1', () => {
      logger.info('⏰ Running scheduled cleanup');
      this.cleanupObsoleteContent();
    }, {
      scheduled: true,
      timezone: "America/Sao_Paulo"
    });

    logger.info('✅ Cron jobs configured');
  }

  // Sincronizar apenas novos lançamentos
  async syncNewReleases() {
    if (this.isRunning) return;

    this.isRunning = true;
    logger.info('🆕 Syncing new releases...');

    try {
      const upcomingMovies = await tmdbService.getUpcomingMovies();
      const nowPlayingMovies = await tmdbService.getNowPlayingMovies();
      
      let newReleases = 0;
      
      // Processar filmes em cartaz
      const nowPlayingBatch = nowPlayingMovies.results
        .filter(movie => movie.rating.tmdb.average >= 6.0)
        .slice(0, 20);
      newReleases += await this.processBatch(nowPlayingBatch, 'movie');
      
      // Processar próximos lançamentos
      const upcomingBatch = upcomingMovies.results
        .filter(movie => movie.rating.tmdb.average >= 7.0)
        .slice(0, 10);
      newReleases += await this.processBatch(upcomingBatch, 'movie');
      
      logger.info(`✅ ${newReleases} new releases added`);

    } catch (error) {
      logger.error('❌ Error syncing new releases:', error);
    } finally {
      this.isRunning = false;
    }
  }

  // Helpers
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  resetStats() {
    this.stats = {
      totalSynced: 0,
      moviesAdded: 0,
      seriesAdded: 0,
      animesAdded: 0,
      updated: 0,
      errors: 0,
      startTime: new Date(),
      endTime: null
    };
  }

  // Obter estatísticas do catálogo
  async getCatalogStats() {
    try {
      const stats = await Media.aggregate([
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            avgRating: { $avg: '$rating.tmdb.average' },
            totalViews: { $sum: '$analytics.views' }
          }
        }
      ]);

      const totalContent = await Media.countDocuments({ isActive: true });
      const recentlyAdded = await Media.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      });

      return {
        totalContent,
        recentlyAdded,
        byType: stats,
        lastSync: new Date()
      };

    } catch (error) {
      logger.error('Error getting catalog stats:', error);
      throw error;
    }
  }
}

// Instância global
const catalogSyncer = new CatalogSyncer();

// Função para iniciar cron jobs
const startCronJobs = async () => {
  const initialized = await catalogSyncer.initialize();
  if (initialized) {
    catalogSyncer.setupCronJobs();
    logger.info('🤖 Catalog sync cron jobs started');
  }
};

// Função para executar sync manual
const runManualSync = async (type = 'full') => {
  switch (type) {
    case 'full':
      return await catalogSyncer.fullSync();
    case 'releases':
      return await catalogSyncer.syncNewReleases();
    case 'trending':
      return await catalogSyncer.syncTrendingContent();
    case 'cleanup':
      return await catalogSyncer.cleanupObsoleteContent();
    default:
      throw new Error('Invalid sync type');
  }
};

// CLI interface (para executar manualmente)
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'full';

  (async () => {
    try {
      // Conectar ao banco se não estiver conectado
      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(process.env.MONGODB_URI);
      }

      await catalogSyncer.initialize();

      switch (command) {
        case 'full':
          await catalogSyncer.fullSync();
          break;
        case 'releases':
          await catalogSyncer.syncNewReleases();
          break;
        case 'trending':
          await catalogSyncer.syncTrendingContent();
          break;
        case 'cleanup':
          await catalogSyncer.cleanupObsoleteContent();
          break;
        case 'stats':
          const stats = await catalogSyncer.getCatalogStats();
          console.log('📊 Catalog Statistics:');
          console.log(JSON.stringify(stats, null, 2));
          break;
        default:
          console.log(`
StreamVault Brasil - Catalog Syncer

Usage: node syncCatalog.js <command>

Commands:
  full      - Full catalog synchronization
  releases  - Sync new releases only
  trending  - Update trending content
  cleanup   - Clean obsolete content
  stats     - Show catalog statistics

Examples:
  node syncCatalog.js full
  node syncCatalog.js releases
  node syncCatalog.js stats
          `);
          break;
      }

      process.exit(0);

    } catch (error) {
      logger.error('❌ Fatal error:', error);
      process.exit(1);
    }
  })();
}

module.exports = {
  catalogSyncer,
  startCronJobs,
  runManualSync
};
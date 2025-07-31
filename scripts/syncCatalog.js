#!/usr/bin/env node

/**
 * StreamVault Brasil - Script de Sincronização do Catálogo
 * 
 * Script similar ao que o Acteia usa para manter o catálogo atualizado
 * automaticamente com dados do TMDB e links de provedores oficiais.
 * 
 * Funcionalidades:
 * - Sincronização automática com TMDB
 * - Atualização de metadados
 * - Descoberta de novos lançamentos
 * - Atualização de provedores disponíveis
 * - Limpeza de conteúdo obsoleto
 * 
 * Uso: node scripts/syncCatalog.js [opções]
 */

const mongoose = require('mongoose');
const cron = require('node-cron');
const contentAggregator = require('../services/contentAggregator');
const tmdbService = require('../services/tmdbService');
const logger = require('../utils/logger');

// Configurações do script
const SYNC_CONFIG = {
  // Horários de sincronização (formato cron)
  schedules: {
    fullSync: '0 2 * * 0', // Domingo às 2h - sincronização completa
    newReleases: '0 6 * * *', // Diário às 6h - novos lançamentos
    updateExisting: '0 14 * * *', // Diário às 14h - atualizar existente
    trending: '0 */4 * * *' // A cada 4 horas - conteúdo em alta
  },
  
  // Limites para não sobrecarregar a API
  limits: {
    maxPagesPerSync: 20,
    minRating: 6.0,
    maxItemsPerGenre: 50,
    apiDelay: 250 // ms entre requests
  },
  
  // Gêneros prioritários (IDs do TMDB)
  priorityGenres: {
    movies: [28, 35, 18, 53, 878, 27], // Ação, Comédia, Drama, Thriller, Sci-Fi, Terror
    tv: [18, 35, 80, 10759, 9648] // Drama, Comédia, Crime, Ação & Aventura, Mistério
  },
  
  // Países/regiões de interesse
  regions: ['BR', 'US', 'GB'], // Brasil, EUA, Reino Unido
  
  // Idiomas prioritários
  languages: ['pt', 'en', 'es', 'ja'] // Português, Inglês, Espanhol, Japonês
};

class CatalogSyncer {
  constructor() {
    this.isRunning = false;
    this.stats = {
      totalSynced: 0,
      moviesAdded: 0,
      seriesAdded: 0,
      updated: 0,
      errors: 0,
      startTime: null,
      endTime: null
    };
  }

  // Inicializar sincronizador
  async initialize() {
    try {
      // Conectar ao MongoDB
      await mongoose.connect(process.env.MONGODB_URI);
      logger.info('🔗 Conectado ao MongoDB para sincronização');

      // Verificar se TMDB API está configurada
      if (!process.env.TMDB_API_KEY) {
        throw new Error('TMDB_API_KEY não configurado');
      }

      logger.info('✅ Sincronizador inicializado com sucesso');
      return true;

    } catch (error) {
      logger.error('❌ Erro ao inicializar sincronizador:', error);
      return false;
    }
  }

  // Sincronização completa (como o Acteia faz)
  async fullSync() {
    if (this.isRunning) {
      logger.warn('⚠️ Sincronização já em andamento');
      return;
    }

    this.isRunning = true;
    this.resetStats();
    
    logger.info('🚀 Iniciando sincronização completa do catálogo...');

    try {
      // 1. Sincronizar filmes populares
      await this.syncPopularMovies();
      
      // 2. Sincronizar séries populares
      await this.syncPopularSeries();
      
      // 3. Sincronizar por gêneros prioritários
      await this.syncByGenres();
      
      // 4. Sincronizar conteúdo brasileiro
      await this.syncBrazilianContent();
      
      // 5. Sincronizar animes populares
      await this.syncAnimeContent();
      
      // 6. Atualizar conteúdo existente
      await this.updateExistingContent();
      
      // 7. Limpar conteúdo obsoleto
      await this.cleanupObsoleteContent();

      this.stats.endTime = new Date();
      const duration = (this.stats.endTime - this.stats.startTime) / 1000 / 60; // minutos

      logger.info(`✅ Sincronização completa finalizada em ${duration.toFixed(1)} minutos`);
      logger.info(`📊 Estatísticas: ${this.stats.moviesAdded} filmes, ${this.stats.seriesAdded} séries, ${this.stats.updated} atualizados`);

    } catch (error) {
      logger.error('❌ Erro na sincronização completa:', error);
      this.stats.errors++;
    } finally {
      this.isRunning = false;
    }
  }

  // Sincronizar apenas novos lançamentos
  async syncNewReleases() {
    if (this.isRunning) return;

    this.isRunning = true;
    logger.info('🆕 Sincronizando novos lançamentos...');

    try {
      const newReleases = await contentAggregator.syncNewReleases();
      logger.info(`✅ ${newReleases} novos lançamentos adicionados`);

    } catch (error) {
      logger.error('❌ Erro ao sincronizar lançamentos:', error);
    } finally {
      this.isRunning = false;
    }
  }

  // Sincronizar filmes populares
  async syncPopularMovies() {
    logger.info('🎬 Sincronizando filmes populares...');
    
    try {
      let moviesAdded = 0;
      
      for (let page = 1; page <= SYNC_CONFIG.limits.maxPagesPerSync; page++) {
        const popularMovies = await tmdbService.getPopularMovies(page);
        
        for (const movie of popularMovies.results) {
          if (movie.rating.tmdb >= SYNC_CONFIG.limits.minRating) {
            const result = await contentAggregator.processAndSaveMovie(movie.tmdbId);
            if (result) moviesAdded++;
          }
        }

        await this.delay(SYNC_CONFIG.limits.apiDelay);
      }

      // Também buscar filmes em cartaz
      const nowPlaying = await tmdbService.getNowPlayingMovies();
      for (const movie of nowPlaying.results.slice(0, 20)) {
        if (movie.rating.tmdb >= SYNC_CONFIG.limits.minRating) {
          const result = await contentAggregator.processAndSaveMovie(movie.tmdbId);
          if (result) moviesAdded++;
        }
        await this.delay(SYNC_CONFIG.limits.apiDelay);
      }

      this.stats.moviesAdded += moviesAdded;
      logger.info(`✅ ${moviesAdded} filmes populares processados`);

    } catch (error) {
      logger.error('❌ Erro ao sincronizar filmes populares:', error);
      this.stats.errors++;
    }
  }

  // Sincronizar séries populares
  async syncPopularSeries() {
    logger.info('📺 Sincronizando séries populares...');
    
    try {
      let seriesAdded = 0;
      
      for (let page = 1; page <= SYNC_CONFIG.limits.maxPagesPerSync; page++) {
        const popularSeries = await tmdbService.getPopularTVShows(page);
        
        for (const series of popularSeries.results) {
          if (series.rating.tmdb >= SYNC_CONFIG.limits.minRating) {
            const result = await contentAggregator.processAndSaveTVShow(series.tmdbId);
            if (result) seriesAdded++;
          }
        }

        await this.delay(SYNC_CONFIG.limits.apiDelay);
      }

      this.stats.seriesAdded += seriesAdded;
      logger.info(`✅ ${seriesAdded} séries populares processadas`);

    } catch (error) {
      logger.error('❌ Erro ao sincronizar séries populares:', error);
      this.stats.errors++;
    }
  }

  // Sincronizar por gêneros
  async syncByGenres() {
    logger.info('🎭 Sincronizando por gêneros prioritários...');

    try {
      // Filmes por gênero
      for (const genreId of SYNC_CONFIG.priorityGenres.movies) {
        const movies = await tmdbService.discoverMovies({
          with_genres: genreId,
          'vote_average.gte': SYNC_CONFIG.limits.minRating,
          sort_by: 'popularity.desc'
        });

        let count = 0;
        for (const movie of movies.results.slice(0, SYNC_CONFIG.limits.maxItemsPerGenre)) {
          const result = await contentAggregator.processAndSaveMovie(movie.tmdbId);
          if (result) count++;
          await this.delay(SYNC_CONFIG.limits.apiDelay);
        }

        logger.debug(`📊 Gênero ${genreId}: ${count} filmes processados`);
      }

      // Séries por gênero
      for (const genreId of SYNC_CONFIG.priorityGenres.tv) {
        const series = await tmdbService.discoverTVShows({
          with_genres: genreId,
          'vote_average.gte': SYNC_CONFIG.limits.minRating,
          sort_by: 'popularity.desc'
        });

        let count = 0;
        for (const show of series.results.slice(0, SYNC_CONFIG.limits.maxItemsPerGenre)) {
          const result = await contentAggregator.processAndSaveTVShow(show.tmdbId);
          if (result) count++;
          await this.delay(SYNC_CONFIG.limits.apiDelay);
        }

        logger.debug(`📊 Gênero ${genreId}: ${count} séries processadas`);
      }

      logger.info('✅ Sincronização por gêneros concluída');

    } catch (error) {
      logger.error('❌ Erro ao sincronizar por gêneros:', error);
      this.stats.errors++;
    }
  }

  // Sincronizar conteúdo brasileiro
  async syncBrazilianContent() {
    logger.info('🇧🇷 Sincronizando conteúdo brasileiro...');

    try {
      // Filmes brasileiros
      const brazilianMovies = await tmdbService.discoverMovies({
        with_origin_country: 'BR',
        sort_by: 'popularity.desc',
        'vote_average.gte': 5.0 // Critério mais baixo para conteúdo nacional
      });

      let moviesCount = 0;
      for (const movie of brazilianMovies.results) {
        const result = await contentAggregator.processAndSaveMovie(movie.tmdbId);
        if (result) moviesCount++;
        await this.delay(SYNC_CONFIG.limits.apiDelay);
      }

      // Séries brasileiras
      const brazilianSeries = await tmdbService.discoverTVShows({
        with_origin_country: 'BR',
        sort_by: 'popularity.desc',
        'vote_average.gte': 5.0
      });

      let seriesCount = 0;
      for (const series of brazilianSeries.results) {
        const result = await contentAggregator.processAndSaveTVShow(series.tmdbId);
        if (result) seriesCount++;
        await this.delay(SYNC_CONFIG.limits.apiDelay);
      }

      logger.info(`✅ Conteúdo brasileiro: ${moviesCount} filmes, ${seriesCount} séries`);

    } catch (error) {
      logger.error('❌ Erro ao sincronizar conteúdo brasileiro:', error);
      this.stats.errors++;
    }
  }

  // Sincronizar animes
  async syncAnimeContent() {
    logger.info('🎌 Sincronizando animes...');

    try {
      // Animes populares (gênero 16 = animação + origem japonesa)
      const animes = await tmdbService.discoverTVShows({
        with_genres: 16,
        with_origin_country: 'JP',
        sort_by: 'popularity.desc',
        'vote_average.gte': 6.5
      });

      let animeCount = 0;
      for (const anime of animes.results.slice(0, 100)) { // Limitar a 100 animes
        const result = await contentAggregator.processAndSaveTVShow(anime.tmdbId);
        if (result) animeCount++;
        await this.delay(SYNC_CONFIG.limits.apiDelay);
      }

      logger.info(`✅ ${animeCount} animes processados`);

    } catch (error) {
      logger.error('❌ Erro ao sincronizar animes:', error);
      this.stats.errors++;
    }
  }

  // Atualizar conteúdo existente
  async updateExistingContent() {
    logger.info('🔄 Atualizando conteúdo existente...');

    try {
      const updated = await contentAggregator.updateExistingContent();
      this.stats.updated += updated;
      logger.info(`✅ ${updated} itens atualizados`);

    } catch (error) {
      logger.error('❌ Erro ao atualizar conteúdo:', error);
      this.stats.errors++;
    }
  }

  // Limpar conteúdo obsoleto
  async cleanupObsoleteContent() {
    logger.info('🧹 Limpando conteúdo obsoleto...');

    try {
      const Media = require('../models/Media');
      
      // Marcar como inativo conteúdo muito antigo sem visualizações
      const obsoleteContent = await Media.updateMany({
        isActive: true,
        'analytics.views': { $lt: 10 },
        createdAt: { $lt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }, // 1 ano
        rating: { 'tmdb.average': { $lt: 5.0 } }
      }, {
        isActive: false,
        updatedAt: new Date()
      });

      logger.info(`✅ ${obsoleteContent.modifiedCount} itens obsoletos marcados como inativos`);

    } catch (error) {
      logger.error('❌ Erro na limpeza:', error);
      this.stats.errors++;
    }
  }

  // Configurar agendamentos automáticos
  setupScheduledTasks() {
    logger.info('⏰ Configurando tarefas agendadas...');

    // Sincronização completa semanal
    cron.schedule(SYNC_CONFIG.schedules.fullSync, () => {
      logger.info('⏰ Executando sincronização completa agendada');
      this.fullSync();
    }, {
      scheduled: true,
      timezone: "America/Sao_Paulo"
    });

    // Novos lançamentos diário
    cron.schedule(SYNC_CONFIG.schedules.newReleases, () => {
      logger.info('⏰ Executando sincronização de lançamentos agendada');
      this.syncNewReleases();
    }, {
      scheduled: true,
      timezone: "America/Sao_Paulo"
    });

    // Atualização de existente diário
    cron.schedule(SYNC_CONFIG.schedules.updateExisting, () => {
      logger.info('⏰ Executando atualização de conteúdo agendada');
      this.updateExistingContent();
    }, {
      scheduled: true,
      timezone: "America/Sao_Paulo"
    });

    // Conteúdo em alta a cada 4 horas
    cron.schedule(SYNC_CONFIG.schedules.trending, () => {
      logger.info('⏰ Executando sincronização de trending agendada');
      this.syncTrendingContent();
    }, {
      scheduled: true,
      timezone: "America/Sao_Paulo"
    });

    logger.info('✅ Tarefas agendadas configuradas');
  }

  // Sincronizar conteúdo em alta
  async syncTrendingContent() {
    if (this.isRunning) return;

    this.isRunning = true;
    logger.info('📈 Sincronizando conteúdo em alta...');

    try {
      // Marcar conteúdo popular como trending
      const Media = require('../models/Media');
      
      // Resetar trending anterior
      await Media.updateMany({}, { trending: false });

      // Buscar filmes populares recentes
      const trendingMovies = await tmdbService.getPopularMovies(1);
      const movieIds = trendingMovies.results.slice(0, 20).map(m => m.tmdbId);

      await Media.updateMany(
        { tmdbId: { $in: movieIds }, type: 'movie' },
        { trending: true, updatedAt: new Date() }
      );

      // Buscar séries populares recentes
      const trendingSeries = await tmdbService.getPopularTVShows(1);
      const seriesIds = trendingSeries.results.slice(0, 20).map(s => s.tmdbId);

      await Media.updateMany(
        { tmdbId: { $in: seriesIds }, type: 'series' },
        { trending: true, updatedAt: new Date() }
      );

      logger.info('✅ Conteúdo trending atualizado');

    } catch (error) {
      logger.error('❌ Erro ao sincronizar trending:', error);
    } finally {
      this.isRunning = false;
    }
  }

  // Buscar conteúdo específico por ID
  async fetchSpecificContent(tmdbId, type) {
    try {
      logger.info(`🔍 Buscando conteúdo específico: ${type}/${tmdbId}`);
      
      const result = await contentAggregator.fetchSpecificContent(tmdbId, type);
      
      if (result) {
        logger.info(`✅ Conteúdo adicionado: ${result.title}`);
        return result;
      } else {
        logger.warn(`⚠️ Conteúdo não encontrado: ${tmdbId}`);
        return null;
      }

    } catch (error) {
      logger.error(`❌ Erro ao buscar conteúdo ${tmdbId}:`, error);
      return null;
    }
  }

  // Obter estatísticas do catálogo
  async getCatalogStats() {
    try {
      const stats = await contentAggregator.getCatalogStats();
      
      logger.info('📊 Estatísticas do Catálogo:');
      logger.info(`   Total de conteúdo: ${stats.totalContent}`);
      logger.info(`   Adicionado recentemente: ${stats.recentlyAdded}`);
      
      stats.byType.forEach(type => {
        logger.info(`   ${type._id}: ${type.count} itens (média: ${type.avgRating.toFixed(1)})`);
      });

      return stats;

    } catch (error) {
      logger.error('❌ Erro ao obter estatísticas:', error);
      return null;
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
      updated: 0,
      errors: 0,
      startTime: new Date(),
      endTime: null
    };
  }
}

// Função principal
async function main() {
  const syncer = new CatalogSyncer();
  
  // Processar argumentos da linha de comando
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    const initialized = await syncer.initialize();
    if (!initialized) {
      process.exit(1);
    }

    switch (command) {
      case 'full':
        await syncer.fullSync();
        break;
        
      case 'releases':
        await syncer.syncNewReleases();
        break;
        
      case 'update':
        await syncer.updateExistingContent();
        break;
        
      case 'trending':
        await syncer.syncTrendingContent();
        break;
        
      case 'stats':
        await syncer.getCatalogStats();
        break;
        
      case 'fetch':
        const tmdbId = args[1];
        const type = args[2] || 'movie';
        if (!tmdbId) {
          console.log('Uso: node scripts/syncCatalog.js fetch <tmdbId> [movie|series]');
          process.exit(1);
        }
        await syncer.fetchSpecificContent(parseInt(tmdbId), type);
        break;
        
      case 'daemon':
        logger.info('🤖 Iniciando modo daemon com tarefas agendadas...');
        syncer.setupScheduledTasks();
        // Manter processo rodando
        setInterval(() => {}, 1000);
        break;
        
      default:
        console.log(`
StreamVault Brasil - Sincronizador de Catálogo

Uso: node scripts/syncCatalog.js <comando>

Comandos disponíveis:
  full      - Sincronização completa do catálogo
  releases  - Sincronizar apenas novos lançamentos
  update    - Atualizar conteúdo existente
  trending  - Atualizar conteúdo em alta
  stats     - Mostrar estatísticas do catálogo
  fetch     - Buscar conteúdo específico por TMDB ID
  daemon    - Executar em modo daemon com agendamentos

Exemplos:
  node scripts/syncCatalog.js full
  node scripts/syncCatalog.js fetch 550 movie
  node scripts/syncCatalog.js daemon
        `);
        break;
    }

    if (command !== 'daemon') {
      await mongoose.disconnect();
      process.exit(0);
    }

  } catch (error) {
    logger.error('❌ Erro fatal:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main();
}

module.exports = CatalogSyncer;
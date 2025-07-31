const tmdbService = require('./tmdbService');
const Media = require('../models/Media');
const logger = require('../utils/logger');

class ContentAggregator {
  constructor() {
    // Mapeamento de provedores brasileiros
    this.providerMapping = {
      8: 'Netflix',
      119: 'Amazon Prime Video',
      337: 'Disney+',
      384: 'HBO Max',
      307: 'Globoplay',
      619: 'Paramount+',
      350: 'Apple TV+',
      283: 'Crunchyroll',
      26: 'Telecine',
      // Adicione mais provedores conforme necessário
    };

    // Gêneros TMDB para nossos gêneros
    this.genreMapping = {
      28: 'Ação',
      12: 'Aventura',
      16: 'Animação',
      35: 'Comédia',
      80: 'Crime',
      99: 'Documentário',
      18: 'Drama',
      10751: 'Família',
      14: 'Fantasia',
      36: 'História',
      27: 'Terror',
      10402: 'Música',
      9648: 'Mistério',
      10749: 'Romance',
      878: 'Ficção Científica',
      10770: 'Filme para TV',
      53: 'Thriller',
      10752: 'Guerra',
      37: 'Faroeste',
      // TV Genres
      10759: 'Ação & Aventura',
      16: 'Animação',
      35: 'Comédia',
      80: 'Crime',
      99: 'Documentário',
      18: 'Drama',
      10751: 'Família',
      10762: 'Infantil',
      9648: 'Mistério',
      10763: 'Notícias',
      10764: 'Reality',
      10765: 'Sci-Fi & Fantasy',
      10766: 'Novela',
      10767: 'Talk Show',
      10768: 'Guerra & Política',
      37: 'Faroeste'
    };
  }

  // Sincronizar catálogo completo do TMDB
  async syncCatalog(options = {}) {
    const {
      includeMovies = true,
      includeTVShows = true,
      maxPages = 10,
      genres = [],
      minRating = 6.0
    } = options;

    logger.info('Iniciando sincronização do catálogo...');

    try {
      let totalSynced = 0;

      if (includeMovies) {
        totalSynced += await this.syncMovies(maxPages, genres, minRating);
      }

      if (includeTVShows) {
        totalSynced += await this.syncTVShows(maxPages, genres, minRating);
      }

      logger.info(`Sincronização concluída. Total de itens processados: ${totalSynced}`);
      return { success: true, totalSynced };

    } catch (error) {
      logger.error('Erro na sincronização do catálogo:', error);
      throw error;
    }
  }

  // Sincronizar filmes
  async syncMovies(maxPages = 10, genres = [], minRating = 6.0) {
    let totalMovies = 0;

    try {
      // Buscar filmes populares
      for (let page = 1; page <= maxPages; page++) {
        const popularMovies = await tmdbService.getPopularMovies(page);
        
        for (const movie of popularMovies.results) {
          if (movie.rating.tmdb >= minRating) {
            await this.processAndSaveMovie(movie.tmdbId);
            totalMovies++;
          }
        }

        // Delay para não sobrecarregar a API
        await this.delay(200);
      }

      // Buscar por gêneros específicos se fornecidos
      if (genres.length > 0) {
        for (const genreId of genres) {
          const genreMovies = await tmdbService.discoverMovies({
            with_genres: genreId,
            'vote_average.gte': minRating,
            page: 1
          });

          for (const movie of genreMovies.results.slice(0, 20)) { // Limitar a 20 por gênero
            await this.processAndSaveMovie(movie.tmdbId);
            totalMovies++;
          }

          await this.delay(200);
        }
      }

      logger.info(`${totalMovies} filmes sincronizados`);
      return totalMovies;

    } catch (error) {
      logger.error('Erro ao sincronizar filmes:', error);
      throw error;
    }
  }

  // Sincronizar séries
  async syncTVShows(maxPages = 10, genres = [], minRating = 6.0) {
    let totalShows = 0;

    try {
      // Buscar séries populares
      for (let page = 1; page <= maxPages; page++) {
        const popularShows = await tmdbService.getPopularTVShows(page);
        
        for (const show of popularShows.results) {
          if (show.rating.tmdb >= minRating) {
            await this.processAndSaveTVShow(show.tmdbId);
            totalShows++;
          }
        }

        await this.delay(200);
      }

      // Buscar por gêneros específicos
      if (genres.length > 0) {
        for (const genreId of genres) {
          const genreShows = await tmdbService.discoverTVShows({
            with_genres: genreId,
            'vote_average.gte': minRating,
            page: 1
          });

          for (const show of genreShows.results.slice(0, 20)) {
            await this.processAndSaveTVShow(show.tmdbId);
            totalShows++;
          }

          await this.delay(200);
        }
      }

      logger.info(`${totalShows} séries sincronizadas`);
      return totalShows;

    } catch (error) {
      logger.error('Erro ao sincronizar séries:', error);
      throw error;
    }
  }

  // Processar e salvar filme
  async processAndSaveMovie(tmdbId) {
    try {
      // Verificar se já existe
      const existingMedia = await Media.findOne({ tmdbId, type: 'movie' });
      if (existingMedia) {
        logger.debug(`Filme ${tmdbId} já existe no banco`);
        return existingMedia;
      }

      // Buscar detalhes completos
      const movieDetails = await tmdbService.getMovieDetails(tmdbId);
      
      // Converter para nosso formato
      const mediaData = await this.convertMovieToMediaFormat(movieDetails);
      
      // Salvar no banco
      const media = new Media(mediaData);
      await media.save();

      logger.debug(`Filme salvo: ${movieDetails.title} (${movieDetails.year})`);
      return media;

    } catch (error) {
      logger.error(`Erro ao processar filme ${tmdbId}:`, error);
      return null;
    }
  }

  // Processar e salvar série
  async processAndSaveTVShow(tmdbId) {
    try {
      // Verificar se já existe
      const existingMedia = await Media.findOne({ tmdbId, type: 'series' });
      if (existingMedia) {
        logger.debug(`Série ${tmdbId} já existe no banco`);
        return existingMedia;
      }

      // Buscar detalhes completos
      const tvDetails = await tmdbService.getTVDetails(tmdbId);
      
      // Converter para nosso formato
      const mediaData = await this.convertTVToMediaFormat(tvDetails);
      
      // Salvar no banco
      const media = new Media(mediaData);
      await media.save();

      logger.debug(`Série salva: ${tvDetails.title} (${tvDetails.year})`);
      return media;

    } catch (error) {
      logger.error(`Erro ao processar série ${tmdbId}:`, error);
      return null;
    }
  }

  // Converter filme TMDB para nosso formato
  async convertMovieToMediaFormat(movieDetails) {
    return {
      // IDs de referência
      tmdbId: movieDetails.tmdbId,
      imdbId: movieDetails.imdbId,
      
      // Informações básicas
      title: movieDetails.title,
      originalTitle: movieDetails.originalTitle,
      type: 'movie',
      year: movieDetails.year,
      releaseDate: movieDetails.releaseDate,
      
      // Conteúdo
      description: movieDetails.description,
      tagline: movieDetails.tagline,
      duration: movieDetails.duration,
      
      // Visuais
      poster: movieDetails.poster,
      backdrop: movieDetails.backdrop,
      
      // Classificação
      genre: this.mapGenres(movieDetails.genreIds),
      rating: {
        ageRating: movieDetails.rating.ageRating,
        tmdb: {
          average: movieDetails.rating.tmdb,
          count: movieDetails.rating.tmdbCount
        },
        internal: {
          average: 0,
          count: 0
        }
      },
      
      // Produção
      cast: movieDetails.cast?.map(actor => ({
        name: actor.name,
        character: actor.character,
        profileImage: actor.profilePath
      })) || [],
      
      crew: movieDetails.crew?.map(person => ({
        name: person.name,
        job: person.job,
        department: person.department
      })) || [],
      
      productionCompanies: movieDetails.productionCompanies?.map(company => company.name) || [],
      productionCountries: movieDetails.productionCountries?.map(country => country.name) || [],
      
      // Idiomas
      originalLanguage: movieDetails.originalLanguage,
      spokenLanguages: movieDetails.spokenLanguages?.map(lang => lang.name) || [],
      
      // Disponibilidade
      availableOn: this.extractAvailableProviders(movieDetails.watchProviders),
      
      // Streaming info (será preenchido posteriormente)
      streamingInfo: {
        quality: ['HD', '4K'],
        subtitles: ['pt-BR', 'en'],
        dubbing: ['pt-BR'],
        downloadable: true
      },
      
      // URLs e embed
      slug: tmdbService.generateSlug(movieDetails.title),
      embedUrl: `/embed/movie/${movieDetails.tmdbId}`,
      
      // Metadados
      keywords: movieDetails.keywords || [],
      popularity: movieDetails.popularity,
      status: movieDetails.status,
      
      // Controle
      isActive: true,
      featured: movieDetails.popularity > 50, // Destacar filmes populares
      trending: movieDetails.popularity > 100,
      
      // Timestamps
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSyncAt: new Date()
    };
  }

  // Converter série TMDB para nosso formato
  async convertTVToMediaFormat(tvDetails) {
    return {
      // IDs de referência
      tmdbId: tvDetails.tmdbId,
      
      // Informações básicas
      title: tvDetails.title,
      originalTitle: tvDetails.originalTitle,
      type: 'series',
      year: tvDetails.year,
      firstAirDate: tvDetails.firstAirDate,
      lastAirDate: tvDetails.lastAirDate,
      
      // Conteúdo
      description: tvDetails.description,
      tagline: tvDetails.tagline,
      
      // Visuais
      poster: tvDetails.poster,
      backdrop: tvDetails.backdrop,
      
      // Classificação
      genre: this.mapGenres(tvDetails.genreIds),
      rating: {
        ageRating: tvDetails.rating.ageRating,
        tmdb: {
          average: tvDetails.rating.tmdb,
          count: tvDetails.rating.tmdbCount
        },
        internal: {
          average: 0,
          count: 0
        }
      },
      
      // Estrutura da série
      seasons: tvDetails.seasons?.map(season => ({
        seasonNumber: season.seasonNumber,
        name: season.name,
        overview: season.overview,
        airDate: season.airDate,
        episodeCount: season.episodeCount,
        poster: season.poster,
        episodes: [] // Será preenchido posteriormente se necessário
      })) || [],
      
      totalSeasons: tvDetails.numberOfSeasons,
      totalEpisodes: tvDetails.numberOfEpisodes,
      episodeRuntime: tvDetails.episodeRunTime?.[0] || 45,
      
      // Produção
      cast: tvDetails.cast?.map(actor => ({
        name: actor.name,
        character: actor.character,
        profileImage: actor.profilePath
      })) || [],
      
      crew: tvDetails.crew?.map(person => ({
        name: person.name,
        job: person.job,
        department: person.department
      })) || [],
      
      productionCompanies: tvDetails.productionCompanies?.map(company => company.name) || [],
      networks: tvDetails.networks?.map(network => network.name) || [],
      
      // Idiomas
      originalLanguage: tvDetails.originalLanguage,
      spokenLanguages: tvDetails.spokenLanguages?.map(lang => lang.name) || [],
      originCountry: tvDetails.originCountry || [],
      
      // Disponibilidade
      availableOn: this.extractAvailableProviders(tvDetails.watchProviders),
      
      // Streaming info
      streamingInfo: {
        quality: ['HD', '4K'],
        subtitles: ['pt-BR', 'en'],
        dubbing: ['pt-BR'],
        downloadable: true
      },
      
      // URLs e embed
      slug: tmdbService.generateSlug(tvDetails.title),
      embedUrl: `/embed/series/${tvDetails.tmdbId}`,
      
      // Metadados
      keywords: tvDetails.keywords || [],
      popularity: tvDetails.popularity,
      status: tvDetails.status,
      
      // Controle
      isActive: true,
      featured: tvDetails.popularity > 50,
      trending: tvDetails.popularity > 100,
      
      // Timestamps
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSyncAt: new Date()
    };
  }

  // Mapear gêneros TMDB para nossos gêneros
  mapGenres(genreIds) {
    if (!genreIds || !Array.isArray(genreIds)) return [];
    
    return genreIds
      .map(id => this.genreMapping[id])
      .filter(Boolean);
  }

  // Extrair provedores disponíveis
  extractAvailableProviders(watchProviders) {
    const providers = [];
    
    if (!watchProviders) return providers;
    
    // Adicionar provedores de streaming
    if (watchProviders.flatrate) {
      watchProviders.flatrate.forEach(provider => {
        const providerName = this.providerMapping[provider.providerId] || provider.providerName;
        providers.push(providerName);
      });
    }
    
    // Adicionar provedores de aluguel (opcional)
    if (watchProviders.rent) {
      watchProviders.rent.forEach(provider => {
        const providerName = this.providerMapping[provider.providerId] || provider.providerName;
        if (!providers.includes(providerName)) {
          providers.push(`${providerName} (Aluguel)`);
        }
      });
    }
    
    return providers;
  }

  // Atualizar conteúdo existente
  async updateExistingContent() {
    try {
      logger.info('Atualizando conteúdo existente...');
      
      const existingMedia = await Media.find({
        tmdbId: { $exists: true },
        lastSyncAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Mais de 7 dias
      }).limit(100);

      let updated = 0;

      for (const media of existingMedia) {
        try {
          let updatedDetails;
          
          if (media.type === 'movie') {
            updatedDetails = await tmdbService.getMovieDetails(media.tmdbId);
            const updatedData = await this.convertMovieToMediaFormat(updatedDetails);
            
            // Manter dados específicos da nossa plataforma
            updatedData._id = media._id;
            updatedData.createdAt = media.createdAt;
            updatedData.views = media.views;
            updatedData.rating.internal = media.rating.internal;
            
            await Media.findByIdAndUpdate(media._id, updatedData);
          } else if (media.type === 'series') {
            updatedDetails = await tmdbService.getTVDetails(media.tmdbId);
            const updatedData = await this.convertTVToMediaFormat(updatedDetails);
            
            updatedData._id = media._id;
            updatedData.createdAt = media.createdAt;
            updatedData.views = media.views;
            updatedData.rating.internal = media.rating.internal;
            
            await Media.findByIdAndUpdate(media._id, updatedData);
          }

          updated++;
          await this.delay(300);

        } catch (error) {
          logger.error(`Erro ao atualizar mídia ${media.tmdbId}:`, error);
        }
      }

      logger.info(`${updated} itens de conteúdo atualizados`);
      return updated;

    } catch (error) {
      logger.error('Erro ao atualizar conteúdo existente:', error);
      throw error;
    }
  }

  // Buscar lançamentos e adicionar automaticamente
  async syncNewReleases() {
    try {
      logger.info('Sincronizando novos lançamentos...');
      
      const upcomingMovies = await tmdbService.getUpcomingMovies();
      const nowPlayingMovies = await tmdbService.getNowPlayingMovies();
      
      let newReleases = 0;
      
      // Processar filmes em cartaz
      for (const movie of nowPlayingMovies.results.slice(0, 20)) {
        const existing = await Media.findOne({ tmdbId: movie.tmdbId, type: 'movie' });
        if (!existing && movie.rating.tmdb >= 6.0) {
          await this.processAndSaveMovie(movie.tmdbId);
          newReleases++;
        }
        await this.delay(200);
      }
      
      // Processar próximos lançamentos
      for (const movie of upcomingMovies.results.slice(0, 10)) {
        const existing = await Media.findOne({ tmdbId: movie.tmdbId, type: 'movie' });
        if (!existing && movie.rating.tmdb >= 7.0) { // Critério mais rigoroso para futuros lançamentos
          await this.processAndSaveMovie(movie.tmdbId);
          newReleases++;
        }
        await this.delay(200);
      }
      
      logger.info(`${newReleases} novos lançamentos adicionados`);
      return newReleases;

    } catch (error) {
      logger.error('Erro ao sincronizar novos lançamentos:', error);
      throw error;
    }
  }

  // Buscar conteúdo específico por ID
  async fetchSpecificContent(tmdbId, type) {
    try {
      if (type === 'movie') {
        return await this.processAndSaveMovie(tmdbId);
      } else if (type === 'series' || type === 'tv') {
        return await this.processAndSaveTVShow(tmdbId);
      }
      
      throw new Error('Tipo de conteúdo inválido');

    } catch (error) {
      logger.error(`Erro ao buscar conteúdo específico ${tmdbId}:`, error);
      throw error;
    }
  }

  // Delay helper
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Estatísticas do catálogo
  async getCatalogStats() {
    try {
      const stats = await Media.aggregate([
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            avgRating: { $avg: '$rating.tmdb.average' },
            totalViews: { $sum: '$views' }
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
      logger.error('Erro ao obter estatísticas do catálogo:', error);
      throw error;
    }
  }
}

module.exports = new ContentAggregator();
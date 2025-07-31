const axios = require('axios');
const NodeCache = require('node-cache');
const logger = require('../utils/logger');

class TMDBService {
  constructor() {
    this.apiKey = process.env.TMDB_API_KEY;
    this.baseURL = 'https://api.themoviedb.org/3';
    this.imageBaseURL = 'https://image.tmdb.org/t/p';
    
    // Configurações para o Brasil (como o Acteia faz)
    this.language = 'pt-BR';
    this.region = 'BR';
    
    // Cache para reduzir requests à API
    this.cache = new NodeCache({ 
      stdTTL: 3600, // 1 hora
      checkperiod: 600 // 10 minutos
    });
    
    // Rate limiting
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.requestDelay = 250; // 250ms entre requests
    
    // Mapeamento de gêneros TMDB para português
    this.genreMapping = {
      // Movie genres
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
      
      // TV genres
      10759: 'Ação & Aventura',
      10762: 'Infantil',
      10763: 'Notícias',
      10764: 'Reality',
      10765: 'Sci-Fi & Fantasy',
      10766: 'Novela',
      10767: 'Talk Show',
      10768: 'Guerra & Política'
    };
    
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
      26: 'Telecine Play',
      531: 'Paramount+ Amazon Channel',
      1899: 'Max Amazon Channel'
    };
  }

  // Fazer request com rate limiting e cache
  async makeRequest(endpoint, params = {}) {
    const cacheKey = `${endpoint}_${JSON.stringify(params)}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    return new Promise((resolve, reject) => {
      this.requestQueue.push({ endpoint, params, resolve, reject, cacheKey });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const { endpoint, params, resolve, reject, cacheKey } = this.requestQueue.shift();

      try {
        const response = await axios.get(`${this.baseURL}${endpoint}`, {
          params: {
            api_key: this.apiKey,
            language: this.language,
            region: this.region,
            ...params
          },
          timeout: 10000
        });

        this.cache.set(cacheKey, response.data);
        resolve(response.data);
      } catch (error) {
        logger.error(`TMDB API error for ${endpoint}:`, error.message);
        reject(error);
      }

      // Rate limiting delay
      if (this.requestQueue.length > 0) {
        await this.delay(this.requestDelay);
      }
    }

    this.isProcessingQueue = false;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Buscar filmes populares (como o Acteia faz)
  async getPopularMovies(page = 1) {
    try {
      const data = await this.makeRequest('/movie/popular', { page });
      return this.formatMoviesResponse(data);
    } catch (error) {
      logger.error('Error fetching popular movies:', error);
      throw error;
    }
  }

  // Buscar séries populares
  async getPopularTVShows(page = 1) {
    try {
      const data = await this.makeRequest('/tv/popular', { page });
      return this.formatTVResponse(data);
    } catch (error) {
      logger.error('Error fetching popular TV shows:', error);
      throw error;
    }
  }

  // Buscar detalhes completos de um filme (como o Acteia faz com IDs)
  async getMovieDetails(tmdbId) {
    try {
      const [movie, credits, videos, watchProviders, keywords, releases] = await Promise.all([
        this.makeRequest(`/movie/${tmdbId}`, { append_to_response: 'keywords,release_dates' }),
        this.makeRequest(`/movie/${tmdbId}/credits`),
        this.makeRequest(`/movie/${tmdbId}/videos`),
        this.makeRequest(`/movie/${tmdbId}/watch/providers`),
        this.makeRequest(`/movie/${tmdbId}/keywords`),
        this.makeRequest(`/movie/${tmdbId}/release_dates`)
      ]);

      return this.formatMovieDetails(movie, credits, videos, watchProviders, keywords, releases);
    } catch (error) {
      logger.error(`Error fetching movie details for ${tmdbId}:`, error);
      throw error;
    }
  }

  // Buscar detalhes completos de uma série
  async getTVDetails(tmdbId) {
    try {
      const [tv, credits, videos, watchProviders, keywords] = await Promise.all([
        this.makeRequest(`/tv/${tmdbId}`, { append_to_response: 'keywords,content_ratings' }),
        this.makeRequest(`/tv/${tmdbId}/credits`),
        this.makeRequest(`/tv/${tmdbId}/videos`),
        this.makeRequest(`/tv/${tmdbId}/watch/providers`),
        this.makeRequest(`/tv/${tmdbId}/keywords`)
      ]);

      return this.formatTVDetails(tv, credits, videos, watchProviders, keywords);
    } catch (error) {
      logger.error(`Error fetching TV details for ${tmdbId}:`, error);
      throw error;
    }
  }

  // Buscar episódios de uma temporada
  async getSeasonDetails(tvId, seasonNumber) {
    try {
      const data = await this.makeRequest(`/tv/${tvId}/season/${seasonNumber}`);
      return this.formatSeasonDetails(data);
    } catch (error) {
      logger.error(`Error fetching season ${seasonNumber} for TV ${tvId}:`, error);
      throw error;
    }
  }

  // Busca multi (filmes, séries, pessoas)
  async searchMulti(query, page = 1) {
    try {
      const data = await this.makeRequest('/search/multi', { query, page });
      return this.formatSearchResponse(data);
    } catch (error) {
      logger.error('Error in multi search:', error);
      throw error;
    }
  }

  // Descobrir filmes por critérios (como o Acteia faz para categorizar)
  async discoverMovies(options = {}) {
    try {
      const params = {
        sort_by: 'popularity.desc',
        include_adult: false,
        ...options
      };
      
      const data = await this.makeRequest('/discover/movie', params);
      return this.formatMoviesResponse(data);
    } catch (error) {
      logger.error('Error discovering movies:', error);
      throw error;
    }
  }

  // Descobrir séries por critérios
  async discoverTVShows(options = {}) {
    try {
      const params = {
        sort_by: 'popularity.desc',
        include_adult: false,
        ...options
      };
      
      const data = await this.makeRequest('/discover/tv', params);
      return this.formatTVResponse(data);
    } catch (error) {
      logger.error('Error discovering TV shows:', error);
      throw error;
    }
  }

  // Buscar filmes em cartaz no Brasil
  async getNowPlayingMovies() {
    try {
      const data = await this.makeRequest('/movie/now_playing');
      return this.formatMoviesResponse(data);
    } catch (error) {
      logger.error('Error fetching now playing movies:', error);
      throw error;
    }
  }

  // Buscar próximos lançamentos
  async getUpcomingMovies() {
    try {
      const data = await this.makeRequest('/movie/upcoming');
      return this.formatMoviesResponse(data);
    } catch (error) {
      logger.error('Error fetching upcoming movies:', error);
      throw error;
    }
  }

  // Buscar filmes mais bem avaliados
  async getTopRatedMovies(page = 1) {
    try {
      const data = await this.makeRequest('/movie/top_rated', { page });
      return this.formatMoviesResponse(data);
    } catch (error) {
      logger.error('Error fetching top rated movies:', error);
      throw error;
    }
  }

  // Buscar séries mais bem avaliadas
  async getTopRatedTVShows(page = 1) {
    try {
      const data = await this.makeRequest('/tv/top_rated', { page });
      return this.formatTVResponse(data);
    } catch (error) {
      logger.error('Error fetching top rated TV shows:', error);
      throw error;
    }
  }

  // Buscar trending (como o Acteia destaca conteúdo popular)
  async getTrending(mediaType = 'all', timeWindow = 'day') {
    try {
      const data = await this.makeRequest(`/trending/${mediaType}/${timeWindow}`);
      return this.formatSearchResponse(data);
    } catch (error) {
      logger.error('Error fetching trending content:', error);
      throw error;
    }
  }

  // Formatadores de resposta
  formatMoviesResponse(data) {
    return {
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
      results: data.results.map(movie => ({
        tmdbId: movie.id,
        imdbId: null,
        title: movie.title,
        originalTitle: movie.original_title,
        type: 'movie',
        year: movie.release_date ? new Date(movie.release_date).getFullYear() : null,
        releaseDate: movie.release_date,
        description: movie.overview,
        poster: movie.poster_path ? `${this.imageBaseURL}/w500${movie.poster_path}` : null,
        backdrop: movie.backdrop_path ? `${this.imageBaseURL}/w1920${movie.backdrop_path}` : null,
        genre: this.mapGenreIds(movie.genre_ids),
        rating: {
          tmdb: {
            average: movie.vote_average,
            count: movie.vote_count
          }
        },
        popularity: movie.popularity,
        adult: movie.adult,
        originalLanguage: movie.original_language
      }))
    };
  }

  formatTVResponse(data) {
    return {
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
      results: data.results.map(show => ({
        tmdbId: show.id,
        title: show.name,
        originalTitle: show.original_name,
        type: this.isAnime(show) ? 'anime' : 'series',
        year: show.first_air_date ? new Date(show.first_air_date).getFullYear() : null,
        firstAirDate: show.first_air_date,
        description: show.overview,
        poster: show.poster_path ? `${this.imageBaseURL}/w500${show.poster_path}` : null,
        backdrop: show.backdrop_path ? `${this.imageBaseURL}/w1920${show.backdrop_path}` : null,
        genre: this.mapGenreIds(show.genre_ids),
        rating: {
          tmdb: {
            average: show.vote_average,
            count: show.vote_count
          }
        },
        popularity: show.popularity,
        adult: show.adult,
        originalLanguage: show.original_language,
        originCountry: show.origin_country
      }))
    };
  }

  formatMovieDetails(movie, credits, videos, watchProviders, keywords, releases) {
    return {
      tmdbId: movie.id,
      imdbId: movie.imdb_id,
      title: movie.title,
      originalTitle: movie.original_title,
      type: 'movie',
      year: movie.release_date ? new Date(movie.release_date).getFullYear() : null,
      releaseDate: movie.release_date,
      description: movie.overview,
      tagline: movie.tagline,
      duration: movie.runtime,
      poster: movie.poster_path ? `${this.imageBaseURL}/w500${movie.poster_path}` : null,
      backdrop: movie.backdrop_path ? `${this.imageBaseURL}/w1920${movie.backdrop_path}` : null,
      logo: this.findLogo(movie.images?.logos),
      genre: movie.genres.map(g => g.name),
      rating: {
        ageRating: this.getAgeRating(releases?.results),
        tmdb: {
          average: movie.vote_average,
          count: movie.vote_count
        }
      },
      popularity: movie.popularity,
      budget: movie.budget,
      revenue: movie.revenue,
      status: movie.status,
      originalLanguage: movie.original_language,
      spokenLanguages: movie.spoken_languages?.map(lang => lang.name) || [],
      productionCountries: movie.production_countries?.map(country => country.name) || [],
      productionCompanies: movie.production_companies?.map(company => company.name) || [],
      cast: this.formatCast(credits.cast),
      crew: this.formatCrew(credits.crew),
      videos: this.formatVideos(videos.results),
      availableOn: this.formatWatchProviders(watchProviders.results?.BR),
      keywords: keywords.keywords?.map(k => k.name) || []
    };
  }

  formatTVDetails(tv, credits, videos, watchProviders, keywords) {
    return {
      tmdbId: tv.id,
      title: tv.name,
      originalTitle: tv.original_name,
      type: this.isAnime(tv) ? 'anime' : 'series',
      year: tv.first_air_date ? new Date(tv.first_air_date).getFullYear() : null,
      firstAirDate: tv.first_air_date,
      lastAirDate: tv.last_air_date,
      description: tv.overview,
      tagline: tv.tagline,
      poster: tv.poster_path ? `${this.imageBaseURL}/w500${tv.poster_path}` : null,
      backdrop: tv.backdrop_path ? `${this.imageBaseURL}/w1920${tv.backdrop_path}` : null,
      logo: this.findLogo(tv.images?.logos),
      genre: tv.genres.map(g => g.name),
      rating: {
        ageRating: this.getTVAgeRating(tv.content_ratings?.results),
        tmdb: {
          average: tv.vote_average,
          count: tv.vote_count
        }
      },
      popularity: tv.popularity,
      status: tv.status,
      originalLanguage: tv.original_language,
      spokenLanguages: tv.spoken_languages?.map(lang => lang.name) || [],
      productionCountries: tv.production_countries?.map(country => country.name) || [],
      productionCompanies: tv.production_companies?.map(company => company.name) || [],
      networks: tv.networks?.map(network => network.name) || [],
      numberOfSeasons: tv.number_of_seasons,
      numberOfEpisodes: tv.number_of_episodes,
      episodeRuntime: tv.episode_run_time,
      seasons: tv.seasons?.map(season => ({
        seasonNumber: season.season_number,
        name: season.name,
        overview: season.overview,
        airDate: season.air_date,
        episodeCount: season.episode_count,
        poster: season.poster_path ? `${this.imageBaseURL}/w500${season.poster_path}` : null
      })) || [],
      cast: this.formatCast(credits.cast),
      crew: this.formatCrew(credits.crew),
      videos: this.formatVideos(videos.results),
      availableOn: this.formatWatchProviders(watchProviders.results?.BR),
      keywords: keywords.keywords?.map(k => k.name) || [],
      originCountry: tv.origin_country
    };
  }

  formatSeasonDetails(season) {
    return {
      seasonNumber: season.season_number,
      name: season.name,
      overview: season.overview,
      airDate: season.air_date,
      poster: season.poster_path ? `${this.imageBaseURL}/w500${season.poster_path}` : null,
      episodes: season.episodes?.map(episode => ({
        episodeNumber: episode.episode_number,
        name: episode.name,
        overview: episode.overview,
        airDate: episode.air_date,
        runtime: episode.runtime,
        stillPath: episode.still_path ? `${this.imageBaseURL}/w500${episode.still_path}` : null,
        voteAverage: episode.vote_average,
        voteCount: episode.vote_count
      })) || []
    };
  }

  formatSearchResponse(data) {
    return {
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
      results: data.results.map(item => {
        if (item.media_type === 'movie') {
          return {
            tmdbId: item.id,
            title: item.title,
            originalTitle: item.original_title,
            type: 'movie',
            year: item.release_date ? new Date(item.release_date).getFullYear() : null,
            description: item.overview,
            poster: item.poster_path ? `${this.imageBaseURL}/w500${item.poster_path}` : null,
            backdrop: item.backdrop_path ? `${this.imageBaseURL}/w1920${item.backdrop_path}` : null,
            rating: {
              tmdb: {
                average: item.vote_average,
                count: item.vote_count
              }
            },
            popularity: item.popularity
          };
        } else if (item.media_type === 'tv') {
          return {
            tmdbId: item.id,
            title: item.name,
            originalTitle: item.original_name,
            type: this.isAnime(item) ? 'anime' : 'series',
            year: item.first_air_date ? new Date(item.first_air_date).getFullYear() : null,
            description: item.overview,
            poster: item.poster_path ? `${this.imageBaseURL}/w500${item.poster_path}` : null,
            backdrop: item.backdrop_path ? `${this.imageBaseURL}/w1920${item.backdrop_path}` : null,
            rating: {
              tmdb: {
                average: item.vote_average,
                count: item.vote_count
              }
            },
            popularity: item.popularity,
            originCountry: item.origin_country
          };
        }
        return null;
      }).filter(Boolean)
    };
  }

  // Funções auxiliares
  mapGenreIds(genreIds) {
    if (!genreIds || !Array.isArray(genreIds)) return [];
    return genreIds.map(id => this.genreMapping[id]).filter(Boolean);
  }

  isAnime(item) {
    // Detectar anime baseado em país de origem e gêneros
    const isJapanese = item.origin_country?.includes('JP') || item.original_language === 'ja';
    const hasAnimationGenre = item.genre_ids?.includes(16) || item.genres?.some(g => g.id === 16);
    return isJapanese && hasAnimationGenre;
  }

  formatCast(cast) {
    return cast?.slice(0, 20).map(actor => ({
      name: actor.name,
      character: actor.character,
      profileImage: actor.profile_path ? `${this.imageBaseURL}/w185${actor.profile_path}` : null,
      order: actor.order
    })) || [];
  }

  formatCrew(crew) {
    const importantJobs = ['Director', 'Producer', 'Writer', 'Creator', 'Executive Producer'];
    return crew?.filter(person => importantJobs.includes(person.job))
      .map(person => ({
        name: person.name,
        job: person.job,
        department: person.department,
        profileImage: person.profile_path ? `${this.imageBaseURL}/w185${person.profile_path}` : null
      })) || [];
  }

  formatVideos(videos) {
    return videos?.filter(video => video.site === 'YouTube' && video.official)
      .map(video => ({
        key: video.key,
        name: video.name,
        type: video.type,
        site: video.site,
        official: video.official
      })) || [];
  }

  formatWatchProviders(providers) {
    if (!providers) return [];
    
    const allProviders = [
      ...(providers.flatrate || []),
      ...(providers.rent || []),
      ...(providers.buy || [])
    ];
    
    return [...new Set(allProviders.map(p => 
      this.providerMapping[p.provider_id] || p.provider_name
    ))];
  }

  findLogo(logos) {
    if (!logos || !Array.isArray(logos)) return null;
    const logo = logos.find(l => l.iso_639_1 === 'pt' || l.iso_639_1 === null);
    return logo ? `${this.imageBaseURL}/w300${logo.file_path}` : null;
  }

  getAgeRating(releaseDates) {
    if (!releaseDates) return 'L';
    
    const brRelease = releaseDates.find(r => r.iso_3166_1 === 'BR');
    if (brRelease && brRelease.release_dates.length > 0) {
      return brRelease.release_dates[0].certification || 'L';
    }
    
    return 'L';
  }

  getTVAgeRating(contentRatings) {
    if (!contentRatings) return 'L';
    
    const brRating = contentRatings.find(r => r.iso_3166_1 === 'BR');
    return brRating ? brRating.rating : 'L';
  }

  // Gerar slug para URLs amigáveis (como o Acteia faz)
  generateSlug(title) {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-z0-9\s]/g, '') // Remove caracteres especiais
      .replace(/\s+/g, '-') // Substitui espaços por hífens
      .replace(/-+/g, '-') // Remove hífens duplos
      .trim();
  }

  // Limpar cache
  clearCache() {
    this.cache.flushAll();
    logger.info('TMDB cache cleared');
  }

  // Estatísticas do cache
  getCacheStats() {
    return {
      keys: this.cache.keys().length,
      stats: this.cache.getStats()
    };
  }
}

module.exports = new TMDBService();
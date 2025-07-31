const axios = require('axios');
const logger = require('../utils/logger');

class TMDBService {
  constructor() {
    this.apiKey = process.env.TMDB_API_KEY;
    this.baseURL = 'https://api.themoviedb.org/3';
    this.imageBaseURL = 'https://image.tmdb.org/t/p';
    
    // Configurações para o Brasil
    this.language = 'pt-BR';
    this.region = 'BR';
  }

  // Buscar filmes populares no Brasil
  async getPopularMovies(page = 1) {
    try {
      const response = await axios.get(`${this.baseURL}/movie/popular`, {
        params: {
          api_key: this.apiKey,
          language: this.language,
          region: this.region,
          page
        }
      });

      return this.formatMoviesResponse(response.data);
    } catch (error) {
      logger.error('Erro ao buscar filmes populares:', error);
      throw error;
    }
  }

  // Buscar séries populares no Brasil
  async getPopularTVShows(page = 1) {
    try {
      const response = await axios.get(`${this.baseURL}/tv/popular`, {
        params: {
          api_key: this.apiKey,
          language: this.language,
          region: this.region,
          page
        }
      });

      return this.formatTVResponse(response.data);
    } catch (error) {
      logger.error('Erro ao buscar séries populares:', error);
      throw error;
    }
  }

  // Buscar detalhes de um filme específico
  async getMovieDetails(tmdbId) {
    try {
      const [movieResponse, creditsResponse, videosResponse, watchProvidersResponse] = await Promise.all([
        axios.get(`${this.baseURL}/movie/${tmdbId}`, {
          params: {
            api_key: this.apiKey,
            language: this.language,
            append_to_response: 'keywords,release_dates'
          }
        }),
        axios.get(`${this.baseURL}/movie/${tmdbId}/credits`, {
          params: { api_key: this.apiKey }
        }),
        axios.get(`${this.baseURL}/movie/${tmdbId}/videos`, {
          params: {
            api_key: this.apiKey,
            language: this.language
          }
        }),
        axios.get(`${this.baseURL}/movie/${tmdbId}/watch/providers`, {
          params: { api_key: this.apiKey }
        })
      ]);

      return this.formatMovieDetails(
        movieResponse.data,
        creditsResponse.data,
        videosResponse.data,
        watchProvidersResponse.data
      );
    } catch (error) {
      logger.error(`Erro ao buscar detalhes do filme ${tmdbId}:`, error);
      throw error;
    }
  }

  // Buscar detalhes de uma série específica
  async getTVDetails(tmdbId) {
    try {
      const [tvResponse, creditsResponse, videosResponse, watchProvidersResponse] = await Promise.all([
        axios.get(`${this.baseURL}/tv/${tmdbId}`, {
          params: {
            api_key: this.apiKey,
            language: this.language,
            append_to_response: 'keywords,content_ratings'
          }
        }),
        axios.get(`${this.baseURL}/tv/${tmdbId}/credits`, {
          params: { api_key: this.apiKey }
        }),
        axios.get(`${this.baseURL}/tv/${tmdbId}/videos`, {
          params: {
            api_key: this.apiKey,
            language: this.language
          }
        }),
        axios.get(`${this.baseURL}/tv/${tmdbId}/watch/providers`, {
          params: { api_key: this.apiKey }
        })
      ]);

      return this.formatTVDetails(
        tvResponse.data,
        creditsResponse.data,
        videosResponse.data,
        watchProvidersResponse.data
      );
    } catch (error) {
      logger.error(`Erro ao buscar detalhes da série ${tmdbId}:`, error);
      throw error;
    }
  }

  // Buscar por termo
  async searchMulti(query, page = 1) {
    try {
      const response = await axios.get(`${this.baseURL}/search/multi`, {
        params: {
          api_key: this.apiKey,
          language: this.language,
          region: this.region,
          query,
          page
        }
      });

      return this.formatSearchResponse(response.data);
    } catch (error) {
      logger.error('Erro na busca:', error);
      throw error;
    }
  }

  // Buscar lançamentos no Brasil
  async getUpcomingMovies() {
    try {
      const response = await axios.get(`${this.baseURL}/movie/upcoming`, {
        params: {
          api_key: this.apiKey,
          language: this.language,
          region: this.region
        }
      });

      return this.formatMoviesResponse(response.data);
    } catch (error) {
      logger.error('Erro ao buscar lançamentos:', error);
      throw error;
    }
  }

  // Buscar filmes em cartaz no Brasil
  async getNowPlayingMovies() {
    try {
      const response = await axios.get(`${this.baseURL}/movie/now_playing`, {
        params: {
          api_key: this.apiKey,
          language: this.language,
          region: this.region
        }
      });

      return this.formatMoviesResponse(response.data);
    } catch (error) {
      logger.error('Erro ao buscar filmes em cartaz:', error);
      throw error;
    }
  }

  // Descobrir conteúdo por gênero
  async discoverMovies(options = {}) {
    try {
      const params = {
        api_key: this.apiKey,
        language: this.language,
        region: this.region,
        sort_by: 'popularity.desc',
        include_adult: false,
        ...options
      };

      const response = await axios.get(`${this.baseURL}/discover/movie`, { params });
      return this.formatMoviesResponse(response.data);
    } catch (error) {
      logger.error('Erro no discover de filmes:', error);
      throw error;
    }
  }

  // Descobrir séries por gênero
  async discoverTVShows(options = {}) {
    try {
      const params = {
        api_key: this.apiKey,
        language: this.language,
        region: this.region,
        sort_by: 'popularity.desc',
        include_adult: false,
        ...options
      };

      const response = await axios.get(`${this.baseURL}/discover/tv`, { params });
      return this.formatTVResponse(response.data);
    } catch (error) {
      logger.error('Erro no discover de séries:', error);
      throw error;
    }
  }

  // Buscar episódios de uma temporada
  async getSeasonDetails(tvId, seasonNumber) {
    try {
      const response = await axios.get(`${this.baseURL}/tv/${tvId}/season/${seasonNumber}`, {
        params: {
          api_key: this.apiKey,
          language: this.language
        }
      });

      return this.formatSeasonDetails(response.data);
    } catch (error) {
      logger.error(`Erro ao buscar temporada ${seasonNumber} da série ${tvId}:`, error);
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
        id: movie.id,
        tmdbId: movie.id,
        imdbId: null, // Será preenchido quando buscar detalhes
        title: movie.title,
        originalTitle: movie.original_title,
        type: 'movie',
        year: movie.release_date ? new Date(movie.release_date).getFullYear() : null,
        releaseDate: movie.release_date,
        description: movie.overview,
        poster: movie.poster_path ? `${this.imageBaseURL}/w500${movie.poster_path}` : null,
        backdrop: movie.backdrop_path ? `${this.imageBaseURL}/w1920${movie.backdrop_path}` : null,
        genre: movie.genre_ids,
        rating: {
          tmdb: movie.vote_average,
          tmdbCount: movie.vote_count
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
        id: show.id,
        tmdbId: show.id,
        title: show.name,
        originalTitle: show.original_name,
        type: 'series',
        year: show.first_air_date ? new Date(show.first_air_date).getFullYear() : null,
        firstAirDate: show.first_air_date,
        description: show.overview,
        poster: show.poster_path ? `${this.imageBaseURL}/w500${show.poster_path}` : null,
        backdrop: show.backdrop_path ? `${this.imageBaseURL}/w1920${show.backdrop_path}` : null,
        genre: show.genre_ids,
        rating: {
          tmdb: show.vote_average,
          tmdbCount: show.vote_count
        },
        popularity: show.popularity,
        adult: show.adult,
        originalLanguage: show.original_language,
        originCountry: show.origin_country
      }))
    };
  }

  formatMovieDetails(movie, credits, videos, watchProviders) {
    return {
      id: movie.id,
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
      genre: movie.genres.map(g => g.name),
      genreIds: movie.genres.map(g => g.id),
      rating: {
        tmdb: movie.vote_average,
        tmdbCount: movie.vote_count,
        ageRating: this.getAgeRating(movie.release_dates?.results)
      },
      popularity: movie.popularity,
      budget: movie.budget,
      revenue: movie.revenue,
      status: movie.status,
      originalLanguage: movie.original_language,
      spokenLanguages: movie.spoken_languages,
      productionCountries: movie.production_countries,
      productionCompanies: movie.production_companies,
      cast: credits.cast?.slice(0, 10).map(actor => ({
        id: actor.id,
        name: actor.name,
        character: actor.character,
        profilePath: actor.profile_path ? `${this.imageBaseURL}/w185${actor.profile_path}` : null
      })),
      crew: credits.crew?.filter(person => ['Director', 'Producer', 'Writer'].includes(person.job)),
      videos: videos.results?.map(video => ({
        id: video.id,
        key: video.key,
        name: video.name,
        site: video.site,
        type: video.type,
        official: video.official
      })),
      watchProviders: this.formatWatchProviders(watchProviders.results?.BR),
      keywords: movie.keywords?.keywords?.map(k => k.name)
    };
  }

  formatTVDetails(show, credits, videos, watchProviders) {
    return {
      id: show.id,
      tmdbId: show.id,
      title: show.name,
      originalTitle: show.original_name,
      type: 'series',
      year: show.first_air_date ? new Date(show.first_air_date).getFullYear() : null,
      firstAirDate: show.first_air_date,
      lastAirDate: show.last_air_date,
      description: show.overview,
      tagline: show.tagline,
      poster: show.poster_path ? `${this.imageBaseURL}/w500${show.poster_path}` : null,
      backdrop: show.backdrop_path ? `${this.imageBaseURL}/w1920${show.backdrop_path}` : null,
      genre: show.genres.map(g => g.name),
      genreIds: show.genres.map(g => g.id),
      rating: {
        tmdb: show.vote_average,
        tmdbCount: show.vote_count,
        ageRating: this.getTVAgeRating(show.content_ratings?.results)
      },
      popularity: show.popularity,
      status: show.status,
      originalLanguage: show.original_language,
      spokenLanguages: show.spoken_languages,
      productionCountries: show.production_countries,
      productionCompanies: show.production_companies,
      networks: show.networks,
      numberOfSeasons: show.number_of_seasons,
      numberOfEpisodes: show.number_of_episodes,
      episodeRunTime: show.episode_run_time,
      seasons: show.seasons?.map(season => ({
        id: season.id,
        seasonNumber: season.season_number,
        name: season.name,
        overview: season.overview,
        airDate: season.air_date,
        episodeCount: season.episode_count,
        poster: season.poster_path ? `${this.imageBaseURL}/w500${season.poster_path}` : null
      })),
      cast: credits.cast?.slice(0, 10).map(actor => ({
        id: actor.id,
        name: actor.name,
        character: actor.character,
        profilePath: actor.profile_path ? `${this.imageBaseURL}/w185${actor.profile_path}` : null
      })),
      crew: credits.crew?.filter(person => ['Director', 'Producer', 'Writer', 'Creator'].includes(person.job)),
      videos: videos.results?.map(video => ({
        id: video.id,
        key: video.key,
        name: video.name,
        site: video.site,
        type: video.type,
        official: video.official
      })),
      watchProviders: this.formatWatchProviders(watchProviders.results?.BR),
      keywords: show.keywords?.keywords?.map(k => k.name),
      originCountry: show.origin_country
    };
  }

  formatSeasonDetails(season) {
    return {
      id: season.id,
      seasonNumber: season.season_number,
      name: season.name,
      overview: season.overview,
      airDate: season.air_date,
      poster: season.poster_path ? `${this.imageBaseURL}/w500${season.poster_path}` : null,
      episodes: season.episodes?.map(episode => ({
        id: episode.id,
        episodeNumber: episode.episode_number,
        name: episode.name,
        overview: episode.overview,
        airDate: episode.air_date,
        runtime: episode.runtime,
        stillPath: episode.still_path ? `${this.imageBaseURL}/w500${episode.still_path}` : null,
        voteAverage: episode.vote_average,
        voteCount: episode.vote_count
      }))
    };
  }

  formatSearchResponse(data) {
    return {
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
      results: data.results.map(item => {
        const baseItem = {
          id: item.id,
          tmdbId: item.id,
          type: item.media_type,
          popularity: item.popularity,
          adult: item.adult,
          originalLanguage: item.original_language,
          poster: item.poster_path ? `${this.imageBaseURL}/w500${item.poster_path}` : null,
          backdrop: item.backdrop_path ? `${this.imageBaseURL}/w1920${item.backdrop_path}` : null,
          genre: item.genre_ids,
          rating: {
            tmdb: item.vote_average,
            tmdbCount: item.vote_count
          }
        };

        if (item.media_type === 'movie') {
          return {
            ...baseItem,
            title: item.title,
            originalTitle: item.original_title,
            year: item.release_date ? new Date(item.release_date).getFullYear() : null,
            releaseDate: item.release_date,
            description: item.overview
          };
        } else if (item.media_type === 'tv') {
          return {
            ...baseItem,
            type: 'series',
            title: item.name,
            originalTitle: item.original_name,
            year: item.first_air_date ? new Date(item.first_air_date).getFullYear() : null,
            firstAirDate: item.first_air_date,
            description: item.overview,
            originCountry: item.origin_country
          };
        }

        return baseItem;
      }).filter(item => item.type !== 'person') // Filtrar pessoas dos resultados
    };
  }

  formatWatchProviders(providers) {
    if (!providers) return null;

    return {
      link: providers.link,
      flatrate: providers.flatrate?.map(provider => ({
        logoPath: provider.logo_path ? `${this.imageBaseURL}/w92${provider.logo_path}` : null,
        providerId: provider.provider_id,
        providerName: provider.provider_name
      })),
      rent: providers.rent?.map(provider => ({
        logoPath: provider.logo_path ? `${this.imageBaseURL}/w92${provider.logo_path}` : null,
        providerId: provider.provider_id,
        providerName: provider.provider_name
      })),
      buy: providers.buy?.map(provider => ({
        logoPath: provider.logo_path ? `${this.imageBaseURL}/w92${provider.logo_path}` : null,
        providerId: provider.provider_id,
        providerName: provider.provider_name
      }))
    };
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

  // Gerar slug para URLs amigáveis
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
}

module.exports = new TMDBService();
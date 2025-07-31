const express = require('express');
const path = require('path');
const Media = require('../models/Media');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const tmdbService = require('../services/tmdbService');

const router = express.Router();

// Middleware para verificar token opcional
const optionalAuth = async (req, res, next) => {
  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
  
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      
      if (user && user.isActive) {
        req.user = user;
        req.hasValidSubscription = user.subscription?.status === 'active';
      }
    } catch (error) {
      // Token inválido, mas continua sem autenticação
    }
  }
  
  next();
};

// @route   GET /embed/movie/:tmdbId
// @desc    Embed de filme (igual ao Acteia: /filme/tt0000091)
// @access  Público com verificação de assinatura
router.get('/movie/:tmdbId', optionalAuth, async (req, res) => {
  try {
    const { tmdbId } = req.params;
    const { autoplay = 'false', quality = 'auto', t = '0', lang = 'pt' } = req.query;

    // Buscar mídia no banco ou sincronizar do TMDB
    let media = await Media.findByTmdbId(parseInt(tmdbId), 'movie');
    
    if (!media) {
      // Se não encontrar, tentar buscar no TMDB e salvar
      try {
        const movieDetails = await tmdbService.getMovieDetails(parseInt(tmdbId));
        media = new Media({
          tmdbId: movieDetails.tmdbId,
          imdbId: movieDetails.imdbId,
          title: movieDetails.title,
          originalTitle: movieDetails.originalTitle,
          type: 'movie',
          year: movieDetails.year,
          releaseDate: movieDetails.releaseDate,
          description: movieDetails.description,
          tagline: movieDetails.tagline,
          duration: movieDetails.duration,
          poster: movieDetails.poster,
          backdrop: movieDetails.backdrop,
          genre: movieDetails.genre,
          rating: {
            ageRating: movieDetails.rating.ageRating,
            tmdb: movieDetails.rating.tmdb
          },
          cast: movieDetails.cast,
          crew: movieDetails.crew,
          availableOn: movieDetails.availableOn,
          keywords: movieDetails.keywords,
          popularity: movieDetails.popularity,
          slug: tmdbService.generateSlug(movieDetails.title),
          embedUrl: `/embed/movie/${tmdbId}`
        });
        await media.save();
      } catch (tmdbError) {
        logger.error('Error fetching from TMDB:', tmdbError);
        return res.status(404).send(generateNotFoundHTML('Filme não encontrado'));
      }
    }

    // Verificar se tem acesso
    const hasAccess = req.hasValidSubscription || false;
    
    // Registrar visualização
    if (media) {
      await media.incrementView(req.user?._id, 0, quality);
    }

    // Gerar URLs de streaming
    const streamingUrls = generateStreamingUrls(media, quality);
    
    // Se não tem acesso, mostrar preview
    if (!hasAccess) {
      return res.send(generatePreviewHTML(media, streamingUrls, {
        autoplay: autoplay === 'true',
        startTime: parseInt(t),
        language: lang,
        previewDuration: 300 // 5 minutos
      }));
    }

    // Usuário com acesso - mostrar player completo
    res.send(generatePlayerHTML(media, streamingUrls, {
      autoplay: autoplay === 'true',
      startTime: parseInt(t),
      language: lang,
      type: 'movie'
    }));

  } catch (error) {
    logger.error('Error in movie embed:', error);
    res.status(500).send(generateErrorHTML('Erro ao carregar filme'));
  }
});

// @route   GET /embed/series/:tmdbId/:season?/:episode?
// @desc    Embed de série/episódio (igual ao Acteia)
// @access  Público com verificação de assinatura
router.get('/series/:tmdbId/:season?/:episode?', optionalAuth, async (req, res) => {
  try {
    const { tmdbId, season = 1, episode = 1 } = req.params;
    const { autoplay = 'false', quality = 'auto', t = '0', lang = 'pt' } = req.query;

    // Buscar série no banco
    let media = await Media.findByTmdbId(parseInt(tmdbId), 'series');
    
    if (!media) {
      // Buscar no TMDB se não encontrar
      try {
        const tvDetails = await tmdbService.getTVDetails(parseInt(tmdbId));
        media = new Media({
          tmdbId: tvDetails.tmdbId,
          title: tvDetails.title,
          originalTitle: tvDetails.originalTitle,
          type: tvDetails.type,
          year: tvDetails.year,
          firstAirDate: tvDetails.firstAirDate,
          lastAirDate: tvDetails.lastAirDate,
          description: tvDetails.description,
          poster: tvDetails.poster,
          backdrop: tvDetails.backdrop,
          genre: tvDetails.genre,
          rating: {
            ageRating: tvDetails.rating.ageRating,
            tmdb: tvDetails.rating.tmdb
          },
          seasons: tvDetails.seasons,
          totalSeasons: tvDetails.numberOfSeasons,
          totalEpisodes: tvDetails.numberOfEpisodes,
          episodeRuntime: tvDetails.episodeRuntime,
          cast: tvDetails.cast,
          crew: tvDetails.crew,
          availableOn: tvDetails.availableOn,
          keywords: tvDetails.keywords,
          popularity: tvDetails.popularity,
          slug: tmdbService.generateSlug(tvDetails.title),
          embedUrl: `/embed/series/${tmdbId}`
        });
        await media.save();
      } catch (tmdbError) {
        return res.status(404).send(generateNotFoundHTML('Série não encontrada'));
      }
    }

    // Verificar se temporada/episódio existe
    const seasonData = media.seasons?.find(s => s.seasonNumber === parseInt(season));
    if (!seasonData) {
      return res.status(404).send(generateNotFoundHTML(`Temporada ${season} não encontrada`));
    }

    const hasAccess = req.hasValidSubscription || false;
    
    // Registrar visualização
    await media.incrementView(req.user?._id, 0, quality);

    // Buscar detalhes dos episódios se necessário
    if (!seasonData.episodes || seasonData.episodes.length === 0) {
      try {
        const seasonDetails = await tmdbService.getSeasonDetails(parseInt(tmdbId), parseInt(season));
        seasonData.episodes = seasonDetails.episodes;
        await media.save();
      } catch (error) {
        logger.warn('Could not fetch season details:', error);
      }
    }

    const currentEpisode = {
      seasonNumber: parseInt(season),
      episodeNumber: parseInt(episode),
      title: `T${season}E${episode}`,
      name: seasonData.episodes?.find(ep => ep.episodeNumber === parseInt(episode))?.name || `Episódio ${episode}`
    };

    // Gerar URLs de streaming para o episódio
    const streamingUrls = generateEpisodeStreamingUrls(media, season, episode, quality);
    
    // Navegação entre episódios
    const navigation = {
      nextEpisode: getNextEpisode(media, season, episode),
      prevEpisode: getPrevEpisode(media, season, episode),
      episodeList: generateEpisodeList(seasonData)
    };

    if (!hasAccess) {
      return res.send(generateSeriesPreviewHTML(media, currentEpisode, streamingUrls, navigation, {
        autoplay: autoplay === 'true',
        startTime: parseInt(t),
        language: lang,
        previewDuration: 300
      }));
    }

    res.send(generateSeriesPlayerHTML(media, currentEpisode, streamingUrls, navigation, {
      autoplay: autoplay === 'true',
      startTime: parseInt(t),
      language: lang
    }));

  } catch (error) {
    logger.error('Error in series embed:', error);
    res.status(500).send(generateErrorHTML('Erro ao carregar episódio'));
  }
});

// @route   GET /embed/info/:type/:tmdbId
// @desc    Informações da mídia (sem player)
// @access  Público
router.get('/info/:type/:tmdbId', async (req, res) => {
  try {
    const { type, tmdbId } = req.params;
    
    const media = await Media.findByTmdbId(
      parseInt(tmdbId), 
      type === 'movie' ? 'movie' : 'series'
    );

    if (!media) {
      return res.status(404).json({
        success: false,
        message: 'Conteúdo não encontrado'
      });
    }

    // Dados públicos da mídia
    const mediaInfo = {
      tmdbId: media.tmdbId,
      imdbId: media.imdbId,
      title: media.title,
      originalTitle: media.originalTitle,
      type: media.type,
      year: media.year,
      description: media.description,
      poster: media.poster,
      backdrop: media.backdrop,
      genre: media.genre,
      rating: {
        ageRating: media.rating.ageRating,
        tmdb: media.rating.tmdb.average,
        internal: media.rating.internal.average
      },
      duration: media.duration,
      cast: media.cast?.slice(0, 10),
      availableOn: media.availableOn,
      embedUrl: media.embedUrl,
      ...(media.type === 'series' && {
        totalSeasons: media.totalSeasons,
        totalEpisodes: media.totalEpisodes,
        episodeRuntime: media.episodeRuntime,
        status: media.status
      })
    };

    res.json({
      success: true,
      data: mediaInfo
    });

  } catch (error) {
    logger.error('Error fetching media info:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /embed/search
// @desc    Busca para embeds externos
// @access  Público
router.get('/search', async (req, res) => {
  try {
    const { q, type, limit = 10, page = 1 } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: 'Parâmetro de busca obrigatório'
      });
    }

    // Buscar primeiro no banco local
    const results = await Media.search(q, {
      type,
      limit: parseInt(limit),
      page: parseInt(page)
    });

    // Se não encontrar resultados suficientes, buscar no TMDB
    if (results.length < 5) {
      try {
        const tmdbResults = await tmdbService.searchMulti(q, page);
        
        // Adicionar resultados do TMDB que não estão no banco
        for (const tmdbItem of tmdbResults.results.slice(0, 5)) {
          const exists = await Media.findByTmdbId(tmdbItem.tmdbId, tmdbItem.type);
          if (!exists) {
            results.push({
              tmdbId: tmdbItem.tmdbId,
              title: tmdbItem.title,
              type: tmdbItem.type,
              year: tmdbItem.year,
              poster: tmdbItem.poster,
              embedUrl: `/embed/${tmdbItem.type}/${tmdbItem.tmdbId}`,
              source: 'tmdb'
            });
          }
        }
      } catch (tmdbError) {
        logger.warn('TMDB search failed:', tmdbError);
      }
    }

    res.json({
      success: true,
      data: {
        query: q,
        total: results.length,
        results: results.map(media => ({
          tmdbId: media.tmdbId,
          imdbId: media.imdbId,
          title: media.title,
          originalTitle: media.originalTitle,
          type: media.type,
          year: media.year,
          poster: media.poster,
          ageRating: media.rating?.ageRating,
          embedUrl: `${process.env.BACKEND_URL}/embed/${media.type}/${media.tmdbId}`
        }))
      }
    });

  } catch (error) {
    logger.error('Error in embed search:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   POST /embed/track
// @desc    Rastrear visualização para analytics
// @access  Público
router.post('/track', async (req, res) => {
  try {
    const { tmdbId, type, duration, quality, userId, event } = req.body;

    const media = await Media.findByTmdbId(parseInt(tmdbId), type);
    
    if (media) {
      switch (event) {
        case 'play':
          await media.incrementView(userId, 0, quality);
          break;
        case 'progress':
          // Atualizar progresso do usuário
          if (userId && duration) {
            await User.findByIdAndUpdate(userId, {
              $push: {
                watchHistory: {
                  mediaId: media._id,
                  watchedAt: new Date(),
                  duration,
                  progress: (duration / (media.duration * 60)) * 100
                }
              }
            });
          }
          break;
        case 'complete':
          // Marcar como completo
          if (userId) {
            await User.findByIdAndUpdate(userId, {
              $push: {
                watchHistory: {
                  mediaId: media._id,
                  watchedAt: new Date(),
                  duration: media.duration * 60,
                  progress: 100,
                  completed: true
                }
              }
            });
          }
          break;
      }
    }

    res.json({ success: true });

  } catch (error) {
    logger.error('Error tracking view:', error);
    res.status(500).json({ success: false });
  }
});

// Funções auxiliares para gerar HTML

function generateStreamingUrls(media, quality) {
  const baseUrl = process.env.CDN_URL || 'https://cdn.streamvault.com.br';
  
  // Em produção real, estas URLs viriam de um CDN ou sistema de vídeo
  return {
    hls: `${baseUrl}/movies/${media.tmdbId}/playlist.m3u8`,
    mp4: {
      '480p': `${baseUrl}/movies/${media.tmdbId}/480p.mp4`,
      '720p': `${baseUrl}/movies/${media.tmdbId}/720p.mp4`,
      '1080p': `${baseUrl}/movies/${media.tmdbId}/1080p.mp4`,
      '4k': `${baseUrl}/movies/${media.tmdbId}/4k.mp4`
    },
    subtitles: [
      { language: 'pt-BR', url: `${baseUrl}/movies/${media.tmdbId}/subs/pt-br.vtt` },
      { language: 'en', url: `${baseUrl}/movies/${media.tmdbId}/subs/en.vtt` }
    ]
  };
}

function generateEpisodeStreamingUrls(media, season, episode, quality) {
  const baseUrl = process.env.CDN_URL || 'https://cdn.streamvault.com.br';
  
  return {
    hls: `${baseUrl}/series/${media.tmdbId}/s${season}e${episode}/playlist.m3u8`,
    mp4: {
      '480p': `${baseUrl}/series/${media.tmdbId}/s${season}e${episode}/480p.mp4`,
      '720p': `${baseUrl}/series/${media.tmdbId}/s${season}e${episode}/720p.mp4`,
      '1080p': `${baseUrl}/series/${media.tmdbId}/s${season}e${episode}/1080p.mp4`,
      '4k': `${baseUrl}/series/${media.tmdbId}/s${season}e${episode}/4k.mp4`
    },
    subtitles: [
      { language: 'pt-BR', url: `${baseUrl}/series/${media.tmdbId}/s${season}e${episode}/subs/pt-br.vtt` },
      { language: 'en', url: `${baseUrl}/series/${media.tmdbId}/s${season}e${episode}/subs/en.vtt` }
    ]
  };
}

function getNextEpisode(media, currentSeason, currentEpisode) {
  const season = media.seasons?.find(s => s.seasonNumber === parseInt(currentSeason));
  if (!season) return null;

  const nextEpisodeNum = parseInt(currentEpisode) + 1;
  
  if (nextEpisodeNum <= season.episodeCount) {
    return {
      season: currentSeason,
      episode: nextEpisodeNum,
      url: `/embed/series/${media.tmdbId}/${currentSeason}/${nextEpisodeNum}`
    };
  }

  const nextSeason = media.seasons?.find(s => s.seasonNumber === parseInt(currentSeason) + 1);
  if (nextSeason) {
    return {
      season: nextSeason.seasonNumber,
      episode: 1,
      url: `/embed/series/${media.tmdbId}/${nextSeason.seasonNumber}/1`
    };
  }

  return null;
}

function getPrevEpisode(media, currentSeason, currentEpisode) {
  const prevEpisodeNum = parseInt(currentEpisode) - 1;
  
  if (prevEpisodeNum >= 1) {
    return {
      season: currentSeason,
      episode: prevEpisodeNum,
      url: `/embed/series/${media.tmdbId}/${currentSeason}/${prevEpisodeNum}`
    };
  }

  const prevSeason = media.seasons?.find(s => s.seasonNumber === parseInt(currentSeason) - 1);
  if (prevSeason) {
    return {
      season: prevSeason.seasonNumber,
      episode: prevSeason.episodeCount,
      url: `/embed/series/${media.tmdbId}/${prevSeason.seasonNumber}/${prevSeason.episodeCount}`
    };
  }

  return null;
}

function generateEpisodeList(seasonData) {
  const episodes = [];
  for (let i = 1; i <= seasonData.episodeCount; i++) {
    episodes.push({
      episodeNumber: i,
      title: seasonData.episodes?.find(ep => ep.episodeNumber === i)?.name || `Episódio ${i}`
    });
  }
  return episodes;
}

// Geradores de HTML (similar ao que o Acteia faz)

function generatePlayerHTML(media, streamingUrls, options) {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${media.title} - StreamVault Brasil</title>
    <meta name="description" content="${media.description}">
    <meta property="og:title" content="${media.title}">
    <meta property="og:description" content="${media.description}">
    <meta property="og:image" content="${media.poster}">
    <meta property="og:type" content="video.movie">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/plyr@3.7.8/dist/plyr.css">
    <style>
        body { margin: 0; padding: 0; background: #000; font-family: 'Segoe UI', sans-serif; }
        .player-container { width: 100%; height: 100vh; position: relative; }
        .player-info { position: absolute; top: 20px; left: 20px; color: white; z-index: 1000; }
        .player-info h1 { margin: 0; font-size: 1.5em; }
        .player-info p { margin: 5px 0; opacity: 0.8; }
        .loading { display: flex; justify-content: center; align-items: center; height: 100vh; color: white; }
    </style>
</head>
<body>
    <div class="player-container">
        <div class="player-info">
            <h1>${media.title}</h1>
            <p>${media.year} • ${media.rating.ageRating} • ${media.genre.join(', ')}</p>
        </div>
        <div class="loading" id="loading">Carregando...</div>
        <video id="player" playsinline controls ${options.autoplay ? 'autoplay' : ''}>
            <source src="${streamingUrls.hls}" type="application/x-mpegURL">
            <source src="${streamingUrls.mp4['720p']}" type="video/mp4">
            ${streamingUrls.subtitles.map(sub => 
              `<track kind="subtitles" src="${sub.url}" srclang="${sub.language}" label="${sub.language.toUpperCase()}">`
            ).join('')}
        </video>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <script src="https://cdn.jsdelivr.net/npm/plyr@3.7.8/dist/plyr.min.js"></script>
    <script>
        const video = document.getElementById('player');
        const loading = document.getElementById('loading');
        
        // Configurar HLS
        if (Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource('${streamingUrls.hls}');
            hls.attachMedia(video);
        }

        // Configurar Plyr
        const player = new Plyr(video, {
            controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'settings', 'fullscreen'],
            settings: ['quality', 'speed', 'loop'],
            quality: { default: 720, options: [480, 720, 1080] }
        });

        // Eventos
        player.on('ready', () => {
            loading.style.display = 'none';
            if (${options.startTime} > 0) {
                player.currentTime = ${options.startTime};
            }
        });

        player.on('play', () => {
            fetch('/embed/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tmdbId: ${media.tmdbId},
                    type: '${media.type}',
                    event: 'play',
                    quality: '720p'
                })
            });
        });

        // Salvar progresso a cada 30 segundos
        setInterval(() => {
            if (!player.paused) {
                fetch('/embed/track', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tmdbId: ${media.tmdbId},
                        type: '${media.type}',
                        event: 'progress',
                        duration: Math.floor(player.currentTime)
                    })
                });
            }
        }, 30000);
    </script>
</body>
</html>`;
}

function generatePreviewHTML(media, streamingUrls, options) {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${media.title} - Preview - StreamVault Brasil</title>
    <style>
        body { margin: 0; padding: 0; background: #000; font-family: 'Segoe UI', sans-serif; color: white; }
        .preview-container { width: 100%; height: 100vh; position: relative; display: flex; align-items: center; justify-content: center; }
        .preview-content { text-align: center; max-width: 600px; padding: 20px; }
        .preview-video { width: 100%; max-width: 500px; margin-bottom: 20px; }
        .subscription-banner { background: linear-gradient(135deg, #e50914, #b20710); padding: 30px; border-radius: 10px; }
        .subscription-banner h2 { margin: 0 0 10px 0; }
        .subscription-banner p { margin: 0 0 20px 0; opacity: 0.9; }
        .cta-button { background: white; color: #e50914; padding: 15px 30px; border: none; border-radius: 5px; font-weight: bold; font-size: 16px; cursor: pointer; text-decoration: none; display: inline-block; }
        .cta-button:hover { background: #f0f0f0; }
        .preview-info { margin-bottom: 30px; }
        .preview-info h1 { margin: 0 0 10px 0; }
        .preview-info p { opacity: 0.8; }
    </style>
</head>
<body>
    <div class="preview-container">
        <div class="preview-content">
            <div class="preview-info">
                <h1>${media.title}</h1>
                <p>${media.year} • ${media.rating.ageRating} • ${media.genre.join(', ')}</p>
                <p>${media.description}</p>
            </div>
            
            <video class="preview-video" controls poster="${media.backdrop}">
                <source src="${streamingUrls.mp4['720p']}" type="video/mp4">
            </video>
            
            <div class="subscription-banner">
                <h2>🎬 Continue Assistindo</h2>
                <p>Você assistiu ${options.previewDuration / 60} minutos de preview. Assine para ver o filme completo!</p>
                <a href="${process.env.FRONTEND_URL}/planos" class="cta-button">
                    Ver Planos - A partir de R$ 19,99
                </a>
            </div>
        </div>
    </div>

    <script>
        const video = document.querySelector('.preview-video');
        let previewTime = 0;
        
        video.addEventListener('timeupdate', () => {
            previewTime = video.currentTime;
            if (previewTime >= ${options.previewDuration}) {
                video.pause();
                video.style.display = 'none';
                document.querySelector('.subscription-banner').style.display = 'block';
            }
        });
    </script>
</body>
</html>`;
}

function generateSeriesPlayerHTML(media, currentEpisode, streamingUrls, navigation, options) {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${media.title} - ${currentEpisode.title} - StreamVault Brasil</title>
    <meta name="description" content="${media.description}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/plyr@3.7.8/dist/plyr.css">
    <style>
        body { margin: 0; padding: 0; background: #000; font-family: 'Segoe UI', sans-serif; }
        .player-container { width: 100%; height: 100vh; position: relative; }
        .player-info { position: absolute; top: 20px; left: 20px; color: white; z-index: 1000; }
        .episode-nav { position: absolute; top: 20px; right: 20px; z-index: 1000; }
        .nav-button { background: rgba(0,0,0,0.7); color: white; border: none; padding: 10px 15px; margin: 0 5px; border-radius: 5px; cursor: pointer; }
        .nav-button:hover { background: rgba(255,255,255,0.2); }
        .nav-button:disabled { opacity: 0.5; cursor: not-allowed; }
        .loading { display: flex; justify-content: center; align-items: center; height: 100vh; color: white; }
    </style>
</head>
<body>
    <div class="player-container">
        <div class="player-info">
            <h1>${media.title}</h1>
            <p>${currentEpisode.title} • ${media.year} • ${media.rating.ageRating}</p>
        </div>
        
        <div class="episode-nav">
            ${navigation.prevEpisode ? 
              `<button class="nav-button" onclick="location.href='${navigation.prevEpisode.url}'">← Anterior</button>` : 
              `<button class="nav-button" disabled>← Anterior</button>`
            }
            ${navigation.nextEpisode ? 
              `<button class="nav-button" onclick="location.href='${navigation.nextEpisode.url}'">Próximo →</button>` : 
              `<button class="nav-button" disabled>Próximo →</button>`
            }
        </div>
        
        <div class="loading" id="loading">Carregando episódio...</div>
        <video id="player" playsinline controls ${options.autoplay ? 'autoplay' : ''}>
            <source src="${streamingUrls.hls}" type="application/x-mpegURL">
            <source src="${streamingUrls.mp4['720p']}" type="video/mp4">
            ${streamingUrls.subtitles.map(sub => 
              `<track kind="subtitles" src="${sub.url}" srclang="${sub.language}" label="${sub.language.toUpperCase()}">`
            ).join('')}
        </video>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <script src="https://cdn.jsdelivr.net/npm/plyr@3.7.8/dist/plyr.min.js"></script>
    <script>
        const video = document.getElementById('player');
        const loading = document.getElementById('loading');
        
        if (Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource('${streamingUrls.hls}');
            hls.attachMedia(video);
        }

        const player = new Plyr(video, {
            controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'settings', 'fullscreen'],
            settings: ['quality', 'speed', 'loop'],
            quality: { default: 720, options: [480, 720, 1080] }
        });

        player.on('ready', () => {
            loading.style.display = 'none';
            if (${options.startTime} > 0) {
                player.currentTime = ${options.startTime};
            }
        });

        // Auto-play próximo episódio quando terminar
        player.on('ended', () => {
            ${navigation.nextEpisode ? `
                setTimeout(() => {
                    if (confirm('Reproduzir próximo episódio?')) {
                        location.href = '${navigation.nextEpisode.url}';
                    }
                }, 3000);
            ` : ''}
        });

        // Tracking
        player.on('play', () => {
            fetch('/embed/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tmdbId: ${media.tmdbId},
                    type: '${media.type}',
                    event: 'play',
                    season: ${currentEpisode.seasonNumber},
                    episode: ${currentEpisode.episodeNumber}
                })
            });
        });
    </script>
</body>
</html>`;
}

function generateSeriesPreviewHTML(media, currentEpisode, streamingUrls, navigation, options) {
  return generatePreviewHTML(media, streamingUrls, options).replace(
    '<h1>' + media.title + '</h1>',
    `<h1>${media.title}</h1><h2>${currentEpisode.title}</h2>`
  );
}

function generateNotFoundHTML(message) {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Conteúdo não encontrado - StreamVault Brasil</title>
    <style>
        body { margin: 0; padding: 0; background: #000; font-family: 'Segoe UI', sans-serif; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; }
        .error-container { text-align: center; }
        .error-code { font-size: 6em; font-weight: bold; color: #e50914; margin: 0; }
        .error-message { font-size: 1.5em; margin: 20px 0; }
        .error-description { opacity: 0.7; margin-bottom: 30px; }
        .back-button { background: #e50914; color: white; padding: 15px 30px; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; text-decoration: none; display: inline-block; }
    </style>
</head>
<body>
    <div class="error-container">
        <div class="error-code">404</div>
        <div class="error-message">${message}</div>
        <div class="error-description">O conteúdo que você está procurando não foi encontrado em nosso catálogo.</div>
        <a href="${process.env.FRONTEND_URL}" class="back-button">Voltar ao Início</a>
    </div>
</body>
</html>`;
}

function generateErrorHTML(message) {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Erro - StreamVault Brasil</title>
    <style>
        body { margin: 0; padding: 0; background: #000; font-family: 'Segoe UI', sans-serif; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; }
        .error-container { text-align: center; }
        .error-code { font-size: 4em; font-weight: bold; color: #e50914; margin: 0; }
        .error-message { font-size: 1.5em; margin: 20px 0; }
        .retry-button { background: #e50914; color: white; padding: 15px 30px; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; }
    </style>
</head>
<body>
    <div class="error-container">
        <div class="error-code">⚠️</div>
        <div class="error-message">${message}</div>
        <button class="retry-button" onclick="location.reload()">Tentar Novamente</button>
    </div>
</body>
</html>`;
}

module.exports = router;
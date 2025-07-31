const express = require('express');
const Media = require('../models/Media');
const User = require('../models/User');
const auth = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// @route   GET /embed/movie/:tmdbId
// @desc    Embed de filme (similar ao Acteia: /filme/tt0000091)
// @access  Público (com verificação de assinatura)
router.get('/movie/:tmdbId', async (req, res) => {
  try {
    const { tmdbId } = req.params;
    const { token, autoplay = 'false', quality = 'auto' } = req.query;

    // Buscar mídia no banco
    const media = await Media.findOne({
      tmdbId: parseInt(tmdbId),
      type: 'movie',
      isActive: true
    });

    if (!media) {
      return res.status(404).render('embed/notFound', {
        title: 'Filme não encontrado',
        message: 'Este filme não está disponível em nosso catálogo.'
      });
    }

    // Verificar se usuário tem acesso (se token fornecido)
    let hasAccess = false;
    let user = null;

    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        user = await User.findById(decoded.id);
        
        if (user && user.subscription && user.subscription.status === 'active') {
          hasAccess = true;
        }
      } catch (error) {
        logger.warn('Token inválido no embed:', error.message);
      }
    }

    // Se não tem acesso, mostrar preview ou tela de assinatura
    if (!hasAccess) {
      return res.render('embed/preview', {
        media,
        embedType: 'movie',
        previewDuration: 300, // 5 minutos de preview
        subscriptionRequired: true,
        availableOn: media.availableOn
      });
    }

    // Registrar visualização
    await Media.findByIdAndUpdate(media._id, {
      $inc: { 'analytics.views': 1 }
    });

    // Buscar URLs de streaming (aqui você integraria com seu sistema de vídeos)
    const streamingUrls = await getStreamingUrls(media, quality);

    // Renderizar player
    res.render('embed/player', {
      media,
      streamingUrls,
      autoplay: autoplay === 'true',
      quality,
      user,
      embedType: 'movie',
      // Metadados para SEO
      ogTitle: media.title,
      ogDescription: media.description,
      ogImage: media.poster,
      ogUrl: `${process.env.FRONTEND_URL}/embed/movie/${tmdbId}`
    });

  } catch (error) {
    logger.error('Erro no embed de filme:', error);
    res.status(500).render('embed/error', {
      title: 'Erro no Player',
      message: 'Ocorreu um erro ao carregar o filme.'
    });
  }
});

// @route   GET /embed/series/:tmdbId/:season?/:episode?
// @desc    Embed de série/episódio
// @access  Público (com verificação de assinatura)
router.get('/series/:tmdbId/:season?/:episode?', async (req, res) => {
  try {
    const { tmdbId, season = 1, episode = 1 } = req.params;
    const { token, autoplay = 'false', quality = 'auto' } = req.query;

    // Buscar série no banco
    const media = await Media.findOne({
      tmdbId: parseInt(tmdbId),
      type: 'series',
      isActive: true
    });

    if (!media) {
      return res.status(404).render('embed/notFound', {
        title: 'Série não encontrada',
        message: 'Esta série não está disponível em nosso catálogo.'
      });
    }

    // Verificar se temporada/episódio existe
    const seasonData = media.seasons?.find(s => s.seasonNumber === parseInt(season));
    if (!seasonData) {
      return res.status(404).render('embed/notFound', {
        title: 'Temporada não encontrada',
        message: `Temporada ${season} não disponível.`
      });
    }

    // Verificar acesso do usuário
    let hasAccess = false;
    let user = null;

    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        user = await User.findById(decoded.id);
        
        if (user && user.subscription && user.subscription.status === 'active') {
          hasAccess = true;
        }
      } catch (error) {
        logger.warn('Token inválido no embed:', error.message);
      }
    }

    if (!hasAccess) {
      return res.render('embed/preview', {
        media,
        embedType: 'series',
        season: parseInt(season),
        episode: parseInt(episode),
        previewDuration: 300,
        subscriptionRequired: true,
        availableOn: media.availableOn
      });
    }

    // Registrar visualização
    await Media.findByIdAndUpdate(media._id, {
      $inc: { 'analytics.views': 1 }
    });

    // Buscar URLs de streaming para o episódio
    const streamingUrls = await getEpisodeStreamingUrls(media, season, episode, quality);

    // Dados do episódio atual
    const currentEpisode = {
      seasonNumber: parseInt(season),
      episodeNumber: parseInt(episode),
      title: `T${season}E${episode}`,
      // Aqui você buscaria detalhes específicos do episódio se tiver
    };

    // Lista de episódios da temporada para navegação
    const episodeList = generateEpisodeList(seasonData);

    res.render('embed/seriesPlayer', {
      media,
      currentEpisode,
      episodeList,
      streamingUrls,
      autoplay: autoplay === 'true',
      quality,
      user,
      embedType: 'series',
      // Navegação
      nextEpisode: getNextEpisode(media, season, episode),
      prevEpisode: getPrevEpisode(media, season, episode),
      // SEO
      ogTitle: `${media.title} - T${season}E${episode}`,
      ogDescription: media.description,
      ogImage: media.poster,
      ogUrl: `${process.env.FRONTEND_URL}/embed/series/${tmdbId}/${season}/${episode}`
    });

  } catch (error) {
    logger.error('Erro no embed de série:', error);
    res.status(500).render('embed/error', {
      title: 'Erro no Player',
      message: 'Ocorreu um erro ao carregar o episódio.'
    });
  }
});

// @route   GET /embed/info/:type/:tmdbId
// @desc    Informações da mídia (sem player)
// @access  Público
router.get('/info/:type/:tmdbId', async (req, res) => {
  try {
    const { type, tmdbId } = req.params;

    const media = await Media.findOne({
      tmdbId: parseInt(tmdbId),
      type: type === 'movie' ? 'movie' : 'series',
      isActive: true
    });

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
      cast: media.cast?.slice(0, 5), // Apenas 5 primeiros atores
      availableOn: media.availableOn,
      embedUrl: media.embedUrl,
      // Se for série, incluir info das temporadas
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
    logger.error('Erro ao buscar info da mídia:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   POST /embed/track-view
// @desc    Rastrear visualização para analytics
// @access  Público
router.post('/track-view', async (req, res) => {
  try {
    const { tmdbId, type, duration, quality, userId } = req.body;

    // Registrar visualização detalhada
    const media = await Media.findOne({
      tmdbId: parseInt(tmdbId),
      type
    });

    if (media) {
      // Atualizar estatísticas
      await Media.findByIdAndUpdate(media._id, {
        $inc: {
          'analytics.views': 1,
          'analytics.totalWatchTime': duration || 0
        },
        $push: {
          'analytics.viewHistory': {
            userId: userId || null,
            timestamp: new Date(),
            duration: duration || 0,
            quality,
            userAgent: req.get('User-Agent'),
            ip: req.ip
          }
        }
      });

      // Se usuário logado, atualizar histórico pessoal
      if (userId) {
        await User.findByIdAndUpdate(userId, {
          $push: {
            'watchHistory': {
              mediaId: media._id,
              watchedAt: new Date(),
              duration: duration || 0,
              completed: duration >= (media.duration * 60 * 0.8) // 80% = completo
            }
          }
        });
      }
    }

    res.json({ success: true });

  } catch (error) {
    logger.error('Erro ao rastrear visualização:', error);
    res.status(500).json({ success: false });
  }
});

// @route   GET /embed/search
// @desc    Busca para embeds externos
// @access  Público
router.get('/search', async (req, res) => {
  try {
    const { q, type, limit = 10 } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: 'Parâmetro de busca obrigatório'
      });
    }

    const searchQuery = {
      isActive: true,
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { originalTitle: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } }
      ]
    };

    if (type && ['movie', 'series'].includes(type)) {
      searchQuery.type = type;
    }

    const results = await Media.find(searchQuery)
      .select('tmdbId imdbId title originalTitle type year poster rating.ageRating embedUrl')
      .limit(parseInt(limit))
      .sort({ popularity: -1 });

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
          ageRating: media.rating.ageRating,
          embedUrl: `${process.env.FRONTEND_URL}${media.embedUrl}`
        }))
      }
    });

  } catch (error) {
    logger.error('Erro na busca de embeds:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Funções auxiliares

async function getStreamingUrls(media, quality) {
  // Aqui você integraria com seu sistema de armazenamento de vídeos
  // Por exemplo: AWS S3, Google Cloud Storage, CDN próprio, etc.
  
  const baseUrl = process.env.CDN_URL || 'https://cdn.streamvault.com.br';
  
  // Estrutura de exemplo - adapte para seu sistema
  const urls = {
    auto: `${baseUrl}/movies/${media.tmdbId}/auto.m3u8`,
    '480p': `${baseUrl}/movies/${media.tmdbId}/480p.mp4`,
    '720p': `${baseUrl}/movies/${media.tmdbId}/720p.mp4`,
    '1080p': `${baseUrl}/movies/${media.tmdbId}/1080p.mp4`,
    '4k': `${baseUrl}/movies/${media.tmdbId}/4k.mp4`
  };

  // Filtrar por qualidade disponível baseado na assinatura do usuário
  return urls;
}

async function getEpisodeStreamingUrls(media, season, episode, quality) {
  const baseUrl = process.env.CDN_URL || 'https://cdn.streamvault.com.br';
  
  const urls = {
    auto: `${baseUrl}/series/${media.tmdbId}/s${season}e${episode}/auto.m3u8`,
    '480p': `${baseUrl}/series/${media.tmdbId}/s${season}e${episode}/480p.mp4`,
    '720p': `${baseUrl}/series/${media.tmdbId}/s${season}e${episode}/720p.mp4`,
    '1080p': `${baseUrl}/series/${media.tmdbId}/s${season}e${episode}/1080p.mp4`,
    '4k': `${baseUrl}/series/${media.tmdbId}/s${season}e${episode}/4k.mp4`
  };

  return urls;
}

function generateEpisodeList(seasonData) {
  // Gerar lista de episódios baseada na contagem
  const episodes = [];
  for (let i = 1; i <= seasonData.episodeCount; i++) {
    episodes.push({
      episodeNumber: i,
      title: `Episódio ${i}`,
      // Aqui você buscaria dados reais dos episódios se tiver
    });
  }
  return episodes;
}

function getNextEpisode(media, currentSeason, currentEpisode) {
  const season = media.seasons?.find(s => s.seasonNumber === parseInt(currentSeason));
  if (!season) return null;

  const nextEpisodeNum = parseInt(currentEpisode) + 1;
  
  // Se há próximo episódio na mesma temporada
  if (nextEpisodeNum <= season.episodeCount) {
    return {
      season: currentSeason,
      episode: nextEpisodeNum,
      url: `/embed/series/${media.tmdbId}/${currentSeason}/${nextEpisodeNum}`
    };
  }

  // Verificar próxima temporada
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
  
  // Se há episódio anterior na mesma temporada
  if (prevEpisodeNum >= 1) {
    return {
      season: currentSeason,
      episode: prevEpisodeNum,
      url: `/embed/series/${media.tmdbId}/${currentSeason}/${prevEpisodeNum}`
    };
  }

  // Verificar temporada anterior
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

module.exports = router;
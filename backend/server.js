const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const fileUpload = require('express-fileupload');
const path = require('path');
require('dotenv').config();

// Import configurations
const { connectDB } = require('./src/config/database');
const { connectRedis } = require('./src/config/redis');
const logger = require('./src/utils/logger');

// Import middleware
const errorHandler = require('./src/middleware/errorHandler');
const { corsMiddleware } = require('./src/middleware/cors');
const rateLimiter = require('./src/middleware/rateLimiter');

// Import routes
const authRoutes = require('./src/routes/auth');
const mediaRoutes = require('./src/routes/media');
const userRoutes = require('./src/routes/user');
const paymentRoutes = require('./src/routes/payment');
const embedRoutes = require('./src/routes/embed');
const adminRoutes = require('./src/routes/admin');

// Import jobs
const { startCronJobs } = require('./src/jobs/syncCatalog');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3001",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:", "blob:", "https://image.tmdb.org", "https://res.cloudinary.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://js.stripe.com"],
      mediaSrc: ["'self'", "https:", "blob:", "data:"],
      connectSrc: ["'self'", "https:", "wss:", "https://api.themoviedb.org", "https://api.mercadopago.com"],
      frameSrc: ["'self'", "https:", "blob:"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
app.use(corsMiddleware);

// Compression middleware
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Request logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', { 
    stream: { 
      write: message => logger.info(message.trim()) 
    },
    skip: (req, res) => res.statusCode < 400
  }));
}

// Body parsing middleware
app.use(express.json({ 
  limit: '50mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// File upload middleware
app.use(fileUpload({
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  useTempFiles: true,
  tempFileDir: path.join(__dirname, 'public/temp'),
  createParentPath: true,
  abortOnLimit: true,
  responseOnLimit: "Arquivo muito grande. Limite: 100MB"
}));

// Session middleware (for OAuth and admin)
const redisClient = connectRedis();
app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET || 'streamvault-brasil-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Rate limiting
app.use('/api/', rateLimiter.apiLimiter);
app.use('/embed/', rateLimiter.embedLimiter);

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: require('./package.json').version,
    services: {
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      redis: redisClient.status || 'unknown'
    }
  });
});

// API Status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    api: 'StreamVault Brasil API',
    version: '1.0.0',
    status: 'online',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/api/auth',
      media: '/api/media',
      user: '/api/user',
      payment: '/api/payment',
      embed: '/embed',
      admin: '/api/admin'
    }
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/user', userRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);

// Embed routes (similar to Acteia)
app.use('/embed', embedRoutes);

// Sitemap and SEO
app.get('/sitemap.xml', async (req, res) => {
  try {
    const { generateSitemap } = require('./src/jobs/generateSitemap');
    const sitemap = await generateSitemap();
    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (error) {
    logger.error('Error generating sitemap:', error);
    res.status(500).send('Error generating sitemap');
  }
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *
Allow: /
Allow: /embed/
Disallow: /api/
Disallow: /admin/
Disallow: /uploads/temp/

Sitemap: ${process.env.BACKEND_URL || 'http://localhost:3000'}/sitemap.xml`);
});

// RSS Feed
app.get('/feed.xml', async (req, res) => {
  try {
    const RSS = require('rss');
    const Media = require('./src/models/Media');
    
    const feed = new RSS({
      title: 'StreamVault Brasil - Novos Lançamentos',
      description: 'Os mais recentes filmes, séries e animes na plataforma brasileira',
      feed_url: `${process.env.BACKEND_URL}/feed.xml`,
      site_url: process.env.FRONTEND_URL || 'http://localhost:3001',
      language: 'pt-BR',
      pubDate: new Date(),
      ttl: 60
    });

    const recentMedia = await Media.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('title description poster createdAt slug type');

    recentMedia.forEach(media => {
      feed.item({
        title: media.title,
        description: media.description,
        url: `${process.env.FRONTEND_URL}/${media.type}/${media.slug}`,
        date: media.createdAt,
        enclosure: { url: media.poster, type: 'image/jpeg' }
      });
    });

    res.set('Content-Type', 'text/xml');
    res.send(feed.xml());
  } catch (error) {
    logger.error('Error generating RSS feed:', error);
    res.status(500).send('Error generating RSS feed');
  }
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../frontend/dist');
  app.use(express.static(frontendPath));
  
  // Handle React Router
  app.get('*', (req, res) => {
    // Skip API and embed routes
    if (req.path.startsWith('/api/') || req.path.startsWith('/embed/')) {
      return res.status(404).json({ error: 'Route not found' });
    }
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    message: `The requested endpoint ${req.originalUrl} does not exist.`,
    availableEndpoints: [
      '/api/auth',
      '/api/media', 
      '/api/user',
      '/api/payment',
      '/api/admin',
      '/embed'
    ]
  });
});

// Global error handler
app.use(errorHandler);

// Socket.IO for real-time features
io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);
  
  // Join user room for notifications
  socket.on('join', (userId) => {
    socket.join(`user_${userId}`);
    logger.debug(`User ${userId} joined room`);
  });

  // Handle video progress updates
  socket.on('video_progress', (data) => {
    // Broadcast to user's other devices
    socket.to(`user_${data.userId}`).emit('sync_progress', data);
  });

  // Handle live chat for admin support
  socket.on('admin_message', (data) => {
    io.to(`user_${data.userId}`).emit('admin_reply', data);
  });

  socket.on('disconnect', () => {
    logger.debug(`Socket disconnected: ${socket.id}`);
  });
});

// Database connection and server startup
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();
    
    // Start cron jobs for content synchronization
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_CRON === 'true') {
      startCronJobs();
      logger.info('🤖 Cron jobs started for content synchronization');
    }
    
    // Start server
    server.listen(PORT, () => {
      logger.info(`🚀 StreamVault Brasil server running on port ${PORT}`);
      logger.info(`📱 Environment: ${process.env.NODE_ENV}`);
      logger.info(`🌐 Backend URL: ${process.env.BACKEND_URL || `http://localhost:${PORT}`}`);
      logger.info(`🎬 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3001'}`);
      
      if (process.env.NODE_ENV === 'development') {
        logger.info(`📊 Health check: http://localhost:${PORT}/health`);
        logger.info(`🔗 API Status: http://localhost:${PORT}/api/status`);
      }
    });

    // Graceful shutdown
    const gracefulShutdown = (signal) => {
      logger.info(`${signal} received, shutting down gracefully`);
      server.close(() => {
        mongoose.connection.close(false, () => {
          logger.info('MongoDB connection closed');
          redisClient.quit(() => {
            logger.info('Redis connection closed');
            process.exit(0);
          });
        });
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    return server;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Only start server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = { app, server, io };
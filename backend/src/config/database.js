const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false,
      bufferMaxEntries: 0
    });

    logger.info(`MongoDB Connected: ${conn.connection.host}`);
    logger.info(`Database: ${conn.connection.name}`);

    // Connection event handlers
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected. Attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected successfully');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed through app termination');
        process.exit(0);
      } catch (error) {
        logger.error('Error during MongoDB shutdown:', error);
        process.exit(1);
      }
    });

    return conn;
  } catch (error) {
    logger.error('Database connection failed:', error);
    process.exit(1);
  }
};

// Database health check
const checkDBHealth = async () => {
  try {
    const state = mongoose.connection.readyState;
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    return {
      status: states[state],
      host: mongoose.connection.host,
      name: mongoose.connection.name,
      collections: Object.keys(mongoose.connection.collections).length
    };
  } catch (error) {
    logger.error('Database health check failed:', error);
    return { status: 'error', error: error.message };
  }
};

// Create indexes for better performance
const createIndexes = async () => {
  try {
    const Media = require('../models/Media');
    const User = require('../models/User');
    const Payment = require('../models/Payment');

    // Media indexes
    await Media.collection.createIndex({ tmdbId: 1, type: 1 }, { unique: true });
    await Media.collection.createIndex({ slug: 1 }, { unique: true });
    await Media.collection.createIndex({ title: 'text', description: 'text' });
    await Media.collection.createIndex({ genre: 1 });
    await Media.collection.createIndex({ year: 1 });
    await Media.collection.createIndex({ 'rating.tmdb.average': -1 });
    await Media.collection.createIndex({ popularity: -1 });
    await Media.collection.createIndex({ featured: 1, trending: 1 });
    await Media.collection.createIndex({ isActive: 1 });
    await Media.collection.createIndex({ createdAt: -1 });

    // User indexes
    await User.collection.createIndex({ email: 1 }, { unique: true });
    await User.collection.createIndex({ 'subscription.status': 1 });
    await User.collection.createIndex({ isActive: 1 });
    await User.collection.createIndex({ role: 1 });

    // Payment indexes
    await Payment.collection.createIndex({ userId: 1 });
    await Payment.collection.createIndex({ transactionId: 1 }, { unique: true });
    await Payment.collection.createIndex({ mercadoPagoId: 1 });
    await Payment.collection.createIndex({ status: 1 });
    await Payment.collection.createIndex({ createdAt: -1 });

    logger.info('Database indexes created successfully');
  } catch (error) {
    logger.error('Error creating database indexes:', error);
  }
};

module.exports = {
  connectDB,
  checkDBHealth,
  createIndexes
};
# StreamVault Setup Guide

This guide will walk you through setting up StreamVault locally and deploying it to production using free hosting services.

## 🚀 Quick Start

### Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js 18+** - [Download](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Git** - [Download](https://git-scm.com/)

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/streamvault.git
cd streamvault
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Setup

Copy the environment template and configure your settings:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Basic Configuration
NODE_ENV=development
PORT=3000
API_URL=http://localhost:3000

# Database (MongoDB Atlas Free Tier)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/streamvault

# JWT Secrets (generate strong random strings)
JWT_ACCESS_SECRET=your-super-secret-access-token-key-here
JWT_REFRESH_SECRET=your-super-secret-refresh-token-key-here

# Add other configuration as needed
```

### 4. Start Development Server

```bash
npm run dev
```

Your API will be running at `http://localhost:3000`

## 🔧 Detailed Configuration

### MongoDB Atlas Setup (Free)

1. **Create Account**: Go to [MongoDB Atlas](https://cloud.mongodb.com/) and create a free account
2. **Create Cluster**: Create a new M0 (free) cluster
3. **Database Access**: Create a database user with read/write permissions
4. **Network Access**: Add your IP address (or 0.0.0.0/0 for development)
5. **Connect**: Get your connection string and add it to `.env`

### Firebase Setup (Authentication)

1. **Create Project**: Go to [Firebase Console](https://console.firebase.google.com/)
2. **Enable Authentication**: Enable Email/Password, Google, and Facebook providers
3. **Generate Service Account**: Download the service account key
4. **Configure Environment**: Add Firebase credentials to `.env`

### External APIs

#### TMDB API (Movie Database)
1. Sign up at [TMDB](https://www.themoviedb.org/settings/api)
2. Get your API key
3. Add to `.env`: `TMDB_API_KEY=your_api_key`

#### Cloudinary (Image/Video Storage)
1. Create account at [Cloudinary](https://cloudinary.com/)
2. Get your cloud name, API key, and secret
3. Add to `.env`

## 🌐 Production Deployment

### Deploy to Render (Free)

1. **Create Render Account**: Sign up at [Render](https://render.com/)

2. **Connect Repository**: Connect your GitHub repository

3. **Create Web Service**:
   - Choose your repository
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: Node

4. **Environment Variables**: Add all your production environment variables

5. **Database**: Create a free PostgreSQL database (or use MongoDB Atlas)

### Environment Variables for Production

```env
NODE_ENV=production
PORT=10000
MONGODB_URI=your_production_mongodb_uri
JWT_ACCESS_SECRET=your_production_access_secret
JWT_REFRESH_SECRET=your_production_refresh_secret
CORS_ORIGIN=https://your-app.onrender.com
```

### Deploy with Render YAML

Use the included `render.yaml` file for automatic deployment:

```bash
# Commit your changes
git add .
git commit -m "Initial setup"
git push origin main
```

Render will automatically deploy your app when you push to the main branch.

## 📱 Frontend Setup (Next Steps)

After the backend is running, you'll need to set up the frontend:

1. **Create Frontend Directory**:
```bash
mkdir frontend
cd frontend
npx create-next-app@latest . --typescript --tailwind --eslint
```

2. **Install Additional Dependencies**:
```bash
npm install @heroicons/react framer-motion zustand axios
```

3. **Configure API Base URL**:
```typescript
// frontend/lib/api.ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
```

## 🧪 Testing the API

### Health Check
```bash
curl http://localhost:3000/health
```

### Register a User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123",
    "displayName": "Test User"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123"
  }'
```

## 🔍 Available API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/profile` - Get user profile
- `POST /api/auth/refresh` - Refresh access token

### Media
- `GET /api/media` - Get all media with filters
- `GET /api/media/trending` - Get trending media
- `GET /api/media/featured` - Get featured media
- `GET /api/media/search` - Search media
- `GET /api/media/:id` - Get single media item

### User Features
- `GET /api/user/watchlist` - Get user's watchlist
- `POST /api/user/watchlist/:mediaId` - Add to watchlist
- `GET /api/user/history` - Get watch history
- `POST /api/user/history/:mediaId` - Update watch progress

### Subscriptions
- `GET /api/subscription/plans` - Get subscription plans
- `POST /api/subscription/subscribe` - Subscribe to plan
- `GET /api/subscription/status` - Get subscription status

### Admin (Requires Admin Access)
- `GET /api/admin/dashboard` - Get admin dashboard
- `GET /api/admin/users` - Manage users
- `GET /api/admin/media` - Manage media content

## 🛠️ Development Tools

### Code Quality
```bash
# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format

# Testing
npm test
npm run test:watch
```

### Database Management

Use MongoDB Compass to visually manage your database:
1. Download [MongoDB Compass](https://www.mongodb.com/products/compass)
2. Connect using your MongoDB URI
3. Browse collections and documents

## 📊 Monitoring and Analytics

### Free Monitoring Options

1. **Render Metrics**: Built-in monitoring on Render dashboard
2. **MongoDB Atlas Monitoring**: Database performance metrics
3. **Google Analytics**: Add tracking ID to your frontend
4. **Sentry** (Free tier): Error tracking and performance monitoring

### Setting up Sentry

1. Create account at [Sentry](https://sentry.io/)
2. Create new Node.js project
3. Add DSN to environment variables
4. Install Sentry SDK:
```bash
npm install @sentry/node
```

## 🔐 Security Checklist

- [ ] Use strong JWT secrets (32+ characters)
- [ ] Enable CORS with specific origins
- [ ] Use HTTPS in production
- [ ] Implement rate limiting
- [ ] Validate all user inputs
- [ ] Use environment variables for secrets
- [ ] Enable MongoDB authentication
- [ ] Regular security updates

## 🚨 Troubleshooting

### Common Issues

1. **MongoDB Connection Failed**
   - Check your connection string
   - Verify network access settings
   - Ensure database user has correct permissions

2. **JWT Token Issues**
   - Verify JWT secrets are set
   - Check token expiration times
   - Ensure consistent secret across restarts

3. **CORS Errors**
   - Add your frontend URL to CORS_ORIGIN
   - Check that credentials are properly configured

4. **Rate Limiting**
   - Check if you're hitting rate limits
   - Adjust limits in production if needed

### Getting Help

- **GitHub Issues**: Report bugs and request features
- **Documentation**: Check the `/docs` folder
- **Community**: Join our Discord server
- **Email**: support@streamvault.app

## 📈 Scaling Considerations

### When You Outgrow Free Tiers

1. **Database**: Upgrade MongoDB Atlas or migrate to dedicated hosting
2. **Hosting**: Upgrade Render plan or move to AWS/GCP/Azure
3. **CDN**: Implement Cloudflare or AWS CloudFront
4. **Caching**: Add Redis for session storage and caching
5. **Load Balancing**: Implement horizontal scaling

### Performance Optimization

- Enable database indexing
- Implement caching strategies
- Optimize image delivery
- Use CDN for static assets
- Monitor and optimize slow queries

---

🎉 **Congratulations!** You now have a fully functional streaming platform backend. Next steps involve building the frontend interface and mobile applications.

For more detailed information, check out the other documentation files in the `/docs` folder.
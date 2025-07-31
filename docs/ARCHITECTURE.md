# StreamVault System Architecture

## 🏗️ High-Level Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Client    │    │  Mobile Client  │    │   TV Client     │
│   (Next.js)     │    │ (React Native)  │    │   (Roku/ATV)    │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────┴─────────────┐
                    │      API Gateway          │
                    │    (Express.js/Render)    │
                    └─────────────┬─────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
    ┌─────────┴─────────┐ ┌──────┴──────┐ ┌─────────┴─────────┐
    │   Auth Service    │ │   Media     │ │   Payment         │
    │   (Firebase)      │ │   Service   │ │   Service         │
    └───────────────────┘ └─────────────┘ └───────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │      Database Layer       │
                    │    (MongoDB Atlas)        │
                    └───────────────────────────┘
```

## 🗄️ Database Schema

### Users Collection
```javascript
{
  _id: ObjectId,
  email: String,
  phone: String,
  displayName: String,
  photoURL: String,
  providers: [String], // ['email', 'google', 'facebook']
  subscription: {
    plan: String, // 'basic', 'premium', 'family'
    status: String, // 'active', 'cancelled', 'expired'
    startDate: Date,
    endDate: Date,
    paymentMethod: String
  },
  preferences: {
    language: String,
    subtitle: String,
    quality: String, // 'auto', 'hd', '4k'
    notifications: Boolean
  },
  watchHistory: [{
    mediaId: ObjectId,
    progress: Number, // seconds
    lastWatched: Date
  }],
  watchlist: [ObjectId],
  profiles: [{
    name: String,
    avatar: String,
    isKid: Boolean,
    restrictions: [String]
  }],
  createdAt: Date,
  updatedAt: Date
}
```

### Media Collection
```javascript
{
  _id: ObjectId,
  title: String,
  originalTitle: String,
  type: String, // 'movie', 'series', 'anime', 'cartoon', 'game'
  genre: [String],
  year: Number,
  rating: {
    imdb: Number,
    tmdb: Number,
    internal: Number
  },
  description: String,
  duration: Number, // minutes for movies, null for series
  poster: String,
  backdrop: String,
  trailer: String,
  
  // Series specific
  seasons: [{
    number: Number,
    episodes: [{
      number: Number,
      title: String,
      description: String,
      duration: Number,
      airDate: Date,
      sources: [{
        quality: String, // '480p', '720p', '1080p', '4k'
        url: String,
        size: Number // bytes
      }],
      subtitles: [{
        language: String,
        url: String
      }],
      dubbing: [{
        language: String,
        url: String
      }]
    }]
  }],
  
  // Movie specific
  sources: [{
    quality: String,
    url: String,
    size: Number
  }],
  subtitles: [{
    language: String,
    url: String
  }],
  dubbing: [{
    language: String,
    url: String
  }],
  
  // Metadata
  cast: [String],
  director: String,
  producer: String,
  studio: String,
  country: String,
  language: String,
  tags: [String],
  
  // Platform data
  availability: [{
    platform: String, // 'netflix', 'prime', 'disney', etc.
    region: String,
    url: String
  }],
  
  // Analytics
  views: Number,
  likes: Number,
  dislikes: Number,
  
  createdAt: Date,
  updatedAt: Date
}
```

### Reviews Collection
```javascript
{
  _id: ObjectId,
  userId: ObjectId,
  mediaId: ObjectId,
  rating: Number, // 1-5
  comment: String,
  likes: Number,
  reports: Number,
  isVerified: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

## 🔧 API Architecture

### Authentication Endpoints
```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/refresh
GET  /api/auth/profile
PUT  /api/auth/profile
POST /api/auth/forgot-password
POST /api/auth/reset-password
```

### Media Endpoints
```
GET  /api/media?type=movie&genre=action&page=1
GET  /api/media/trending
GET  /api/media/recommended
GET  /api/media/search?q=avengers
GET  /api/media/:id
GET  /api/media/:id/similar
POST /api/media/:id/rate
GET  /api/media/:id/reviews
```

### User Endpoints
```
GET  /api/user/watchlist
POST /api/user/watchlist/:mediaId
DELETE /api/user/watchlist/:mediaId
GET  /api/user/history
POST /api/user/history/:mediaId
GET  /api/user/continue-watching
```

### Subscription Endpoints
```
GET  /api/subscription/plans
POST /api/subscription/subscribe
POST /api/subscription/cancel
GET  /api/subscription/status
POST /api/subscription/webhook
```

## 🎨 Frontend Architecture

### Component Structure
```
src/
├── components/
│   ├── common/
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   ├── Sidebar.tsx
│   │   └── LoadingSpinner.tsx
│   ├── media/
│   │   ├── MediaCard.tsx
│   │   ├── MediaGrid.tsx
│   │   ├── MediaPlayer.tsx
│   │   └── MediaDetails.tsx
│   ├── auth/
│   │   ├── LoginForm.tsx
│   │   ├── RegisterForm.tsx
│   │   └── ProfileSettings.tsx
│   └── subscription/
│       ├── PlanCard.tsx
│       ├── PaymentForm.tsx
│       └── BillingHistory.tsx
├── pages/
│   ├── index.tsx
│   ├── browse/
│   ├── watch/
│   ├── profile/
│   └── subscription/
├── hooks/
│   ├── useAuth.ts
│   ├── useMedia.ts
│   ├── usePlayer.ts
│   └── useSubscription.ts
├── store/
│   ├── authStore.ts
│   ├── mediaStore.ts
│   └── playerStore.ts
├── services/
│   ├── api.ts
│   ├── auth.ts
│   └── payment.ts
└── utils/
    ├── constants.ts
    ├── helpers.ts
    └── types.ts
```

## 🚀 Deployment Architecture

### Production Environment
```
┌─────────────────┐
│   Cloudflare    │ ← CDN & DNS
│     (Free)      │
└─────────┬───────┘
          │
┌─────────┴───────┐
│     Render      │ ← Web Hosting
│   (Free Tier)   │
└─────────┬───────┘
          │
┌─────────┴───────┐
│  MongoDB Atlas  │ ← Database
│   (Free Tier)   │
└─────────────────┘
```

### Free Tier Specifications

**Render Free Tier:**
- 750 hours/month runtime
- 512MB RAM
- Automatic SSL
- Custom domains
- Auto-deploy from Git

**MongoDB Atlas Free Tier:**
- 512MB storage
- Shared clusters
- No connection limits
- Basic monitoring

**Cloudflare Free Tier:**
- Unlimited bandwidth
- Basic DDoS protection
- SSL certificates
- Basic analytics

## 📊 Performance Optimizations

### Frontend Optimizations
```typescript
// Lazy loading components
const MediaPlayer = lazy(() => import('./MediaPlayer'));
const AdminDashboard = lazy(() => import('./AdminDashboard'));

// Image optimization
const OptimizedImage = ({ src, alt, ...props }) => (
  <Image
    src={src}
    alt={alt}
    loading="lazy"
    placeholder="blur"
    blurDataURL="data:image/jpeg;base64,..."
    {...props}
  />
);

// Service Worker for caching
self.addEventListener('fetch', (event) => {
  if (event.request.destination === 'image') {
    event.respondWith(
      caches.open('images').then(cache => 
        cache.match(event.request) || 
        fetch(event.request).then(response => {
          cache.put(event.request, response.clone());
          return response;
        })
      )
    );
  }
});
```

### Backend Optimizations
```javascript
// Database indexing
db.media.createIndex({ type: 1, genre: 1, year: -1 });
db.media.createIndex({ title: "text", description: "text" });
db.users.createIndex({ email: 1 }, { unique: true });

// Query optimization
const getMediaByGenre = async (genre, page = 1, limit = 20) => {
  return await Media.find({ genre })
    .select('title poster rating year')
    .sort({ rating: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean(); // Returns plain objects instead of Mongoose documents
};

// Caching with Redis
const getPopularMedia = async () => {
  const cached = await redis.get('popular:media');
  if (cached) return JSON.parse(cached);
  
  const media = await Media.find()
    .sort({ views: -1 })
    .limit(50)
    .lean();
    
  await redis.setex('popular:media', 3600, JSON.stringify(media));
  return media;
};
```

## 🔒 Security Implementation

### JWT Authentication
```javascript
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId, type: 'access' },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );
  
  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
  
  return { accessToken, refreshToken };
};
```

### Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // limit each IP to 5 login attempts per windowMs
  skipSuccessfulRequests: true
});
```

### Input Validation
```javascript
const { body, validationResult } = require('express-validator');

const validateRegistration = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  body('displayName').trim().isLength({ min: 2, max: 50 }),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];
```

## 📱 Mobile Architecture

### React Native Structure
```
mobile/
├── src/
│   ├── components/
│   │   ├── common/
│   │   ├── media/
│   │   └── player/
│   ├── screens/
│   │   ├── HomeScreen.tsx
│   │   ├── BrowseScreen.tsx
│   │   ├── PlayerScreen.tsx
│   │   └── ProfileScreen.tsx
│   ├── navigation/
│   │   ├── AppNavigator.tsx
│   │   └── TabNavigator.tsx
│   ├── services/
│   └── utils/
├── android/
├── ios/ (future)
└── package.json
```

### TV App Architecture
```
tv/
├── roku/
│   ├── components/
│   ├── source/
│   └── manifest
├── androidtv/
│   ├── src/
│   │   ├── components/
│   │   │   ├── leanback/
│   │   │   └── player/
│   │   └── activities/
│   └── res/
└── shared/
    └── api/
```

## 🔄 CI/CD Pipeline

### GitHub Actions Workflow
```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test
      - run: npm run build

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Render
        run: |
          curl -X POST ${{ secrets.RENDER_DEPLOY_HOOK }}
```

This architecture provides a solid foundation for your streaming platform with zero-cost initial deployment and infinite scalability potential.
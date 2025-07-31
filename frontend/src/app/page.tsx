'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, Info, Star, TrendingUp } from 'lucide-react';
import Header from '@/components/Header';
import MediaCarousel from '@/components/MediaCarousel';
import Footer from '@/components/Footer';
import { useAuthStore } from '@/store/authStore';
import { useMediaStore } from '@/store/mediaStore';

export default function HomePage() {
  const { user } = useAuthStore();
  const { featuredMedia, trendingMedia, fetchFeaturedMedia, fetchTrendingMedia } = useMediaStore();
  const [heroMedia, setHeroMedia] = useState<any>(null);

  useEffect(() => {
    fetchFeaturedMedia();
    fetchTrendingMedia();
  }, []);

  useEffect(() => {
    if (featuredMedia.length > 0) {
      setHeroMedia(featuredMedia[0]);
    }
  }, [featuredMedia]);

  const handlePlayClick = () => {
    if (!user) {
      // Redirecionar para login
      window.location.href = '/login';
      return;
    }
    
    if (heroMedia) {
      window.location.href = `/assistir/${heroMedia.slug}`;
    }
  };

  const handleInfoClick = () => {
    if (heroMedia) {
      window.location.href = `/filme/${heroMedia.slug}`;
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      
      {/* Hero Section */}
      {heroMedia && (
        <section className="relative h-screen flex items-center justify-start">
          {/* Background Image */}
          <div 
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.1) 100%), url(${heroMedia.backdrop})`
            }}
          />
          
          {/* Content */}
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
              >
                {/* Badge */}
                <div className="flex items-center space-x-2 mb-4">
                  <span className="bg-red-600 text-white px-3 py-1 rounded text-sm font-semibold">
                    DESTAQUE
                  </span>
                  <div className="flex items-center space-x-1">
                    <Star className="w-4 h-4 text-yellow-400 fill-current" />
                    <span className="text-sm text-gray-300">{heroMedia.rating?.internal?.average || 4.5}</span>
                  </div>
                </div>

                {/* Title */}
                <h1 className="text-5xl md:text-7xl font-bold mb-4 leading-tight">
                  {heroMedia.title}
                </h1>

                {/* Description */}
                <p className="text-lg md:text-xl text-gray-300 mb-8 leading-relaxed max-w-xl">
                  {heroMedia.description}
                </p>

                {/* Metadata */}
                <div className="flex items-center space-x-4 mb-8 text-sm text-gray-400">
                  <span>{heroMedia.year}</span>
                  <span>•</span>
                  <span className="bg-gray-800 px-2 py-1 rounded">{heroMedia.rating?.ageRating || 'L'}</span>
                  <span>•</span>
                  <span>{heroMedia.genre?.join(', ')}</span>
                  {heroMedia.duration && (
                    <>
                      <span>•</span>
                      <span>{Math.floor(heroMedia.duration / 60)}h {heroMedia.duration % 60}min</span>
                    </>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-4">
                  <motion.button
                    onClick={handlePlayClick}
                    className="flex items-center space-x-2 bg-white text-black px-8 py-3 rounded font-semibold hover:bg-gray-200 transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Play className="w-5 h-5 fill-current" />
                    <span>Assistir</span>
                  </motion.button>

                  <motion.button
                    onClick={handleInfoClick}
                    className="flex items-center space-x-2 bg-gray-600 bg-opacity-70 text-white px-8 py-3 rounded font-semibold hover:bg-opacity-90 transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Info className="w-5 h-5" />
                    <span>Mais Informações</span>
                  </motion.button>
                </div>
              </motion.div>
            </div>
          </div>
        </section>
      )}

      {/* Content Sections */}
      <main className="relative z-20 -mt-32 pb-20">
        {/* Em Alta */}
        <section className="mb-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center space-x-2 mb-6">
              <TrendingUp className="w-6 h-6 text-red-600" />
              <h2 className="text-2xl font-bold">Em Alta no Brasil</h2>
            </div>
            <MediaCarousel items={trendingMedia} />
          </div>
        </section>

        {/* Filmes Populares */}
        <section className="mb-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold mb-6">Filmes Populares</h2>
            <MediaCarousel items={featuredMedia.filter(item => item.type === 'movie')} />
          </div>
        </section>

        {/* Séries Brasileiras */}
        <section className="mb-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold mb-6">Séries Brasileiras</h2>
            <MediaCarousel items={featuredMedia.filter(item => item.type === 'series' && item.country?.includes('Brasil'))} />
          </div>
        </section>

        {/* Animes */}
        <section className="mb-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold mb-6">Animes</h2>
            <MediaCarousel items={featuredMedia.filter(item => item.type === 'anime')} />
          </div>
        </section>

        {/* Documentários */}
        <section className="mb-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold mb-6">Documentários</h2>
            <MediaCarousel items={featuredMedia.filter(item => item.type === 'documentary')} />
          </div>
        </section>

        {/* Continue Assistindo - apenas para usuários logados */}
        {user && (
          <section className="mb-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-2xl font-bold mb-6">Continue Assistindo</h2>
              <MediaCarousel items={[]} showProgress={true} />
            </div>
          </section>
        )}

        {/* Call to Action para usuários não logados */}
        {!user && (
          <section className="py-20 bg-gradient-to-r from-red-900 to-red-700">
            <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
              >
                <h2 className="text-4xl font-bold mb-4">
                  Pronto para Assistir?
                </h2>
                <p className="text-xl text-gray-200 mb-8">
                  Milhares de filmes, séries e animes esperando por você. 
                  Comece sua jornada no entretenimento brasileiro.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <motion.a
                    href="/planos"
                    className="bg-white text-red-700 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Ver Planos - A partir de R$ 19,99
                  </motion.a>
                  <motion.a
                    href="/login"
                    className="border-2 border-white text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-white hover:text-red-700 transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Fazer Login
                  </motion.a>
                </div>
              </motion.div>
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}
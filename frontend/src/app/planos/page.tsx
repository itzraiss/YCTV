'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, Crown, Users, Zap, CreditCard, QrCode, FileText } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PagamentoModal from '@/components/PagamentoModal';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';

interface Plano {
  id: string;
  nome: string;
  preco: number;
  precoFormatado: string;
  recursos: string[];
  popular?: boolean;
  icone: any;
  cor: string;
  descricao: string;
}

const planos: Plano[] = [
  {
    id: 'basico',
    nome: 'Básico',
    preco: 19.99,
    precoFormatado: 'R$ 19,99',
    descricao: 'Perfeito para começar sua jornada no streaming',
    icone: Zap,
    cor: 'from-blue-500 to-blue-600',
    recursos: [
      'Acesso ao conteúdo HD',
      'Qualidade até 720p',
      '2 dispositivos simultâneos',
      'Sem anúncios',
      'Downloads limitados (5 por mês)',
      'Catálogo completo de filmes e séries',
      'Suporte por email'
    ]
  },
  {
    id: 'premium',
    nome: 'Premium',
    preco: 29.99,
    precoFormatado: 'R$ 29,99',
    descricao: 'A escolha mais popular dos nossos usuários',
    icone: Crown,
    cor: 'from-red-500 to-red-600',
    popular: true,
    recursos: [
      'Acesso completo ao conteúdo',
      'Qualidade 4K Ultra HD',
      '4 dispositivos simultâneos',
      'Sem anúncios',
      'Downloads ilimitados',
      'Acesso antecipado a lançamentos',
      'Conteúdo exclusivo',
      'Suporte prioritário'
    ]
  },
  {
    id: 'familia',
    nome: 'Família',
    preco: 39.99,
    precoFormatado: 'R$ 39,99',
    descricao: 'Ideal para toda a família assistir junta',
    icone: Users,
    cor: 'from-purple-500 to-purple-600',
    recursos: [
      'Acesso completo ao conteúdo',
      'Qualidade 4K Ultra HD',
      '6 dispositivos simultâneos',
      'Sem anúncios',
      'Downloads ilimitados',
      'Controle parental avançado',
      '6 perfis personalizados',
      'Acesso antecipado a lançamentos',
      'Conteúdo exclusivo',
      'Suporte 24/7'
    ]
  }
];

const metodosPagamento = [
  {
    id: 'pix',
    nome: 'PIX',
    descricao: 'Pagamento instantâneo',
    icone: QrCode,
    tempo: 'Aprovação imediata',
    popular: true
  },
  {
    id: 'cartao',
    nome: 'Cartão de Crédito/Débito',
    descricao: 'Visa, Mastercard, Elo',
    icone: CreditCard,
    tempo: 'Aprovação imediata'
  },
  {
    id: 'boleto',
    nome: 'Boleto Bancário',
    descricao: 'Pague em qualquer banco',
    icone: FileText,
    tempo: 'Até 2 dias úteis'
  }
];

export default function PlanosPage() {
  const { user } = useAuthStore();
  const [planoSelecionado, setPlanoSelecionado] = useState<string | null>(null);
  const [metodoPagamento, setMetodoPagamento] = useState<string>('pix');
  const [mostrarModal, setMostrarModal] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const handleEscolherPlano = (planoId: string) => {
    if (!user) {
      toast.error('Faça login para escolher um plano');
      window.location.href = '/login';
      return;
    }

    setPlanoSelecionado(planoId);
    setMostrarModal(true);
  };

  const handleConfirmarPagamento = async (dadosPagamento: any) => {
    setCarregando(true);
    
    try {
      // Aqui seria feita a integração com o backend
      toast.success('Pagamento processado com sucesso!');
      setMostrarModal(false);
      
      // Redirecionar para página de confirmação
      setTimeout(() => {
        window.location.href = '/conta/assinatura';
      }, 2000);
      
    } catch (error) {
      toast.error('Erro ao processar pagamento. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      
      {/* Hero Section */}
      <section className="pt-24 pb-12 bg-gradient-to-b from-gray-900 to-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              Escolha seu Plano
            </h1>
            <p className="text-xl text-gray-300 mb-8 max-w-3xl mx-auto">
              Assista filmes, séries, animes e documentários quando e onde quiser. 
              Cancele a qualquer momento.
            </p>
            <div className="flex flex-wrap justify-center gap-4 text-sm">
              <div className="flex items-center space-x-2 bg-green-600 bg-opacity-20 text-green-400 px-4 py-2 rounded-full">
                <Check className="w-4 h-4" />
                <span>Sem taxa de cancelamento</span>
              </div>
              <div className="flex items-center space-x-2 bg-blue-600 bg-opacity-20 text-blue-400 px-4 py-2 rounded-full">
                <Check className="w-4 h-4" />
                <span>Primeira semana grátis</span>
              </div>
              <div className="flex items-center space-x-2 bg-purple-600 bg-opacity-20 text-purple-400 px-4 py-2 rounded-full">
                <Check className="w-4 h-4" />
                <span>Acesso completo</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Planos */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {planos.map((plano, index) => {
              const IconeComponent = plano.icone;
              
              return (
                <motion.div
                  key={plano.id}
                  initial={{ opacity: 0, y: 50 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: index * 0.1 }}
                  className={`relative bg-gray-900 rounded-2xl p-8 border-2 transition-all duration-300 hover:scale-105 ${
                    plano.popular 
                      ? 'border-red-500 shadow-2xl shadow-red-500/20' 
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  {/* Badge Popular */}
                  {plano.popular && (
                    <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                      <span className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-semibold">
                        MAIS POPULAR
                      </span>
                    </div>
                  )}

                  {/* Ícone e Nome */}
                  <div className="text-center mb-6">
                    <div className={`w-16 h-16 bg-gradient-to-r ${plano.cor} rounded-full flex items-center justify-center mx-auto mb-4`}>
                      <IconeComponent className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold mb-2">{plano.nome}</h3>
                    <p className="text-gray-400 text-sm">{plano.descricao}</p>
                  </div>

                  {/* Preço */}
                  <div className="text-center mb-8">
                    <div className="text-4xl font-bold mb-2">
                      {plano.precoFormatado}
                      <span className="text-lg text-gray-400 font-normal">/mês</span>
                    </div>
                    <p className="text-sm text-gray-400">Cobrado mensalmente</p>
                  </div>

                  {/* Recursos */}
                  <div className="space-y-3 mb-8">
                    {plano.recursos.map((recurso, idx) => (
                      <div key={idx} className="flex items-start space-x-3">
                        <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-300">{recurso}</span>
                      </div>
                    ))}
                  </div>

                  {/* Botão */}
                  <motion.button
                    onClick={() => handleEscolherPlano(plano.id)}
                    className={`w-full py-4 rounded-xl font-semibold text-lg transition-all duration-300 ${
                      plano.popular
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-white hover:bg-gray-100 text-black'
                    }`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Escolher {plano.nome}
                  </motion.button>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Métodos de Pagamento */}
      <section className="py-16 bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Formas de Pagamento</h2>
            <p className="text-gray-400">Escolha a forma que preferir para pagar sua assinatura</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {metodosPagamento.map((metodo, index) => {
              const IconeComponent = metodo.icone;
              
              return (
                <motion.div
                  key={metodo.id}
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.8, delay: index * 0.1 }}
                  className={`bg-black rounded-xl p-6 border-2 transition-all duration-300 hover:border-red-500 ${
                    metodo.popular ? 'border-red-500' : 'border-gray-700'
                  }`}
                >
                  {metodo.popular && (
                    <div className="text-right mb-2">
                      <span className="bg-red-600 text-white px-2 py-1 rounded text-xs font-semibold">
                        POPULAR
                      </span>
                    </div>
                  )}
                  
                  <div className="flex items-center space-x-4 mb-4">
                    <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center">
                      <IconeComponent className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{metodo.nome}</h3>
                      <p className="text-gray-400 text-sm">{metodo.descricao}</p>
                    </div>
                  </div>
                  
                  <div className="text-sm text-gray-300">
                    <strong>Tempo de aprovação:</strong> {metodo.tempo}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Perguntas Frequentes</h2>
          </div>

          <div className="space-y-6">
            {[
              {
                pergunta: 'Posso cancelar a qualquer momento?',
                resposta: 'Sim! Você pode cancelar sua assinatura a qualquer momento sem taxas de cancelamento. Sua assinatura permanecerá ativa até o final do período pago.'
              },
              {
                pergunta: 'Posso mudar de plano?',
                resposta: 'Claro! Você pode fazer upgrade ou downgrade do seu plano a qualquer momento. As alterações entram em vigor no próximo ciclo de cobrança.'
              },
              {
                pergunta: 'Como funciona o PIX?',
                resposta: 'Com o PIX, você recebe um QR Code para escanear no seu banco. O pagamento é aprovado instantaneamente e sua assinatura é ativada na hora.'
              },
              {
                pergunta: 'Posso assistir offline?',
                resposta: 'Sim! Todos os planos incluem downloads para assistir offline. O plano Básico tem limite de 5 downloads por mês, enquanto Premium e Família têm downloads ilimitados.'
              },
              {
                pergunta: 'Há conteúdo brasileiro?',
                resposta: 'Sim! Temos uma grande seleção de filmes, séries e documentários brasileiros, além de conteúdo internacional com dublagem e legendas em português.'
              }
            ].map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-gray-900 rounded-xl p-6"
              >
                <h3 className="font-semibold text-lg mb-3 text-red-400">{item.pergunta}</h3>
                <p className="text-gray-300 leading-relaxed">{item.resposta}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Modal de Pagamento */}
      {mostrarModal && planoSelecionado && (
        <PagamentoModal
          plano={planos.find(p => p.id === planoSelecionado)!}
          onClose={() => setMostrarModal(false)}
          onConfirmar={handleConfirmarPagamento}
          carregando={carregando}
        />
      )}

      <Footer />
    </div>
  );
}
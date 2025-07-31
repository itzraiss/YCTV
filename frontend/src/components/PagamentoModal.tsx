'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, QrCode, CreditCard, FileText, Clock, Check, Copy } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import InputMask from 'react-input-mask';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

interface PagamentoModalProps {
  plano: {
    id: string;
    nome: string;
    preco: number;
    precoFormatado: string;
  };
  onClose: () => void;
  onConfirmar: (dados: any) => void;
  carregando: boolean;
}

export default function PagamentoModal({ plano, onClose, onConfirmar, carregando }: PagamentoModalProps) {
  const [etapa, setEtapa] = useState<'metodo' | 'dados' | 'confirmacao'>('metodo');
  const [metodoPagamento, setMetodoPagamento] = useState<'pix' | 'cartao' | 'boleto'>('pix');
  const [tempoRestante, setTempoRestante] = useState(1800); // 30 minutos

  const { register, handleSubmit, formState: { errors } } = useForm();

  const dadosPix = {
    qrCode: 'pix.example.com/qr/v2/cobv/12345',
    copiaECola: '00020126580014BR.GOV.BCB.PIX0136...',
    valor: plano.preco
  };

  const formatarTempo = (segundos: number) => {
    const minutos = Math.floor(segundos / 60);
    const segs = segundos % 60;
    return `${minutos.toString().padStart(2, '0')}:${segs.toString().padStart(2, '0')}`;
  };

  const copiarPixCola = () => {
    navigator.clipboard.writeText(dadosPix.copiaECola);
    toast.success('Código PIX copiado!');
  };

  const onSubmit = (data: any) => {
    setEtapa('confirmacao');
  };

  const confirmarPagamento = () => {
    onConfirmar({ metodoPagamento, plano: plano.id, valor: plano.preco });
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between p-6 border-b border-gray-700">
            <div>
              <h2 className="text-2xl font-bold text-white">Finalizar Assinatura</h2>
              <p className="text-gray-400">Plano {plano.nome} - {plano.precoFormatado}/mês</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="p-6">
            {etapa === 'metodo' && (
              <div className="space-y-6">
                <h3 className="text-xl font-semibold text-white">Escolha a forma de pagamento</h3>
                
                <div className="space-y-4">
                  <div
                    onClick={() => setMetodoPagamento('pix')}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      metodoPagamento === 'pix' ? 'border-green-500 bg-green-500 bg-opacity-10' : 'border-gray-600'
                    }`}
                  >
                    <div className="flex items-center space-x-4">
                      <QrCode className="w-8 h-8 text-green-500" />
                      <div>
                        <h4 className="text-lg font-semibold text-white">PIX</h4>
                        <p className="text-gray-400">Pagamento instantâneo</p>
                      </div>
                      <div className="ml-auto text-white font-bold">{plano.precoFormatado}</div>
                    </div>
                  </div>

                  <div
                    onClick={() => setMetodoPagamento('cartao')}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      metodoPagamento === 'cartao' ? 'border-blue-500 bg-blue-500 bg-opacity-10' : 'border-gray-600'
                    }`}
                  >
                    <div className="flex items-center space-x-4">
                      <CreditCard className="w-8 h-8 text-blue-500" />
                      <div>
                        <h4 className="text-lg font-semibold text-white">Cartão</h4>
                        <p className="text-gray-400">Crédito ou Débito</p>
                      </div>
                      <div className="ml-auto text-white font-bold">{plano.precoFormatado}</div>
                    </div>
                  </div>

                  <div
                    onClick={() => setMetodoPagamento('boleto')}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      metodoPagamento === 'boleto' ? 'border-orange-500 bg-orange-500 bg-opacity-10' : 'border-gray-600'
                    }`}
                  >
                    <div className="flex items-center space-x-4">
                      <FileText className="w-8 h-8 text-orange-500" />
                      <div>
                        <h4 className="text-lg font-semibold text-white">Boleto</h4>
                        <p className="text-gray-400">Pague em qualquer banco</p>
                      </div>
                      <div className="ml-auto text-white font-bold">{plano.precoFormatado}</div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setEtapa('dados')}
                  className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-semibold"
                >
                  Continuar
                </button>
              </div>
            )}

            {etapa === 'dados' && (
              <div className="space-y-6">
                <h3 className="text-xl font-semibold text-white">Dados para pagamento</h3>
                
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Nome Completo</label>
                    <input
                      {...register('nome', { required: true })}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white"
                      placeholder="Seu nome completo"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">CPF</label>
                    <InputMask
                      mask="999.999.999-99"
                      {...register('cpf', { required: true })}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white"
                      placeholder="000.000.000-00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                    <input
                      type="email"
                      {...register('email', { required: true })}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white"
                      placeholder="seu@email.com"
                    />
                  </div>

                  {metodoPagamento === 'cartao' && (
                    <div className="space-y-4 p-4 bg-gray-800 rounded-xl">
                      <h4 className="font-semibold text-white">Dados do Cartão</h4>
                      
                      <div>
                        <InputMask
                          mask="9999 9999 9999 9999"
                          {...register('numeroCartao', { required: true })}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white"
                          placeholder="0000 0000 0000 0000"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <InputMask
                          mask="99/99"
                          {...register('validade', { required: true })}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white"
                          placeholder="MM/AA"
                        />
                        <input
                          type="password"
                          maxLength={4}
                          {...register('cvv', { required: true })}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white"
                          placeholder="CVV"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex space-x-4">
                    <button
                      type="button"
                      onClick={() => setEtapa('metodo')}
                      className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl font-semibold"
                    >
                      Voltar
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-semibold"
                    >
                      Revisar
                    </button>
                  </div>
                </form>
              </div>
            )}

            {etapa === 'confirmacao' && (
              <div className="space-y-6">
                {metodoPagamento === 'pix' && (
                  <div className="text-center space-y-6">
                    <h3 className="text-xl font-semibold text-white">Pague com PIX</h3>
                    
                    <div className="bg-white p-6 rounded-xl inline-block">
                      <QRCodeSVG value={dadosPix.qrCode} size={200} />
                    </div>

                    <div className="flex items-center justify-center space-x-2 text-orange-400">
                      <Clock className="w-5 h-5" />
                      <span>Expira em: {formatarTempo(tempoRestante)}</span>
                    </div>

                    <div className="bg-gray-800 p-4 rounded-xl">
                      <p className="text-sm text-gray-400 mb-2">Código PIX:</p>
                      <div className="flex items-center space-x-2">
                        <input
                          readOnly
                          value={dadosPix.copiaECola}
                          className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                        />
                        <button
                          onClick={copiarPixCola}
                          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {metodoPagamento === 'cartao' && (
                  <div className="space-y-6">
                    <h3 className="text-xl font-semibold text-white">Confirmar Pagamento</h3>
                    
                    <div className="bg-gray-800 p-6 rounded-xl">
                      <div className="flex justify-between mb-4">
                        <span className="text-gray-400">Plano:</span>
                        <span className="text-white font-semibold">{plano.nome}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Valor:</span>
                        <span className="text-white font-semibold">{plano.precoFormatado}</span>
                      </div>
                    </div>

                    <button
                      onClick={confirmarPagamento}
                      disabled={carregando}
                      className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-xl font-semibold disabled:opacity-50"
                    >
                      {carregando ? 'Processando...' : 'Confirmar Pagamento'}
                    </button>
                  </div>
                )}

                {metodoPagamento === 'boleto' && (
                  <div className="space-y-6">
                    <h3 className="text-xl font-semibold text-white">Boleto Gerado</h3>
                    
                    <div className="bg-gray-800 p-6 rounded-xl">
                      <div className="flex items-center space-x-3 text-orange-400 mb-4">
                        <FileText className="w-6 h-6" />
                        <span className="font-semibold">Boleto Bancário</span>
                      </div>
                      
                      <div className="space-y-2 mb-4">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Valor:</span>
                          <span className="text-white font-semibold">{plano.precoFormatado}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Vencimento:</span>
                          <span className="text-white">3 dias</span>
                        </div>
                      </div>

                      <button className="w-full bg-orange-600 hover:bg-orange-700 text-white py-3 rounded-xl font-semibold">
                        Baixar Boleto PDF
                      </button>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setEtapa('dados')}
                  className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl font-semibold"
                >
                  Voltar
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
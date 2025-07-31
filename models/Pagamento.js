const mongoose = require('mongoose');

const pagamentoSchema = new mongoose.Schema({
  // Informações do usuário
  usuarioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Informações do plano
  plano: {
    type: String,
    enum: ['basico', 'premium', 'familia'],
    required: true
  },
  
  // Informações financeiras
  valor: {
    type: Number,
    required: true
  },
  moeda: {
    type: String,
    default: 'BRL'
  },
  
  // Método de pagamento
  metodoPagamento: {
    type: String,
    enum: ['pix', 'cartao_credito', 'cartao_debito', 'boleto'],
    required: true
  },
  
  // Status do pagamento
  status: {
    type: String,
    enum: ['pendente', 'aprovado', 'rejeitado', 'cancelado', 'expirado', 'estornado'],
    default: 'pendente'
  },
  
  // IDs de transação
  idTransacao: {
    type: String,
    unique: true,
    required: true
  },
  mercadoPagoId: {
    type: String
  },
  preferenceId: {
    type: String
  },
  
  // Dados do Mercado Pago
  dadosMercadoPago: {
    type: Object,
    default: {}
  },
  
  // Informações específicas do PIX
  pixInfo: {
    qrCode: String,
    qrCodeBase64: String,
    copiaECola: String,
    dataExpiracao: Date
  },
  
  // Informações do cartão (dados não sensíveis)
  cartaoInfo: {
    bandeira: String, // visa, mastercard, elo
    ultimos4Digitos: String,
    nomePortador: String,
    parcelas: {
      type: Number,
      default: 1
    }
  },
  
  // Informações do boleto
  boletoInfo: {
    codigoBarras: String,
    linhaDigitavel: String,
    dataVencimento: Date,
    urlPdf: String
  },
  
  // Datas importantes
  dataAprovacao: Date,
  dataExpiracao: Date,
  dataEstorno: Date,
  
  // Informações fiscais brasileiras
  dadosFiscais: {
    cpf: String,
    cnpj: String,
    nomeCompleto: String,
    endereco: {
      cep: String,
      rua: String,
      numero: String,
      complemento: String,
      bairro: String,
      cidade: String,
      estado: String
    }
  },
  
  // Observações
  observacoes: String,
  
  // Timestamps
  criadoEm: {
    type: Date,
    default: Date.now
  },
  atualizadoEm: {
    type: Date,
    default: Date.now
  }
});

// Middleware para atualizar timestamp
pagamentoSchema.pre('save', function(next) {
  this.atualizadoEm = new Date();
  
  // Definir data de expiração para PIX (30 minutos)
  if (this.metodoPagamento === 'pix' && !this.pixInfo?.dataExpiracao) {
    if (!this.pixInfo) this.pixInfo = {};
    this.pixInfo.dataExpiracao = new Date(Date.now() + 30 * 60 * 1000);
  }
  
  // Definir data de expiração para boleto (3 dias)
  if (this.metodoPagamento === 'boleto' && !this.boletoInfo?.dataVencimento) {
    if (!this.boletoInfo) this.boletoInfo = {};
    this.boletoInfo.dataVencimento = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  }
  
  next();
});

// Índices para performance
pagamentoSchema.index({ usuarioId: 1 });
pagamentoSchema.index({ idTransacao: 1 });
pagamentoSchema.index({ mercadoPagoId: 1 });
pagamentoSchema.index({ status: 1 });
pagamentoSchema.index({ metodoPagamento: 1 });
pagamentoSchema.index({ criadoEm: -1 });
pagamentoSchema.index({ 'pixInfo.dataExpiracao': 1 });
pagamentoSchema.index({ 'boletoInfo.dataVencimento': 1 });

// Métodos do schema
pagamentoSchema.methods.estaExpirado = function() {
  if (this.metodoPagamento === 'pix' && this.pixInfo?.dataExpiracao) {
    return new Date() > this.pixInfo.dataExpiracao;
  }
  if (this.metodoPagamento === 'boleto' && this.boletoInfo?.dataVencimento) {
    return new Date() > this.boletoInfo.dataVencimento;
  }
  return false;
};

pagamentoSchema.methods.podeSerEstornado = function() {
  const diasParaEstorno = 30;
  const limiteEstorno = new Date(this.dataAprovacao?.getTime() + (diasParaEstorno * 24 * 60 * 60 * 1000));
  return this.status === 'aprovado' && new Date() <= limiteEstorno;
};

pagamentoSchema.methods.formatarValor = function() {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(this.valor);
};

// Métodos estáticos
pagamentoSchema.statics.buscarPorUsuario = function(usuarioId, limite = 10) {
  return this.find({ usuarioId })
    .sort({ criadoEm: -1 })
    .limit(limite)
    .populate('usuarioId', 'displayName email');
};

pagamentoSchema.statics.estatisticasPagamentos = async function() {
  const resultado = await this.aggregate([
    {
      $group: {
        _id: '$status',
        total: { $sum: 1 },
        valorTotal: { $sum: '$valor' }
      }
    }
  ]);
  
  return resultado;
};

pagamentoSchema.statics.relatorioPorMetodo = async function(dataInicio, dataFim) {
  return this.aggregate([
    {
      $match: {
        criadoEm: {
          $gte: dataInicio,
          $lte: dataFim
        }
      }
    },
    {
      $group: {
        _id: '$metodoPagamento',
        quantidade: { $sum: 1 },
        valorTotal: { $sum: '$valor' },
        aprovados: {
          $sum: {
            $cond: [{ $eq: ['$status', 'aprovado'] }, 1, 0]
          }
        }
      }
    }
  ]);
};

// Transform para JSON (remover dados sensíveis)
pagamentoSchema.methods.toJSON = function() {
  const pagamento = this.toObject();
  
  // Remover dados sensíveis do Mercado Pago
  if (pagamento.dadosMercadoPago) {
    delete pagamento.dadosMercadoPago.payer?.identification;
    delete pagamento.dadosMercadoPago.card?.cardholder;
  }
  
  return pagamento;
};

module.exports = mongoose.model('Pagamento', pagamentoSchema);
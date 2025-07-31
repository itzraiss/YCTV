const express = require('express');
const { body, validationResult } = require('express-validator');
const mercadopago = require('mercadopago');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const Pagamento = require('../models/Pagamento');
const auth = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Configurar Mercado Pago
mercadopago.configure({
  access_token: process.env.MERCADO_PAGO_ACCESS_TOKEN,
});

// Planos de assinatura brasileiros
const PLANOS_ASSINATURA = {
  basico: {
    nome: 'Básico',
    preco: 19.99,
    moeda: 'BRL',
    recursos: [
      'Acesso ao conteúdo HD',
      'Qualidade 720p',
      '2 dispositivos simultâneos',
      'Sem anúncios',
      'Downloads limitados (5 por mês)'
    ],
    limites: {
      qualidade: '720p',
      dispositivos: 2,
      perfis: 2,
      downloads: 5
    }
  },
  premium: {
    nome: 'Premium',
    preco: 29.99,
    moeda: 'BRL',
    recursos: [
      'Acesso completo ao conteúdo',
      'Qualidade 4K Ultra HD',
      '4 dispositivos simultâneos',
      'Sem anúncios',
      'Downloads ilimitados',
      'Acesso antecipado a lançamentos',
      'Conteúdo exclusivo'
    ],
    limites: {
      qualidade: '4k',
      dispositivos: 4,
      perfis: 4,
      downloads: -1
    }
  },
  familia: {
    nome: 'Família',
    preco: 39.99,
    moeda: 'BRL',
    recursos: [
      'Acesso completo ao conteúdo',
      'Qualidade 4K Ultra HD',
      '6 dispositivos simultâneos',
      'Sem anúncios',
      'Downloads ilimitados',
      'Controle parental avançado',
      '6 perfis personalizados',
      'Acesso antecipado a lançamentos',
      'Conteúdo exclusivo'
    ],
    limites: {
      qualidade: '4k',
      dispositivos: 6,
      perfis: 6,
      downloads: -1
    }
  }
};

// Middleware de validação
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      sucesso: false,
      mensagem: 'Erro de validação',
      erros: errors.array()
    });
  }
  next();
};

// @route   GET /api/pagamentos/planos
// @desc    Obter planos de assinatura disponíveis
// @access  Público
router.get('/planos', async (req, res) => {
  try {
    res.json({
      sucesso: true,
      dados: { 
        planos: PLANOS_ASSINATURA,
        metodosAceitos: ['pix', 'cartao_credito', 'cartao_debito', 'boleto'],
        moeda: 'BRL',
        pais: 'Brasil'
      }
    });

  } catch (error) {
    logger.error('Erro ao buscar planos:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno do servidor ao buscar planos'
    });
  }
});

// @route   POST /api/pagamentos/criar-pix
// @desc    Criar pagamento PIX
// @access  Privado
router.post('/criar-pix', auth, [
  body('plano').isIn(['basico', 'premium', 'familia']).withMessage('Plano de assinatura inválido')
], handleValidationErrors, async (req, res) => {
  try {
    const { plano } = req.body;
    const usuario = req.user;

    const detalhesPlano = PLANOS_ASSINATURA[plano];
    const idTransacao = uuidv4();

    // Criar pagamento PIX no Mercado Pago
    const payment = {
      transaction_amount: detalhesPlano.preco,
      description: `StreamVault ${detalhesPlano.nome} - Assinatura Mensal`,
      payment_method_id: 'pix',
      payer: {
        email: usuario.email,
        first_name: usuario.displayName.split(' ')[0],
        last_name: usuario.displayName.split(' ').slice(1).join(' ') || 'Usuário',
        identification: {
          type: 'CPF',
          number: '00000000000' // Em produção, coletar CPF real do usuário
        }
      },
      external_reference: idTransacao,
      notification_url: `${process.env.BACKEND_URL}/api/pagamentos/webhook`,
      date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutos
    };

    const response = await mercadopago.payment.create(payment);
    const pixData = response.body.point_of_interaction.transaction_data;

    // Salvar no banco de dados
    const novoPagamento = new Pagamento({
      usuarioId: usuario._id,
      plano: plano,
      valor: detalhesPlano.preco,
      moeda: 'BRL',
      metodoPagamento: 'pix',
      idTransacao: idTransacao,
      mercadoPagoId: response.body.id,
      status: 'pendente',
      dadosMercadoPago: response.body,
      pixInfo: {
        qrCode: pixData.qr_code,
        qrCodeBase64: pixData.qr_code_base64,
        copiaECola: pixData.qr_code,
        dataExpiracao: new Date(Date.now() + 30 * 60 * 1000)
      }
    });

    await novoPagamento.save();

    // Gerar QR Code visual
    const qrCodeImage = await QRCode.toDataURL(pixData.qr_code);

    logger.info(`Pagamento PIX criado - Usuário: ${usuario._id}, Valor: R$ ${detalhesPlano.preco}, ID: ${idTransacao}`);

    res.json({
      sucesso: true,
      mensagem: 'Pagamento PIX criado com sucesso',
      dados: {
        idPagamento: response.body.id,
        idTransacao: idTransacao,
        valor: detalhesPlano.preco,
        valorFormatado: novoPagamento.formatarValor(),
        status: response.body.status,
        qrCode: qrCodeImage,
        pixCopiaECola: pixData.qr_code,
        expiracao: novoPagamento.pixInfo.dataExpiracao,
        tempoRestante: 30, // minutos
        plano: {
          nome: detalhesPlano.nome,
          recursos: detalhesPlano.recursos
        },
        instrucoes: [
          '1. Abra o aplicativo do seu banco',
          '2. Escolha a opção Pagar com PIX',
          '3. Escaneie o QR Code ou cole o código',
          '4. Confirme as informações e finalize o pagamento',
          '5. Sua assinatura será ativada automaticamente'
        ]
      }
    });

  } catch (error) {
    logger.error('Erro ao criar PIX:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno do servidor ao processar pagamento PIX'
    });
  }
});

// @route   POST /api/pagamentos/cartao
// @desc    Processar pagamento com cartão
// @access  Privado
router.post('/cartao', auth, [
  body('plano').isIn(['basico', 'premium', 'familia']).withMessage('Plano inválido'),
  body('token').notEmpty().withMessage('Token do cartão é obrigatório'),
  body('parcelas').isInt({ min: 1, max: 12 }).withMessage('Parcelas devem ser entre 1 e 12'),
  body('dadosCobranca.cpf').matches(/^\d{11}$/).withMessage('CPF deve ter 11 dígitos'),
  body('dadosCobranca.nomeCompleto').isLength({ min: 5 }).withMessage('Nome completo é obrigatório')
], handleValidationErrors, async (req, res) => {
  try {
    const { plano, token, parcelas, dadosCobranca } = req.body;
    const usuario = req.user;

    const detalhesPlano = PLANOS_ASSINATURA[plano];
    const idTransacao = uuidv4();

    // Calcular valor das parcelas
    const valorParcela = detalhesPlano.preco / parcelas;

    // Criar pagamento com cartão no Mercado Pago
    const payment = {
      transaction_amount: detalhesPlano.preco,
      token: token,
      description: `StreamVault ${detalhesPlano.nome} - Assinatura Mensal`,
      installments: parcelas,
      payment_method_id: req.body.payment_method_id, // visa, mastercard, etc
      issuer_id: req.body.issuer_id,
      payer: {
        email: usuario.email,
        identification: {
          type: 'CPF',
          number: dadosCobranca.cpf
        }
      },
      external_reference: idTransacao,
      notification_url: `${process.env.BACKEND_URL}/api/pagamentos/webhook`
    };

    const response = await mercadopago.payment.create(payment);

    // Salvar no banco
    const novoPagamento = new Pagamento({
      usuarioId: usuario._id,
      plano: plano,
      valor: detalhesPlano.preco,
      moeda: 'BRL',
      metodoPagamento: response.body.payment_method_id === 'debit_card' ? 'cartao_debito' : 'cartao_credito',
      idTransacao: idTransacao,
      mercadoPagoId: response.body.id,
      status: response.body.status,
      dadosMercadoPago: response.body,
      cartaoInfo: {
        bandeira: response.body.payment_method_id,
        ultimos4Digitos: response.body.card?.last_four_digits,
        nomePortador: dadosCobranca.nomeCompleto,
        parcelas: parcelas
      },
      dadosFiscais: {
        cpf: dadosCobranca.cpf,
        nomeCompleto: dadosCobranca.nomeCompleto
      }
    });

    await novoPagamento.save();

    // Se aprovado, ativar assinatura
    if (response.body.status === 'approved') {
      await ativarAssinatura(usuario._id, plano);
      novoPagamento.dataAprovacao = new Date();
      await novoPagamento.save();
    }

    logger.info(`Pagamento cartão processado - Usuário: ${usuario._id}, Status: ${response.body.status}, ID: ${idTransacao}`);

    res.json({
      sucesso: true,
      mensagem: response.body.status === 'approved' ? 'Pagamento aprovado com sucesso!' : 'Pagamento processado',
      dados: {
        idPagamento: response.body.id,
        idTransacao: idTransacao,
        status: response.body.status,
        statusDescricao: obterDescricaoStatus(response.body.status),
        valor: detalhesPlano.preco,
        valorFormatado: novoPagamento.formatarValor(),
        parcelas: parcelas,
        valorParcela: valorParcela,
        valorParcelaFormatado: new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        }).format(valorParcela),
        cartao: {
          bandeira: response.body.payment_method_id,
          ultimos4Digitos: response.body.card?.last_four_digits
        },
        plano: {
          nome: detalhesPlano.nome,
          recursos: detalhesPlano.recursos
        }
      }
    });

  } catch (error) {
    logger.error('Erro ao processar cartão:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno do servidor ao processar pagamento com cartão'
    });
  }
});

// @route   POST /api/pagamentos/boleto
// @desc    Gerar boleto bancário
// @access  Privado
router.post('/boleto', auth, [
  body('plano').isIn(['basico', 'premium', 'familia']).withMessage('Plano inválido'),
  body('dadosCobranca.cpf').matches(/^\d{11}$/).withMessage('CPF deve ter 11 dígitos'),
  body('dadosCobranca.nomeCompleto').isLength({ min: 5 }).withMessage('Nome completo é obrigatório')
], handleValidationErrors, async (req, res) => {
  try {
    const { plano, dadosCobranca } = req.body;
    const usuario = req.user;

    const detalhesPlano = PLANOS_ASSINATURA[plano];
    const idTransacao = uuidv4();

    // Criar boleto no Mercado Pago
    const payment = {
      transaction_amount: detalhesPlano.preco,
      description: `StreamVault ${detalhesPlano.nome} - Assinatura Mensal`,
      payment_method_id: 'bolbradesco', // ou outro banco
      payer: {
        email: usuario.email,
        first_name: dadosCobranca.nomeCompleto.split(' ')[0],
        last_name: dadosCobranca.nomeCompleto.split(' ').slice(1).join(' '),
        identification: {
          type: 'CPF',
          number: dadosCobranca.cpf
        },
        address: {
          zip_code: dadosCobranca.endereco?.cep || '00000000',
          street_name: dadosCobranca.endereco?.rua || 'Rua não informada',
          street_number: dadosCobranca.endereco?.numero || 'S/N',
          neighborhood: dadosCobranca.endereco?.bairro || 'Centro',
          city: dadosCobranca.endereco?.cidade || 'São Paulo',
          federal_unit: dadosCobranca.endereco?.estado || 'SP'
        }
      },
      external_reference: idTransacao,
      notification_url: `${process.env.BACKEND_URL}/api/pagamentos/webhook`,
      date_of_expiration: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() // 3 dias
    };

    const response = await mercadopago.payment.create(payment);

    // Salvar no banco
    const novoPagamento = new Pagamento({
      usuarioId: usuario._id,
      plano: plano,
      valor: detalhesPlano.preco,
      moeda: 'BRL',
      metodoPagamento: 'boleto',
      idTransacao: idTransacao,
      mercadoPagoId: response.body.id,
      status: 'pendente',
      dadosMercadoPago: response.body,
      boletoInfo: {
        codigoBarras: response.body.barcode?.content,
        linhaDigitavel: response.body.barcode?.content,
        dataVencimento: new Date(response.body.date_of_expiration),
        urlPdf: response.body.transaction_details?.external_resource_url
      },
      dadosFiscais: {
        cpf: dadosCobranca.cpf,
        nomeCompleto: dadosCobranca.nomeCompleto,
        endereco: dadosCobranca.endereco
      }
    });

    await novoPagamento.save();

    logger.info(`Boleto gerado - Usuário: ${usuario._id}, Valor: R$ ${detalhesPlano.preco}, ID: ${idTransacao}`);

    res.json({
      sucesso: true,
      mensagem: 'Boleto gerado com sucesso',
      dados: {
        idPagamento: response.body.id,
        idTransacao: idTransacao,
        valor: detalhesPlano.preco,
        valorFormatado: novoPagamento.formatarValor(),
        status: response.body.status,
        boleto: {
          codigoBarras: response.body.barcode?.content,
          linhaDigitavel: response.body.barcode?.content,
          dataVencimento: novoPagamento.boletoInfo.dataVencimento,
          urlPdf: response.body.transaction_details?.external_resource_url
        },
        plano: {
          nome: detalhesPlano.nome,
          recursos: detalhesPlano.recursos
        },
        instrucoes: [
          '1. Salve ou imprima o boleto',
          '2. Pague em qualquer banco, lotérica ou internet banking',
          '3. O prazo de vencimento é de 3 dias',
          '4. Após o pagamento, sua assinatura será ativada em até 2 dias úteis'
        ]
      }
    });

  } catch (error) {
    logger.error('Erro ao gerar boleto:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno do servidor ao gerar boleto'
    });
  }
});

// @route   GET /api/pagamentos/status/:idTransacao
// @desc    Verificar status do pagamento
// @access  Privado
router.get('/status/:idTransacao', auth, async (req, res) => {
  try {
    const { idTransacao } = req.params;
    const usuario = req.user;

    const pagamento = await Pagamento.findOne({
      idTransacao: idTransacao,
      usuarioId: usuario._id
    });

    if (!pagamento) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Pagamento não encontrado'
      });
    }

    // Verificar se expirou
    const expirado = pagamento.estaExpirado();
    if (expirado && pagamento.status === 'pendente') {
      pagamento.status = 'expirado';
      await pagamento.save();
    }

    // Verificar status no Mercado Pago se necessário
    if (pagamento.mercadoPagoId && ['pendente', 'in_process'].includes(pagamento.status)) {
      try {
        const response = await mercadopago.payment.findById(pagamento.mercadoPagoId);
        
        if (response.body.status !== pagamento.status) {
          pagamento.status = response.body.status;
          pagamento.dadosMercadoPago = response.body;
          
          if (response.body.status === 'approved') {
            pagamento.dataAprovacao = new Date();
            await ativarAssinatura(usuario._id, pagamento.plano);
          }
          
          await pagamento.save();
        }
      } catch (mpError) {
        logger.error('Erro ao verificar status no Mercado Pago:', mpError);
      }
    }

    res.json({
      sucesso: true,
      dados: {
        idTransacao: pagamento.idTransacao,
        status: pagamento.status,
        statusDescricao: obterDescricaoStatus(pagamento.status),
        valor: pagamento.valor,
        valorFormatado: pagamento.formatarValor(),
        plano: pagamento.plano,
        metodoPagamento: pagamento.metodoPagamento,
        criadoEm: pagamento.criadoEm,
        dataAprovacao: pagamento.dataAprovacao,
        expirado: expirado,
        podeSerEstornado: pagamento.podeSerEstornado()
      }
    });

  } catch (error) {
    logger.error('Erro ao verificar status:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno do servidor ao verificar status do pagamento'
    });
  }
});

// @route   POST /api/pagamentos/webhook
// @desc    Webhook do Mercado Pago
// @access  Público (mas verificado)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const notification = req.body;
    
    logger.info('Webhook recebido do Mercado Pago:', JSON.stringify(notification));

    // Verificar se é uma notificação de pagamento
    if (notification.type === 'payment') {
      const paymentId = notification.data.id;
      
      // Buscar informações do pagamento no Mercado Pago
      const response = await mercadopago.payment.findById(paymentId);
      const paymentData = response.body;

      // Encontrar pagamento no banco
      const pagamento = await Pagamento.findOne({
        $or: [
          { mercadoPagoId: paymentId },
          { idTransacao: paymentData.external_reference }
        ]
      });

      if (pagamento) {
        const statusAnterior = pagamento.status;
        pagamento.status = paymentData.status;
        pagamento.dadosMercadoPago = paymentData;
        
        if (paymentData.status === 'approved' && statusAnterior !== 'approved') {
          pagamento.dataAprovacao = new Date();
          await ativarAssinatura(pagamento.usuarioId, pagamento.plano);
          
          logger.info(`✅ Pagamento aprovado - Usuário: ${pagamento.usuarioId}, Plano: ${pagamento.plano}, Valor: R$ ${pagamento.valor}`);
        }

        await pagamento.save();
      }
    }

    res.status(200).json({ recebido: true });

  } catch (error) {
    logger.error('Erro no webhook:', error);
    res.status(400).json({
      sucesso: false,
      mensagem: 'Erro no webhook'
    });
  }
});

// @route   GET /api/pagamentos/historico
// @desc    Obter histórico de pagamentos do usuário
// @access  Privado
router.get('/historico', auth, async (req, res) => {
  try {
    const usuario = req.user;
    const { limite = 20, pagina = 1 } = req.query;

    const pagamentos = await Pagamento.find({ usuarioId: usuario._id })
      .sort({ criadoEm: -1 })
      .skip((pagina - 1) * limite)
      .limit(parseInt(limite))
      .select('plano valor moeda metodoPagamento status criadoEm dataAprovacao cartaoInfo');

    const total = await Pagamento.countDocuments({ usuarioId: usuario._id });

    const historico = pagamentos.map(pagamento => ({
      id: pagamento._id,
      idTransacao: pagamento.idTransacao,
      plano: PLANOS_ASSINATURA[pagamento.plano]?.nome || pagamento.plano,
      valor: pagamento.valor,
      valorFormatado: pagamento.formatarValor(),
      moeda: pagamento.moeda,
      metodoPagamento: pagamento.metodoPagamento,
      status: pagamento.status,
      statusDescricao: obterDescricaoStatus(pagamento.status),
      data: pagamento.criadoEm,
      dataAprovacao: pagamento.dataAprovacao,
      cartao: pagamento.cartaoInfo ? {
        bandeira: pagamento.cartaoInfo.bandeira,
        ultimos4Digitos: pagamento.cartaoInfo.ultimos4Digitos,
        parcelas: pagamento.cartaoInfo.parcelas
      } : null
    }));

    res.json({
      sucesso: true,
      dados: { 
        historico,
        paginacao: {
          pagina: parseInt(pagina),
          limite: parseInt(limite),
          total,
          paginas: Math.ceil(total / limite)
        }
      }
    });

  } catch (error) {
    logger.error('Erro ao buscar histórico:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno do servidor ao buscar histórico de pagamentos'
    });
  }
});

// Função auxiliar para ativar assinatura
async function ativarAssinatura(usuarioId, plano) {
  try {
    const usuario = await User.findById(usuarioId);
    if (!usuario) return;

    const dataInicio = new Date();
    const dataFim = new Date(dataInicio.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 dias

    usuario.subscription = {
      plan: plano,
      status: 'active',
      startDate: dataInicio,
      endDate: dataFim,
      paymentMethod: 'mercadopago',
      autoRenew: true
    };

    await usuario.save();

    logger.info(`✅ Assinatura ativada - Usuário: ${usuarioId}, Plano: ${plano}, Válida até: ${dataFim.toLocaleDateString('pt-BR')}`);
  } catch (error) {
    logger.error('Erro ao ativar assinatura:', error);
  }
}

// Função auxiliar para obter descrição do status
function obterDescricaoStatus(status) {
  const statusMap = {
    'pending': 'Aguardando pagamento',
    'approved': 'Pagamento aprovado',
    'authorized': 'Pagamento autorizado',
    'in_process': 'Processando pagamento',
    'in_mediation': 'Em mediação',
    'rejected': 'Pagamento rejeitado',
    'cancelled': 'Pagamento cancelado',
    'refunded': 'Pagamento estornado',
    'charged_back': 'Chargeback',
    'expirado': 'Pagamento expirado',
    'pendente': 'Aguardando pagamento'
  };

  return statusMap[status] || status;
}

module.exports = router;
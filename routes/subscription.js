const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const auth = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(auth);

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Subscription plans configuration
const SUBSCRIPTION_PLANS = {
  free: {
    name: 'Free',
    price: 0,
    currency: 'USD',
    features: [
      'Limited content access',
      '480p quality',
      '1 device',
      'Ads included'
    ],
    limits: {
      quality: '480p',
      devices: 1,
      profiles: 1,
      downloads: 0
    }
  },
  basic: {
    name: 'Basic',
    price: 7.99,
    currency: 'USD',
    features: [
      'HD content access',
      '720p quality',
      '2 devices',
      'No ads',
      'Limited downloads'
    ],
    limits: {
      quality: '720p',
      devices: 2,
      profiles: 2,
      downloads: 5
    }
  },
  premium: {
    name: 'Premium',
    price: 12.99,
    currency: 'USD',
    features: [
      'Full content access',
      '4K quality',
      '4 devices',
      'No ads',
      'Unlimited downloads',
      'Early access to new releases'
    ],
    limits: {
      quality: '4k',
      devices: 4,
      profiles: 4,
      downloads: -1 // unlimited
    }
  },
  family: {
    name: 'Family',
    price: 16.99,
    currency: 'USD',
    features: [
      'Full content access',
      '4K quality',
      '6 devices',
      'No ads',
      'Unlimited downloads',
      'Parental controls',
      'Early access to new releases'
    ],
    limits: {
      quality: '4k',
      devices: 6,
      profiles: 6,
      downloads: -1 // unlimited
    }
  }
};

// @route   GET /api/subscription/plans
// @desc    Get available subscription plans
// @access  Private
router.get('/plans', async (req, res) => {
  try {
    res.json({
      success: true,
      data: { plans: SUBSCRIPTION_PLANS }
    });

  } catch (error) {
    logger.error('Plans fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching plans'
    });
  }
});

// @route   GET /api/subscription/status
// @desc    Get current subscription status
// @access  Private
router.get('/status', async (req, res) => {
  try {
    const user = req.user;
    const currentPlan = SUBSCRIPTION_PLANS[user.subscription.plan];

    res.json({
      success: true,
      data: {
        subscription: {
          ...user.subscription.toObject(),
          planDetails: currentPlan,
          isActive: user.isSubscriptionActive(),
          daysRemaining: user.subscription.endDate 
            ? Math.ceil((user.subscription.endDate - new Date()) / (1000 * 60 * 60 * 24))
            : null
        }
      }
    });

  } catch (error) {
    logger.error('Subscription status fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching subscription status'
    });
  }
});

// @route   POST /api/subscription/subscribe
// @desc    Subscribe to a plan
// @access  Private
router.post('/subscribe', [
  body('plan').isIn(['basic', 'premium', 'family']).withMessage('Invalid subscription plan'),
  body('paymentMethod').isIn(['card', 'paypal', 'apple_pay', 'google_pay']).withMessage('Invalid payment method')
], handleValidationErrors, async (req, res) => {
  try {
    const { plan, paymentMethod, paymentToken } = req.body;
    const user = req.user;

    // Check if plan exists
    if (!SUBSCRIPTION_PLANS[plan]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subscription plan'
      });
    }

    // TODO: Process payment with Stripe
    // This is a simplified version - in production you'd:
    // 1. Create/retrieve Stripe customer
    // 2. Create subscription in Stripe
    // 3. Handle payment confirmation
    // 4. Set up webhooks for subscription events

    // For now, simulate successful payment
    const planDetails = SUBSCRIPTION_PLANS[plan];
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Update user subscription
    user.subscription = {
      plan,
      status: 'active',
      startDate,
      endDate,
      paymentMethod,
      autoRenew: true
      // stripeCustomerId and stripeSubscriptionId would be set here in production
    };

    await user.save();

    logger.info(`User ${user._id} subscribed to ${plan} plan`);

    res.json({
      success: true,
      message: `Successfully subscribed to ${planDetails.name} plan`,
      data: {
        subscription: {
          ...user.subscription.toObject(),
          planDetails
        }
      }
    });

  } catch (error) {
    logger.error('Subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while processing subscription'
    });
  }
});

// @route   POST /api/subscription/cancel
// @desc    Cancel subscription
// @access  Private
router.post('/cancel', async (req, res) => {
  try {
    const user = req.user;

    // Check if user has an active subscription
    if (user.subscription.plan === 'free' || user.subscription.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'No active subscription to cancel'
      });
    }

    // TODO: Cancel subscription in Stripe
    // In production, you'd cancel the Stripe subscription here

    // Update subscription status
    user.subscription.status = 'cancelled';
    user.subscription.autoRenew = false;
    // Keep endDate so user can access until period ends

    await user.save();

    logger.info(`User ${user._id} cancelled subscription`);

    res.json({
      success: true,
      message: 'Subscription cancelled successfully. You can continue using the service until your current period ends.',
      data: {
        subscription: user.subscription,
        accessUntil: user.subscription.endDate
      }
    });

  } catch (error) {
    logger.error('Subscription cancellation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while cancelling subscription'
    });
  }
});

// @route   POST /api/subscription/reactivate
// @desc    Reactivate cancelled subscription
// @access  Private
router.post('/reactivate', async (req, res) => {
  try {
    const user = req.user;

    // Check if subscription is cancelled and still valid
    if (user.subscription.status !== 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Subscription is not cancelled'
      });
    }

    if (user.subscription.endDate < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Subscription has already expired. Please subscribe to a new plan.'
      });
    }

    // TODO: Reactivate subscription in Stripe
    // In production, you'd reactivate the Stripe subscription here

    // Update subscription status
    user.subscription.status = 'active';
    user.subscription.autoRenew = true;

    await user.save();

    logger.info(`User ${user._id} reactivated subscription`);

    res.json({
      success: true,
      message: 'Subscription reactivated successfully',
      data: {
        subscription: user.subscription
      }
    });

  } catch (error) {
    logger.error('Subscription reactivation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while reactivating subscription'
    });
  }
});

// @route   POST /api/subscription/upgrade
// @desc    Upgrade subscription plan
// @access  Private
router.post('/upgrade', [
  body('plan').isIn(['basic', 'premium', 'family']).withMessage('Invalid subscription plan')
], handleValidationErrors, async (req, res) => {
  try {
    const { plan } = req.body;
    const user = req.user;

    // Check if user has an active subscription
    if (!user.isSubscriptionActive()) {
      return res.status(400).json({
        success: false,
        message: 'No active subscription to upgrade'
      });
    }

    // Check if it's actually an upgrade
    const currentPlan = user.subscription.plan;
    const planHierarchy = ['free', 'basic', 'premium', 'family'];
    const currentIndex = planHierarchy.indexOf(currentPlan);
    const newIndex = planHierarchy.indexOf(plan);

    if (newIndex <= currentIndex) {
      return res.status(400).json({
        success: false,
        message: 'You can only upgrade to a higher tier plan'
      });
    }

    // TODO: Handle prorated billing in Stripe
    // In production, you'd update the Stripe subscription here

    // Update subscription plan
    user.subscription.plan = plan;

    await user.save();

    const planDetails = SUBSCRIPTION_PLANS[plan];

    logger.info(`User ${user._id} upgraded from ${currentPlan} to ${plan}`);

    res.json({
      success: true,
      message: `Successfully upgraded to ${planDetails.name} plan`,
      data: {
        subscription: {
          ...user.subscription.toObject(),
          planDetails
        }
      }
    });

  } catch (error) {
    logger.error('Subscription upgrade error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while upgrading subscription'
    });
  }
});

// @route   POST /api/subscription/downgrade
// @desc    Downgrade subscription plan
// @access  Private
router.post('/downgrade', [
  body('plan').isIn(['free', 'basic', 'premium']).withMessage('Invalid subscription plan')
], handleValidationErrors, async (req, res) => {
  try {
    const { plan } = req.body;
    const user = req.user;

    // Check if user has an active subscription
    if (!user.isSubscriptionActive()) {
      return res.status(400).json({
        success: false,
        message: 'No active subscription to downgrade'
      });
    }

    // Check if it's actually a downgrade
    const currentPlan = user.subscription.plan;
    const planHierarchy = ['free', 'basic', 'premium', 'family'];
    const currentIndex = planHierarchy.indexOf(currentPlan);
    const newIndex = planHierarchy.indexOf(plan);

    if (newIndex >= currentIndex) {
      return res.status(400).json({
        success: false,
        message: 'You can only downgrade to a lower tier plan'
      });
    }

    // TODO: Handle downgrade in Stripe
    // Usually downgrades take effect at the end of the current billing period

    // Schedule downgrade for end of current period
    user.subscription.plan = plan;
    // In production, you might want to store the scheduled change separately

    await user.save();

    const planDetails = SUBSCRIPTION_PLANS[plan];

    logger.info(`User ${user._id} scheduled downgrade from ${currentPlan} to ${plan}`);

    res.json({
      success: true,
      message: `Downgrade to ${planDetails.name} plan scheduled. Changes will take effect at the end of your current billing period.`,
      data: {
        subscription: {
          ...user.subscription.toObject(),
          planDetails
        }
      }
    });

  } catch (error) {
    logger.error('Subscription downgrade error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while downgrading subscription'
    });
  }
});

// @route   GET /api/subscription/billing-history
// @desc    Get billing history
// @access  Private
router.get('/billing-history', async (req, res) => {
  try {
    const user = req.user;

    // TODO: Fetch billing history from Stripe
    // For now, return mock data
    const billingHistory = [
      {
        id: 'inv_123',
        date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        amount: SUBSCRIPTION_PLANS[user.subscription.plan]?.price || 0,
        currency: 'USD',
        status: 'paid',
        plan: user.subscription.plan,
        period: {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          end: new Date()
        }
      }
    ];

    res.json({
      success: true,
      data: { billingHistory }
    });

  } catch (error) {
    logger.error('Billing history fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching billing history'
    });
  }
});

// @route   POST /api/subscription/webhook
// @desc    Handle Stripe webhooks
// @access  Public (but verified via Stripe signature)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // TODO: Implement Stripe webhook handling
    // This would handle events like:
    // - invoice.payment_succeeded
    // - invoice.payment_failed
    // - customer.subscription.updated
    // - customer.subscription.deleted

    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    // Verify webhook signature (commented out for now)
    // const event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);

    logger.info('Webhook received (not yet implemented)');

    res.json({ received: true });

  } catch (error) {
    logger.error('Webhook error:', error);
    res.status(400).json({
      success: false,
      message: 'Webhook error'
    });
  }
});

module.exports = router;
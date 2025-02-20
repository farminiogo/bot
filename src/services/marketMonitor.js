import dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import { binanceWS } from './binanceNode.js';
import { calculateIndicators, calculateRiskLevels, predictNextPrice } from './technicalAnalysis.js';

// Load environment variables
dotenv.config();

// Validate environment variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('خطأ: يجب تعيين TELEGRAM_BOT_TOKEN و TELEGRAM_CHAT_ID في ملف .env');
  process.exit(1);
}

// Enhanced logging utility
class Logger {
  static info(message) {
    console.log(`ℹ️ [${new Date().toISOString()}]: ${message}`);
  }

  static warn(message) {
    console.warn(`⚠️ [${new Date().toISOString()}]: ${message}`);
  }

  static error(message, error) {
    console.error(`❌ [${new Date().toISOString()}]: ${message}`, error || '');
  }
}

class MarketMonitor {
  constructor() {
    this.bot = null;
    this.marketData = new Map();
    this.historicalData = new Map();
    this.alerts = new Map();
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000;
    this.isInitialized = false;

    this.tokens = [
      {
        symbol: 'BTCUSDT',
        name: 'بيتكوين',
        displaySymbol: 'BTC',
        minQty: 0.00001,
        description: 'أكبر عملة رقمية من حيث القيمة السوقية والسيولة',
        tradingPair: 'BTC/USDT',
        category: 'Layer 1',
        volatility: 'متوسطة',
        tradingVolume: 'مرتفع جداً',
        marketCap: 'الأعلى'
      },
      {
        symbol: 'ETHUSDT',
        name: 'إيثيريوم',
        displaySymbol: 'ETH',
        minQty: 0.001,
        description: 'منصة العقود الذكية الرائدة',
        tradingPair: 'ETH/USDT',
        category: 'Layer 1',
        volatility: 'متوسطة',
        tradingVolume: 'مرتفع جداً',
        marketCap: 'مرتفع'
      },
      {
        symbol: 'BNBUSDT',
        name: 'بينانس كوين',
        displaySymbol: 'BNB',
        minQty: 0.01,
        description: 'عملة منصة بينانس',
        tradingPair: 'BNB/USDT',
        category: 'Exchange Token',
        volatility: 'متوسطة',
        tradingVolume: 'مرتفع',
        marketCap: 'مرتفع'
      }
    ];

    // Bind methods to preserve this context
    this.handlePriceUpdate = this.handlePriceUpdate.bind(this);
    this.handleBotError = this.handleBotError.bind(this);
  }

  async initialize() {
    try {
      if (this.isInitialized) {
        return;
      }

      Logger.info('تهيئة المراقب...');

      // Initialize bot first
      await this.initializeBot();
      
      // Then setup market data
      await this.setupMarketData();
      
      this.isInitialized = true;
      Logger.info('تم تهيئة المراقب بنجاح');
    } catch (error) {
      Logger.error('فشل في تهيئة المراقب:', error);
      throw error;
    }
  }

  async initializeBot() {
    try {
      if (this.bot) {
        await this.bot.stopPolling();
        this.bot = null;
      }

      this.bot = new TelegramBot(TELEGRAM_BOT_TOKEN, {
        polling: true,
        filepath: false
      });

      // Setup error handlers
      this.bot.on('error', this.handleBotError);
      this.bot.on('polling_error', this.handleBotError);

      // Setup command handlers
      await this.setupCommandHandlers();

      // Send test message
      await this.sendMessage(
        TELEGRAM_CHAT_ID,
        '🤖 مرحباً!\n\nالبوت نشط وجاهز للعمل.\nأرسل /help للحصول على قائمة الأوامر المتاحة.'
      );

      Logger.info('تم تهيئة بوت التيلجرام بنجاح');
    } catch (error) {
      Logger.error('فشل في تهيئة البوت:', error);
      throw error;
    }
  }

  async setupMarketData() {
    try {
      // Setup WebSocket subscriptions
      for (const token of this.tokens) {
        binanceWS.subscribe(token.symbol, this.handlePriceUpdate);
      }

      Logger.info('تم إعداد اتصالات البيانات بنجاح');
    } catch (error) {
      Logger.error('فشل في إعداد اتصالات البيانات:', error);
      throw error;
    }
  }

  handlePriceUpdate(data) {
    try {
      this.marketData.set(data.symbol, data);

      // Update historical data
      const prices = this.historicalData.get(data.symbol) || [];
      prices.push(data.price);
      if (prices.length > 100) prices.shift();
      this.historicalData.set(data.symbol, prices);

      // Check alerts
      this.checkAlerts(data);
    } catch (error) {
      Logger.error('خطأ في معالجة تحديث السعر:', error);
    }
  }

  async checkAlerts(data) {
    try {
      const token = this.tokens.find(t => t.symbol === data.symbol);
      if (!token) return;

      const alerts = this.alerts.get(data.symbol) || [];
      const triggeredAlerts = [];

      for (const alert of alerts) {
        if (
          (alert.condition === 'above' && data.price >= alert.price) ||
          (alert.condition === 'below' && data.price <= alert.price)
        ) {
          await this.sendMessage(
            alert.chatId,
            `🔔 *تنبيه سعري*\n${token.name} ${alert.condition === 'above' ? 'تجاوز' : 'انخفض تحت'} $${alert.price}!`,
            { parse_mode: 'Markdown' }
          );
          triggeredAlerts.push(alert);
        }
      }

      // Remove triggered alerts
      if (triggeredAlerts.length > 0) {
        this.alerts.set(
          data.symbol,
          alerts.filter(alert => !triggeredAlerts.includes(alert))
        );
      }
    } catch (error) {
      Logger.error('خطأ في معالجة التنبيهات:', error);
    }
  }

  async setupCommandHandlers() {
    // Start command
    this.bot.onText(/\/start/, async (msg) => {
      try {
        const welcomeMessage = [
          '🤖 *مرحباً بك في بوت التحليل الفني!*\n',
          'يمكنني مساعدتك في تحليل أسواق العملات الرقمية\n',
          '*الأوامر المتاحة:*',
          '📊 /status - عرض حالة السوق',
          '📈 /analysis <رمز العملة> - تحليل فني مفصل',
          '🔔 /alerts - إدارة التنبيهات',
          '💰 /price <رمز العملة> - عرض السعر الحالي',
          '❓ /help - عرض المساعدة\n',
          '*العملات المدعومة:*',
          ...this.tokens.map(t => `• ${t.displaySymbol} - ${t.name}`)
        ].join('\n');

        const keyboard = {
          reply_markup: {
            keyboard: [
              ['📊 حالة السوق', '📈 تحليل'],
              ['🔔 التنبيهات', '❓ المساعدة']
            ],
            resize_keyboard: true
          }
        };

        await this.sendMessage(msg.chat.id, welcomeMessage, { 
          parse_mode: 'Markdown',
          ...keyboard
        });
      } catch (error) {
        Logger.error('خطأ في معالجة أمر البداية:', error);
      }
    });

    // Price command
    this.bot.onText(/\/price(?:\s+([A-Za-z]+))?/, async (msg, match) => {
      try {
        const symbol = (match?.[1] || '').toUpperCase();
        if (!symbol) {
          await this.sendMessage(msg.chat.id, 'الرجاء تحديد رمز العملة (مثال: /price BTC)');
          return;
        }

        const fullSymbol = symbol + 'USDT';
        const token = this.tokens.find(t => t.symbol === fullSymbol);
        
        if (!token) {
          await this.sendMessage(msg.chat.id, 'رمز عملة غير صحيح. الرجاء استخدام BTC أو ETH أو BNB.');
          return;
        }

        const data = this.marketData.get(fullSymbol);
        if (!data) {
          await this.sendMessage(msg.chat.id, 'البيانات غير متوفرة حالياً. الرجاء المحاولة مرة أخرى.');
          return;
        }

        const message = [
          `💰 *${token.name} (${token.displaySymbol})*\n`,
          `السعر الحالي: $${data.price.toFixed(2)}`,
          `التغير 24س: ${data.priceChangePercent >= 0 ? '+' : ''}${data.priceChangePercent.toFixed(2)}%`,
          `أعلى سعر 24س: $${data.high24h.toFixed(2)}`,
          `أدنى سعر 24س: $${data.low24h.toFixed(2)}`,
          `حجم التداول 24س: $${(data.volume * data.price).toLocaleString()}`
        ].join('\n');

        await this.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
      } catch (error) {
        Logger.error('خطأ في معالجة أمر السعر:', error);
        await this.sendMessage(msg.chat.id, 'حدث خطأ في جلب السعر. الرجاء المحاولة مرة أخرى.');
      }
    });

    // Help command
    this.bot.onText(/\/help|❓ المساعدة/, async (msg) => {
      try {
        const helpMessage = [
          '🤖 *دليل استخدام البوت*\n',
          '*الأوامر المتاحة:*',
          '📊 /status - عرض حالة السوق',
          '📈 /analysis <رمز العملة> - تحليل فني مفصل',
          '🔔 /alerts - إدارة التنبيهات',
          '💰 /price <رمز العملة> - عرض السعر الحالي',
          '❓ /help - عرض المساعدة\n',
          '*العملات المدعومة:*',
          ...this.tokens.map(t => `• ${t.displaySymbol} - ${t.name}`),
          '\nمثال: /price BTC أو /analysis ETH'
        ].join('\n');

        await this.sendMessage(msg.chat.id, helpMessage, { parse_mode: 'Markdown' });
      } catch (error) {
        Logger.error('خطأ في معالجة أمر المساعدة:', error);
      }
    });
  }

  async handleBotError(error) {
    Logger.error('خطأ في البوت:', error);

    if (this.isReconnecting) return;
    this.isReconnecting = true;

    try {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        Logger.info(`محاولة إعادة الاتصال... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));
        await this.initialize();
        
        this.reconnectAttempts = 0;
        Logger.info('تم إعادة الاتصال بنجاح');
      } else {
        Logger.error('تم الوصول للحد الأقصى من محاولات إعادة الاتصال');
        process.exit(1);
      }
    } catch (error) {
      Logger.error('خطأ أثناء إعادة الاتصال:', error);
    } finally {
      this.isReconnecting = false;
    }
  }

  async sendMessage(chatId, text, options = {}) {
    if (!this.bot) {
      Logger.error('البوت غير مهيأ');
      return;
    }

    try {
      await this.bot.sendMessage(chatId, text, options);
    } catch (error) {
      Logger.error('خطأ في إرسال الرسالة:', error);
      throw error;
    }
  }

  async stop() {
    try {
      Logger.info('إيقاف المراقب...');
      
      if (this.bot) {
        await this.bot.stopPolling();
        this.bot = null;
      }

      // Cleanup WebSocket connections
      for (const token of this.tokens) {
        binanceWS.unsubscribe(token.symbol, this.handlePriceUpdate);
      }

      this.isInitialized = false;
      Logger.info('تم إيقاف المراقب بنجاح');
    } catch (error) {
      Logger.error('خطأ في إيقاف المراقب:', error);
    }
  }
}

// Create and start monitor
const monitor = new MarketMonitor();

// Handle process termination
process.on('SIGINT', async () => {
  Logger.info('جاري إيقاف البرنامج...');
  await monitor.stop();
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  Logger.error('خطأ غير معالج:', error);
});

// Start the monitor
monitor.initialize().catch(error => {
  Logger.error('فشل في بدء المراقب:', error);
  process.exit(1);
});

Logger.info('بوت التحليل الفني قيد التشغيل...');
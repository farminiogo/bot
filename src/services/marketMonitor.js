import dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import { binanceWS } from './binanceNode.js';
import { calculateIndicators, calculateRiskLevels, predictNextPrice } from './technicalAnalysis.js';

// تحميل متغيرات البيئة
dotenv.config();

// التحقق من الإعدادات
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('❌ خطأ: يجب ضبط TELEGRAM_BOT_TOKEN و TELEGRAM_CHAT_ID في ملف .env');
  process.exit(1);
}

// **🔹 كلاس لتسجيل الأحداث**
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
      { symbol: 'BTCUSDT', name: 'بيتكوين', displaySymbol: 'BTC' },
      { symbol: 'ETHUSDT', name: 'إيثيريوم', displaySymbol: 'ETH' },
      { symbol: 'BNBUSDT', name: 'بينانس كوين', displaySymbol: 'BNB' },
      { symbol: 'ADAUSDT', name: 'كاردانو', displaySymbol: 'ADA' },
      { symbol: 'SOLUSDT', name: 'سولانا', displaySymbol: 'SOL' },
      { symbol: 'XRPUSDT', name: 'ريبل', displaySymbol: 'XRP' },
      { symbol: 'DOGEUSDT', name: 'دوج كوين', displaySymbol: 'DOGE' },
      { symbol: 'MATICUSDT', name: 'بوليجون', displaySymbol: 'MATIC' }
    ];

    // ربط الدوال لتجنب مشاكل `this`
    this.handlePriceUpdate = this.handlePriceUpdate.bind(this);
    this.handleBotError = this.handleBotError.bind(this);
  }

  async initialize() {
    try {
      if (this.isInitialized) return;
      Logger.info('🔄 جاري تهيئة مراقب السوق...');

      await this.initializeBot();
      await this.setupMarketData();
      
      this.isInitialized = true;
      Logger.info('✅ تم تهيئة مراقب السوق بنجاح');
    } catch (error) {
      Logger.error('❌ فشل في تهيئة المراقب:', error);
      throw error;
    }
  }

  async initializeBot() {
    try {
      if (this.bot) {
        await this.bot.stopPolling();
        this.bot = null;
      }

      this.bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true, filepath: false });
      this.bot.on('error', this.handleBotError);
      this.bot.on('polling_error', this.handleBotError);

      await this.setupCommandHandlers();
      await this.sendMessage(TELEGRAM_CHAT_ID, '🤖 البوت جاهز للعمل! أرسل /help لعرض الأوامر.');

      Logger.info('✅ تم تهيئة بوت تيليجرام بنجاح');
    } catch (error) {
      Logger.error('❌ فشل في تهيئة البوت:', error);
      throw error;
    }
  }

  async setupMarketData() {
    try {
      for (const token of this.tokens) {
        binanceWS.subscribe(token.symbol, this.handlePriceUpdate);
      }
      Logger.info('✅ تم إعداد اتصالات البيانات بنجاح');
    } catch (error) {
      Logger.error('❌ فشل في إعداد اتصالات البيانات:', error);
      throw error;
    }
  }

  handlePriceUpdate(data) {
    try {
      this.marketData.set(data.symbol, data);
      const prices = this.historicalData.get(data.symbol) || [];
      prices.push(data.price);
      if (prices.length > 100) prices.shift();
      this.historicalData.set(data.symbol, prices);

      this.checkAlerts(data);
    } catch (error) {
      Logger.error('❌ خطأ في تحديث الأسعار:', error);
    }
  }

  async checkAlerts(data) {
    try {
      const token = this.tokens.find(t => t.symbol === data.symbol);
      if (!token) return;

      const alerts = this.alerts.get(data.symbol) || [];
      const triggeredAlerts = [];

      for (const alert of alerts) {
        if ((alert.condition === 'above' && data.price >= alert.price) ||
            (alert.condition === 'below' && data.price <= alert.price)) {
          await this.sendMessage(alert.chatId, `🔔 *تنبيه*: ${token.name} ${alert.condition === 'above' ? 'تجاوز' : 'انخفض تحت'} $${alert.price}!`);
          triggeredAlerts.push(alert);
        }
      }

      if (triggeredAlerts.length > 0) {
        this.alerts.set(data.symbol, alerts.filter(alert => !triggeredAlerts.includes(alert)));
      }
    } catch (error) {
      Logger.error('❌ خطأ في معالجة التنبيهات:', error);
    }
  }

  async setupCommandHandlers() {
    this.bot.onText(/\/start/, async (msg) => {
      await this.sendMessage(msg.chat.id, '🤖 أهلاً بك! استخدم /help لرؤية الأوامر المتاحة.');
    });

    this.bot.onText(/\/price (.+)/, async (msg, match) => {
      const symbol = match[1].toUpperCase() + 'USDT';
      const token = this.tokens.find(t => t.symbol === symbol);
      
      if (!token) {
        return await this.sendMessage(msg.chat.id, '⚠️ رمز غير صحيح. استخدم BTC، ETH، BNB، وغيرها.');
      }

      const data = this.marketData.get(symbol);
      if (!data) {
        return await this.sendMessage(msg.chat.id, '⚠️ البيانات غير متاحة حالياً، حاول لاحقاً.');
      }

      await this.sendMessage(msg.chat.id, `💰 *${token.name}* \nالسعر: $${data.price.toFixed(2)}`);
    });
  }

  async sendMessage(chatId, text) {
    if (!this.bot) return;
    try {
      await this.bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    } catch (error) {
      Logger.error('❌ خطأ في إرسال الرسالة:', error);
    }
  }
}

// إنشاء وتشغيل المراقب
const monitor = new MarketMonitor();
monitor.initialize().catch(error => Logger.error('❌ فشل في بدء المراقب:', error));

// التعامل مع الإنهاء
process.on('SIGINT', async () => {
  Logger.info('🔄 إيقاف المراقب...');
  process.exit(0);
});

Logger.info('🚀 مراقب السوق قيد التشغيل...');

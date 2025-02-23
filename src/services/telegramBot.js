import dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import { binanceWS } from './binanceNode.js';
import { calculateIndicators, calculateRiskLevels, predictNextPrice } from './technicalAnalysis.js';

// تحميل المتغيرات البيئية
dotenv.config();

// التأكد من إعدادات التيلجرام
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('❌ خطأ: يجب تعيين TELEGRAM_BOT_TOKEN و TELEGRAM_CHAT_ID في ملف .env');
  process.exit(1);
}

// أداة تسجيل الأحداث
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

class TelegramCryptoBot {
  constructor() {
    this.bot = null;
    this.marketData = new Map();
    this.alerts = new Map();
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000;

    // العملات المدعومة
    this.supportedSymbols = {
      BTCUSDT: 'بيتكوين',
      ETHUSDT: 'إيثيريوم',
      BNBUSDT: 'بينانس كوين',
      SOLUSDT: 'سولانا',
      XRPUSDT: 'ريبل'
    };
  }

  async initialize() {
    try {
      Logger.info('🔄 جاري تهيئة بوت التيلجرام...');
      this.bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

      // إعداد الأوامر
      this.setupCommandHandlers();

      // الاشتراك في تحديثات الأسعار
      Object.keys(this.supportedSymbols).forEach(symbol => {
        binanceWS.subscribe(symbol, (data) => this.handlePriceUpdate(data));
      });

      await this.sendMessage(
        TELEGRAM_CHAT_ID,
        '🤖 *بوت التحليل الفني يعمل الآن!*\n\n أرسل /help للحصول على قائمة الأوامر المتاحة.',
        { parse_mode: 'Markdown' }
      );

      Logger.info('✅ تم تشغيل البوت بنجاح.');
    } catch (error) {
      Logger.error('❌ فشل في تهيئة البوت:', error);
      this.handleBotError();
    }
  }

  setupCommandHandlers() {
    // أمر المساعدة
    this.bot.onText(/\/help/, async (msg) => {
      try {
        const helpMessage = `
📌 *الأوامر المتاحة:*
📊 /status - عرض حالة السوق
📈 /analysis <رمز العملة> - تحليل فني
💰 /price <رمز العملة> - عرض السعر الحالي
🔔 /alerts - إدارة التنبيهات
❓ /help - عرض المساعدة

✅ *العملات المدعومة:*  
${Object.entries(this.supportedSymbols).map(([symbol, name]) => `• ${name} (${symbol.replace('USDT', '')})`).join('\n')}
`;
        await this.sendMessage(msg.chat.id, helpMessage, { parse_mode: 'Markdown' });
      } catch (error) {
        Logger.error('❌ خطأ في معالجة أمر /help:', error);
      }
    });

    // أمر السعر
    this.bot.onText(/\/price (.+)/, async (msg, match) => {
      try {
        const symbol = (match[1].toUpperCase() + 'USDT');
        const data = this.marketData.get(symbol);

        if (!data) {
          return await this.sendMessage(msg.chat.id, '⚠️ لا تتوفر بيانات لهذا الرمز.');
        }

        const name = this.supportedSymbols[symbol] || symbol;
        const message = `
💰 *${name} (${symbol.replace('USDT', '')})*
السعر الحالي: $${data.price.toFixed(2)}
التغير 24س: ${data.priceChangePercent.toFixed(2)}%
أعلى سعر: $${data.high24h.toFixed(2)}
أدنى سعر: $${data.low24h.toFixed(2)}
`;

        await this.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
      } catch (error) {
        Logger.error('❌ خطأ في أمر /price:', error);
      }
    });

    // أمر التحليل الفني
    this.bot.onText(/\/analysis (.+)/, async (msg, match) => {
      try {
        const symbol = (match[1].toUpperCase() + 'USDT');
        const data = this.marketData.get(symbol);

        if (!data) {
          return await this.sendMessage(msg.chat.id, '⚠️ لا تتوفر بيانات لهذا الرمز.');
        }

        const indicators = await calculateIndicators([data.price]);
        if (!indicators) {
          return await this.sendMessage(msg.chat.id, '⚠️ تعذر حساب المؤشرات الفنية.');
        }

        const risk = calculateRiskLevels(data.price, indicators, Math.abs(data.priceChangePercent));
        const prediction = await predictNextPrice([data.price]);

        const message = `
📊 *تحليل ${this.supportedSymbols[symbol] || symbol}*
🔹 السعر الحالي: $${data.price.toFixed(2)}
🔹 RSI: ${indicators.rsi.toFixed(2)}
🔹 MACD: ${indicators.macd.MACD.toFixed(2)}
🔹 المخاطرة: ${risk.riskLevel}
🔹 السعر المتوقع: $${prediction?.nextPrice.toFixed(2) || 'غير متوفر'}
🔹 الاتجاه: ${prediction?.trend || 'غير متوفر'}
`;

        await this.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
      } catch (error) {
        Logger.error('❌ خطأ في أمر /analysis:', error);
      }
    });
  }

  handlePriceUpdate(data) {
    this.marketData.set(data.symbol, data);
  }

  async sendMessage(chatId, text, options = {}) {
    try {
      await this.bot.sendMessage(chatId, text, options);
    } catch (error) {
      Logger.error('❌ خطأ في إرسال الرسالة:', error);
    }
  }

  handleBotError() {
    if (this.isReconnecting) return;

    this.isReconnecting = true;
    setTimeout(async () => {
      this.reconnectAttempts++;
      if (this.reconnectAttempts > this.maxReconnectAttempts) {
        Logger.error('❌ تم الوصول إلى الحد الأقصى لمحاولات إعادة الاتصال.');
        process.exit(1);
      }

      Logger.info(`🔄 إعادة تشغيل البوت (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      await this.initialize();
      this.isReconnecting = false;
    }, this.reconnectDelay);
  }
}

// تشغيل البوت
const bot = new TelegramCryptoBot();
bot.initialize().catch(error => {
  Logger.error('❌ فشل تشغيل البوت:', error);
  process.exit(1);
});

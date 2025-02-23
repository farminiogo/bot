import dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import { binanceWS } from './binanceNode.js';
import { calculateIndicators, calculateRiskLevels, predictNextPrice } from './technicalAnalysis.js';

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('Error: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set in .env file');
  process.exit(1);
}

class Logger {
  static info(message) {
    console.log(`ℹ️ INFO [${new Date().toISOString()}]: ${message}`);
  }

  static warn(message) {
    console.warn(`⚠️ WARNING [${new Date().toISOString()}]: ${message}`);
  }

  static error(message, error) {
    console.error(`❌ ERROR [${new Date().toISOString()}]: ${message}`, error || '');
  }
}

class TelegramCryptoBot {
  constructor() {
    this.bot = null;
    this.alerts = new Map();
    this.marketData = new Map();
    this.historicalData = new Map();
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000;
    
    // تحديث قائمة العملات المدعومة مع معلومات إضافية
    this.supportedSymbols = [
      {
        symbol: 'BTCUSDT',
        name: 'بيتكوين',
        displaySymbol: 'BTC',
        description: 'أكبر عملة رقمية في العالم وأول عملة لامركزية',
        minQty: 0.00001,
        category: 'Layer 1',
        marketCap: 'الأعلى',
        tradingVolume: 'مرتفع جداً',
        volatility: 'متوسطة',
        website: 'bitcoin.org'
      },
      {
        symbol: 'ETHUSDT',
        name: 'إيثيريوم',
        displaySymbol: 'ETH',
        description: 'منصة العقود الذكية الرائدة عالمياً',
        minQty: 0.001,
        category: 'Layer 1',
        marketCap: 'مرتفع',
        tradingVolume: 'مرتفع جداً',
        volatility: 'متوسطة',
        website: 'ethereum.org'
      },
      {
        symbol: 'BNBUSDT',
        name: 'بينانس كوين',
        displaySymbol: 'BNB',
        description: 'العملة الرئيسية لمنصة بينانس',
        minQty: 0.01,
        category: 'Exchange Token',
        marketCap: 'مرتفع',
        tradingVolume: 'مرتفع',
        volatility: 'متوسطة',
        website: 'binance.com'
      },
      {
        symbol: 'SOLUSDT',
        name: 'سولانا',
        displaySymbol: 'SOL',
        description: 'منصة عقود ذكية عالية الأداء',
        minQty: 0.1,
        category: 'Layer 1',
        marketCap: 'مرتفع',
        tradingVolume: 'مرتفع',
        volatility: 'عالية',
        website: 'solana.com'
      },
      {
        symbol: 'XRPUSDT',
        name: 'ريبل',
        displaySymbol: 'XRP',
        description: 'حلول المدفوعات العالمية',
        minQty: 1,
        category: 'Payment',
        marketCap: 'مرتفع',
        tradingVolume: 'مرتفع',
        volatility: 'متوسطة',
        website: 'ripple.com'
      }
    ];

    // تخزين البيانات الأساسية للعملات
    this.tokenInfo = new Map(this.supportedSymbols.map(token => [
      token.symbol,
      {
        ...token,
        lastUpdate: Date.now(),
        price: 0,
        change24h: 0,
        volume24h: 0,
        high24h: 0,
        low24h: 0
      }
    ]));
  }

  async initialize() {
    try {
      Logger.info('تهيئة بوت التيلجرام...');
      
      this.bot = new TelegramBot(TELEGRAM_BOT_TOKEN, {
        polling: true,
        filepath: false
      });

      this.setupErrorHandlers();
      this.setupCommandHandlers();
      this.setupPriceSubscriptions();

      await this.sendMessage(TELEGRAM_CHAT_ID, 
        '🤖 *مرحباً بك في بوت التحليل الفني!*\n\n' +
        'البوت جاهز للعمل. أرسل /help للحصول على قائمة الأوامر المتاحة.',
        { parse_mode: 'Markdown' }
      );
      
      Logger.info('تم تشغيل البوت بنجاح');
    } catch (error) {
      Logger.error('فشل في تهيئة البوت:', error);
      this.handleBotError();
    }
  }

  setupErrorHandlers() {
    this.bot.on('error', (error) => {
      Logger.error('خطأ في بوت التيلجرام:', error);
      this.handleBotError();
    });

    this.bot.on('polling_error', (error) => {
      Logger.error('خطأ في الاتصال:', error);
      this.handleBotError();
    });
  }

  setupCommandHandlers() {
    // أمر البداية
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
          ...this.supportedSymbols.map(t => `• ${t.displaySymbol} - ${t.name}`)
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

    // أمر التحليل
    this.bot.onText(/\/analysis(?:\s+([A-Za-z]+))?/, async (msg, match) => {
      try {
        const symbol = (match?.[1] || '').toUpperCase();
        if (!symbol) {
          await this.sendMessage(msg.chat.id, 'الرجاء تحديد رمز العملة (مثال: /analysis BTC)');
          return;
        }

        const fullSymbol = symbol + 'USDT';
        await this.sendAnalysis(msg.chat.id, fullSymbol);
      } catch (error) {
        Logger.error('خطأ في معالجة أمر التحليل:', error);
        await this.sendMessage(msg.chat.id, 'حدث خطأ أثناء التحليل');
      }
    });

    // أمر السعر
    this.bot.onText(/\/price(?:\s+([A-Za-z]+))?/, async (msg, match) => {
      try {
        const symbol = (match?.[1] || '').toUpperCase();
        if (!symbol) {
          await this.sendMessage(msg.chat.id, 'الرجاء تحديد رمز العملة (مثال: /price BTC)');
          return;
        }

        const fullSymbol = symbol + 'USDT';
        const tokenData = this.tokenInfo.get(fullSymbol);
        const marketData = this.marketData.get(fullSymbol);

        if (!tokenData) {
          await this.sendMessage(msg.chat.id, `عملة غير مدعومة: ${symbol}`);
          return;
        }

        const priceMessage = [
          `💰 *${tokenData.name} (${tokenData.displaySymbol})*\n`,
          `السعر الحالي: $${marketData?.price?.toFixed(2) || 'غير متوفر'}`,
          `التغير 24س: ${marketData?.priceChangePercent >= 0 ? '+' : ''}${marketData?.priceChangePercent?.toFixed(2) || '0'}%`,
          `أعلى سعر 24س: $${marketData?.high24h?.toFixed(2) || 'غير متوفر'}`,
          `أدنى سعر 24س: $${marketData?.low24h?.toFixed(2) || 'غير متوفر'}`,
          `حجم التداول 24س: $${(marketData?.volume * marketData?.price || 0).toLocaleString()}\n`,
          `*معلومات إضافية:*`,
          `• الفئة: ${tokenData.category}`,
          `• السيولة: ${tokenData.tradingVolume}`,
          `• التذبذب: ${tokenData.volatility}`,
          `• الحد الأدنى للتداول: ${tokenData.minQty} ${tokenData.displaySymbol}`,
          `\n${tokenData.description}`
        ].join('\n');

        await this.sendMessage(msg.chat.id, priceMessage, { parse_mode: 'Markdown' });
      } catch (error) {
        Logger.error('خطأ في معالجة أمر السعر:', error);
        await this.sendMessage(msg.chat.id, 'حدث خطأ في جلب السعر');
      }
    });

    // أمر حالة السوق
    this.bot.onText(/\/status|📊 حالة السوق/, async (msg) => {
      try {
        const marketStatus = [
          '*📊 حالة السوق*\n',
          ...Array.from(this.marketData.entries()).map(([symbol, data]) => {
            const token = this.tokenInfo.get(symbol);
            if (!token) return '';
            return [
              `*${token.name} (${token.displaySymbol})*`,
              `💰 السعر: $${data.price?.toFixed(2) || '0.00'}`,
              `📈 التغير: ${data.priceChangePercent >= 0 ? '▲' : '▼'} ${data.priceChangePercent?.toFixed(2) || '0'}%`,
              `📊 الحجم: $${(data.volume * data.price).toLocaleString()}\n`
            ].join('\n');
          }).filter(Boolean).join('\n')
        ].join('\n');

        await this.sendMessage(msg.chat.id, marketStatus, { parse_mode: 'Markdown' });
      } catch (error) {
        Logger.error('خطأ في معالجة أمر حالة السوق:', error);
        await this.sendMessage(msg.chat.id, 'حدث خطأ في جلب حالة السوق');
      }
    });

    // أمر المساعدة
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
          ...this.supportedSymbols.map(t => `• ${t.displaySymbol} - ${t.name}`),
          '\n*طريقة الاستخدام:*',
          '1. استخدم /price BTC لمعرفة سعر البيتكوين',
          '2. استخدم /analysis ETH للحصول على تحليل فني للإيثيريوم',
          '3. استخدم /status لمعرفة حالة السوق بشكل عام',
          '\n*ملاحظات:*',
          '• يتم تحديث الأسعار كل دقيقة',
          '• التحليل الفني يعتمد على بيانات آخر 24 ساعة',
          '• يمكنك استخدام الأزرار أسفل الشاشة للوصول السريع للأوامر'
        ].join('\n');

        await this.sendMessage(msg.chat.id, helpMessage, { parse_mode: 'Markdown' });
      } catch (error) {
        Logger.error('خطأ في معالجة أمر المساعدة:', error);
      }
    });
  }

  async sendAnalysis(chatId, symbol) {
    try {
      const tokenData = this.tokenInfo.get(symbol);
      const marketData = this.marketData.get(symbol);
      
      if (!tokenData || !marketData) {
        await this.sendMessage(chatId, `لا تتوفر بيانات لـ ${symbol}`);
        return;
      }

      const prices = this.historicalData.get(symbol) || [];
      if (prices.length < 50) {
        await this.sendMessage(chatId, 'البيانات التاريخية غير كافية للتحليل');
        return;
      }

      const indicators = await calculateIndicators(prices);
      const riskAnalysis = calculateRiskLevels(marketData.price, indicators, Math.abs(marketData.priceChangePercent));
      const prediction = await predictNextPrice(prices);

      // تحليل الاتجاه والتوصية
      let recommendation = '';
      let trend = '';
      
      if (prediction.trend === 'up' && indicators.rsi < 70) {
        recommendation = '🟢 توصية: شراء';
        trend = 'صاعد 📈';
      } else if (prediction.trend === 'down' && indicators.rsi > 30) {
        recommendation = '🔴 توصية: بيع';
        trend = 'هابط 📉';
      } else {
        recommendation = '🟡 توصية: انتظار';
        trend = 'متذبذب ↔️';
      }

      const analysis = [
        `📊 *تحليل ${tokenData.name}*\n`,
        `السعر الحالي: $${marketData.price.toFixed(2)}`,
        `التغير 24س: ${marketData.priceChangePercent >= 0 ? '+' : ''}${marketData.priceChangePercent.toFixed(2)}%\n`,
        `*المؤشرات الفنية:*`,
        `• مؤشر القوة النسبية RSI: ${indicators.rsi.toFixed(2)}`,
        `• مؤشر MACD: ${indicators.macd.MACD.toFixed(2)}`,
        `• خط الإشارة: ${indicators.macd.signal.toFixed(2)}\n`,
        `*تحليل المخاطر:*`,
        `• مستوى المخاطرة: ${this.getRiskLevelArabic(riskAnalysis.riskLevel)}`,
        `• وقف الخسارة المقترح: $${riskAnalysis.stopLoss.toFixed(2)}`,
        `• هدف الربح المقترح: $${riskAnalysis.takeProfit.toFixed(2)}\n`,
        `*التوقعات:*`,
        `• السعر المتوقع: $${prediction.nextPrice.toFixed(2)}`,
        `• الاتجاه: ${trend}`,
        `• نسبة الثقة: ${(prediction.confidence * 100).toFixed(1)}%\n`,
        `${recommendation}\n`,
        `*معلومات إضافية:*`,
        `• الفئة: ${tokenData.category}`,
        `• السيولة: ${tokenData.tradingVolume}`,
        `• التذبذب: ${tokenData.volatility}`,
        `• الموقع: ${tokenData.website}`
      ].join('\n');

      await this.sendMessage(chatId, analysis, { parse_mode: 'Markdown' });
    } catch (error) {
      Logger.error('خطأ في إنشاء التحليل:', error);
      await this.sendMessage(chatId, 'حدث خطأ أثناء إنشاء التحليل');
    }
  }

  getRiskLevelArabic(level) {
    const riskLevels = {
      'very_low': 'منخفض جداً 🟢',
      'low': 'منخفض 🟢',
      'medium': 'متوسط 🟡',
      'high': 'مرتفع 🔴',
      'very_high': 'مرتفع جداً 🔴'
    };
    return riskLevels[level] || level;
  }

  setupPriceSubscriptions() {
    this.supportedSymbols.forEach(token => {
      binanceWS.subscribe(token.symbol, (data) => {
        this.handlePriceUpdate(data);
      });
    });
  }

  handlePriceUpdate(data) {
    try {
      this.marketData.set(data.symbol, data);

      // تحديث البيانات التاريخية
      const prices = this.historicalData.get(data.symbol) || [];
      prices.push(data.price);
      if (prices.length > 100) prices.shift();
      this.historicalData.set(data.symbol, prices);

      // تحديث معلومات العملة
      const tokenInfo = this.tokenInfo.get(data.symbol);
      if (tokenInfo) {
        tokenInfo.price = data.price;
        tokenInfo.change24h = data.priceChangePercent;
        tokenInfo.volume24h = data.volume;
        tokenInfo.high24h = data.high24h;
        tokenInfo.low24h = data.low24h;
        tokenInfo.lastUpdate = Date.now();
      }

      // التحقق من التنبيهات
      const symbolAlerts = this.alerts.get(data.symbol) || [];
      symbolAlerts.forEach(async (alert) => {
        if (
          (alert.condition === 'above' && data.price >= alert.price) ||
          (alert.condition === 'below' && data.price <= alert.price)
        ) {
          const token = this.tokenInfo.get(data.symbol);
          await this.sendMessage(
            alert.chatId,
            `🔔 *تنبيه سعري*\n${token.name} ${alert.condition === 'above' ? 'تجاوز' : 'أقل من'} $${alert.price}!`,
            { parse_mode: 'Markdown' }
          );
          this.alerts.set(
            data.symbol,
            symbolAlerts.filter(a => a !== alert)
          );
        }
      });
    } catch (error) {
      Logger.error('خطأ في معالجة تحديث السعر:', error);
    }
  }

  async handleBotError() {
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
    try {
      if (!this.bot) {
        Logger.error('البوت غير مهيأ');
        return;
      }
      await this.bot.sendMessage(chatId, text, options);
    } catch (error) {
      Logger.error('خطأ في إرسال الرسالة:', error);
    }
  }
}

// إنشاء وتشغيل البوت
const bot = new TelegramCryptoBot();
bot.initialize().catch(error => {
  Logger.error('فشل في تشغيل البوت:', error);
  process.exit(1);
});

// معالجة إنهاء العملية
process.on('SIGINT', () => {
  Logger.info('جاري إيقاف البوت...');
  if (bot.bot) {
    bot.bot.stopPolling();
  }
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  Logger.error('خطأ غير معالج:', error);
});
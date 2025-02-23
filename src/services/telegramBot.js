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
    this.bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true, filepath: false });
    this.marketData = new Map();
    this.historicalData = new Map();
    this.alerts = new Map();
    this.supportedSymbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'];
    this.setupCommandHandlers();
    this.setupPriceSubscriptions();
  }

  setupCommandHandlers() {
    this.bot.onText(/\/start/, async (msg) => {
      const welcomeMessage = '🤖 *مرحبًا بك في بوت التحليل الفني!*\n\n' +
        'يمكنك استخدام الأوامر التالية:\n' +
        '📈 /price <رمز العملة> - عرض السعر الحالي\n' +
        '📊 /analysis <رمز العملة> - تحليل فني\n' +
        '🔔 /alerts - إدارة التنبيهات\n' +
        '❓ /help - عرض التعليمات';
      await this.sendMessage(msg.chat.id, welcomeMessage, { parse_mode: 'Markdown' });
    });

    this.bot.onText(/\/price (\w+)/, async (msg, match) => {
      const symbol = match[1].toUpperCase() + 'USDT';
      const data = this.marketData.get(symbol);

      if (!data) {
        await this.sendMessage(msg.chat.id, `❌ لا تتوفر بيانات لـ ${symbol}`);
        return;
      }

      const priceMessage = `💰 *${symbol}*\nالسعر: $${data.price.toFixed(2)}\nالتغير 24س: ${data.priceChangePercent}%`;
      await this.sendMessage(msg.chat.id, priceMessage, { parse_mode: 'Markdown' });
    });

    this.bot.onText(/\/analysis (\w+)/, async (msg, match) => {
      const symbol = match[1].toUpperCase() + 'USDT';
      const prices = this.historicalData.get(symbol) || [];

      if (prices.length < 50) {
        await this.sendMessage(msg.chat.id, '❌ البيانات غير كافية للتحليل');
        return;
      }

      const indicators = await calculateIndicators(prices);
      const riskAnalysis = calculateRiskLevels(prices[prices.length - 1], indicators, 5);
      const prediction = await predictNextPrice(prices);

      const analysisMessage = `📊 *تحليل ${symbol}*\n` +
        `RSI: ${indicators.rsi.toFixed(2)}\n` +
        `MACD: ${indicators.macd.MACD.toFixed(2)}\n` +
        `التوقع المستقبلي: $${prediction.nextPrice.toFixed(2)}`;
      await this.sendMessage(msg.chat.id, analysisMessage, { parse_mode: 'Markdown' });
    });
  }

  setupPriceSubscriptions() {
    this.supportedSymbols.forEach(symbol => {
      binanceWS.subscribe(symbol, (data) => {
        this.marketData.set(symbol, data);
      });
    });
  }

  async sendMessage(chatId, text, options = {}) {
    try {
      await this.bot.sendMessage(chatId, text, options);
    } catch (error) {
      Logger.error('خطأ في إرسال الرسالة:', error);
    }
  }
}

const bot = new TelegramCryptoBot();

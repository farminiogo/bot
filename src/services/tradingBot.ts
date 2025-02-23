import { binanceWS } from './binanceNode.js';
import { calculateIndicators, calculateRiskLevels, predictNextPrice } from './technicalAnalysis.js';

// أوامر التداول النشطة
interface ActiveOrder {
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  quantity: number;
}

class TradingBot {
  private activeOrders: Map<string, ActiveOrder> = new Map();
  private tradeHistory: any[] = [];
  private balance = 10000; // الرصيد الافتراضي بالدولار
  private riskPerTrade = 0.02; // نسبة المخاطرة 2%
  private maxTrades = 3; // عدد الصفقات المفتوحة كحد أقصى

  constructor(private tradingPairs: string[]) {
    console.log('🚀 بوت التداول قيد التشغيل...');
    this.initialize();
  }

  private async initialize() {
    try {
      for (const pair of this.tradingPairs) {
        binanceWS.subscribe(pair, this.handlePriceUpdate.bind(this));
      }
      console.log('✅ تم الاشتراك في أزواج التداول:', this.tradingPairs);
    } catch (error) {
      console.error('❌ خطأ في تهيئة البوت:', error);
    }
  }

  private async handlePriceUpdate(data: any) {
    try {
      const { symbol, price } = data;

      // تجاهل البيانات إذا لم تتغير الأسعار بشكل كبير
      if (!price || price <= 0) return;

      console.log(`📈 تحديث السعر ${symbol}: $${price.toFixed(2)}`);

      // جلب بيانات الأسعار التاريخية
      const historicalPrices = await this.getHistoricalPrices(symbol);
      historicalPrices.push(price);

      if (historicalPrices.length < 50) return;

      // حساب المؤشرات الفنية
      const indicators = await calculateIndicators(historicalPrices);
      if (!indicators) return;

      // تحليل المخاطر
      const riskAnalysis = calculateRiskLevels(price, indicators, indicators.volatility);

      // اتخاذ قرار التداول
      this.analyzeMarket(symbol, price, indicators, riskAnalysis);
    } catch (error) {
      console.error('❌ خطأ في تحديث الأسعار:', error);
    }
  }

  private analyzeMarket(symbol: string, price: number, indicators: any, riskAnalysis: any) {
    if (this.activeOrders.has(symbol)) {
      this.monitorTrade(symbol, price, riskAnalysis);
    } else {
      this.openTrade(symbol, price, indicators, riskAnalysis);
    }
  }

  private async openTrade(symbol: string, price: number, indicators: any, riskAnalysis: any) {
    if (this.activeOrders.size >= this.maxTrades) return;

    let action: 'BUY' | 'SELL' | null = null;

    if (indicators.rsi < 30 && price < indicators.bollinger.lower) {
      action = 'BUY';
    } else if (indicators.rsi > 70 && price > indicators.bollinger.upper) {
      action = 'SELL';
    }

    if (!action) return;

    const capitalPerTrade = this.balance * this.riskPerTrade;
    const quantity = capitalPerTrade / price;
    const stopLoss = riskAnalysis.stopLoss;
    const takeProfit = riskAnalysis.takeProfit;

    const order: ActiveOrder = { symbol, side: action, entryPrice: price, stopLoss, takeProfit, quantity };
    this.activeOrders.set(symbol, order);

    console.log(`🟢 فتح صفقة ${action} على ${symbol} بسعر ${price.toFixed(2)}`);
  }

  private monitorTrade(symbol: string, price: number, riskAnalysis: any) {
    const order = this.activeOrders.get(symbol);
    if (!order) return;

    if (order.side === 'BUY' && price >= order.takeProfit) {
      this.closeTrade(symbol, '✅ جني الأرباح');
    } else if (order.side === 'BUY' && price <= order.stopLoss) {
      this.closeTrade(symbol, '❌ ضرب وقف الخسارة');
    } else if (order.side === 'SELL' && price <= order.takeProfit) {
      this.closeTrade(symbol, '✅ جني الأرباح');
    } else if (order.side === 'SELL' && price >= order.stopLoss) {
      this.closeTrade(symbol, '❌ ضرب وقف الخسارة');
    }
  }

  private closeTrade(symbol: string, reason: string) {
    const order = this.activeOrders.get(symbol);
    if (!order) return;

    const profitLoss = order.side === 'BUY'
      ? (order.takeProfit - order.entryPrice) * order.quantity
      : (order.entryPrice - order.takeProfit) * order.quantity;

    this.balance += profitLoss;
    this.tradeHistory.push({ ...order, profitLoss, reason });
    this.activeOrders.delete(symbol);

    console.log(`🛑 ${reason} - ${symbol} الربح/الخسارة: ${profitLoss.toFixed(2)}$`);
  }

  private async getHistoricalPrices(symbol: string): Promise<number[]> {
    // استرداد بيانات الأسعار السابقة (يمكن استبداله بقاعدة بيانات أو API خارجي)
    return [];
  }
}

// تشغيل البوت
const tradingPairs = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
const bot = new TradingBot(tradingPairs);

// إيقاف البوت عند الخروج
process.on('SIGINT', () => {
  console.log('🛑 إيقاف البوت...');
  process.exit(0);
});

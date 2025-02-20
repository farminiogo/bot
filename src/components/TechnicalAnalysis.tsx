import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, AlertTriangle, Brain } from 'lucide-react';
import type { TechnicalIndicators, RiskAnalysis, PricePrediction } from '../services/technicalAnalysis';

interface TechnicalAnalysisProps {
  symbol: string;
  currentPrice: number;
  indicators: TechnicalIndicators;
  riskAnalysis: RiskAnalysis;
  prediction: PricePrediction;
  historicalPrices: number[];
}

export default function TechnicalAnalysis({
  symbol,
  currentPrice,
  indicators,
  riskAnalysis,
  prediction,
  historicalPrices
}: TechnicalAnalysisProps) {
  const chartData = historicalPrices.map((price, index) => ({
    time: index,
    price,
    ema: indicators.ema,
    upper: indicators.bollinger.upper,
    lower: indicators.bollinger.lower
  }));

  const getRiskColor = (level: RiskAnalysis['riskLevel']) => {
    switch (level) {
      case 'low':
        return 'text-green-500 dark:text-green-400';
      case 'medium':
        return 'text-yellow-500 dark:text-yellow-400';
      case 'high':
        return 'text-red-500 dark:text-red-400';
      default:
        return 'text-gray-500 dark:text-gray-400';
    }
  };

  const getTrendIcon = (trend: PricePrediction['trend']) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-5 h-5 text-green-500" />;
      case 'down':
        return <TrendingDown className="w-5 h-5 text-red-500" />;
      default:
        return <TrendingUp className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Technical Indicators</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">RSI (14)</span>
              <span className={`font-medium ${
                indicators.rsi > 70 ? 'text-red-500' :
                indicators.rsi < 30 ? 'text-green-500' :
                'text-gray-900 dark:text-white'
              }`}>
                {indicators.rsi.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">MACD</span>
              <span className={`font-medium ${
                indicators.macd.histogram > 0 ? 'text-green-500' : 'text-red-500'
              }`}>
                {indicators.macd.MACD.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">EMA (50)</span>
              <span className="font-medium text-gray-900 dark:text-white">
                ${indicators.ema.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Risk Analysis</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Risk Level</span>
              <span className={`font-medium ${getRiskColor(riskAnalysis.riskLevel)}`}>
                {riskAnalysis.riskLevel.toUpperCase()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Stop Loss</span>
              <span className="font-medium text-red-500">
                ${riskAnalysis.stopLoss.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Take Profit</span>
              <span className="font-medium text-green-500">
                ${riskAnalysis.takeProfit.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">AI Prediction</h3>
            <Brain className="w-5 h-5 text-primary-500" />
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Next Price</span>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900 dark:text-white">
                  ${prediction.nextPrice.toFixed(2)}
                </span>
                {getTrendIcon(prediction.trend)}
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Confidence</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {(prediction.confidence * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Current Price</span>
              <span className="font-medium text-gray-900 dark:text-white">
                ${currentPrice.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Price Analysis</h3>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis domain={['auto', 'auto']} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="price"
                stroke="#8b5cf6"
                dot={false}
                name="Price"
              />
              <Line
                type="monotone"
                dataKey="ema"
                stroke="#2563eb"
                strokeDasharray="5 5"
                dot={false}
                name="EMA"
              />
              <Line
                type="monotone"
                dataKey="upper"
                stroke="#22c55e"
                strokeDasharray="3 3"
                dot={false}
                name="Upper Band"
              />
              <Line
                type="monotone"
                dataKey="lower"
                stroke="#ef4444"
                strokeDasharray="3 3"
                dot={false}
                name="Lower Band"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {riskAnalysis.riskLevel === 'high' && (
        <div className="bg-red-50 dark:bg-red-900/50 p-4 rounded-lg">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-200">
            <AlertTriangle className="w-5 h-5" />
            <p>High risk detected! Consider reducing position size or waiting for better conditions.</p>
          </div>
        </div>
      )}
    </div>
  );
}
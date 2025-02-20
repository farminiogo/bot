import React, { useState } from 'react';
import { Shield, AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { analyzeToken } from '../services/scamDetector';

function ScamDetector() {
  const [address, setAddress] = useState('');
  const [searchTrigger, setSearchTrigger] = useState(false);

  const { data: analysis, isLoading, error } = useQuery({
    queryKey: ['tokenAnalysis', address],
    queryFn: () => analyzeToken(address),
    enabled: searchTrigger && !!address,
    retry: 1,
  });

  const handleAnalyze = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchTrigger(true);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'safe':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'danger':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'safe':
        return 'bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-100';
      case 'warning':
        return 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-100';
      case 'danger':
        return 'bg-red-50 text-red-700 dark:bg-red-900 dark:text-red-100';
      default:
        return 'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-100';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-500';
    if (score >= 40) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Scam Detector</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Analyze tokens for potential risks and scams</p>
      </header>

      <form onSubmit={handleAnalyze} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
        <div className="flex gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Enter token contract address (0x...)"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !address}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Shield className="w-4 h-4" />
            {isLoading ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
      </form>

      {error ? (
        <div className="bg-red-50 dark:bg-red-900 p-4 rounded-lg">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 dark:text-red-400" />
            <p className="text-red-700 dark:text-red-200">Failed to analyze token. Please check the address and try again.</p>
          </div>
        </div>
      ) : null}

      {analysis && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Risk Analysis</h3>
            <div className="space-y-4">
              {analysis.checks.map(check => (
                <div key={check.id} className="flex items-start gap-4">
                  {getStatusIcon(check.status)}
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white">{check.name}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{check.description}</p>
                    {check.details && (
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{check.details}</p>
                    )}
                  </div>
                  <span className={`ml-auto px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(check.status)}`}>
                    {check.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Security Score</h3>
            <div className="flex items-center justify-center h-48">
              <div className="text-center">
                <div className={`text-6xl font-bold ${getScoreColor(analysis.score.score)}`}>
                  {analysis.score.score}
                </div>
                <p className="text-gray-600 dark:text-gray-400 mt-2">out of {analysis.score.maxScore}</p>
                <div className={`mt-4 px-3 py-1 rounded-full text-sm font-medium inline-block ${
                  analysis.score.riskLevel === 'low'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                    : analysis.score.riskLevel === 'medium'
                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100'
                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
                }`}>
                  {analysis.score.riskLevel.toUpperCase()} RISK
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ScamDetector;
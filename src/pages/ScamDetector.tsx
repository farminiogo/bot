import React, { useState, useEffect } from 'react';
import { Shield, AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { analyzeToken } from '../services/scamDetector';

function ScamDetector() {
  const [address, setAddress] = useState('');
  const [triggerQuery, setTriggerQuery] = useState(false);

  const { data: analysis, isLoading, error, refetch } = useQuery(
    ['tokenAnalysis', address],
    () => analyzeToken(address),
    {
      enabled: false, // نتحكم في وقت تشغيل الطلب
      retry: 1,
    }
  );

  useEffect(() => {
    if (triggerQuery && address) {
      refetch();
      setTriggerQuery(false);
    }
  }, [triggerQuery, address, refetch]);

  const handleAnalyze = (e) => {
    e.preventDefault();
    if (address) setTriggerQuery(true);
  };

  const statusIcons = {
    safe: <CheckCircle className="w-5 h-5 text-green-500" />,
    warning: <AlertTriangle className="w-5 h-5 text-yellow-500" />,
    danger: <XCircle className="w-5 h-5 text-red-500" />,
    default: <Info className="w-5 h-5 text-blue-500" />,
  };

  const getStatusColor = (status) => {
    const colors = {
      safe: 'bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-100',
      warning: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-100',
      danger: 'bg-red-50 text-red-700 dark:bg-red-900 dark:text-red-100',
      default: 'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-100',
    };
    return colors[status] || colors.default;
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Scam Detector</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">تحليل العملات الرقمية للكشف عن المخاطر</p>
      </header>

      <form onSubmit={handleAnalyze} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
        <div className="flex gap-4">
          <input
            type="text"
            placeholder="أدخل عنوان العقد الذكي"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={isLoading || !address}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Shield className="w-4 h-4" />
            {isLoading ? 'تحليل...' : 'تحليل'}
          </button>
        </div>
      </form>

      {error && (
        <div className="bg-red-50 dark:bg-red-900 p-4 rounded-lg">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 dark:text-red-400" />
            <p className="text-red-700 dark:text-red-200">فشل التحليل. تحقق من العنوان وأعد المحاولة.</p>
          </div>
        </div>
      )}

      {analysis && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">تحليل المخاطر</h3>
            <div className="space-y-4">
              {analysis.checks.map((check) => (
                <div key={check.id} className="flex items-start gap-4">
                  {statusIcons[check.status] || statusIcons.default}
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
        </div>
      )}
    </div>
  );
}

export default ScamDetector;
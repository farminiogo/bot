import React, { useState } from 'react';
import { Bell, Plus, Trash2, DollarSign, TrendingUp, MessageSquare, Save } from 'lucide-react';
import { toast } from 'sonner';

type AlertCondition = 'above' | 'below' | 'increase' | 'decrease' | 'sentiment';

type Alert = {
  id: number;
  type: 'price' | 'volume' | 'social';
  condition: AlertCondition;
  value: number;
  token: string;
  active: boolean;
};

function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([
    { id: 1, type: 'price', condition: 'above', value: 1000, token: 'ETH', active: true },
    { id: 2, type: 'volume', condition: 'increase', value: 50, token: 'BTC', active: true },
    { id: 3, type: 'social', condition: 'sentiment', value: 75, token: 'SOL', active: false },
  ]);
  const [showNewAlert, setShowNewAlert] = useState(false);
  const [newAlert, setNewAlert] = useState<Omit<Alert, 'id'>>({
    type: 'price',
    condition: 'above',
    value: 0,
    token: '',
    active: true,
  });

  const deleteAlert = (id: number) => {
    setAlerts(alerts.filter(alert => alert.id !== id));
    toast.success('Alert deleted successfully');
  };

  const toggleAlert = (id: number) => {
    setAlerts(alerts.map(alert => 
      alert.id === id ? { ...alert, active: !alert.active } : alert
    ));
    const alert = alerts.find(a => a.id === id);
    if (alert) {
      toast.success(`Alert ${alert.active ? 'disabled' : 'enabled'}`);
    }
  };

  const handleNewAlert = () => {
    if (!newAlert.token || newAlert.value <= 0) {
      toast.error('Please fill in all fields');
      return;
    }

    const id = Math.max(0, ...alerts.map(a => a.id)) + 1;
    setAlerts([...alerts, { ...newAlert, id }]);
    setShowNewAlert(false);
    setNewAlert({
      type: 'price',
      condition: 'above',
      value: 0,
      token: '',
      active: true,
    });
    toast.success('New alert created successfully');
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'price':
        return <DollarSign className="w-5 h-5 text-blue-500" />;
      case 'volume':
        return <TrendingUp className="w-5 h-5 text-green-500" />;
      case 'social':
        return <MessageSquare className="w-5 h-5 text-purple-500" />;
      default:
        return <Bell className="w-5 h-5 text-primary-500" />;
    }
  };

  const getConditionText = (type: string, condition: AlertCondition, value: number) => {
    switch (type) {
      case 'price':
        return `When price goes ${condition} $${value}`;
      case 'volume':
        return `When volume ${condition}s by ${value}%`;
      case 'social':
        return `When social sentiment exceeds ${value}%`;
      default:
        return '';
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Smart Alerts</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Get notified about important market movements</p>
        </div>
        <button 
          onClick={() => setShowNewAlert(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Alert
        </button>
      </header>

      {showNewAlert && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Create New Alert</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Token Symbol
              </label>
              <input
                type="text"
                value={newAlert.token}
                onChange={(e) => setNewAlert({ ...newAlert, token: e.target.value.toUpperCase() })}
                placeholder="e.g. BTC, ETH"
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Alert Type
              </label>
              <select
                value={newAlert.type}
                onChange={(e) => setNewAlert({ ...newAlert, type: e.target.value as Alert['type'] })}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="price">Price Alert</option>
                <option value="volume">Volume Alert</option>
                <option value="social">Social Sentiment</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Condition
              </label>
              <select
                value={newAlert.condition}
                onChange={(e) => setNewAlert({ ...newAlert, condition: e.target.value as AlertCondition })}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {newAlert.type === 'price' && (
                  <>
                    <option value="above">Above</option>
                    <option value="below">Below</option>
                  </>
                )}
                {newAlert.type === 'volume' && (
                  <>
                    <option value="increase">Increases</option>
                    <option value="decrease">Decreases</option>
                  </>
                )}
                {newAlert.type === 'social' && (
                  <option value="sentiment">Sentiment Score</option>
                )}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Value
              </label>
              <input
                type="number"
                value={newAlert.value}
                onChange={(e) => setNewAlert({ ...newAlert, value: parseFloat(e.target.value) })}
                placeholder={newAlert.type === 'price' ? 'Price in USD' : 'Percentage'}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setShowNewAlert(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleNewAlert}
                className="btn btn-primary flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Create Alert
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm divide-y divide-gray-200 dark:divide-gray-700">
        {alerts.map(alert => (
          <div key={alert.id} className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {getAlertIcon(alert.type)}
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  {alert.token} - {alert.type.charAt(0).toUpperCase() + alert.type.slice(1)} Alert
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {getConditionText(alert.type, alert.condition, alert.value)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => toggleAlert(alert.id)}
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  alert.active
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100'
                }`}
              >
                {alert.active ? 'Active' : 'Inactive'}
              </button>
              <button
                onClick={() => deleteAlert(alert.id)}
                className="text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {alerts.length === 0 && (
        <div className="text-center py-12">
          <Bell className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No alerts set</h3>
          <p className="text-gray-600 dark:text-gray-400">Create your first alert to get notified about market movements</p>
        </div>
      )}
    </div>
  );
}

export default Alerts;
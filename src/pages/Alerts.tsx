import React, { useState, useEffect } from 'react';
import { Bell, Plus, Trash2, DollarSign, TrendingUp, MessageSquare, Save, ToggleLeft, ToggleRight } from 'lucide-react';
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

const Alerts = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [showNewAlert, setShowNewAlert] = useState(false);
  const [newAlert, setNewAlert] = useState<Omit<Alert, 'id'>>({
    type: 'price',
    condition: 'above',
    value: 0,
    token: '',
    active: true,
  });

  // تحميل التنبيهات من localStorage عند التشغيل
  useEffect(() => {
    const storedAlerts = localStorage.getItem('alerts');
    if (storedAlerts) {
      setAlerts(JSON.parse(storedAlerts));
    }
  }, []);

  // حفظ التنبيهات في localStorage عند التحديث
  useEffect(() => {
    localStorage.setItem('alerts', JSON.stringify(alerts));
  }, [alerts]);

  const deleteAlert = (id: number) => {
    setAlerts((prevAlerts) => prevAlerts.filter(alert => alert.id !== id));
    toast.success('تم حذف التنبيه بنجاح');
  };

  const toggleAlert = (id: number) => {
    setAlerts((prevAlerts) =>
      prevAlerts.map(alert => alert.id === id ? { ...alert, active: !alert.active } : alert)
    );
    const updatedAlert = alerts.find(alert => alert.id === id);
    if (updatedAlert) {
      toast.success(`تم ${updatedAlert.active ? 'إلغاء' : 'تفعيل'} التنبيه`);
    }
  };

  const handleNewAlert = () => {
    if (!newAlert.token.trim() || newAlert.value <= 0) {
      toast.error('يرجى إدخال جميع البيانات المطلوبة بشكل صحيح');
      return;
    }

    const id = Math.max(0, ...alerts.map(a => a.id)) + 1;
    setAlerts([...alerts, { ...newAlert, id }]);
    setShowNewAlert(false);
    setNewAlert({ type: 'price', condition: 'above', value: 0, token: '', active: true });
    toast.success('تم إنشاء التنبيه بنجاح');
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'price': return <DollarSign className="w-5 h-5 text-blue-500" />;
      case 'volume': return <TrendingUp className="w-5 h-5 text-green-500" />;
      case 'social': return <MessageSquare className="w-5 h-5 text-purple-500" />;
      default: return <Bell className="w-5 h-5 text-primary-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">التنبيهات الذكية</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">ابقَ على اطلاع بحركات السوق الهامة</p>
        </div>
        <button 
          onClick={() => setShowNewAlert(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          إضافة تنبيه
        </button>
      </header>

      {showNewAlert && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">إنشاء تنبيه جديد</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                رمز العملة
              </label>
              <input
                type="text"
                value={newAlert.token}
                onChange={(e) => setNewAlert({ ...newAlert, token: e.target.value.toUpperCase() })}
                placeholder="مثل BTC, ETH"
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                نوع التنبيه
              </label>
              <select
                value={newAlert.type}
                onChange={(e) => setNewAlert({ ...newAlert, type: e.target.value as Alert['type'] })}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="price">تنبيه سعري</option>
                <option value="volume">تنبيه حجمي</option>
                <option value="social">تنبيه اجتماعي</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                القيمة
              </label>
              <input
                type="number"
                value={newAlert.value}
                onChange={(e) => setNewAlert({ ...newAlert, value: Math.max(0, parseFloat(e.target.value)) })}
                placeholder="مثال: 1000"
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-4">
              <button onClick={() => setShowNewAlert(false)} className="btn-secondary">إلغاء</button>
              <button onClick={handleNewAlert} className="btn btn-primary flex items-center gap-2">
                <Save className="w-4 h-4" />
                حفظ التنبيه
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
                  {alert.token} - {alert.type.toUpperCase()} Alert
                </h3>
                <p className="text-gray-600 dark:text-gray-400">عند السعر: {alert.value}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => toggleAlert(alert.id)} className="btn-toggle">
                {alert.active ? <ToggleRight className="text-green-500 w-6 h-6" /> : <ToggleLeft className="text-gray-400 w-6 h-6" />}
              </button>
              <button onClick={() => deleteAlert(alert.id)} className="btn-delete"><Trash2 className="w-5 h-5" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Alerts;

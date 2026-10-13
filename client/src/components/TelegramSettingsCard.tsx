import React, { useState, useEffect } from 'react';
import { useToast } from './Toast.js';
import {
  getStoredTelegramSettings,
  saveStoredTelegramSettings,
  sendTestTelegramNotification,
  TelegramSettings,
  TELEGRAM_SETTINGS_UPDATED_EVENT,
} from '../utils/telegramNotifications.js';

export const TelegramSettingsCard: React.FC = () => {
  const toast = useToast();
  const [settings, setSettings] = useState<TelegramSettings>(getStoredTelegramSettings);
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const handleUpdate = (e: any) => {
      if (e?.detail) {
        setSettings(e.detail);
      } else {
        setSettings(getStoredTelegramSettings());
      }
    };

    window.addEventListener(TELEGRAM_SETTINGS_UPDATED_EVENT, handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener(TELEGRAM_SETTINGS_UPDATED_EVENT, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setSaving(true);
      const saved = saveStoredTelegramSettings(settings);
      setSettings(saved);
      toast.success('تم حفظ إعدادات إشعارات التليجرام بنجاح');
    } catch {
      toast.error('حدث خطأ أثناء حفظ إعدادات التليجرام');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    try {
      setTesting(true);
      const result = await sendTestTelegramNotification(settings);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (err: any) {
      toast.error(err.message || 'تعذر إرسال الإشعار التجريبي');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      className="border rounded-3xl p-6 space-y-5 backdrop-blur-md"
      style={{
        backgroundColor: 'var(--card-bg)',
        borderColor: 'var(--border-color)',
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-white">6. إشعارات التليجرام التلقائية (Telegram Bot Notifications)</h3>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                settings.is_enabled
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-700/50 text-slate-400 border-slate-700'
              }`}
            >
              {settings.is_enabled ? 'الإشعارات مفعلة' : 'الإشعارات معطلة'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            إرسال تنبيهات فورية للإدارة عند حضور/انصراف الموظفين، نواقص المواد الخام، وتقارير إقفال الوردية
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !settings.bot_token || !settings.chat_id}
            className="px-3.5 py-2 border rounded-xl text-xs font-semibold transition-all shadow-sm hover:bg-white/5 disabled:opacity-50"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderColor: 'var(--border-color)',
              color: 'var(--color-primary)',
            }}
          >
            {testing ? 'جارٍ الإرسال...' : 'إرسال إشعار تجريبي'}
          </button>

          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving}
            className="px-4 py-2 text-white rounded-xl text-xs font-bold shadow-lg transition-all hover:brightness-110 disabled:opacity-50"
            style={{
              backgroundColor: 'var(--color-primary)',
            }}
          >
            {saving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Toggle is_enabled */}
        <div
          className="flex flex-col justify-between p-4 border rounded-2xl gap-3"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            borderColor: 'var(--border-color)',
          }}
        >
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-200">
                تفعيل الإشعارات السحابية
              </label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.is_enabled}
                  onChange={(e) => setSettings({ ...settings, is_enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              عند التفعيل، سيقوم النظام ببث الإشعارات التشغيلية فور وقوعها مباشرة إلى البوت المحدد.
            </p>
          </div>
        </div>

        {/* Bot Token */}
        <div
          className="p-4 border rounded-2xl space-y-2"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            borderColor: 'var(--border-color)',
          }}
        >
          <label className="text-xs font-bold text-slate-200 block">
            رمز البوت (Telegram Bot Token) *
          </label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              placeholder="مثال: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
              value={settings.bot_token}
              onChange={(e) => setSettings({ ...settings, bot_token: e.target.value })}
              className="w-full border rounded-xl pr-3 pl-16 py-2 text-xs text-slate-100 placeholder-slate-600 font-mono focus:outline-none"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                borderColor: 'var(--border-color)',
              }}
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute left-2.5 top-2 text-[10px] font-bold text-slate-400 hover:text-slate-200"
            >
              {showToken ? 'إخفاء' : 'إظهار'}
            </button>
          </div>
          <p className="text-[10px] text-slate-500">
            يمكنك استخراج الرمز من بوت @BotFather على تطبيق التليجرام.
          </p>
        </div>

        {/* Chat ID */}
        <div
          className="p-4 border rounded-2xl space-y-2"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            borderColor: 'var(--border-color)',
          }}
        >
          <label className="text-xs font-bold text-slate-200 block">
            معرف المحادثة أو القناة (Chat ID) *
          </label>
          <input
            type="text"
            placeholder="مثال: 123456789 أو -1001234567890 للقنوات"
            value={settings.chat_id}
            onChange={(e) => setSettings({ ...settings, chat_id: e.target.value })}
            className="w-full border rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 font-mono focus:outline-none"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              borderColor: 'var(--border-color)',
            }}
          />
          <p className="text-[10px] text-slate-500">
            معرف حسابك الشخصي أو معرف مجموعة/قناة الإدارة (تأكد من إضافة البوت كمسؤول في القناة).
          </p>
        </div>
      </div>

      {/* Overview of Automated Triggers */}
      <div
        className="border rounded-2xl p-4 text-xs text-slate-400 space-y-2"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          borderColor: 'var(--border-color)',
        }}
      >
        <div className="font-bold text-slate-300">الأحداث التشغيلية المشمولة في البث التلقائي:</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
          <div className="p-2.5 rounded-xl border border-slate-800 bg-black/40">
            <span className="font-bold text-slate-200 block mb-0.5">1. حضور الموظفين</span>
            <span className="text-[11px] text-slate-400">إشعار فوري عند تسجيل الدخول وبدء العمل مع التوقيت.</span>
          </div>
          <div className="p-2.5 rounded-xl border border-slate-800 bg-black/40">
            <span className="font-bold text-slate-200 block mb-0.5">2. انصراف الموظفين</span>
            <span className="text-[11px] text-slate-400">إشعار عند تسجيل الخروج مع احتساب ساعات العمل الدقيقة.</span>
          </div>
          <div className="p-2.5 rounded-xl border border-slate-800 bg-black/40">
            <span className="font-bold text-slate-200 block mb-0.5">3. نواقص المواد الخام</span>
            <span className="text-[11px] text-slate-400">تنبيه ذكي عند نزول رصيد مادة خام عن حد إعادة الطلب.</span>
          </div>
          <div className="p-2.5 rounded-xl border border-slate-800 bg-black/40">
            <span className="font-bold text-slate-200 block mb-0.5">4. تقرير إقفال الوردية</span>
            <span className="text-[11px] text-slate-400">ملخص Z-Report شامل للمبيعات، النقدية، والفوارق.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TelegramSettingsCard;

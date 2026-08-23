import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  Save,
  CheckCircle2,
  AlertCircle,
  Clock,
  XCircle,
  Eye,
  EyeOff,
  Wand2,
  Copy,
  HelpCircle,
  Play,
  Layers,
  Wifi,
} from 'lucide-react';
import { taxApi } from '../../api/client.js';
import { TaxSettings, Service, TaxStats, EtaQueueItem } from '../../types/index.js';
import { FALLBACK_TAX_SETTINGS, FALLBACK_TAX_STATS, FALLBACK_SERVICES } from '../../api/mockFallbacks.js';
import { useToast } from '../../components/Toast.js';
import { formatEGP, formatDateTime } from '../../utils/formatters.js';

export const EtaSettingsTab: React.FC = () => {
  const toast = useToast();

  // Loading States
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingCodes, setSavingCodes] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [processingQueue, setProcessingQueue] = useState(false);
  const [singleSavingId, setSingleSavingId] = useState<string | null>(null);

  // Settings State
  const [settings, setSettings] = useState<TaxSettings>(FALLBACK_TAX_SETTINGS);

  // Services State for Tax Mapping
  const [services, setServices] = useState<Service[]>(FALLBACK_SERVICES);
  const [localEgsCodes, setLocalEgsCodes] = useState<Record<string, string>>({});

  // Stats & Queue State
  const [stats, setStats] = useState<TaxStats>(FALLBACK_TAX_STATS);
  const [queueItems, setQueueItems] = useState<EtaQueueItem[]>([]);

  // UI Helper States
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [showSignerToken, setShowSignerToken] = useState(false);

  // Fetch initial data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [settingsData, servicesData, statsData, queueData] = await Promise.all([
        taxApi.getSettings(true).catch(() => FALLBACK_TAX_SETTINGS),
        taxApi.getServicesTaxCodes().catch(() => FALLBACK_SERVICES),
        taxApi.getTaxStats().catch(() => FALLBACK_TAX_STATS),
        taxApi.getQueue(10).catch(() => []),
      ]);

      const validServices = Array.isArray(servicesData) && servicesData.length > 0 ? servicesData : FALLBACK_SERVICES;
      setSettings(settingsData || FALLBACK_TAX_SETTINGS);
      setServices(validServices);
      setStats(statsData || FALLBACK_TAX_STATS);
      setQueueItems(Array.isArray(queueData) ? queueData : []);

      // Initialize local EGS mapping
      const codeMap: Record<string, string> = {};
      validServices.forEach((s) => {
        if (s && s.id) {
          codeMap[s.id] = s.egs_code || '';
        }
      });
      setLocalEgsCodes(codeMap);
    } catch (err: any) {
      toast.error(err.message, 'تعذر تحميل إعدادات مصلحة الضرائب');
      setSettings(FALLBACK_TAX_SETTINGS);
      setServices(FALLBACK_SERVICES);
      setStats(FALLBACK_TAX_STATS);
      setQueueItems([]);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    fetchData();
  }, []);

  // Save Settings
  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setSaving(true);
      const updated = await taxApi.updateSettings(settings);
      setSettings(updated);
      toast.success('تم حفظ وتحديث إعدادات منظومة الضرائب المصرية بنجاح');
    } catch (err: any) {
      toast.error(err.message, 'فشل حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  };

  // Test ETA Connection
  const handleTestConnection = async () => {
    try {
      setTestingConnection(true);
      const res = await taxApi.testConnection();
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.warning(res.message);
      }
    } catch (err: any) {
      toast.error(err.message, 'فشل الاتصال بخادم مصلحة الضرائب');
    } finally {
      setTestingConnection(false);
    }
  };

  // Process Sync Queue
  const handleProcessQueue = async () => {
    try {
      setProcessingQueue(true);
      const res = await taxApi.processQueue(20);
      toast.success(res.message || 'تمت معالجة طابور الفواتير بنجاح');
      fetchData();
    } catch (err: any) {
      toast.error(err.message, 'فشل معالجة طابور المزامنة');
    } finally {
      setProcessingQueue(false);
    }
  };

  // Update single service EGS code
  const handleSaveSingleCode = async (serviceId: string) => {
    try {
      setSingleSavingId(serviceId);
      const egs_code = localEgsCodes[serviceId] || '';
      const updated = await taxApi.updateServiceTaxCode(serviceId, egs_code);
      setServices((prev) => prev.map((s) => (s.id === serviceId ? { ...s, egs_code: updated.egs_code } : s)));
      toast.success(`تم حفظ كود الضرائب لخدمة: ${updated.name}`);
    } catch (err: any) {
      toast.error(err.message, 'تعذر تحديث الكود الضريبي للخدمة');
    } finally {
      setSingleSavingId(null);
    }
  };

  // Batch Save all EGS codes
  const handleBatchSaveCodes = async () => {
    try {
      setSavingCodes(true);
      const items = Object.entries(localEgsCodes).map(([id, egs_code]) => ({
        id,
        egs_code,
      }));
      await taxApi.batchUpdateServiceTaxCodes(items);
      toast.success('تم تحديث كافة أكواد EGS لجميع خدمات الغسيل بنجاح');
      fetchData();
    } catch (err: any) {
      toast.error(err.message, 'فشل الحفظ الجماعي لأكواد الخدمات');
    } finally {
      setSavingCodes(false);
    }
  };

  // Generate Suggested EGS code
  const handleGenerateSuggestedCode = (serviceId: string, index: number) => {
    const taxReg = settings.tax_registration_number || '123456789';
    const cleanTax = taxReg.replace(/\D/g, '').padEnd(9, '0').slice(0, 9);
    const codeNumber = (index + 1).toString().padStart(3, '0');
    const generated = `EG-${cleanTax}-WASH${codeNumber}`;
    setLocalEgsCodes((prev) => ({
      ...prev,
      [serviceId]: generated,
    }));
  };

  // Generate for all services without code
  const handleGenerateAllMissingCodes = () => {
    const taxReg = settings.tax_registration_number || '123456789';
    const cleanTax = taxReg.replace(/\D/g, '').padEnd(9, '0').slice(0, 9);
    const newCodes = { ...localEgsCodes };

    services.forEach((s, idx) => {
      if (!newCodes[s.id] || newCodes[s.id].trim() === '') {
        const codeNumber = (idx + 1).toString().padStart(3, '0');
        newCodes[s.id] = `EG-${cleanTax}-WASH${codeNumber}`;
      }
    });

    setLocalEgsCodes(newCodes);
    toast.info('تم توليد أكواد EGS قياسية لجميع الخدمات، اضغط "حفظ جميع الأكواد" لتأكيدها');
  };

  // Copy text helper
  const copyToClipboard = (text?: string | null, label: string = 'النص') => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(`تم نسخ ${label} إلى الحافظة`);
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Top Header & Overview Bar */}
      <div
        className="flex flex-col md:flex-row md:items-center justify-between gap-4 border p-5 rounded-3xl backdrop-blur-md shadow-xl"
        style={{
          backgroundColor: 'var(--card-bg)',
          borderColor: 'var(--border-color)',
        }}
      >
        <div className="flex items-center gap-3.5">
          <div
            className="w-12 h-12 rounded-2xl border flex items-center justify-center shadow-inner"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderColor: 'var(--border-color)',
              color: 'var(--color-primary)',
            }}
          >
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-black text-white">منظومة الإيصال الإلكتروني (ETA e-Receipt)</h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                  settings.is_enabled
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                }`}
              >
                {settings.is_enabled ? 'نظام الضريبة مفعّل' : 'نظام الضريبة معطّل'}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                  settings.eta_sync_enabled
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                    : 'bg-slate-700/50 text-slate-400 border-slate-700'
                }`}
              >
                {settings.eta_sync_enabled ? 'إرسال ETA مفعّل' : 'إرسال ETA اختياري / معطّل'}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                  settings.environment === 'production'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                }`}
              >
                {settings.environment === 'production' ? 'الإنتاج الفعلي (Live)' : 'بيئة الاختبار (Pre-prod)'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              الامتثال للائحة مصلحة الضرائب المصرية B2C، إدارة بيانات الاعتماد، والختم السحابي وتكويد الخدمات
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testingConnection}
            className="flex items-center gap-1.5 px-3.5 py-2 border rounded-xl text-xs font-semibold transition-all shadow-sm hover:bg-white/5"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderColor: 'var(--border-color)',
              color: 'var(--color-primary)',
            }}
          >
            <Wifi className={`w-3.5 h-3.5 ${testingConnection ? 'animate-pulse' : ''}`} />
            <span>{testingConnection ? 'جارٍ الفحص...' : 'فحص الاتصال'}</span>
          </button>

          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 border text-slate-200 rounded-xl text-xs font-semibold transition-all hover:bg-white/5"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderColor: 'var(--border-color)',
            }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--color-primary)' }} />
            <span>تحديث</span>
          </button>

          <button
            type="button"
            onClick={() => handleSaveSettings()}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-white rounded-xl text-xs font-bold shadow-lg transition-all hover:brightness-110"
            style={{
              backgroundColor: 'var(--color-primary)',
            }}
          >
            <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
            <span>{saving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}</span>
          </button>
        </div>
      </div>

      {/* Legal & Tax Compliance Disclaimer Banner */}
      <div className="p-5 rounded-3xl bg-amber-500/10 border border-amber-500/30 backdrop-blur-md shadow-xl flex items-start gap-4">
        <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5 border border-amber-500/30 shadow-inner">
          <AlertCircle className="w-5 h-5" />
        </div>
        <div className="space-y-1.5 text-right flex-1">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-bold text-amber-200">
              تنبيه قانوني وإخلاء مسؤولية ضريبية (Legal & Tax Compliance Disclaimer)
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
              مسؤولية المنشأة المشغلة
            </span>
          </div>
          <p className="text-xs text-amber-300/90 leading-relaxed font-medium">
            إن دقة وصحة البيانات المالية المحاسبية، وتطبيق نسبة ضريبة القيمة المضافة (14%)، وتقديم الإقرارات الضريبية الشهرية في مواعيدها القانونية، وصحة الأرقام وبيانات التسجيل الضريبي، والالتزام بالقوانين واللوائح الصادرة عن مصلحة الضرائب المصرية تقع <span className="font-bold underline text-amber-100">بالكامل وحصراً على عاتق المنشأة / المغسلة المشغلة والمالك القانوني</span>.
          </p>
          <p className="text-[11px] text-amber-400/80 leading-relaxed">
            هذا النظام البرمجي هو أداة تقنية مساعدة لإدارة نقاط البيع والأرشفة وتسهيل الربط الإلكتروني، ولا يُعتبر بأي حال مستشاراً ضريبياً أو قانونياً، ولا يتحمل مطورو النظام أي مسؤولية قانونية أو مدنية أو جنائية أو غرامات تنتج عن أي أخطاء في التسجيل أو التأخر في تقديم الإقرارات أو التهرب الضريبي أو البيانات غير الصحيحة المدخلة من قِبل المستخدم.
          </p>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div
          className="border p-4 rounded-2xl backdrop-blur-md"
          style={{
            backgroundColor: 'var(--card-bg)',
            borderColor: 'var(--border-color)',
          }}
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">إجمالي الفواتير</span>
            <Layers className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-xl font-black text-white font-mono">
            {stats?.orders.total_orders ?? 0}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">كافة عمليات الغسيل المسجلة</div>
        </div>

        <div className="border border-emerald-500/20 p-4 rounded-2xl bg-emerald-950/20 backdrop-blur-md">
          <div className="flex items-center justify-between text-emerald-400 mb-1">
            <span className="text-xs font-medium">معتمدة بالضرائب</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-black text-emerald-400 font-mono">
            {stats?.orders.synced_valid_count ?? 0}
          </div>
          <div className="text-[10px] text-emerald-500/80 mt-1">إيصالات موثقة بـ UUID و QR</div>
        </div>

        <div className="border border-amber-500/20 p-4 rounded-2xl bg-amber-950/20 backdrop-blur-md">
          <div className="flex items-center justify-between text-amber-300 mb-1">
            <span className="text-xs font-medium">قيد المزامنة</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-black text-amber-300 font-mono">
            {(stats?.orders.pending_count ?? 0) + (stats?.queue.queue_pending ?? 0)}
          </div>
          <div className="text-[10px] text-amber-500/80 mt-1">في طابور الإرسال التلقائي</div>
        </div>

        <div className="border border-rose-500/20 p-4 rounded-2xl bg-rose-950/20 backdrop-blur-md">
          <div className="flex items-center justify-between text-rose-400 mb-1">
            <span className="text-xs font-medium">غير مرسلة / معطلة</span>
            <XCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-xl font-black text-rose-400 font-mono">
            {(stats?.orders.failed_count ?? 0) + (stats?.orders.not_synced_count ?? 0)}
          </div>
          <div className="text-[10px] text-rose-500/80 mt-1">إرسال يدوي أو معطلة في الإعدادات</div>
        </div>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Section 1: Activation & Environment */}
        <div
          className="border rounded-3xl p-6 space-y-5 backdrop-blur-md"
          style={{
            backgroundColor: 'var(--card-bg)',
            borderColor: 'var(--border-color)',
          }}
        >
          <div className="pb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
            <h3 className="text-sm font-bold text-white">1. التفعيل وبيئة التشغيل والمزامنة (Status & Environment)</h3>
            <p className="text-xs text-slate-400 mt-0.5">تحديد حالة حساب الضريبة والربط الاختياري مع مصلحة الضرائب المصرية</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Toggle 1: is_enabled (Tax Compliance & VAT 14%) */}
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
                    تفعيل نظام الضريبة (VAT 14%)
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
                  تطبيق نسبة 14% في نقاط البيع (POS) وحساب المبالغ الضريبية وتقارير الإقرارات.
                </p>
              </div>
            </div>

            {/* Toggle 2: eta_sync_enabled (Optional Live ETA Sync) */}
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
                    مزامنة ETA السحابية (اختياري)
                  </label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.eta_sync_enabled ?? false}
                      onChange={(e) => setSettings({ ...settings, eta_sync_enabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
                  </label>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  عند التعطيل، تستمر الفواتير بالعمل محلياً دون إرسال طلبات HTTP لمصلحة الضرائب.
                </p>
              </div>
            </div>

            {/* Environment Selector */}
            <div
              className="p-4 border rounded-2xl space-y-2"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                borderColor: 'var(--border-color)',
              }}
            >
              <label className="text-xs font-bold text-slate-200 block">
                بيئة العمل والربط (Environment)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, environment: 'preprod' })}
                  className={`p-2.5 rounded-xl text-xs font-bold border transition-all ${
                    settings.environment === 'preprod'
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500 shadow-md'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                  style={{
                    backgroundColor: settings.environment === 'preprod' ? undefined : 'rgba(255, 255, 255, 0.05)',
                  }}
                >
                  🧪 تجريبي
                </button>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, environment: 'production' })}
                  className={`p-2.5 rounded-xl text-xs font-bold border transition-all ${
                    settings.environment === 'production'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-md'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                  style={{
                    backgroundColor: settings.environment === 'production' ? undefined : 'rgba(255, 255, 255, 0.05)',
                  }}
                >
                  🚀 إنتاج فعلي
                </button>
              </div>
              <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-1">
                <span>الخادم:</span>
                <span className="font-mono text-slate-400 text-[9px] truncate">
                  {settings.environment === 'production' ? 'api.invoicing.eta.gov.eg' : 'api.preprod.invoicing.eta.gov.eg'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: ETA Credentials */}
        <div
          className="border rounded-3xl p-6 space-y-5 backdrop-blur-md"
          style={{
            backgroundColor: 'var(--card-bg)',
            borderColor: 'var(--border-color)',
          }}
        >
          <div className="pb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
            <h3 className="text-sm font-bold text-white">2. بيانات التسجيل والاعتماد الضريبي (Credentials)</h3>
            <p className="text-xs text-slate-400 mt-0.5">الرقم الضريبي للمنشأة ومفاتيح تطبيق نقطة البيع المسجلة في الضرائب</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Tax Registration Number */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>الرقم الضريبي للمنشأة (9 أرقام) *</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(settings.tax_registration_number, 'الرقم الضريبي')}
                  className="text-[10px] text-slate-500 hover:text-slate-300"
                >
                  <Copy className="w-3 h-3 inline ml-1" /> نسخ
                </button>
              </label>
              <input
                type="text"
                placeholder="مثال: 123456789"
                value={settings.tax_registration_number || ''}
                onChange={(e) => setSettings({ ...settings, tax_registration_number: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 font-mono focus:outline-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderColor: 'var(--border-color)',
                }}
              />
            </div>

            {/* Branch Code */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                كود الفرع الضريبي (Branch Code) *
              </label>
              <input
                type="text"
                placeholder="0 للفرع الرئيسي أو كود الفرع"
                value={settings.branch_code || '0'}
                onChange={(e) => setSettings({ ...settings, branch_code: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 font-mono focus:outline-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderColor: 'var(--border-color)',
                }}
              />
            </div>

            {/* POS Serial */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                الرقم التسلسلي لنقطة البيع (POS Serial Number) *
              </label>
              <input
                type="text"
                placeholder="مثال: POS-CWASH-01"
                value={settings.pos_serial || ''}
                onChange={(e) => setSettings({ ...settings, pos_serial: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 font-mono focus:outline-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderColor: 'var(--border-color)',
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* Client ID */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>معرف تطبيق العميل (Client ID) *</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(settings.client_id, 'Client ID')}
                  className="text-[10px] text-slate-500 hover:text-slate-300"
                >
                  <Copy className="w-3 h-3 inline ml-1" /> نسخ
                </button>
              </label>
              <input
                type="text"
                placeholder="UUID الصادر من بورتال مصلحة الضرائب"
                value={settings.client_id || ''}
                onChange={(e) => setSettings({ ...settings, client_id: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 font-mono focus:outline-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderColor: 'var(--border-color)',
                }}
              />
            </div>

            {/* Client Secret */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>الرمز السري (Client Secret) *</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(settings.client_secret, 'Client Secret')}
                  className="text-[10px] text-slate-500 hover:text-slate-300"
                >
                  <Copy className="w-3 h-3 inline ml-1" /> نسخ
                </button>
              </label>
              <div className="relative">
                <input
                  type={showClientSecret ? 'text' : 'password'}
                  placeholder="كلمة السر الخاصة بالتطبيق"
                  value={settings.client_secret || ''}
                  onChange={(e) => setSettings({ ...settings, client_secret: e.target.value })}
                  className="w-full border rounded-xl pr-3 pl-9 py-2 text-xs text-slate-100 placeholder-slate-600 font-mono focus:outline-none"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    borderColor: 'var(--border-color)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowClientSecret(!showClientSecret)}
                  className="absolute left-2.5 top-2 text-slate-500 hover:text-slate-300"
                >
                  {showClientSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Cloud E-Seal & Remote Signer */}
        <div
          className="border rounded-3xl p-6 space-y-5 backdrop-blur-md"
          style={{
            backgroundColor: 'var(--card-bg)',
            borderColor: 'var(--border-color)',
          }}
        >
          <div className="pb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
            <h3 className="text-sm font-bold text-white">3. الختم الإلكتروني السحابي والتوقيع (Cloud E-Seal & Remote Signer)</h3>
            <p className="text-xs text-slate-400 mt-0.5">ربط خدمة توقيع الفواتير بختم الشركة الإلكتروني (HSM / Signer API)</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Signer URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                رابط خادم التوقيع والختم (Remote Signer URL / Bridge)
              </label>
              <input
                type="text"
                placeholder="مثال: http://localhost:8080/api/v1/sign أو رابط الختم السحابي"
                value={settings.remote_signer_url || ''}
                onChange={(e) => setSettings({ ...settings, remote_signer_url: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 font-mono focus:outline-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderColor: 'var(--border-color)',
                }}
              />
              <p className="text-[10px] text-slate-500">
                يقوم الخادم بتمرير Canonical JSON للفاتورة لختمها بالشهادة الرقمية وتوليد CAdES-BES Signature
              </p>
            </div>

            {/* Signer Auth Token */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                رمز مصادقة الختم (Signer Bearer Token / API Key)
              </label>
              <div className="relative">
                <input
                  type={showSignerToken ? 'text' : 'password'}
                  placeholder="رمز الأمان لخدمة الختم (اختياري حسب المزود)"
                  value={settings.remote_signer_token || ''}
                  onChange={(e) => setSettings({ ...settings, remote_signer_token: e.target.value })}
                  className="w-full border rounded-xl pr-3 pl-9 py-2 text-xs text-slate-100 placeholder-slate-600 font-mono focus:outline-none"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    borderColor: 'var(--border-color)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowSignerToken(!showSignerToken)}
                  className="absolute left-2.5 top-2 text-slate-500 hover:text-slate-300"
                >
                  {showSignerToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div
            className="border rounded-2xl p-3.5 text-xs text-slate-400 flex items-start gap-2.5"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              borderColor: 'var(--border-color)',
            }}
          >
            <HelpCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--color-primary)' }} />
            <p className="text-[11px] leading-relaxed">
              تتطلب منظومة الإيصال الإلكتروني لمصلحة الضرائب المصرية ختماً إلكترونياً معتمداً (Egypt Trust / Misr Clearing). يتيح نظام الـ Remote Signer ربط التوكن المحلي أو السحابي بسلاسة دون الحاجة لتعريفات معقدة على أجهزة الكاشير.
            </p>
          </div>
        </div>
      </form>

      {/* Section 4: ETA Sync Queue Inspection Panel */}
      <div
        className="border rounded-3xl p-6 space-y-5 backdrop-blur-md"
        style={{
          backgroundColor: 'var(--card-bg)',
          borderColor: 'var(--border-color)',
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div>
            <h3 className="text-sm font-bold text-white">4. طابور المزامنة التلقائية (ETA Sync Queue Worker)</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              متابعة الفواتير المعلقة في الطابور وحالات إعادة المحاولة التلقائية (Retry Backoff)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleProcessQueue}
              disabled={processingQueue}
              className="flex items-center gap-1.5 px-3.5 py-2 text-white rounded-xl text-xs font-bold transition-all shadow-md hover:brightness-110"
              style={{
                backgroundColor: 'var(--color-primary)',
              }}
            >
              <Play className={`w-3.5 h-3.5 ${processingQueue ? 'animate-spin' : ''}`} />
              <span>{processingQueue ? 'جارٍ المعالجة...' : 'معالجة الطابور الآن'}</span>
            </button>
          </div>
        </div>

        {/* Queue Items Table */}
        <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--border-color)' }}>
          <table className="w-full text-right text-xs">
            <thead
              className="text-slate-400 border-b"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                borderColor: 'var(--border-color)',
              }}
            >
              <tr>
                <th className="py-2.5 px-3 font-semibold">رقم الفاتورة</th>
                <th className="py-2.5 px-3 font-semibold">الخدمة</th>
                <th className="py-2.5 px-3 font-semibold">المبلغ</th>
                <th className="py-2.5 px-3 font-semibold">حالة الطابور</th>
                <th className="py-2.5 px-3 font-semibold">المحاولات</th>
                <th className="py-2.5 px-3 font-semibold">آخر محاولة</th>
                <th className="py-2.5 px-3 font-semibold">ملاحظات / أخطاء</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
              {queueItems.length > 0 ? (
                queueItems.map((item) => (
                  <tr key={item.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold" style={{ color: 'var(--color-primary)' }}>
                      {item.order_code || 'طلب غير معروف'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">
                      {item.service_name || 'خدمة غسيل'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-200">
                      {item.total_amount ? formatEGP(item.total_amount) : '-'}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          item.status === 'synced'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : item.status === 'processing'
                            ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                            : item.status === 'failed'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {item.status === 'synced' ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            <span>تمت المزامنة</span>
                          </>
                        ) : item.status === 'processing' ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span>جارٍ الإرسال</span>
                          </>
                        ) : item.status === 'failed' ? (
                          <>
                            <AlertCircle className="w-3 h-3" />
                            <span>تعذر الإرسال</span>
                          </>
                        ) : (
                          <>
                            <Clock className="w-3 h-3" />
                            <span>معلق</span>
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">
                      {item.attempts} / 5
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
                      {item.last_attempt_at ? formatDateTime(item.last_attempt_at) : 'لم يتم بعد'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 max-w-xs truncate text-[11px]">
                      {item.error_log ? (
                        <span className="text-rose-400" title={item.error_log}>
                          {item.error_log}
                        </span>
                      ) : (
                        <span className="text-slate-500">لا توجد أخطاء</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-slate-500">
                    لا توجد فواتير معلقة في الطابور حالياً
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 5: Service EGS / GS1 Tax Mapping */}
      <div
        className="border rounded-3xl p-6 space-y-5 backdrop-blur-md"
        style={{
          backgroundColor: 'var(--card-bg)',
          borderColor: 'var(--border-color)',
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div>
            <h3 className="text-sm font-bold text-white">5. تكويد خدمات الغسيل بالضرائب (Service EGS Mapping)</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              ربط كل خدمة غسيل بكود التكويد الموحد EGS / GS1 المعتمد من مصلحة الضرائب
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleGenerateAllMissingCodes}
              className="flex items-center gap-1.5 px-3.5 py-2 border text-slate-300 rounded-xl text-xs font-semibold transition-colors hover:bg-white/5"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderColor: 'var(--border-color)',
              }}
            >
              <Wand2 className="w-3.5 h-3.5" style={{ color: 'var(--color-primary)' }} />
              <span>توليد أكواد مقترحة للكل</span>
            </button>

            <button
              type="button"
              onClick={handleBatchSaveCodes}
              disabled={savingCodes}
              className="flex items-center gap-1.5 px-4 py-2 text-white rounded-xl text-xs font-bold transition-all shadow-md hover:brightness-110"
              style={{
                backgroundColor: 'var(--color-primary)',
              }}
            >
              <Save className={`w-3.5 h-3.5 ${savingCodes ? 'animate-spin' : ''}`} />
              <span>{savingCodes ? 'جارٍ الحفظ...' : 'حفظ جميع الأكواد'}</span>
            </button>
          </div>
        </div>

        {/* Services Tax Mapping Table */}
        <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--border-color)' }}>
          <table className="w-full text-right text-xs">
            <thead
              className="text-slate-400 border-b"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                borderColor: 'var(--border-color)',
              }}
            >
              <tr>
                <th className="py-3 px-4 font-semibold">الخدمة</th>
                <th className="py-3 px-4 font-semibold">الفئة</th>
                <th className="py-3 px-4 font-semibold">السعر</th>
                <th className="py-3 px-4 font-semibold">كود التكويد الضريبي (EGS / GS1 Code)</th>
                <th className="py-3 px-4 font-semibold">الحالة الضريبية</th>
                <th className="py-3 px-4 font-semibold text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
              {(services || []).map((service, index) => {

                const currentCode = localEgsCodes[service.id] || '';
                const isConfigured = !!currentCode && currentCode.trim().length > 0;
                const isSingleSaving = singleSavingId === service.id;

                return (
                  <tr key={service.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4 font-bold text-white">
                      {service.name}
                    </td>

                    <td className="py-3 px-4 text-slate-400">
                      <span
                        className="px-2 py-0.5 rounded-md border text-[11px] text-slate-300"
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          borderColor: 'var(--border-color)',
                        }}
                      >
                        {service.category || 'عام'}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-mono font-bold" style={{ color: 'var(--color-primary)' }}>
                      {formatEGP(service.price)}
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 max-w-sm">
                        <input
                          type="text"
                          placeholder="مثال: EG-123456789-WASH01"
                          value={currentCode}
                          onChange={(e) =>
                            setLocalEgsCodes({
                              ...localEgsCodes,
                              [service.id]: e.target.value,
                            })
                          }
                          className="w-full border rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 font-mono focus:outline-none"
                          style={{
                            backgroundColor: 'rgba(0, 0, 0, 0.4)',
                            borderColor: 'var(--border-color)',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleGenerateSuggestedCode(service.id, index)}
                          title="توليد كود مقترح بالرقم الضريبي"
                          className="p-1.5 border text-slate-400 rounded-lg transition-colors hover:bg-white/10"
                          style={{
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            borderColor: 'var(--border-color)',
                          }}
                        >
                          <Wand2 className="w-3.5 h-3.5" style={{ color: 'var(--color-primary)' }} />
                        </button>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          isConfigured
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {isConfigured ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            <span>مكود ومعتمد</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3 h-3" />
                            <span>يحتاج تكويد</span>
                          </>
                        )}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleSaveSingleCode(service.id)}
                        disabled={isSingleSaving}
                        className="px-2.5 py-1 border text-slate-300 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 hover:bg-white/10"
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          borderColor: 'var(--border-color)',
                        }}
                      >
                        {isSingleSaving ? '...' : 'حفظ'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default EtaSettingsTab;

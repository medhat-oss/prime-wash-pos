import React, { useState, useEffect, useRef } from 'react';
import {
  Palette,
  Film,
  Image as ImageIcon,
  Sliders,
  CheckCircle2,
  RefreshCw,
  Eye,
  Layers,
  Monitor,
  Pipette,
  Check,
  UploadCloud,
  Loader2,
  Link2,
} from 'lucide-react';
import { settingsApi, uploadApi } from '../../api/client.js';
import { PosSettings } from '../../types/index.js';
import { useToast } from '../../components/Toast.js';
import {
  applyThemeToRoot,
  broadcastThemeUpdate,
  parseColorAndAlpha,
  hexAndAlphaToRgba,
} from '../../utils/theme.js';
import { resolveMediaUrl } from '../../utils/formatters.js';

export const PosAppearanceTab: React.FC = () => {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showManualUrl, setShowManualUrl] = useState(false);

  const [form, setForm] = useState<PosSettings>({
    pos_background_url: 'https://res.cloudinary.com/dwsxotewe/video/upload/v1787166944/car_wash_media/q40i7grywsgvya85nedc.mp4',
    pos_background_type: 'video',
    pos_background_opacity: 0.30,
    primary_color: '#bd0000',
    secondary_color: '#570505',
    accent_color: '#bd0000',
    card_bg_color: 'rgba(66, 0, 0, 0.82)',
    border_color: 'rgba(194, 0, 0, 0.70)',
    app_bg_color: '#000000',
    header_bg_color: 'rgba(46, 0, 0, 0.85)',
  });

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const data = await settingsApi.getPosSettings(true);
      const newSettings: PosSettings = {
        id: data.id,
        pos_background_url: data.pos_background_url || 'https://res.cloudinary.com/dwsxotewe/video/upload/v1787166944/car_wash_media/q40i7grywsgvya85nedc.mp4',
        pos_background_type: data.pos_background_type || 'video',
        pos_background_opacity: data.pos_background_opacity ?? 0.30,
        primary_color: data.primary_color || '#bd0000',
        secondary_color: data.secondary_color || '#570505',
        accent_color: data.accent_color || '#bd0000',
        card_bg_color: data.card_bg_color || 'rgba(66, 0, 0, 0.82)',
        border_color: data.border_color || 'rgba(194, 0, 0, 0.70)',
        app_bg_color: data.app_bg_color || '#000000',
        header_bg_color: data.header_bg_color || 'rgba(46, 0, 0, 0.85)',
      };
      setForm(newSettings);
      applyThemeToRoot(newSettings);

    } catch (err: any) {
      toast.error(err.message, 'تعذر تحميل إعدادات مظهر الكاشير');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleFieldChange = (key: keyof PosSettings, value: any) => {
    const updated = { ...form, [key]: value };
    setForm(updated);
    // Live update CSS variables in real-time
    applyThemeToRoot(updated);
  };

  // Specialized handlers for Backgrounds and Border with Alpha
  const cardBgParsed = parseColorAndAlpha(form.card_bg_color || 'rgba(15, 23, 42, 0.75)', '#0f172a', 0.75);
  const borderParsed = parseColorAndAlpha(form.border_color || 'rgba(51, 65, 85, 0.6)', '#334155', 0.6);
  const headerBgParsed = parseColorAndAlpha(form.header_bg_color || 'rgba(15, 23, 42, 0.85)', '#0f172a', 0.85);

  const handleCardBgChange = (newHex: string, newAlpha: number) => {
    const rgba = hexAndAlphaToRgba(newHex, newAlpha);
    handleFieldChange('card_bg_color', rgba);
  };

  const handleBorderChange = (newHex: string, newAlpha: number) => {
    const rgba = hexAndAlphaToRgba(newHex, newAlpha);
    handleFieldChange('border_color', rgba);
  };

  const handleHeaderBgChange = (newHex: string, newAlpha: number) => {
    const rgba = hexAndAlphaToRgba(newHex, newAlpha);
    handleFieldChange('header_bg_color', rgba);
  };

  const handleFileProcess = async (file: File) => {
    if (!file) return;

    // Check size limit: 50MB
    if (file.size > 50 * 1024 * 1024) {
      toast.error('حجم الملف كبير جداً. الحد الأقصى المسموح به هو 50 ميجابايت', 'خطأ في الحجم');
      return;
    }

    try {
      setUploading(true);
      const res = await uploadApi.uploadMedia(file);

      const updated: PosSettings = {
        ...form,
        pos_background_url: res.data.url,
        pos_background_type: res.data.media_type,
      };

      setForm(updated);
      applyThemeToRoot(updated);

      toast.success(
        `تم رفع الملف (${res.data.filename}) بنجاح! نوع الوسائط: ${res.data.media_type === 'video' ? 'فيديو' : 'صورة'}`,
        'تم الرفع بنجاح'
      );
    } catch (err: any) {
      toast.error(err.message || 'فشل في رفع الملف', 'خطأ في الرفع');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const result = await settingsApi.updatePosSettings({
        pos_background_url: form.pos_background_url || null,
        pos_background_type: form.pos_background_type,
        pos_background_opacity: Number(form.pos_background_opacity),
        primary_color: form.primary_color,
        secondary_color: form.secondary_color,
        accent_color: form.accent_color,
        card_bg_color: form.card_bg_color,
        border_color: form.border_color,
        app_bg_color: form.app_bg_color,
        header_bg_color: form.header_bg_color,
      });

      const updated = { ...form, ...result.data };
      setForm(updated);
      broadcastThemeUpdate(updated);

      toast.success(result.message || 'تم حفظ وتطبيق مظهر وألوان التطبيق والكاشير بنجاح!', 'تم الحفظ والتطبيق');
    } catch (err: any) {
      toast.error(err.message, 'فشل في حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  };


  // Curated Color Palette Themes
  const themePresets = [
    {
      id: 'prime-crimson',
      name: 'قرمزي برايم واش الرياضي (Signature Crimson)',
      primary: '#bd0000',
      secondary: '#570505',
      accent: '#bd0000',
      cardBg: 'rgba(66, 0, 0, 0.82)',
      border: 'rgba(194, 0, 0, 0.70)',
      appBg: '#000000',
      headerBg: 'rgba(46, 0, 0, 0.85)',
      badgeBg: 'from-red-600 to-rose-900',
    },
    {
      id: 'cyber-neon',
      name: 'نيون سايبر (Cyber Neon)',
      primary: '#06b6d4',
      secondary: '#3b82f6',
      accent: '#10b981',
      cardBg: 'rgba(15, 23, 42, 0.75)',
      border: 'rgba(6, 182, 212, 0.35)',
      appBg: '#090d16',
      headerBg: 'rgba(15, 23, 42, 0.85)',
      badgeBg: 'from-cyan-500 to-blue-600',
    },

    {
      id: 'royal-gold',
      name: 'ملكي كلاسيكي ذهبي (Royal Gold)',
      primary: '#f59e0b',
      secondary: '#d97706',
      accent: '#10b981',
      cardBg: 'rgba(24, 18, 10, 0.82)',
      border: 'rgba(245, 158, 11, 0.35)',
      appBg: '#120d06',
      headerBg: 'rgba(24, 18, 10, 0.88)',
      badgeBg: 'from-amber-500 to-yellow-600',
    },
    {
      id: 'midnight-violet',
      name: 'ليلي بنفسجي (Midnight Violet)',
      primary: '#8b5cf6',
      secondary: '#6366f1',
      accent: '#ec4899',
      cardBg: 'rgba(20, 15, 38, 0.82)',
      border: 'rgba(139, 92, 246, 0.35)',
      appBg: '#0e0b1c',
      headerBg: 'rgba(20, 15, 38, 0.88)',
      badgeBg: 'from-purple-500 to-indigo-600',
    },
    {
      id: 'titanium-slate',
      name: 'تيتانيوم داكن فاخر (Titanium Slate)',
      primary: '#38bdf8',
      secondary: '#64748b',
      accent: '#34d399',
      cardBg: 'rgba(15, 23, 42, 0.85)',
      border: 'rgba(71, 85, 105, 0.5)',
      appBg: '#0b0f17',
      headerBg: 'rgba(15, 23, 42, 0.90)',
      badgeBg: 'from-sky-500 to-slate-600',
    },
  ];

  const applyPresetTheme = (preset: typeof themePresets[0]) => {
    const updated = {
      ...form,
      primary_color: preset.primary,
      secondary_color: preset.secondary,
      accent_color: preset.accent,
      card_bg_color: preset.cardBg,
      border_color: preset.border,
      app_bg_color: preset.appBg,
      header_bg_color: preset.headerBg,
    };
    setForm(updated);
    applyThemeToRoot(updated);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-8 h-8 text-brand-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Palette className="w-5 h-5 text-brand-400" />
            تخصيص ألوان ومظهر وخلفية النظام الشاملة
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            تحكم كامل في لوحة الألوان وخلفية التطبيق العامة والهيدر ولوحة الأدمن وشاشة الكاشير
          </p>
        </div>

        <button
          onClick={fetchSettings}
          className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>تحديث</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          <form
            onSubmit={handleSave}
            className="rounded-3xl p-6 shadow-xl space-y-6 border transition-all duration-300 backdrop-blur-md"
            style={{
              backgroundColor: 'var(--card-bg)',
              borderColor: 'var(--border-color)',
            }}
          >
            {/* ======================================================== */}
            {/* 1. Theme Color Palette Section */}
            {/* ======================================================== */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Pipette className="w-4 h-4 text-brand-400" />
                  <span>1. تخصيص لوحة الألوان والسمات (Theme & Color Customizer)</span>
                </label>
                <span className="text-[10px] text-slate-400">تطبيق حي ولحظي على النظام</span>
              </div>

              {/* Quick Themes Preset Buttons */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                  <Palette className="w-3.5 h-3.5 text-brand-400" />
                  <span>سمات وألوان جاهزة بضغطة زر:</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {themePresets.map((preset) => {
                    const isSelected = form.primary_color === preset.primary;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyPresetTheme(preset)}
                        className={`p-3 rounded-2xl border text-right transition-all flex items-center justify-between ${
                          isSelected
                            ? 'ring-2'
                            : 'hover:opacity-90'
                        }`}
                        style={{
                          backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'rgba(2, 6, 23, 0.65)',
                          borderColor: isSelected ? 'var(--color-primary)' : 'var(--border-color)',
                          boxShadow: isSelected ? '0 4px 18px rgba(0, 0, 0, 0.35)' : 'none',
                        }}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-6 h-6 rounded-lg bg-gradient-to-tr ${preset.badgeBg} flex items-center justify-center text-white shadow-md`}>
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-white">{preset.name}</div>
                            <div className="text-[10px] font-mono text-slate-400">{preset.primary}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="w-3 h-3 rounded-full border border-slate-700" style={{ backgroundColor: preset.primary }} />
                          <span className="w-3 h-3 rounded-full border border-slate-700" style={{ backgroundColor: preset.secondary }} />
                          <span className="w-3 h-3 rounded-full border border-slate-700" style={{ backgroundColor: preset.accent }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Individual Detailed Color Pickers */}
              <div className="space-y-3 pt-2">
                <span className="text-xs font-semibold text-slate-400">
                  تعديل وتخصيص ألوان الأزرار والعناوين يدويًا:
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Primary Color */}
                  <div
                    className="p-3.5 rounded-2xl border space-y-1.5"
                    style={{
                      backgroundColor: 'rgba(2, 6, 23, 0.65)',
                      borderColor: 'var(--border-color)',
                    }}
                  >
                    <label className="block text-xs font-bold text-slate-200">
                      لون الأزرار واللوجو الأساسي
                    </label>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      يتحكم في لون زر إصدار الفاتورة، اللوجو في الأعلى، والتصنيف المختار
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="color"
                        value={form.primary_color || '#06b6d4'}
                        onChange={(e) => handleFieldChange('primary_color', e.target.value)}
                        className="w-9 h-9 rounded-xl cursor-pointer bg-transparent border border-slate-700 shrink-0"
                      />
                      <input
                        type="text"
                        value={form.primary_color || '#06b6d4'}
                        onChange={(e) => handleFieldChange('primary_color', e.target.value)}
                        className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-mono text-slate-100 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Secondary Color */}
                  <div
                    className="p-3.5 rounded-2xl border space-y-1.5"
                    style={{
                      backgroundColor: 'rgba(2, 6, 23, 0.65)',
                      borderColor: 'var(--border-color)',
                    }}
                  >
                    <label className="block text-xs font-bold text-slate-200">
                      لون العناوين والتدرجات
                    </label>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      يتحكم في التدرج اللوني للنصوص والأزرار الثانوية وشعار النظام
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="color"
                        value={form.secondary_color || '#3b82f6'}
                        onChange={(e) => handleFieldChange('secondary_color', e.target.value)}
                        className="w-9 h-9 rounded-xl cursor-pointer bg-transparent border border-slate-700 shrink-0"
                      />
                      <input
                        type="text"
                        value={form.secondary_color || '#3b82f6'}
                        onChange={(e) => handleFieldChange('secondary_color', e.target.value)}
                        className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-mono text-slate-100 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Accent Color */}
                  <div
                    className="p-3.5 rounded-2xl border space-y-1.5"
                    style={{
                      backgroundColor: 'rgba(2, 6, 23, 0.65)',
                      borderColor: 'var(--border-color)',
                    }}
                  >
                    <label className="block text-xs font-bold text-slate-200">
                      لون الحالات والتأكيد
                    </label>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      يتحكم في شارات النجاح، حالة الاتصال بالإنترنت، والأرقام الإيجابية
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="color"
                        value={form.accent_color || '#10b981'}
                        onChange={(e) => handleFieldChange('accent_color', e.target.value)}
                        className="w-9 h-9 rounded-xl cursor-pointer bg-transparent border border-slate-700 shrink-0"
                      />
                      <input
                        type="text"
                        value={form.accent_color || '#10b981'}
                        onChange={(e) => handleFieldChange('accent_color', e.target.value)}
                        className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-mono text-slate-100 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* General App Background & Top Header Background Controls */}
                <span className="text-xs font-semibold text-slate-400 block pt-2">
                  خلفية التطبيق العامة وشريط الهيدر العلوي:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* General App Background */}
                  <div
                    className="p-3.5 rounded-2xl border space-y-2"
                    style={{
                      backgroundColor: 'rgba(2, 6, 23, 0.65)',
                      borderColor: 'var(--border-color)',
                    }}
                  >
                    <label className="block text-xs font-bold text-slate-200">
                      لون خلفية التطبيق العامة (App Background)
                    </label>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      يتحكم في لون خلفية لوحة الإدارة، شريط الأدمن، وخلفية الصفحات
                    </p>

                    <div className="flex items-center gap-2.5 pt-1">
                      <input
                        type="color"
                        value={form.app_bg_color || '#090d16'}
                        onChange={(e) => handleFieldChange('app_bg_color', e.target.value)}
                        className="w-9 h-9 rounded-xl cursor-pointer bg-transparent border border-slate-700 shrink-0"
                      />
                      <input
                        type="text"
                        value={form.app_bg_color || '#090d16'}
                        onChange={(e) => handleFieldChange('app_bg_color', e.target.value)}
                        className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-mono text-slate-100 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Top Header Background */}
                  <div
                    className="p-3.5 rounded-2xl border space-y-2"
                    style={{
                      backgroundColor: 'rgba(2, 6, 23, 0.65)',
                      borderColor: 'var(--border-color)',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-200">
                        لون شريط الهيدر العلوي (Header Background)
                      </label>
                      <span className="text-[10px] font-mono font-bold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded border border-brand-500/20">
                        {Math.round(headerBgParsed.alpha * 100)}% عتامة
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      يتحكم في لون وتعتيم شريط التنقل العلوي المثبت
                    </p>

                    <div className="flex items-center gap-2.5 pt-1">
                      <input
                        type="color"
                        value={headerBgParsed.hex}
                        onChange={(e) => handleHeaderBgChange(e.target.value, headerBgParsed.alpha)}
                        className="w-9 h-9 rounded-xl cursor-pointer bg-transparent border border-slate-700 shrink-0"
                      />
                      <div className="flex-1 space-y-1">
                        <input
                          type="range"
                          min="0.20"
                          max="0.98"
                          step="0.02"
                          value={headerBgParsed.alpha}
                          onChange={(e) => handleHeaderBgChange(headerBgParsed.hex, parseFloat(e.target.value))}
                          className="w-full accent-brand-500 cursor-pointer h-2 bg-slate-900 rounded-lg appearance-none"
                        />
                        <div className="text-[10px] font-mono text-slate-400">{form.header_bg_color}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Glass Card & Border Transparency Controls with Easy Pickers & Sliders */}
                <span className="text-xs font-semibold text-slate-400 block pt-2">
                  خلفية كروت الخدمات وحدود الإطارات:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Card Glass Background */}
                  <div
                    className="p-3.5 rounded-2xl border space-y-2"
                    style={{
                      backgroundColor: 'rgba(2, 6, 23, 0.65)',
                      borderColor: 'var(--border-color)',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-200">
                        لون وشفافية خلفية كروت الخدمات ولوحة الفاتورة
                      </label>
                      <span className="text-[10px] font-mono font-bold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded border border-brand-500/20">
                        {Math.round(cardBgParsed.alpha * 100)}% عتامة
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      يتحكم في لون وشفافية الزجاج لكروت الخدمات ولوحة الفاتورة الجانبية
                    </p>

                    <div className="flex items-center gap-2.5 pt-1">
                      <input
                        type="color"
                        value={cardBgParsed.hex}
                        onChange={(e) => handleCardBgChange(e.target.value, cardBgParsed.alpha)}
                        className="w-9 h-9 rounded-xl cursor-pointer bg-transparent border border-slate-700 shrink-0"
                      />
                      <div className="flex-1 space-y-1">
                        <input
                          type="range"
                          min="0.10"
                          max="0.95"
                          step="0.05"
                          value={cardBgParsed.alpha}
                          onChange={(e) => handleCardBgChange(cardBgParsed.hex, parseFloat(e.target.value))}
                          className="w-full accent-brand-500 cursor-pointer h-2 bg-slate-900 rounded-lg appearance-none"
                        />
                        <div className="text-[10px] font-mono text-slate-400">{form.card_bg_color}</div>
                      </div>
                    </div>
                  </div>

                  {/* Card Border Color */}
                  <div
                    className="p-3.5 rounded-2xl border space-y-2"
                    style={{
                      backgroundColor: 'rgba(2, 6, 23, 0.65)',
                      borderColor: 'var(--border-color)',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-200">
                        لون وشفافية حدود وإطارات الكروت
                      </label>
                      <span className="text-[10px] font-mono font-bold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded border border-brand-500/20">
                        {Math.round(borderParsed.alpha * 100)}% وضوح
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      يتحكم في لون وشفافية إطارات الكروت والفواصل في شاشة الكاشير
                    </p>

                    <div className="flex items-center gap-2.5 pt-1">
                      <input
                        type="color"
                        value={borderParsed.hex}
                        onChange={(e) => handleBorderChange(e.target.value, borderParsed.alpha)}
                        className="w-9 h-9 rounded-xl cursor-pointer bg-transparent border border-slate-700 shrink-0"
                      />
                      <div className="flex-1 space-y-1">
                        <input
                          type="range"
                          min="0.10"
                          max="0.90"
                          step="0.05"
                          value={borderParsed.alpha}
                          onChange={(e) => handleBorderChange(borderParsed.hex, parseFloat(e.target.value))}
                          className="w-full accent-brand-500 cursor-pointer h-2 bg-slate-900 rounded-lg appearance-none"
                        />
                        <div className="text-[10px] font-mono text-slate-400">{form.border_color}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ======================================================== */}
            {/* 2. Media Upload & Background Section */}
            {/* ======================================================== */}
            <div className="space-y-4 pt-2 border-t border-slate-800/80">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Monitor className="w-4 h-4 text-brand-400" />
                  <span>2. وسائط وخلفية شاشة الكاشير (Direct Upload & Media)</span>
                </label>
                <span className="text-[10px] text-slate-400">يدعم الفيديو MP4 والصور بدقة عالية</span>
              </div>

              {/* Type Switcher */}
              <div className="grid grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleFieldChange('pos_background_type', 'none')}
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-bold transition-all ${
                    form.pos_background_type === 'none'
                      ? 'ring-2'
                      : 'hover:opacity-90'
                  }`}
                  style={{
                    backgroundColor: form.pos_background_type === 'none' ? 'var(--color-primary)' : 'rgba(2, 6, 23, 0.65)',
                    borderColor: form.pos_background_type === 'none' ? 'var(--color-primary)' : 'var(--border-color)',
                    color: form.pos_background_type === 'none' ? '#ffffff' : 'rgb(148, 163, 184)',
                  }}
                >
                  <Layers className="w-5 h-5 mb-1 text-slate-400" />
                  <span>بدون (شبكة داكنة)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleFieldChange('pos_background_type', 'image')}
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-bold transition-all ${
                    form.pos_background_type === 'image'
                      ? 'ring-2'
                      : 'hover:opacity-90'
                  }`}
                  style={{
                    backgroundColor: form.pos_background_type === 'image' ? 'var(--color-primary)' : 'rgba(2, 6, 23, 0.65)',
                    borderColor: form.pos_background_type === 'image' ? 'var(--color-primary)' : 'var(--border-color)',
                    color: form.pos_background_type === 'image' ? '#ffffff' : 'rgb(148, 163, 184)',
                  }}
                >
                  <ImageIcon className="w-5 h-5 mb-1" />
                  <span>صورة عالية الدقة</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleFieldChange('pos_background_type', 'video')}
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-bold transition-all ${
                    form.pos_background_type === 'video'
                      ? 'ring-2'
                      : 'hover:opacity-90'
                  }`}
                  style={{
                    backgroundColor: form.pos_background_type === 'video' ? 'var(--color-primary)' : 'rgba(2, 6, 23, 0.65)',
                    borderColor: form.pos_background_type === 'video' ? 'var(--color-primary)' : 'var(--border-color)',
                    color: form.pos_background_type === 'video' ? '#ffffff' : 'rgb(148, 163, 184)',
                  }}
                >
                  <Film className="w-5 h-5 mb-1" />
                  <span>فيديو تفاعلي Loop</span>
                </button>
              </div>

              {/* Direct File Upload Drag & Drop Area */}
              {form.pos_background_type !== 'none' && (
                <div className="space-y-3">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="video/mp4,video/webm,image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                  />

                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative p-6 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center group ${
                      isDragOver
                        ? 'border-primary bg-primary/10'
                        : 'border-slate-800 hover:border-primary/50 bg-slate-950/60 hover:bg-slate-950'
                    }`}
                  >
                    {uploading ? (
                      <div className="flex flex-col items-center gap-2 py-3">
                        <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
                        <span className="text-xs font-bold text-slate-200">
                          جاري رفع وتجهيز الملف إلى الخادم / السحابة...
                        </span>
                        <span className="text-[10px] text-slate-400">يرجى الانتظار ثوانٍ معدودة</span>
                      </div>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-2xl bg-brand-500/15 text-brand-400 flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
                          <UploadCloud className="w-6 h-6" />
                        </div>
                        <h4 className="text-xs font-bold text-slate-200 mb-1">
                          اضغط لاختيار فيديو أو صورة من جهازك، أو اسحب الملف وأفلته هنا
                        </h4>
                        <p className="text-[10px] text-slate-400">
                          يدعم MP4, WebM, JPG, PNG, WebP (بحد أقصى 50MB) - يتم الحفظ والتحسين تلقائياً
                        </p>
                      </>
                    )}
                  </div>

                  {/* Manual URL Toggle */}
                  <div className="flex items-center justify-between text-[11px]">
                    <button
                      type="button"
                      onClick={() => setShowManualUrl(!showManualUrl)}
                      className="text-brand-400 hover:underline flex items-center gap-1 font-bold"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      <span>{showManualUrl ? 'إخفاء حقل الرابط الخارجي' : 'أو إدخال رابط وسائط خارجي يدوياً'}</span>
                    </button>
                    {form.pos_background_url && (
                      <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        تم تعيين الوسائط بنجاح
                      </span>
                    )}
                  </div>

                  {showManualUrl && (
                    <div className="space-y-1.5 animate-in fade-in-50">
                      <label className="block text-[11px] font-bold text-slate-300">
                        {form.pos_background_type === 'video'
                          ? 'رابط الفيديو المباشر (Direct Video MP4/WebM URL)'
                          : 'رابط الصورة المباشر (Direct Image URL)'}
                      </label>
                      <input
                        type="url"
                        placeholder="https://example.com/video.mp4"
                        value={form.pos_background_url || ''}
                        onChange={(e) => handleFieldChange('pos_background_url', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-brand-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-mono focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Opacity Slider */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-brand-400" />
                    <span>درجة وضوح خلفية الشاشة / التعتيم (Background Visibility)</span>
                  </label>
                  <span className="font-mono text-xs font-black text-brand-400 bg-brand-500/10 px-2.5 py-1 rounded-lg border border-brand-500/20">
                    {Math.round((form.pos_background_opacity || 0.25) * 100)}% وضوح
                  </span>
                </div>

                <input
                  type="range"
                  min="0.05"
                  max="0.80"
                  step="0.05"
                  value={form.pos_background_opacity ?? 0.25}
                  onChange={(e) =>
                    handleFieldChange('pos_background_opacity', parseFloat(e.target.value))
                  }
                  className="w-full accent-brand-500 cursor-pointer h-2 bg-slate-950 rounded-lg appearance-none"
                />
              </div>

            </div>

            {/* Save Button */}
            <div className="pt-3 border-t border-slate-800/80 flex justify-end">
              <button
                type="submit"
                disabled={saving || uploading}
                className="px-6 py-3.5 text-white rounded-2xl text-xs font-bold shadow-lg disabled:opacity-50 flex items-center gap-2 transition-all active:scale-[0.99]"
                style={{
                  backgroundColor: 'var(--color-primary)',
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
                }}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{saving ? 'جاري الحفظ والتطبيق...' : 'حفظ وتطبيق مظهر وألوان النظام'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Live Interactive Simulation (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
            <Eye className="w-4 h-4 text-brand-400" />
            <span>معاينة حية فورية لشاشة الكاشير (POS Live Simulation):</span>
          </div>

          <div
            className="relative h-[580px] w-full rounded-3xl overflow-hidden border shadow-2xl flex flex-col justify-between p-4 select-none transition-all duration-300"
            style={{
              borderColor: form.border_color || 'rgba(51, 65, 85, 0.6)',
              backgroundColor: form.app_bg_color || '#090d16',
            }}
          >
            {/* Background Layer */}
            {form.pos_background_type === 'video' && form.pos_background_url ? (
              <video
                key={resolveMediaUrl(form.pos_background_url)}
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                style={{ opacity: form.pos_background_opacity ?? 0.25 }}
              >
                <source src={resolveMediaUrl(form.pos_background_url)} type="video/mp4" />
                <source src={resolveMediaUrl(form.pos_background_url)} type="video/webm" />
              </video>
            ) : form.pos_background_type === 'image' && form.pos_background_url ? (
              <img
                key={resolveMediaUrl(form.pos_background_url)}
                src={resolveMediaUrl(form.pos_background_url)}
                alt="POS Background"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                style={{ opacity: form.pos_background_opacity ?? 0.25 }}
              />
            ) : (
              <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-40" />
            )}

            {/* Gradient Dimmer */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/45 to-slate-950/70 pointer-events-none" />

            {/* Simulated POS Header */}
            <div
              className="relative z-10 flex items-center justify-between p-3 rounded-2xl backdrop-blur-md border transition-all duration-300"
              style={{
                backgroundColor: form.header_bg_color || 'rgba(15, 23, 42, 0.85)',
                borderColor: form.border_color || 'rgba(51, 65, 85, 0.6)',
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[11px] font-black shadow-md"
                  style={{
                    background: `linear-gradient(135deg, ${form.primary_color || '#06b6d4'}, ${form.secondary_color || '#3b82f6'})`,
                  }}
                >
                  CW
                </div>
                <span className="text-xs font-bold text-white">نظام كاشير المغسلة</span>
              </div>
              <span
                className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border"
                style={{
                  color: form.accent_color || '#10b981',
                  borderColor: form.accent_color || '#10b981',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                }}
              >
                🟢 متصل
              </span>
            </div>

            {/* Simulated POS Cards Grid */}
            <div className="relative z-10 grid grid-cols-2 gap-2.5 my-auto">
              <div
                className="p-3.5 rounded-2xl backdrop-blur-md border shadow-lg transition-all duration-300 ring-2"
                style={{
                  backgroundColor: form.card_bg_color || 'rgba(15, 23, 42, 0.75)',
                  borderColor: form.primary_color || '#06b6d4',
                  boxShadow: `0 0 20px rgba(0, 0, 0, 0.35)`,
                }}
              >
                <div
                  className="text-[11px] font-bold mb-1"
                  style={{ color: form.primary_color || '#06b6d4' }}
                >
                  غسيل شامل VIP
                </div>
                <div className="font-mono text-sm font-black text-white">150 ج.م</div>
              </div>

              <div
                className="p-3.5 rounded-2xl backdrop-blur-md border transition-all duration-300"
                style={{
                  backgroundColor: form.card_bg_color || 'rgba(15, 23, 42, 0.75)',
                  borderColor: form.border_color || 'rgba(51, 65, 85, 0.6)',
                }}
              >
                <div className="text-[11px] text-slate-300 font-bold mb-1">غسيل خارجي رغوة</div>
                <div className="font-mono text-sm font-black text-white">80 ج.م</div>
              </div>

              <div
                className="p-3.5 rounded-2xl backdrop-blur-md border transition-all duration-300"
                style={{
                  backgroundColor: form.card_bg_color || 'rgba(15, 23, 42, 0.75)',
                  borderColor: form.border_color || 'rgba(51, 65, 85, 0.6)',
                }}
              >
                <div className="text-[11px] text-slate-300 font-bold mb-1">تلميع صالون وواكس</div>
                <div className="font-mono text-sm font-black text-white">200 ج.م</div>
              </div>

              <div
                className="p-3.5 rounded-2xl backdrop-blur-md border transition-all duration-300"
                style={{
                  backgroundColor: form.card_bg_color || 'rgba(15, 23, 42, 0.75)',
                  borderColor: form.border_color || 'rgba(51, 65, 85, 0.6)',
                }}
              >
                <div className="text-[11px] text-slate-300 font-bold mb-1">غسيل محرك بالبخار</div>
                <div className="font-mono text-sm font-black text-white">120 ج.م</div>
              </div>
            </div>

            {/* Simulated POS Footer Action */}
            <div
              className="relative z-10 p-3 rounded-2xl backdrop-blur-md border flex items-center justify-between transition-all duration-300"
              style={{
                backgroundColor: form.card_bg_color || 'rgba(15, 23, 42, 0.75)',
                borderColor: form.border_color || 'rgba(51, 65, 85, 0.6)',
              }}
            >
              <span className="text-[11px] text-slate-300">إجمالي الطلب:</span>
              <span
                className="font-mono text-sm font-black"
                style={{ color: form.primary_color || '#06b6d4' }}
              >
                150.00 ج.م
              </span>
              <button
                type="button"
                className="px-3.5 py-1.5 text-white rounded-xl text-[11px] font-bold shadow-md transition-all"
                style={{
                  backgroundColor: form.primary_color || '#06b6d4',
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
                }}
              >
                تأكيد الفاتورة
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PosAppearanceTab;

import React, { useState, useEffect, useRef } from 'react';
import { LandingPageConfig } from '../../types/index.js';
import {
  getStoredLandingConfig,
  saveStoredLandingConfig,
  DEFAULT_LANDING_CONFIG,
  LANDING_CONFIG_UPDATED_EVENT,
} from '../../utils/landingStorage.js';
import { landingApi, uploadApi } from '../../api/client.js';
import { useToast } from '../../components/Toast.js';
import { FormSkeleton, ErrorState } from '../../components/ui/index.js';

export const LandingSettingsTab: React.FC = () => {
  const toast = useToast();
  const [config, setConfig] = useState<LandingPageConfig>(() => getStoredLandingConfig());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingTarget, setUploadingTarget] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeUploadField = useRef<string | null>(null);

  useEffect(() => {
    setLoading(true);
    landingApi
      .getConfig(true)
      .then((data) => {
        if (data) setConfig(data);
      })
      .catch((err) => {
        console.warn('[LandingSettingsTab] Remote fetch fallback:', err);
      })
      .finally(() => setLoading(false));

    const handleUpdate = (e: any) => {
      if (e.detail) setConfig(e.detail);
    };
    window.addEventListener(LANDING_CONFIG_UPDATED_EVENT, handleUpdate);
    return () => {
      window.removeEventListener(LANDING_CONFIG_UPDATED_EVENT, handleUpdate);
    };
  }, []);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setSaving(true);
      const updated = await landingApi.updateConfig(config);
      setConfig(updated);
      toast.success('تم حفظ وتحديث إعدادات صفحة العروض والزوار بنجاح!', 'تم الحفظ');
    } catch (err: any) {
      toast.error(err.message || 'فشل في حفظ إعدادات الصفحة', 'خطأ');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (window.confirm('هل أنت متأكد من رغبتك في استعادة الإعدادات الافتراضية لصفحة العروض؟')) {
      setConfig({ ...DEFAULT_LANDING_CONFIG, updated_at: new Date().toISOString() });
      saveStoredLandingConfig(DEFAULT_LANDING_CONFIG);
      toast.info('تم استعادة الإعدادات الافتراضية بنجاح. اضغط حفظ لتأكيدها.');
    }
  };

  const triggerUpload = (targetKey: string) => {
    activeUploadField.current = targetKey;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeUploadField.current) return;

    if (file.size > 50 * 1024 * 1024) {
      toast.error('حجم الملف كبير جداً. الحد الأقصى 50 ميجابايت', 'خطأ في الحجم');
      return;
    }

    const fieldKey = activeUploadField.current;
    try {
      setUploadingTarget(fieldKey);
      const res = await uploadApi.uploadMedia(file);
      const uploadedUrl = res.data.url;
      const uploadedType = res.data.media_type;

      setConfig((prev) => {
        const next = { ...prev };
        if (fieldKey === 'hero_1') {
          next.hero_section_1 = {
            ...next.hero_section_1,
            media_url: uploadedUrl,
            media_type: uploadedType,
          };
        } else if (fieldKey === 'card_1') {
          next.offer_card_1 = {
            ...next.offer_card_1,
            media_url: uploadedUrl,
            media_type: uploadedType,
          };
        } else if (fieldKey === 'card_2') {
          next.offer_card_2 = {
            ...next.offer_card_2,
            media_url: uploadedUrl,
            media_type: uploadedType,
          };
        } else if (fieldKey === 'hero_2') {
          next.hero_section_2 = {
            ...next.hero_section_2,
            media_url: uploadedUrl,
            media_type: uploadedType,
          };
        }
        return next;
      });

      toast.success(`تم رفع وتعيين الوسائط بنجاح كـ ${uploadedType === 'video' ? 'فيديو' : 'صورة'}`);
    } catch (err: any) {
      toast.error(err.message || 'تعذر رفع الملف');
    } finally {
      setUploadingTarget(null);
      activeUploadField.current = null;
    }
  };

  const openLivePreview = () => {
    window.open('/offers', '_blank');
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Hidden File Input for Cloudinary / Direct Media Upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*,video/*"
        className="hidden"
      />

      {/* Top Header & Overview Bar */}
      <div
        className="flex flex-col md:flex-row md:items-center justify-between gap-4 border p-5 rounded-3xl backdrop-blur-md shadow-xl"
        style={{
          backgroundColor: 'var(--card-bg)',
          borderColor: 'var(--border-color)',
        }}
      >
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-black text-white">صفحة العروض والزوار (Landing Page CMS)</h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
              عامة ومتاحة للزوار (No Auth)
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border bg-sky-500/20 text-sky-300 border-sky-500/30">
              /offers &bull; /showcase
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            تخصيص بنرات الفيديو والصور، كروت العروض التفاعلية، وروابط وأرقام الواتساب لحملات السوشيال ميديا
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={openLivePreview}
            className="flex items-center gap-1.5 px-3.5 py-2 border rounded-xl text-xs font-semibold transition-all shadow-sm hover:bg-white/5"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderColor: 'var(--border-color)',
              color: 'var(--color-primary)',
            }}
          >
            <span>معاينة صفحة العروض</span>
            <span>↗</span>
          </button>

          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3.5 py-2 border text-slate-300 rounded-xl text-xs font-semibold transition-all hover:bg-white/5"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderColor: 'var(--border-color)',
            }}
          >
            استعادة الافتراضي
          </button>

          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving}
            className="px-5 py-2 text-white rounded-xl text-xs font-bold shadow-lg transition-all hover:brightness-110 active:scale-95 cursor-pointer disabled:opacity-50"
            style={{
              backgroundColor: 'var(--color-primary)',
            }}
          >
            {saving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* ===================================================================== */}
        {/* Section 1: Hero Banner 1 Settings */}
        {/* ===================================================================== */}
        <div
          className="border rounded-3xl p-6 space-y-5 backdrop-blur-md"
          style={{
            backgroundColor: 'var(--card-bg)',
            borderColor: 'var(--border-color)',
          }}
        >
          <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>1. البنر الرئيسي الأول (Hero Banner 1)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                الخلفية العريضة في أعلى الصفحة (تدعم فيديو تلقائي متكرر أو صورة عالية الدقة)
              </p>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-slate-300 font-medium">إظهار النصوص</span>
              <input
                type="checkbox"
                checked={config.hero_section_1.show_overlay_text}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    hero_section_1: { ...config.hero_section_1, show_overlay_text: e.target.checked },
                  })
                }
                className="w-4 h-4 rounded text-red-600 focus:ring-red-500 bg-neutral-900 border-neutral-700"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">نوع الوسائط</label>
              <select
                value={config.hero_section_1.media_type}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    hero_section_1: {
                      ...config.hero_section_1,
                      media_type: e.target.value as 'image' | 'video',
                    },
                  })
                }
                className="w-full px-3.5 py-2.5 rounded-xl border text-xs bg-black/40 text-white focus:outline-none"
                style={{ borderColor: 'var(--border-color)' }}
              >
                <option value="video">فيديو متكرر (Autoplay Loop Video)</option>
                <option value="image">صورة ثابتة (Static High-Res Image)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">رابط الوسائط (URL أو رفع ملف)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={config.hero_section_1.media_url}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      hero_section_1: { ...config.hero_section_1, media_url: e.target.value },
                    })
                  }
                  placeholder="https://...mp4 أو رابط صورة"
                  className="flex-1 px-3.5 py-2.5 rounded-xl border text-xs bg-black/40 text-white focus:outline-none font-mono"
                  style={{ borderColor: 'var(--border-color)' }}
                />
                <button
                  type="button"
                  onClick={() => triggerUpload('hero_1')}
                  disabled={uploadingTarget === 'hero_1'}
                  className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded-xl text-xs font-bold shrink-0 transition-colors"
                >
                  {uploadingTarget === 'hero_1' ? 'جارٍ الرفع...' : '📁 رفع'}
                </button>
              </div>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-slate-300">العنوان الرئيسي</label>
              <input
                type="text"
                value={config.hero_section_1.title}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    hero_section_1: { ...config.hero_section_1, title: e.target.value },
                  })
                }
                placeholder="العنوان البارز..."
                className="w-full px-3.5 py-2.5 rounded-xl border text-xs bg-black/40 text-white focus:outline-none"
                style={{ borderColor: 'var(--border-color)' }}
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-slate-300">الوصف التعريفي</label>
              <textarea
                rows={2}
                value={config.hero_section_1.subtitle}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    hero_section_1: { ...config.hero_section_1, subtitle: e.target.value },
                  })
                }
                placeholder="وصف مميزات المغسلة والخدمات..."
                className="w-full px-3.5 py-2.5 rounded-xl border text-xs bg-black/40 text-white focus:outline-none leading-relaxed"
                style={{ borderColor: 'var(--border-color)' }}
              />
            </div>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* Section 2: Two Interactive Offer Cards Settings */}
        {/* ===================================================================== */}
        <div
          className="border rounded-3xl p-6 space-y-5 backdrop-blur-md"
          style={{
            backgroundColor: 'var(--card-bg)',
            borderColor: 'var(--border-color)',
          }}
        >
          <div className="pb-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
            <h3 className="text-sm font-bold text-white">2. كروت العروض التفاعلية (Offer Action Cards)</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              بطاقتان تفاعليتان مرتبطتان برابط واتساب فوري مع تجهيز اسم العرض داخل رسالة العميل
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Card 1 Controls */}
            <div className="p-5 rounded-2xl border border-neutral-800 bg-black/40 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                <h4 className="text-xs font-bold text-red-400">العرض الأول (Offer Card 1)</h4>
                <span className="text-[10px] text-neutral-400 font-mono">ID: {config.offer_card_1.id}</span>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">عنوان العرض</label>
                  <input
                    type="text"
                    value={config.offer_card_1.title}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        offer_card_1: { ...config.offer_card_1, title: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border text-xs bg-black/60 text-white focus:outline-none"
                    style={{ borderColor: 'var(--border-color)' }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">البادج الترويجي</label>
                    <input
                      type="text"
                      value={config.offer_card_1.badge || ''}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          offer_card_1: { ...config.offer_card_1, badge: e.target.value },
                        })
                      }
                      placeholder="الأكثر طلباً 🔥"
                      className="w-full px-3 py-2 rounded-xl border text-xs bg-black/60 text-white focus:outline-none"
                      style={{ borderColor: 'var(--border-color)' }}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">نوع الوسائط</label>
                    <select
                      value={config.offer_card_1.media_type}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          offer_card_1: {
                            ...config.offer_card_1,
                            media_type: e.target.value as 'image' | 'video',
                          },
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl border text-xs bg-black/60 text-white focus:outline-none"
                      style={{ borderColor: 'var(--border-color)' }}
                    >
                      <option value="image">صورة (Image)</option>
                      <option value="video">فيديو (Video)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">رابط صورة/فيديو الخلفية</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={config.offer_card_1.media_url}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          offer_card_1: { ...config.offer_card_1, media_url: e.target.value },
                        })
                      }
                      className="flex-1 px-3 py-2 rounded-xl border text-xs bg-black/60 text-white focus:outline-none font-mono"
                      style={{ borderColor: 'var(--border-color)' }}
                    />
                    <button
                      type="button"
                      onClick={() => triggerUpload('card_1')}
                      disabled={uploadingTarget === 'card_1'}
                      className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded-xl text-xs font-bold"
                    >
                      {uploadingTarget === 'card_1' ? '...' : '📁'}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">رقم واتساب الحجز (مع كود الدولة)</label>
                  <input
                    type="text"
                    value={config.offer_card_1.whatsapp_number}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        offer_card_1: { ...config.offer_card_1, whatsapp_number: e.target.value },
                      })
                    }
                    placeholder="201223770207"
                    className="w-full px-3 py-2 rounded-xl border text-xs bg-black/60 text-white focus:outline-none font-mono"
                    style={{ borderColor: 'var(--border-color)' }}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">الرسالة التلقائية المجهزة لواتساب</label>
                  <textarea
                    rows={2}
                    value={config.offer_card_1.whatsapp_prefilled_text}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        offer_card_1: { ...config.offer_card_1, whatsapp_prefilled_text: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border text-xs bg-black/60 text-white focus:outline-none leading-relaxed"
                    style={{ borderColor: 'var(--border-color)' }}
                  />
                </div>
              </div>
            </div>

            {/* Card 2 Controls */}
            <div className="p-5 rounded-2xl border border-neutral-800 bg-black/40 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                <h4 className="text-xs font-bold text-red-400">العرض الثاني (Offer Card 2)</h4>
                <span className="text-[10px] text-neutral-400 font-mono">ID: {config.offer_card_2.id}</span>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">عنوان العرض</label>
                  <input
                    type="text"
                    value={config.offer_card_2.title}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        offer_card_2: { ...config.offer_card_2, title: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border text-xs bg-black/60 text-white focus:outline-none"
                    style={{ borderColor: 'var(--border-color)' }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">البادج الترويجي</label>
                    <input
                      type="text"
                      value={config.offer_card_2.badge || ''}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          offer_card_2: { ...config.offer_card_2, badge: e.target.value },
                        })
                      }
                      placeholder="حماية فائقة 🛡️"
                      className="w-full px-3 py-2 rounded-xl border text-xs bg-black/60 text-white focus:outline-none"
                      style={{ borderColor: 'var(--border-color)' }}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">نوع الوسائط</label>
                    <select
                      value={config.offer_card_2.media_type}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          offer_card_2: {
                            ...config.offer_card_2,
                            media_type: e.target.value as 'image' | 'video',
                          },
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl border text-xs bg-black/60 text-white focus:outline-none"
                      style={{ borderColor: 'var(--border-color)' }}
                    >
                      <option value="image">صورة (Image)</option>
                      <option value="video">فيديو (Video)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">رابط صورة/فيديو الخلفية</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={config.offer_card_2.media_url}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          offer_card_2: { ...config.offer_card_2, media_url: e.target.value },
                        })
                      }
                      className="flex-1 px-3 py-2 rounded-xl border text-xs bg-black/60 text-white focus:outline-none font-mono"
                      style={{ borderColor: 'var(--border-color)' }}
                    />
                    <button
                      type="button"
                      onClick={() => triggerUpload('card_2')}
                      disabled={uploadingTarget === 'card_2'}
                      className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded-xl text-xs font-bold"
                    >
                      {uploadingTarget === 'card_2' ? '...' : '📁'}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">رقم واتساب الحجز (مع كود الدولة)</label>
                  <input
                    type="text"
                    value={config.offer_card_2.whatsapp_number}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        offer_card_2: { ...config.offer_card_2, whatsapp_number: e.target.value },
                      })
                    }
                    placeholder="201223770207"
                    className="w-full px-3 py-2 rounded-xl border text-xs bg-black/60 text-white focus:outline-none font-mono"
                    style={{ borderColor: 'var(--border-color)' }}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">الرسالة التلقائية المجهزة لواتساب</label>
                  <textarea
                    rows={2}
                    value={config.offer_card_2.whatsapp_prefilled_text}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        offer_card_2: { ...config.offer_card_2, whatsapp_prefilled_text: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border text-xs bg-black/60 text-white focus:outline-none leading-relaxed"
                    style={{ borderColor: 'var(--border-color)' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* Section 3: Hero Banner 2 Settings */}
        {/* ===================================================================== */}
        <div
          className="border rounded-3xl p-6 space-y-5 backdrop-blur-md"
          style={{
            backgroundColor: 'var(--card-bg)',
            borderColor: 'var(--border-color)',
          }}
        >
          <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>3. البنر الثانوي (Hero Banner 2 - الضمانات وجودة الخامات)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                القسم السفلي الخاص بشرح معايير الجودة وسلامة طلاء وهيكل السيارات
              </p>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-slate-300 font-medium">إظهار النصوص</span>
              <input
                type="checkbox"
                checked={config.hero_section_2.show_overlay_text}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    hero_section_2: { ...config.hero_section_2, show_overlay_text: e.target.checked },
                  })
                }
                className="w-4 h-4 rounded text-red-600 focus:ring-red-500 bg-neutral-900 border-neutral-700"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">نوع الوسائط</label>
              <select
                value={config.hero_section_2.media_type}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    hero_section_2: {
                      ...config.hero_section_2,
                      media_type: e.target.value as 'image' | 'video',
                    },
                  })
                }
                className="w-full px-3.5 py-2.5 rounded-xl border text-xs bg-black/40 text-white focus:outline-none"
                style={{ borderColor: 'var(--border-color)' }}
              >
                <option value="image">صورة ثابتة (Static Image)</option>
                <option value="video">فيديو متكرر (Autoplay Loop Video)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">رابط الوسائط (URL أو رفع ملف)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={config.hero_section_2.media_url}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      hero_section_2: { ...config.hero_section_2, media_url: e.target.value },
                    })
                  }
                  className="flex-1 px-3.5 py-2.5 rounded-xl border text-xs bg-black/40 text-white focus:outline-none font-mono"
                  style={{ borderColor: 'var(--border-color)' }}
                />
                <button
                  type="button"
                  onClick={() => triggerUpload('hero_2')}
                  disabled={uploadingTarget === 'hero_2'}
                  className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded-xl text-xs font-bold shrink-0 transition-colors"
                >
                  {uploadingTarget === 'hero_2' ? '...' : '📁 رفع'}
                </button>
              </div>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-slate-300">العنوان الرئيسي</label>
              <input
                type="text"
                value={config.hero_section_2.title}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    hero_section_2: { ...config.hero_section_2, title: e.target.value },
                  })
                }
                className="w-full px-3.5 py-2.5 rounded-xl border text-xs bg-black/40 text-white focus:outline-none"
                style={{ borderColor: 'var(--border-color)' }}
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-slate-300">الوصف التفصيلي</label>
              <textarea
                rows={2}
                value={config.hero_section_2.subtitle}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    hero_section_2: { ...config.hero_section_2, subtitle: e.target.value },
                  })
                }
                className="w-full px-3.5 py-2.5 rounded-xl border text-xs bg-black/40 text-white focus:outline-none leading-relaxed"
                style={{ borderColor: 'var(--border-color)' }}
              />
            </div>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* Section 4: Global Header WhatsApp Phone Settings */}
        {/* ===================================================================== */}
        <div
          className="border rounded-3xl p-6 space-y-4 backdrop-blur-md"
          style={{
            backgroundColor: 'var(--card-bg)',
            borderColor: 'var(--border-color)',
          }}
        >
          <div className="pb-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
            <h3 className="text-sm font-bold text-white">4. رقم واتساب الترويسة الرئيسية (Top Header WhatsApp)</h3>
            <p className="text-xs text-slate-400 mt-0.5">الرقم المستخدم لزر التواصل السريع في أعلى شريط الموقع</p>
          </div>

          <div className="max-w-md space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">رقم الهاتف الدولي</label>
            <input
              type="text"
              value={config.whatsapp_header_number || '201223770207'}
              onChange={(e) =>
                setConfig({ ...config, whatsapp_header_number: e.target.value })
              }
              placeholder="201223770207"
              className="w-full px-3.5 py-2.5 rounded-xl border text-xs bg-black/40 text-white focus:outline-none font-mono"
              style={{ borderColor: 'var(--border-color)' }}
            />
          </div>
        </div>

        {/* Submit Action Button */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 text-white rounded-2xl text-xs font-bold shadow-xl transition-all hover:brightness-110 active:scale-95 cursor-pointer disabled:opacity-50"
            style={{
              backgroundColor: 'var(--color-primary)',
            }}
          >
            {saving ? 'جارٍ الحفظ والمزامنة...' : 'حفظ ونشر التعديلات'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default LandingSettingsTab;

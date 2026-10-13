import React, { useState, useEffect } from 'react';
import { servicesApi, inventoryApi, uploadApi } from '../../api/client.js';
import { Service, InventoryItem, RecipeItem } from '../../types/index.js';
import { getStoredServices } from '../../utils/serviceStorage.js';
import { getStoredInventory } from '../../utils/inventoryStorage.js';
import { useToast } from '../../components/Toast.js';
import Modal from '../../components/Modal.js';
import ConfirmModal from '../../components/ConfirmModal.js';
import { formatEGP, resolveMediaUrl } from '../../utils/formatters.js';
import { EmptyState, CardGridSkeleton, ErrorState } from '../../components/ui/index.js';

export const ServicesBomTab: React.FC = () => {
  const toast = useToast();
  const [services, setServices] = useState<Service[]>(() => getStoredServices());
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>(() => getStoredInventory());
  const [loading, setLoading] = useState(true);

  // Unified Service & BOM Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form State
  const [serviceForm, setServiceForm] = useState({
    name: '',
    price: 100.0,
    description: '',
    category: 'عام',
    egs_code: '',
    media_url: '',
    media_type: 'none' as 'none' | 'image' | 'video',
    status: 'active' as 'active' | 'inactive',
  });

  const [recipeRows, setRecipeRows] = useState<
    Array<{ inventory_item_id: string; quantity_grams: number; notes: string }>
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [showManualUrl, setShowManualUrl] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleMediaUpload = async (file: File) => {
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      toast.error('حجم الملف كبير جداً. الحد الأقصى 50 ميجابايت', 'خطأ في الحجم');
      return;
    }

    try {
      setUploadingMedia(true);
      const res = await uploadApi.uploadMedia(file);
      setServiceForm((prev) => ({
        ...prev,
        media_url: res.data.url,
        media_type: res.data.media_type,
      }));
      toast.success(
        `تم رفع وسائط الباقة (${res.data.filename}) بنجاح كـ ${res.data.media_type === 'video' ? 'فيديو' : 'صورة'}`,
        'تم الرفع'
      );
    } catch (err: any) {
      toast.error(err.message || 'فشل في رفع وسائط الباقة', 'خطأ في الرفع');
    } finally {
      setUploadingMedia(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [servicesData, inventoryData] = await Promise.all([
        servicesApi.getAll(undefined, true).catch(() => getStoredServices()),
        inventoryApi.getAll(false, true).catch(() => getStoredInventory()),
      ]);
      setServices(Array.isArray(servicesData) ? servicesData : getStoredServices());
      setInventoryItems(Array.isArray(inventoryData) ? inventoryData : getStoredInventory());
    } catch (err: any) {
      toast.error(err.message, 'تعذر تحميل الخدمات');
      setServices(getStoredServices());
      setInventoryItems(getStoredInventory());
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    fetchData();

    const handleServicesUpdate = () => {
      fetchData();
    };

    const handleInventoryUpdate = (e: any) => {
      if (e?.detail && Array.isArray(e.detail)) {
        setInventoryItems(e.detail);
      } else {
        fetchData();
      }
    };

    window.addEventListener('cw_services_updated', handleServicesUpdate);
    window.addEventListener('cw_inventory_updated', handleInventoryUpdate);
    window.addEventListener('storage', handleServicesUpdate);

    return () => {
      window.removeEventListener('cw_services_updated', handleServicesUpdate);
      window.removeEventListener('cw_inventory_updated', handleInventoryUpdate);
      window.removeEventListener('storage', handleServicesUpdate);
    };
  }, []);


  const handleOpenAddModal = () => {
    setSelectedService(null);
    setServiceForm({
      name: '',
      price: 100.0,
      description: '',
      category: 'عام',
      egs_code: '',
      media_url: '',
      media_type: 'none',
      status: 'active',
    });
    setRecipeRows([]);
    setShowManualUrl(false);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = async (service: Service) => {
    setSelectedService(service);
    setServiceForm({
      name: service.name,
      price: service.price,
      description: service.description || '',
      category: service.category || 'عام',
      egs_code: service.egs_code || '',
      media_url: service.media_url || '',
      media_type: (service.media_type as 'none' | 'image' | 'video') || 'none',
      status: (service.status as 'active' | 'inactive') || 'active',
    });
    setShowManualUrl(false);

    try {
      const recipes = await servicesApi.getRecipes(service.id);
      setRecipeRows(
        recipes.map((r: RecipeItem) => ({
          inventory_item_id: r.inventory_item_id,
          quantity_grams: r.quantity_grams,
          notes: r.notes || '',
        }))
      );
    } catch (err) {
      setRecipeRows([]);
    }

    setIsModalOpen(true);
  };

  const handleSaveUnifiedService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceForm.name.trim()) {
      toast.error('يرجى كتابة اسم خدمة الغسيل');
      return;
    }

    try {
      setSubmitting(true);
      let targetServiceId: string;

      if (selectedService) {
        const updated = await servicesApi.update(selectedService.id, {
          name: serviceForm.name,
          price: Number(serviceForm.price),
          description: serviceForm.description,
          category: serviceForm.category,
          egs_code: serviceForm.egs_code || undefined,
          media_url: serviceForm.media_url || undefined,
          media_type: serviceForm.media_type,
          status: serviceForm.status,
        });
        targetServiceId = updated.id;
      } else {
        const created = await servicesApi.create({
          name: serviceForm.name,
          price: Number(serviceForm.price),
          description: serviceForm.description,
          category: serviceForm.category,
          egs_code: serviceForm.egs_code || undefined,
          media_url: serviceForm.media_url || undefined,
          media_type: serviceForm.media_type,
          status: serviceForm.status,
        });
        targetServiceId = created.id;
      }

      // Filter and save BOM recipe rows
      const validRecipes = recipeRows
        .filter((r) => r.inventory_item_id && r.quantity_grams > 0)
        .map((r) => ({
          inventory_item_id: r.inventory_item_id,
          quantity_grams: Number(r.quantity_grams),
          notes: r.notes,
        }));

      await servicesApi.setRecipes(targetServiceId, validRecipes);

      toast.success(
        selectedService ? 'تم تحديث باقة الغسيل والمكونات بنجاح' : 'تم إضافة باقة الغسيل وتحديد استهلاك المواد بنجاح'
      );
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message, 'فشل حفظ الباقة');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!serviceToDelete) return;
    try {
      setIsDeleting(true);
      await servicesApi.delete(serviceToDelete.id);
      toast.success(`تم حذف باقة (${serviceToDelete.name}) بنجاح`);
      setServiceToDelete(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'تعذر حذف الباقة');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white">
            باقات الغسيل والمكونات بالجرام (Services & BOM Recipes)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            تحديد أسعار الغسيل بالجنيه وربط المواد الخام (صابون، واكس، معطر) بالجرام لكل سيارة
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2.5 text-white rounded-xl text-xs font-bold transition-all shadow-lg hover:brightness-110"
            style={{
              backgroundColor: 'var(--color-primary)',
            }}
          >
            إضافة باقة غسيل جديدة
          </button>

          <button
            onClick={fetchData}
            className="px-3 py-2 border text-slate-300 rounded-xl text-xs font-bold transition-all backdrop-blur-md hover:bg-white/5"
            style={{
              backgroundColor: 'var(--card-bg)',
              borderColor: 'var(--border-color)',
            }}
          >
            {loading ? 'جاري التحميل...' : 'تحديث'}
          </button>
        </div>
      </div>

      {/* Services Grid */}
      {loading ? (
        <CardGridSkeleton count={6} columns={3} />
      ) : services.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {services.map((service) => (

          <div
            key={service.id}
            className="border rounded-3xl p-5 shadow-xl flex flex-col justify-between backdrop-blur-md transition-all duration-300 hover:scale-[1.01]"
            style={{
              backgroundColor: 'var(--card-bg)',
              borderColor: 'var(--border-color)',
            }}
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="text-xs font-bold px-2.5 py-1 rounded-lg border"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      borderColor: 'var(--border-color)',
                      color: 'var(--color-primary)',
                    }}
                  >
                    {service.category || 'عام'}
                  </span>
                  {service.media_type && service.media_type !== 'none' && service.media_url && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      {service.media_type === 'video' ? 'فيديو خلفية' : 'صورة خلفية'}
                    </span>
                  )}
                  {service.egs_code ? (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-teal-500/10 text-teal-400 border border-teal-500/20">
                      {service.egs_code}
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      غير مكود ضريبياً
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      service.status === 'active' ? 'bg-emerald-500' : 'bg-slate-600'
                    }`}
                  />
                  <span className="text-[10px] text-slate-400">
                    {service.status === 'active' ? 'مفعلة' : 'معطلة'}
                  </span>
                </div>
              </div>

              <h4 className="text-lg font-bold text-slate-100 mb-1">{service.name}</h4>
              {service.description && (
                <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                  {service.description}
                </p>
              )}

              {/* BOM List */}
              <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-300">
                    استهلاك الجرامات (BOM):
                  </span>
                  <button
                    onClick={() => handleOpenEditModal(service)}
                    className="text-[11px] font-bold hover:underline transition-colors"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    تعديل الباقة والوصفة &larr;
                  </button>
                </div>

                <div
                  className="space-y-1.5 p-2.5 rounded-xl border"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.35)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  {service.recipes && service.recipes.length > 0 ? (
                    service.recipes.map((r, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-[11px] text-slate-300"
                      >
                        <span>
                          {r.inventory_name || 'مادة'}:
                        </span>
                        <span className="font-mono font-bold" style={{ color: 'var(--color-primary)' }}>
                          {r.quantity_grams} g
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-[11px] text-slate-500 text-center py-1">
                      لم يتم تحديد استهلاك مواد لهذه الخدمة
                    </div>
                  )}
                </div>

                {service.estimated_material_cost !== undefined && (
                  <div className="text-[10px] text-slate-400 mt-2 flex justify-between">
                    <span>تكلفة المواد التقديرية:</span>
                    <span className="font-mono text-slate-300 font-bold">
                      {formatEGP(service.estimated_material_cost)} / غسلة
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Price & Actions */}
            <div className="pt-4 mt-4 border-t flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
              <div className="font-mono text-2xl font-black" style={{ color: 'var(--color-primary)' }}>
                {formatEGP(service.price)}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleOpenEditModal(service)}
                  title="تعديل الباقة والوصفة"
                  className="px-2.5 py-1 text-xs font-bold border text-slate-300 rounded-xl transition-colors hover:bg-white/10"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  تعديل
                </button>

                <button
                  onClick={() => setServiceToDelete(service)}
                  title="حذف الخدمة"
                  className="px-2.5 py-1 text-xs font-bold bg-rose-950/40 hover:bg-rose-900 border border-rose-500/30 text-rose-400 rounded-xl transition-colors"
                >
                  حذف
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <EmptyState
        title="لا توجد باقات غسيل مسجلة"
        description="قم بإضافة باقات الغسيل وتحديد أسعارها والمواد الخام المستهلكة بالجرام لكل سيارة"
        actionLabel="إضافة باقة غسيل جديدة"
        onAction={handleOpenAddModal}
      />
    )}


      {/* Unified Modal: Add / Edit Service + BOM Recipes in One Screen */}
      <Modal

        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedService(null);
        }}
        title={selectedService ? `تعديل باقة الغسيل: ${selectedService.name}` : 'إضافة باقة غسيل جديدة ومكوناتها'}
        maxWidth="3xl"
      >
        <form onSubmit={handleSaveUnifiedService} className="space-y-5">
          {/* Section 1: Basic Service Information */}
          <div className="space-y-3">
            <div className="text-xs font-bold border-b pb-2" style={{ color: 'var(--color-primary)', borderColor: 'var(--border-color)' }}>
              1. البيانات الأساسية للخدمة
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  اسم الباقة / الخدمة
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: غسيل داخلي وخارجي بلس"
                  value={serviceForm.name}
                  onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
                  className="w-full border rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none transition-colors"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    borderColor: 'var(--border-color)',
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  سعر الخدمة النهائي (ج.م)
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  min={0}
                  placeholder="150"
                  value={serviceForm.price}
                  onChange={(e) =>
                    setServiceForm({ ...serviceForm, price: Number(e.target.value) })
                  }
                  className="w-full border rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono focus:outline-none transition-colors"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    borderColor: 'var(--border-color)',
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  التصنيف (Category)
                </label>
                <input
                  type="text"
                  placeholder="خارجي / شامل / VIP / تلميع"
                  value={serviceForm.category}
                  onChange={(e) => setServiceForm({ ...serviceForm, category: e.target.value })}
                  className="w-full border rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none transition-colors"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    borderColor: 'var(--border-color)',
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  حالة الخدمة
                </label>
                <select
                  value={serviceForm.status}
                  onChange={(e) =>
                    setServiceForm({
                      ...serviceForm,
                      status: e.target.value as 'active' | 'inactive',
                    })
                  }
                  className="w-full border rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none transition-colors"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  <option value="active">مفعلة في شاشة الكاشير</option>
                  <option value="inactive">معطلة مؤقتاً</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  وصف الخدمة ومراحلها
                </label>
                <input
                  type="text"
                  placeholder="مثال: غسيل بالرغوة، تنظيف الصالون، تلميع الكاوتش..."
                  value={serviceForm.description}
                  onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
                  className="w-full border rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none transition-colors"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    borderColor: 'var(--border-color)',
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  كود التكويد الضريبي (EGS / GS1 Code)
                </label>
                <input
                  type="text"
                  placeholder="مثال: EG-123456789-WASH01"
                  value={serviceForm.egs_code}
                  onChange={(e) => setServiceForm({ ...serviceForm, egs_code: e.target.value })}
                  className="w-full border rounded-xl px-3.5 py-2 text-xs text-slate-100 font-mono focus:outline-none transition-colors"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    borderColor: 'var(--border-color)',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Visual Media & Dynamic Background (Media/Banner) */}
          <div className="space-y-3 pt-2">
            <div className="text-xs font-bold border-b pb-2" style={{ color: 'var(--color-primary)', borderColor: 'var(--border-color)' }}>
              2. الوسائط المرئية للباقة (Media / Banner)
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setServiceForm({ ...serviceForm, media_type: 'none' })}
                className={`flex items-center justify-center py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                  serviceForm.media_type === 'none'
                    ? 'text-white'
                    : 'text-slate-400 hover:bg-white/5'
                }`}
                style={{
                  backgroundColor: serviceForm.media_type === 'none' ? 'var(--color-primary)' : 'rgba(0, 0, 0, 0.3)',
                  borderColor: 'var(--border-color)',
                }}
              >
                بدون وسائط
              </button>
              <button
                type="button"
                onClick={() => setServiceForm({ ...serviceForm, media_type: 'image' })}
                className={`flex items-center justify-center py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                  serviceForm.media_type === 'image'
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500 ring-1 ring-purple-500/30'
                    : 'text-slate-400 hover:bg-white/5'
                }`}
                style={{
                  backgroundColor: serviceForm.media_type === 'image' ? undefined : 'rgba(0, 0, 0, 0.3)',
                  borderColor: serviceForm.media_type === 'image' ? undefined : 'var(--border-color)',
                }}
              >
                صورة (Image)
              </button>
              <button
                type="button"
                onClick={() => setServiceForm({ ...serviceForm, media_type: 'video' })}
                className={`flex items-center justify-center py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                  serviceForm.media_type === 'video'
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500 ring-1 ring-sky-500/30'
                    : 'text-slate-400 hover:bg-white/5'
                }`}
                style={{
                  backgroundColor: serviceForm.media_type === 'video' ? undefined : 'rgba(0, 0, 0, 0.3)',
                  borderColor: serviceForm.media_type === 'video' ? undefined : 'var(--border-color)',
                }}
              >
                فيديو (MP4/WebM Loop)
              </button>
            </div>

            {serviceForm.media_type !== 'none' && (
              <div
                className="space-y-3 p-3.5 rounded-2xl border"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  borderColor: 'var(--border-color)',
                }}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleMediaUpload(file);
                  }}
                  accept="video/mp4,video/webm,image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                />

                {/* Direct Upload Button & Drop Box */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleMediaUpload(file);
                  }}
                  className="p-4 rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center group hover:bg-white/5"
                  style={{
                    borderColor: 'var(--border-color)',
                    backgroundColor: 'rgba(0, 0, 0, 0.2)',
                  }}
                >
                  {uploadingMedia ? (
                    <div className="flex items-center gap-2 py-2 text-xs font-bold" style={{ color: 'var(--color-primary)' }}>
                      <span className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin inline-block" />
                      <span>جاري رفع وسائط الباقة وحفظها...</span>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="text-xs font-bold text-slate-200 mb-1">
                        اضغط لاختيار فيديو أو صورة من جهازك، أو اسحب الملف هنا
                      </div>
                      <div className="text-[10px] text-slate-400">
                        يدعم MP4, WebM, JPG, PNG, WebP (بحد أقصى 50MB)
                      </div>
                    </div>
                  )}
                </div>

                {/* Manual Link Toggle */}
                <div className="flex items-center justify-between text-[11px] pt-1">
                  <button
                    type="button"
                    onClick={() => setShowManualUrl(!showManualUrl)}
                    className="hover:underline font-bold"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    {showManualUrl ? 'إخفاء حقل الرابط' : 'أو إدخال رابط خارجي يدوياً'}
                  </button>
                  {serviceForm.media_url && (
                    <span className="text-[10px] text-emerald-400 font-mono">
                      تم تعيين الرابط بنجاح
                    </span>
                  )}
                </div>

                {showManualUrl && (
                  <div className="space-y-1 animate-in fade-in-50">
                    <label className="block text-[11px] font-semibold text-slate-400">
                      {serviceForm.media_type === 'video'
                        ? 'رابط الفيديو المباشر (Direct Video MP4/WebM URL)'
                        : 'رابط الصورة المباشر (Direct Image URL)'}
                    </label>
                    <input
                      type="url"
                      placeholder={
                        serviceForm.media_type === 'video'
                          ? 'https://assets.mixkit.co/videos/preview/mixkit-car-wash-brush-cleaning-car-34861-large.mp4'
                          : 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=800&q=80'
                      }
                      value={serviceForm.media_url}
                      onChange={(e) => setServiceForm({ ...serviceForm, media_url: e.target.value })}
                      className="w-full border rounded-xl px-3.5 py-2 text-xs text-slate-100 font-mono focus:outline-none"
                      style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.4)',
                        borderColor: 'var(--border-color)',
                      }}
                    />
                  </div>
                )}

                {/* Live Preview Box */}
                {serviceForm.media_url.trim() && (
                  <div className="space-y-1.5 pt-2">
                    <div className="text-[11px] font-bold text-slate-400">
                      معاينة فورية لكارت الغسيل (Live Preview):
                    </div>
                    <div
                      className="relative h-40 w-full rounded-2xl overflow-hidden border flex items-center justify-center shadow-lg group"
                      style={{
                        borderColor: 'var(--border-color)',
                        backgroundColor: 'rgba(0, 0, 0, 0.6)',
                      }}
                    >
                      {serviceForm.media_type === 'video' ? (
                        <video
                          key={resolveMediaUrl(serviceForm.media_url)}
                          autoPlay
                          loop
                          muted
                          playsInline
                          className="absolute inset-0 w-full h-full object-cover opacity-60"
                        >
                          <source src={resolveMediaUrl(serviceForm.media_url)} type="video/mp4" />
                          <source src={resolveMediaUrl(serviceForm.media_url)} type="video/webm" />
                        </video>
                      ) : (
                        <img
                          key={resolveMediaUrl(serviceForm.media_url)}
                          src={resolveMediaUrl(serviceForm.media_url)}
                          alt="Preview"
                          className="absolute inset-0 w-full h-full object-cover opacity-60"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent pointer-events-none" />

                      <div className="relative z-10 w-full h-full p-4 flex flex-col justify-between">
                        <div className="flex justify-between items-center">
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-lg border backdrop-blur-sm"
                            style={{
                              backgroundColor: 'rgba(0, 0, 0, 0.6)',
                              borderColor: 'var(--border-color)',
                              color: 'var(--color-primary)',
                            }}
                          >
                            {serviceForm.category || 'عام'}
                          </span>
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-md font-bold border backdrop-blur-sm"
                            style={{
                              backgroundColor: 'rgba(255, 255, 255, 0.08)',
                              borderColor: 'var(--border-color)',
                              color: 'var(--color-primary)',
                            }}
                          >
                            معاينة مظهر الكارت
                          </span>
                        </div>
                        <div className="flex justify-between items-end">
                          <div>
                            <h5 className="text-sm font-bold text-white shadow-sm">
                              {serviceForm.name || 'اسم باقة الغسيل'}
                            </h5>
                            <p className="text-[10px] text-slate-300 line-clamp-1">
                              {serviceForm.description || 'وصف الخدمة ومميزاتها...'}
                            </p>
                          </div>
                          <div className="font-mono text-lg font-black" style={{ color: 'var(--color-primary)' }}>
                            {formatEGP(serviceForm.price)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 3: Integrated BOM Materials Recipe */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--border-color)' }}>
              <div className="text-xs font-bold" style={{ color: 'var(--color-primary)' }}>
                3. تحديد استهلاك المواد الخام بالجرام (BOM Recipe)
              </div>

              <button
                type="button"
                onClick={() =>
                  setRecipeRows([
                    ...recipeRows,
                    {
                      inventory_item_id: inventoryItems[0]?.id || '',
                      quantity_grams: 50,
                      notes: '',
                    },
                  ])
                }
                className="px-2.5 py-1 rounded-lg text-xs font-bold transition-all border hover:brightness-110"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--color-primary)',
                }}
              >
                إضافة مادة
              </button>
            </div>

            <div className="text-[11px] text-slate-400">
              اختر المواد التي تستهلكها هذه الغسلة وحدد عدد الجرامات ليتم خصمها تلقائياً من المخزن عند كل طلب.
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {recipeRows.length > 0 ? (
                recipeRows.map((row, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2.5 p-2.5 rounded-xl border"
                    style={{
                      backgroundColor: 'rgba(0, 0, 0, 0.4)',
                      borderColor: 'var(--border-color)',
                    }}
                  >
                    {/* Material Select */}
                    <div className="flex-1">
                      <select
                        value={row.inventory_item_id}
                        onChange={(e) => {
                          const updated = [...recipeRows];
                          updated[index].inventory_item_id = e.target.value;
                          setRecipeRows(updated);
                        }}
                        className="w-full border rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none"
                        style={{
                          backgroundColor: 'rgba(0, 0, 0, 0.4)',
                          borderColor: 'var(--border-color)',
                        }}
                      >
                        <option value="">-- اختر مادة خام --</option>
                        {inventoryItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} (متوفر: {item.current_stock_grams}g)
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Grams Quantity */}
                    <div
                      className="w-28 flex items-center gap-1 border rounded-lg px-2 py-1"
                      style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.4)',
                        borderColor: 'var(--border-color)',
                      }}
                    >
                      <input
                        type="number"
                        min={1}
                        step="any"
                        required
                        value={row.quantity_grams}
                        onChange={(e) => {
                          const updated = [...recipeRows];
                          updated[index].quantity_grams = Number(e.target.value);
                          setRecipeRows(updated);
                        }}
                        className="w-full bg-transparent text-xs font-mono text-slate-100 focus:outline-none text-left"
                      />
                      <span className="text-[10px] text-slate-400">g</span>
                    </div>

                    {/* Delete Row Button */}
                    <button
                      type="button"
                      onClick={() => {
                        const updated = recipeRows.filter((_, i) => i !== index);
                        setRecipeRows(updated);
                      }}
                      className="px-2 py-1 text-xs text-slate-400 hover:text-rose-400 rounded-lg hover:bg-white/5"
                    >
                      حذف
                    </button>
                  </div>
                ))
              ) : (
                <div
                  className="text-center py-4 text-xs text-slate-500 rounded-xl border border-dashed"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.2)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  لم يتم إضافة مواد بعد. اضغط على "إضافة مادة" لربط استهلاك الجرامات.
                </div>
              )}
            </div>
          </div>

          {/* Modal Footer Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 border text-slate-300 rounded-xl text-xs font-semibold hover:bg-white/5 transition-colors"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderColor: 'var(--border-color)',
              }}
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 text-white rounded-xl text-xs font-bold shadow-lg disabled:opacity-50 hover:brightness-110 transition-all"
              style={{
                backgroundColor: 'var(--color-primary)',
              }}
            >
              {submitting ? 'جاري الحفظ...' : 'حفظ الباقة والوصفة معاً'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!serviceToDelete}
        onClose={() => {
          if (!isDeleting) setServiceToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title="تأكيد حذف باقة الغسيل"
        message={`هل أنت متأكد من رغبتك في حذف باقة (${serviceToDelete?.name || ''}) نهائياً؟ سيتم إلغاء ربط مكونات الوصفة المرتبطة بها.`}
        confirmLabel="نعم، حذف الباقة"
        isLoading={isDeleting}
      />
    </div>
  );
};

export default ServicesBomTab;

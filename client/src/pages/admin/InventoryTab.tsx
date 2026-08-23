import React, { useState, useEffect } from 'react';
import {
  Package,
  Plus,
  ArrowDownToLine,
  Search,
  AlertTriangle,
  RefreshCw,
  Edit2,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { inventoryApi } from '../../api/client.js';
import { InventoryItem } from '../../types/index.js';
import { FALLBACK_INVENTORY } from '../../api/mockFallbacks.js';
import { getStoredInventory } from '../../utils/inventoryStorage.js';
import { useToast } from '../../components/Toast.js';
import Modal from '../../components/Modal.js';
import { formatEGP, formatGrams } from '../../utils/formatters.js';
import { EmptyState } from '../../components/ui/EmptyState.js';


export const InventoryTab: React.FC = () => {
  const toast = useToast();
  const [items, setItems] = useState<InventoryItem[]>(() => {
    const stored = getStoredInventory();
    return Array.isArray(stored) && stored.length > 0 ? stored : FALLBACK_INVENTORY;
  });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [lowStockFilter, setLowStockFilter] = useState(false);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  // Add/Edit Form State
  const [formData, setFormData] = useState({
    name: '',
    unit: 'gram',
    current_stock_grams: 50000,
    reorder_threshold_grams: 5000,
    cost_per_gram: 0.15,
    notes: '',
  });

  // Restock Form State
  const [restockGrams, setRestockGrams] = useState<number>(20000);
  const [restockCost, setRestockCost] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const fetchInventory = async () => {
    try {
      const data = await inventoryApi.getAll(lowStockFilter, true).catch(() => getStoredInventory());
      const valid = Array.isArray(data) && data.length > 0 ? data : getStoredInventory();
      setItems(lowStockFilter ? valid.filter((i) => i.is_low_stock) : valid);
    } catch {
      const stored = getStoredInventory();
      setItems(lowStockFilter ? stored.filter((i) => i.is_low_stock) : stored);
    }
  };


  useEffect(() => {
    fetchInventory();

    const handleInventoryUpdate = (e: any) => {
      if (e?.detail && Array.isArray(e.detail)) {
        setItems(lowStockFilter ? e.detail.filter((i: InventoryItem) => i.is_low_stock) : e.detail);
      } else {
        const fresh = getStoredInventory();
        setItems(lowStockFilter ? fresh.filter((i) => i.is_low_stock) : fresh);
      }
    };

    window.addEventListener('cw_inventory_updated', handleInventoryUpdate);
    window.addEventListener('storage', handleInventoryUpdate);

    return () => {
      window.removeEventListener('cw_inventory_updated', handleInventoryUpdate);
      window.removeEventListener('storage', handleInventoryUpdate);
    };
  }, [lowStockFilter]);


  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.warning('اسم المادة الخام مطلوب');
      return;
    }

    try {
      setSubmitting(true);
      if (selectedItem) {
        // Update
        await inventoryApi.update(selectedItem.id, formData);
        toast.success('تم تحديث بيانات المادة بنجاح');
      } else {
        // Create
        await inventoryApi.create(formData);
        toast.success('تم إضافة المادة الخام للمخزن بنجاح');
      }
      setIsAddModalOpen(false);
      setSelectedItem(null);
      fetchInventory();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    if (restockGrams <= 0) {
      toast.warning('يرجى تحديد كمية جرامات موجبة');
      return;
    }

    try {
      setSubmitting(true);
      await inventoryApi.restock(
        selectedItem.id,
        restockGrams,
        restockCost ? Number(restockCost) : undefined
      );
      toast.success(
        `تم توريد ${restockGrams.toLocaleString()} جرام لمادة (${selectedItem.name}) بنجاح!`,
        'تم التوريد'
      );
      setIsRestockModalOpen(false);
      setSelectedItem(null);
      setRestockGrams(20000);
      setRestockCost('');
      fetchInventory();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف مادة (${name}) من المخزون؟`)) return;
    try {
      await inventoryApi.delete(id);
      toast.success('تم حذف المادة بنجاح');
      fetchInventory();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const filteredItems = (items || []).filter((item) =>
    (item?.name || '').toLowerCase().includes(search.toLowerCase())
  );


  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Package className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
            <span>إدارة المخزون والمواد الخام بالجرام (BOM Inventory)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            متابعة دقيقة لأرصدة المنظفات والملمعات والواكس بالجرام، وتوريد النواقص
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSelectedItem(null);
              setFormData({
                name: '',
                unit: 'gram',
                current_stock_grams: 50000,
                reorder_threshold_grams: 5000,
                cost_per_gram: 0.15,
                notes: '',
              });
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 text-white rounded-xl text-xs font-bold transition-all shadow-lg hover:brightness-110"
            style={{
              backgroundColor: 'var(--color-primary)',
            }}
          >
            <Plus className="w-4 h-4" />
            <span>إضافة مادة خام جديدة</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border p-3 rounded-2xl backdrop-blur-md"
        style={{
          backgroundColor: 'var(--card-bg)',
          borderColor: 'var(--border-color)',
        }}
      >
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-500 absolute right-3 top-3" />
          <input
            type="text"
            placeholder="بحث عن مادة خام..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border rounded-xl pr-9 pl-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-colors"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              borderColor: 'var(--border-color)',
            }}
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={lowStockFilter}
              onChange={(e) => setLowStockFilter(e.target.checked)}
              className="rounded border-slate-700 bg-slate-950"
              style={{ accentColor: 'var(--color-primary)' }}
            />
            <span className="text-amber-400 font-semibold">عرض المواد المنخفضة فقط (Low Stock)</span>
          </label>

          <button
            onClick={fetchInventory}
            className="p-2 border text-slate-300 rounded-xl text-xs transition-colors hover:bg-white/5"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              borderColor: 'var(--border-color)',
            }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--color-primary)' }} />
          </button>
        </div>
      </div>

      {/* Inventory Table */}
      <div
        className="border rounded-3xl overflow-hidden shadow-xl backdrop-blur-md"
        style={{
          backgroundColor: 'var(--card-bg)',
          borderColor: 'var(--border-color)',
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead
              className="text-slate-400 border-b"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                borderColor: 'var(--border-color)',
              }}
            >
              <tr>
                <th className="py-3 px-4 font-semibold">اسم المادة الخام</th>
                <th className="py-3 px-4 font-semibold">الرصيد الحالي (جرام)</th>
                <th className="py-3 px-4 font-semibold">مستوى الأمان</th>
                <th className="py-3 px-4 font-semibold">حد إعادة الطلب</th>
                <th className="py-3 px-4 font-semibold">تكلفة الجرام</th>
                <th className="py-3 px-4 font-semibold">الحالة</th>
                <th className="py-3 px-4 font-semibold text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
              {filteredItems.length > 0 ? (
                filteredItems.map((item) => {
                  const stock = Number(item.current_stock_grams);
                  const threshold = Number(item.reorder_threshold_grams);
                  const isLow = stock <= threshold;
                  const percentage = Math.min(Math.round((stock / (threshold * 3)) * 100), 100);

                  return (
                    <tr key={item.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-100">
                        <div>{item.name}</div>
                        {item.notes && <div className="text-[10px] text-slate-500 font-normal">{item.notes}</div>}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-slate-200">
                        <span className="text-sm" style={{ color: 'var(--color-primary)' }}>{stock.toLocaleString()}</span>
                        <span className="text-[10px] text-slate-400 mr-1">g</span>
                        <span className="text-[10px] text-slate-500 block font-normal">
                          ({(stock / 1000).toFixed(2)} كجم)
                        </span>
                      </td>

                      <td className="py-3 px-4 w-40">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span className={isLow ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                              {isLow ? 'منخفض جداً' : 'متوفر بأمان'}
                            </span>
                            <span className="font-mono text-slate-400">{percentage}%</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}>
                            <div
                              className={`h-full rounded-full transition-all ${
                                isLow ? 'bg-rose-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-400">
                        {threshold.toLocaleString()} g
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-300">
                        {Number(item.cost_per_gram).toFixed(4)} ج.م/g
                      </td>

                      <td className="py-3 px-4">
                        {isLow ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                            <AlertTriangle className="w-3 h-3" />
                            طلب توريد
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            مستقر
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedItem(item);
                              setIsRestockModalOpen(true);
                            }}
                            title="توريد سريع وإضافة جرامات"
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all border hover:brightness-110"
                            style={{
                              backgroundColor: 'rgba(255, 255, 255, 0.08)',
                              borderColor: 'var(--border-color)',
                              color: 'var(--color-primary)',
                            }}
                          >
                            <ArrowDownToLine className="w-3.5 h-3.5" />
                            <span>توريد</span>
                          </button>

                          <button
                            onClick={() => {
                              setSelectedItem(item);
                              setFormData({
                                name: item.name,
                                unit: item.unit,
                                current_stock_grams: item.current_stock_grams,
                                reorder_threshold_grams: item.reorder_threshold_grams,
                                cost_per_gram: item.cost_per_gram,
                                notes: item.notes || '',
                              });
                              setIsAddModalOpen(true);
                            }}
                            title="تعديل المادة"
                            className="p-1.5 border text-slate-300 rounded-lg transition-colors hover:bg-white/10"
                            style={{
                              backgroundColor: 'rgba(255, 255, 255, 0.05)',
                              borderColor: 'var(--border-color)',
                            }}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDelete(item.id, item.name)}
                            title="حذف المادة"
                            className="p-1.5 bg-rose-950/40 hover:bg-rose-900 border border-rose-500/30 text-rose-400 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-8">
                    <EmptyState
                      compact
                      icon={<Package className="w-6 h-6 opacity-70" />}
                      title={search ? 'لا توجد نتائج مطابقة لبحثك' : 'لا توجد مواد خام مسجلة بالمخزن'}
                      description={search ? 'جرب البحث باسم مادة أخرى أو تفريغ حقل البحث' : 'اضغط على زر إضافة مادة خام لبدء تسجيل المواد'}
                      actionLabel={!search ? 'إضافة مادة خام جديدة' : undefined}
                      onAction={!search ? () => setIsAddModalOpen(true) : undefined}
                    />
                  </td>
                </tr>
              )}

            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add/Edit Raw Material */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setSelectedItem(null);
        }}
        title={selectedItem ? `تعديل مادة: ${selectedItem.name}` : 'إضافة مادة خام جديدة إلى المخزن'}
      >
        <form onSubmit={handleSaveItem} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              اسم المادة الخام
            </label>
            <input
              type="text"
              required
              placeholder="مثال: صابون رغوي فائق التركيز"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full border rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                borderColor: 'var(--border-color)',
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                الرصيد الابتدائي (جرام)
              </label>
              <input
                type="number"
                step="any"
                required
                value={formData.current_stock_grams}
                onChange={(e) =>
                  setFormData({ ...formData, current_stock_grams: Number(e.target.value) })
                }
                className="w-full border rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono focus:outline-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderColor: 'var(--border-color)',
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                حد إعادة الطلب (جرام)
              </label>
              <input
                type="number"
                step="any"
                required
                value={formData.reorder_threshold_grams}
                onChange={(e) =>
                  setFormData({ ...formData, reorder_threshold_grams: Number(e.target.value) })
                }
                className="w-full border rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono focus:outline-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderColor: 'var(--border-color)',
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                تكلفة الجرام الواحد (ج.م)
              </label>
              <input
                type="number"
                step="0.0001"
                required
                value={formData.cost_per_gram}
                onChange={(e) =>
                  setFormData({ ...formData, cost_per_gram: Number(e.target.value) })
                }
                className="w-full border rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono focus:outline-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderColor: 'var(--border-color)',
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                الوحدة
              </label>
              <input
                type="text"
                value="gram"
                disabled
                className="w-full border rounded-xl px-3.5 py-2 text-sm text-slate-500 font-mono"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.2)',
                  borderColor: 'var(--border-color)',
                }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              ملاحظات أو مواصفات
            </label>
            <textarea
              rows={2}
              placeholder="مثال: برميل 150 كجم، مورد شركة الصفا..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full border rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                borderColor: 'var(--border-color)',
              }}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
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
              className="px-5 py-2 text-white rounded-xl text-xs font-bold shadow-lg disabled:opacity-50 hover:brightness-110 transition-all"
              style={{
                backgroundColor: 'var(--color-primary)',
              }}
            >
              {submitting ? 'جاري الحفظ...' : 'حفظ المادة'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Quick Restock */}
      <Modal
        isOpen={isRestockModalOpen}
        onClose={() => {
          setIsRestockModalOpen(false);
          setSelectedItem(null);
        }}
        title={`توريد وزيادة رصيد: ${selectedItem?.name}`}
      >
        <form onSubmit={handleRestock} className="space-y-4">
          <div
            className="p-3.5 rounded-xl border text-xs text-slate-300 flex items-center justify-between"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              borderColor: 'var(--border-color)',
            }}
          >
            <span>الرصيد الحالي بالمخزن:</span>
            <span className="font-mono font-bold text-sm" style={{ color: 'var(--color-primary)' }}>
              {Number(selectedItem?.current_stock_grams).toLocaleString()} جرام
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              الكمية الموردة بوحدة الجرام
            </label>
            <input
              type="number"
              required
              min={1}
              step="any"
              value={restockGrams}
              onChange={(e) => setRestockGrams(Number(e.target.value))}
              className="w-full border rounded-xl px-3.5 py-2.5 text-base text-slate-100 font-mono focus:outline-none"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                borderColor: 'var(--border-color)',
              }}
            />
            <div className="text-[11px] text-slate-500 mt-1">
              تعادل تقريباً: {(restockGrams / 1000).toFixed(2)} كيلو جرام (KG)
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              تحديث سعر تكلفة الجرام (اختياري - في حال تغير السعر)
            </label>
            <input
              type="number"
              step="0.0001"
              placeholder={selectedItem ? String(selectedItem.cost_per_gram) : '0.15'}
              value={restockCost}
              onChange={(e) => setRestockCost(e.target.value)}
              className="w-full border rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono focus:outline-none"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                borderColor: 'var(--border-color)',
              }}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <button
              type="button"
              onClick={() => setIsRestockModalOpen(false)}
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
              className="px-5 py-2 text-white rounded-xl text-xs font-bold shadow-lg disabled:opacity-50 hover:brightness-110 transition-all"
              style={{
                backgroundColor: 'var(--color-accent)',
              }}
            >
              {submitting ? 'جاري التوريد...' : 'تأكيد التوريد والإضافة'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default InventoryTab;

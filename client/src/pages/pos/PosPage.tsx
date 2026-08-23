import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  RefreshCw,
  Layers,
  LogOut,
  Coins,
} from 'lucide-react';

import { servicesApi, hrApi, posApi, settingsApi } from '../../api/client.js';
import { Service, Employee, Order, PosSettings } from '../../types/index.js';
import { useToast } from '../../components/Toast.js';
import { resolveMediaUrl, formatDateTime } from '../../utils/formatters.js';
import { getStoredTheme } from '../../utils/theme.js';
import ServiceCard from './ServiceCard.js';
import OrderSummary from './OrderSummary.js';
import ThermalReceipt from '../../components/ThermalReceipt.js';
import ClockInOutModal from '../../components/ClockInOutModal.js';
import CashierLockModal from '../../components/CashierLockModal.js';
import ShiftCloseModal from '../../components/ShiftCloseModal.js';
import { EmptyState } from '../../components/ui/EmptyState.js';


export const PosPage: React.FC = () => {
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [services, setServices] = useState<Service[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [posSettings, setPosSettings] = useState<PosSettings>(() => getStoredTheme());
  const [loading, setLoading] = useState(true);

  // Cashier Session State
  const [activeCashier, setActiveCashier] = useState<{
    id: string;
    name: string;
    role: string;
    shift_start: string;
  } | null>(() => {
    try {
      const saved = localStorage.getItem('pos_active_cashier');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Filters & Selection
  const [selectedCategory, setSelectedCategory] = useState<string>('الكل');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedService, setSelectedService] = useState<Service | null>(null);

  // Form Fields
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [assignedEmployeeId, setAssignedEmployeeId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer'>('cash');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modals
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const [isClockModalOpen, setIsClockModalOpen] = useState(false);
  const [isShiftCloseModalOpen, setIsShiftCloseModalOpen] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [servicesData, employeesData, settingsData] = await Promise.all([
        servicesApi.getAll('active'),
        hrApi.getEmployees('active'),
        settingsApi.getPosSettings().catch(() => null),
      ]);
      setServices(servicesData);
      setEmployees(employeesData);
      if (settingsData) {
        setPosSettings(settingsData);
      }
    } catch (err: any) {
      toast.error(err.message, 'تعذر تحميل بيانات نقطة البيع');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Listen to live theme updates
    const handleSettingsUpdated = (e: any) => {
      if (e.detail) {
        setPosSettings(e.detail);
      }
    };
    window.addEventListener('pos-settings-updated', handleSettingsUpdated);
    return () => window.removeEventListener('pos-settings-updated', handleSettingsUpdated);
  }, []);

  // Guarantee video autoplay on mount/change
  useEffect(() => {
    if (posSettings?.pos_background_type === 'video' && videoRef.current) {
      videoRef.current.play().catch(() => {
        // Handled silently for autoplay policies
      });
    }
  }, [posSettings?.pos_background_url, posSettings?.pos_background_type]);

  // Categories list
  const categories = ['الكل', ...Array.from(new Set(services.map((s) => s.category || 'عام')))];

  // Filtered Services
  const filteredServices = services.filter((service) => {
    const matchesCategory = selectedCategory === 'الكل' || service.category === selectedCategory;
    const matchesSearch =
      service.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (service.description && service.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const handleOrderSubmit = async () => {
    if (!selectedService) {
      toast.warning('يرجى اختيار نوع الغسيل أولاً');
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await posApi.createOrder({
        service_id: selectedService.id,
        customer_name: customerName.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined,
        payment_method: paymentMethod,
        assigned_employee_id: assignedEmployeeId || undefined,
        notes: notes.trim() || undefined,
      });

      toast.success(
        `تم تسجيل الفاتورة (${result.data.order.order_code}) وخصم الجرامات بنجاح!`,
        'تمت العملية'
      );

      // Trigger thermal receipt
      setCompletedOrder(result.data.order);

      // Reset form
      setSelectedService(null);
      setCustomerName('');
      setCustomerPhone('');
      setNotes('');
    } catch (err: any) {
      toast.error(err.message, 'تعذر إتمام الفاتورة (نقص رصيد المواد بالمخزن)');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-5rem)] bg-transparent">
      {/* Global Dynamic POS Media Background (Video Loop or High-Res Image) */}
      {posSettings?.pos_background_type === 'video' && posSettings.pos_background_url ? (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden select-none">
          <video
            ref={videoRef}
            key={resolveMediaUrl(posSettings.pos_background_url)}
            src={resolveMediaUrl(posSettings.pos_background_url)}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="w-full h-full object-cover transition-opacity duration-700"
            style={{ opacity: posSettings.pos_background_opacity ?? 0.25 }}
          >
            <source src={resolveMediaUrl(posSettings.pos_background_url)} type="video/mp4" />
            <source src={resolveMediaUrl(posSettings.pos_background_url)} type="video/webm" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/45 to-slate-950/70 pointer-events-none" />
        </div>
      ) : posSettings?.pos_background_type === 'image' && posSettings.pos_background_url ? (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden select-none">
          <img
            key={resolveMediaUrl(posSettings.pos_background_url)}
            src={resolveMediaUrl(posSettings.pos_background_url)}
            alt="POS Background"
            className="w-full h-full object-cover transition-opacity duration-700"
            style={{ opacity: posSettings.pos_background_opacity ?? 0.25 }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/45 to-slate-950/70 pointer-events-none" />
        </div>
      ) : null}

      {/* Cashier PIN Lock Screen Overlay if no active session */}
      {!activeCashier && (
        <CashierLockModal
          isOpen={!activeCashier}
          employees={employees}
          onSuccess={(cashier) => {
            setActiveCashier(cashier);
            fetchData();
          }}
        />
      )}

      {/* Shift Close Modal (Z-Report) */}
      <ShiftCloseModal
        isOpen={isShiftCloseModalOpen}
        onClose={() => setIsShiftCloseModalOpen(false)}
        cashier={activeCashier}
        employees={employees}
        onShiftClosed={() => {
          setActiveCashier(null);
          fetchData();
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 relative z-10">
        {/* Thermal Receipt Preview Modal */}
        {completedOrder && (
          <ThermalReceipt order={completedOrder} onClose={() => setCompletedOrder(null)} />
        )}

        {/* Separate Check-out Modal */}
        <ClockInOutModal
          isOpen={isClockModalOpen}
          onClose={() => setIsClockModalOpen(false)}
          employees={employees}
          initialMode="check_out"
          onSuccess={fetchData}
        />

        {/* POS Top Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-black text-white flex items-center gap-2">
                <span>شاشة الكاشير والطلبات السريعة</span>
                <span
                  className="text-xs px-2.5 py-1 font-bold rounded-lg border backdrop-blur-md transition-all duration-300"
                  style={{
                    color: 'var(--color-primary)',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderColor: 'var(--color-primary)',
                  }}
                >
                  POS Live
                </span>
              </h1>

              {/* Active Cashier Badge */}
              {activeCashier && (
                <div
                  className="flex items-center gap-2 px-3 py-1 rounded-xl border backdrop-blur-md text-xs shadow-sm"
                  style={{
                    backgroundColor: 'var(--card-bg)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-bold text-slate-100">الكاشير: {activeCashier.name}</span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    ({new Date(activeCashier.shift_start).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })})
                  </span>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-300">
              اختر نوع الغسيل وحدد طريقة الدفع لإصدار الفاتورة وخصم الجرامات فورياً
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Separate Check-out Button (تسجيل إنصراف) */}
            <button
              type="button"
              onClick={() => setIsClockModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 border hover:brightness-110"
              style={{
                backgroundColor: 'rgba(225, 29, 72, 0.15)',
                borderColor: 'rgba(225, 29, 72, 0.4)',
                color: '#f43f5e',
              }}
              title="تسجيل إنصراف ونهاية دوام فني أو كاشير"
            >
              <LogOut className="w-4 h-4" />
              <span>تسجيل إنصراف (شفت)</span>
            </button>

            {/* End of Shift & Cash Drawer Close Button (تقفيل الشيفت وجرد الخزينة) */}
            <button
              type="button"
              onClick={() => setIsShiftCloseModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-xs font-bold transition-all shadow-lg active:scale-95 hover:brightness-110"
              style={{
                backgroundColor: 'var(--color-primary)',
              }}
              title="تقفيل الشيفت وجرد الخزينة النقدية والفيزا وطباعة تقرير Z-Report"
            >
              <Coins className="w-4 h-4" />
              <span>تقفيل الشيفت وجرد الخزينة</span>
            </button>

            {/* Quick Search */}
            <div className="relative w-full md:w-48">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                placeholder="بحث عن غسيل..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full backdrop-blur-md rounded-xl pr-9 pl-4 py-2 text-xs text-slate-100 placeholder-slate-400 focus:outline-none transition-colors border"
                style={{
                  backgroundColor: 'var(--card-bg)',
                  borderColor: 'var(--border-color)',
                }}
              />
            </div>

            <button
              onClick={fetchData}
              title="تحديث البيانات"
              className="p-2 backdrop-blur-md border text-slate-300 rounded-xl transition-colors shrink-0 hover:bg-white/5"
              style={{
                backgroundColor: 'var(--card-bg)',
                borderColor: 'var(--border-color)',
              }}
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
                style={{ color: 'var(--color-primary)' }}
              />
            </button>
          </div>
        </div>

        {/* Main Grid: Services (Left/Main) & Order Summary (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Services Selection Area (7 Columns on large screens) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Categories Tab Bar */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all backdrop-blur-md border ${
                    selectedCategory === cat
                      ? 'text-white shadow-lg'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  style={{
                    backgroundColor:
                      selectedCategory === cat
                        ? 'var(--color-primary)'
                        : 'var(--card-bg)',
                    borderColor:
                      selectedCategory === cat
                        ? 'var(--color-primary)'
                        : 'var(--border-color)',
                    boxShadow:
                      selectedCategory === cat
                        ? '0 4px 14px rgba(0, 0, 0, 0.35)'
                        : 'none',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Services Cards Grid */}
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="h-44 rounded-2xl border animate-pulse"
                    style={{
                      backgroundColor: 'var(--card-bg)',
                      borderColor: 'var(--border-color)',
                    }}
                  />
                ))}
              </div>
            ) : filteredServices.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredServices.map((service) => (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    isSelected={selectedService?.id === service.id}
                    onSelect={(s) => setSelectedService(s)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Layers className="w-8 h-8 opacity-80" />}
                title="لا توجد خدمات مطابقة"
                description="لم يتم العثور على خدمات غسيل تطابق خيارات البحث أو التصنيف المحدد"
                actionLabel="عرض كافة الخدمات"
                onAction={() => {
                  setSelectedCategory('الكل');
                  setSearchQuery('');
                }}
              />
            )}

          </div>

          {/* Order Details & Summary Side Panel (5 Columns on large screens) */}
          <div className="lg:col-span-5 lg:sticky lg:top-24">
            <OrderSummary
              selectedService={selectedService}
              employees={employees}
              customerName={customerName}
              setCustomerName={setCustomerName}
              customerPhone={customerPhone}
              setCustomerPhone={setCustomerPhone}
              assignedEmployeeId={assignedEmployeeId}
              setAssignedEmployeeId={setAssignedEmployeeId}
              paymentMethod={paymentMethod}
              setPaymentMethod={setPaymentMethod}
              notes={notes}
              setNotes={setNotes}
              onSubmit={handleOrderSubmit}
              isSubmitting={isSubmitting}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PosPage;

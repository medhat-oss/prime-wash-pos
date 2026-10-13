import React, { useState, useEffect, useRef } from 'react';
import { servicesApi, hrApi, posApi, settingsApi, isValidActiveShift } from '../../api/client.js';
import { Service, Employee, Order, PosSettings, ActiveShiftSession } from '../../types/index.js';
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
import { debounce } from '../../utils/eventBus.js';
import { getStoredServices } from '../../utils/serviceStorage.js';
import { getCustomStoredEmployees } from '../../utils/attendanceStorage.js';
import {
  getLocalCashierSession,
  saveLocalCashierSession,
  saveStoredActiveShiftSession,
  purgeZombieShifts,
} from '../../utils/shiftStorage.js';
import { getOrCreateDeviceId } from '../../utils/deviceStorage.js';
import PosSentinelBadge, { emitHeartbeatTick } from '../../components/PosSentinelBadge.js';

interface PosPageProps {
  onOwnerLogin?: (pin: string) => void;
  initialEmployees?: Employee[];
}

export const PosPage: React.FC<PosPageProps> = ({ onOwnerLogin, initialEmployees }) => {
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const clockedInCashierIdRef = useRef<string | null>(null);

  const [services, setServices] = useState<Service[]>(() => {
    const cached = getStoredServices('active');
    return cached && cached.length > 0 ? cached : getStoredServices();
  });
  const [employees, setEmployees] = useState<Employee[]>(() => {
    if (initialEmployees && initialEmployees.length > 0) {
      return initialEmployees;
    }
    const cached = getCustomStoredEmployees();
    return cached && cached.length > 0 ? cached : [];
  });
  const [posSettings, setPosSettings] = useState<PosSettings>(() => getStoredTheme());
  const [loading, setLoading] = useState<boolean>(() => {
    const cached = getStoredServices('active');
    return !cached || cached.length === 0;
  });

  // Keep employees in sync if parent passes updated initialEmployees
  useEffect(() => {
    if (initialEmployees && initialEmployees.length > 0) {
      setEmployees(initialEmployees);
    }
  }, [initialEmployees]);

  // Cashier Session State: Strictly derived from explicit local device PIN authentication
  const [activeCashier, setActiveCashier] = useState<ActiveShiftSession | null>(() => {
    return getLocalCashierSession();
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

  // Heartbeat Concurrency & Auto-Claim Mutex Refs (Thread-Safe, Zero Re-renders)
  const isHeartbeatRunningRef = useRef<boolean>(false);
  const autoClaimAttemptedRef = useRef<boolean>(false);

  const [isMobile, setIsMobile] = useState<boolean>(() => {
    return typeof window !== 'undefined' ? window.innerWidth < 768 : false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Decoupled independent data fetching streams: employee dropdown never blocks on services
  const fetchData = React.useCallback(async (isSilent = false) => {
    if (!isSilent && services.length === 0) setLoading(true);

    // Stream 1: Services catalog (heavy query with recipes)
    servicesApi
      .getAll('active', !isSilent)
      .then((servicesData) => {
        if (Array.isArray(servicesData) && servicesData.length > 0) {
          setServices(servicesData);
        }
      })
      .catch((err: any) => {
        if (!isSilent && services.length === 0) {
          toast.error(err.message, 'تعذر تحميل قائمة الخدمات');
        }
      })
      .finally(() => {
        setLoading(false);
      });

    // Stream 2: Active employees (fast query, critical for cashier selection & modals)
    hrApi
      .getEmployees('active', !isSilent)
      .then((employeesData) => {
        if (Array.isArray(employeesData) && employeesData.length > 0) {
          setEmployees(employeesData);
        }
      })
      .catch(() => {});

    // Stream 3: Theme and POS appearance settings
    settingsApi
      .getPosSettings(!isSilent)
      .then((settingsData) => {
        if (settingsData) {
          setPosSettings(settingsData);
        }
      })
      .catch(() => {});
  }, [services.length, toast]);

  useEffect(() => {
    fetchData(true);

    // Listen to live theme updates
    const handleSettingsUpdated = (e: any) => {
      if (e.detail) {
        setPosSettings(e.detail);
      }
    };

    // Listen to live employees updates
    const handleEmployeesUpdated = (e: any) => {
      if (e.detail && Array.isArray(e.detail) && e.detail.length > 0) {
        setEmployees(e.detail);
      }
    };

    const handleShiftUpdated = () => {
      try {
        const saved = getLocalCashierSession();
        setActiveCashier((prev) => {
          if (!prev && !saved) return null;
          if (!prev || !saved) return saved;
          const prevShiftId = prev.shift_id || prev.id;
          const savedShiftId = saved.shift_id || saved.id;
          const prevCashierId = prev.cashier_id || prev.id;
          const savedCashierId = saved.cashier_id || saved.id;
          if (
            prevShiftId === savedShiftId &&
            prevCashierId === savedCashierId &&
            prev.active_device_id === saved.active_device_id &&
            prev.status === saved.status
          ) {
            return prev; // Same reference -> React skips re-rendering PosPage!
          }
          return saved;
        });
      } catch {
        setActiveCashier(null);
      }
    };

    const handleSessionHijacked = () => {
      setActiveCashier(null);
      toast.warning(
        'تم تسجيل الدخول إلى هذا الشيفت من جهاز آخر، وتم تأمين هذه الشاشة لحماية العمليات.',
        'تم نقل الجلسة إلى جهاز آخر'
      );
    };

    const handleShiftClosedGlobally = () => {
      setActiveCashier(null);
      toast.warning(
        'تم إغلاق هذه الوردية من جهاز آخر، وتم تسجيل الخروج تلقائياً.',
        'تم إنهاء الوردية'
      );
    };

    const debouncedSilentFetch = debounce(() => fetchData(true), 500);

    window.addEventListener('pos-settings-updated', handleSettingsUpdated);
    window.addEventListener('cw_employees_updated', handleEmployeesUpdated);
    window.addEventListener('cw_services_updated', debouncedSilentFetch);
    window.addEventListener('cw_shifts_updated', handleShiftUpdated);
    window.addEventListener('cw_session_hijacked', handleSessionHijacked);
    window.addEventListener('cw_shift_closed_globally', handleShiftClosedGlobally);
    window.addEventListener('storage', handleShiftUpdated);

    return () => {
      debouncedSilentFetch.cancel();
      window.removeEventListener('pos-settings-updated', handleSettingsUpdated);
      window.removeEventListener('cw_employees_updated', handleEmployeesUpdated);
      window.removeEventListener('cw_services_updated', debouncedSilentFetch);
      window.removeEventListener('cw_shifts_updated', handleShiftUpdated);
      window.removeEventListener('cw_session_hijacked', handleSessionHijacked);
      window.removeEventListener('cw_shift_closed_globally', handleShiftClosedGlobally);
      window.removeEventListener('storage', handleShiftUpdated);
    };
  }, [fetchData, toast]);

  // Active Cashier Shift Heartbeat & Closure Sentinel (Thread-Safe 12s Heartbeat)
  useEffect(() => {
    if (!activeCashier) return;

    const checkAuthoritativeShift = async () => {
      // 1. Thread-Safe Mutex Lock: Prevent promise stacking and overlapping runs
      if (isHeartbeatRunningRef.current) {
        return;
      }
      isHeartbeatRunningRef.current = true;

      const nowStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const localDeviceId = getOrCreateDeviceId();

      try {
        const cloudShift = await posApi.getActiveShift(true);

        if (!isValidActiveShift(cloudShift)) {
          // If online and server confirms no active shift, force immediate lockout
          if (typeof navigator !== 'undefined' && navigator.onLine) {
            console.warn('[POS Heartbeat] Authoritative active shift is closed or null on server while online. Locking POS screen.');
            emitHeartbeatTick({
              lastCheck: nowStr,
              localId: localDeviceId.slice(-6),
              serverId: 'مغلق',
              status: 'mismatch',
            });
            saveLocalCashierSession(null);
            saveStoredActiveShiftSession(null);
            purgeZombieShifts();
            setActiveCashier(null);
            toast.warning(
              'تم إغلاق هذه الوردية من جهاز آخر، وتم تسجيل الخروج تلقائياً.',
              'تم إنهاء الوردية'
            );
            return;
          }
          return;
        }

        const cloudDevId = cloudShift.active_device_id || null;

        // 2. Strict Anti-Loop Guard: Auto-Claim runs STRICTLY ONCE per cashier session
        if (!cloudDevId && !autoClaimAttemptedRef.current && typeof navigator !== 'undefined' && navigator.onLine) {
          autoClaimAttemptedRef.current = true;
          posApi.startActiveShift({
            cashier_id: activeCashier?.cashier_id || activeCashier?.id,
            cashier_name: activeCashier?.cashier_name || activeCashier?.name,
            cashier_role: activeCashier?.cashier_role || activeCashier?.role,
            active_device_id: localDeviceId,
            shift_start: cloudShift.shift_start,
            opening_cash: Number(cloudShift.opening_cash) || 0,
          }).catch((claimErr) => {
            console.warn('[Auto-Claim on Null Device ID failed]', claimErr);
          });
        }

        const isDeviceMismatch = Boolean(cloudDevId && localDeviceId && cloudDevId !== localDeviceId);

        // 3. Emit event to isolated badge without triggering PosPage re-renders
        emitHeartbeatTick({
          lastCheck: nowStr,
          localId: localDeviceId.slice(-6),
          serverId: cloudDevId ? cloudDevId.slice(-6) : 'لا يوجد',
          status: isDeviceMismatch ? 'mismatch' : 'ok',
        });

        // Direct Hijack Safeguard: Shift was transferred/taken over by another device
        if (isDeviceMismatch) {
          console.warn(
            `[POS Heartbeat] Active shift transferred to another device (${cloudShift.active_device_id}). Current device: ${localDeviceId}. Locking terminal.`
          );
          saveLocalCashierSession(null);
          saveStoredActiveShiftSession(null);
          setActiveCashier(null);
          toast.warning(
            'تم تسجيل الدخول إلى هذا الشيفت من جهاز آخر، وتم تأمين هذه الشاشة لحماية العمليات.',
            'تم نقل الجلسة إلى جهاز آخر'
          );
          return;
        }
      } catch (hbErr: any) {
        const is500 = hbErr?.status === 500 || hbErr?.response?.status === 500;
        emitHeartbeatTick({
          lastCheck: `${nowStr} (${is500 ? 'خطأ 500' : 'غير متصل'})`,
          localId: localDeviceId.slice(-6),
          serverId: is500 ? 'خطأ 500' : null,
          status: 'error',
        });
      } finally {
        isHeartbeatRunningRef.current = false;
      }
    };

    // Initial background check with 2.5s grace period so fresh session takeover has time to propagate
    const initialCheckTimer = setTimeout(() => {
      checkAuthoritativeShift();
    }, 2500);

    const intervalId = setInterval(checkAuthoritativeShift, 12000);

    return () => {
      clearTimeout(initialCheckTimer);
      clearInterval(intervalId);
      isHeartbeatRunningRef.current = false;
    };
  }, [activeCashier?.shift_id || activeCashier?.id, toast]);


  // Video playback control (pauses video when modals are open or when on mobile)
  useEffect(() => {
    if (!videoRef.current) return;
    const isModalOpen = !activeCashier || isShiftCloseModalOpen || isClockModalOpen;
    if (isModalOpen || isMobile) {
      videoRef.current.pause();
    } else if (posSettings?.pos_background_type === 'video') {
      videoRef.current.play().catch(() => {});
    }
  }, [activeCashier, isShiftCloseModalOpen, isClockModalOpen, isMobile, posSettings?.pos_background_url, posSettings?.pos_background_type]);

  // Memoized categories list
  const categories = React.useMemo(() => {
    return ['الكل', ...Array.from(new Set(services.map((s) => s.category || 'عام')))];
  }, [services]);

  // Defer search value to prevent rapid keystrokes from blocking UI rendering
  const deferredSearchQuery = React.useDeferredValue(searchQuery);

  // Memoized filtered Services using deferredSearchQuery
  const filteredServices = React.useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase();
    return services
      .filter((service) => {
        if (!service || !service.name) return false;
        if ((service.status as any) === 'deleted' || service.status === 'inactive' || (service as any).is_deleted) {
          return false;
        }
        if (service.name.includes('متاتن') || service.name.includes('شيشيشيشيشي')) {
          return false;
        }
        return true;
      })
      .filter((service) => {
        const matchesCategory = selectedCategory === 'الكل' || service.category === selectedCategory;
        const matchesSearch =
          !query ||
          service.name.toLowerCase().includes(query) ||
          (service.description && service.description.toLowerCase().includes(query));
        return matchesCategory && matchesSearch;
      });
  }, [services, selectedCategory, deferredSearchQuery]);

  const handleSelectService = React.useCallback((service: Service) => {
    setSelectedService((prev) => (prev?.id === service.id ? null : service));
  }, []);

  // Keep latest form field values in a ref so handleOrderSubmit has stable identity
  const formValuesRef = useRef({
    customerName,
    customerPhone,
    paymentMethod,
    assignedEmployeeId,
    notes,
  });
  formValuesRef.current = {
    customerName,
    customerPhone,
    paymentMethod,
    assignedEmployeeId,
    notes,
  };

  const handleOrderSubmit = React.useCallback(async () => {
    if (!selectedService) {
      toast.warning('يرجى اختيار نوع الغسيل أولاً');
      return;
    }

    const {
      customerName: cName,
      customerPhone: cPhone,
      paymentMethod: pMethod,
      assignedEmployeeId: aEmpId,
      notes: oNotes,
    } = formValuesRef.current;

    try {
      setIsSubmitting(true);
      const result = await posApi.createOrder({
        service_id: selectedService.id,
        customer_name: cName.trim() || undefined,
        customer_phone: cPhone.trim() || undefined,
        payment_method: pMethod,
        assigned_employee_id: aEmpId || undefined,
        notes: oNotes.trim() || undefined,
        cashier_id: activeCashier?.cashier_id || activeCashier?.id || undefined,
        cashier_name: activeCashier?.cashier_name || activeCashier?.name || undefined,
        shift_id: activeCashier?.shift_id || activeCashier?.id || undefined,
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
      const errorMsg = err?.message || 'تعذر تسجيل الفاتورة';
      const isStockError = errorMsg.includes('رصيد') || errorMsg.includes('مخزن') || errorMsg.includes('نقص');
      toast.error(errorMsg, isStockError ? 'نقص رصيد المواد بالمخزن' : 'تعذر تسجيل الفاتورة');
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedService?.id, activeCashier?.cashier_id, activeCashier?.id, activeCashier?.shift_id, toast]);

  return (
    <div className="relative min-h-[calc(100vh-5rem)] bg-transparent overflow-x-hidden w-full max-w-full">
      {/* Global Dynamic POS Media Background (Video Loop or High-Res Image) */}
      {posSettings?.pos_background_type === 'video' && posSettings.pos_background_url && !isMobile ? (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden select-none gpu-accelerated">
          <video
            ref={videoRef}
            key={resolveMediaUrl(posSettings.pos_background_url)}
            src={resolveMediaUrl(posSettings.pos_background_url)}
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            className="w-full h-full object-cover transition-opacity duration-700"
            style={{ opacity: posSettings.pos_background_opacity ?? 0.25 }}
          >
            <source src={resolveMediaUrl(posSettings.pos_background_url)} type="video/mp4" />
            <source src={resolveMediaUrl(posSettings.pos_background_url)} type="video/webm" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/45 to-slate-950/70 pointer-events-none" />
        </div>
      ) : (posSettings?.pos_background_type === 'image' || (posSettings?.pos_background_type === 'video' && isMobile)) && posSettings?.pos_background_url ? (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden select-none gpu-accelerated">
          <img
            key={resolveMediaUrl(posSettings.pos_background_url)}
            src={resolveMediaUrl(posSettings.pos_background_url)}
            alt="POS Background"
            loading="lazy"
            decoding="async"
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
          onOwnerLogin={onOwnerLogin}
          onSuccess={(cashier) => {
            setActiveCashier(cashier);
            clockedInCashierIdRef.current = cashier.cashier_id || cashier.id || null;
            fetchData(true);
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
          saveLocalCashierSession(null);
          setActiveCashier(null);
          clockedInCashierIdRef.current = null;
          fetchData(true);
        }}
      />

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 relative z-10 overflow-x-hidden w-full max-w-full">
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
          onSuccess={() => fetchData(true)}
        />

        {/* POS Top Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6 w-full">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2 flex-wrap">
                <span>شاشة الكاشير والطلبات السريعة</span>
                <span
                  className="text-[10px] sm:text-xs px-2 sm:px-2.5 py-0.5 sm:py-1 font-bold rounded-lg border transition-all duration-300 font-mono whitespace-nowrap"
                  style={{
                    color: 'var(--color-primary)',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    borderColor: 'var(--color-primary)',
                  }}
                >
                  POS Live
                </span>
              </h1>

              {/* Active Cashier Badge */}
              {activeCashier && (
                <div
                  className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 rounded-xl border text-xs shadow-sm whitespace-nowrap"
                  style={{
                    backgroundColor: 'rgba(2, 6, 23, 0.85)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <span className="font-bold text-slate-100">الكاشير: {activeCashier.name}</span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    ({new Date(activeCashier.shift_start).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })})
                  </span>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-300 hidden sm:block">
              اختر نوع الغسيل وحدد طريقة الدفع لإصدار الفاتورة وخصم الجرامات فورياً
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap w-full md:w-auto">
            {/* Separate Check-out Button (تسجيل إنصراف) */}
            <button
              type="button"
              onClick={() => setIsClockModalOpen(true)}
              className="flex-1 sm:flex-initial px-3 sm:px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 border hover:brightness-110 whitespace-nowrap text-center"
              style={{
                backgroundColor: 'rgba(225, 29, 72, 0.15)',
                borderColor: 'rgba(225, 29, 72, 0.4)',
                color: '#f43f5e',
              }}
              title="تسجيل إنصراف ونهاية دوام فني أو كاشير"
            >
              تسجيل إنصراف (شفت)
            </button>

            {/* End of Shift & Cash Drawer Close Button (تقفيل الشيفت وجرد الخزينة) */}
            <button
              type="button"
              onClick={() => setIsShiftCloseModalOpen(true)}
              className="flex-1 sm:flex-initial px-3 sm:px-3.5 py-2 rounded-xl text-white text-xs font-bold transition-all shadow-lg active:scale-95 hover:brightness-110 whitespace-nowrap text-center"
              style={{
                backgroundColor: 'var(--color-primary)',
              }}
              title="تقفيل الشيفت وجرد الخزينة النقدية والفيزا وطباعة تقرير Z-Report"
            >
              تقفيل الشيفت وجرد الخزينة
            </button>

            {/* Quick Search */}
            <div className="relative w-full sm:w-48">
              <input
                type="text"
                placeholder="بحث عن غسيل..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-400 focus:outline-none transition-colors border"
                style={{
                  backgroundColor: 'rgba(2, 6, 23, 0.75)',
                  borderColor: 'var(--border-color)',
                }}
              />
            </div>

            <button
              onClick={() => fetchData(false)}
              title="تحديث البيانات"
              className="px-3 py-2 border text-slate-300 rounded-xl text-xs font-bold transition-colors shrink-0 hover:bg-white/5 whitespace-nowrap"
              style={{
                backgroundColor: 'rgba(2, 6, 23, 0.75)',
                borderColor: 'var(--border-color)',
              }}
            >
              {loading ? '...' : 'تحديث'}
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
                  className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                    selectedCategory === cat
                      ? 'text-white shadow-lg'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  style={{
                    backgroundColor:
                      selectedCategory === cat
                        ? 'var(--color-primary)'
                        : 'rgba(2, 6, 23, 0.75)',
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 contain-content">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 contain-content">
                {filteredServices.map((service) => (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    isSelected={selectedService?.id === service.id}
                    onSelect={handleSelectService}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
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

      {/* Real-Time Device Sentinel Telemetry (Floating Diagnostic Badge - Isolated State) */}
      <PosSentinelBadge />
    </div>
  );
};

export default PosPage;

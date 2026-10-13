import React, { useEffect, useState } from 'react';
import { dashboardApi, hrApi } from '../../api/client.js';
import { DashboardStats, MonthlyVatReport, MaterialConsumptionReport } from '../../types/index.js';
import { createZeroDashboardStats } from '../../api/mockFallbacks.js';
import { useToast } from '../../components/Toast.js';
import { formatEGP } from '../../utils/formatters.js';
import { EmptyState, CardGridSkeleton, ErrorState } from '../../components/ui/index.js';
import {
  getActiveAttendedHeadcount,
  getCustomStoredEmployees,
  getTodayDateStr,
  isOwnerEmployee,
} from '../../utils/attendanceStorage.js';
import { getStoredAllOrders } from '../../utils/orderStorage.js';
import { getStoredInventory } from '../../utils/inventoryStorage.js';
import {
  exportVatReportToExcel,
  exportVatReportToPdf,
  exportMaterialConsumptionToExcel,
  exportMaterialConsumptionToPdf,
} from '../../utils/reportExport.js';

import { debounce } from '../../utils/eventBus.js';

interface OverviewTabProps {
  onNavigateTab: (tab: string) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ onNavigateTab }) => {
  const toast = useToast();
  const [stats, setStats] = useState<DashboardStats>(createZeroDashboardStats);
  const [loading, setLoading] = useState(true);

  // Month & Year Filter for Reports
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth() + 1);

  // Export Loading States
  const [exportingVatExcel, setExportingVatExcel] = useState(false);
  const [exportingVatPdf, setExportingVatPdf] = useState(false);
  const [exportingMatExcel, setExportingMatExcel] = useState(false);
  const [exportingMatPdf, setExportingMatPdf] = useState(false);

  // Preview Modals
  const [previewVatModal, setPreviewVatModal] = useState<MonthlyVatReport | null>(null);
  const [previewMatModal, setPreviewMatModal] = useState<MaterialConsumptionReport | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const fetchStats = async (isSilent = false) => {
    try {
      if (!isSilent) {
        setLoading(true);
      }
      const [data] = await Promise.all([
        dashboardApi.getStats(!isSilent).catch(() => createZeroDashboardStats()),
        hrApi.getTodayAttendanceStatus(!isSilent).catch(() => null),
      ]);
      setStats(data || createZeroDashboardStats());
    } catch (err: any) {
      if (!isSilent) {
        toast.error(err.message, 'تعذر تحميل الإحصائيات');
      }
      setStats((prev) => (prev && prev.today && prev.today.today_orders_count > 0 ? prev : createZeroDashboardStats()));
    } finally {
      if (!isSilent) {
        setLoading(false);
      }
    }
  };

  const [attendanceVersion, setAttendanceVersion] = useState(0);

  useEffect(() => {
    fetchStats(false);

    const handleUpdates = () => {
      setAttendanceVersion((v) => v + 1);
      fetchStats(true);
    };

    const debouncedUpdates = debounce(handleUpdates, 600);

    window.addEventListener('cw_attendance_updated', debouncedUpdates);
    window.addEventListener('cw_inventory_updated', debouncedUpdates);
    window.addEventListener('cw_expenses_updated', debouncedUpdates);
    window.addEventListener('cw_services_updated', debouncedUpdates);
    window.addEventListener('cw_transactions_updated', debouncedUpdates);
    window.addEventListener('cw_payroll_updated', debouncedUpdates);
    window.addEventListener('cw_shifts_updated', debouncedUpdates);
    window.addEventListener('cw_orders_updated', debouncedUpdates);
    window.addEventListener('storage', debouncedUpdates);

    return () => {
      debouncedUpdates.cancel();
      window.removeEventListener('cw_attendance_updated', debouncedUpdates);
      window.removeEventListener('cw_inventory_updated', debouncedUpdates);
      window.removeEventListener('cw_expenses_updated', debouncedUpdates);
      window.removeEventListener('cw_services_updated', debouncedUpdates);
      window.removeEventListener('cw_transactions_updated', debouncedUpdates);
      window.removeEventListener('cw_payroll_updated', debouncedUpdates);
      window.removeEventListener('cw_shifts_updated', debouncedUpdates);
      window.removeEventListener('cw_orders_updated', debouncedUpdates);
      window.removeEventListener('storage', debouncedUpdates);
    };
  }, []);


  // Handlers for VAT Export
  const handleExportVat = async (format: 'excel' | 'pdf') => {
    try {
      if (format === 'excel') setExportingVatExcel(true);
      else setExportingVatPdf(true);

      const reportData = await dashboardApi.getMonthlyVatReport(selectedYear, selectedMonth);
      if (format === 'excel') {
        await exportVatReportToExcel(reportData);
        toast.success(`تم تصدير ملف إكسيل لإقرار ضريبة القيمة المضافة 14% لشهر (${reportData.period}) بنجاح`);
      } else {
        await exportVatReportToPdf(reportData);
        toast.success(`تم إنشاء ملف PDF لإقرار ضريبة القيمة المضافة 14% لشهر (${reportData.period}) بنجاح`);
      }
    } catch (err: any) {
      toast.error(err.message, 'فشل تصدير الإقرار الضريبي');
    } finally {
      setExportingVatExcel(false);
      setExportingVatPdf(false);
    }
  };

  // Handlers for Material Consumption Export
  const handleExportMaterial = async (format: 'excel' | 'pdf') => {
    try {
      if (format === 'excel') setExportingMatExcel(true);
      else setExportingMatPdf(true);

      const reportData = await dashboardApi.getMaterialConsumptionReport(selectedYear, selectedMonth);
      if (format === 'excel') {
        await exportMaterialConsumptionToExcel(reportData);
        toast.success(`تم تصدير سجل استهلاك المواد الخام إكسيل لشهر (${reportData.period}) بنجاح`);
      } else {
        await exportMaterialConsumptionToPdf(reportData);
        toast.success(`تم إنشاء ملف PDF لسجل استهلاك المواد الخام لشهر (${reportData.period}) بنجاح`);
      }
    } catch (err: any) {
      toast.error(err.message, 'فشل تصدير سجل استهلاك المواد الخام');
    } finally {
      setExportingMatExcel(false);
      setExportingMatPdf(false);
    }
  };

  // Quick Preview Handlers
  const handlePreviewVat = async () => {
    try {
      setLoadingPreview(true);
      const data = await dashboardApi.getMonthlyVatReport(selectedYear, selectedMonth);
      setPreviewVatModal(data);
    } catch (err: any) {
      toast.error(err.message, 'تعذر تحميل بيانات الإقرار الضريبي');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handlePreviewMaterial = async () => {
    try {
      setLoadingPreview(true);
      const data = await dashboardApi.getMaterialConsumptionReport(selectedYear, selectedMonth);
      setPreviewMatModal(data);
    } catch (err: any) {
      toast.error(err.message, 'تعذر تحميل سجل استهلاك المواد الخام');
    } finally {
      setLoadingPreview(false);
    }
  };



  // Real-time dynamic KPI metrics
  const todayDateStr = getTodayDateStr();
  const storedAll = getStoredAllOrders().filter(
    (o) =>
      o.created_at &&
      (getTodayDateStr(new Date(o.created_at)) === todayDateStr ||
        o.created_at.slice(0, 10) === todayDateStr) &&
      o.status !== 'cancelled'
  );
  const dynamicTodayRev = storedAll.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
  const dynamicOrdersCount = storedAll.length;

  const todayRevenue = (stats.today.today_revenue && stats.today.today_revenue > 0) ? stats.today.today_revenue : dynamicTodayRev;
  const todayOrders = (stats.today.today_orders_count && stats.today.today_orders_count > 0) ? stats.today.today_orders_count : dynamicOrdersCount;
  const todayWashes = (stats.today.today_completed_washes && stats.today.today_completed_washes > 0) ? stats.today.today_completed_washes : dynamicOrdersCount;

  const currentInv = getStoredInventory();
  const dynamicLowStock = currentInv.filter((i) => i.is_low_stock).length;
  const lowStockCount = stats.inventory.low_stock_count > 0 ? stats.inventory.low_stock_count : dynamicLowStock;

  const customEmployees = getCustomStoredEmployees();
  const operationalStaff = customEmployees.filter((e) => !isOwnerEmployee(e));
  const activeStaff = operationalStaff.length > 0 ? operationalStaff.length : Math.max(1, (stats.hr?.active_employees_count || 4));
  const localAttended = getActiveAttendedHeadcount(operationalStaff);
  const serverAttended = Number(stats?.hr?.attended_today_count || 0);
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const attendedStaff = (isOnline && stats?.hr?.attended_today_count !== undefined)
    ? serverAttended
    : localAttended;



  const monthNames = [
    'يناير (01)',
    'فبراير (02)',
    'مارس (03)',
    'أبريل (04)',
    'مايو (05)',
    'يونيو (06)',
    'يوليو (07)',
    'أغسطس (08)',
    'سبتمبر (09)',
    'أكتوبر (10)',
    'نوفمبر (11)',
    'ديسمبر (12)',
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white">لوحة المتابعة ونظرة عامة</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            ملخص الأداء المالي والتشغيلي لليوم ({new Date().toLocaleDateString('ar-EG')})
          </p>
        </div>
        <button
          onClick={() => fetchStats(false)}
          className="flex items-center gap-1.5 px-3.5 py-2 border text-slate-300 rounded-xl text-xs font-semibold transition-all backdrop-blur-md self-start sm:self-auto hover:bg-white/5"
          style={{
            backgroundColor: 'var(--card-bg)',
            borderColor: 'var(--border-color)',
          }}
        >
          {loading && (
            <span className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin ml-1" />
          )}
          <span>تحديث البيانات</span>
        </button>
      </div>

      {/* KPI Cards Grid */}
      {loading ? (
        <CardGridSkeleton count={4} columns={4} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Today's Revenue */}
        <div
          className="border p-5 rounded-3xl shadow-xl relative overflow-hidden backdrop-blur-md transition-all duration-300 hover:scale-[1.01]"
          style={{
            backgroundColor: 'var(--card-bg)',
            borderColor: 'var(--border-color)',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold" style={{ color: 'var(--color-primary)' }}>
              إيرادات اليوم
            </span>
          </div>
          <div className="font-mono text-3xl font-black text-white">
            {formatEGP(todayRevenue)}
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            <span>إجمالي المبيعات المكتملة لليوم</span>
          </div>
        </div>

        {/* Card 2: Today Washed Cars */}
        <div
          className="border p-5 rounded-3xl shadow-xl relative overflow-hidden backdrop-blur-md transition-all duration-300 hover:scale-[1.01]"
          style={{
            backgroundColor: 'var(--card-bg)',
            borderColor: 'var(--border-color)',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold" style={{ color: 'var(--color-primary)' }}>
              السيارات المغسولة
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-white">{todayWashes}</span>
            <span className="text-xs text-slate-400">من أصل {todayOrders} طلب</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            <span>نسبة الإنجاز: </span>
            <span className="font-bold" style={{ color: 'var(--color-primary)' }}>
              {todayOrders > 0 ? Math.round((todayWashes / todayOrders) * 100) : 0}%
            </span>
          </div>
        </div>

        {/* Card 3: Low Stock Alerts */}
        <div
          onClick={() => onNavigateTab('inventory')}
          className="cursor-pointer transition-all p-5 rounded-3xl shadow-xl relative overflow-hidden border backdrop-blur-md hover:scale-[1.01]"
          style={{
            backgroundColor: 'var(--card-bg)',
            borderColor: lowStockCount > 0 ? 'rgba(239, 68, 68, 0.5)' : 'var(--border-color)',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className={`text-xs font-bold ${lowStockCount > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
              نواقص المخزون (بالجرام)
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-white">{lowStockCount}</span>
            <span className="text-xs text-slate-400">مواد أوشكت على النفاد</span>
          </div>
          <div className="text-[11px] text-rose-400/90 mt-2 font-semibold">
            <span>انقر لإعادة التوريد السريع &larr;</span>
          </div>
        </div>

        {/* Card 4: Present Staff */}
        <div
          onClick={() => onNavigateTab('hr')}
          className="cursor-pointer transition-all border p-5 rounded-3xl shadow-xl relative overflow-hidden backdrop-blur-md hover:scale-[1.01] hover:border-emerald-500/40"
          style={{
            backgroundColor: 'var(--card-bg)',
            borderColor: 'var(--border-color)',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-emerald-400">
              الموظفين والشفتات
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{attendedStaff}</span>
            <span className="text-sm font-semibold text-slate-200">
              حاضر من <span className="text-white font-black">{activeStaff}</span> عمال تشغيل
            </span>
          </div>
          <div className="text-xs text-slate-300 mt-2 flex items-center justify-between font-medium">
            <span>إدارة الحضور وشفتات العمل</span>
            <span className="text-emerald-400 font-bold">&larr;</span>
          </div>
        </div>
      </div>
      )}


      {/* Low Stock Warning Banner if any */}
      {(() => {
        const depletedList = currentInv.filter(
          (i) => i.is_low_stock || Number(i.current_stock_grams) <= Number(i.reorder_threshold_grams)
        );
        const count = Math.max(lowStockCount, depletedList.length);
        if (count === 0) return null;

        return (
          <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-rose-950/50 via-red-900/30 to-neutral-900/80 border border-rose-500/50 shadow-2xl backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0 text-xl shadow-inner animate-pulse">
                ⚠️
              </div>
              <div>
                <div className="text-sm font-black text-rose-200 flex items-center gap-2">
                  <span>إنذار نفاد المخزون (BOM):</span>
                  <span className="bg-rose-500/30 text-rose-300 text-xs px-2 py-0.5 rounded-full border border-rose-500/40">
                    {count} مواد تحت حد الأمان
                  </span>
                </div>
                <div className="text-xs text-rose-300/90 mt-1.5 flex flex-wrap gap-2">
                  {depletedList.map((item) => (
                    <span
                      key={item.id}
                      className="bg-rose-950/90 text-rose-200 px-2.5 py-1 rounded-xl border border-rose-700/60 font-mono text-[11px] flex items-center gap-1.5 shadow-sm"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
                      <span className="font-sans font-bold text-slate-100">{item.name}:</span>
                      <span className="text-rose-300 font-bold">{Number(item.current_stock_grams).toLocaleString()} جم</span>
                      <span className="text-rose-400/70 text-[10px]">(حد الأمان: {Number(item.reorder_threshold_grams).toLocaleString()} جم)</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={() => onNavigateTab('inventory')}
              className="px-4 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white rounded-2xl text-xs font-black whitespace-nowrap transition-all shadow-lg shadow-rose-950/50 cursor-pointer flex items-center justify-center gap-2 self-start sm:self-auto hover:scale-105 active:scale-95 shrink-0"
            >
              <span>📦 توريد المخزن الآن</span>
              <span className="font-mono">&larr;</span>
            </button>
          </div>
        );
      })()}

      {/* ===================================================================== */}
      {/* SECTION: Tax Compliance & Raw Material Reports Export (ExcelJS & jsPDF) */}
      {/* ===================================================================== */}
      <div
        className="border rounded-3xl p-6 shadow-2xl backdrop-blur-md space-y-5"
        style={{
          backgroundColor: 'var(--card-bg)',
          borderColor: 'var(--border-color)',
        }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <span>التقارير الضريبية واستهلاك المخزون (Compliance & Material Exports)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                تصدير ملخص الإقرار الضريبي للقيمة المضافة (14%) وسجلات استهلاك المواد الخام بالجرام إلى Excel و PDF
              </p>
            </div>
          </div>

          {/* Month / Year Period Selector */}
          <div
            className="flex items-center gap-2 p-1.5 rounded-2xl border self-start lg:self-auto"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              borderColor: 'var(--border-color)',
            }}
          >
            <div className="flex items-center gap-1 text-xs text-slate-400 px-2 font-semibold">
              <span>فترة التقرير:</span>
            </div>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="border text-slate-200 text-xs rounded-xl px-2.5 py-1.5 font-bold outline-none cursor-pointer"
              style={{
                backgroundColor: 'rgba(24, 24, 27, 0.8)',
                borderColor: 'var(--border-color)',
              }}
            >
              {monthNames.map((name, idx) => (
                <option key={idx + 1} value={idx + 1}>
                  {name}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="border text-slate-200 text-xs rounded-xl px-2.5 py-1.5 font-mono font-bold outline-none cursor-pointer"
              style={{
                backgroundColor: 'rgba(24, 24, 27, 0.8)',
                borderColor: 'var(--border-color)',
              }}
            >
              {[currentDate.getFullYear() - 1, currentDate.getFullYear(), currentDate.getFullYear() + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Two Report Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Report 1: Monthly VAT 14% Declaration Summary */}
          <div
            className="p-5 rounded-2xl border space-y-4 transition-all shadow-lg"
            style={{
              backgroundColor: 'rgba(24, 24, 27, 0.75)',
              borderColor: 'var(--border-color)',
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-white">إقرار ضريبة القيمة المضافة 14% الشهري</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Monthly VAT 14% Declaration Summary & Audit Logs
                </p>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border border-red-950/80 bg-red-950/40 text-red-300 shrink-0">
                14% VAT
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              تقرير محاسبي وضريبي متكامل يتضمن وعاء الضريبة (Taxable Base)، إجمالي ضريبة 14%، تفصيل الفواتير حسب الخدمات وطرق الدفع، وتأكيد مطابقة الإيصال الإلكتروني.
            </p>

            <div className="flex items-center gap-2 pt-2 border-t flex-wrap" style={{ borderColor: 'var(--border-color)' }}>
              <button
                type="button"
                onClick={() => handleExportVat('pdf')}
                disabled={exportingVatPdf}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-red-700 hover:bg-red-600 active:bg-red-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-red-950/40 transition-all cursor-pointer"
              >
                <span>{exportingVatPdf ? 'جارٍ الإنشاء...' : 'تصدير PDF'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleExportVat('excel')}
                disabled={exportingVatExcel}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-900 border border-neutral-700 text-neutral-200 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
              >
                <span>{exportingVatExcel ? 'جارٍ التصدير...' : 'تصدير إكسيل (.xlsx)'}</span>
              </button>

              <button
                type="button"
                onClick={handlePreviewVat}
                disabled={loadingPreview}
                className="px-3 py-2.5 bg-neutral-900/60 hover:bg-neutral-800 text-neutral-300 rounded-xl text-xs font-bold border border-neutral-800 transition-all cursor-pointer disabled:opacity-50"
                title="معاينة سريعة"
              >
                <span>معاينة</span>
              </button>
            </div>
          </div>

          {/* Report 2: Raw Material Consumption Logs */}
          <div
            className="p-5 rounded-2xl border space-y-4 transition-all shadow-lg"
            style={{
              backgroundColor: 'rgba(24, 24, 27, 0.75)',
              borderColor: 'var(--border-color)',
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-white">سجل استهلاك المواد الخام (بالجرام)</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Raw Material Consumption & BOM Cost Analysis
                </p>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border border-red-950/80 bg-red-950/40 text-red-300 shrink-0">
                BOM in Grams
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              تقرير تشغيلي لحركة المخزون يوضح إجمالي الجرامات المستهلكة من كل مادة خام (شامبو، فوم، واكس...) وتكلفتها الإجمالية، وتفصيل استهلاك كل غسلة مسجلة.
            </p>

            <div className="flex items-center gap-2 pt-2 border-t flex-wrap" style={{ borderColor: 'var(--border-color)' }}>
              <button
                type="button"
                onClick={() => handleExportMaterial('pdf')}
                disabled={exportingMatPdf}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-red-700 hover:bg-red-600 active:bg-red-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-red-950/40 transition-all cursor-pointer"
              >
                <span>{exportingMatPdf ? 'جارٍ الإنشاء...' : 'تصدير PDF'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleExportMaterial('excel')}
                disabled={exportingMatExcel}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-900 border border-neutral-700 text-neutral-200 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
              >
                <span>{exportingMatExcel ? 'جارٍ التصدير...' : 'تصدير إكسيل (.xlsx)'}</span>
              </button>

              <button
                type="button"
                onClick={handlePreviewMaterial}
                disabled={loadingPreview}
                className="px-3 py-2.5 bg-neutral-900/60 hover:bg-neutral-800 text-neutral-300 rounded-xl text-xs font-bold border border-neutral-800 transition-all cursor-pointer disabled:opacity-50"
                title="معاينة سريعة"
              >
                <span>معاينة</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SECTION: Cashier & Staff Sales Breakdown (سجل مبيعات الكاشير والموظفين) */}
      {/* ===================================================================== */}
      <div
        className="border rounded-3xl p-6 shadow-xl backdrop-blur-md space-y-4"
        style={{
          backgroundColor: 'var(--card-bg)',
          borderColor: 'var(--border-color)',
        }}
      >
        <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <span>سجل مبيعات الكاشير والموظفين (Cashier & Staff Sales Performance)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                تتبع إجمالي المبيعات، عدد العمليات، والمبالغ المحصلة كاش وفيزا ومحافظ إلكترونية لكل كاشير وفني
              </p>
            </div>
          </div>
        </div>

        {stats.cashier_sales && stats.cashier_sales.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="text-slate-400 border-b" style={{ borderColor: 'var(--border-color)' }}>
                <tr>
                  <th className="py-2.5 px-3 font-semibold">الكاشير / الموظف</th>
                  <th className="py-2.5 px-3 font-semibold">المسمى الوظيفي</th>
                  <th className="py-2.5 px-3 font-semibold text-center">عدد العمليات</th>
                  <th className="py-2.5 px-3 font-semibold">إجمالي المبيعات</th>
                  <th className="py-2.5 px-3 font-semibold">النقدية (كاش)</th>
                  <th className="py-2.5 px-3 font-semibold">بطاقات وفيزا</th>
                  <th className="py-2.5 px-3 font-semibold">محافظ إلكترونية</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                {stats.cashier_sales.map((cs) => (
                  <tr key={cs.cashier_id} className="hover:bg-white/5 transition-colors font-mono">
                    <td className="py-3 px-3 font-sans font-bold text-slate-100">
                      {cs.cashier_name}
                    </td>
                    <td className="py-3 px-3 font-sans text-slate-400 text-[11px]">
                      {cs.cashier_role}
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-slate-200">
                      {cs.orders_count}
                    </td>
                    <td className="py-3 px-3 font-bold" style={{ color: 'var(--color-primary)' }}>
                      {formatEGP(cs.total_sales)}
                    </td>
                    <td className="py-3 px-3 text-emerald-400">
                      {formatEGP(cs.cash_sales)}
                    </td>
                    <td className="py-3 px-3 text-sky-400">
                      {formatEGP(cs.card_sales)}
                    </td>
                    <td className="py-3 px-3 text-purple-400">
                      {formatEGP(cs.transfer_sales)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-6 text-xs text-slate-500">
            لا توجد مبيعات مسجلة للموظفين بعد
          </div>
        )}
      </div>

      {/* Two Column Section: Top Services & Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Top Services Ranking */}
        <div
          className="lg:col-span-5 border rounded-3xl p-5 shadow-xl backdrop-blur-md transition-all duration-300"
          style={{
            backgroundColor: 'var(--card-bg)',
            borderColor: 'var(--border-color)',
          }}
        >
          <h3 className="font-bold text-sm text-slate-100 mb-4 flex items-center gap-2">
            <span>الخدمات الأكثر طلباً</span>
          </h3>
          <div className="space-y-3">
            {stats.top_services.length > 0 ? (
              stats.top_services.map((service, index) => (
                <div
                  key={service.id}
                  className="flex items-center justify-between p-3 rounded-xl border"
                  style={{
                    backgroundColor: 'rgba(2, 6, 23, 0.65)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center"
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        color: 'var(--color-primary)',
                      }}
                    >
                      {index + 1}
                    </span>
                    <div>
                      <div className="text-xs font-bold text-slate-100">{service.name}</div>
                      <div className="text-[10px] text-slate-400">{service.total_orders} غسلة مسجلة</div>
                    </div>
                  </div>
                  <div
                    className="text-left font-mono font-bold text-xs"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    {formatEGP(service.total_revenue)}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-xs text-slate-500">لا توجد مبيعات مسجلة حتى الآن</div>
            )}
          </div>
        </div>

        {/* Recent Orders Stream */}
        <div
          className="lg:col-span-7 border rounded-3xl p-5 shadow-xl backdrop-blur-md transition-all duration-300"
          style={{
            backgroundColor: 'var(--card-bg)',
            borderColor: 'var(--border-color)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              <span>آخر الفواتير والعمليات</span>
            </h3>
            <button
              onClick={() => onNavigateTab('orders')}
              className="text-xs hover:underline font-semibold"
              style={{ color: 'var(--color-primary)' }}
            >
              عرض الكل &larr;
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="text-slate-400 border-b" style={{ borderColor: 'var(--border-color)' }}>
                <tr>
                  <th className="pb-2 font-semibold">كود الفاتورة</th>
                  <th className="pb-2 font-semibold">اللوحة</th>
                  <th className="pb-2 font-semibold">الخدمة</th>
                  <th className="pb-2 font-semibold">المبلغ</th>
                  <th className="pb-2 font-semibold">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                {stats.recent_orders.length > 0 ? (
                  stats.recent_orders.map((order) => (
                    <tr key={order.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-2.5 font-mono text-slate-300 font-bold">{order.order_code}</td>
                      <td className="py-2.5 text-slate-200 font-mono">{order.car_plate || '-'}</td>
                      <td className="py-2.5 text-slate-300">{order.service_name}</td>
                      <td
                        className="py-2.5 font-mono font-bold"
                        style={{ color: 'var(--color-primary)' }}
                      >
                        {formatEGP(order.total_amount)}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            order.status === 'completed'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : order.status === 'in_progress'
                              ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {order.status === 'completed' ? 'مكتمل' : order.status === 'in_progress' ? 'قيد الغسيل' : order.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6">
                      <EmptyState
                        compact
                        title="لا توجد فواتير حديثة"
                        description="تظهر هنا الفواتير الصادرة حديثاً من الكاشير"
                      />
                    </td>
                  </tr>
                )}

              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* Modal: Quick Preview VAT Declaration */}
      {/* ===================================================================== */}
      {previewVatModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div
            className="border rounded-3xl max-w-2xl w-full p-6 space-y-6 shadow-2xl animate-scaleUp max-h-[90vh] overflow-y-auto"
            style={{
              backgroundColor: '#18181b',
              borderColor: 'var(--border-color)',
            }}
          >
            <div className="flex items-center justify-between pb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex items-center gap-3">
                <div>
                  <h3 className="text-base font-bold text-white">معاينة إقرار القيمة المضافة 14%</h3>
                  <p className="text-xs text-slate-400">الفترة الضريبية: {previewVatModal.period}</p>
                </div>
              </div>
              <button
                onClick={() => setPreviewVatModal(null)}
                className="px-3 py-1 rounded-xl text-slate-400 hover:text-white hover:bg-neutral-800 transition-colors text-xs font-bold cursor-pointer"
              >
                إغلاق
              </button>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-neutral-950 p-3.5 rounded-2xl border border-neutral-800">
                <div className="text-[11px] text-slate-400">إجمالي المبيعات (شامل الضريبة)</div>
                <div className="text-lg font-black text-white font-mono mt-1">
                  {formatEGP(previewVatModal.summary.total_sales_gross)}
                </div>
              </div>
              <div className="bg-neutral-950 p-3.5 rounded-2xl border border-neutral-800">
                <div className="text-[11px] text-slate-400">الصافي الخاضع (100/114)</div>
                <div className="text-lg font-black text-slate-200 font-mono mt-1">
                  {formatEGP(previewVatModal.summary.total_taxable_base)}
                </div>
              </div>
              <div className="bg-red-950/20 p-3.5 rounded-2xl border border-red-950/60">
                <div className="text-[11px] text-red-400 font-bold">ضريبة 14% المستحقة</div>
                <div className="text-lg font-black text-red-400 font-mono mt-1">
                  {formatEGP(previewVatModal.summary.total_vat_14)}
                </div>
              </div>
              <div className="bg-neutral-950 p-3.5 rounded-2xl border border-neutral-800">
                <div className="text-[11px] text-slate-400">إجمالي الفواتير المصدرة</div>
                <div className="text-lg font-black text-white font-mono mt-1">
                  {previewVatModal.summary.total_orders_count} فاتورة
                </div>
              </div>
              <div className="bg-neutral-950 p-3.5 rounded-2xl border border-neutral-800">
                <div className="text-[11px] text-slate-400">معتمدة بـ ETA</div>
                <div className="text-lg font-black text-slate-200 font-mono mt-1">
                  {previewVatModal.summary.eta_valid_count}
                </div>
              </div>
              <div className="bg-neutral-950 p-3.5 rounded-2xl border border-neutral-800">
                <div className="text-[11px] text-slate-400">الرقم الضريبي</div>
                <div className="text-xs font-bold text-slate-200 font-mono mt-2 truncate">
                  {previewVatModal.tax_registration_number}
                </div>
              </div>
            </div>

            {/* Service Breakdown mini table */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-300">مبيعات الخدمات خلال الفترة:</h4>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {previewVatModal.service_breakdown.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-2 rounded-xl bg-neutral-950 border border-neutral-800 text-xs">
                    <span className="text-slate-200 font-medium">{s.name} ({s.orders_count} غسلة)</span>
                    <div className="flex items-center gap-3 font-mono">
                      <span className="text-slate-400">صافي: {formatEGP(s.total_net)}</span>
                      <span className="text-red-400 font-bold">ضريبة: {formatEGP(s.total_vat)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <button
                onClick={() => setPreviewVatModal(null)}
                className="px-4 py-2 bg-neutral-900/60 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                إغلاق
              </button>
              <button
                onClick={async () => {
                  await exportVatReportToPdf(previewVatModal);
                  toast.success('تم تحميل ملف PDF');
                }}
                className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md shadow-red-950/40 transition-all"
              >
                <span>تحميل PDF</span>
              </button>
              <button
                onClick={async () => {
                  await exportVatReportToExcel(previewVatModal);
                  toast.success('تم تحميل ملف Excel');
                }}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <span>تحميل Excel</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* Modal: Quick Preview Raw Material Consumption */}
      {/* ===================================================================== */}
      {previewMatModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div
            className="border rounded-3xl max-w-2xl w-full p-6 space-y-6 shadow-2xl animate-scaleUp max-h-[90vh] overflow-y-auto"
            style={{
              backgroundColor: '#18181b',
              borderColor: 'var(--border-color)',
            }}
          >
            <div className="flex items-center justify-between pb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex items-center gap-3">
                <div>
                  <h3 className="text-base font-bold text-white">معاينة سجل استهلاك المواد الخام</h3>
                  <p className="text-xs text-slate-400">الفترة: {previewMatModal.period}</p>
                </div>
              </div>
              <button
                onClick={() => setPreviewMatModal(null)}
                className="px-3 py-1 rounded-xl text-slate-400 hover:text-white hover:bg-neutral-800 transition-colors text-xs font-bold cursor-pointer"
              >
                إغلاق
              </button>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-neutral-950 p-3.5 rounded-2xl border border-neutral-800">
                <div className="text-[11px] text-slate-400">الغسلات المكتملة</div>
                <div className="text-lg font-black text-white font-mono mt-1">
                  {previewMatModal.total_completed_washes} غسلة
                </div>
              </div>
              <div className="bg-neutral-950 p-3.5 rounded-2xl border border-neutral-800">
                <div className="text-[11px] text-slate-400">إجمالي الجرامات المستهلكة</div>
                <div className="text-lg font-black text-slate-200 font-mono mt-1">
                  {previewMatModal.total_grams_consumed.toLocaleString()} جم
                </div>
              </div>
              <div className="bg-red-950/20 p-3.5 rounded-2xl border border-red-950/60">
                <div className="text-[11px] text-red-400 font-bold">تكلفة المواد الخام الكلية</div>
                <div className="text-lg font-black text-red-400 font-mono mt-1">
                  {formatEGP(previewMatModal.total_cost_egp)}
                </div>
              </div>
            </div>

            {/* Materials List */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-300">تفصيل استهلاك المواد والمتبقي بالمخزن:</h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {previewMatModal.materials.map((m) => (
                  <div key={m.id} className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-xs">
                    <div>
                      <span className="text-slate-100 font-bold">{m.name}</span>
                      <div className="text-[10px] text-slate-400">
                        مستهلك: {m.total_consumed_grams} جرام ({formatEGP(m.total_consumed_cost)})
                      </div>
                    </div>
                    <div className="text-left font-mono">
                      <span className={`text-xs font-bold ${m.is_low_stock ? 'text-red-400' : 'text-slate-300'}`}>
                        المتبقي: {m.current_stock_grams} جم
                      </span>
                      {m.is_low_stock && (
                        <span className="block text-[9px] text-red-400 font-sans">تحت حد الأمان</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <button
                onClick={() => setPreviewMatModal(null)}
                className="px-4 py-2 bg-neutral-900/60 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                إغلاق
              </button>
              <button
                onClick={async () => {
                  await exportMaterialConsumptionToPdf(previewMatModal);
                  toast.success('تم تحميل ملف PDF');
                }}
                className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md shadow-red-950/40 transition-all"
              >
                <span>تحميل PDF</span>
              </button>
              <button
                onClick={async () => {
                  await exportMaterialConsumptionToExcel(previewMatModal);
                  toast.success('تم تحميل ملف Excel');
                }}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <span>تحميل Excel</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OverviewTab;

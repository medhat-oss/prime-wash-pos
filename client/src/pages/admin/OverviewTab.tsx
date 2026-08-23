import React, { useEffect, useState } from 'react';
import {
  DollarSign,
  Car,
  AlertTriangle,
  Users,
  TrendingUp,
  RefreshCw,
  Clock,
  ArrowUpRight,
  Droplets,
  FileSpreadsheet,
  FileText,
  Download,
  Calendar,
  ShieldCheck,
  Boxes,
  Eye,
  X,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import { dashboardApi } from '../../api/client.js';
import { DashboardStats, MonthlyVatReport, MaterialConsumptionReport } from '../../types/index.js';
import { FALLBACK_DASHBOARD_STATS } from '../../api/mockFallbacks.js';
import { useToast } from '../../components/Toast.js';
import { formatEGP } from '../../utils/formatters.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { getActiveAttendedHeadcount, getCustomStoredEmployees } from '../../utils/attendanceStorage.js';
import { getStoredAllOrders } from '../../utils/orderStorage.js';
import { getStoredInventory } from '../../utils/inventoryStorage.js';
import {
  exportVatReportToExcel,
  exportVatReportToPdf,
  exportMaterialConsumptionToExcel,
  exportMaterialConsumptionToPdf,
} from '../../utils/reportExport.js';

interface OverviewTabProps {
  onNavigateTab: (tab: string) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ onNavigateTab }) => {
  const toast = useToast();
  const [stats, setStats] = useState<DashboardStats>(FALLBACK_DASHBOARD_STATS);
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

  const fetchStats = async () => {
    try {
      setLoading(true);
      const data = await dashboardApi.getStats().catch(() => FALLBACK_DASHBOARD_STATS);
      setStats(data || FALLBACK_DASHBOARD_STATS);
    } catch (err: any) {
      toast.error(err.message, 'تعذر تحميل الإحصائيات');
      setStats(FALLBACK_DASHBOARD_STATS);
    } finally {
      setLoading(false);
    }
  };

  const [attendanceVersion, setAttendanceVersion] = useState(0);

  useEffect(() => {
    fetchStats();

    const handleUpdates = () => {
      setAttendanceVersion((v) => v + 1);
      fetchStats();
    };

    window.addEventListener('cw_attendance_updated', handleUpdates);
    window.addEventListener('cw_inventory_updated', handleUpdates);
    window.addEventListener('cw_expenses_updated', handleUpdates);
    window.addEventListener('cw_services_updated', handleUpdates);
    window.addEventListener('cw_transactions_updated', handleUpdates);
    window.addEventListener('cw_payroll_updated', handleUpdates);
    window.addEventListener('storage', handleUpdates);

    return () => {
      window.removeEventListener('cw_attendance_updated', handleUpdates);
      window.removeEventListener('cw_inventory_updated', handleUpdates);
      window.removeEventListener('cw_expenses_updated', handleUpdates);
      window.removeEventListener('cw_services_updated', handleUpdates);
      window.removeEventListener('cw_transactions_updated', handleUpdates);
      window.removeEventListener('cw_payroll_updated', handleUpdates);
      window.removeEventListener('storage', handleUpdates);
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
        exportVatReportToPdf(reportData);
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
        exportMaterialConsumptionToPdf(reportData);
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

  if (loading || !stats) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-slate-900/60 rounded-2xl border border-slate-800 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Real-time dynamic KPI metrics
  const todayDateStr = new Date().toISOString().slice(0, 10);
  const storedAll = getStoredAllOrders().filter(
    (o) => o.created_at && o.created_at.slice(0, 10) === todayDateStr && o.status !== 'cancelled'
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
  const activeStaff = (customEmployees && customEmployees.length > 0) ? customEmployees.length : (stats.hr.active_employees_count || 5);
  const attendedStaff = getActiveAttendedHeadcount(customEmployees);



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
          onClick={fetchStats}
          className="flex items-center gap-1.5 px-3.5 py-2 border text-slate-300 rounded-xl text-xs font-semibold transition-all backdrop-blur-md self-start sm:self-auto hover:bg-white/5"
          style={{
            backgroundColor: 'var(--card-bg)',
            borderColor: 'var(--border-color)',
          }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--color-primary)' }} />
          <span>تحديث البيانات</span>
        </button>
      </div>

      {/* KPI Cards Grid */}
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
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center border shadow-inner"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                borderColor: 'var(--border-color)',
                color: 'var(--color-primary)',
              }}
            >
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="font-mono text-3xl font-black text-white">
            {formatEGP(todayRevenue)}
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" style={{ color: 'var(--color-accent)' }} />
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
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center border shadow-inner"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                borderColor: 'var(--border-color)',
                color: 'var(--color-primary)',
              }}
            >
              <Car className="w-5 h-5" />
            </div>
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
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center border shadow-inner ${
                lowStockCount > 0 ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 'text-slate-400 border-slate-800'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-white">{lowStockCount}</span>
            <span className="text-xs text-slate-400">مواد أوشكت على النفاد</span>
          </div>
          <div className="text-[11px] text-rose-400/90 mt-2 flex items-center gap-1 font-semibold">
            <span>انقر لإعادة التوريد السريع</span>
            <ArrowUpRight className="w-3 h-3" />
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
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center border shadow-inner bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            >
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{attendedStaff}</span>
            <span className="text-sm font-semibold text-slate-200">
              حاضر من <span className="text-white font-black">{activeStaff}</span> موظف
            </span>
          </div>
          <div className="text-xs text-slate-300 mt-2 flex items-center justify-between font-medium">
            <span>إدارة الحضور وشفتات العمل</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
          </div>
        </div>
      </div>


      {/* Low Stock Warning Banner if any */}
      {lowStockCount > 0 && (
        <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-rose-200">
                تنبيه عاجل: المواد التالية بلغت حد إعادة الطلب الأدنى!
              </div>
              <div className="text-[11px] text-rose-400 mt-0.5 flex flex-wrap gap-2">
                {stats.inventory.low_stock_items.map((item) => (
                  <span key={item.id} className="bg-rose-950/80 px-2 py-0.5 rounded border border-rose-800 font-mono">
                    {item.name}: المتبقي ({item.current_stock_grams} جرام)
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('inventory')}
            className="px-3.5 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold whitespace-nowrap transition-colors"
          >
            توريد المخزن الآن
          </button>
        </div>
      )}

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
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
              <ShieldCheck className="w-5 h-5" />
            </div>
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
          <div className="flex items-center gap-2 bg-slate-950/60 p-1.5 rounded-2xl border border-slate-800/80 self-start lg:self-auto">
            <div className="flex items-center gap-1 text-xs text-slate-400 px-2 font-semibold">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>فترة التقرير:</span>
            </div>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-xl px-2.5 py-1.5 font-bold outline-none focus:border-emerald-500"
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
              className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-xl px-2.5 py-1.5 font-mono font-bold outline-none focus:border-emerald-500"
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
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900/90 to-slate-950/90 border border-emerald-500/20 space-y-4 hover:border-emerald-500/40 transition-all shadow-lg">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-100">إقرار ضريبة القيمة المضافة 14% الشهري</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Monthly VAT 14% Declaration Summary & Audit Logs
                  </p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                14% VAT
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              تقرير محاسبي وضريبي متكامل يتضمن وعاء الضريبة (Taxable Base)، إجمالي ضريبة 14%، تفصيل الفواتير حسب الخدمات وطرق الدفع، وتأكيد مطابقة الإيصال الإلكتروني.
            </p>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80 flex-wrap">
              <button
                type="button"
                onClick={() => handleExportVat('excel')}
                disabled={exportingVatExcel}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all"
              >
                <Download className={`w-3.5 h-3.5 ${exportingVatExcel ? 'animate-spin' : ''}`} />
                <span>{exportingVatExcel ? 'جارٍ التصدير...' : 'تصدير إكسيل (.xlsx)'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleExportVat('pdf')}
                disabled={exportingVatPdf}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 transition-all"
              >
                <FileText className={`w-3.5 h-3.5 ${exportingVatPdf ? 'animate-spin' : ''}`} />
                <span>{exportingVatPdf ? 'جارٍ الإنشاء...' : 'تصدير PDF'}</span>
              </button>

              <button
                type="button"
                onClick={handlePreviewVat}
                disabled={loadingPreview}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition-all"
                title="معاينة سريعة"
              >
                <Eye className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Report 2: Raw Material Consumption Logs */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900/90 to-slate-950/90 border border-sky-500/20 space-y-4 hover:border-sky-500/40 transition-all shadow-lg">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                  <Boxes className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-100">سجل استهلاك المواد الخام (بالجرام)</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Raw Material Consumption & BOM Cost Analysis
                  </p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                BOM in Grams
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              تقرير تشغيلي لحركة المخزون يوضح إجمالي الجرامات المستهلكة من كل مادة خام (شامبو، فوم، واكس...) وتكلفتها الإجمالية، وتفصيل استهلاك كل غسلة مسجلة.
            </p>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80 flex-wrap">
              <button
                type="button"
                onClick={() => handleExportMaterial('excel')}
                disabled={exportingMatExcel}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-teal-600/20 transition-all"
              >
                <Download className={`w-3.5 h-3.5 ${exportingMatExcel ? 'animate-spin' : ''}`} />
                <span>{exportingMatExcel ? 'جارٍ التصدير...' : 'تصدير إكسيل (.xlsx)'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleExportMaterial('pdf')}
                disabled={exportingMatPdf}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all"
              >
                <FileText className={`w-3.5 h-3.5 ${exportingMatPdf ? 'animate-spin' : ''}`} />
                <span>{exportingMatPdf ? 'جارٍ الإنشاء...' : 'تصدير PDF'}</span>
              </button>

              <button
                type="button"
                onClick={handlePreviewMaterial}
                disabled={loadingPreview}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition-all"
                title="معاينة سريعة"
              >
                <Eye className="w-4 h-4" />
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
            <div
              className="w-10 h-10 rounded-2xl border flex items-center justify-center shadow-inner"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                borderColor: 'var(--border-color)',
                color: 'var(--color-primary)',
              }}
            >
              <Users className="w-5 h-5" />
            </div>
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
            <Droplets className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
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
              <Clock className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
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
                        icon={<Clock className="w-5 h-5 opacity-70" />}
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
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-6 shadow-2xl animate-scaleUp max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">معاينة إقرار القيمة المضافة 14%</h3>
                  <p className="text-xs text-slate-400">الفترة الضريبية: {previewVatModal.period}</p>
                </div>
              </div>
              <button
                onClick={() => setPreviewVatModal(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                <div className="text-[11px] text-slate-400">إجمالي المبيعات (شامل الضريبة)</div>
                <div className="text-lg font-black text-white font-mono mt-1">
                  {formatEGP(previewVatModal.summary.total_sales_gross)}
                </div>
              </div>
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                <div className="text-[11px] text-slate-400">الصافي الخاضع (100/114)</div>
                <div className="text-lg font-black text-sky-400 font-mono mt-1">
                  {formatEGP(previewVatModal.summary.total_taxable_base)}
                </div>
              </div>
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-emerald-500/30 bg-emerald-950/10">
                <div className="text-[11px] text-emerald-400 font-bold">ضريبة 14% المستحقة</div>
                <div className="text-lg font-black text-emerald-400 font-mono mt-1">
                  {formatEGP(previewVatModal.summary.total_vat_14)}
                </div>
              </div>
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                <div className="text-[11px] text-slate-400">إجمالي الفواتير المصدرة</div>
                <div className="text-lg font-black text-white font-mono mt-1">
                  {previewVatModal.summary.total_orders_count} فاتورة
                </div>
              </div>
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                <div className="text-[11px] text-slate-400">معتمدة بـ ETA</div>
                <div className="text-lg font-black text-teal-400 font-mono mt-1">
                  {previewVatModal.summary.eta_valid_count}
                </div>
              </div>
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
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
                  <div key={s.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                    <span className="text-slate-200 font-medium">{s.name} ({s.orders_count} غسلة)</span>
                    <div className="flex items-center gap-3 font-mono">
                      <span className="text-slate-400">صافي: {formatEGP(s.total_net)}</span>
                      <span className="text-emerald-400 font-bold">ضريبة: {formatEGP(s.total_vat)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => setPreviewVatModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
              >
                إغلاق
              </button>
              <button
                onClick={() => {
                  exportVatReportToPdf(previewVatModal);
                  toast.success('تم تحميل ملف PDF');
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>تحميل PDF</span>
              </button>
              <button
                onClick={async () => {
                  await exportVatReportToExcel(previewVatModal);
                  toast.success('تم تحميل ملف Excel');
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
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
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-6 shadow-2xl animate-scaleUp max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
                  <Boxes className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">معاينة سجل استهلاك المواد الخام</h3>
                  <p className="text-xs text-slate-400">الفترة: {previewMatModal.period}</p>
                </div>
              </div>
              <button
                onClick={() => setPreviewMatModal(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                <div className="text-[11px] text-slate-400">الغسلات المكتملة</div>
                <div className="text-lg font-black text-white font-mono mt-1">
                  {previewMatModal.total_completed_washes} غسلة
                </div>
              </div>
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                <div className="text-[11px] text-slate-400">إجمالي الجرامات المستهلكة</div>
                <div className="text-lg font-black text-sky-400 font-mono mt-1">
                  {previewMatModal.total_grams_consumed.toLocaleString()} جم
                </div>
              </div>
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-emerald-500/30 bg-emerald-950/10">
                <div className="text-[11px] text-emerald-400 font-bold">تكلفة المواد الخام الكلية</div>
                <div className="text-lg font-black text-emerald-400 font-mono mt-1">
                  {formatEGP(previewMatModal.total_cost_egp)}
                </div>
              </div>
            </div>

            {/* Materials List */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-300">تفصيل استهلاك المواد والمتبقي بالمخزن:</h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {previewMatModal.materials.map((m) => (
                  <div key={m.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                    <div>
                      <span className="text-slate-100 font-bold">{m.name}</span>
                      <div className="text-[10px] text-slate-400">
                        مستهلك: {m.total_consumed_grams} جرام ({formatEGP(m.total_consumed_cost)})
                      </div>
                    </div>
                    <div className="text-left font-mono">
                      <span className={`text-xs font-bold ${m.is_low_stock ? 'text-rose-400' : 'text-slate-300'}`}>
                        المتبقي: {m.current_stock_grams} جم
                      </span>
                      {m.is_low_stock && (
                        <span className="block text-[9px] text-rose-400 font-sans">تحت حد الأمان</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => setPreviewMatModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
              >
                إغلاق
              </button>
              <button
                onClick={() => {
                  exportMaterialConsumptionToPdf(previewMatModal);
                  toast.success('تم تحميل ملف PDF');
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>تحميل PDF</span>
              </button>
              <button
                onClick={async () => {
                  await exportMaterialConsumptionToExcel(previewMatModal);
                  toast.success('تم تحميل ملف Excel');
                }}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
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

import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  Plus,
  Trash2,
  Edit2,
  Receipt,
  Wallet,
  HelpCircle,
  RefreshCw,
  Loader2,
  PieChart,
  CheckCircle2,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  ShieldAlert,
  RotateCcw,
} from 'lucide-react';
import { expensesApi, dashboardApi } from '../../api/client.js';
import { Expense, PnLSummary, CreateExpenseInput } from '../../types/index.js';
import { FALLBACK_PNL_SUMMARY } from '../../api/mockFallbacks.js';
import { useToast } from '../../components/Toast.js';
import Modal from '../../components/Modal.js';
import { formatEGP, formatDate } from '../../utils/formatters.js';
import { EmptyState } from '../../components/ui/EmptyState.js';




export const ExpensesTab: React.FC = () => {
  const toast = useToast();

  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth() + 1);

  const [pnl, setPnl] = useState<PnLSummary>(FALLBACK_PNL_SUMMARY);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('الكل');

  // Add / Edit Expense Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expenseForm, setExpenseForm] = useState<CreateExpenseInput>({
    title: '',
    category: 'إيجار',
    amount: '' as any,
    expense_date: new Date().toISOString().slice(0, 10),
    payment_method: 'cash',
    receipt_reference: '',
    notes: '',
  });

  // Deleting State
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Factory Reset State
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const handleExecuteFactoryReset = async () => {
    if (resetConfirmText.trim() !== 'CONFIRM' && resetConfirmText.trim() !== 'تأكيد') {
      toast.warning('يرجى كتابة كلمة (تأكيد) أو (CONFIRM) بشكل صحيح للمتابعة');
      return;
    }

    try {
      setIsResetting(true);
      const res = await dashboardApi.factoryReset();
      toast.success(res.message, 'تم تصفير البيانات بنجاح');
      setIsResetModalOpen(false);
      setResetConfirmText('');
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'تعذر تصفير البيانات', 'فشلت العملية');
    } finally {
      setIsResetting(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [pnlData, expensesList] = await Promise.all([
        expensesApi.getPnLSummary(selectedYear, selectedMonth, true),
        expensesApi.getExpenses({ year: selectedYear, month: selectedMonth }, true),
      ]);
      setPnl(pnlData || FALLBACK_PNL_SUMMARY);
      setExpenses(Array.isArray(expensesList) ? expensesList : []);
    } catch (err: any) {
      toast.error(err.message, 'تعذر تحميل بيانات الأرباح والمصروفات');
      setPnl(FALLBACK_PNL_SUMMARY);
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    fetchData();

    const handleExpensesUpdate = () => {
      fetchData();
    };

    window.addEventListener('cw_expenses_updated', handleExpensesUpdate);
    window.addEventListener('storage', handleExpensesUpdate);

    return () => {
      window.removeEventListener('cw_expenses_updated', handleExpensesUpdate);
      window.removeEventListener('storage', handleExpensesUpdate);
    };
  }, [selectedYear, selectedMonth]);

  const handleOpenAddModal = () => {
    setSelectedExpense(null);
    setExpenseForm({
      title: '',
      category: 'إيجار',
      amount: '' as any,
      expense_date: new Date().toISOString().slice(0, 10),
      payment_method: 'cash',
      receipt_reference: '',
      notes: '',
    });
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (exp: Expense) => {
    setSelectedExpense(exp);
    setExpenseForm({
      title: exp.title,
      category: exp.category,
      amount: exp.amount as any,
      expense_date: exp.expense_date ? exp.expense_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      payment_method: exp.payment_method || 'cash',
      receipt_reference: exp.receipt_reference || '',
      notes: exp.notes || '',
    });
    setIsAddModalOpen(true);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseForm.title.trim()) {
      toast.warning('يرجى إدخال بيان / عنوان المصروف');
      return;
    }
    if (!expenseForm.amount || Number(expenseForm.amount) <= 0) {
      toast.warning('يرجى إدخال مبلغ صحيح أكبر من الصفر');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        ...expenseForm,
        amount: Number(expenseForm.amount),
      };

      if (selectedExpense) {
        await expensesApi.updateExpense(selectedExpense.id, payload);
        toast.success('تم تعديل بيانات بند المصروف بنجاح!');
      } else {
        await expensesApi.createExpense(payload);
        toast.success('تم تسجيل بند المصروف بنجاح!');
      }

      setIsAddModalOpen(false);
      setSelectedExpense(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message, selectedExpense ? 'تعذر تعديل المصروف' : 'تعذر إضافة المصروف');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteExpense = async (id: string, title: string) => {
    if (!window.confirm(`هل أنت متأكد من رغبتك في حذف المصروف "${title}"؟`)) {
      return;
    }

    try {
      setDeletingId(id);
      await expensesApi.deleteExpense(id);
      toast.success('تم حذف المصروف بنجاح');
      fetchData();
    } catch (err: any) {
      toast.error(err.message, 'تعذر حذف المصروف');
    } finally {
      setDeletingId(null);
    }
  };


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

  const categories = [
    'إيجار',
    'كهرباء ومياه',
    'صيانة ومعدات',
    'أدوات ومواد نظافة',
    'بوفيه ومصاريف إدارية',
    'ضرائب ورسوم',
    'أخرى',
  ];

  const filteredExpenses = (expenses || []).filter(
    (exp) => categoryFilter === 'الكل' || exp.category === categoryFilter
  );


  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Add / Edit Expense Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setSelectedExpense(null);
        }}
        title={selectedExpense ? `تعديل بيانات المصروف: ${selectedExpense.title}` : 'تسجيل مصروف تشغيلي جديد'}
        maxWidth="md"
      >
        <form onSubmit={handleSaveExpense} className="space-y-4 text-xs">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              بيان / عنوان المصروف *
            </label>

            <input
              type="text"
              required
              placeholder="مثال: إيجار المحل لشهر أغسطس، صيانة مضخة الغسيل..."
              value={expenseForm.title}
              onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
              className="w-full border rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                borderColor: 'var(--border-color)',
              }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                تصنيف المصروف *
              </label>
              <select
                value={expenseForm.category}
                onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value as any })}
                className="w-full border rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none cursor-pointer"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  borderColor: 'var(--border-color)',
                }}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                المبلغ (بالجنيه المصري) *
              </label>
              <input
                type="number"
                step="any"
                min="0.01"
                required
                placeholder="مثال: 5000"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value as any })}
                className="w-full border rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-100 focus:outline-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  borderColor: 'var(--border-color)',
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                تاريخ الصرف *
              </label>
              <input
                type="date"
                required
                value={expenseForm.expense_date}
                onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  borderColor: 'var(--border-color)',
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                طريقة الدفع *
              </label>
              <select
                value={expenseForm.payment_method}
                onChange={(e) =>
                  setExpenseForm({ ...expenseForm, payment_method: e.target.value as any })
                }
                className="w-full border rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none cursor-pointer"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  borderColor: 'var(--border-color)',
                }}
              >
                <option value="cash">نقداً (كاش الخزينة)</option>
                <option value="card">فيزا / بطاقة بنكية</option>
                <option value="transfer">تحويل بنكي / محفظة</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              رقم الفاتورة / مرجع الإيصال (اختياري)
            </label>
            <input
              type="text"
              placeholder="مثال: REC-9921 / رقم العداد / إيصال المورد"
              value={expenseForm.receipt_reference || ''}
              onChange={(e) => setExpenseForm({ ...expenseForm, receipt_reference: e.target.value })}
              className="w-full border rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none font-mono"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                borderColor: 'var(--border-color)',
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              ملاحظات إضافية (اختياري)
            </label>
            <input
              type="text"
              placeholder="أي تفاصيل أخرى تخص هذا المصروف..."
              value={expenseForm.notes || ''}
              onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
              className="w-full border rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                borderColor: 'var(--border-color)',
              }}
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <button
              type="button"
              onClick={() => {
                setIsAddModalOpen(false);
                setSelectedExpense(null);
              }}
              className="px-4 py-2 border rounded-xl text-slate-400 hover:text-slate-200 font-bold transition-all"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderColor: 'var(--border-color)',
              }}
            >
              إلغاء
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-5 py-2 text-white rounded-xl font-bold shadow-lg transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
              style={{
                backgroundColor: 'var(--color-primary)',
              }}
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>{selectedExpense ? 'حفظ التعديلات' : 'حفظ المصروف'}</span>
            </button>
          </div>

        </form>
      </Modal>

      {/* Modal: Security Factory Reset Confirmation */}
      <Modal
        isOpen={isResetModalOpen}
        onClose={() => {
          if (!isResetting) setIsResetModalOpen(false);
        }}
        title="تصفير بيانات وسجلات المعاملات (Factory Reset)"
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          <div className="p-4 rounded-2xl bg-rose-950/50 border border-rose-500/40 text-rose-200 flex items-start gap-3">
            <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <div className="font-bold text-sm text-rose-300">تحذير أمني شديد الحساسية!</div>
              <p className="leading-relaxed">
                ستقوم هذه العملية بحذف وتصفير كافة سجلات المعاملات الفعلية بما في ذلك:
                <br />
                • كافة فواتير وطلبات المغسلة (Orders)
                <br />
                • سجلات المصروفات والتكاليف التشغيلية (Expenses)
                <br />
                • سجلات الحضور والانصراف وساعات العمل (Attendance)
                <br />
                • سندات صرف الرواتب والسلف والخصومات (Payroll & Transactions)
                <br />
                • إعادة ضبط أرصدة المواد الخام بالمخزن للقيم الافتراضية
                <br />
                <span className="text-white font-bold">
                  (ملاحظة: سيتم الحفاظ الكامل على قائمة الخدمات، الوصفات BOM، الموظفين، وإعدادات النظام)
                </span>
              </p>
            </div>
          </div>

          <div
            className="p-3.5 rounded-2xl border space-y-2"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              borderColor: 'var(--border-color)',
            }}
          >
            <label className="block text-xs font-semibold text-slate-300">
              للتأكيد والمتابعة، يرجى كتابة كلمة <strong className="text-rose-400 font-mono">تأكيد</strong> أو <strong className="text-rose-400 font-mono">CONFIRM</strong>:
            </label>
            <input
              type="text"
              placeholder="اكتب (تأكيد) أو (CONFIRM)..."
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              className="w-full border rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-bold focus:outline-none text-center font-mono"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                borderColor: 'var(--border-color)',
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setIsResetModalOpen(false)}
              disabled={isResetting}
              className="py-2.5 border rounded-xl text-slate-400 hover:text-slate-200 font-bold transition-all"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderColor: 'var(--border-color)',
              }}
            >
              إلغاء
            </button>

            <button
              type="button"
              onClick={handleExecuteFactoryReset}
              disabled={
                isResetting ||
                (resetConfirmText.trim() !== 'CONFIRM' && resetConfirmText.trim() !== 'تأكيد')
              }
              className="flex items-center justify-center gap-1.5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold shadow-lg shadow-rose-600/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isResetting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              <span>تأكيد التصفير النهائي</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Top Header & Month Selector */}
      <div
        className="p-5 rounded-3xl border shadow-xl backdrop-blur-md flex flex-col lg:flex-row lg:items-center justify-between gap-4"
        style={{
          backgroundColor: 'var(--card-bg)',
          borderColor: 'var(--border-color)',
        }}
      >
        <div className="flex items-center gap-3.5">
          <div
            className="w-12 h-12 rounded-2xl border flex items-center justify-center shadow-inner shrink-0"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderColor: 'var(--border-color)',
              color: 'var(--color-primary)',
            }}
          >
            <TrendingUp className="w-6 h-6" />
          </div>

          <div>
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <span>لوحة الحسابات والمصروفات الشهرية (Monthly P&L & Expenses)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              متابعة الإيرادات، الرواتب، المصروفات التشغيلية، وصافي الأرباح التقديرية بالجنيه المصري
            </p>
          </div>
        </div>

        {/* Period Selector & Action Button */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-2xl border backdrop-blur-md"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              borderColor: 'var(--border-color)',
            }}
          >
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-transparent text-slate-200 text-xs font-bold outline-none cursor-pointer"
            >
              {monthNames.map((name, idx) => (
                <option key={idx + 1} value={idx + 1} className="bg-slate-900 text-white">
                  {name}
                </option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent text-slate-200 text-xs font-mono font-bold outline-none cursor-pointer"
            >
              {[currentDate.getFullYear() - 1, currentDate.getFullYear(), currentDate.getFullYear() + 1].map(
                (y) => (
                  <option key={y} value={y} className="bg-slate-900 text-white">
                    {y}
                  </option>
                )
              )}
            </select>
          </div>

          <button
            type="button"
            onClick={handleOpenAddModal}
            className="flex items-center gap-1.5 px-4 py-2 text-white rounded-xl text-xs font-bold shadow-lg transition-all hover:brightness-110 active:scale-95"
            style={{
              backgroundColor: 'var(--color-primary)',
            }}
          >
            <Plus className="w-4 h-4" />
            <span>تسجيل مصروف جديد</span>
          </button>


          <button
            type="button"
            onClick={() => {
              setResetConfirmText('');
              setIsResetModalOpen(true);
            }}
            title="تصفير كافة سجلات المعاملات والفواتير مع الحفاظ على الكتالوج والموظفين"
            className="flex items-center gap-1.5 px-3 py-2 border border-rose-500/40 text-rose-400 bg-rose-950/20 hover:bg-rose-900/40 rounded-xl text-xs font-bold transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>تصفير سجلات المعاملات (Reset Data)</span>
          </button>

          <button
            onClick={fetchData}
            title="تحديث البيانات"
            className="p-2 border text-slate-300 rounded-xl transition-colors hover:bg-white/5"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
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

      {/* 4 Financial Scorecard Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        {/* 1. Total Gross Revenue */}
        <div className="flex flex-col justify-between p-4 rounded-3xl border border-emerald-500/30 bg-emerald-950/20 backdrop-blur-md shadow-sm">
          <div>
            <div className="flex items-center justify-between text-emerald-400 mb-1">
              <span className="font-bold text-xs">إجمالي الإيرادات (المبيعات)</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-emerald-400 font-mono mt-1">
              {formatEGP(pnl?.financials.gross_revenue || 0)}
            </div>
          </div>
          <div className="text-[11px] text-emerald-400/90 mt-3 pt-2 border-t border-emerald-500/20 flex items-center justify-between font-medium">
            <span>{pnl?.revenue_metrics.valid_orders || 0} غسلة مؤكدة</span>
            <span className="text-slate-300 font-mono">كاش الخزينة: {formatEGP(pnl?.revenue_metrics.cash_revenue || 0)}</span>
          </div>
        </div>

        {/* 2. Total Salaries (Dual Metric: Disbursed Cash vs Accrued Labor Cost) */}
        <div className="flex flex-col justify-between p-4 rounded-3xl border border-amber-500/30 bg-amber-950/20 backdrop-blur-md shadow-sm">
          <div>
            <div className="flex items-center justify-between text-amber-400 mb-1">
              <span className="font-bold text-xs">الرواتب ومسيرات العمال</span>
              <Wallet className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-amber-300 font-mono mt-1">
              {formatEGP(
                (pnl?.payroll_metrics.disbursed_salaries && pnl.payroll_metrics.disbursed_salaries > 0)
                  ? pnl.payroll_metrics.disbursed_salaries
                  : (pnl?.payroll_metrics.accrued_salaries || pnl?.financials.total_salaries || 0)
              )}
            </div>
          </div>
          <div className="text-[11px] text-slate-300 mt-3 pt-2 border-t border-amber-500/20 flex flex-col gap-1 font-medium">
            <div className="flex items-center justify-between">
              <span>تم صرف: {pnl?.payroll_metrics.disbursed_payouts_count || pnl?.payroll_metrics.payouts_count || 0} مسير من أصل {pnl?.payroll_metrics.active_staff_count || 4} عمال</span>
              <span className="text-amber-300 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10">
                {(pnl?.payroll_metrics.disbursed_salaries && pnl.payroll_metrics.disbursed_salaries > 0) ? 'منصرف فعلي' : 'مستحق لحظي'}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-400 font-mono text-[10px]">
              <span>متبقي في ذمة المغسلة:</span>
              <span className="text-amber-400 font-bold">{formatEGP(pnl?.payroll_metrics.unpaid_accrued_salaries || 0)}</span>
            </div>
          </div>
        </div>

        {/* 3. Operating Expenses */}
        <div className="flex flex-col justify-between p-4 rounded-3xl border border-rose-500/30 bg-rose-950/20 backdrop-blur-md shadow-sm">
          <div>
            <div className="flex items-center justify-between text-rose-400 mb-1">
              <span className="font-bold text-xs">المصروفات والإيجارات</span>
              <Receipt className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-2xl font-black text-rose-300 font-mono mt-1">
              {formatEGP(pnl?.financials.total_expenses || 0)}
            </div>
          </div>
          <div className="text-[11px] text-rose-400/90 mt-3 pt-2 border-t border-rose-500/20 flex items-center justify-between font-medium">
            <span>{pnl?.expenses_metrics.expenses_count || 0} بنود مسجلة</span>
            <span className="text-slate-300 font-mono">المدفوع كاش: {formatEGP(pnl?.expenses_metrics.cash_expenses || 0)}</span>
          </div>
        </div>

        {/* 4. Net Profit / Margin (Dual View: Cash Basis vs Accrual Basis) */}
        <div
          className={`flex flex-col justify-between p-4 rounded-3xl border backdrop-blur-md shadow-sm ${
            pnl?.financials.is_profitable
              ? 'border-emerald-500/40 bg-emerald-950/30'
              : 'border-rose-500/40 bg-rose-950/30'
          }`}
        >
          <div>
            <div
              className={`flex items-center justify-between mb-1 font-bold text-xs ${
                pnl?.financials.is_profitable ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              <span>صافي الربح الفعلي (Net Profit)</span>
              {pnl?.financials.is_profitable ? (
                <ArrowUpRight className="w-4 h-4 text-emerald-400" />
              ) : (
                <ArrowDownRight className="w-4 h-4 text-rose-400" />
              )}
            </div>
            <div
              className={`text-2xl font-black font-mono mt-1 ${
                pnl?.financials.is_profitable ? 'text-emerald-300' : 'text-rose-300'
              }`}
            >
              {formatEGP(pnl?.financials.cash_net_profit ?? pnl?.financials.net_profit ?? 0)}
            </div>
          </div>
          <div className="text-[11px] text-slate-300 mt-3 pt-2 border-t border-slate-700/40 flex flex-col gap-1 font-medium font-mono">
            <div className="flex items-center justify-between">
              <span>إجمالي التكاليف:</span>
              <span className="text-slate-200 font-bold">{formatEGP(pnl?.financials.total_operating_costs || 0)}</span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>هامش الربح:</span>
              <span className={`font-bold ${pnl?.financials.is_profitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                {pnl?.financials.cash_profit_margin ?? pnl?.financials.profit_margin ?? 0}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Middle Grid: Category Breakdown (5 Cols) & 6-Month Trend (7 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Expenses Category Distribution */}
        <div
          className="lg:col-span-5 border rounded-3xl p-5 shadow-xl backdrop-blur-md space-y-4"
          style={{
            backgroundColor: 'var(--card-bg)',
            borderColor: 'var(--border-color)',
          }}
        >
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border-color)' }}>
            <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              <PieChart className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
              <span>توزيع المصروفات حسب التصنيف</span>
            </h3>
            <span className="text-[10px] font-mono text-slate-400">
              إجمالي: {formatEGP(pnl?.financials.total_expenses || 0)}
            </span>
          </div>

          <div className="space-y-3">
            {pnl?.expenses_metrics.categories_breakdown &&
            pnl.expenses_metrics.categories_breakdown.length > 0 ? (
              pnl.expenses_metrics.categories_breakdown.map((item) => (
                <div key={item.category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-200">{item.category}</span>
                      <span className="text-[10px] text-slate-500 font-mono">({item.count})</span>
                    </div>
                    <div className="font-mono text-slate-300 font-bold">
                      {formatEGP(item.total_amount)}{' '}
                      <span className="text-[10px] text-slate-500 font-normal">({item.percentage}%)</span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-900/80 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(item.percentage, 100)}%`,
                        backgroundColor: 'var(--color-primary)',
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-xs text-slate-500">
                لا توجد مصروفات مسجلة لهذا الشهر
              </div>
            )}
          </div>
        </div>

        {/* 6-Month Trend Overview */}
        <div
          className="lg:col-span-7 border rounded-3xl p-5 shadow-xl backdrop-blur-md space-y-4"
          style={{
            backgroundColor: 'var(--card-bg)',
            borderColor: 'var(--border-color)',
          }}
        >
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border-color)' }}>
            <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
              <span>مؤشر الأرباح والمبيعات لآخر 6 أشهر</span>
            </h3>
            <span className="text-[10px] font-mono text-slate-400">مقارنة أداء نصف سنوي</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="text-slate-400 border-b" style={{ borderColor: 'var(--border-color)' }}>
                <tr>
                  <th className="py-2 px-3 font-semibold">الشهر</th>
                  <th className="py-2 px-3 font-semibold">الإيرادات</th>
                  <th className="py-2 px-3 font-semibold">الرواتب</th>
                  <th className="py-2 px-3 font-semibold">المصروفات</th>
                  <th className="py-2 px-3 font-semibold">صافي الربح</th>
                </tr>
              </thead>
              <tbody className="divide-y font-mono" style={{ borderColor: 'var(--border-color)' }}>
                {pnl?.six_months_trend && pnl.six_months_trend.length > 0 ? (
                  pnl.six_months_trend.map((row) => (
                    <tr key={row.month} className="hover:bg-white/5 transition-colors">
                      <td className="py-2.5 px-3 font-sans font-bold text-slate-200">
                        {row.month}
                      </td>
                      <td className="py-2.5 px-3 text-emerald-400">
                        {formatEGP(row.revenue)}
                      </td>
                      <td className="py-2.5 px-3 text-amber-300">
                        {formatEGP(row.payroll)}
                      </td>
                      <td className="py-2.5 px-3 text-rose-400">
                        {formatEGP(row.expenses)}
                      </td>
                      <td
                        className={`py-2.5 px-3 font-bold ${
                          row.net_profit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {row.net_profit >= 0 ? `+${formatEGP(row.net_profit)}` : formatEGP(row.net_profit)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="text-center py-4 text-slate-500">
                      لا توجد بيانات تاريخية متاحة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Expenses History Table Section */}
      <div
        className="border rounded-3xl overflow-hidden shadow-xl backdrop-blur-md space-y-3 p-5"
        style={{
          backgroundColor: 'var(--card-bg)',
          borderColor: 'var(--border-color)',
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
            <h3 className="font-black text-sm text-slate-100">
              سجل المصروفات المفصل لشهر ({pnl?.period || '-'})
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">تصفية حسب التصنيف:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="border rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                borderColor: 'var(--border-color)',
              }}
            >
              <option value="الكل">جميع التصنيفات</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

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
                <th className="py-3 px-4 font-semibold">التاريخ</th>
                <th className="py-3 px-4 font-semibold">بيان المصروف</th>
                <th className="py-3 px-4 font-semibold">التصنيف</th>
                <th className="py-3 px-4 font-semibold">المبلغ (ج.م)</th>
                <th className="py-3 px-4 font-semibold">طريقة الدفع</th>
                <th className="py-3 px-4 font-semibold">رقم الإيصال</th>
                <th className="py-3 px-4 font-semibold">ملاحظات</th>
                <th className="py-3 px-4 font-semibold text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
              {filteredExpenses.length > 0 ? (
                filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                      {formatDate(exp.expense_date)}
                    </td>

                    <td className="py-3 px-4 font-bold text-slate-100">
                      {exp.title}
                    </td>

                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                        <span>{exp.category}</span>
                      </span>
                    </td>

                    <td className="py-3 px-4 font-mono font-bold text-rose-400">
                      {formatEGP(exp.amount)}
                    </td>

                    <td className="py-3 px-4 text-slate-300">
                      {exp.payment_method === 'cash'
                        ? 'كاش (خزينة)'
                        : exp.payment_method === 'card'
                        ? 'فيزا وبطاقة'
                        : 'تحويل / محفظة'}
                    </td>

                    <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                      {exp.receipt_reference || '-'}
                    </td>

                    <td className="py-3 px-4 text-slate-400 text-[11px]">
                      {exp.notes || '-'}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(exp)}
                          title="تعديل بيانات المصروف"
                          className="p-1.5 border border-sky-500/30 text-sky-400 bg-sky-950/20 hover:bg-sky-900/50 rounded-lg transition-colors active:scale-95"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteExpense(exp.id, exp.title)}
                          disabled={deletingId === exp.id}
                          title="حذف المصروف"
                          className="p-1.5 border border-rose-500/30 text-rose-400 bg-rose-950/20 hover:bg-rose-900/50 rounded-lg transition-colors disabled:opacity-50 active:scale-95"
                        >
                          {deletingId === exp.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-8">
                    <EmptyState
                      compact
                      icon={<Receipt className="w-6 h-6 opacity-70" />}
                      title="لا توجد مصروفات مسجلة لهذا الشهر"
                      description="سجل مصروفات المغسلة من فواتير كهرباء، إيجار، صيانة، ومواد تشغيل"
                      actionLabel="تسجيل مصروف جديد"
                      onAction={handleOpenAddModal}
                    />
                  </td>
                </tr>
              )}


            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ExpensesTab;

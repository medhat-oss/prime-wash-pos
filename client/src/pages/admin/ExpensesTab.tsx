import React, { useState, useEffect, useCallback, useRef } from 'react';
import { expensesApi, dashboardApi } from '../../api/client.js';
import { Expense, PnLSummary, CreateExpenseInput } from '../../types/index.js';
import { createZeroPnLSummary } from '../../api/mockFallbacks.js';
import { useToast } from '../../components/Toast.js';
import Modal from '../../components/Modal.js';
import ConfirmModal from '../../components/ConfirmModal.js';
import { formatEGP, formatDate } from '../../utils/formatters.js';
import { EmptyState, CardGridSkeleton, TableSkeletonRows, ErrorState } from '../../components/ui/index.js';
import { debounce } from '../../utils/eventBus.js';

export const ExpensesTab: React.FC = () => {
  const toast = useToast();

  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth() + 1);

  const [pnl, setPnl] = useState<PnLSummary>(() => createZeroPnLSummary(currentDate.getFullYear(), currentDate.getMonth() + 1));
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('الكل');

  // Guard against concurrent re-entrant fetch execution loops
  const isFetchingRef = useRef(false);

  // Add / Edit Expense Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingExpense, setIsDeletingExpense] = useState(false);
  const [expenseForm, setExpenseForm] = useState<CreateExpenseInput>({
    title: '',
    category: 'إيجار',
    expense_type: 'fixed',
    amount: '' as any,
    expense_date: new Date().toISOString().slice(0, 10),
    payment_method: 'cash',
    receipt_reference: '',
    notes: '',
  });

  // Deleting State
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Month-End Close State (إقفال الشهر الحالي وترحيل الحسابات)
  const [isMonthCloseModalOpen, setIsMonthCloseModalOpen] = useState(false);
  const [closeMonthPin, setCloseMonthPin] = useState('');
  const [closeMonthNotes, setCloseMonthNotes] = useState('');
  const [isClosingMonth, setIsClosingMonth] = useState(false);

  // Clear Historical Trend State (مسح بيانات المؤشر)
  const [isClearTrendModalOpen, setIsClearTrendModalOpen] = useState(false);
  const [clearTrendPin, setClearTrendPin] = useState('');
  const [isClearingTrend, setIsClearingTrend] = useState(false);

  const fetchData = useCallback(async (showLoadingSpinner: boolean = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (showLoadingSpinner) {
      setLoading(true);
    }
    try {
      const [pnlData, expensesList] = await Promise.all([
        expensesApi.getPnLSummary(selectedYear, selectedMonth, true),
        expensesApi.getExpenses({ year: selectedYear, month: selectedMonth }, true),
      ]);
      setPnl(pnlData || createZeroPnLSummary(selectedYear, selectedMonth));
      setExpenses(Array.isArray(expensesList) ? expensesList : []);
    } catch (err: any) {
      console.warn('[ExpensesTab fetchData error]', err?.message || err);
      // Fallback safely to clean zero state if no existing data
      setPnl((prev) => prev && prev.financials && prev.financials.gross_revenue > 0 ? prev : createZeroPnLSummary(selectedYear, selectedMonth));
    } finally {
      if (showLoadingSpinner) {
        setLoading(false);
      }
      isFetchingRef.current = false;
    }
  }, [selectedYear, selectedMonth]);

  const handleExecuteMonthClose = async () => {
    if (!closeMonthPin.trim()) {
      toast.warning('يرجى إدخال رمز PIN الإداري لتأكيد الإقفال');
      return;
    }

    try {
      setIsClosingMonth(true);
      const res = await expensesApi.closeMonth(selectedYear, selectedMonth, closeMonthPin, closeMonthNotes);
      toast.success(res.message, 'تم إقفال الشهر وترحيل الحسابات بنجاح');
      setIsMonthCloseModalOpen(false);
      setCloseMonthPin('');
      setCloseMonthNotes('');
      fetchData(true);
    } catch (err: any) {
      toast.error(err.message || 'تعذر إقفال الشهر', 'فشلت العملية');
    } finally {
      setIsClosingMonth(false);
    }
  };

  const handleExecuteClearTrend = async () => {
    if (!clearTrendPin.trim()) {
      toast.warning('يرجى إدخال رمز PIN الإداري لتأكيد المسح');
      return;
    }

    try {
      setIsClearingTrend(true);
      const res = await expensesApi.clearTrendHistory(clearTrendPin);
      toast.success(res.message, 'تم مسح السجلات التاريخية للمؤشر بنجاح');
      setIsClearTrendModalOpen(false);
      setClearTrendPin('');
      fetchData(true);
    } catch (err: any) {
      toast.error(err.message || 'تعذر مسح بيانات المؤشر', 'فشلت العملية');
    } finally {
      setIsClearingTrend(false);
    }
  };

  useEffect(() => {
    // Initial fetch on mount or when month/year changes with spinner
    fetchData(true);

    // Silent background debounce for live event updates (zero UI lockups/flashes)
    const debouncedFetch = debounce(() => {
      fetchData(false);
    }, 400);

    window.addEventListener('cw_expenses_updated', debouncedFetch);
    window.addEventListener('cw_employees_updated', debouncedFetch);
    window.addEventListener('cw_inventory_updated', debouncedFetch);
    window.addEventListener('cw_payroll_updated', debouncedFetch);
    window.addEventListener('cw_transactions_updated', debouncedFetch);
    window.addEventListener('cw_attendance_updated', debouncedFetch);
    window.addEventListener('cw_shifts_updated', debouncedFetch);
    window.addEventListener('cw_orders_updated', debouncedFetch);
    window.addEventListener('cw_tax_settings_updated', debouncedFetch);

    return () => {
      debouncedFetch.cancel();
      window.removeEventListener('cw_expenses_updated', debouncedFetch);
      window.removeEventListener('cw_employees_updated', debouncedFetch);
      window.removeEventListener('cw_inventory_updated', debouncedFetch);
      window.removeEventListener('cw_payroll_updated', debouncedFetch);
      window.removeEventListener('cw_transactions_updated', debouncedFetch);
      window.removeEventListener('cw_attendance_updated', debouncedFetch);
      window.removeEventListener('cw_shifts_updated', debouncedFetch);
      window.removeEventListener('cw_orders_updated', debouncedFetch);
      window.removeEventListener('cw_tax_settings_updated', debouncedFetch);
    };
  }, [fetchData]);

  const handleOpenAddModal = () => {
    setSelectedExpense(null);
    setExpenseForm({
      title: '',
      category: 'إيجار',
      expense_type: 'fixed',
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
      expense_type: exp.expense_type || 'fixed',
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

  const handleConfirmDeleteExpense = async () => {
    if (!expenseToDelete) return;

    try {
      setIsDeletingExpense(true);
      await expensesApi.deleteExpense(expenseToDelete.id);
      toast.success(`تم حذف المصروف "${expenseToDelete.title}" بنجاح`);
      setExpenseToDelete(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'تعذر حذف المصروف', 'فشل الحذف');
    } finally {
      setIsDeletingExpense(false);
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
    'خامات ومواد تشغيل',
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
                onChange={(e) => {
                  const newCat = e.target.value;
                  const suggestedType = newCat === 'إيجار' ? 'fixed' : 'variable';
                  setExpenseForm({ ...expenseForm, category: newCat as any, expense_type: expenseForm.expense_type || suggestedType });
                }}
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

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              طبيعة وتصنيف التكلفة (Fixed vs Variable) *
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-black/40 border border-slate-800">
              <button
                type="button"
                onClick={() => setExpenseForm({ ...expenseForm, expense_type: 'fixed' })}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all text-center ${
                  expenseForm.expense_type === 'fixed'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>مصروف ثابت (Fixed Expense)</span>
              </button>
              <button
                type="button"
                onClick={() => setExpenseForm({ ...expenseForm, expense_type: 'variable' })}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all text-center ${
                  expenseForm.expense_type === 'variable'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>مصروف متغير / تشغيلي (Variable)</span>
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              {expenseForm.expense_type === 'fixed'
                ? 'تكاليف دورية ثابتة شهرياً مثل الإيجار والاشتراكات الدورية'
                : 'تكاليف ترتبط بحجم التشغيل مثل الكهرباء، المياه، الصيانة، والخامات'}
            </p>
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
              className="flex items-center justify-center px-5 py-2 text-white rounded-xl font-bold shadow-lg transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
              style={{
                backgroundColor: 'var(--color-primary)',
              }}
            >
              {isSubmitting ? (
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin ml-2" />
              ) : null}
              <span>{selectedExpense ? 'حفظ التعديلات' : 'حفظ المصروف'}</span>
            </button>
          </div>

        </form>
      </Modal>

      {/* Modal: Month-End Close Confirmation (إقفال الشهر وترحيل الحسابات) */}
      <Modal
        isOpen={isMonthCloseModalOpen}
        onClose={() => {
          if (!isClosingMonth) setIsMonthCloseModalOpen(false);
        }}
        title={`إقفال حسابات شهر ${monthNames[selectedMonth - 1]} ${selectedYear} وترحيل البيانات`}
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-amber-200 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-bold text-sm text-amber-300">
                ملخص الحسابات المالية للشهر قبل الإقفال
              </div>
              {pnl?.financials.is_live_tax_mode ? (
                <span className="text-[10px] px-2 py-0.5 rounded-lg font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  الإنتاج الفعلي (Live ETA)
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-lg font-bold bg-sky-500/10 text-sky-300 border border-sky-500/30">
                  الوضع التجريبي (Sandbox)
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              سيتم اعتماد الأرقام المالية الحالية وحفظها كلقطة محاسبية ثابتة (Snapshot) ضمن مؤشر الأداء المالي وسجلات الإقفال التاريخية.
            </p>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-amber-500/20 font-mono text-[11px]">
              <div className="p-2 rounded-xl bg-black/40 border border-amber-500/20">
                <div className="text-slate-400 text-[10px] font-sans">
                  {pnl?.financials.is_live_tax_mode ? 'الإيراد التشغيلي الصافي' : 'إجمالي الإيرادات'}
                </div>
                <div className="font-bold text-emerald-400 text-sm">
                  {formatEGP(pnl?.financials.operating_revenue ?? pnl?.financials.gross_revenue ?? 0)}
                </div>
                <div className="text-[9px] text-slate-500 font-sans">
                  {pnl?.revenue_metrics.valid_orders || 0} غسلة {pnl?.financials.is_live_tax_mode ? `(ضريبة: ${formatEGP(pnl?.financials.effective_vat_deducted || 0)})` : ''}
                </div>
              </div>
              
              <div className="p-2 rounded-xl bg-black/40 border border-amber-500/20">
                <div className="text-slate-400 text-[10px] font-sans">الرواتب المنصرفة فعلياً</div>
                <div className="font-bold text-amber-300 text-sm">{formatEGP(pnl?.financials.total_salaries || 0)}</div>
                <div className="text-[9px] text-slate-500 font-sans">
                  مستحق غير منصرف: {formatEGP(pnl?.payroll_metrics.unpaid_accrued_salaries || 0)}
                </div>
              </div>

              <div className="p-2 rounded-xl bg-black/40 border border-amber-500/20">
                <div className="text-slate-400 text-[10px] font-sans">المصروفات التشغيلية</div>
                <div className="font-bold text-rose-400 text-sm">{formatEGP(pnl?.financials.total_expenses || 0)}</div>
                <div className="text-[9px] text-slate-500 font-sans">
                  ثابت: {formatEGP(pnl?.expenses_metrics.fixed_expenses_total || 0)} | متغير: {formatEGP(pnl?.expenses_metrics.variable_expenses_total || 0)}
                </div>
              </div>

              <div className="col-span-2 sm:col-span-3 p-2.5 rounded-xl bg-black/60 border border-amber-500/30 flex items-center justify-between">
                <div>
                  <div className="text-slate-300 text-[10px] font-sans font-bold">صافي الربح المرحل (Net Profit)</div>
                  <div className="text-[10px] text-slate-500 font-sans">هامش الربح: {pnl?.financials.profit_margin || 0}%</div>
                </div>
                <div className={`font-bold text-base font-mono ${(pnl?.financials.net_profit || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatEGP(pnl?.financials.net_profit || 0)}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                ملاحظات أو تسويات الإقفال (اختياري)
              </label>
              <textarea
                rows={2}
                placeholder="مثال: تم الجرد ومطابقة الخزينة، لا توجد فروقات معلقة..."
                value={closeMonthNotes}
                onChange={(e) => setCloseMonthNotes(e.target.value)}
                className="w-full border rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none resize-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  borderColor: 'var(--border-color)',
                }}
              />
            </div>

            <div
              className="p-3.5 rounded-2xl border space-y-1.5"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                borderColor: 'var(--border-color)',
              }}
            >
              <label className="block text-xs font-semibold text-slate-300">
                رمز PIN الإداري لتأكيد الترحيل والإقفال *
              </label>
              <input
                type="password"
                maxLength={6}
                placeholder="أدخل رمز PIN الإداري (1000 أو 1234)..."
                value={closeMonthPin}
                onChange={(e) => setCloseMonthPin(e.target.value)}
                className="w-full border rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-bold focus:outline-none text-center font-mono tracking-widest"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                  borderColor: 'var(--border-color)',
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setIsMonthCloseModalOpen(false)}
              disabled={isClosingMonth}
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
              onClick={handleExecuteMonthClose}
              disabled={isClosingMonth || !closeMonthPin.trim()}
              className="flex items-center justify-center py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold shadow-lg shadow-amber-600/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isClosingMonth ? (
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin ml-2" />
              ) : null}
              <span>تأكيد إقفال الشهر وترحيل الحسابات</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Clear Historical Trend Confirmation (مسح بيانات المؤشر) */}
      <Modal
        isOpen={isClearTrendModalOpen}
        onClose={() => {
          if (!isClearingTrend) setIsClearTrendModalOpen(false);
        }}
        title="مسح السجلات التاريخية للمؤشر المالي"
        maxWidth="sm"
      >
        <div className="space-y-4 text-xs">
          <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-200 space-y-1.5">
            <div className="font-bold text-sm text-rose-300">تنبيه مسح بيانات المؤشر</div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              سيتم مسح سجلات لقطات الإقفال الشهرية السابقة للمؤشر فقط. لن يتم حذف أو تعديل أي طلبات، فواتير، أو مصروفات فعلية للشهر الحالي.
            </p>
          </div>

          <div
            className="p-3.5 rounded-2xl border space-y-1.5"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              borderColor: 'var(--border-color)',
            }}
          >
            <label className="block text-xs font-semibold text-slate-300">
              رمز PIN الإداري للتأكيد *
            </label>
            <input
              type="password"
              maxLength={6}
              placeholder="أدخل رمز PIN الإداري (1000 أو 1234)..."
              value={clearTrendPin}
              onChange={(e) => setClearTrendPin(e.target.value)}
              className="w-full border rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-bold focus:outline-none text-center font-mono tracking-widest"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                borderColor: 'var(--border-color)',
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setIsClearTrendModalOpen(false)}
              disabled={isClearingTrend}
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
              onClick={handleExecuteClearTrend}
              disabled={isClearingTrend || !clearTrendPin.trim()}
              className="flex items-center justify-center py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold shadow-lg shadow-rose-600/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isClearingTrend ? (
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin ml-2" />
              ) : null}
              <span>تأكيد مسح المؤشر</span>
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
            className="px-4 py-2 text-white rounded-xl text-xs font-bold shadow-lg transition-all hover:brightness-110 active:scale-95"
            style={{
              backgroundColor: 'var(--color-primary)',
            }}
          >
            <span>تسجيل مصروف جديد</span>
          </button>

          {pnl?.is_month_closed ? (
            <div
              className="px-3 py-2 border border-emerald-500/40 bg-emerald-950/30 text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5"
              title={`تم إقفال هذا الشهر بواسطة ${pnl.closed_ledger_info?.closed_by || 'الإدارة'} في ${pnl.closed_ledger_info?.closed_at ? formatDate(pnl.closed_ledger_info.closed_at) : ''}`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>الشهر مقفل محاسبياً</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setCloseMonthPin('');
                setCloseMonthNotes('');
                setIsMonthCloseModalOpen(true);
              }}
              title="إقفال الشهر الحالي وحفظ لقطة الحسابات وترحيلها بشكل نهائي لمؤشر الأداء"
              className="px-3.5 py-2 border border-amber-500/40 text-amber-300 bg-amber-950/20 hover:bg-amber-900/40 rounded-xl text-xs font-bold transition-all shadow-sm"
            >
              <span>إقفال الشهر الحالي (Month-End Close)</span>
            </button>
          )}

          <button
            onClick={() => fetchData(true)}
            title="تحديث البيانات"
            className="px-3 py-2 border text-slate-300 rounded-xl text-xs font-semibold transition-colors hover:bg-white/5 flex items-center gap-1.5"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderColor: 'var(--border-color)',
            }}
          >
            {loading && (
              <span className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            )}
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {/* 4 Financial Scorecard Metric Cards */}
      {loading ? (
        <CardGridSkeleton count={4} columns={4} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        {/* 1. Total Gross Revenue */}
        <div className="flex flex-col justify-between p-4 rounded-3xl border border-emerald-500/30 bg-emerald-950/20 backdrop-blur-md shadow-sm">
          <div>
            <div className="flex items-center justify-between text-emerald-400 mb-1">
              <span className="font-bold text-xs">إجمالي الإيرادات (المبيعات)</span>
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

        {/* 2. Total Salaries (Disbursed Actual Payroll & Accrued Liability) */}
        <div className="flex flex-col justify-between p-4 rounded-3xl border border-amber-500/30 bg-amber-950/20 backdrop-blur-md shadow-sm">
          <div>
            <div className="flex items-center justify-between text-amber-400 mb-1">
              <span className="font-bold text-xs">الرواتب ومسيرات العمال (المنصرف فعلياً)</span>
            </div>
            <div className="text-2xl font-black text-amber-300 font-mono mt-1">
              {formatEGP(pnl?.payroll_metrics.disbursed_salaries ?? pnl?.financials.total_salaries ?? 0)}
            </div>
          </div>
          <div className="text-[11px] text-slate-300 mt-3 pt-2 border-t border-amber-500/20 flex flex-col gap-1.5 font-medium">
            <div className="flex items-center justify-between">
              <span>تم صرف: {pnl?.payroll_metrics.disbursed_payouts_count ?? pnl?.payroll_metrics.payouts_count ?? 0} مسير من أصل {pnl?.payroll_metrics.active_staff_count || 4} عمال</span>
              <span className="text-amber-300 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10">
                {(pnl?.payroll_metrics.disbursed_salaries && pnl.payroll_metrics.disbursed_salaries > 0) ? 'منصرف فعلي' : 'لا يوجد صرف'}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-300 font-mono text-[11px] pt-1 border-t border-amber-500/10">
              <span className="text-slate-400 font-sans text-[11px]">المستحق لحظياً غير المصروف:</span>
              <span className="text-amber-400 font-bold">
                {formatEGP(
                  pnl?.payroll_metrics.total_accrued_payable ??
                  pnl?.payroll_metrics.unpaid_accrued_salaries ??
                  pnl?.payroll_metrics.accrued_salaries ??
                  0
                )}
              </span>
            </div>
            {Boolean(pnl?.payroll_metrics.total_pending_debts && pnl.payroll_metrics.total_pending_debts > 0) && (
              <div className="flex items-center justify-between text-[10px] text-rose-300 font-mono bg-rose-500/15 px-2 py-1 rounded-lg border border-rose-500/30">
                <span className="font-sans font-medium text-rose-300">مديونيات عمال مرحلة للشهر القادم:</span>
                <span className="font-bold text-rose-400">-{formatEGP(pnl.payroll_metrics.total_pending_debts)}</span>
              </div>
            )}
          </div>
        </div>

        {/* 3. Operating Expenses & Raw Materials */}
        <div className="flex flex-col justify-between p-4 rounded-3xl border border-rose-500/30 bg-rose-950/20 backdrop-blur-md shadow-sm">
          <div>
            <div className="flex items-center justify-between text-rose-400 mb-1">
              <span className="font-bold text-xs">المصروفات وتوريدات الخامات</span>
            </div>
            <div className="text-2xl font-black text-rose-300 font-mono mt-1">
              {formatEGP(pnl?.financials.total_expenses || 0)}
            </div>
          </div>
          <div className="text-[11px] text-rose-400/90 mt-3 pt-2 border-t border-rose-500/20 flex flex-col gap-1 font-medium">
            <div className="flex items-center justify-between">
              <span>{pnl?.expenses_metrics.expenses_count || 0} بنود مسجلة</span>
              <span className="text-slate-300 font-mono">المدفوع كاش: {formatEGP(pnl?.expenses_metrics.cash_expenses || 0)}</span>
            </div>
            {pnl?.financials.total_materials_purchased !== undefined && pnl.financials.total_materials_purchased > 0 && (
              <div className="flex items-center justify-between text-amber-300/90 text-[10px] font-mono">
                <span>منها توريد خامات:</span>
                <span className="font-bold">{formatEGP(pnl.financials.total_materials_purchased)}</span>
              </div>
            )}
          </div>
        </div>

        {/* 4. Net Profit / Margin (Clean Minimalist View) */}
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
              {pnl?.financials.is_live_tax_mode ? (
                <span className="text-[10px] px-2 py-0.5 rounded-lg font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-sans">
                  الإنتاج الفعلي (Live ETA)
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-lg font-bold bg-sky-500/10 text-sky-300 border border-sky-500/30 font-sans">
                  الوضع التجريبي (Sandbox)
                </span>
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

          <div className="text-[11px] text-slate-400 mt-3 pt-2 border-t border-slate-700/40 flex flex-col gap-1 font-medium font-mono">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-xs font-sans">الصافي التقديري بعد خصم الضرائب (14% VAT):</span>
              <span className="text-emerald-400 font-bold text-xs">
                {formatEGP(
                  Number(
                    (
                      (pnl?.financials.net_taxable_revenue || 0) -
                      (pnl?.financials.total_operating_costs || 0)
                    ).toFixed(2)
                  )
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
      )}

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
              <span>توزيع المصروفات حسب التصنيف</span>
            </h3>
            <span className="text-[10px] font-mono text-slate-400">
              إجمالي: {formatEGP(pnl?.financials.total_expenses || 0)}
            </span>
          </div>

          {/* Fixed vs Variable Ratio */}
          <div className="p-3 rounded-2xl bg-black/40 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                <span className="text-slate-300 font-bold">مصروفات ثابتة:</span>
                <span className="font-mono text-sky-300 font-bold">{formatEGP(pnl?.expenses_metrics.fixed_expenses_total || 0)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span className="text-slate-300 font-bold">مصروفات متغيرة:</span>
                <span className="font-mono text-amber-300 font-bold">{formatEGP(pnl?.expenses_metrics.variable_expenses_total || 0)}</span>
              </div>
            </div>
            {(pnl?.financials.total_expenses || 0) > 0 && (
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden flex">
                <div
                  className="h-full bg-sky-500 transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.round(((pnl?.expenses_metrics.fixed_expenses_total || 0) / (pnl?.financials.total_expenses || 1)) * 100))}%`,
                  }}
                  title={`ثابت: ${Math.round(((pnl?.expenses_metrics.fixed_expenses_total || 0) / (pnl?.financials.total_expenses || 1)) * 100)}%`}
                />
                <div
                  className="h-full bg-amber-500 transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.round(((pnl?.expenses_metrics.variable_expenses_total || 0) / (pnl?.financials.total_expenses || 1)) * 100))}%`,
                  }}
                  title={`متغير: ${Math.round(((pnl?.expenses_metrics.variable_expenses_total || 0) / (pnl?.financials.total_expenses || 1)) * 100)}%`}
                />
              </div>
            )}
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
            <div>
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                <span>مؤشر الأرباح والمبيعات لآخر 6 أشهر</span>
              </h3>
              <p className="text-[10px] font-mono text-slate-400 mt-0.5">مقارنة أداء نصف سنوي ولقطات الإقفال</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setClearTrendPin('');
                setIsClearTrendModalOpen(true);
              }}
              title="مسح لقطات الإقفال والمؤشر التاريخي"
              className="px-2.5 py-1 text-[11px] font-bold text-slate-400 hover:text-rose-400 border border-slate-700/60 hover:border-rose-500/40 rounded-lg transition-colors bg-black/20"
            >
              <span>مسح بيانات المؤشر</span>
            </button>
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
                <th className="py-3 px-4 font-semibold">التصنيف والنوع</th>
                <th className="py-3 px-4 font-semibold">المبلغ (ج.م)</th>
                <th className="py-3 px-4 font-semibold">طريقة الدفع</th>
                <th className="py-3 px-4 font-semibold">رقم الإيصال</th>
                <th className="py-3 px-4 font-semibold">ملاحظات</th>
                <th className="py-3 px-4 font-semibold text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
              {loading ? (
                <TableSkeletonRows columns={6} rows={5} />
              ) : filteredExpenses.length > 0 ? (
                filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                      {formatDate(exp.expense_date)}
                    </td>

                    <td className="py-3 px-4 font-bold text-slate-100">
                      {exp.title}
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                            exp.category === 'خامات ومواد تشغيل'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                              : exp.category === 'إيجار'
                              ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                              : exp.category === 'كهرباء ومياه'
                              ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                              : exp.category === 'صيانة ومعدات'
                              ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}
                        >
                          <span>{exp.category}</span>
                        </span>
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            exp.expense_type === 'variable'
                              ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                              : 'bg-sky-500/10 text-sky-300 border border-sky-500/20'
                          }`}
                        >
                          {exp.expense_type === 'variable' ? 'متغير' : 'ثابت'}
                        </span>
                      </div>
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
                          className="px-2.5 py-1 border border-sky-500/30 text-sky-400 bg-sky-950/20 hover:bg-sky-900/50 rounded-lg text-xs font-bold transition-colors active:scale-95"
                        >
                          <span>تعديل</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpenseToDelete(exp)}
                          title="حذف المصروف"
                          className="px-2.5 py-1 border border-rose-500/30 text-rose-400 bg-rose-950/20 hover:bg-rose-900/50 rounded-lg text-xs font-bold transition-colors active:scale-95 flex items-center justify-center"
                        >
                          <span>حذف</span>
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

      {/* Delete Expense Confirmation Modal */}
      <ConfirmModal
        isOpen={!!expenseToDelete}
        onClose={() => {
          if (!isDeletingExpense) setExpenseToDelete(null);
        }}
        onConfirm={handleConfirmDeleteExpense}
        title="تأكيد حذف المصروف"
        message={`هل أنت متأكد من رغبتك في حذف المصروف "${expenseToDelete?.title || ''}" بقيمة ${formatEGP(expenseToDelete?.amount || 0)} نهائياً؟ سيتم تحديث تقرير الأرباح والخسائر مباشرة.`}
        confirmLabel="نعم، حذف المصروف"
        isLoading={isDeletingExpense}
      />
    </div>
  );
};

export default ExpensesTab;

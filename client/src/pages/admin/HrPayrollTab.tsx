import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Clock,
  DollarSign,
  Calculator,
  CheckCircle2,
  Edit2,
  Trash2,
  Loader2,
  AlertTriangle,
  ArrowUpRight,
  Calendar,
} from 'lucide-react';
import { hrApi } from '../../api/client.js';
import {
  Employee,
  Attendance,
  EmployeeTransaction,
  PayrollCalculation,
  PayrollPayout,
} from '../../types/index.js';
import { FALLBACK_EMPLOYEES } from '../../api/mockFallbacks.js';
import { useToast } from '../../components/Toast.js';
import Modal from '../../components/Modal.js';
import { formatEGP, formatTime, formatLocalDateStr } from '../../utils/formatters.js';
import { EmptyState } from '../../components/ui/EmptyState.js';


const WEEKDAYS = [
  'الجمعة',
  'السبت',
  'الأحد',
  'الإثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
];

export const HrPayrollTab: React.FC = () => {
  const toast = useToast();

  const [employees, setEmployees] = useState<Employee[]>(FALLBACK_EMPLOYEES);
  const [attendanceList, setAttendanceList] = useState<Attendance[]>([]);
  const [transactions, setTransactions] = useState<EmployeeTransaction[]>([]);
  const [payouts, setPayouts] = useState<PayrollPayout[]>([]);
  const [loading, setLoading] = useState(true);

  // Sub-tabs in HR: 'employees' | 'attendance' | 'transactions' | 'payouts'
  const [hrSubTab, setHrSubTab] = useState<'employees' | 'attendance' | 'transactions' | 'payouts'>(
    'employees'
  );

  // Modals
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);

  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [payrollCalc, setPayrollCalc] = useState<PayrollCalculation | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Employee Form
  const [employeeForm, setEmployeeForm] = useState({
    name: '',
    phone: '',
    role: 'فني غسيل',
    hourly_rate: 30.0,
    overtime_hourly_rate: '' as string | number,
    target_daily_hours: 8.0,
    target_weekly_days: 6,
    target_weekly_hours: 48.0,
    weekly_off_day: 'الجمعة',
    is_paid_weekly_off: false,
    pin_code: '1234',
    status: 'active' as 'active' | 'inactive' | 'on_leave',
  });

  // Attendance Form
  const [attendanceForm, setAttendanceForm] = useState({
    employee_id: '',
    work_date: new Date().toISOString().slice(0, 10),
    check_in: `${new Date().toISOString().slice(0, 10)}T08:00`,
    check_out: `${new Date().toISOString().slice(0, 10)}T17:00`,
    notes: '',
  });

  // Transaction Form
  const [transactionForm, setTransactionForm] = useState({
    employee_id: '',
    type: 'advance' as 'advance' | 'bonus' | 'deduction',
    amount: 300.0,
    notes: '',
  });

  // Attendance Filter & Delete States
  const [attendanceFilterEmp, setAttendanceFilterEmp] = useState<string>('all');
  const [attendanceFilterDate, setAttendanceFilterDate] = useState<string>('');
  const [attendanceToDelete, setAttendanceToDelete] = useState<Attendance | null>(null);
  const [isDeletingAtt, setIsDeletingAtt] = useState(false);

  // Transaction Filter & Delete States
  const [transactionFilterEmp, setTransactionFilterEmp] = useState<string>('all');
  const [transactionFilterType, setTransactionFilterType] = useState<string>('all');
  const [transactionFilterStatus, setTransactionFilterStatus] = useState<string>('all');
  const [transactionToDelete, setTransactionToDelete] = useState<EmployeeTransaction | null>(null);
  const [isDeletingTrans, setIsDeletingTrans] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [empData, attData, transData, payData] = await Promise.all([
        hrApi.getEmployees().catch(() => FALLBACK_EMPLOYEES),
        hrApi.getAttendance().catch(() => []),
        hrApi.getTransactions().catch(() => []),
        hrApi.getPayouts().catch(() => []),
      ]);
      const validEmp = Array.isArray(empData) && empData.length > 0 ? empData : FALLBACK_EMPLOYEES;
      const sortedEmp = [...validEmp].sort((a: Employee, b: Employee) => {
        const isAOwner = a.name === 'مستر فتحي' || (a.role && a.role.includes('مالك'));
        const isBOwner = b.name === 'مستر فتحي' || (b.role && b.role.includes('مالك'));
        if (isAOwner && !isBOwner) return -1;
        if (!isAOwner && isBOwner) return 1;
        return (a.name || '').localeCompare(b.name || '', 'ar');
      });
      setEmployees(sortedEmp);
      setAttendanceList(Array.isArray(attData) ? attData : []);
      setTransactions(Array.isArray(transData) ? transData : []);
      setPayouts(Array.isArray(payData) ? payData : []);
    } catch (err: any) {
      toast.error(err.message, 'تعذر تحميل بيانات الموارد البشرية');
      setEmployees(FALLBACK_EMPLOYEES);
      setAttendanceList([]);
      setTransactions([]);
      setPayouts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const handleHrUpdates = () => {
      fetchData();
    };

    window.addEventListener('cw_attendance_updated', handleHrUpdates);
    window.addEventListener('cw_transactions_updated', handleHrUpdates);
    window.addEventListener('cw_payroll_updated', handleHrUpdates);
    window.addEventListener('storage', handleHrUpdates);

    return () => {
      window.removeEventListener('cw_attendance_updated', handleHrUpdates);
      window.removeEventListener('cw_transactions_updated', handleHrUpdates);
      window.removeEventListener('cw_payroll_updated', handleHrUpdates);
      window.removeEventListener('storage', handleHrUpdates);
    };
  }, []);

  const handleConfirmDeleteAttendance = async () => {
    if (!attendanceToDelete) return;
    try {
      setIsDeletingAtt(true);
      await hrApi.deleteAttendance(attendanceToDelete.id);
      toast.success('تم حذف سجل الحضور والإنصراف بنجاح!', 'تم الحذف');
      setAttendanceToDelete(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'تعذر حذف سجل الحضور');
    } finally {
      setIsDeletingAtt(false);
    }
  };

  const handleConfirmDeleteTransaction = async () => {
    if (!transactionToDelete) return;
    try {
      setIsDeletingTrans(true);
      await hrApi.deleteTransaction(transactionToDelete.id);
      toast.success('تم حذف الحركة المالية بنجاح!', 'تم الحذف');
      setTransactionToDelete(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'تعذر حذف الحركة المالية');
    } finally {
      setIsDeletingTrans(false);
    }
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeForm.name.trim()) {
      toast.warning('اسم الموظف مطلوب');
      return;
    }

    try {
      setSubmitting(true);
      const targetDailyHours = Number(employeeForm.target_daily_hours) || 8.0;
      const targetWeeklyDays = Number(employeeForm.target_weekly_days) || 6;
      const targetWeeklyHours = Number((targetDailyHours * targetWeeklyDays).toFixed(2));

      const payload = {
        name: employeeForm.name.trim(),
        phone: employeeForm.phone.trim() || undefined,
        role: employeeForm.role.trim() || 'فني غسيل',
        hourly_rate: Number(employeeForm.hourly_rate),
        overtime_hourly_rate:
          employeeForm.overtime_hourly_rate !== '' &&
          employeeForm.overtime_hourly_rate !== null &&
          !isNaN(Number(employeeForm.overtime_hourly_rate)) &&
          Number(employeeForm.overtime_hourly_rate) > 0
            ? Number(employeeForm.overtime_hourly_rate)
            : null,
        target_weekly_days: targetWeeklyDays,
        target_weekly_hours: targetWeeklyHours,
        weekly_off_day: employeeForm.weekly_off_day,
        is_paid_weekly_off: Boolean(employeeForm.is_paid_weekly_off),
        pin_code: employeeForm.pin_code || '1234',
        status: employeeForm.status,
      };

      if (selectedEmployee) {
        await hrApi.updateEmployee(selectedEmployee.id, payload);
        toast.success('تم تحديث بيانات الموظف بنجاح');
      } else {
        await hrApi.createEmployee(payload);
        toast.success('تم إضافة الموظف الجديد بنجاح');
      }
      setIsEmployeeModalOpen(false);
      setSelectedEmployee(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
  const [isDeletingEmp, setIsDeletingEmp] = useState(false);

  const handleConfirmDeleteEmployee = async () => {
    if (!employeeToDelete) return;
    try {
      setIsDeletingEmp(true);
      await hrApi.deleteEmployee(employeeToDelete.id);
      toast.success(`تم حذف الموظف (${employeeToDelete.name}) وكافة سجلاته بنجاح!`, 'تم الحذف');
      setEmployeeToDelete(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'تعذر حذف الموظف');
    } finally {
      setIsDeletingEmp(false);
    }
  };

  const handleRecordAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attendanceForm.employee_id) {
      toast.warning('يرجى اختيار الموظف');
      return;
    }

    try {
      setSubmitting(true);
      await hrApi.recordAttendance({
        employee_id: attendanceForm.employee_id,
        work_date: attendanceForm.work_date,
        check_in: new Date(attendanceForm.check_in).toISOString(),
        check_out: attendanceForm.check_out
          ? new Date(attendanceForm.check_out).toISOString()
          : undefined,
        notes: attendanceForm.notes || undefined,
      });
      toast.success('تم تسجيل حركة الحضور/الإنصراف وحساب الساعات آلياً!');
      setIsAttendanceModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transactionForm.employee_id) {
      toast.warning('يرجى اختيار الموظف');
      return;
    }

    try {
      setSubmitting(true);
      await hrApi.createTransaction({
        employee_id: transactionForm.employee_id,
        type: transactionForm.type,
        amount: Number(transactionForm.amount),
        notes: transactionForm.notes || undefined,
      });
      toast.success('تم تسجيل الحركة المالية بنجاح');
      setIsTransactionModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenPayrollCalc = async (emp: Employee) => {
    setSelectedEmployee(emp);
    try {
      const calc = await hrApi.calculatePayroll(emp.id);
      setPayrollCalc(calc);
      setIsPayrollModalOpen(true);
    } catch (err: any) {
      toast.error(err.message, 'تعذر احتساب مسير الراتب');
    }
  };

  const handleSettlePayroll = async () => {
    if (!selectedEmployee || !payrollCalc) return;
    const isDebt = payrollCalc.financial_breakdown.net_payable_salary < 0;
    const debtAmount = Math.abs(payrollCalc.financial_breakdown.net_payable_salary);

    const confirmMsg = isDebt
      ? `الموظف (${selectedEmployee.name}) مدين للمغسلة بقيمة ${formatEGP(debtAmount)} ج.م (إجمالي السلف والخصومات أكبر من المستحقات).\n\nهل تريد اعتماد التصفية؟ سيتم تسجيل صرف 0 ج.م في الخزينة وترحيل المديونية تلقائياً كسلفة للشهر القادم.`
      : `تأكيد صرف راتب (${selectedEmployee.name}) بصافي: ${formatEGP(payrollCalc.financial_breakdown.net_payable_salary)} ج.م؟`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setSubmitting(true);
      const result = await hrApi.settlePayroll({
        employee_id: selectedEmployee.id,
        period_start: payrollCalc.period.start,
        period_end: payrollCalc.period.end,
        payment_method: 'transfer',
        notes: isDebt
          ? `تسوية مسير وترحيل مديونية بقيمة ${formatEGP(debtAmount)} للشهر القادم`
          : `مسير راتب للموظف ${selectedEmployee.name}`,
      });

      if (isDebt) {
        toast.warning(
          `تمت التسوية بنجاح! تم تسجيل الصرف 0 ج.م وترحيل مديونية بقيمة ${formatEGP(debtAmount)} للشهر القادم.`,
          'تمت التسوية وترحيل المديونية'
        );
      } else {
        toast.success(
          `تم صرف الراتب بنجاح! سند الصرف: ${result.data.payout.payout_code}`,
          'تم الصرف والتسوية'
        );
      }

      setIsPayrollModalOpen(false);
      setSelectedEmployee(null);
      setPayrollCalc(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Users className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
            <span>شؤون الموظفين والرواتب اللحظية (HR & Real-time Payroll)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            متابعة الحضور والإنصراف وساعات العمل، الإجازات الأسبوعية، السلف والمكافآت، وتصفية المسيرات بالجنيه المصري
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setSelectedEmployee(null);
              setEmployeeForm({
                name: '',
                phone: '',
                role: 'فني غسيل',
                hourly_rate: 30.0,
                overtime_hourly_rate: '',
                target_daily_hours: 8.0,
                target_weekly_days: 6,
                target_weekly_hours: 48.0,
                weekly_off_day: 'الجمعة',
                is_paid_weekly_off: false,
                pin_code: '1234',
                status: 'active',
              });
              setIsEmployeeModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2.5 text-white rounded-xl text-xs font-bold transition-all shadow-lg hover:brightness-110"
            style={{
              backgroundColor: 'var(--color-primary)',
            }}
          >
            <Plus className="w-4 h-4" />
            <span>موظف جديد</span>
          </button>

          <button
            onClick={() => {
              setAttendanceForm({
                employee_id: employees[0]?.id || '',
                work_date: new Date().toISOString().slice(0, 10),
                check_in: `${new Date().toISOString().slice(0, 10)}T08:00`,
                check_out: `${new Date().toISOString().slice(0, 10)}T17:00`,
                notes: '',
              });
              setIsAttendanceModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 border text-slate-200 rounded-xl text-xs font-bold transition-colors hover:bg-white/5"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderColor: 'var(--border-color)',
            }}
          >
            <Clock className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
            <span>تسجيل حضور / إنصراف يدوي</span>
          </button>

          <button
            onClick={() => {
              setTransactionForm({
                employee_id: employees[0]?.id || '',
                type: 'advance',
                amount: 300.0,
                notes: '',
              });
              setIsTransactionModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 border text-slate-200 rounded-xl text-xs font-bold transition-colors hover:bg-white/5"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderColor: 'var(--border-color)',
            }}
          >
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span>سلفة / مكافأة / خصم</span>
          </button>
        </div>
      </div>

      {/* Sub Tabs Navigation */}
      <div className="flex items-center gap-2 border-b pb-3" style={{ borderColor: 'var(--border-color)' }}>
        {[
          { id: 'employees', label: 'سجل الموظفين والرواتب', count: (employees || []).length },
          { id: 'attendance', label: 'سجل الحضور والإنصراف', count: (attendanceList || []).length },
          { id: 'transactions', label: 'الحركات المالية والسلف', count: (transactions || []).length },
          { id: 'payouts', label: 'أرشيف مسير الرواتب المصروفة', count: (payouts || []).length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setHrSubTab(tab.id as any)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border"
            style={{
              backgroundColor: hrSubTab === tab.id ? 'var(--card-bg)' : 'transparent',
              borderColor: hrSubTab === tab.id ? 'var(--border-color)' : 'transparent',
              color: hrSubTab === tab.id ? 'var(--color-primary)' : 'rgb(148, 163, 184)',
            }}
          >
            <span>{tab.label}</span>
            <span
              className="px-1.5 py-0.5 rounded-full text-[10px] font-mono"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                color: hrSubTab === tab.id ? 'var(--color-primary)' : 'rgb(148, 163, 184)',
              }}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Content for HR Sub-tabs */}
      {hrSubTab === 'employees' && (
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
                  <th className="py-3 px-4 font-semibold">اسم الموظف</th>
                  <th className="py-3 px-4 font-semibold">المسمى الوظيفي</th>
                  <th className="py-3 px-4 font-semibold">سعر الساعة</th>
                  <th className="py-3 px-4 font-semibold">مواعيد العمل والإجازة</th>
                  <th className="py-3 px-4 font-semibold">الحالة</th>
                  <th className="py-3 px-4 font-semibold text-center">كشف الراتب اللحظي</th>
                  <th className="py-3 px-4 font-semibold text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                {(employees || []).length > 0 ? (
                  (employees || []).map((emp) => (
                    <tr key={emp.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-100">
                        <div>{emp.name}</div>
                        {emp.phone && <div className="text-[10px] text-slate-400 font-mono">{emp.phone}</div>}
                      </td>

                      <td className="py-3.5 px-4 text-slate-300">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                          {emp.role}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono">
                        {emp.name === 'مستر فتحي' || emp.role?.includes('مالك') ? (
                          <div className="text-slate-400 font-sans text-xs">مالك المنشأة (—)</div>
                        ) : (
                          <>
                            <div className="font-bold" style={{ color: 'var(--color-primary)' }}>
                              {formatEGP(emp.hourly_rate)}/ساعة
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              إضافي:{' '}
                              {emp.overtime_hourly_rate
                                ? `${formatEGP(emp.overtime_hourly_rate)}/ساعة`
                                : `${formatEGP(emp.hourly_rate)} (1.0x)`}
                            </div>
                          </>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {emp.name === 'مستر فتحي' || emp.role?.includes('مالك') ? (
                          <div className="text-slate-400 text-xs">بدون شفت محدد</div>
                        ) : (
                          <div className="space-y-1">
                            <div className="text-[11px] text-slate-200 font-bold">
                              {emp.target_weekly_hours || 48} ساعة / {emp.target_weekly_days || 6} أيام
                            </div>
                            <div className="text-[10px] text-slate-400">
                              الإجازة: <span className="text-amber-300 font-bold">{emp.weekly_off_day || 'الجمعة'}</span>
                              {emp.is_paid_weekly_off ? (
                                <span className="text-emerald-400 mr-1 font-bold">(مدفوعة)</span>
                              ) : (
                                <span className="text-slate-500 mr-1">(غير مدفوعة)</span>
                              )}
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            emp.status === 'active'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${emp.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                          <span>{emp.status === 'active' ? 'على رأس العمل' : 'غير نشط'}</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => handleOpenPayrollCalc(emp)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border hover:brightness-110"
                          style={{
                            backgroundColor: 'rgba(255, 255, 255, 0.08)',
                            borderColor: 'var(--border-color)',
                            color: 'var(--color-primary)',
                          }}
                        >
                          <Calculator className="w-3.5 h-3.5" />
                          <span>حساب وتصفية الراتب</span>
                        </button>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => {
                              const days = emp.target_weekly_days || 6;
                              const weeklyHours = emp.target_weekly_hours || 48.0;
                              const dailyHours = Number((weeklyHours / days).toFixed(1)) || 8.0;

                              setSelectedEmployee(emp);
                              setEmployeeForm({
                                name: emp.name,
                                phone: emp.phone || '',
                                role: emp.role,
                                hourly_rate: emp.hourly_rate,
                                overtime_hourly_rate: emp.overtime_hourly_rate ?? '',
                                target_daily_hours: dailyHours,
                                target_weekly_days: days,
                                target_weekly_hours: weeklyHours,
                                weekly_off_day: emp.weekly_off_day || 'الجمعة',
                                is_paid_weekly_off: Boolean(emp.is_paid_weekly_off),
                                pin_code: '1234',
                                status: emp.status,
                              });
                              setIsEmployeeModalOpen(true);
                            }}
                            title="تعديل بيانات الموظف ونظام العمل"
                            className="p-2 border text-slate-300 rounded-lg transition-colors hover:bg-white/10"
                            style={{
                              backgroundColor: 'rgba(255, 255, 255, 0.05)',
                              borderColor: 'var(--border-color)',
                            }}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => setEmployeeToDelete(emp)}
                            title="حذف الموظف نهائياً"
                            className="p-2 border border-rose-500/30 text-rose-400 bg-rose-950/20 hover:bg-rose-900/50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8">
                      <EmptyState
                        compact
                        icon={<Users className="w-6 h-6 opacity-70" />}
                        title="لا يوجد موظفون مسجلون"
                        description="أضف طاقم العمل وفنيي الغسيل وتحديد معدل الأجر بالساعة وجدول العمل"
                        actionLabel="إضافة موظف جديد"
                        onAction={() => {
                          setSelectedEmployee(null);
                          setEmployeeForm({
                            name: '',
                            phone: '',
                            role: 'فني غسيل',
                            hourly_rate: 30.0,
                            overtime_hourly_rate: '',
                            target_daily_hours: 8.0,
                            target_weekly_days: 6,
                            target_weekly_hours: 48.0,
                            weekly_off_day: 'الجمعة',
                            is_paid_weekly_off: false,
                            pin_code: '1234',
                            status: 'active',
                          });
                          setIsEmployeeModalOpen(true);
                        }}
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {/* Sub-tab 2: Attendance */}
      {hrSubTab === 'attendance' && (
        <div className="space-y-3">
          {/* Attendance Filters Bar */}
          <div
            className="p-3.5 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs"
            style={{
              backgroundColor: 'var(--card-bg)',
              borderColor: 'var(--border-color)',
            }}
          >
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-bold text-slate-300">تصفية السجلات:</span>
              {/* Employee Filter */}
              <select
                value={attendanceFilterEmp}
                onChange={(e) => setAttendanceFilterEmp(e.target.value)}
                className="border rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderColor: 'var(--border-color)',
                }}
              >
                <option value="all">كافة الموظفين</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.role})
                  </option>
                ))}
              </select>

              {/* Date Filter */}
              <input
                type="date"
                value={attendanceFilterDate}
                onChange={(e) => setAttendanceFilterDate(e.target.value)}
                className="border rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderColor: 'var(--border-color)',
                }}
              />

              {(attendanceFilterEmp !== 'all' || attendanceFilterDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setAttendanceFilterEmp('all');
                    setAttendanceFilterDate('');
                  }}
                  className="px-2.5 py-1 text-[11px] text-rose-400 hover:underline"
                >
                  إلغاء الفلتر
                </button>
              )}
            </div>

            <div className="text-slate-400 text-xs font-mono">
              إجمالي السجلات:{' '}
              <strong className="text-emerald-400 font-bold">
                {(attendanceList || []).filter((att) => {
                  if (attendanceFilterEmp !== 'all' && att.employee_id !== attendanceFilterEmp) return false;
                  if (attendanceFilterDate && att.work_date !== attendanceFilterDate) return false;
                  return true;
                }).length}
              </strong>
            </div>
          </div>

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
                    <th className="py-3 px-4 font-semibold">التاريخ</th>
                    <th className="py-3 px-4 font-semibold">الموظف</th>
                    <th className="py-3 px-4 font-semibold">وقت الحضور</th>
                    <th className="py-3 px-4 font-semibold">وقت الانصراف</th>
                    <th className="py-3 px-4 font-semibold">الساعات الفعلية</th>
                    <th className="py-3 px-4 font-semibold">الإضافي (+)</th>
                    <th className="py-3 px-4 font-semibold">المخصوم (-)</th>
                    <th className="py-3 px-4 font-semibold">ملاحظات</th>
                    <th className="py-3 px-4 font-semibold text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                  {(() => {
                    const filtered = (attendanceList || []).filter((att) => {
                      if (attendanceFilterEmp !== 'all' && att.employee_id !== attendanceFilterEmp) return false;
                      if (attendanceFilterDate && att.work_date !== attendanceFilterDate) return false;
                      return true;
                    });

                    return filtered.length > 0 ? (
                      filtered.map((att) => (
                        <tr key={att.id} className="hover:bg-white/5 transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-300">{att.work_date}</td>
                          <td className="py-3 px-4 font-bold text-slate-100">{att.employee_name}</td>
                          <td className="py-3 px-4 font-mono text-emerald-400">
                            {formatTime(att.check_in)}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-300">
                            {att.check_out ? formatTime(att.check_out) : 'شفت مفتوح'}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-200">
                            {att.actual_hours} ساعة
                          </td>
                          <td className="py-3 px-4 font-mono" style={{ color: 'var(--color-primary)' }}>
                            {att.overtime_hours > 0 ? `+${att.overtime_hours}h` : '-'}
                          </td>
                          <td className="py-3 px-4 font-mono text-rose-400">
                            {att.deducted_hours > 0 ? `-${att.deducted_hours}h` : '-'}
                          </td>
                          <td className="py-3 px-4 text-slate-400 text-[11px]">{att.notes || '-'}</td>
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => setAttendanceToDelete(att)}
                              title="حذف سجل الحضور"
                              className="p-1.5 border border-rose-500/30 text-rose-400 hover:bg-rose-900/40 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={9} className="py-8">
                          <EmptyState
                            compact
                            icon={<Clock className="w-6 h-6 opacity-70" />}
                            title="لا توجد سجلات حضور وانصراف مطابقة"
                            description="تسجيل الدوام يتم تلقائياً عند قيام الفني بمسح رمز الـ PIN من شاشة الكاشير"
                          />
                        </td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sub-tab 3: Transactions */}
      {hrSubTab === 'transactions' && (
        <div className="space-y-3">
          {/* Transactions Filter Bar */}
          <div
            className="p-3.5 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs"
            style={{
              backgroundColor: 'var(--card-bg)',
              borderColor: 'var(--border-color)',
            }}
          >
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-bold text-slate-300">تصفية الحركات:</span>
              {/* Employee Filter */}
              <select
                value={transactionFilterEmp}
                onChange={(e) => setTransactionFilterEmp(e.target.value)}
                className="border rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderColor: 'var(--border-color)',
                }}
              >
                <option value="all">كافة الموظفين</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>

              {/* Type Filter */}
              <select
                value={transactionFilterType}
                onChange={(e) => setTransactionFilterType(e.target.value)}
                className="border rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderColor: 'var(--border-color)',
                }}
              >
                <option value="all">كافة أنواع الحركات</option>
                <option value="advance">سلف مالية (-)</option>
                <option value="bonus">مكافآت تميز (+)</option>
                <option value="deduction">خصومات جزائية (-)</option>
              </select>

              {/* Status Filter */}
              <select
                value={transactionFilterStatus}
                onChange={(e) => setTransactionFilterStatus(e.target.value)}
                className="border rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderColor: 'var(--border-color)',
                }}
              >
                <option value="all">كافة الحالات</option>
                <option value="pending">معلقة (Pending)</option>
                <option value="settled">تمت التسوية (Settled)</option>
              </select>

              {(transactionFilterEmp !== 'all' || transactionFilterType !== 'all' || transactionFilterStatus !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setTransactionFilterEmp('all');
                    setTransactionFilterType('all');
                    setTransactionFilterStatus('all');
                  }}
                  className="px-2.5 py-1 text-[11px] text-rose-400 hover:underline"
                >
                  إلغاء الفلتر
                </button>
              )}
            </div>

            <div className="text-slate-400 text-xs font-mono">
              إجمالي الحركات:{' '}
              <strong className="text-emerald-400 font-bold">
                {(transactions || []).filter((tr) => {
                  if (transactionFilterEmp !== 'all' && tr.employee_id !== transactionFilterEmp) return false;
                  if (transactionFilterType !== 'all' && tr.type !== transactionFilterType) return false;
                  if (transactionFilterStatus !== 'all' && tr.status !== transactionFilterStatus) return false;
                  return true;
                }).length}
              </strong>
            </div>
          </div>

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
                    <th className="py-3 px-4 font-semibold">التاريخ</th>
                    <th className="py-3 px-4 font-semibold">الموظف</th>
                    <th className="py-3 px-4 font-semibold">نوع الحركة</th>
                    <th className="py-3 px-4 font-semibold">المبلغ</th>
                    <th className="py-3 px-4 font-semibold">البيان / الملاحظات</th>
                    <th className="py-3 px-4 font-semibold">حالة التسوية</th>
                    <th className="py-3 px-4 font-semibold text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                  {(() => {
                    const filtered = (transactions || []).filter((tr) => {
                      if (transactionFilterEmp !== 'all' && tr.employee_id !== transactionFilterEmp) return false;
                      if (transactionFilterType !== 'all' && tr.type !== transactionFilterType) return false;
                      if (transactionFilterStatus !== 'all' && tr.status !== transactionFilterStatus) return false;
                      return true;
                    });

                    return filtered.length > 0 ? (
                      filtered.map((tr) => (
                        <tr key={tr.id} className="hover:bg-white/5 transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-400">{tr.date}</td>
                          <td className="py-3 px-4 font-bold text-slate-100">{tr.employee_name}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                tr.type === 'bonus'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : tr.type === 'advance'
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {tr.type === 'bonus'
                                ? 'مكافأة (+)'
                                : tr.type === 'advance'
                                ? 'سلفة (-)'
                                : 'خصم (-)'}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-200">
                            {formatEGP(tr.amount)}
                          </td>
                          <td className="py-3 px-4 text-slate-300">{tr.notes || '-'}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                tr.status === 'settled'
                                  ? 'bg-slate-800 text-slate-400'
                                  : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              {tr.status === 'settled' ? 'تمت التسوية بالمسير' : 'معلقة (Pending)'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => setTransactionToDelete(tr)}
                              title="حذف الحركة المالية"
                              className="p-1.5 border border-rose-500/30 text-rose-400 hover:bg-rose-900/40 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="py-8">
                          <EmptyState
                            compact
                            icon={<DollarSign className="w-6 h-6 opacity-70" />}
                            title="لا توجد حركات مالية مطابقة"
                            description="سجل السلف والمكافآت والخصومات للموظفين لتسويتها آلياً عند إعداد المسير"
                            actionLabel="تسجيل حركة مالية جديدة"
                            onAction={() => {
                              setTransactionForm({
                                employee_id: (employees || [])[0]?.id || '',
                                type: 'advance',
                                amount: 100,
                                notes: '',
                              });
                              setIsTransactionModalOpen(true);
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sub-tab 4: Payouts Archive */}
      {hrSubTab === 'payouts' && (
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
                  <th className="py-3 px-4 font-semibold">سند الصرف</th>
                  <th className="py-3 px-4 font-semibold">الموظف</th>
                  <th className="py-3 px-4 font-semibold">الفترة</th>
                  <th className="py-3 px-4 font-semibold">ساعات العمل</th>
                  <th className="py-3 px-4 font-semibold">المكافآت</th>
                  <th className="py-3 px-4 font-semibold">السلف المستردة</th>
                  <th className="py-3 px-4 font-semibold">صافي المصروف</th>
                  <th className="py-3 px-4 font-semibold">طريقة الدفع</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                {(payouts || []).length > 0 ? (
                  (payouts || []).map((pay) => (
                    <tr key={pay.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold" style={{ color: 'var(--color-primary)' }}>{pay.payout_code}</td>
                      <td className="py-3 px-4 font-bold text-slate-100">{pay.employee_name}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                        {pay.period_start} &rarr; {pay.period_end}
                      </td>
                      <td className="py-3 px-4 font-mono">{pay.total_hours_worked}h</td>
                      <td className="py-3 px-4 font-mono text-emerald-400">
                        +{formatEGP(pay.bonuses_amount)}
                      </td>
                      <td className="py-3 px-4 font-mono text-amber-400">
                        -{formatEGP(pay.advances_deducted)}
                      </td>
                      <td className="py-3 px-4 font-mono font-black text-emerald-400 text-sm">
                        {formatEGP(pay.net_paid)}
                      </td>
                      <td className="py-3 px-4 text-slate-400">{pay.payment_method}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-8">
                      <EmptyState
                        compact
                        icon={<Calculator className="w-6 h-6 opacity-70" />}
                        title="لا توجد مسيرات رواتب سابقة"
                        description="تظهر هنا سجلات صرف الرواتب المعتمدة وسندات الصرف المسواة"
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {/* Modal: Add/Edit Employee with Work Schedule Details */}
      <Modal
        isOpen={isEmployeeModalOpen}
        onClose={() => {
          setIsEmployeeModalOpen(false);
          setSelectedEmployee(null);
        }}
        title={selectedEmployee ? `تعديل بيانات: ${selectedEmployee.name}` : 'إضافة موظف جديد وتحديد نظام العمل'}
        maxWidth="xl"
      >
        <form onSubmit={handleSaveEmployee} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">اسم الموظف الكامل</label>
            <input
              type="text"
              required
              placeholder="مثال: كريم عبد الرحمن"
              value={employeeForm.name}
              onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })}
              className="w-full border rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                borderColor: 'var(--border-color)',
              }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">رقم الموبايل</label>
              <input
                type="text"
                placeholder="01xxxxxxxxx"
                value={employeeForm.phone}
                onChange={(e) => setEmployeeForm({ ...employeeForm, phone: e.target.value })}
                className="w-full border rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono focus:outline-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderColor: 'var(--border-color)',
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">المسمى الوظيفي</label>
              <input
                type="text"
                placeholder="فني غسيل / كاشير / تلميع"
                value={employeeForm.role}
                onChange={(e) => setEmployeeForm({ ...employeeForm, role: e.target.value })}
                className="w-full border rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderColor: 'var(--border-color)',
                }}
              />
            </div>
          </div>

          {/* Rate, Overtime Rate, and PIN */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">أجر الساعة الأساسي (ج.م)</label>
              <input
                type="number"
                step="any"
                required
                min={0}
                value={employeeForm.hourly_rate}
                onChange={(e) =>
                  setEmployeeForm({ ...employeeForm, hourly_rate: Number(e.target.value) })
                }
                className="w-full border rounded-xl px-3.5 py-2 text-sm font-mono focus:outline-none font-bold"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--color-primary)',
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                سعر ساعة الإضافي (ج.م/ساعة)
              </label>
              <input
                type="number"
                step="any"
                min={0}
                placeholder={
                  employeeForm.hourly_rate
                    ? `${(Number(employeeForm.hourly_rate)).toFixed(2)} (1.0x افتراضي - نفس أجر الساعة)`
                    : 'مثال: 30'
                }
                value={employeeForm.overtime_hourly_rate}
                onChange={(e) =>
                  setEmployeeForm({ ...employeeForm, overtime_hourly_rate: e.target.value })
                }
                className="w-full border rounded-xl px-3.5 py-2 text-sm font-mono focus:outline-none font-bold text-sky-400"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderColor: 'var(--border-color)',
                }}
              />
              <div className="text-[10px] text-slate-500 mt-1">
                (اختياري - يترك فارغاً لحساب نفس أجر الساعة 1.0x تلقائياً)
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                رمز PIN السري لتسجيل الحضور والإنصراف
              </label>
              <input
                type="password"
                maxLength={6}
                required
                placeholder="****"
                value={employeeForm.pin_code}
                onChange={(e) =>
                  setEmployeeForm({ ...employeeForm, pin_code: e.target.value })
                }
                className="w-full border rounded-xl px-3.5 py-2 text-sm font-mono focus:outline-none font-bold text-amber-400"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderColor: 'var(--border-color)',
                }}
              />
            </div>
          </div>

          {/* Schedule Settings: Daily Shift Hours, Weekly Days, Weekly Off Day */}
          <div
            className="p-3.5 rounded-2xl border space-y-3"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              borderColor: 'var(--border-color)',
            }}
          >
            <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Calendar className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
              <span>إعدادات شفت العمل اليومي والإجازة الأسبوعية</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  ساعات العمل اليومية (ساعات الشفت) *
                </label>
                <input
                  type="number"
                  step="any"
                  min={1}
                  max={24}
                  required
                  placeholder="8"
                  value={employeeForm.target_daily_hours}
                  onChange={(e) => {
                    const daily = Number(e.target.value);
                    setEmployeeForm((prev) => ({
                      ...prev,
                      target_daily_hours: daily,
                      target_weekly_hours: Number((daily * (prev.target_weekly_days || 6)).toFixed(2)),
                    }));
                  }}
                  className="w-full border rounded-xl px-3 py-2 text-xs font-mono focus:outline-none font-bold"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--color-primary)',
                  }}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  أيام العمل أسبوعياً *
                </label>
                <input
                  type="number"
                  min={1}
                  max={7}
                  required
                  placeholder="6"
                  value={employeeForm.target_weekly_days}
                  onChange={(e) => {
                    const days = Number(e.target.value);
                    setEmployeeForm((prev) => ({
                      ...prev,
                      target_weekly_days: days,
                      target_weekly_hours: Number(((prev.target_daily_hours || 8) * days).toFixed(2)),
                    }));
                  }}
                  className="w-full border rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none font-bold"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    borderColor: 'var(--border-color)',
                  }}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  يوم الإجازة الأسبوعية
                </label>
                <select
                  value={employeeForm.weekly_off_day}
                  onChange={(e) =>
                    setEmployeeForm({
                      ...employeeForm,
                      weekly_off_day: e.target.value,
                    })
                  }
                  className="w-full border rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none font-medium"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  {WEEKDAYS.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Paid vs Unpaid Weekly Off Toggle */}
            <div className="pt-2.5 border-t flex items-center justify-between gap-3" style={{ borderColor: 'var(--border-color)' }}>
              <div className="space-y-0.5">
                <label
                  onClick={() =>
                    setEmployeeForm((prev) => ({
                      ...prev,
                      is_paid_weekly_off: !prev.is_paid_weekly_off,
                    }))
                  }
                  className="text-xs font-bold text-slate-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <span>الإجازة الأسبوعية مدفوعة الأجر</span>
                  <span
                    className={`text-[9px] px-2 py-0.5 rounded-full font-bold border transition-all ${
                      employeeForm.is_paid_weekly_off
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {employeeForm.is_paid_weekly_off ? 'مدفوعة الأجر ✅' : 'غير مدفوعة ❌'}
                  </span>
                </label>
                <p className="text-[10px] text-slate-400 font-medium">
                  (احتساب أجر ساعات الشفت اليومي في يوم الإجازة تلقائياً عند تصفية الراتب)
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={employeeForm.is_paid_weekly_off}
                  onChange={(e) =>
                    setEmployeeForm({
                      ...employeeForm,
                      is_paid_weekly_off: e.target.checked,
                    })
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 border border-slate-700"></div>
              </label>
            </div>

            {/* Auto-calculated hint */}
            <div className="pt-2 border-t flex items-center justify-between text-[11px] text-slate-400" style={{ borderColor: 'var(--border-color)' }}>
              <span>
                إجمالي ساعات العمل المستهدفة:{' '}
                <strong className="text-emerald-400 font-mono font-bold">
                  {Number(((employeeForm.target_daily_hours || 8) * (employeeForm.target_weekly_days || 6)).toFixed(1))} ساعة أسبوعياً
                </strong>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                ({employeeForm.target_daily_hours || 8}س/يوم × {employeeForm.target_weekly_days || 6} أيام)
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">حالة الموظف</label>
            <select
              value={employeeForm.status}
              onChange={(e) =>
                setEmployeeForm({ ...employeeForm, status: e.target.value as any })
              }
              className="w-full border rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                borderColor: 'var(--border-color)',
              }}
            >
              <option value="active">على رأس العمل</option>
              <option value="inactive">معطل / غير نشط</option>
              <option value="on_leave">إجازة</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <button
              type="button"
              onClick={() => setIsEmployeeModalOpen(false)}
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
              {submitting ? 'جاري الحفظ...' : 'حفظ الموظف'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Record Attendance */}
      <Modal
        isOpen={isAttendanceModalOpen}
        onClose={() => setIsAttendanceModalOpen(false)}
        title="تسجيل حركة حضور / إنصراف يدوية"
      >
        <form onSubmit={handleRecordAttendance} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">الموظف</label>
            <select
              value={attendanceForm.employee_id}
              onChange={(e) =>
                setAttendanceForm({ ...attendanceForm, employee_id: e.target.value })
              }
              className="w-full border rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                borderColor: 'var(--border-color)',
              }}
            >
              <option value="">-- اختر الموظف --</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.role})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">تاريخ العمل</label>
            <input
              type="date"
              required
              value={attendanceForm.work_date}
              onChange={(e) =>
                setAttendanceForm({ ...attendanceForm, work_date: e.target.value })
              }
              className="w-full border rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                borderColor: 'var(--border-color)',
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">وقت الحضور</label>
              <input
                type="datetime-local"
                required
                value={attendanceForm.check_in}
                onChange={(e) =>
                  setAttendanceForm({ ...attendanceForm, check_in: e.target.value })
                }
                className="w-full border rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderColor: 'var(--border-color)',
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">وقت الانصراف</label>
              <input
                type="datetime-local"
                value={attendanceForm.check_out}
                onChange={(e) =>
                  setAttendanceForm({ ...attendanceForm, check_out: e.target.value })
                }
                className="w-full border rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderColor: 'var(--border-color)',
                }}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <button
              type="button"
              onClick={() => setIsAttendanceModalOpen(false)}
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
              {submitting ? 'جاري التسجيل...' : 'تسجيل وحساب الساعات'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Create Transaction */}
      <Modal
        isOpen={isTransactionModalOpen}
        onClose={() => setIsTransactionModalOpen(false)}
        title="إضافة حركة مالية للموظف (سلفة / مكافأة / خصم)"
      >
        <form onSubmit={handleCreateTransaction} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">الموظف</label>
            <select
              value={transactionForm.employee_id}
              onChange={(e) =>
                setTransactionForm({ ...transactionForm, employee_id: e.target.value })
              }
              className="w-full border rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                borderColor: 'var(--border-color)',
              }}
            >
              <option value="">-- اختر الموظف --</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">نوع الحركة</label>
              <select
                value={transactionForm.type}
                onChange={(e) =>
                  setTransactionForm({ ...transactionForm, type: e.target.value as any })
                }
                className="w-full border rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderColor: 'var(--border-color)',
                }}
              >
                <option value="advance">سلفة مالية (-)</option>
                <option value="bonus">مكافأة تميز (+)</option>
                <option value="deduction">خصم جزائي (-)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">المبلغ (ج.م)</label>
              <input
                type="number"
                step="any"
                required
                min={1}
                value={transactionForm.amount}
                onChange={(e) =>
                  setTransactionForm({ ...transactionForm, amount: Number(e.target.value) })
                }
                className="w-full border rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono focus:outline-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderColor: 'var(--border-color)',
                }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">البيان والسبب</label>
            <input
              type="text"
              placeholder="مثال: سلفة مصاريف / مكافأة تقييم العميل..."
              value={transactionForm.notes}
              onChange={(e) =>
                setTransactionForm({ ...transactionForm, notes: e.target.value })
              }
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
              onClick={() => setIsTransactionModalOpen(false)}
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
              {submitting ? 'جاري التسجيل...' : 'حفظ الحركة المالية'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Real-time Payroll Calculation & Settlement */}
      <Modal
        isOpen={isPayrollModalOpen}
        onClose={() => {
          setIsPayrollModalOpen(false);
          setSelectedEmployee(null);
          setPayrollCalc(null);
        }}
        title={`كشف الحساب وتصفية الراتب اللحظي: ${selectedEmployee?.name}`}
        maxWidth="2xl"
      >
        {payrollCalc ? (
          <div className="space-y-4">
            {/* Header info */}
            <div
              className="flex justify-between items-center p-3.5 rounded-2xl border text-xs"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                borderColor: 'var(--border-color)',
              }}
            >
              <div>
                <div className="font-bold text-slate-100 text-sm">{payrollCalc.employee.name}</div>
                <div className="text-slate-400 mt-0.5">{payrollCalc.employee.role} | {formatEGP(payrollCalc.employee.hourly_rate)}/ساعة</div>
              </div>
              <div className="text-left font-mono text-slate-400 text-xs space-y-0.5">
                <div>الفترة: <span className="font-bold text-slate-200">{formatLocalDateStr(payrollCalc.period.start)}</span></div>
                <div>إلى: <span className="font-bold text-slate-200">{formatLocalDateStr(payrollCalc.period.end)}</span></div>
              </div>
            </div>

            {/* Metrics Breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div
                className="p-2.5 rounded-xl border"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.35)',
                  borderColor: 'var(--border-color)',
                }}
              >
                <div className="text-slate-500 text-[10px]">أيام الحضور</div>
                <div className="font-bold text-slate-200 text-base">{payrollCalc.work_metrics.attendance_days}</div>
              </div>
              <div
                className="p-2.5 rounded-xl border"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.35)',
                  borderColor: 'var(--border-color)',
                }}
              >
                <div className="text-slate-500 text-[10px]">إجمالي الساعات الفعلية</div>
                <div className="font-bold text-emerald-400 text-base">{payrollCalc.work_metrics.total_hours_worked}h</div>
              </div>
              <div
                className="p-2.5 rounded-xl border"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.35)',
                  borderColor: 'var(--border-color)',
                }}
              >
                <div className="text-slate-500 text-[10px]">الساعات الإضافية</div>
                <div className="font-bold text-base" style={{ color: 'var(--color-primary)' }}>+{payrollCalc.work_metrics.total_overtime_hours}h</div>
              </div>
              <div
                className="p-2.5 rounded-xl border"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.35)',
                  borderColor: 'var(--border-color)',
                }}
              >
                <div className="text-slate-500 text-[10px]">ساعات الخصم/الغياب</div>
                <div className="font-bold text-rose-400 text-base">-{payrollCalc.work_metrics.total_deducted_hours}h</div>
              </div>
            </div>

            {/* Financial Equation Detail */}
            <div
              className="p-4 rounded-2xl border space-y-2 text-xs"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                borderColor: 'var(--border-color)',
              }}
            >
              <div className="flex justify-between text-slate-300">
                <span>
                  الراتب الأساسي حسب ساعات العمل الفعلية ({payrollCalc.work_metrics.total_hours_worked}h × {formatEGP(payrollCalc.employee.hourly_rate)}):
                </span>
                <span className="font-mono">
                  {formatEGP(payrollCalc.financial_breakdown.attended_hours_amount ?? (payrollCalc.work_metrics.total_hours_worked * payrollCalc.employee.hourly_rate))}
                </span>
              </div>

              {/* Paid Weekly Off Earnings */}
              {payrollCalc.work_metrics.paid_weekly_off_days !== undefined && payrollCalc.work_metrics.paid_weekly_off_days > 0 && (
                <div className="flex justify-between text-emerald-300">
                  <span>
                    أجر الإجازات الأسبوعية المدفوعة ({payrollCalc.work_metrics.paid_weekly_off_days} أيام = {payrollCalc.work_metrics.paid_weekly_off_hours}h):
                  </span>
                  <span className="font-mono font-bold">
                    +{formatEGP(payrollCalc.financial_breakdown.paid_weekly_off_amount || 0)}
                  </span>
                </div>
              )}

              <div className="flex justify-between" style={{ color: 'var(--color-primary)' }}>
                <span>
                  بدل الساعات الإضافية (سعر الساعة: {formatEGP(payrollCalc.financial_breakdown.effective_overtime_rate ?? (payrollCalc.employee.overtime_hourly_rate || payrollCalc.employee.hourly_rate))} × {payrollCalc.work_metrics.total_overtime_hours} ساعة):
                </span>
                <span className="font-mono">+{formatEGP(payrollCalc.financial_breakdown.overtime_amount)}</span>
              </div>
              <div className="flex justify-between text-emerald-400">
                <span>إجمالي المكافآت المعتمدة:</span>
                <span className="font-mono">+{formatEGP(payrollCalc.financial_breakdown.bonuses_amount)}</span>
              </div>

              {/* Deducted Hours Breakdown */}
              {payrollCalc.financial_breakdown.hours_deduction_amount !== undefined &&
                payrollCalc.financial_breakdown.hours_deduction_amount > 0 && (
                  <div className="flex justify-between text-rose-400">
                    <span>خصم ساعات التأخير/الغياب (-{payrollCalc.work_metrics.total_deducted_hours}h × {formatEGP(payrollCalc.employee.hourly_rate)}):</span>
                    <span className="font-mono">-{formatEGP(payrollCalc.financial_breakdown.hours_deduction_amount)}</span>
                  </div>
                )}

              {/* Penalty Deductions */}
              {payrollCalc.financial_breakdown.penalty_deductions_amount !== undefined &&
                payrollCalc.financial_breakdown.penalty_deductions_amount > 0 && (
                  <div className="flex justify-between text-rose-400">
                    <span>الخصومات الجزائية الإدارية:</span>
                    <span className="font-mono">-{formatEGP(payrollCalc.financial_breakdown.penalty_deductions_amount)}</span>
                  </div>
                )}

              {/* Total Deductions if both are 0 but deductions_amount exists */}
              {(!payrollCalc.financial_breakdown.hours_deduction_amount &&
                !payrollCalc.financial_breakdown.penalty_deductions_amount &&
                payrollCalc.financial_breakdown.deductions_amount > 0) && (
                <div className="flex justify-between text-rose-400">
                  <span>إجمالي الخصومات:</span>
                  <span className="font-mono">-{formatEGP(payrollCalc.financial_breakdown.deductions_amount)}</span>
                </div>
              )}

              <div className="flex justify-between text-amber-400">
                <span>السلف غير المسواة (تخصم من الراتب):</span>
                <span className="font-mono">-{formatEGP(payrollCalc.financial_breakdown.advances_deducted)}</span>
              </div>

              {/* Net Payable / Debt Amount Display */}
              <div className="pt-3 border-t flex justify-between items-baseline font-bold text-sm" style={{ borderColor: 'var(--border-color)' }}>
                <span className="text-slate-100 font-black">
                  {payrollCalc.financial_breakdown.net_payable_salary < 0
                    ? 'رصيد المديونية على الموظف (سالب):'
                    : 'صافي الراتب المستحق للصرف:'}
                </span>
                <div
                  className={`font-mono text-2xl font-black ${
                    payrollCalc.financial_breakdown.net_payable_salary < 0
                      ? 'text-rose-400 animate-pulse'
                      : 'text-emerald-400'
                  }`}
                >
                  {formatEGP(payrollCalc.financial_breakdown.net_payable_salary)}
                </div>
              </div>
            </div>

            {/* Negative Balance / Debt Warning Alert Box */}
            {payrollCalc.financial_breakdown.net_payable_salary < 0 && (
              <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/50 text-rose-200 text-xs flex items-start gap-3 animate-in zoom-in-95">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-rose-300 text-sm">
                    تنبيه: إجمالي السلف والخصومات يتجاوز المستحقات — الموظف مدين للمغسلة
                  </div>
                  <div className="text-[11px] text-rose-300/90 leading-relaxed">
                    المبلغ المطلوب من الموظف هو{' '}
                    <strong className="font-mono text-white underline">
                      {formatEGP(Math.abs(payrollCalc.financial_breakdown.net_payable_salary))}
                    </strong>
                    . عند اعتماد التصفية، سيتم تسجيل الصرف كـ <strong>0.00 ج.م</strong> بالخزينة،
                    وترحيل المديونية تلقائياً كسلفة للشهر القادم.
                  </div>
                </div>
              </div>
            )}

            {/* Pending Transactions list */}
            {payrollCalc.pending_transactions.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-slate-400">
                  الحركات التي ستتم تسويتها تلقائياً ({payrollCalc.pending_transactions.length} حركات):
                </div>
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {payrollCalc.pending_transactions.map((t) => (
                    <div
                      key={t.id}
                      className="flex justify-between text-[10px] p-2 rounded-lg border"
                      style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.4)',
                        borderColor: 'var(--border-color)',
                      }}
                    >
                      <span className="text-slate-300">{t.notes || t.type}</span>
                      <span className="font-mono font-bold text-slate-200">
                        {t.type === 'bonus' ? '+' : '-'}{formatEGP(t.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <button
                type="button"
                onClick={() => setIsPayrollModalOpen(false)}
                className="px-4 py-2.5 border text-slate-300 rounded-xl text-xs font-semibold hover:bg-white/5 transition-colors"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderColor: 'var(--border-color)',
                }}
              >
                إلغاء
              </button>

              {payrollCalc.financial_breakdown.net_payable_salary < 0 ? (
                <button
                  type="button"
                  onClick={handleSettlePayroll}
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-700 hover:to-rose-700 text-white rounded-xl text-xs font-black shadow-lg shadow-rose-600/20 disabled:opacity-50"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>{submitting ? 'جاري الترحيل...' : 'اعتماد وترحيل المديونية للشهر القادم'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSettlePayroll}
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{submitting ? 'جاري الاعتماد...' : 'اعتماد الصرف وتصفية الراتب'}</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-500">جاري احتساب الراتب...</div>
        )}
      </Modal>

      {/* Modal: Delete Employee Confirmation */}
      {employeeToDelete && (
        <Modal
          isOpen={!!employeeToDelete}
          onClose={() => {
            if (!isDeletingEmp) setEmployeeToDelete(null);
          }}
          title="تأكيد حذف الموظف"
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-200 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-sm text-rose-300">تحذير حذف سجل الموظف نهائياً</div>
                <p>
                  أنت على وشك حذف الموظف <strong className="text-white">({employeeToDelete.name})</strong>،
                  المسمى الوظيفي: <strong className="text-white">({employeeToDelete.role})</strong>.
                  سيتم حذف سجلات الحضور والانصراف والحركات المالية وسندات الصرف الخاصة به.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setEmployeeToDelete(null)}
                disabled={isDeletingEmp}
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
                onClick={handleConfirmDeleteEmployee}
                disabled={isDeletingEmp}
                className="flex items-center justify-center gap-1.5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50"
              >
                {isDeletingEmp ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>تأكيد الحذف النهائي</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Delete Attendance Confirmation */}
      {attendanceToDelete && (
        <Modal
          isOpen={!!attendanceToDelete}
          onClose={() => {
            if (!isDeletingAtt) setAttendanceToDelete(null);
          }}
          title="تأكيد حذف سجل الحضور"
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-200 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-sm text-rose-300">حذف سجل حضور وانصراف</div>
                <p>
                  هل أنت متأكد من حذف سجل الحضور للموظف <strong className="text-white">({attendanceToDelete.employee_name})</strong> لتاريخ{' '}
                  <strong className="text-white font-mono">{attendanceToDelete.work_date}</strong> بإجمالي ساعات (
                  <strong className="text-white font-mono">{attendanceToDelete.actual_hours}h</strong>)؟
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setAttendanceToDelete(null)}
                disabled={isDeletingAtt}
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
                onClick={handleConfirmDeleteAttendance}
                disabled={isDeletingAtt}
                className="flex items-center justify-center gap-1.5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50"
              >
                {isDeletingAtt ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>تأكيد الحذف</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Delete Transaction Confirmation */}
      {transactionToDelete && (
        <Modal
          isOpen={!!transactionToDelete}
          onClose={() => {
            if (!isDeletingTrans) setTransactionToDelete(null);
          }}
          title="تأكيد حذف الحركة المالية"
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-200 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-sm text-rose-300">حذف حركة مالية</div>
                <p>
                  هل أنت متأكد من حذف حركة ({transactionToDelete.type === 'bonus' ? 'المكافأة' : transactionToDelete.type === 'advance' ? 'السلفة' : 'الخصم'}) للموظف{' '}
                  <strong className="text-white">({transactionToDelete.employee_name})</strong> بمبلغ{' '}
                  <strong className="text-white font-mono">{formatEGP(transactionToDelete.amount)}</strong>؟
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setTransactionToDelete(null)}
                disabled={isDeletingTrans}
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
                onClick={handleConfirmDeleteTransaction}
                disabled={isDeletingTrans}
                className="flex items-center justify-center gap-1.5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50"
              >
                {isDeletingTrans ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>تأكيد الحذف</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default HrPayrollTab;

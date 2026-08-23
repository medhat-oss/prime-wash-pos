import React, { useState, useEffect } from 'react';
import {
  LogIn,
  LogOut,
  Delete,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  UserCheck,
} from 'lucide-react';
import Modal from './Modal.js';
import { Employee } from '../types/index.js';
import { hrApi } from '../api/client.js';
import { useToast } from './Toast.js';

interface ClockInOutModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  initialMode?: 'check_in' | 'check_out' | 'both';
  onSuccess?: () => void;
}

export const ClockInOutModal: React.FC<ClockInOutModalProps> = ({
  isOpen,
  onClose,
  employees,
  initialMode = 'both',
  onSuccess,
}) => {
  const toast = useToast();

  const [activeMode, setActiveMode] = useState<'check_in' | 'check_out'>(
    initialMode === 'check_out' ? 'check_out' : 'check_in'
  );
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [pin, setPin] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [todayStatus, setTodayStatus] = useState<
    Record<
      string,
      {
        status: 'not_attended' | 'active_shift' | 'completed_shift';
        label: string;
        badgeColor: string;
        check_in?: string;
        check_out?: string;
      }
    >
  >({});
  const [lastResult, setLastResult] = useState<{
    action: string;
    employee_name: string;
    time: string;
    hours_worked?: number;
    overtime_hours?: number;
    message: string;
  } | null>(null);

  // Fetch today status on open
  useEffect(() => {
    if (isOpen) {
      if (initialMode === 'check_out') {
        setActiveMode('check_out');
      } else if (initialMode === 'check_in') {
        setActiveMode('check_in');
      }
      setPin('');
      setNotes('');
      setErrorMessage(null);
      setLastResult(null);

      // Load status map
      hrApi
        .getTodayAttendanceStatus()
        .then((data) => setTodayStatus(data || {}))
        .catch(() => {});
    }
  }, [isOpen, initialMode]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
        if (pin.length < 6) {
          setPin((prev) => prev + e.key);
          setErrorMessage(null);
        }
      } else if (e.key === 'Backspace') {
        setPin((prev) => prev.slice(0, -1));
        setErrorMessage(null);
      } else if (e.key === 'Enter') {
        if (selectedEmpId && pin.length >= 4) {
          handleClockAction(activeMode);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, pin, selectedEmpId, activeMode]);

  const handleKeyPress = (num: string) => {
    if (pin.length < 6) {
      setPin((prev) => prev + num);
      setErrorMessage(null);
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setErrorMessage(null);
  };

  const handleClear = () => {
    setPin('');
    setErrorMessage(null);
  };

  const handleClockAction = async (action: 'check_in' | 'check_out') => {
    if (!selectedEmpId) {
      toast.warning('يرجى اختيار اسم الموظف أولاً');
      return;
    }
    if (!pin) {
      toast.warning('يرجى إدخال رمز PIN السري الخاص بك');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      setLastResult(null);
      const res = await hrApi.clockWithPin({
        employee_id: selectedEmpId,
        pin_code: pin,
        action,
        notes: notes || undefined,
      });

      setLastResult(res.data as any);
      toast.success(
        res.message,
        action === 'check_in' ? 'تم تسجيل الحضور بنجاح' : 'تم تسجيل الانصراف بنجاح'
      );
      setPin('');
      setNotes('');

      // Refresh today status map
      try {
        const updated = await hrApi.getTodayAttendanceStatus();
        setTodayStatus(updated || {});
      } catch (_) {}

      if (onSuccess) onSuccess();
    } catch (err: any) {
      const msg = err.message || 'خطأ في التحقق من الرمز أو حالة الشفت';
      setErrorMessage(msg);
      if (msg.includes('بالفعل') || msg.includes('غير مسجل') || msg.includes('مسجل حضور')) {
        toast.warning(msg, 'تنبيه الشفت');
      } else {
        toast.error(msg, 'تنبيه الشفت');
      }
      setPin('');
    } finally {

      setLoading(false);
    }
  };

  const modalTitle =
    initialMode === 'check_in'
      ? 'تسجيل حضور الموظفين (بدء الشفت)'
      : initialMode === 'check_out'
      ? 'تسجيل إنصراف الموظفين (إنهاء الشفت)'
      : 'تسجيل الحضور والإنصراف (شفت العمل)';

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setLastResult(null);
        setPin('');
        onClose();
      }}
      title={modalTitle}
      maxWidth="md"
    >
      <div className="space-y-4 select-none">
        {/* Mode Selector Pill if mode is 'both' */}
        {initialMode === 'both' && (
          <div
            className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl border"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              borderColor: 'var(--border-color)',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveMode('check_in')}
              className={`flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all ${
                activeMode === 'check_in'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>تسجيل حضور (شفت)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMode('check_out')}
              className={`flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all ${
                activeMode === 'check_out'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>تسجيل إنصراف (شفت)</span>
            </button>
          </div>
        )}

        {/* Result Banner if just clocked */}
        {lastResult && (
          <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-100 flex items-start gap-3 animate-in zoom-in-95">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <div className="font-bold text-sm text-emerald-300">
                {lastResult.action === 'check_in' ? '🟢 تم تسجيل الحضور بنجاح' : '🔴 تم تسجيل الإنصراف بنجاح'}
              </div>
              <div>{lastResult.message}</div>
              {lastResult.hours_worked !== undefined && (
                <div className="font-mono text-xs text-emerald-300 pt-1">
                  إجمالي الساعات الفعلية: {lastResult.hours_worked} ساعة | الساعة: {lastResult.time}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Employee Select */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">
            اختر الموظف / الفني
          </label>
          <select
            value={selectedEmpId}
            onChange={(e) => {
              setSelectedEmpId(e.target.value);
              setErrorMessage(null);
              setLastResult(null);
            }}
            className="w-full border rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none transition-colors"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              borderColor: 'var(--border-color)',
            }}
          >
            <option value="">-- اضغط لاختيار اسمك --</option>
            {employees
              .filter((e) => e.status === 'active')
              .map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.role})
                </option>
              ))}
          </select>

          {/* Today shift status badge for selected employee */}
          {selectedEmpId && todayStatus[selectedEmpId] && (
            <div
              className="flex items-center justify-between gap-2 mt-2 px-3 py-2 rounded-xl border text-xs animate-in fade-in"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                borderColor: 'var(--border-color)',
              }}
            >
              <div className="flex items-center gap-1.5 text-slate-300">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>حالة الدوام اليوم:</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] border ${todayStatus[selectedEmpId].badgeColor}`}>
                  {todayStatus[selectedEmpId].label}
                </span>
                {todayStatus[selectedEmpId].check_in && (
                  <span className="text-slate-400 text-[10px] font-mono">
                    (منذ: {new Date(todayStatus[selectedEmpId].check_in!).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })})
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Inline Error Message Banner */}
        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-rose-950/70 border border-rose-500/50 text-rose-200 text-xs flex items-start gap-2.5 animate-in fade-in zoom-in-95">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="font-semibold leading-relaxed flex-1">{errorMessage}</div>
          </div>
        )}

        {/* PIN Code Dots Input */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="block text-xs font-semibold text-slate-400">
              أدخل رمز PIN السري الخاص بك (4-6 أرقام)
            </label>
          </div>

          <div
            className="flex justify-center items-center gap-3 py-2.5 rounded-2xl border mb-3"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              borderColor: 'var(--border-color)',
            }}
          >
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                  pin.length > i
                    ? 'border-transparent scale-110 shadow-md'
                    : 'border-slate-700 bg-slate-900'
                }`}
                style={{
                  backgroundColor: pin.length > i ? 'var(--color-primary)' : undefined,
                }}
              />
            ))}
          </div>

          {/* Numeric Touch Keypad */}
          <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto mb-3">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleKeyPress(num)}
                className="h-11 rounded-xl border text-slate-100 text-lg font-bold font-mono transition-all active:scale-95 shadow-sm hover:bg-white/10"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.35)',
                  borderColor: 'var(--border-color)',
                }}
              >
                {num}
              </button>
            ))}

            <button
              type="button"
              onClick={handleClear}
              className="h-11 rounded-xl border text-slate-400 hover:text-rose-300 text-xs font-bold transition-all active:scale-95"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                borderColor: 'var(--border-color)',
              }}
            >
              مسح
            </button>

            <button
              type="button"
              onClick={() => handleKeyPress('0')}
              className="h-11 rounded-xl border text-slate-100 text-lg font-bold font-mono transition-all active:scale-95 shadow-sm hover:bg-white/10"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                borderColor: 'var(--border-color)',
              }}
            >
              0
            </button>

            <button
              type="button"
              onClick={handleBackspace}
              className="h-11 rounded-xl border text-slate-400 hover:text-slate-200 flex items-center justify-center transition-all active:scale-95"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                borderColor: 'var(--border-color)',
              }}
            >
              <Delete className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-2">
          {activeMode === 'check_in' ? (
            <button
              type="button"
              onClick={() => handleClockAction('check_in')}
              disabled={loading || !selectedEmpId || pin.length < 4}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-emerald-600/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              <span>تسجيل حضور (بدء الشفت)</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleClockAction('check_out')}
              disabled={loading || !selectedEmpId || pin.length < 4}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-700 hover:to-amber-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-rose-600/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogOut className="w-4 h-4" />
              )}
              <span>تسجيل إنصراف (إنهاء الشفت)</span>
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ClockInOutModal;

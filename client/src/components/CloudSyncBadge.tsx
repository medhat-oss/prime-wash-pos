import React, { useState, useEffect, useCallback } from 'react';
import Modal from './Modal.js';
import { useToast } from './Toast.js';
import {
  SyncStatusPayload,
  SyncEngineStatus,
  triggerSyncQueueProcess,
  retryFailedSyncItems,
  retrySyncQueueItem,
  purgeFailedSyncItems,
  purgeStaleFailedSyncItems,
  deleteSyncQueueItem,
  getPendingSyncCount,
  getFailedSyncCount,
  getFailedSyncItems,
  getActionTypeArabicLabel,
} from '../sync/syncEngine.js';
import { SyncQueueItem } from '../db/indexedDB.js';
import { formatCurrency } from '../utils/formatters.js';

export const CloudSyncBadge: React.FC = () => {
  const toast = useToast();

  const [syncState, setSyncState] = useState<SyncStatusPayload>({
    status: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'idle',
    pendingCount: 0,
    failedCount: 0,
    lastSyncedAt: null,
  });

  const [isHovered, setIsHovered] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [failedItems, setFailedItems] = useState<SyncQueueItem[]>([]);
  const [expandedPayloadId, setExpandedPayloadId] = useState<string | null>(null);
  const [activeItemActionId, setActiveItemActionId] = useState<string | null>(null);

  // Fetch failed items list
  const refreshFailedItems = useCallback(async () => {
    try {
      const items = await getFailedSyncItems();
      setFailedItems(items);
    } catch {
      setFailedItems([]);
    }
  }, []);

  // Sync state initialization & listeners
  useEffect(() => {
    const initCounts = async () => {
      try {
        const pending = await getPendingSyncCount();
        const failed = await getFailedSyncCount();
        setSyncState((prev) => ({
          ...prev,
          status: !navigator.onLine ? 'offline' : failed > 0 ? 'error' : 'idle',
          pendingCount: pending,
          failedCount: failed,
        }));
        if (failed > 0) {
          await refreshFailedItems();
        }
      } catch {}
    };

    initCounts();

    const handleSyncStatus = (e: any) => {
      if (e.detail) {
        setSyncState(e.detail);
        if (e.detail.failedCount > 0 || isModalOpen) {
          refreshFailedItems();
        } else {
          setFailedItems([]);
        }
      }
    };

    const handleOnline = () => {
      setSyncState((prev) => ({ ...prev, status: 'syncing' }));
      refreshFailedItems();
    };

    const handleOffline = () => {
      setSyncState((prev) => ({ ...prev, status: 'offline' }));
    };

    window.addEventListener('sync-status-changed', handleSyncStatus);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('sync-status-changed', handleSyncStatus);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshFailedItems, isModalOpen]);

  // When opening modal, refresh failed list
  useEffect(() => {
    if (isModalOpen) {
      refreshFailedItems();
    }
  }, [isModalOpen, refreshFailedItems]);

  // Manual Full Sync & Retry All
  const handleManualSync = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isManualSyncing) return;
    setIsManualSyncing(true);

    try {
      if (syncState.failedCount > 0) {
        await retryFailedSyncItems();
      }
      const result = await triggerSyncQueueProcess();
      await refreshFailedItems();

      if (result.processed > 0) {
        toast.success(`تمت مزامنة ${result.processed} عملية بنجاح مع السحابة`);
      } else if (result.failed > 0) {
        toast.error(`تعذر مزامنة ${result.failed} عملية، يرجى فحص التفاصيل`);
      } else {
        toast.info('النظام متزامن بالفعل مع السحابة');
      }
    } catch (err: any) {
      toast.error('حدث خطأ أثناء الاتصال بالخادم');
    } finally {
      setTimeout(() => setIsManualSyncing(false), 600);
    }
  };

  // Purge All Failed Items
  const handlePurgeAll = async () => {
    if (isPurging) return;
    if (!window.confirm('هل أنت متأكد من مسح كافة العمليات المتعثرة من قائمة المزامنة؟')) return;

    setIsPurging(true);
    try {
      const count = await purgeFailedSyncItems();
      await refreshFailedItems();
      toast.success(`تم مسح ${count} عملية متعثرة من قائمة المزامنة بنجاح`);
    } catch {
      toast.error('تعذر مسح العمليات المتعثرة');
    } finally {
      setIsPurging(false);
    }
  };

  // Purge Stale Failed Items (>24h)
  const handlePurgeStale = async () => {
    try {
      const count = await purgeStaleFailedSyncItems(24);
      await refreshFailedItems();
      if (count > 0) {
        toast.success(`تم تنظيف ${count} عملية قديمة (> 24 ساعة)`);
      } else {
        toast.info('لا توجد عمليات قديمة أقدم من 24 ساعة');
      }
    } catch {
      toast.error('تعذر تنظيف العمليات القديمة');
    }
  };

  // Retry Single Failed Item
  const handleRetryItem = async (itemId: string, actionType: string) => {
    setActiveItemActionId(itemId);
    try {
      if (actionType === 'START_SHIFT') {
        // Direct Instant Resolution: Un-syncable START_SHIFT is deleted immediately
        await deleteSyncQueueItem(itemId);
        await refreshFailedItems();
        toast.success('تم تنظيف وردية ملغاة بسبب وجود وردية نشطة بالفعل على السحابة');
        return;
      }

      await retrySyncQueueItem(itemId);
      await refreshFailedItems();
      toast.info(`جاري إعادة محاولة: ${getActionTypeArabicLabel(actionType)}`);
    } catch {
      toast.error('تعذر إعادة محاولة العملية');
    } finally {
      setTimeout(() => setActiveItemActionId(null), 400);
    }
  };

  // Delete Single Failed Item
  const handleDeleteItem = async (itemId: string, actionType: string) => {
    setActiveItemActionId(itemId);
    try {
      await deleteSyncQueueItem(itemId);
      await refreshFailedItems();
      toast.success(`تم حذف وتجاهل: ${getActionTypeArabicLabel(actionType)}`);
    } catch {
      toast.error('تعذر حذف العملية');
    } finally {
      setActiveItemActionId(null);
    }
  };

  const isSyncing = syncState.status === 'syncing' || isManualSyncing;
  const isOffline = syncState.status === 'offline' || (typeof navigator !== 'undefined' && !navigator.onLine);
  const hasErrors = syncState.failedCount > 0;
  const hasPending = syncState.pendingCount > 0;

  // Determine appearance and labels for navbar badge
  let badgeColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20';
  let dotColor = 'bg-emerald-400';
  let label = 'متصل سحابياً';
  let tooltip = 'جميع الفواتير والعمليات متزامنة لحظياً مع السحابة';

  if (hasErrors) {
    badgeColor = 'bg-rose-950/70 text-rose-300 border-rose-500/60 hover:bg-rose-900/80 shadow-[0_0_10px_rgba(244,63,94,0.3)]';
    dotColor = 'bg-rose-400 animate-pulse';
    label = `تعذر المزامنة (${syncState.failedCount})`;
    tooltip = 'يوجد عمليات تعذر مزامنتها مع السحابة. اضغط لتشخيص الخطأ وإدارته';
  } else if (isSyncing) {
    badgeColor = 'bg-cyan-950/60 text-cyan-300 border-cyan-500/50';
    dotColor = 'bg-cyan-400 animate-ping';
    label = hasPending ? `مزامنة (${syncState.pendingCount})...` : 'جاري المزامنة...';
    tooltip = 'يتم الآن رفع العمليات والبيانات إلى الخادم السحابي';
  } else if (isOffline) {
    if (hasPending) {
      badgeColor = 'bg-amber-950/60 text-amber-300 border-amber-500/40 hover:bg-amber-900/60';
      dotColor = 'bg-amber-400 animate-pulse';
      label = `أوفلاين (${syncState.pendingCount} معلق)`;
      tooltip = 'العمل مستمر بدون إنترنت. سيتم رفع جميع العمليات فور عودة الاتصال تلقائياً';
    } else {
      badgeColor = 'bg-slate-900/80 text-slate-300 border-slate-700/50 hover:bg-slate-800';
      dotColor = 'bg-amber-400';
      label = 'أوفلاين (جاهز)';
      tooltip = 'النظام يعمل بالكامل أوفلاين مع حفظ كافة العمليات في قاعدة البيانات المحلية';
    }
  }

  // Helper to format payload summary
  const renderPayloadSummary = (item: SyncQueueItem) => {
    const p = item.payload;
    if (!p) return null;

    if (item.action_type === 'CREATE_ORDER') {
      return (
        <div className="text-[11px] text-slate-300 grid grid-cols-2 sm:grid-cols-3 gap-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
          <div><span className="text-slate-400 font-bold">الفاتورة:</span> {p.order_code || p.id}</div>
          <div><span className="text-slate-400 font-bold">العميل:</span> {p.customer_name || 'عميل نقدي'}</div>
          <div><span className="text-slate-400 font-bold">المبلغ الإجمالي:</span> {formatCurrency(p.total)}</div>
          <div><span className="text-slate-400 font-bold">الخدمات:</span> {p.items?.length || 0} خدمة</div>
          <div><span className="text-slate-400 font-bold">طريقة الدفع:</span> {p.payment_method === 'card' ? 'بطاقة' : p.payment_method === 'transfer' ? 'تحويل' : 'كاش'}</div>
        </div>
      );
    }

    if (item.action_type === 'CREATE_EXPENSE' || item.action_type === 'UPDATE_EXPENSE') {
      return (
        <div className="text-[11px] text-slate-300 grid grid-cols-2 sm:grid-cols-3 gap-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
          <div><span className="text-slate-400 font-bold">المبلغ:</span> {formatCurrency(p.amount)}</div>
          <div><span className="text-slate-400 font-bold">البند:</span> {p.category}</div>
          <div><span className="text-slate-400 font-bold">البيان:</span> {p.description || '-'}</div>
        </div>
      );
    }

    if (item.action_type === 'CLOCK_ACTION') {
      return (
        <div className="text-[11px] text-slate-300 grid grid-cols-2 gap-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
          <div><span className="text-slate-400 font-bold">الموظف:</span> {p.employee_name || p.employee_id}</div>
          <div><span className="text-slate-400 font-bold">نوع الحركة:</span> {p.action_type === 'clock_out' ? 'انصراف' : 'حضور'}</div>
        </div>
      );
    }

    return (
      <div className="text-[11px] text-slate-300 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 font-mono text-xs overflow-x-auto">
        {JSON.stringify(p, null, 2)}
      </div>
    );
  };

  return (
    <>
      <div
        className="relative inline-flex items-center select-none"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Badge Trigger Button */}
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border text-[11px] sm:text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer ${badgeColor}`}
          title={tooltip}
        >
          {isSyncing ? (
            <span className="w-2 h-2 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin shrink-0" />
          ) : (
            <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
          )}
          <span className="hidden sm:inline font-mono">{label}</span>
          <span className="sm:hidden font-mono text-[10px]">
            {hasErrors ? `خطأ (${syncState.failedCount})` : isSyncing ? 'مزامنة...' : hasPending ? `${syncState.pendingCount} معلق` : 'سحابي'}
          </span>
        </button>

        {/* Hover Quick Preview Tooltip */}
        {isHovered && !isModalOpen && (
          <div
            className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 w-72 p-3 rounded-2xl bg-slate-900/95 border border-slate-700/80 text-slate-200 text-[11px] shadow-2xl backdrop-blur-md transition-opacity duration-200 font-tajawal text-center"
            dir="rtl"
          >
            <div className="font-bold text-white mb-1.5 flex items-center justify-between">
              <span className="text-xs">حالة المزامنة السحابية</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isOffline ? 'bg-amber-950 text-amber-300' : 'bg-emerald-950 text-emerald-300'}`}>
                {isOffline ? 'أوفلاين' : 'متصل'}
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed text-[11px]">{tooltip}</p>

            <div className="mt-2.5 pt-2 border-t border-slate-800 text-[10px] text-slate-400 flex justify-between px-1">
              <span>معلق: <strong className="text-white">{syncState.pendingCount}</strong></span>
              <span>أخطاء: <strong className={hasErrors ? 'text-rose-400' : 'text-slate-300'}>{syncState.failedCount}</strong></span>
              <span>{syncState.lastSyncedAt ? new Date(syncState.lastSyncedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : 'لم تتم بعد'}</span>
            </div>

            <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between gap-1.5">
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isManualSyncing}
                className="flex-1 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-[10px] transition-colors flex items-center justify-center gap-1"
              >
                {isManualSyncing ? <span className="w-2.5 h-2.5 border-2 border-white border-t-transparent animate-spin rounded-full" /> : 'مزامنة فورية'}
              </button>
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className={`flex-1 py-1.5 rounded-xl font-bold text-[10px] transition-colors flex items-center justify-center gap-1 ${hasErrors ? 'bg-rose-900/80 hover:bg-rose-800 text-rose-200' : 'bg-indigo-900/70 hover:bg-indigo-800 text-indigo-200'}`}
              >
                {hasErrors ? 'تشخيص الأخطاء' : 'مركز المزامنة'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Cloud Sync Diagnostics & Error Inspection Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="مركز تشخيص ومزامنة السحابة"
        maxWidth="3xl"
      >
        <div className="space-y-5 font-tajawal" dir="rtl">
          {/* Header Summary KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            {/* Status */}
            <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col items-center justify-center text-center">
              <span className="text-[10px] text-slate-400 font-bold mb-1">حالة الاتصال</span>
              <div className="flex items-center gap-1.5 text-xs font-bold font-mono">
                {isOffline ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-amber-400">بدون إنترنت</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-emerald-400">متصل سحابياً</span>
                  </>
                )}
              </div>
            </div>

            {/* Pending Count */}
            <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col items-center justify-center text-center">
              <span className="text-[10px] text-slate-400 font-bold mb-1">العمليات المعلقة</span>
              <span className="text-base font-black font-mono text-cyan-400">
                {syncState.pendingCount}
              </span>
            </div>

            {/* Failed Count */}
            <div className={`p-3 rounded-2xl border flex flex-col items-center justify-center text-center ${hasErrors ? 'bg-rose-950/40 border-rose-500/50' : 'bg-slate-900/80 border-slate-800'}`}>
              <span className="text-[10px] text-slate-400 font-bold mb-1">العمليات المتعثرة</span>
              <span className={`text-base font-black font-mono ${hasErrors ? 'text-rose-400 animate-pulse' : 'text-slate-300'}`}>
                {syncState.failedCount}
              </span>
            </div>

            {/* Last Synced */}
            <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col items-center justify-center text-center">
              <span className="text-[10px] text-slate-400 font-bold mb-1">آخر مزامنة ناجحة</span>
              <span className="text-xs font-bold font-mono text-slate-300">
                {syncState.lastSyncedAt
                  ? new Date(syncState.lastSyncedAt).toLocaleTimeString('ar-EG', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : 'لم تتم بعد'}
              </span>
            </div>
          </div>

          {/* Quick Actions Control Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isManualSyncing || isOffline}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-all active:scale-95"
              >
                {isManualSyncing ? (
                  <>
                    <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    <span>جاري المزامنة...</span>
                  </>
                ) : (
                  <span>إعادة محاولة المزامنة الآن</span>
                )}
              </button>

              {hasErrors && (
                <button
                  type="button"
                  onClick={handlePurgeAll}
                  disabled={isPurging}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-900/80 hover:bg-rose-800 disabled:opacity-50 text-rose-100 font-bold text-xs border border-rose-500/40 shadow-md transition-all active:scale-95"
                >
                  <span>مسح كافة الأخطاء المعلقة</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePurgeStale}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs transition-colors border border-slate-700"
                title="حذف أي عمليات متعثرة أقدم من 24 ساعة"
              >
                تنظيف السجلات القديمة
              </button>
            </div>
          </div>

          {/* Failed Items List Section */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-slate-100">سجل أخطاء العمليات المتعثرة</h4>
                {hasErrors && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-950 border border-rose-500/50 text-rose-300 text-[11px] font-bold font-mono">
                    {failedItems.length} عملية
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-400">
                {hasErrors ? 'اضغط على إعادة المحاولة أو تجاهل العملية' : 'النظام سليم ومحدث بالكامل'}
              </span>
            </div>

            {failedItems.length > 0 ? (
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {failedItems.map((item) => {
                  const isExpanded = expandedPayloadId === item.id;
                  const isActionLoading = activeItemActionId === item.id;

                  return (
                    <div
                      key={item.id}
                      className="p-3.5 sm:p-4 rounded-2xl bg-rose-950/20 border border-rose-500/40 hover:border-rose-500/60 transition-all shadow-md space-y-3"
                    >
                      {/* Top Row: Action Label + Timestamp + Retries */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2.5 py-1 rounded-xl bg-rose-900/60 border border-rose-500/40 text-rose-200 font-bold text-xs">
                            {getActionTypeArabicLabel(item.action_type)}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-300 font-mono text-[10px]">
                            {item.idempotency_key}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <span className="font-mono">
                            {new Date(item.created_at).toLocaleDateString('ar-EG', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 text-[10px] font-mono border border-slate-800">
                            محاولات: {item.retry_count}/{item.max_retries}
                          </span>
                        </div>
                      </div>

                      {/* Error Box */}
                      <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-600/40 text-rose-200 text-xs flex items-start gap-2">
                        <span className="shrink-0 text-rose-400 font-bold">سبب الخطأ:</span>
                        <span className="font-mono text-[11px] break-all leading-relaxed">
                          {item.last_error || 'تم رفض العملية من الخادم (Rejected by server)'}
                        </span>
                      </div>

                      {/* Payload Summary */}
                      {renderPayloadSummary(item)}

                      {/* Collapsible Full JSON Payload */}
                      {isExpanded && (
                        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[10px] font-mono text-cyan-300 overflow-x-auto">
                          <pre>{JSON.stringify(item.payload, null, 2)}</pre>
                        </div>
                      )}

                      {/* Card Footer Actions */}
                      <div className="flex items-center justify-between pt-1 border-t border-rose-950/60 gap-2">
                        <button
                          type="button"
                          onClick={() => setExpandedPayloadId(isExpanded ? null : item.id)}
                          className="text-[11px] text-slate-400 hover:text-slate-200 font-bold transition-colors"
                        >
                          {isExpanded ? 'إخفاء البيانات ▴' : 'عرض التفاصيل الفنية ▾'}
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRetryItem(item.id, item.action_type)}
                            disabled={isActionLoading || isOffline}
                            className="px-3 py-1.5 rounded-xl bg-amber-600/80 hover:bg-amber-600 disabled:opacity-50 text-white font-bold text-xs transition-colors flex items-center gap-1 shadow-sm"
                          >
                            {isActionLoading ? '...' : 'إعادة المحاولة'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.id, item.action_type)}
                            disabled={isActionLoading}
                            className="px-3 py-1.5 rounded-xl bg-rose-900/60 hover:bg-rose-900 text-rose-200 font-bold text-xs transition-colors border border-rose-700/50 shadow-sm"
                          >
                            حذف وتجاهل
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 rounded-3xl bg-slate-900/40 border border-slate-800 text-center space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-emerald-400 text-xs font-bold font-mono">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>CLOUD SYNC ACTIVE</span>
                </div>
                <h5 className="font-bold text-sm text-slate-100">
                  جميع العمليات متزامنة بنجاح مع السحابة
                </h5>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  لا توجد أي أخطاء أو عمليات معلقة في قاعدة البيانات المحلية. النظام يعمل بأعلى درجات الكفاءة والأمان.
                </p>
              </div>
            )}
          </div>

          {/* System Footer Note */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
            <span className="text-[11px] text-slate-400">
              المعمارية: <strong className="text-slate-200">Offline-First IndexedDB</strong> | فحص دوري كل 20 ثانية
            </span>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-colors"
            >
              إغلاق
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default React.memo(CloudSyncBadge);

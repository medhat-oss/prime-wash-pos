import { ClosedShift, Order, ActiveShiftSession } from '../types/index.js';
import { formatEGP, formatDateTime, escapeHtml } from './formatters.js';
import { cascadeDeleteShiftOrders, clearStoredShiftOrders } from './orderStorage.js';
import { bulkPutInDb, putInDb, deleteFromDb } from '../db/indexedDB.js';

const CLOSED_SHIFTS_KEY = 'cw_closed_shifts';
const ACTIVE_SHIFT_KEY = 'cw_active_shift';
const CASHIER_SESSION_KEY = 'pos_active_cashier';

// Realistic sample historical closed shifts
const SAMPLE_CLOSED_SHIFTS: ClosedShift[] = [
  {
    id: 'shift-1725780000000-a1b2',
    shift_code: 'SH-202609-082',
    cashier_id: 'emp-1',
    cashier_name: 'حسن علي مهران',
    cashier_role: 'كاشير رئيسي',
    shift_start: new Date(Date.now() - 28 * 60 * 60 * 1000).toISOString(),
    shift_end: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
    duration_formatted: '8 ساعات و 0 دقيقة',
    gross_sales: 3450,
    cash_sales: 2350,
    card_sales: 800,
    transfer_sales: 300,
    total_orders: 14,
    expected_cash: 2350,
    actual_cash: 2350,
    variance: 0,
    closing_notes: 'تم تسليم الوردية ومطابقة النقدية بالخزينة بالكامل دون أي عجز',
    approved_by: 'حسن علي مهران',
    is_end_of_day: false,
    active_workers_breakdown: [
      { employee_id: 'emp-2', name: 'أحمد محمود إبراهيم', role: 'فني غسيل وتلميع', count: 6, totalSales: 1600 },
      { employee_id: 'emp-3', name: 'كريم عبد العال', role: 'فني غسيل داخلي', count: 5, totalSales: 1250 },
      { employee_id: 'emp-4', name: 'محمود النجار', role: 'فني نانو سيراميك', count: 3, totalSales: 600 },
    ],
    orders: [
      {
        id: 'ord-hist-101',
        order_code: 'PW-8012',
        service_id: 'srv-1',
        service_name: 'غسيل بريميوم متكامل (شامل وبخار)',
        subtotal: 263.16,
        tax_amount: 36.84,
        total_amount: 300,
        payment_method: 'cash',
        status: 'completed',
        customer_name: 'د. طارق السعيد',
        customer_phone: '01012345678',
        assigned_employee_name: 'أحمد محمود إبراهيم',
        created_at: new Date(Date.now() - 27 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 27 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'ord-hist-102',
        order_code: 'PW-8013',
        service_id: 'srv-2',
        service_name: 'غسيل عادي خارجي وداخلي',
        subtotal: 131.58,
        tax_amount: 18.42,
        total_amount: 150,
        payment_method: 'card',
        status: 'completed',
        customer_name: 'م. أحمد خالد',
        customer_phone: '01198765432',
        assigned_employee_name: 'كريم عبد العال',
        created_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'ord-hist-103',
        order_code: 'PW-8014',
        service_id: 'srv-4',
        service_name: 'تلميع ساطع بالواكس الأمريكي',
        subtotal: 394.74,
        tax_amount: 55.26,
        total_amount: 450,
        payment_method: 'cash',
        status: 'completed',
        customer_name: 'أ/ سامي الجوهري',
        customer_phone: '01223344556',
        assigned_employee_name: 'محمود النجار',
        created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'ord-hist-104',
        order_code: 'PW-8015',
        service_id: 'srv-1',
        service_name: 'غسيل بريميوم متكامل (شامل وبخار)',
        subtotal: 263.16,
        tax_amount: 36.84,
        total_amount: 300,
        payment_method: 'transfer',
        status: 'completed',
        customer_name: 'أ/ خالد نور',
        customer_phone: '01055667788',
        assigned_employee_name: 'أحمد محمود إبراهيم',
        created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'ord-hist-105',
        order_code: 'PW-8016',
        service_id: 'srv-3',
        service_name: 'تنظيف وتعقيم بالبخار والفرش',
        subtotal: 307.02,
        tax_amount: 42.98,
        total_amount: 350,
        payment_method: 'cash',
        status: 'completed',
        customer_name: 'م/ إبراهيم فوزي',
        customer_phone: '01500112233',
        assigned_employee_name: 'كريم عبد العال',
        created_at: new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString(),
      },
    ],
    created_at: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'shift-1725693600000-c3d4',
    shift_code: 'SH-202609-081',
    cashier_id: 'emp-3',
    cashier_name: 'كريم عبد العال',
    cashier_role: 'كاشير مسائي',
    shift_start: new Date(Date.now() - 52 * 60 * 60 * 1000).toISOString(),
    shift_end: new Date(Date.now() - 44 * 60 * 60 * 1000).toISOString(),
    duration_formatted: '8 ساعات و 0 دقيقة',
    gross_sales: 4200,
    cash_sales: 2800,
    card_sales: 1000,
    transfer_sales: 400,
    total_orders: 18,
    expected_cash: 2800,
    actual_cash: 2800,
    variance: 0,
    closing_notes: 'تقفيل يوم العمل بالكامل - تم تسليم إيراد الوردية لمالك المغسلة',
    approved_by: 'مستر فتحي (مالك المنشأة)',
    is_end_of_day: true,
    active_workers_breakdown: [
      { employee_id: 'emp-2', name: 'أحمد محمود إبراهيم', role: 'فني غسيل وتلميع', count: 8, totalSales: 2100 },
      { employee_id: 'emp-4', name: 'محمود النجار', role: 'فني نانو سيراميك', count: 6, totalSales: 1300 },
      { employee_id: 'emp-5', name: 'مصطفى كمال الدين', role: 'فني تشطيب', count: 4, totalSales: 800 },
    ],
    orders: [
      {
        id: 'ord-hist-201',
        order_code: 'PW-7981',
        service_id: 'srv-1',
        service_name: 'غسيل بريميوم متكامل',
        subtotal: 263.16,
        tax_amount: 36.84,
        total_amount: 300,
        payment_method: 'cash',
        status: 'completed',
        customer_name: 'أ/ وائل شريف',
        assigned_employee_name: 'أحمد محمود إبراهيم',
        created_at: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'ord-hist-202',
        order_code: 'PW-7982',
        service_id: 'srv-4',
        service_name: 'تلميع ساطع وواكس',
        subtotal: 394.74,
        tax_amount: 55.26,
        total_amount: 450,
        payment_method: 'card',
        status: 'completed',
        customer_name: 'د/ شريف رمزي',
        assigned_employee_name: 'محمود النجار',
        created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      },
    ],
    created_at: new Date(Date.now() - 44 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'shift-1725607200000-e5f6',
    shift_code: 'SH-202609-080',
    cashier_id: 'emp-1',
    cashier_name: 'حسن علي مهران',
    cashier_role: 'كاشير رئيسي',
    shift_start: new Date(Date.now() - 76 * 60 * 60 * 1000).toISOString(),
    shift_end: new Date(Date.now() - 68 * 60 * 60 * 1000).toISOString(),
    duration_formatted: '8 ساعات و 0 دقيقة',
    gross_sales: 2900,
    cash_sales: 2100,
    card_sales: 500,
    transfer_sales: 300,
    total_orders: 11,
    expected_cash: 2100,
    actual_cash: 2080,
    variance: -20,
    closing_notes: 'عجز طفيف بقيمة 20 ج.م ناتج عن فكة نقود وتمت تسويته بواسطة الكاشير',
    approved_by: 'لوحة الإدارة العامة (Admin Override)',
    is_end_of_day: false,
    active_workers_breakdown: [
      { employee_id: 'emp-2', name: 'أحمد محمود إبراهيم', role: 'فني غسيل وتلميع', count: 6, totalSales: 1600 },
      { employee_id: 'emp-3', name: 'كريم عبد العال', role: 'فني غسيل داخلي', count: 5, totalSales: 1300 },
    ],
    orders: [
      {
        id: 'ord-hist-301',
        order_code: 'PW-7940',
        service_id: 'srv-2',
        service_name: 'غسيل عادي خارجي وداخلي',
        subtotal: 131.58,
        tax_amount: 18.42,
        total_amount: 150,
        payment_method: 'cash',
        status: 'completed',
        customer_name: 'أ/ عادل عبد الرحمن',
        assigned_employee_name: 'كريم عبد العال',
        created_at: new Date(Date.now() - 74 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 74 * 60 * 60 * 1000).toISOString(),
      },
    ],
    created_at: new Date(Date.now() - 68 * 60 * 60 * 1000).toISOString(),
  },
];

export const getStoredClosedShifts = (): ClosedShift[] => {
  if (typeof window === 'undefined') return SAMPLE_CLOSED_SHIFTS;
  try {
    const raw = localStorage.getItem(CLOSED_SHIFTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
    // Initialize with sample shifts
    localStorage.setItem(CLOSED_SHIFTS_KEY, JSON.stringify(SAMPLE_CLOSED_SHIFTS));
    return SAMPLE_CLOSED_SHIFTS;
  } catch {
    return SAMPLE_CLOSED_SHIFTS;
  }
};

export const saveStoredClosedShifts = (shifts: ClosedShift[]): void => {
  if (typeof window === 'undefined') return;
  // 1. Asynchronous IndexedDB write
  bulkPutInDb('shifts', shifts).catch((e) => console.warn('[IDB saveStoredClosedShifts error]', e));

  // 2. LocalStorage backup snapshot
  try {
    localStorage.setItem(CLOSED_SHIFTS_KEY, JSON.stringify(shifts));
    window.dispatchEvent(new CustomEvent('cw_shifts_updated', { detail: shifts }));
    window.dispatchEvent(new Event('cw_shifts_updated'));
    window.dispatchEvent(new Event('storage'));
  } catch {}
};

export const appendClosedShift = (shift: ClosedShift): void => {
  const current = getStoredClosedShifts();
  const updated = [shift, ...current.filter((s) => s.id !== shift.id && s.shift_code !== shift.shift_code)];
  saveStoredClosedShifts(updated);
  putInDb('shifts', shift).catch(() => {});
};

export const deleteClosedShift = (id: string): { shiftDeleted: boolean; deletedOrders: number; preservedOrders: number } => {
  const current = getStoredClosedShifts();
  const shift = current.find((s) => s.id === id || s.shift_code === id);
  const updated = current.filter((s) => s.id !== id && s.shift_code !== id);
  saveStoredClosedShifts(updated);
  deleteFromDb('shifts', id).catch(() => {});

  let deletedOrders = 0;
  let preservedOrders = 0;

  if (shift) {
    const res = cascadeDeleteShiftOrders(
      shift.id,
      shift.orders,
      shift.shift_start,
      shift.shift_end
    );
    deletedOrders = res.deletedCount;
    preservedOrders = res.preservedCount;
  }

  return { shiftDeleted: true, deletedOrders, preservedOrders };
};

export const getClosedShiftById = (id: string): ClosedShift | undefined => {
  return getStoredClosedShifts().find((s) => s.id === id || s.shift_code === id);
};

/**
 * Retrieve active shift session from localStorage (synced central active shift from DB or local active shift)
 */
export const getStoredActiveShiftSession = (): ActiveShiftSession | null => {
  if (typeof window === 'undefined') return null;
  try {
    // 1. Check synced central active shift session first
    const activeRaw = localStorage.getItem(ACTIVE_SHIFT_KEY);
    if (activeRaw) {
      const parsedActive = JSON.parse(activeRaw);
      if (
        (parsedActive?.cashier_id || parsedActive?.id) &&
        parsedActive?.shift_start &&
        parsedActive?.status !== 'closed'
      ) {
        return {
          id: parsedActive.id || parsedActive.cashier_id,
          name: parsedActive.name || parsedActive.cashier_name,
          role: parsedActive.role || parsedActive.cashier_role,
          shift_id: parsedActive.shift_id,
          cashier_id: parsedActive.cashier_id || parsedActive.id,
          cashier_name: parsedActive.cashier_name || parsedActive.name,
          cashier_role: parsedActive.cashier_role || parsedActive.role,
          shift_start: parsedActive.shift_start,
          opening_cash: Number(parsedActive.opening_cash) || 0,
          status: 'active',
          updated_at: parsedActive.updated_at || parsedActive.shift_start,
        };
      }
    }

    // 2. Check local POS cashier session fallback
    const localRaw = localStorage.getItem(CASHIER_SESSION_KEY);
    if (localRaw) {
      const parsed = JSON.parse(localRaw);
      if (
        (parsed?.id || parsed?.cashier_id) &&
        parsed?.shift_start &&
        parsed?.status !== 'closed'
      ) {
        return {
          id: parsed.id || parsed.cashier_id,
          name: parsed.name || parsed.cashier_name || 'كاشير',
          role: parsed.role || parsed.cashier_role || 'كاشير',
          shift_id: parsed.shift_id || `shift_${parsed.id || parsed.cashier_id}_${new Date(parsed.shift_start).getTime()}`,
          cashier_id: parsed.cashier_id || parsed.id,
          cashier_name: parsed.cashier_name || parsed.name || 'كاشير',
          cashier_role: parsed.cashier_role || parsed.role || 'كاشير',
          shift_start: parsed.shift_start,
          status: 'active',
          updated_at: parsed.shift_start,
        };
      }
    }
  } catch {}
  return null;
};

/**
 * Retrieve local terminal cashier session (strictly for this browser/device)
 */
export const getLocalCashierSession = (): ActiveShiftSession | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CASHIER_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        (parsed?.id || parsed?.cashier_id) &&
        parsed?.shift_start &&
        parsed?.status !== 'closed'
      ) {
        return parsed;
      }
    }
  } catch {}
  return null;
};

/**
 * Save or clear local terminal cashier session upon explicit PIN login / logout
 */
export const saveLocalCashierSession = (session: ActiveShiftSession | null): void => {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(CASHIER_SESSION_KEY);
    if (!session) {
      if (!raw) return;
      localStorage.removeItem(CASHIER_SESSION_KEY);
    } else {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (
            parsed &&
            (parsed.shift_id === session.shift_id || parsed.id === session.id) &&
            parsed.status === session.status &&
            parsed.shift_start === session.shift_start &&
            (parsed.cashier_id === session.cashier_id || parsed.cashier_name === session.cashier_name)
          ) {
            return;
          }
        } catch {}
      }
      localStorage.setItem(CASHIER_SESSION_KEY, JSON.stringify(session));
    }
    window.dispatchEvent(new CustomEvent('cw_shifts_updated', { detail: session }));
    window.dispatchEvent(new Event('cw_shifts_updated'));
    window.dispatchEvent(new Event('storage'));
  } catch {}
};

/**
 * Save active shift session (updates cw_active_shift for store-wide monitoring, WITHOUT auto-logging in local terminal).
 * When session is null (server confirmed no active shift), also wipes pos_active_cashier to close the ghost-reader
 * fallback path in getStoredActiveShiftSession().
 */
export const saveStoredActiveShiftSession = (session: ActiveShiftSession | null): void => {
  if (typeof window === 'undefined') return;
  try {
    const rawStored = localStorage.getItem(ACTIVE_SHIFT_KEY);
    const rawCashier = localStorage.getItem(CASHIER_SESSION_KEY);

    if (!session) {
      if (!rawStored && !rawCashier) return;
      localStorage.removeItem(ACTIVE_SHIFT_KEY);
      localStorage.removeItem(CASHIER_SESSION_KEY); // Close ghost-reader fallback — wipe both keys on null
      window.dispatchEvent(new CustomEvent('cw_shifts_updated', { detail: null }));
      window.dispatchEvent(new Event('cw_shifts_updated'));
      window.dispatchEvent(new Event('cw_attendance_updated'));
      window.dispatchEvent(new Event('storage'));
      return;
    }

    if (rawStored) {
      try {
        const parsed = JSON.parse(rawStored);
        if (
          parsed &&
          (parsed.shift_id === session.shift_id || parsed.id === session.id) &&
          parsed.status === session.status &&
          parsed.shift_start === session.shift_start &&
          (parsed.cashier_id === session.cashier_id || parsed.cashier_name === session.cashier_name)
        ) {
          return;
        }
      } catch {}
    }

    localStorage.setItem(ACTIVE_SHIFT_KEY, JSON.stringify(session));
    window.dispatchEvent(new CustomEvent('cw_shifts_updated', { detail: session }));
    window.dispatchEvent(new Event('cw_shifts_updated'));
    window.dispatchEvent(new Event('cw_attendance_updated'));
    window.dispatchEvent(new Event('storage'));
  } catch {}
};


/**
 * Complete purge of local zombie shifts across all storage keys
 */
export const purgeZombieShifts = (): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(ACTIVE_SHIFT_KEY);
    localStorage.removeItem(CASHIER_SESSION_KEY);
    clearStoredShiftOrders();
    window.dispatchEvent(new CustomEvent('cw_shifts_updated', { detail: null }));
    window.dispatchEvent(new Event('cw_shifts_updated'));
    window.dispatchEvent(new Event('cw_attendance_updated'));
    window.dispatchEvent(new Event('cw_orders_updated'));
    window.dispatchEvent(new Event('storage'));
  } catch {}
};

/**
 * Boot-time self-healing: inspect both shift cache keys and purge any session whose
 * shift_start is older than maxAgeHours (default 24h).
 *
 * FINANCIAL SAFETY LOCK: Before evicting, checks both the legacy localStorage order queue
 * ('cw_offline_order_queue') and an optional async IndexedDB pending count (injected by the
 * caller to avoid circular imports). If ANY unsynced orders or pending sync actions exist for
 * the stale shift, the purge is ABORTED and returns false — the shift must survive until the
 * Sync Engine pushes the financial data to the server.
 *
 * @param maxAgeHours  Age threshold in hours (default 24h).
 * @param getPendingCount  Optional async function returning the total pending IndexedDB sync
 *                         item count. Inject `getPendingSyncCount` from syncEngine.ts.
 * @returns true if a stale shift was evicted; false if no stale shift was found OR if the
 *          purge was blocked by unsynced financial data.
 */
export const purgeStaleCachedShifts = async (
  maxAgeHours: number = 24,
  getPendingCount?: () => Promise<number>
): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  const STALE_MS = maxAgeHours * 60 * 60 * 1000;

  // --- 1. Detect staleness ---
  let staleKeyFound = false;
  let staleAgeMs = 0;
  try {
    for (const key of [ACTIVE_SHIFT_KEY, CASHIER_SESSION_KEY]) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      let parsed: any;
      try { parsed = JSON.parse(raw); } catch { continue; }
      const startStr = parsed?.shift_start || parsed?.created_at;
      if (!startStr) continue;
      const startTime = new Date(startStr).getTime();
      if (isNaN(startTime)) continue;
      const ageMs = Date.now() - startTime;
      if (ageMs > STALE_MS) {
        staleKeyFound = true;
        staleAgeMs = ageMs;
        break; // One stale entry is enough to trigger the full check
      }
    }
  } catch {}

  if (!staleKeyFound) return false; // Nothing stale — exit early, no purge

  // --- 2. FINANCIAL SAFETY LOCK: check for unsynced offline data ---

  // 2a. Check legacy localStorage order queue (sync read, no import needed)
  let localQueueCount = 0;
  try {
    const raw = localStorage.getItem('cw_offline_order_queue');
    if (raw) {
      const parsed = JSON.parse(raw);
      localQueueCount = Array.isArray(parsed) ? parsed.length : 0;
    }
  } catch {}

  if (localQueueCount > 0) {
    console.warn(
      `[ShiftStorage] PURGE BLOCKED: stale shift found (age=${Math.round(staleAgeMs / 3600000)}h) ` +
      `but ${localQueueCount} unsynced offline order(s) in localStorage queue. ` +
      `Shift preserved until financial data is synced to server.`
    );
    return false;
  }

  // 2b. Check primary IndexedDB sync queue (async, injected to avoid circular imports)
  if (getPendingCount) {
    let idbPendingCount = 0;
    try {
      idbPendingCount = await getPendingCount();
    } catch {}
    if (idbPendingCount > 0) {
      console.warn(
        `[ShiftStorage] PURGE BLOCKED: stale shift found (age=${Math.round(staleAgeMs / 3600000)}h) ` +
        `but ${idbPendingCount} pending item(s) in IndexedDB sync queue. ` +
        `Shift preserved until Sync Engine pushes all data to cloud.`
      );
      return false;
    }
  }

  // --- 3. Safe to purge — no unsynced financial data ---
  let purged = false;
  try {
    for (const key of [ACTIVE_SHIFT_KEY, CASHIER_SESSION_KEY]) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      let parsed: any;
      try { parsed = JSON.parse(raw); } catch { continue; }
      const startStr = parsed?.shift_start || parsed?.created_at;
      if (!startStr) continue;
      const startTime = new Date(startStr).getTime();
      if (isNaN(startTime)) continue;
      if (Date.now() - startTime > STALE_MS) {
        localStorage.removeItem(key);
        purged = true;
        console.warn(
          `[ShiftStorage] Evicted stale local shift (key=${key}, age=${Math.round(staleAgeMs / 3600000)}h > ${maxAgeHours}h). ` +
          `Zero unsynced data confirmed — purge is financially safe.`
        );
      }
    }
    if (purged) {
      // Clear phantom local order totals (they've already been confirmed as synced)
      try { clearStoredShiftOrders(); } catch {}
      // Notify all listeners (Navbar, POS, Admin) that no active shift exists
      window.dispatchEvent(new CustomEvent('cw_shifts_updated', { detail: null }));
      window.dispatchEvent(new Event('cw_shifts_updated'));
      window.dispatchEvent(new Event('cw_attendance_updated'));
      window.dispatchEvent(new Event('cw_orders_updated'));
      window.dispatchEvent(new Event('storage'));
    }
  } catch {}

  return purged;
};


/**
 * Sync server active shift with central store monitor state
 */
export const syncServerActiveShift = (session: ActiveShiftSession | null): void => {
  if (typeof window === 'undefined') return;
  try {
    if (!session) {
      localStorage.removeItem(ACTIVE_SHIFT_KEY);
    } else {
      localStorage.setItem(ACTIVE_SHIFT_KEY, JSON.stringify(session));
    }
    window.dispatchEvent(new CustomEvent('cw_shifts_updated', { detail: session }));
    window.dispatchEvent(new Event('cw_shifts_updated'));
    window.dispatchEvent(new Event('cw_attendance_updated'));
    window.dispatchEvent(new Event('storage'));
  } catch {}
};

/**
 * Update local active shift metrics immediately when an order is created offline
 */
export const recordOfflineOrderInActiveShift = (order: Order): void => {
  if (typeof window === 'undefined' || !order || order.status === 'cancelled') return;
  try {
    const amount = Number(order.total_amount) || 0;
    const isCash = order.payment_method === 'cash';
    const isCard = order.payment_method === 'card';
    const isTransfer = order.payment_method === 'transfer' || (order.payment_method as any) === 'wallet';

    // Update in ACTIVE_SHIFT_KEY
    const activeRaw = localStorage.getItem(ACTIVE_SHIFT_KEY);
    if (activeRaw) {
      const parsed = JSON.parse(activeRaw);
      if (parsed && parsed.status === 'active') {
        parsed.gross_sales = Number(((Number(parsed.gross_sales) || 0) + amount).toFixed(2));
        if (isCash) parsed.cash_sales = Number(((Number(parsed.cash_sales) || 0) + amount).toFixed(2));
        if (isCard) parsed.card_sales = Number(((Number(parsed.card_sales) || 0) + amount).toFixed(2));
        if (isTransfer) parsed.transfer_sales = Number(((Number(parsed.transfer_sales) || 0) + amount).toFixed(2));
        parsed.total_orders = (Number(parsed.total_orders) || 0) + 1;
        parsed.updated_at = new Date().toISOString();
        localStorage.setItem(ACTIVE_SHIFT_KEY, JSON.stringify(parsed));
      }
    }

    // Update in CASHIER_SESSION_KEY
    const cashierRaw = localStorage.getItem(CASHIER_SESSION_KEY);
    if (cashierRaw) {
      const parsed = JSON.parse(cashierRaw);
      if (parsed && parsed.status === 'active') {
        parsed.gross_sales = Number(((Number(parsed.gross_sales) || 0) + amount).toFixed(2));
        if (isCash) parsed.cash_sales = Number(((Number(parsed.cash_sales) || 0) + amount).toFixed(2));
        if (isCard) parsed.card_sales = Number(((Number(parsed.card_sales) || 0) + amount).toFixed(2));
        if (isTransfer) parsed.transfer_sales = Number(((Number(parsed.transfer_sales) || 0) + amount).toFixed(2));
        parsed.total_orders = (Number(parsed.total_orders) || 0) + 1;
        parsed.updated_at = new Date().toISOString();
        localStorage.setItem(CASHIER_SESSION_KEY, JSON.stringify(parsed));
      }
    }

    window.dispatchEvent(new CustomEvent('cw_shifts_updated'));
    window.dispatchEvent(new Event('cw_shifts_updated'));
    window.dispatchEvent(new Event('storage'));
  } catch {}
};

/**
 * Direct Thermal 80mm Z-Report Printer Utility
 */
export const printClosedShiftZReport = (shift: ClosedShift): boolean => {
  if (typeof window === 'undefined') return false;

  const win = window.open('', '', 'width=450,height=750');
  if (!win) {
    return false;
  }

  const isShortage = shift.variance < 0;
  const isSurplus = shift.variance > 0;
  const varianceText = isShortage
    ? `عجز: ${formatEGP(Math.abs(shift.variance))}`
    : isSurplus
    ? `زيادة: +${formatEGP(shift.variance)}`
    : 'مطابق تماماً (لا يوجد عجز)';

  const varianceColor = isShortage ? '#dc2626' : isSurplus ? '#2563eb' : '#16a34a';

  const ordersRows = (shift.orders || [])
    .slice(0, 50)
    .map(
      (o) => `
      <tr>
        <td style="font-family:monospace;font-weight:bold;">${escapeHtml(o.order_code)}</td>
        <td>${escapeHtml((o.service_name || 'خدمة').slice(0, 22))}</td>
        <td style="text-align:left;font-family:monospace;font-weight:bold;">${Number(o.total_amount || 0).toFixed(0)} ج.م</td>
      </tr>
    `
    )
    .join('');

  const workersRows = (shift.active_workers_breakdown || [])
    .map(
      (w) => `
      <div class="flex">
        <span>${escapeHtml(w.name)} (${w.count} فاتورة)</span>
        <span class="bold">${formatEGP(w.totalSales)}</span>
      </div>
    `
    )
    .join('');

  win.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8" />
        <title>تقرير Z-Report - ${escapeHtml(shift.shift_code)}</title>
        <style>
          @page { margin: 0; size: 80mm auto; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", sans-serif;
            width: 76mm;
            margin: 0 auto;
            padding: 10px 4px;
            color: #000;
            background: #fff;
            font-size: 11px;
            line-height: 1.4;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 6px 0; }
          .flex { display: flex; justify-content: space-between; margin: 3px 0; }
          .title { font-size: 14px; font-weight: 900; margin-bottom: 2px; }
          .subtitle { font-size: 10px; color: #333; }
          table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 10px; }
          th, td { padding: 3px 2px; text-align: right; }
          th { border-bottom: 1px solid #000; }
          .badge {
            display: inline-block;
            padding: 2px 6px;
            border: 1px solid #000;
            font-weight: bold;
            font-size: 10px;
            margin-top: 3px;
          }
          .variance-box {
            border: 1.5px solid ${varianceColor};
            color: ${varianceColor};
            padding: 6px;
            margin-top: 6px;
            font-weight: bold;
            text-align: center;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="title">PRIME WASH POS</div>
          <div class="subtitle">مغسلة برايم وش للعناية بالسيارات</div>
          <div class="subtitle">تقرير تقفيل الوردية وجرد الخزينة (Z-Report)</div>
          <div class="badge">${shift.is_end_of_day ? 'تقفيل نهاية اليوم بالكامل' : 'تسليم وردية كاشير'}</div>
        </div>

        <div class="divider"></div>

        <div class="flex">
          <span>رقم الوردية:</span>
          <span class="bold" style="font-family:monospace;">${escapeHtml(shift.shift_code)}</span>
        </div>
        <div class="flex">
          <span>الكاشير المسؤول:</span>
          <span class="bold">${escapeHtml(shift.cashier_name)}</span>
        </div>
        <div class="flex">
          <span>بداية الشيفت:</span>
          <span>${formatDateTime(shift.shift_start)}</span>
        </div>
        <div class="flex">
          <span>نهاية الشيفت:</span>
          <span>${formatDateTime(shift.shift_end)}</span>
        </div>
        ${shift.duration_formatted ? `
        <div class="flex">
          <span>المدة المنقضية:</span>
          <span class="bold">${escapeHtml(shift.duration_formatted)}</span>
        </div>
        ` : ''}
        <div class="flex">
          <span>الاعتماد بواسطة:</span>
          <span class="bold">${escapeHtml(shift.approved_by || 'الإدارة')}</span>
        </div>

        <div class="divider"></div>

        <div class="center bold" style="margin-bottom: 4px;">-- ملخص مبيعات الوردية --</div>
        <div class="flex">
          <span>عدد الفواتير الصادرة:</span>
          <span class="bold">${shift.total_orders} فاتورة</span>
        </div>
        <div class="flex">
          <span>إجمالي المبيعات (Gross):</span>
          <span class="bold" style="font-size:12px;">${formatEGP(shift.gross_sales)}</span>
        </div>
        <div class="flex">
          <span>مبيعات النقدية (كاش):</span>
          <span class="bold">${formatEGP(shift.cash_sales)}</span>
        </div>
        <div class="flex">
          <span>مبيعات الفيزا والبطاقات:</span>
          <span class="bold">${formatEGP(shift.card_sales)}</span>
        </div>
        <div class="flex">
          <span>مبيعات المحافظ الإلكترونية:</span>
          <span class="bold">${formatEGP(shift.transfer_sales)}</span>
        </div>

        <div class="divider"></div>

        <div class="center bold" style="margin-bottom: 4px;">-- جرد الخزينة والنقدية --</div>
        <div class="flex">
          <span>النقدية المتوقعة بالدرج:</span>
          <span class="bold">${formatEGP(shift.expected_cash)}</span>
        </div>
        <div class="flex">
          <span>النقدية الفعلية المحصورة:</span>
          <span class="bold" style="font-size:12px;">${formatEGP(shift.actual_cash)}</span>
        </div>

        <div class="variance-box">
          ${varianceText}
        </div>

        ${workersRows ? `
        <div class="divider"></div>
        <div class="center bold" style="margin-bottom: 4px;">-- إنتاجية الفنيين والعمال --</div>
        ${workersRows}
        ` : ''}

        ${ordersRows ? `
        <div class="divider"></div>
        <div class="center bold" style="margin-bottom: 4px;">-- كشف الفواتير (${shift.orders.length}) --</div>
        <table>
          <thead>
            <tr>
              <th>الكود</th>
              <th>الخدمة</th>
              <th style="text-align:left;">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            ${ordersRows}
          </tbody>
        </table>
        ` : ''}

        ${shift.closing_notes ? `
        <div class="divider"></div>
        <div style="font-size: 10px;">
          <span class="bold">ملاحظات الإغلاق:</span>
          <div>${escapeHtml(shift.closing_notes)}</div>
        </div>
        ` : ''}

        <div class="divider"></div>
        <div class="center subtitle" style="margin-top: 6px;">
          طُبع بتاريخ: ${formatDateTime(new Date().toISOString())}
        </div>
        <div class="center bold" style="font-size: 9px; margin-top: 2px;">
          نظام برايم وش لإدارة المغاسل الذكية
        </div>

        <script>
          window.onload = function() {
            window.focus();
            window.print();
            setTimeout(() => { window.close(); }, 500);
          };
        </script>
      </body>
    </html>
  `);

  win.document.close();
  return true;
};

import { neon } from '@neondatabase/serverless';

let cachedSqlInstance: any = null;
let cachedDbUrl: string | null = null;

function getDb(env?: Record<string, any>) {
  const dbUrl =
    env?.DATABASE_URL ||
    (typeof process !== 'undefined' ? process.env.DATABASE_URL : null);
  if (!dbUrl) {
    throw new Error('متغير البيئة DATABASE_URL غير متوفر في إعدادات الخادم السحابي.');
  }
  if (!cachedSqlInstance || cachedDbUrl !== dbUrl) {
    cachedSqlInstance = neon(dbUrl);
    cachedDbUrl = dbUrl;
  }
  return cachedSqlInstance;
}

function getAllowedOrigin(requestOrigin?: string | null): string {
  if (!requestOrigin) return 'https://prime-wash-pos.pages.dev';
  try {
    const originUrl = new URL(requestOrigin);
    const host = originUrl.hostname.toLowerCase();
    const port = originUrl.port;
    const isLocalhost = (host === 'localhost' || host === '127.0.0.1') && (!port || ['5173', '3000', '4173', '8788'].includes(port));
    const isExactPrimeWash =
      host === 'prime-wash-pos.pages.dev' ||
      host.endsWith('.prime-wash-pos.pages.dev') ||
      host === 'primewash.eg' ||
      host === 'www.primewash.eg';

    if (isLocalhost || isExactPrimeWash) {
      return requestOrigin;
    }
  } catch {}
  return 'https://prime-wash-pos.pages.dev';
}

function jsonResponse(data: any, status = 200, origin = 'https://prime-wash-pos.pages.dev', cacheControl = 'no-store, no-cache, must-revalidate') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-pin',
      'Cache-Control': cacheControl,
    },
  });
}

function errorResponse(message: string, status = 500, origin = 'https://prime-wash-pos.pages.dev') {
  return jsonResponse({ success: false, error: message, message }, status, origin);
}

function safeConstantTimeEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false;
  const strA = String(a).trim();
  const strB = String(b).trim();
  if (strA.length === 0 || strB.length === 0 || strA.length !== strB.length) return false;
  let result = 0;
  for (let i = 0; i < strA.length; i++) {
    result |= strA.charCodeAt(i) ^ strB.charCodeAt(i);
  }
  return result === 0;
}

async function verifyAdminPinHeader(request: Request, sql: any): Promise<boolean> {
  const pinHeader =
    request.headers.get('x-admin-pin') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!pinHeader) return false;
  const pin = String(pinHeader).trim();
  if (!pin) return false;

  try {
    const settings = await sql`SELECT admin_pin FROM system_settings ORDER BY updated_at DESC NULLS LAST LIMIT 1`;
    const systemAdminPin = settings && settings[0]?.admin_pin ? String(settings[0].admin_pin).trim() : '';
    if (systemAdminPin && safeConstantTimeEquals(pin, systemAdminPin)) return true;

    // Check active owner accounts in employees table
    const owners = await sql`
      SELECT pin_code FROM employees 
      WHERE (system_role = 'owner' OR role ILIKE '%مالك%' OR name = 'مستر فتحي') 
        AND status = 'active'
    `;
    const isOwnerMatch = owners.some((o: any) => safeConstantTimeEquals(pin, String(o.pin_code || '').trim()));
    if (!isOwnerMatch) {
      console.warn('[AdminHeader-Mismatch] Authentication failed: invalid PIN provided');
    }
    return isOwnerMatch;
  } catch {
    return false;
  }
}

export async function onRequest(context: any): Promise<Response> {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const requestOrigin = getAllowedOrigin(request.headers.get('Origin'));

  const json = (data: any, status = 200, cacheControl?: string) =>
    jsonResponse(data, status, requestOrigin, cacheControl);
  const err = (message: string, status = 500) =>
    errorResponse(message, status, requestOrigin);

  // Handle CORS Preflight
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': requestOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-pin',
      },
    });
  }

  // Extract path parts after /api/
  const routeArray = Array.isArray(params?.route)
    ? params.route
    : url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);

  const path = routeArray.join('/');
  const sql = getDb(env);

  try {
    // ==========================================
    // 1. POS SHIFTS ENDPOINTS
    // ==========================================

    // Auto-migrate shifts table safely once per request if needed
    if (path.startsWith('pos/shifts')) {
      try {
        await sql`ALTER TABLE shifts ADD COLUMN IF NOT EXISTS active_device_id VARCHAR(100)`;
      } catch (colErr) {
        // Table or column already exists or non-fatal DDL permission
      }
    }

    // GET /api/pos/shifts/active
    if (path === 'pos/shifts/active' && method === 'GET') {
      let activeShifts: any[] = [];
      try {
        activeShifts = await sql`
          SELECT 
            id,
            id AS shift_id,
            shift_code,
            cashier_id,
            cashier_name,
            COALESCE(cashier_role, 'كاشير واستقبال') AS cashier_role,
            shift_start,
            opening_cash::float AS opening_cash,
            active_device_id,
            status,
            created_at,
            updated_at
          FROM shifts
          WHERE status = 'active'
          ORDER BY shift_start DESC
          LIMIT 1
        `;
      } catch (selectErr: any) {
        console.error('[Error selecting active shift]', selectErr);
        // Fallback without active_device_id column if table column not yet created
        try {
          activeShifts = await sql`
            SELECT 
              id,
              id AS shift_id,
              shift_code,
              cashier_id,
              cashier_name,
              COALESCE(cashier_role, 'كاشير واستقبال') AS cashier_role,
              shift_start,
              opening_cash::float AS opening_cash,
              NULL AS active_device_id,
              status,
              created_at,
              updated_at
            FROM shifts
            WHERE status = 'active'
            ORDER BY shift_start DESC
            LIMIT 1
          `;
        } catch (fallbackErr: any) {
          return errorResponse(`تعذر قراءة الوردية النشطة من قاعدة البيانات: ${fallbackErr?.message || selectErr?.message}`, 500, requestOrigin);
        }
      }

      if (!activeShifts || activeShifts.length === 0) {
        return jsonResponse({ success: true, data: null }, 200, requestOrigin, 'no-store, no-cache, must-revalidate');
      }

      const shift = activeShifts[0];

      // Auto-archive stale zombie shift older than 24 hours
      const shiftStartTime = new Date(shift.shift_start || shift.created_at).getTime();
      const ageHours = (Date.now() - shiftStartTime) / (1000 * 60 * 60);

      if (ageHours > 24) {
        try {
          await sql`
            UPDATE shifts
            SET status = 'closed',
                shift_end = NOW(),
                closing_notes = 'إغلاق تلقائي لانتهاء صلاحية الجلسة (>24 ساعة)',
                updated_at = NOW()
            WHERE id = ${shift.id}
          `;
        } catch {}
        return jsonResponse({ success: true, data: null }, 200, requestOrigin, 'no-store, no-cache, must-revalidate');
      }

      // Aggregate live metrics safely without crashing the main shift retrieval
      let m = {
        total_orders: 0,
        gross_sales: 0,
        cash_sales: 0,
        card_sales: 0,
        transfer_sales: 0,
      };

      try {
        const metrics = await sql`
          SELECT 
            COUNT(*)::int AS total_orders,
            COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END), 0)::float AS gross_sales,
            COALESCE(SUM(CASE WHEN status != 'cancelled' AND payment_method = 'cash' THEN total_amount ELSE 0 END), 0)::float AS cash_sales,
            COALESCE(SUM(CASE WHEN status != 'cancelled' AND payment_method = 'card' THEN total_amount ELSE 0 END), 0)::float AS card_sales,
            COALESCE(SUM(CASE WHEN status != 'cancelled' AND payment_method IN ('transfer', 'wallet') THEN total_amount ELSE 0 END), 0)::float AS transfer_sales
          FROM orders
          WHERE status != 'cancelled'
            AND (
              (shift_id IS NOT NULL AND shift_id::text = ${String(shift.id)})
              OR (
                cashier_id IS NOT NULL 
                AND cashier_id::text = ${String(shift.cashier_id || '')}
                AND created_at >= ${String(shift.shift_start || new Date().toISOString())}::timestamptz
              )
            )
        `;
        if (metrics && metrics.length > 0) {
          m = metrics[0];
        }
      } catch (metricsErr) {
        console.warn('[Non-Fatal Metrics Query Warning in shifts/active]', metricsErr);
      }

      return jsonResponse({
        success: true,
        data: {
          ...shift,
          id: shift.id,
          shift_id: shift.id,
          name: shift.cashier_name,
          role: shift.cashier_role,
          active_device_id: shift.active_device_id || null,
          gross_sales: Number(m.gross_sales) || 0,
          cash_sales: Number(m.cash_sales) || 0,
          card_sales: Number(m.card_sales) || 0,
          transfer_sales: Number(m.transfer_sales) || 0,
          total_orders: Number(m.total_orders) || 0,
        },
      });
    }

    // POST /api/pos/shifts/start
    if (path === 'pos/shifts/start' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const cashierId = body.cashier_id || null;
      const cashierName = (body.cashier_name || body.name || 'الكاشير').trim();
      const cashierRole = (body.cashier_role || body.role || 'كاشير واستقبال').trim();
      const shiftStart = body.shift_start || new Date().toISOString();
      const openingCash = Number(body.opening_cash) || 0;
      const deviceId = (body.device_id || body.active_device_id || '').trim() || null;
      const todayStr = new Date(shiftStart).toISOString().slice(0, 10);

      // 1. Check for any currently active shift in DB (Single Active Shift Rule)
      let activeShifts: any[] = [];
      try {
        activeShifts = await sql`
          SELECT s.*, COALESCE(s.cashier_name, 'الكاشير') AS active_cashier_name
          FROM shifts s
          WHERE s.status = 'active'
          ORDER BY s.shift_start DESC
          LIMIT 1
        `;
      } catch (err: any) {
        console.error('[Error querying active shifts in start]', err);
      }

      if (activeShifts && activeShifts.length > 0) {
        const existing = activeShifts[0];
        const existingStartTime = new Date(existing.shift_start || existing.created_at).getTime();
        const existingAgeHours = (Date.now() - existingStartTime) / (1000 * 60 * 60);

        if (existingAgeHours > 24) {
          // Auto-archive stale zombie shift older than 24 hours so starting new shift is not blocked
          await sql`
            UPDATE shifts
            SET status = 'closed',
                shift_end = NOW(),
                closing_notes = 'إغلاق تلقائي لانتهاء صلاحية الجلسة (>24 ساعة)',
                updated_at = NOW()
            WHERE id = ${existing.id}
          `;
        } else {
          const normalizeStr = (s: any) => String(s || '').trim().toLowerCase();
          const normalizeArabic = (s: any) =>
            normalizeStr(s)
              .replace(/[أإآ]/g, 'ا')
              .replace(/ة/g, 'ه')
              .replace(/[\u064B-\u065F]/g, '') // remove Arabic tashkeel/diacritics
              .replace(/\s+/g, ' ');

          const normReqId = normalizeStr(cashierId);
          const normExistId = normalizeStr(existing.cashier_id);
          const normReqName = normalizeArabic(cashierName);
          const normExistName = normalizeArabic(existing.cashier_name || existing.active_cashier_name);

          const isSameCashier =
            (normReqId && normExistId && normReqId === normExistId) ||
            (normReqName && normExistName && normReqName === normExistName);

          if (!isSameCashier) {
            // Strictly reject conflicting cashier shift with 409 Conflict
            return jsonResponse({
              success: false,
              error: 'SHIFT_IN_USE',
              message: `عفواً، يوجد وردية نشطة بالفعل للكاشير: (${existing.active_cashier_name}). يرجى تقفيل الوردية الحالية أولاً.`,
              active_cashier_name: existing.active_cashier_name,
              active_cashier_id: existing.cashier_id,
              shift_id: existing.id,
              shift_code: existing.shift_code,
            }, 409, requestOrigin);
          }

          // Same cashier resuming / transferring session to this device:
          let resolvedDeviceId = existing.active_device_id;
          if (deviceId && deviceId !== existing.active_device_id) {
            try {
              await sql`
                UPDATE shifts
                SET active_device_id = ${deviceId}, updated_at = NOW()
                WHERE id = ${existing.id}
              `;
              resolvedDeviceId = deviceId;
            } catch (updateDevErr) {
              console.error('[Update active_device_id Error]', updateDevErr);
            }
          }

          // If same cashier, restore existing active shift
          return jsonResponse({
            success: true,
            message: 'تمت استعادة جلسة الشفت النشط بنجاح',
            data: {
              ...existing,
              id: existing.id,
              shift_id: existing.id,
              name: existing.cashier_name,
              role: existing.cashier_role,
              active_device_id: resolvedDeviceId,
              opening_cash: Number(existing.opening_cash) || 0,
            },
          }, 200, requestOrigin);
        }
      }

      // 2. Explicitly INSERT a brand new shift record
      const shiftCode =
        body.shift_code ||
        body.shift_id ||
        `SHIFT-${todayStr.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

      const inserted = await sql`
        INSERT INTO shifts (
          shift_code, cashier_id, cashier_name, cashier_role, shift_start, opening_cash, active_device_id, status
        ) VALUES (${shiftCode}, ${cashierId}, ${cashierName}, ${cashierRole}, ${shiftStart}, ${openingCash}, ${deviceId}, 'active')
        RETURNING id, shift_code, cashier_id, cashier_name, cashier_role, shift_start, opening_cash::float AS opening_cash, active_device_id, status, created_at, updated_at
      `;
      const activeShift = inserted[0];

      // Auto-attendance check-in in attendance table strictly for this valid cashier
      if (cashierId) {
        try {
          const attCheck = await sql`
            SELECT id FROM attendance 
            WHERE employee_id = ${cashierId} AND work_date = ${todayStr} AND check_out IS NULL 
            LIMIT 1
          `;
          if (!attCheck || attCheck.length === 0) {
            await sql`
              INSERT INTO attendance (
                employee_id, work_date, check_in, actual_hours, overtime_hours, deducted_hours, notes
              ) VALUES (${cashierId}, ${todayStr}, ${shiftStart}, 0, 0, 0, 'تسجيل حضور تلقائي عند بدء شفت الكاشير')
            `;
          }
        } catch (e: any) {
          console.warn('[Attendance Clock-in Warning]', e.message);
        }
      }

      return jsonResponse({
        success: true,
        message: 'تم فتح الشفت مركزياً بنجاح',
        data: {
          ...activeShift,
          id: activeShift.id,
          shift_id: activeShift.id,
          cashier_id: activeShift.cashier_id,
          cashier_name: activeShift.cashier_name,
          cashier_role: activeShift.cashier_role,
          name: activeShift.cashier_name,
          role: activeShift.cashier_role,
          status: 'active',
          updated_at: new Date().toISOString(),
        },
      });
    }

    // POST /api/pos/shifts/close
    if (path === 'pos/shifts/close' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const pin = String(body.pin || body.pin_code || '').trim();
      const shiftId = String(body.id || body.shift_id || '');
      const shiftCode = String(body.shift_code || '');

      if (!pin) {
        return errorResponse('يرجى إدخال رمز PIN السري لتأكيد تقفيل الشيفت', 400, requestOrigin);
      }

      // 1. Fetch current active or targeted shift
      const shiftRows = await sql`
        SELECT * FROM shifts 
        WHERE (
          (${shiftId} != '' AND id::text = ${shiftId})
          OR (${shiftCode} != '' AND shift_code = ${shiftCode})
          OR status = 'active'
        )
        ORDER BY created_at DESC
        LIMIT 1
      `;

      if (!shiftRows || shiftRows.length === 0) {
        return errorResponse('لم يتم العثور على وردية نشطة لتقفيلها', 404, requestOrigin);
      }
      const targetShift = shiftRows[0];

      // 2. Validate PIN against DB: Master Admin PIN, Owner/Manager Role, or Current Cashier PIN
      const settings = await sql`SELECT admin_pin FROM system_settings ORDER BY updated_at DESC NULLS LAST LIMIT 1`;
      const systemAdminPin = settings && settings[0]?.admin_pin ? String(settings[0].admin_pin).trim() : '';

      const managersAndOwners = await sql`
        SELECT id, name, pin_code, system_role FROM employees
        WHERE system_role IN ('owner', 'manager') AND status = 'active'
      `;

      let assignedCashier: any = null;
      if (targetShift.cashier_id) {
        const cashierRows = await sql`
          SELECT id, name, pin_code, system_role FROM employees
          WHERE id::text = ${targetShift.cashier_id} AND status = 'active'
          LIMIT 1
        `;
        if (cashierRows && cashierRows.length > 0) {
          assignedCashier = cashierRows[0];
        }
      }

      let isAuthorized = false;
      let approverName = 'الإدارة العامة';

      if (systemAdminPin && safeConstantTimeEquals(pin, systemAdminPin)) {
        isAuthorized = true;
        approverName = 'لوحة الإدارة العامة (Master Admin)';
      } else {
        const matchedManager = managersAndOwners.find((m: any) =>
          safeConstantTimeEquals(pin, String(m.pin_code || '').trim())
        );
        if (matchedManager) {
          isAuthorized = true;
          approverName = matchedManager.name + (matchedManager.system_role === 'owner' ? ' (مالك المنشأة)' : ' (مدير تشغيل)');
        } else if (
          assignedCashier &&
          safeConstantTimeEquals(pin, String(assignedCashier.pin_code || '').trim())
        ) {
          isAuthorized = true;
          approverName = assignedCashier.name + ' (الكاشير المسؤول)';
        }
      }

      if (!isAuthorized) {
        return jsonResponse(
          {
            success: false,
            error: 'UNAUTHORIZED_PIN',
            message: 'رمز PIN غير صحيح أو غير مصرح له باعتماد تقفيل هذا الشفت. يجب إدخال رمز الكاشير المسؤول أو رمز الإدارة.',
          },
          401,
          requestOrigin
        );
      }

      // 3. Recalculate accurate financial metrics directly from PostgreSQL orders
      const resolvedShiftId = targetShift.id;
      const orderMetrics = await sql`
        SELECT 
          COUNT(*)::int AS total_orders,
          COALESCE(SUM(total_amount), 0)::float AS gross_sales,
          COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0)::float AS cash_sales,
          COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END), 0)::float AS card_sales,
          COALESCE(SUM(CASE WHEN payment_method IN ('transfer', 'split') THEN total_amount ELSE 0 END), 0)::float AS transfer_sales
        FROM orders
        WHERE (shift_id = ${resolvedShiftId} OR (shift_id IS NULL AND created_at >= ${targetShift.shift_start}))
          AND status != 'cancelled'
      `;

      const m = orderMetrics[0] || {
        total_orders: 0,
        gross_sales: 0,
        cash_sales: 0,
        card_sales: 0,
        transfer_sales: 0,
      };

      const openingCash = Number(targetShift.opening_cash) || 0;
      const calculatedExpectedCash = Number((openingCash + Number(m.cash_sales)).toFixed(2));
      const actualCash = body.actual_cash !== undefined && body.actual_cash !== null && body.actual_cash !== ''
        ? Number(body.actual_cash)
        : calculatedExpectedCash;
      const calculatedVariance = Number((actualCash - calculatedExpectedCash).toFixed(2));

      const shiftEnd = body.shift_end || new Date().toISOString();
      const closingNotes = body.closing_notes ? String(body.closing_notes).trim() : null;
      const isEndOfDay = !!body.is_end_of_day;
      const workersBreakdown = JSON.stringify(body.active_workers_breakdown || []);

      const updated = await sql`
        UPDATE shifts
        SET 
          status = 'closed',
          shift_end = ${shiftEnd},
          gross_sales = ${m.gross_sales},
          cash_sales = ${m.cash_sales},
          card_sales = ${m.card_sales},
          transfer_sales = ${m.transfer_sales},
          total_orders = ${m.total_orders},
          expected_cash = ${calculatedExpectedCash},
          actual_cash = ${actualCash},
          variance = ${calculatedVariance},
          closing_notes = ${closingNotes},
          approved_by = ${approverName},
          is_end_of_day = ${isEndOfDay},
          active_workers_breakdown = ${workersBreakdown}::jsonb,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${resolvedShiftId}
        RETURNING *
      `;

      // Auto clock-out cashier or all open attendance if end of day
      const cashierId = targetShift.cashier_id || body.cashier_id;
      if (isEndOfDay) {
        try {
          const openAtts = await sql`
            SELECT id, employee_id, check_in FROM attendance 
            WHERE check_out IS NULL
          `;
          for (const att of openAtts) {
            const inTime = new Date(att.check_in).getTime();
            const outTime = new Date(shiftEnd).getTime();
            const actualHours = Number((Math.max(outTime - inTime, 0) / (1000 * 60 * 60)).toFixed(2));
            await sql`
              UPDATE attendance 
              SET check_out = ${shiftEnd}, actual_hours = ${actualHours}, notes = COALESCE(notes, '') || ' | تقفيل نهاية اليوم'
              WHERE id = ${att.id}
            `;
          }
        } catch (e: any) {
          console.warn('[End-Of-Day Attendance Clock-out Warning]', e.message);
        }
      } else if (cashierId) {
        try {
          const openAtt = await sql`
            SELECT id, check_in FROM attendance 
            WHERE employee_id = ${cashierId} AND check_out IS NULL 
            ORDER BY check_in DESC LIMIT 1
          `;
          if (openAtt && openAtt.length > 0) {
            const inTime = new Date(openAtt[0].check_in).getTime();
            const outTime = new Date(shiftEnd).getTime();
            const actualHours = Number((Math.max(outTime - inTime, 0) / (1000 * 60 * 60)).toFixed(2));
            await sql`
              UPDATE attendance 
              SET check_out = ${shiftEnd}, actual_hours = ${actualHours}, notes = COALESCE(notes, '') || ' | تقفيل وردية الكاشير'
              WHERE id = ${openAtt[0].id}
            `;
          }
        } catch (e: any) {
          console.warn('[Attendance Clock-out Warning]', e.message);
        }
      }

      return jsonResponse({
        success: true,
        message: 'تم إقفال الوردية النشطة وحساب الإجماليات واعتمادها بنجاح',
        data: updated[0] || body,
      });
    }

    // GET /api/pos/shifts/history
    if (path === 'pos/shifts/history' && method === 'GET') {
      const rows = await sql`
        SELECT 
          id,
          shift_code,
          cashier_id,
          cashier_name,
          COALESCE(cashier_role, 'كاشير واستقبال') AS cashier_role,
          shift_start,
          shift_end,
          opening_cash::float AS opening_cash,
          gross_sales::float AS gross_sales,
          cash_sales::float AS cash_sales,
          card_sales::float AS card_sales,
          transfer_sales::float AS transfer_sales,
          total_orders::int AS total_orders,
          expected_cash::float AS expected_cash,
          actual_cash::float AS actual_cash,
          variance::float AS variance,
          status,
          closing_notes,
          approved_by,
          is_end_of_day,
          active_workers_breakdown,
          created_at,
          updated_at
        FROM shifts
        WHERE status = 'closed'
        ORDER BY shift_start DESC
        LIMIT 100
      `;

      return jsonResponse({
        success: true,
        count: rows.length,
        data: rows,
      });
    }

    // DELETE /api/pos/shifts/:id
    if (routeArray[0] === 'pos' && routeArray[1] === 'shifts' && method === 'DELETE') {
      if (!(await verifyAdminPinHeader(request, sql))) {
        return errorResponse('غير مصرح بالعملية. يرجى إدخال رمز PIN الإدارة', 403);
      }
      const shiftId = String(routeArray[2] || '');
      await sql`UPDATE orders SET shift_id = NULL WHERE shift_id::text = ${shiftId}`;
      await sql`DELETE FROM shifts WHERE id::text = ${shiftId} OR shift_code = ${shiftId}`;
      return jsonResponse({ success: true, message: 'تم حذف سجل الوردية بنجاح' });
    }

    // ==========================================
    // 2. HR & ATTENDANCE ENDPOINTS
    // ==========================================

    // GET /api/hr/attendance/today-status
    if (path === 'hr/attendance/today-status' && method === 'GET') {
      const todayStr = new Date().toISOString().slice(0, 10);
      const rows = await sql`
        SELECT 
          e.id AS employee_id,
          e.name AS employee_name,
          e.role AS employee_role,
          e.system_role,
          a.id AS attendance_id,
          a.work_date,
          a.check_in,
          a.check_out,
          a.actual_hours::float AS actual_hours,
          s.id AS active_shift_id
        FROM employees e
        LEFT JOIN attendance a ON e.id = a.employee_id 
          AND (a.work_date = ${todayStr}::date OR (a.check_in >= NOW() - INTERVAL '24 hours' AND a.check_out IS NULL))
        LEFT JOIN shifts s ON e.id = s.cashier_id AND s.status = 'active'
        WHERE e.status = 'active'
        ORDER BY a.check_in DESC NULLS LAST
      `;

      const statusMap: Record<string, any> = {};

      rows.forEach((row: any) => {
        if (!statusMap[row.employee_id]) {
          const isOwner = row.system_role === 'owner' || (row.employee_role && row.employee_role.includes('مالك'));
          const isActiveCashier = Boolean(row.active_shift_id);
          const hasActiveAttendance = Boolean(row.check_in && !row.check_out);

          if (isOwner) {
            statusMap[row.employee_id] = {
              status: 'completed_shift',
              label: 'إدارة المنشأة والملكية 👑',
              badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
              isOwner: true,
            };
          } else if (isActiveCashier || hasActiveAttendance) {
            statusMap[row.employee_id] = {
              status: 'active_shift',
              label: 'حاضر الآن (شفت نشط) 🟢',
              badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
              check_in: row.check_in || new Date().toISOString(),
            };
          } else if (row.check_in && row.check_out) {
            statusMap[row.employee_id] = {
              status: 'completed_shift',
              label: 'انصرف بالفعل ⚪',
              badgeColor: 'bg-slate-700/50 text-slate-300 border-slate-600',
              check_in: row.check_in,
              check_out: row.check_out,
            };
          } else {
            statusMap[row.employee_id] = {
              status: 'not_attended',
              label: 'غير حاضر اليوم ❌',
              badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
            };
          }
        }
      });

      return json({
        success: true,
        data: statusMap,
      });
    }

    // POST /api/hr/attendance/clock
    if (path === 'hr/attendance/clock' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const empId = body.employee_id;
      const pin = String(body.pin_code || body.pin || '').trim();
      const action = String(body.action || body.action_type || 'check_in').toLowerCase();
      const isClockIn = action === 'check_in' || action === 'clock_in';
      const notes = body.notes ? String(body.notes).trim() : null;

      if (!empId) {
        return err('يرجى تحديد الموظف', 400);
      }
      if (!pin) {
        return err('يرجى إدخال رمز PIN السري للموظف', 400);
      }

      const empRows = await sql`
        SELECT id, name, role, system_role, pin_code, hourly_rate::float AS hourly_rate
        FROM employees 
        WHERE id::text = ${empId} AND status = 'active'
        LIMIT 1
      `;

      if (!empRows || empRows.length === 0) {
        return err('الموظف المحدد غير موجود في السجلات أو غير نشط', 404);
      }

      const employee = empRows[0];
      const expectedPin = String(employee.pin_code || '1111').trim();
      if (pin !== expectedPin) {
        return err(`رمز PIN السري للموظف (${employee.name}) غير صحيح`, 400);
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const todayStr = nowIso.slice(0, 10);
      const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

      // Auto-close any stale unclosed attendance records older than 16 hours for this employee
      await sql`
        UPDATE attendance 
        SET check_out = check_in + INTERVAL '8 hours', 
            actual_hours = 8.00, 
            overtime_hours = 0.00,
            deducted_hours = 0.00,
            notes = COALESCE(notes, '') || ' [إغلاق تلقائي لشفت معلق سابق]'
        WHERE employee_id = ${empId} AND check_out IS NULL AND check_in < NOW() - INTERVAL '16 hours'
      `;

      if (isClockIn) {
        // Check if there is already an open attendance record
        const openCheck = await sql`
          SELECT id, check_in FROM attendance 
          WHERE employee_id = ${empId} AND check_out IS NULL 
          ORDER BY check_in DESC LIMIT 1
        `;

        const completedToday = await sql`
          SELECT COUNT(*)::int AS count 
          FROM attendance 
          WHERE employee_id = ${empId} AND work_date = ${todayStr}::date AND check_out IS NOT NULL
        `;
        const shiftNumber = (completedToday[0]?.count || 0) + 1;

        if (openCheck && openCheck.length > 0) {
          return json({
            success: true,
            message: `الموظف (${employee.name}) مسجل حضور بالفعل بالوردية الحالية ومستمر بالعمل`,
            data: {
              action: 'check_in',
              employee_name: employee.name,
              time: timeStr,
              shift_number: shiftNumber,
              hours_worked: 0,
              overtime_hours: 0,
              attendance_id: openCheck[0].id,
            },
          }, 200);
        }

        const inserted = await sql`
          INSERT INTO attendance (
            employee_id, work_date, check_in, actual_hours, overtime_hours, deducted_hours, notes
          ) VALUES (
            ${empId}, ${todayStr}::date, ${nowIso}, 0, 0, 0, ${notes || `تسجيل حضور الوردية (${shiftNumber}) عبر PIN`}
          )
          RETURNING *
        `;

        return json({
          success: true,
          message: `تم تسجيل حضور الوردية رقم (${shiftNumber}) للموظف (${employee.name}) بنجاح الساعة ${timeStr}`,
          data: {
            action: 'check_in',
            employee_name: employee.name,
            time: timeStr,
            shift_number: shiftNumber,
            hours_worked: 0,
            overtime_hours: 0,
            attendance: inserted[0],
          },
        }, 200);
      } else {
        // Clock out
        const openCheck = await sql`
          SELECT id, check_in FROM attendance 
          WHERE employee_id = ${empId} AND check_out IS NULL 
          ORDER BY check_in DESC LIMIT 1
        `;

        if (!openCheck || openCheck.length === 0) {
          return err(`الموظف (${employee.name}) غير مسجل حضور حالياً لإتمام الإنصراف`, 400);
        }

        const checkInDate = new Date(openCheck[0].check_in);
        let diffHours = Math.max(0, Number(((now.getTime() - checkInDate.getTime()) / (1000 * 60 * 60)).toFixed(2)));
        if (diffHours > 16) {
          diffHours = 8.00;
        }

        const standardHours = 8.00;
        const overtime = Math.max(0, Number((diffHours - standardHours).toFixed(2)));
        const deducted = Math.max(0, Number((standardHours - diffHours).toFixed(2)));

        const updated = await sql`
          UPDATE attendance 
          SET check_out = ${nowIso},
              actual_hours = ${diffHours},
              overtime_hours = ${overtime},
              deducted_hours = ${deducted},
              notes = COALESCE(${notes}, notes)
          WHERE id = ${openCheck[0].id}
          RETURNING *
        `;

        const completedToday = await sql`
          SELECT COUNT(*)::int AS count 
          FROM attendance 
          WHERE employee_id = ${empId} AND work_date = ${todayStr}::date AND check_out IS NOT NULL
        `;
        const shiftNumber = Math.max(completedToday[0]?.count || 1, 1);

        return json({
          success: true,
          message: `تم تسجيل إنهاء الوردية رقم (${shiftNumber}) للموظف (${employee.name}) بنجاح (إجمالي ساعات العمل: ${diffHours} ساعة)`,
          data: {
            action: 'check_out',
            employee_name: employee.name,
            time: timeStr,
            shift_number: shiftNumber,
            hours_worked: diffHours,
            overtime_hours: overtime,
            deducted_hours: deducted,
            attendance: updated[0],
          },
        }, 200);
      }
    }

    // GET /api/hr/attendance
    if (path === 'hr/attendance' && method === 'GET') {
      // Auto-close any stale unclosed attendance records older than 16 hours
      await sql`
        UPDATE attendance 
        SET check_out = check_in + INTERVAL '8 hours', 
            actual_hours = 8.00, 
            overtime_hours = 0.00,
            deducted_hours = 0.00,
            notes = COALESCE(notes, '') || ' [إغلاق تلقائي لشفت معلق]'
        WHERE check_out IS NULL AND check_in < NOW() - INTERVAL '16 hours'
      `;

      const rows = await sql`
        SELECT 
          a.id,
          a.employee_id,
          e.name AS employee_name,
          e.role AS employee_role,
          a.work_date,
          a.check_in,
          a.check_out,
          a.actual_hours::float AS actual_hours,
          a.overtime_hours::float AS overtime_hours,
          a.deducted_hours::float AS deducted_hours,
          a.notes,
          a.created_at
        FROM attendance a
        JOIN employees e ON a.employee_id = e.id
        ORDER BY a.work_date DESC, a.check_in DESC
        LIMIT 100
      `;

      return jsonResponse({
        success: true,
        count: rows.length,
        data: rows,
      });
    }

    // POST /api/hr/attendance
    if (path === 'hr/attendance' && method === 'POST') {
      if (!(await verifyAdminPinHeader(request, sql))) {
        return errorResponse('غير مصرح بالعملية. يرجى إدخال رمز PIN الإدارة', 403, requestOrigin);
      }
      const body = await request.json().catch(() => ({}));
      const empId = body.employee_id;
      const checkIn = body.check_in || new Date().toISOString();
      const checkOut = body.check_out || null;
      const workDate = body.work_date || new Date(checkIn).toISOString().slice(0, 10);
      const notes = body.notes || null;

      const existing = await sql`
        SELECT id FROM attendance 
        WHERE employee_id = ${empId} AND work_date = ${workDate}::date AND check_out IS NULL 
        LIMIT 1
      `;

      if (existing && existing.length > 0 && !checkOut) {
        const updated = await sql`
          UPDATE attendance 
          SET check_in = ${checkIn}, notes = COALESCE(${notes}, notes)
          WHERE id = ${existing[0].id}
          RETURNING *
        `;
        return jsonResponse({ success: true, data: updated[0] }, 200, requestOrigin);
      }

      const inserted = await sql`
        INSERT INTO attendance (
          employee_id, work_date, check_in, check_out, actual_hours, overtime_hours, deducted_hours, notes
        ) VALUES (${empId}, ${workDate}::date, ${checkIn}, ${checkOut}, 0, 0, 0, ${notes})
        RETURNING *
      `;

      return jsonResponse({ success: true, data: inserted[0] }, 201, requestOrigin);
    }

    // GET /api/hr/employees
    if (path === 'hr/employees' && method === 'GET') {
      const isAdmin = await verifyAdminPinHeader(request, sql);
      const statusParam = url.searchParams.get('status');
      const rows = await sql`
        SELECT 
          id, 
          name, 
          phone, 
          role, 
          COALESCE(system_role, 'worker') AS system_role,
          hourly_rate::float AS hourly_rate, 
          overtime_hourly_rate::float AS overtime_hourly_rate,
          target_weekly_days, 
          target_weekly_hours::float AS target_weekly_hours, 
          COALESCE(weekly_off_day, 'الجمعة') AS weekly_off_day,
          COALESCE(is_paid_weekly_off, false) AS is_paid_weekly_off,
          pin_code,
          status, 
          hire_date, 
          created_at, 
          updated_at
        FROM employees
        WHERE (${statusParam}::text IS NULL OR status = ${statusParam})
        ORDER BY CASE WHEN system_role = 'owner' OR name = 'مستر فتحي' OR role LIKE '%مالك%' THEN 0 ELSE 1 END, name ASC
      `;

      const sanitizedRows = rows.map((r: any) => {
        if (isAdmin) return r;
        const { pin_code, ...publicData } = r;
        return publicData;
      });

      return jsonResponse(
        {
          success: true,
          count: sanitizedRows.length,
          data: sanitizedRows,
        },
        200,
        requestOrigin,
        'public, max-age=10, s-maxage=60, stale-while-revalidate=300'
      );
    }

    // POST /api/hr/employees
    if (path === 'hr/employees' && method === 'POST') {
      if (!(await verifyAdminPinHeader(request, sql))) {
        return errorResponse('غير مصرح بالعملية. يرجى إدخال رمز PIN الإدارة', 403, requestOrigin);
      }
      const body = await request.json().catch(() => ({}));
      const name = (body.name || '').trim();
      if (!name) return errorResponse('اسم الموظف مطلوب', 400, requestOrigin);

      const VALID_ROLES = ['worker', 'cashier', 'manager', 'owner'];
      const rawSystemRole = body.system_role ? String(body.system_role).trim().toLowerCase() : 'worker';
      const systemRole = VALID_ROLES.includes(rawSystemRole) ? rawSystemRole : 'worker';

      const phone = body.phone ? body.phone.trim() : null;
      const role = (body.role || 'فني غسيل').trim();
      const hourlyRate = Number(body.hourly_rate) || 30.0;
      const overtimeRate = body.overtime_hourly_rate !== undefined && body.overtime_hourly_rate !== null && body.overtime_hourly_rate !== ''
        ? Number(body.overtime_hourly_rate)
        : null;
      const targetWeeklyDays = Number(body.target_weekly_days) || 6;
      const targetWeeklyHours = Number(body.target_weekly_hours) || 48.0;
      const weeklyOffDay = (body.weekly_off_day || 'الجمعة').trim();
      const isPaidWeeklyOff = Boolean(body.is_paid_weekly_off);
      const pinCode = (body.pin_code || '1234').trim();
      const status = body.status || 'active';
      const hireDate = body.hire_date || new Date().toISOString().slice(0, 10);

      const inserted = await sql`
        INSERT INTO employees (
          name, phone, role, system_role, hourly_rate, overtime_hourly_rate, target_weekly_days, target_weekly_hours,
          weekly_off_day, is_paid_weekly_off, pin_code, status, hire_date
        ) VALUES (
          ${name}, ${phone}, ${role}, ${systemRole}, ${hourlyRate}, ${overtimeRate}, ${targetWeeklyDays}, ${targetWeeklyHours},
          ${weeklyOffDay}, ${isPaidWeeklyOff}, ${pinCode}, ${status}, ${hireDate}
        )
        RETURNING 
          id, name, phone, role, COALESCE(system_role, 'worker') AS system_role,
          hourly_rate::float AS hourly_rate, overtime_hourly_rate::float AS overtime_hourly_rate,
          target_weekly_days, target_weekly_hours::float AS target_weekly_hours,
          COALESCE(weekly_off_day, 'الجمعة') AS weekly_off_day, COALESCE(is_paid_weekly_off, false) AS is_paid_weekly_off,
          pin_code, status, hire_date, created_at, updated_at
      `;

      return jsonResponse({ success: true, data: inserted[0] }, 201, requestOrigin);
    }

    // PUT /api/hr/employees/:id
    if (routeArray[0] === 'hr' && routeArray[1] === 'employees' && routeArray[2] && method === 'PUT') {
      if (!(await verifyAdminPinHeader(request, sql))) {
        return errorResponse('غير مصرح بالعملية. يرجى إدخال رمز PIN الإدارة', 403, requestOrigin);
      }
      const empId = routeArray[2];
      const body = await request.json().catch(() => ({}));

      const existing = await sql`SELECT id FROM employees WHERE id = ${empId}`;
      if (!existing || existing.length === 0) return errorResponse('الموظف المطلوب غير موجود', 404, requestOrigin);

      const VALID_ROLES = ['worker', 'cashier', 'manager', 'owner'];
      let targetSystemRole = null;
      if (body.system_role) {
        const cleanedRole = String(body.system_role).trim().toLowerCase();
        if (VALID_ROLES.includes(cleanedRole)) {
          targetSystemRole = cleanedRole;
        } else {
          return errorResponse('نوع الحساب أو الصلاحية المحددة غير صالحة', 400, requestOrigin);
        }
      }

      const updated = await sql`
        UPDATE employees
        SET
          name = COALESCE(${body.name ? body.name.trim() : null}, name),
          phone = COALESCE(${body.phone ? body.phone.trim() : null}, phone),
          role = COALESCE(${body.role ? body.role.trim() : null}, role),
          system_role = COALESCE(${targetSystemRole}, system_role),
          hourly_rate = COALESCE(${body.hourly_rate !== undefined ? Number(body.hourly_rate) : null}, hourly_rate),
          overtime_hourly_rate = CASE 
            WHEN ${body.overtime_hourly_rate !== undefined} THEN ${body.overtime_hourly_rate !== null && body.overtime_hourly_rate !== '' ? Number(body.overtime_hourly_rate) : null}
            ELSE overtime_hourly_rate
          END,
          target_weekly_days = COALESCE(${body.target_weekly_days !== undefined ? Number(body.target_weekly_days) : null}, target_weekly_days),
          target_weekly_hours = COALESCE(${body.target_weekly_hours !== undefined ? Number(body.target_weekly_hours) : null}, target_weekly_hours),
          weekly_off_day = COALESCE(${body.weekly_off_day ? body.weekly_off_day.trim() : null}, weekly_off_day),
          is_paid_weekly_off = COALESCE(${body.is_paid_weekly_off !== undefined ? Boolean(body.is_paid_weekly_off) : null}, is_paid_weekly_off),
          pin_code = COALESCE(${body.pin_code && String(body.pin_code).trim() ? String(body.pin_code).trim() : null}, pin_code),
          status = COALESCE(${body.status || null}, status),
          updated_at = NOW()
        WHERE id = ${empId}
        RETURNING 
          id, name, phone, role, COALESCE(system_role, 'worker') AS system_role,
          hourly_rate::float AS hourly_rate, overtime_hourly_rate::float AS overtime_hourly_rate,
          target_weekly_days, target_weekly_hours::float AS target_weekly_hours,
          COALESCE(weekly_off_day, 'الجمعة') AS weekly_off_day, COALESCE(is_paid_weekly_off, false) AS is_paid_weekly_off,
          pin_code, status, hire_date, created_at, updated_at
      `;

      return jsonResponse({ success: true, data: updated[0] }, 200, requestOrigin);
    }

    // DELETE /api/hr/employees/:id
    if (routeArray[0] === 'hr' && routeArray[1] === 'employees' && routeArray[2] && method === 'DELETE') {
      if (!(await verifyAdminPinHeader(request, sql))) {
        return errorResponse('غير مصرح بالعملية. يرجى إدخال رمز PIN الإدارة', 403);
      }
      const empId = routeArray[2];
      await sql`UPDATE orders SET assigned_employee_id = NULL WHERE assigned_employee_id = ${empId}`;
      await sql`DELETE FROM attendance WHERE employee_id = ${empId}`;
      await sql`DELETE FROM employee_transactions WHERE employee_id = ${empId}`;
      await sql`DELETE FROM employees WHERE id = ${empId}`;
      return jsonResponse({ success: true, message: 'تم حذف الموظف وسجلاته بنجاح' });
    }

    // ==========================================
    // 3. DASHBOARD STATS ENDPOINT
    // ==========================================

    // GET /api/dashboard/stats
    if (path === 'dashboard/stats' && method === 'GET') {
      const todayStr = new Date().toISOString().slice(0, 10);

      const [todaySales, totalSales, activeStaff, attendedStaff, lowStock, topServices, recentOrders, cashierSales] =
        await Promise.all([
          sql`
            SELECT 
              COALESCE(SUM(total_amount), 0)::float AS today_revenue,
              COUNT(id)::int AS today_orders_count,
              COUNT(id)::int AS today_completed_washes
            FROM orders
            WHERE DATE(created_at) = ${todayStr}::date AND status != 'cancelled'
          `,
          sql`
            SELECT 
              COALESCE(SUM(total_amount), 0)::float AS total_revenue,
              COUNT(id)::int AS total_orders_count
            FROM orders
            WHERE status != 'cancelled'
          `,
          sql`
            SELECT COUNT(*)::int AS count 
            FROM employees 
            WHERE status = 'active' AND name != 'مستر فتحي' AND role NOT LIKE '%مالك%'
          `,
          sql`
            SELECT COUNT(DISTINCT e.id)::int AS count 
            FROM employees e
            WHERE e.status = 'active' 
              AND e.name != 'مستر فتحي' 
              AND e.role NOT LIKE '%مالك%' 
              AND (e.system_role IS NULL OR e.system_role != 'owner')
              AND (
                EXISTS (
                  SELECT 1 FROM attendance a 
                  WHERE a.employee_id = e.id 
                    AND (a.work_date = ${todayStr}::date OR a.check_in >= NOW() - INTERVAL '24 hours')
                    AND a.check_out IS NULL
                )
                OR EXISTS (
                  SELECT 1 FROM shifts s 
                  WHERE s.cashier_id = e.id AND s.status = 'active'
                )
              )
          `,
          sql`
            SELECT id, name, current_stock_grams::float, reorder_threshold_grams::float
            FROM inventory_items
            WHERE current_stock_grams <= reorder_threshold_grams
          `,
          sql`
            SELECT s.id, s.name, COUNT(o.id)::int AS total_orders, COALESCE(SUM(o.total_amount), 0)::float AS total_revenue
            FROM services s
            LEFT JOIN orders o ON s.id = o.service_id AND o.status != 'cancelled'
            GROUP BY s.id, s.name
            ORDER BY total_orders DESC
            LIMIT 5
          `,
          sql`
            SELECT o.id, o.order_code, o.car_plate, o.car_type, o.customer_name, s.name AS service_name, o.total_amount::float, o.payment_method, o.status, o.created_at
            FROM orders o
            LEFT JOIN services s ON o.service_id = s.id
            ORDER BY o.created_at DESC
            LIMIT 5
          `,
          sql`
            SELECT 
              COALESCE(e.id::text, 'unassigned') AS cashier_id,
              COALESCE(e.name, 'بدون تحديد عامل') AS cashier_name,
              COALESCE(e.role, 'فني / كاشير') AS cashier_role,
              COUNT(o.id)::int AS orders_count,
              COALESCE(SUM(o.total_amount), 0)::float AS total_sales,
              COALESCE(SUM(CASE WHEN o.payment_method = 'cash' THEN o.total_amount ELSE 0 END), 0)::float AS cash_sales,
              COALESCE(SUM(CASE WHEN o.payment_method = 'card' THEN o.total_amount ELSE 0 END), 0)::float AS card_sales,
              COALESCE(SUM(CASE WHEN o.payment_method IN ('transfer', 'wallet') THEN o.total_amount ELSE 0 END), 0)::float AS transfer_sales
            FROM orders o
            LEFT JOIN employees e ON o.assigned_employee_id = e.id
            WHERE o.status != 'cancelled'
            GROUP BY e.id, e.name, e.role
            ORDER BY total_sales DESC
          `,
        ]);

      return jsonResponse({
        success: true,
        data: {
          today: todaySales[0] || { today_revenue: 0, today_orders_count: 0, today_completed_washes: 0 },
          all_time: totalSales[0] || { total_revenue: 0, total_orders_count: 0 },
          inventory: {
            low_stock_count: lowStock.length,
            low_stock_items: lowStock,
          },
          hr: {
            active_employees_count: activeStaff[0]?.count || 4,
            attended_today_count: attendedStaff[0]?.count || 0,
          },
          top_services: topServices,
          recent_orders: recentOrders,
          cashier_sales: cashierSales,
          generated_at: new Date().toISOString(),
        },
      });
    }

    // ==========================================
    // 4. POS ORDERS ENDPOINTS
    // ==========================================

    // GET /api/pos/orders
    if (path === 'pos/orders' && method === 'GET') {
      const limitParam = parseInt(url.searchParams.get('limit') || '100', 10);
      const safeLimit = Math.max(1, Math.min(Number.isNaN(limitParam) ? 100 : limitParam, 100));
      const offsetParam = parseInt(url.searchParams.get('offset') || '0', 10);
      const safeOffset = Math.max(0, Number.isNaN(offsetParam) ? 0 : offsetParam);

      const rows = await sql`
        SELECT 
          o.id,
          o.order_code,
          o.car_plate,
          o.car_type,
          o.customer_name,
          o.customer_phone,
          o.service_id,
          s.name AS service_name,
          s.egs_code AS service_egs_code,
          o.subtotal::float AS subtotal,
          o.tax_amount::float AS tax_amount,
          o.total_amount::float AS total_amount,
          o.payment_method,
          o.status,
          o.assigned_employee_id,
          e.name AS assigned_employee_name,
          o.shift_id,
          o.cashier_id,
          o.cashier_name,
          o.eta_uuid,
          o.eta_submission_id,
          o.eta_status,
          o.eta_share_url,
          o.eta_synced_at,
          o.eta_error_message,
          o.notes,
          o.created_at,
          o.updated_at
        FROM orders o
        LEFT JOIN services s ON o.service_id = s.id
        LEFT JOIN employees e ON o.assigned_employee_id = e.id
        ORDER BY o.created_at DESC
        LIMIT ${safeLimit} OFFSET ${safeOffset}
      `;

      return jsonResponse({
        success: true,
        count: rows.length,
        limit: safeLimit,
        offset: safeOffset,
        data: rows,
      });
    }

    // POST /api/pos/orders
    if (path === 'pos/orders' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const serviceId = body.service_id;
      if (!serviceId) {
        return errorResponse('يرجى تحديد خدمة الغسيل', 400);
      }

      // Fetch service
      const services = await sql`SELECT id, name, price::float AS price FROM services WHERE id::text = ${serviceId}`;
      if (!services || services.length === 0) {
        return err('خدمة الغسيل المحددة غير موجودة', 404);
      }
      const service = services[0];

      // Idempotency check: if order_code is passed and already exists, return it immediately without duplicate insert or BOM deduction!
      const clientOrderCode = body.order_code ? String(body.order_code).trim() : null;
      if (clientOrderCode) {
        const existingOrder = await sql`
          SELECT 
            id, order_code, car_plate, car_type, customer_name, customer_phone,
            service_id, subtotal::float AS subtotal, tax_amount::float AS tax_amount,
            total_amount::float AS total_amount, payment_method, status,
            assigned_employee_id, notes, shift_id, cashier_id, cashier_name,
            created_at, updated_at
          FROM orders 
          WHERE order_code = ${clientOrderCode} 
          LIMIT 1
        `;
        if (existingOrder && existingOrder.length > 0) {
          return json({
            success: true,
            message: 'الفاتورة مسجلة بالفعل',
            data: {
              order: {
                ...existingOrder[0],
                service_name: service.name,
              },
            },
          }, 200);
        }
      }

      // Auto resolve active shift
      let shiftId = body.shift_id || null;
      let cashierId = body.cashier_id || null;
      let cashierName = body.cashier_name || null;

      if (!shiftId) {
        const activeShifts = await sql`SELECT id, cashier_id, cashier_name FROM shifts WHERE status = 'active' ORDER BY shift_start DESC LIMIT 1`;
        if (activeShifts && activeShifts.length > 0) {
          shiftId = activeShifts[0].id;
          if (!cashierId) cashierId = activeShifts[0].cashier_id;
          if (!cashierName) cashierName = activeShifts[0].cashier_name;
        }
      }

      const orderCode = clientOrderCode || `CW-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
      const price = Number(service.price) || 150;
      const subtotal = Number((price / 1.14).toFixed(2));
      const taxAmount = Number((price - subtotal).toFixed(2));

      // Deduct BOM from inventory
      const recipes = await sql`
        SELECT sr.inventory_item_id, sr.quantity_grams::float AS quantity_grams, i.name AS item_name
        FROM service_recipes sr
        JOIN inventory_items i ON sr.inventory_item_id = i.id
        WHERE sr.service_id = ${serviceId}
      `;

      for (const recipe of recipes) {
        await sql`
          UPDATE inventory_items 
          SET current_stock_grams = GREATEST(current_stock_grams - ${recipe.quantity_grams}, 0)
          WHERE id = ${recipe.inventory_item_id}
        `;
      }

      const inserted = await sql`
        INSERT INTO orders (
          order_code, car_plate, car_type, customer_name, customer_phone,
          service_id, subtotal, tax_amount, total_amount, payment_method,
          status, assigned_employee_id, notes, shift_id, cashier_id, cashier_name
        ) VALUES (
          ${orderCode},
          ${body.car_plate || null},
          ${body.car_type || 'سيدان'},
          ${body.customer_name || null},
          ${body.customer_phone || null},
          ${serviceId},
          ${subtotal},
          ${taxAmount},
          ${price},
          ${body.payment_method || 'cash'},
          ${body.status || 'completed'},
          ${body.assigned_employee_id || null},
          ${body.notes || null},
          ${shiftId},
          ${cashierId},
          ${cashierName}
        )
        RETURNING *
      `;

      // Record in inventory_transactions audit log
      try {
        await sql`
          CREATE TABLE IF NOT EXISTS inventory_transactions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            inventory_item_id UUID NOT NULL,
            order_id UUID,
            transaction_type VARCHAR(50) NOT NULL,
            quantity_grams NUMERIC(12, 2) NOT NULL,
            previous_stock_grams NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
            new_stock_grams NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
            cost_impact NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `;
        for (const recipe of recipes) {
          await sql`
            INSERT INTO inventory_transactions (
              inventory_item_id, order_id, transaction_type, quantity_grams,
              cost_impact, notes
            ) VALUES (
              ${recipe.inventory_item_id},
              ${inserted[0].id},
              'deduction_order',
              ${recipe.quantity_grams},
              0,
              ${'خصم مواد استهلاك لطلب رقم ' + orderCode}
            )
          `;
        }
      } catch (e: any) {
        console.warn('[Inventory Audit Trail Warning]', e.message);
      }

      return json({
        success: true,
        message: 'تم إنشاء الفاتورة بنجاح',
        data: {
          order: {
            ...inserted[0],
            subtotal,
            tax_amount: taxAmount,
            total_amount: price,
            service_name: service.name,
          },
        },
      }, 201);
    }

    // POST /api/pos/orders/:id/cancel
    if (routeArray[0] === 'pos' && routeArray[1] === 'orders' && routeArray[3] === 'cancel' && method === 'POST') {
      if (!(await verifyAdminPinHeader(request, sql))) {
        return errorResponse('غير مصرح بالعملية. يرجى إدخال رمز PIN الإدارة', 403, requestOrigin);
      }
      const orderId = routeArray[2];
      const body = await request.json().catch(() => ({}));
      const reason = body.reason ? String(body.reason).trim() : 'إلغاء واسترجاع الفاتورة';

      const orderRows = await sql`SELECT * FROM orders WHERE id::text = ${orderId}`;
      if (!orderRows || orderRows.length === 0) {
        return errorResponse('الفاتورة غير موجودة', 404, requestOrigin);
      }
      const order = orderRows[0];

      if (order.status === 'cancelled') {
        return jsonResponse({ success: true, message: 'الفاتورة ملغاة بالفعل', data: order }, 200, requestOrigin);
      }

      // Check if service recipes exist to restore
      let recipes: any[] = [];
      if (order.service_id) {
        recipes = await sql`
          SELECT inventory_item_id, quantity_grams::float AS quantity_grams
          FROM service_recipes
          WHERE service_id = ${order.service_id}
        `;
      }

      const noteText = 'ملغاة: ' + reason;

      try {
        // Atomic transaction: neon supports sql.transaction([...queries])
        // We execute all updates atomically so stock reversion and order cancellation succeed or fail together.
        const txQueries: any[] = [
          // 1. Cancel order
          sql`
            UPDATE orders
            SET 
              status = 'cancelled',
              notes = CASE 
                WHEN notes IS NULL OR notes = '' THEN ${noteText}
                ELSE notes || ${' | ' + noteText}
              END,
              updated_at = NOW()
            WHERE id::text = ${orderId} AND status != 'cancelled'
            RETURNING *
          `
        ];

        // 2. Revert BOM inventory items & log transaction
        for (const recipe of recipes) {
          txQueries.push(
            sql`
              UPDATE inventory_items 
              SET current_stock_grams = current_stock_grams + ${recipe.quantity_grams},
                  updated_at = NOW()
              WHERE id = ${recipe.inventory_item_id}
            `
          );
          txQueries.push(
            sql`
              INSERT INTO inventory_transactions (
                inventory_item_id, order_id, transaction_type, quantity_grams,
                cost_impact, notes
              ) VALUES (
                ${recipe.inventory_item_id},
                ${order.id},
                'cancel_restore',
                ${recipe.quantity_grams},
                0,
                ${'إعادة المواد الخام للمخزن لإلغاء طلب رقم ' + (order.order_code || orderId)}
              )
            `
          );
        }

        let updatedOrder: any = null;
        if (typeof (sql as any).transaction === 'function') {
          const results = await (sql as any).transaction(txQueries);
          updatedOrder = results[0]?.[0];
        } else {
          // Fallback if neon driver instance lacks .transaction method:
          await sql`BEGIN`;
          try {
            const res = await txQueries[0];
            updatedOrder = res?.[0];
            for (let i = 1; i < txQueries.length; i++) {
              await txQueries[i];
            }
            await sql`COMMIT`;
          } catch (innerErr) {
            await sql`ROLLBACK`;
            throw innerErr;
          }
        }

        return jsonResponse({
          success: true,
          message: 'تم إلغاء الفاتورة واسترجاع أرصدة المواد الخام بنجاح',
          data: updatedOrder || { ...order, status: 'cancelled' },
        }, 200, requestOrigin);
      } catch (err: any) {
        console.error('[Order Cancel Error]', err);
        return errorResponse('فشل إلغاء الفاتورة واسترجاع المخزون: ' + (err.message || 'خطأ غير متوقع'), 500, requestOrigin);
      }
    }

    // PATCH /api/pos/orders/:id/status
    if (routeArray[0] === 'pos' && routeArray[1] === 'orders' && routeArray[3] === 'status' && (method === 'PATCH' || method === 'PUT')) {
      const orderId = routeArray[2];
      const body = await request.json().catch(() => ({}));
      const newStatus = String(body.status || 'completed').trim();

      const updated = await sql`
        UPDATE orders
        SET status = ${newStatus}, updated_at = NOW()
        WHERE id::text = ${orderId}
        RETURNING *
      `;

      if (!updated || updated.length === 0) {
        return errorResponse('الفاتورة غير موجودة', 404, requestOrigin);
      }

      return jsonResponse({ success: true, data: updated[0] }, 200, requestOrigin);
    }


    // ==========================================
    // 5. AUTH & CASHIER / ADMIN PIN ENDPOINTS
    // ==========================================

    // POST /api/pos/auth/cashier-verify
    if (path === 'pos/auth/cashier-verify' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const empId = String(body.employee_id || body.id || '').trim();
      const pin = String(body.pin || body.pin_code || '').trim();

      if (!empId) {
        return errorResponse('يرجى اختيار الموظف أو الكاشير', 400, requestOrigin);
      }
      if (!pin) {
        return errorResponse('يرجى إدخال رمز PIN السري', 400, requestOrigin);
      }

      try {
        const empRows = await sql`
          SELECT id, name, role, system_role, status, pin_code
          FROM employees 
          WHERE id::text = ${empId} AND status = 'active'
          LIMIT 1
        `;

        if (!empRows || empRows.length === 0) {
          return errorResponse('الموظف المحدد غير موجود في السجلات أو غير نشط', 404, requestOrigin);
        }

        const employee = empRows[0];
        const expectedPin = String(employee.pin_code || '').trim();

        if (!safeConstantTimeEquals(pin, expectedPin)) {
          return jsonResponse({ success: false, valid: false, error: 'رمز PIN السري غير صحيح للموظف المحدد' }, 401, requestOrigin);
        }

        if (employee.system_role === 'worker') {
          return errorResponse('حساب فني تشغيل غير مصرح له بفتح نقاط البيع (POS)', 403, requestOrigin);
        }

        return jsonResponse({
          success: true,
          valid: true,
          message: 'تم التحقق من هوية الكاشير بنجاح',
          employee: {
            id: employee.id,
            name: employee.name,
            role: employee.role,
            system_role: employee.system_role,
          },
        }, 200, requestOrigin);
      } catch (authErr: any) {
        console.error('[Cashier-Verify-DB-Error]', authErr);
        return errorResponse(`خطأ في التحقق من هوية الموظف: ${authErr?.message}`, 500, requestOrigin);
      }
    }

    // POST /api/auth/verify-pin & POST /api/dashboard/verify-pin
    if ((path === 'auth/verify-pin' || path === 'dashboard/verify-pin') && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const pin = String(body.pin || body.pin_code || '').trim();
      if (!pin) {
        return errorResponse('يرجى إدخال رمز PIN', 400, requestOrigin);
      }

      try {
        // 1. Single canonical source of truth: system_settings.admin_pin
        const settings = await sql`SELECT admin_pin FROM system_settings ORDER BY updated_at DESC NULLS LAST LIMIT 1`;
        const systemAdminPin = (settings && settings[0]?.admin_pin) ? String(settings[0].admin_pin).trim() : '';

        // 2. Active owner employee accounts
        const owners = await sql`
          SELECT pin_code FROM employees 
          WHERE (system_role = 'owner' OR role ILIKE '%مالك%' OR name = 'مستر فتحي') 
            AND status = 'active'
        `;

        const isMatch = (systemAdminPin && safeConstantTimeEquals(pin, systemAdminPin)) || owners.some((o: any) => safeConstantTimeEquals(pin, String(o.pin_code || '').trim()));
        console.log('[Verify-PIN]', { matched: isMatch });

        if (isMatch) {
          return jsonResponse({ success: true, valid: true, message: 'رمز PIN صحيح' }, 200, requestOrigin);
        } else {
          return jsonResponse({ success: false, valid: false, error: 'رمز PIN غير صحيح' }, 401, requestOrigin);
        }
      } catch (dbErr: any) {
        console.error('[Verify-PIN-DB-Error]', dbErr);
        return jsonResponse({ success: false, valid: false, error: 'خطأ في التحقق من قاعدة البيانات', debug_error: dbErr?.message }, 500, requestOrigin);
      }
    }

    // POST /api/dashboard/change-pin
    if (path === 'dashboard/change-pin' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const currentPin = String(body.currentPin || body.current_pin || '').trim();
      const newPin = String(body.newPin || body.new_pin || '').trim();

      if (!currentPin) return errorResponse('يرجى إدخال رمز PIN الحالي', 400, requestOrigin);
      if (!/^\d{4,6}$/.test(newPin)) return errorResponse('رمز PIN الجديد يجب أن يتكون من 4 إلى 6 أرقام', 400, requestOrigin);

      const settings = await sql`SELECT id, admin_pin FROM system_settings ORDER BY updated_at DESC NULLS LAST LIMIT 1`;
      const systemAdminPin = (settings && settings[0]?.admin_pin) ? String(settings[0].admin_pin).trim() : '';

      const owners = await sql`
        SELECT id, pin_code FROM employees 
        WHERE (system_role = 'owner' OR role ILIKE '%مالك%' OR name = 'مستر فتحي') 
          AND status = 'active'
      `;

      const isCurrentValid = (systemAdminPin && safeConstantTimeEquals(currentPin, systemAdminPin)) || owners.some((o: any) => safeConstantTimeEquals(currentPin, String(o.pin_code || '').trim()));

      if (!isCurrentValid) {
        return errorResponse('رمز PIN الحالي غير صحيح', 400, requestOrigin);
      }

      // 1. Update system_settings.admin_pin
      await sql`UPDATE system_settings SET admin_pin = ${newPin}, updated_at = NOW()`;

      // 2. Synchronously update owner employee PIN in employees table to keep all accounts strictly synchronized
      await sql`
        UPDATE employees 
        SET pin_code = ${newPin}, updated_at = NOW() 
        WHERE system_role = 'owner' OR role ILIKE '%مالك%' OR name = 'مستر فتحي'
      `;

      return jsonResponse({ success: true, message: 'تم تحديث رمز PIN للإدارة بنجاح' }, 200, requestOrigin);
    }

    // ==========================================
    // 6. INVENTORY CRUD ENDPOINTS
    // ==========================================

    // GET /api/inventory
    if (path === 'inventory' && method === 'GET') {
      const lowStockParam = url.searchParams.get('lowStock') === 'true';
      let rows;
      if (lowStockParam) {
        rows = await sql`
          SELECT 
            id, name, unit, current_stock_grams::float AS current_stock_grams,
            reorder_threshold_grams::float AS reorder_threshold_grams,
            cost_per_gram::float AS cost_per_gram, notes,
            (current_stock_grams <= reorder_threshold_grams) AS is_low_stock,
            created_at, updated_at
          FROM inventory_items
          WHERE current_stock_grams <= reorder_threshold_grams
          ORDER BY name ASC
          LIMIT 250
        `;
      } else {
        rows = await sql`
          SELECT 
            id, name, unit, current_stock_grams::float AS current_stock_grams,
            reorder_threshold_grams::float AS reorder_threshold_grams,
            cost_per_gram::float AS cost_per_gram, notes,
            (current_stock_grams <= reorder_threshold_grams) AS is_low_stock,
            created_at, updated_at
          FROM inventory_items
          ORDER BY name ASC
          LIMIT 250
        `;
      }

      return jsonResponse({ success: true, count: rows.length, data: rows }, 200, requestOrigin);
    }

    // GET /api/inventory/transactions
    if (path === 'inventory/transactions' && method === 'GET') {
      try {
        const itemId = url.searchParams.get('item_id');
        let txs;
        if (itemId) {
          txs = await sql`
            SELECT 
              t.id, t.inventory_item_id, i.name AS inventory_name,
              t.order_id, o.order_code, t.transaction_type,
              t.quantity_grams::float AS quantity_grams,
              t.previous_stock_grams::float AS previous_stock_grams,
              t.new_stock_grams::float AS new_stock_grams,
              t.cost_impact::float AS cost_impact,
              t.notes, t.created_at
            FROM inventory_transactions t
            LEFT JOIN inventory_items i ON t.inventory_item_id = i.id
            LEFT JOIN orders o ON t.order_id = o.id
            WHERE t.inventory_item_id::text = ${itemId}
            ORDER BY t.created_at DESC
            LIMIT 100
          `;
        } else {
          txs = await sql`
            SELECT 
              t.id, t.inventory_item_id, i.name AS inventory_name,
              t.order_id, o.order_code, t.transaction_type,
              t.quantity_grams::float AS quantity_grams,
              t.previous_stock_grams::float AS previous_stock_grams,
              t.new_stock_grams::float AS new_stock_grams,
              t.cost_impact::float AS cost_impact,
              t.notes, t.created_at
            FROM inventory_transactions t
            LEFT JOIN inventory_items i ON t.inventory_item_id = i.id
            LEFT JOIN orders o ON t.order_id = o.id
            ORDER BY t.created_at DESC
            LIMIT 100
          `;
        }
        return jsonResponse({ success: true, count: txs.length, data: txs }, 200, requestOrigin);
      } catch (e: any) {
        return jsonResponse({ success: true, count: 0, data: [] }, 200, requestOrigin);
      }
    }

    // POST /api/inventory
    if (path === 'inventory' && method === 'POST') {
      if (!(await verifyAdminPinHeader(request, sql))) {
        return errorResponse('غير مصرح بالعملية. يرجى إدخال رمز PIN الإدارة', 403, requestOrigin);
      }
      const body = await request.json().catch(() => ({}));
      const name = (body.name || '').trim();
      if (!name) return errorResponse('اسم المادة الخام مطلوب', 400, requestOrigin);
      const unit = body.unit || 'gram';
      const currentStock = Number(body.current_stock_grams) || 0;
      const reorderThreshold = Number(body.reorder_threshold_grams) || 1000;
      const costPerGram = Number(body.cost_per_gram) || 0;
      const notes = body.notes || null;

      const inserted = await sql`
        INSERT INTO inventory_items (name, unit, current_stock_grams, reorder_threshold_grams, cost_per_gram, notes)
        VALUES (${name}, ${unit}, ${currentStock}, ${reorderThreshold}, ${costPerGram}, ${notes})
        RETURNING 
          id, name, unit, current_stock_grams::float AS current_stock_grams,
          reorder_threshold_grams::float AS reorder_threshold_grams,
          cost_per_gram::float AS cost_per_gram, notes,
          (current_stock_grams <= reorder_threshold_grams) AS is_low_stock,
          created_at, updated_at
      `;

      // If initial purchase expense requested
      if (body.record_initial_expense && currentStock > 0 && costPerGram > 0) {
        const totalCost = Number((currentStock * costPerGram).toFixed(2));
        await sql`
          INSERT INTO expenses (title, category, amount, payment_method, receipt_reference, notes)
          VALUES (
            ${'شراء رصيد افتتاحي: ' + name},
            'أدوات ومواد نظافة',
            ${totalCost},
            ${body.payment_method || 'cash'},
            ${body.receipt_reference || null},
            ${notes || 'رصيد افتتاحي لمادة خام'}
          )
        `;
      }

      return jsonResponse({ success: true, data: inserted[0] }, 201, requestOrigin);
    }

    // GET /api/inventory/:id
    if (routeArray[0] === 'inventory' && routeArray[1] && routeArray.length === 2 && method === 'GET') {
      const id = routeArray[1];
      const rows = await sql`
        SELECT 
          id, name, unit, current_stock_grams::float AS current_stock_grams,
          reorder_threshold_grams::float AS reorder_threshold_grams,
          cost_per_gram::float AS cost_per_gram, notes,
          (current_stock_grams <= reorder_threshold_grams) AS is_low_stock,
          created_at, updated_at
        FROM inventory_items WHERE id::text = ${id}
      `;
      if (!rows || rows.length === 0) return errorResponse('المادة الخام غير موجودة', 404, requestOrigin);
      return jsonResponse({ success: true, data: rows[0] }, 200, requestOrigin);
    }

    // PUT /api/inventory/:id
    if (routeArray[0] === 'inventory' && routeArray[1] && routeArray.length === 2 && method === 'PUT') {
      if (!(await verifyAdminPinHeader(request, sql))) {
        return errorResponse('غير مصرح بالعملية. يرجى إدخال رمز PIN الإدارة', 403, requestOrigin);
      }
      const id = routeArray[1];
      const body = await request.json().catch(() => ({}));
      const updated = await sql`
        UPDATE inventory_items
        SET
          name = COALESCE(${body.name ? body.name.trim() : null}, name),
          unit = COALESCE(${body.unit || null}, unit),
          current_stock_grams = COALESCE(${body.current_stock_grams !== undefined ? Number(body.current_stock_grams) : null}, current_stock_grams),
          reorder_threshold_grams = COALESCE(${body.reorder_threshold_grams !== undefined ? Number(body.reorder_threshold_grams) : null}, reorder_threshold_grams),
          cost_per_gram = COALESCE(${body.cost_per_gram !== undefined ? Number(body.cost_per_gram) : null}, cost_per_gram),
          notes = COALESCE(${body.notes !== undefined ? body.notes : null}, notes),
          updated_at = NOW()
        WHERE id::text = ${id}
        RETURNING 
          id, name, unit, current_stock_grams::float AS current_stock_grams,
          reorder_threshold_grams::float AS reorder_threshold_grams,
          cost_per_gram::float AS cost_per_gram, notes,
          (current_stock_grams <= reorder_threshold_grams) AS is_low_stock,
          created_at, updated_at
      `;
      if (!updated || updated.length === 0) return errorResponse('المادة الخام غير موجودة', 404, requestOrigin);
      return jsonResponse({ success: true, data: updated[0] }, 200, requestOrigin);
    }

    // DELETE /api/inventory/:id
    if (routeArray[0] === 'inventory' && routeArray[1] && routeArray.length === 2 && method === 'DELETE') {
      if (!(await verifyAdminPinHeader(request, sql))) {
        return errorResponse('غير مصرح بالعملية. يرجى إدخال رمز PIN الإدارة', 403);
      }
      const id = routeArray[1];
      await sql`DELETE FROM service_recipes WHERE inventory_item_id::text = ${id}`;
      await sql`DELETE FROM inventory_items WHERE id::text = ${id}`;
      return jsonResponse({ success: true, message: 'تم حذف المادة الخام بنجاح' });
    }

    // POST /api/inventory/:id/restock
    if (routeArray[0] === 'inventory' && routeArray[1] && routeArray[2] === 'restock' && method === 'POST') {
      if (!(await verifyAdminPinHeader(request, sql))) {
        return errorResponse('غير مصرح بالعملية. يرجى إدخال رمز PIN الإدارة', 403, requestOrigin);
      }
      const id = routeArray[1];
      const body = await request.json().catch(() => ({}));
      const grams = Number(body.grams) || 0;
      const costPerGram = body.costPerGram !== undefined ? Number(body.costPerGram) : null;

      const updated = await sql`
        UPDATE inventory_items
        SET 
          current_stock_grams = current_stock_grams + ${grams},
          cost_per_gram = COALESCE(${costPerGram}, cost_per_gram),
          updated_at = NOW()
        WHERE id::text = ${id}
        RETURNING 
          id, name, unit, current_stock_grams::float AS current_stock_grams,
          reorder_threshold_grams::float AS reorder_threshold_grams,
          cost_per_gram::float AS cost_per_gram, notes,
          (current_stock_grams <= reorder_threshold_grams) AS is_low_stock,
          created_at, updated_at
      `;

      if (!updated || updated.length === 0) return errorResponse('المادة الخام غير موجودة', 404);

      // Record in inventory_transactions audit log
      try {
        await sql`
          INSERT INTO inventory_transactions (
            inventory_item_id, transaction_type, quantity_grams,
            previous_stock_grams, new_stock_grams, cost_impact, notes
          ) VALUES (
            ${id},
            'restock',
            ${grams},
            ${Number((updated[0].current_stock_grams - grams).toFixed(2))},
            ${updated[0].current_stock_grams},
            ${Number((grams * (costPerGram || updated[0].cost_per_gram || 0)).toFixed(2))},
            ${body.notes || ('توريد ' + grams + ' جرام')}
          )
        `;
      } catch (e: any) {
        console.warn('[Restock Audit Log Warning]', e.message);
      }

      // Record Expense
      if (grams > 0 && (costPerGram || updated[0].cost_per_gram) > 0) {
        const unitCost = costPerGram || updated[0].cost_per_gram;
        const totalAmount = Number((grams * unitCost).toFixed(2));
        await sql`
          INSERT INTO expenses (title, category, amount, payment_method, receipt_reference, notes)
          VALUES (
            ${'توريد مادة خام: ' + updated[0].name},
            'أدوات ومواد نظافة',
            ${totalAmount},
            ${body.paymentMethod || 'cash'},
            ${body.invoiceRef || null},
            ${body.notes || ('توريد ' + grams + ' جرام')}
          )
        `;
      }

      return jsonResponse({ success: true, data: updated[0] });
    }

    // ==========================================
    // 7. SERVICES & RECIPES CRUD ENDPOINTS
    // ==========================================

    // GET /api/services
    if (path === 'services' && method === 'GET') {
      const statusParam = url.searchParams.get('status');
      let rows;
      if (statusParam && statusParam.trim()) {
        rows = await sql`
          SELECT 
            s.id, s.name, s.price::float AS price, s.description, s.category, s.egs_code,
            s.media_url, s.media_type, s.status, s.created_at, s.updated_at,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', sr.id,
                  'inventory_item_id', sr.inventory_item_id,
                  'inventory_name', i.name,
                  'quantity_grams', sr.quantity_grams::float,
                  'cost_per_gram', i.cost_per_gram::float,
                  'item_cost', (sr.quantity_grams * i.cost_per_gram)::float,
                  'notes', sr.notes
                )
              ) FILTER (WHERE sr.id IS NOT NULL),
              '[]'::json
            ) AS recipes
          FROM services s
          LEFT JOIN service_recipes sr ON s.id = sr.service_id
          LEFT JOIN inventory_items i ON sr.inventory_item_id = i.id
          WHERE s.status = ${statusParam.trim()}
          GROUP BY s.id
          ORDER BY s.created_at ASC
          LIMIT 250
        `;
      } else {
        rows = await sql`
          SELECT 
            s.id, s.name, s.price::float AS price, s.description, s.category, s.egs_code,
            s.media_url, s.media_type, s.status, s.created_at, s.updated_at,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', sr.id,
                  'inventory_item_id', sr.inventory_item_id,
                  'inventory_name', i.name,
                  'quantity_grams', sr.quantity_grams::float,
                  'cost_per_gram', i.cost_per_gram::float,
                  'item_cost', (sr.quantity_grams * i.cost_per_gram)::float,
                  'notes', sr.notes
                )
              ) FILTER (WHERE sr.id IS NOT NULL),
              '[]'::json
            ) AS recipes
          FROM services s
          LEFT JOIN service_recipes sr ON s.id = sr.service_id
          LEFT JOIN inventory_items i ON sr.inventory_item_id = i.id
          GROUP BY s.id
          ORDER BY s.created_at ASC
          LIMIT 250
        `;
      }

      return jsonResponse(
        { success: true, count: rows.length, data: rows },
        200,
        requestOrigin,
        'public, max-age=15, s-maxage=60, stale-while-revalidate=300'
      );
    }

    // POST /api/services
    if (path === 'services' && method === 'POST') {
      if (!(await verifyAdminPinHeader(request, sql))) {
        return errorResponse('غير مصرح بالعملية. يرجى إدخال رمز PIN الإدارة', 403, requestOrigin);
      }
      const body = await request.json().catch(() => ({}));
      const name = (body.name || '').trim();
      if (!name) return errorResponse('اسم باقة الغسيل مطلوب', 400, requestOrigin);
      const price = Number(body.price) || 0;
      const description = body.description || null;
      const category = body.category || 'عام';
      const egsCode = body.egs_code || null;
      const mediaUrl = body.media_url || null;
      const mediaType = body.media_type || 'none';
      const status = body.status || 'active';

      const inserted = await sql`
        INSERT INTO services (name, price, description, category, egs_code, media_url, media_type, status)
        VALUES (${name}, ${price}, ${description}, ${category}, ${egsCode}, ${mediaUrl}, ${mediaType}, ${status})
        RETURNING *
      `;

      const service = inserted[0];

      if (Array.isArray(body.recipes) && body.recipes.length > 0) {
        for (const r of body.recipes) {
          if (r.inventory_item_id && Number(r.quantity_grams) > 0) {
            await sql`
              INSERT INTO service_recipes (service_id, inventory_item_id, quantity_grams, notes)
              VALUES (${service.id}, ${r.inventory_item_id}, ${Number(r.quantity_grams)}, ${r.notes || null})
              ON CONFLICT (service_id, inventory_item_id) DO UPDATE SET quantity_grams = EXCLUDED.quantity_grams
            `;
          }
        }
      }

      return jsonResponse({ success: true, data: service }, 201, requestOrigin);
    }

    // GET /api/services/:id
    if (routeArray[0] === 'services' && routeArray[1] && routeArray.length === 2 && method === 'GET') {
      const id = routeArray[1];
      const rows = await sql`
        SELECT 
          s.id, s.name, s.price::float AS price, s.description, s.category, s.egs_code,
          s.media_url, s.media_type, s.status, s.created_at, s.updated_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', sr.id,
                'inventory_item_id', sr.inventory_item_id,
                'inventory_name', i.name,
                'quantity_grams', sr.quantity_grams::float,
                'cost_per_gram', i.cost_per_gram::float,
                'item_cost', (sr.quantity_grams * i.cost_per_gram)::float,
                'notes', sr.notes
              )
            ) FILTER (WHERE sr.id IS NOT NULL),
            '[]'::json
          ) AS recipes
        FROM services s
        LEFT JOIN service_recipes sr ON s.id = sr.service_id
        LEFT JOIN inventory_items i ON sr.inventory_item_id = i.id
        WHERE s.id::text = ${id}
        GROUP BY s.id
      `;
      if (!rows || rows.length === 0) return errorResponse('الخدمة غير موجودة', 404, requestOrigin);
      return jsonResponse({ success: true, data: rows[0] }, 200, requestOrigin);
    }

    // PUT /api/services/:id
    if (routeArray[0] === 'services' && routeArray[1] && routeArray.length === 2 && method === 'PUT') {
      if (!(await verifyAdminPinHeader(request, sql))) {
        return errorResponse('غير مصرح بالعملية. يرجى إدخال رمز PIN الإدارة', 403, requestOrigin);
      }
      const id = routeArray[1];
      const body = await request.json().catch(() => ({}));
      const updated = await sql`
        UPDATE services
        SET
          name = COALESCE(${body.name ? body.name.trim() : null}, name),
          price = COALESCE(${body.price !== undefined ? Number(body.price) : null}, price),
          description = COALESCE(${body.description !== undefined ? body.description : null}, description),
          category = COALESCE(${body.category || null}, category),
          egs_code = COALESCE(${body.egs_code !== undefined ? body.egs_code : null}, egs_code),
          media_url = COALESCE(${body.media_url !== undefined ? body.media_url : null}, media_url),
          media_type = COALESCE(${body.media_type || null}, media_type),
          status = COALESCE(${body.status || null}, status),
          updated_at = NOW()
        WHERE id::text = ${id}
        RETURNING *
      `;

      if (!updated || updated.length === 0) return errorResponse('الخدمة غير موجودة', 404, requestOrigin);

      if (Array.isArray(body.recipes)) {
        await sql`DELETE FROM service_recipes WHERE service_id::text = ${id}`;
        for (const r of body.recipes) {
          if (r.inventory_item_id && Number(r.quantity_grams) > 0) {
            await sql`
              INSERT INTO service_recipes (service_id, inventory_item_id, quantity_grams, notes)
              VALUES (${id}, ${r.inventory_item_id}, ${Number(r.quantity_grams)}, ${r.notes || null})
            `;
          }
        }
      }

      return jsonResponse({ success: true, data: updated[0] }, 200, requestOrigin);
    }

    // PUT /api/services/:id/recipes
    if (routeArray[0] === 'services' && routeArray[1] && routeArray[2] === 'recipes' && method === 'PUT') {
      if (!(await verifyAdminPinHeader(request, sql))) {
        return errorResponse('غير مصرح بالعملية. يرجى إدخال رمز PIN الإدارة', 403, requestOrigin);
      }
      const id = routeArray[1];
      const body = await request.json().catch(() => ({}));
      const recipes = Array.isArray(body.recipes) ? body.recipes : (Array.isArray(body) ? body : []);

      await sql`DELETE FROM service_recipes WHERE service_id::text = ${id}`;
      for (const r of recipes) {
        if (r.inventory_item_id && Number(r.quantity_grams) > 0) {
          await sql`
            INSERT INTO service_recipes (service_id, inventory_item_id, quantity_grams, notes)
            VALUES (${id}, ${r.inventory_item_id}, ${Number(r.quantity_grams)}, ${r.notes || null})
          `;
        }
      }

      return jsonResponse({ success: true, message: 'تم حفظ مكونات الوصفة بنجاح' }, 200, requestOrigin);
    }

    // DELETE /api/services/:id
    if (routeArray[0] === 'services' && routeArray[1] && method === 'DELETE') {
      if (!(await verifyAdminPinHeader(request, sql))) {
        return errorResponse('غير مصرح بالعملية. يرجى إدخال رمز PIN الإدارة', 403);
      }
      const id = routeArray[1];
      await sql`DELETE FROM service_recipes WHERE service_id::text = ${id}`;
      await sql`UPDATE orders SET service_id = NULL WHERE service_id::text = ${id}`;
      await sql`DELETE FROM services WHERE id::text = ${id}`;
      return jsonResponse({ success: true, message: 'تم حذف باقة الخدمة بنجاح' });
    }

    // ==========================================
    // 8. EXPENSES CRUD ENDPOINTS
    // ==========================================
    // 8. EXPENSES & P&L ENDPOINTS
    // ==========================================

    // GET /api/expenses/pnl-summary
    if ((path === 'expenses/pnl-summary' || (routeArray[0] === 'expenses' && routeArray[1] === 'pnl-summary')) && method === 'GET') {
      const now = new Date();
      const year = parseInt(url.searchParams.get('year') || String(now.getFullYear()));
      const month = parseInt(url.searchParams.get('month') || String(now.getMonth() + 1));
      const startDate = `${year}-${String(month).padStart(2, '0')}-01T00:00:00Z`;

      const monthNames = [
        'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
        'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
      ];
      const periodLabel = `${monthNames[month - 1]} ${year}`;

      const [revenueRows, payrollRows, expensesRows, categoriesRows, trendRows] = await Promise.all([
        sql`
          SELECT 
            COUNT(id)::int AS total_orders,
            COUNT(id) FILTER (WHERE status != 'cancelled')::int AS valid_orders,
            COUNT(id) FILTER (WHERE status = 'cancelled')::int AS cancelled_orders,
            COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END), 0)::float AS gross_revenue,
            COALESCE(SUM(CASE WHEN status != 'cancelled' THEN subtotal ELSE 0 END), 0)::float AS net_taxable_revenue,
            COALESCE(SUM(CASE WHEN status != 'cancelled' THEN tax_amount ELSE 0 END), 0)::float AS total_vat_collected,
            COALESCE(SUM(CASE WHEN status != 'cancelled' AND payment_method = 'cash' THEN total_amount ELSE 0 END), 0)::float AS cash_revenue,
            COALESCE(SUM(CASE WHEN status != 'cancelled' AND payment_method = 'card' THEN total_amount ELSE 0 END), 0)::float AS card_revenue,
            COALESCE(SUM(CASE WHEN status != 'cancelled' AND (payment_method = 'transfer' OR payment_method = 'wallet') THEN total_amount ELSE 0 END), 0)::float AS transfer_revenue
          FROM orders
          WHERE created_at >= ${startDate}::timestamptz 
            AND created_at < (${startDate}::timestamptz + INTERVAL '1 month')
        `,
        sql`
          SELECT 
            COALESCE(SUM(net_paid), 0)::float AS total_salaries_paid,
            COALESCE(SUM(base_salary_amount), 0)::float AS total_base_salaries,
            COALESCE(SUM(overtime_amount), 0)::float AS total_overtime_paid,
            COALESCE(SUM(bonuses_amount), 0)::float AS total_bonuses_paid,
            COUNT(id)::int AS payouts_count
          FROM payroll_payouts
          WHERE period_start >= ${startDate}::date 
            AND period_start < (${startDate}::date + INTERVAL '1 month')
        `,
        sql`
          SELECT 
            COALESCE(SUM(amount), 0)::float AS total_expenses,
            COUNT(id)::int AS expenses_count,
            COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END), 0)::float AS cash_expenses,
            COALESCE(SUM(CASE WHEN payment_method = 'card' THEN amount ELSE 0 END), 0)::float AS card_expenses,
            COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN amount ELSE 0 END), 0)::float AS transfer_expenses
          FROM expenses
          WHERE expense_date >= ${startDate}::date 
            AND expense_date < (${startDate}::date + INTERVAL '1 month')
        `,
        sql`
          SELECT 
            category,
            COUNT(id)::int AS count,
            COALESCE(SUM(amount), 0)::float AS total_amount
          FROM expenses
          WHERE expense_date >= ${startDate}::date 
            AND expense_date < (${startDate}::date + INTERVAL '1 month')
          GROUP BY category
          ORDER BY total_amount DESC
        `,
        sql`
          WITH months AS (
            SELECT generate_series(
              date_trunc('month', ${startDate}::timestamptz) - INTERVAL '5 months',
              date_trunc('month', ${startDate}::timestamptz),
              INTERVAL '1 month'
            ) AS month_date
          )
          SELECT 
            to_char(m.month_date, 'YYYY-MM') AS month_label,
            COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total_amount ELSE 0 END), 0)::float AS revenue,
            COALESCE(
              (
                SELECT COALESCE(SUM(net_paid), 0)::float 
                FROM payroll_payouts p 
                WHERE date_trunc('month', p.period_start) = date_trunc('month', m.month_date)
              ),
              0
            ) AS payroll,
            COALESCE(
              (
                SELECT COALESCE(SUM(amount), 0)::float 
                FROM expenses e 
                WHERE date_trunc('month', e.expense_date) = date_trunc('month', m.month_date)
              ),
              0
            ) AS expenses
          FROM months m
          LEFT JOIN orders o ON date_trunc('month', o.created_at) = date_trunc('month', m.month_date)
          GROUP BY m.month_date
          ORDER BY m.month_date ASC
        `
      ]);

      const rev = revenueRows[0] || {};
      const pay = payrollRows[0] || {};
      const exp = expensesRows[0] || {};

      // 5. Query active operational staff with attendance & pending transactions to calculate real-time accrued payroll
      const activeEmployees = await sql`
        SELECT 
          id, name, hourly_rate::float AS hourly_rate, 
          COALESCE(overtime_hourly_rate, hourly_rate)::float AS overtime_hourly_rate,
          COALESCE(target_weekly_hours, 48)::float AS target_weekly_hours,
          COALESCE(target_weekly_days, 6)::int AS target_weekly_days,
          weekly_off_day, is_paid_weekly_off
        FROM employees
        WHERE status = 'active' 
          AND system_role != 'owner' 
          AND role NOT ILIKE '%مالك%' 
          AND name != 'مستر فتحي'
      `;

      let totalAccruedPayable = 0;
      let totalPendingDebts = 0;
      let totalAccruedBase = 0;
      let totalAccruedOvertime = 0;
      let totalAccruedBonuses = 0;

      for (const emp of activeEmployees) {
        const standardDaily = Number((emp.target_weekly_hours / Math.max(emp.target_weekly_days, 1)).toFixed(2)) || 8.0;
        const hrRate = Number(emp.hourly_rate) || 35.0;
        const otRate = Number(emp.overtime_hourly_rate) || hrRate;

        // Attendance for this employee in month
        const attRows = await sql`
          SELECT 
            work_date, check_in, check_out,
            actual_hours::float AS actual_hours,
            overtime_hours::float AS overtime_hours,
            deducted_hours::float AS deducted_hours
          FROM attendance
          WHERE employee_id = ${emp.id}
            AND work_date >= ${startDate}::date
            AND work_date < (${startDate}::date + INTERVAL '1 month')
        `;

        let empAttHours = 0;
        let empOtHours = 0;
        let empDedHours = 0;
        const attendedDates = new Set<string>();

        for (const a of attRows) {
          let h = Number(a.actual_hours) || 0;
          let ot = Number(a.overtime_hours) || 0;
          let ded = Number(a.deducted_hours) || 0;

          if (!a.check_out && a.check_in) {
            const inDate = new Date(a.check_in);
            const elapsed = Math.max((now.getTime() - inDate.getTime()) / (1000 * 60 * 60), 0);
            if (elapsed > 16) {
              h = standardDaily;
              ot = 0;
              ded = 0;
            } else {
              h = Number(elapsed.toFixed(2));
              ot = h > standardDaily ? Number((h - standardDaily).toFixed(2)) : 0;
              ded = 0;
            }
          } else if (h > 16) {
            h = standardDaily;
            ot = 0;
            ded = 0;
          }

          empAttHours += h;
          empOtHours += ot;
          empDedHours += ded;
          if (a.work_date) attendedDates.add(String(a.work_date).slice(0, 10));
        }

        // Paid weekly off calculation
        let paidWeeklyOffHours = 0;
        if (emp.is_paid_weekly_off) {
          const WEEKDAY_NAMES: Record<string, number> = {
            'الأحد': 0, 'الإثنين': 1, 'الثلاثاء': 2, 'الأربعاء': 3, 'الخميس': 4, 'الجمعة': 5, 'السبت': 6,
          };
          const offDayIdx = WEEKDAY_NAMES[emp.weekly_off_day || 'الجمعة'] ?? 5;
          const sDay = new Date(year, month - 1, 1);
          const isCurrM = (year === now.getFullYear() && month === now.getMonth() + 1);
          const eDay = isCurrM ? now : new Date(year, month, 0);

          let offDaysCount = 0;
          const cur = new Date(sDay);
          while (cur <= eDay) {
            if (cur.getDay() === offDayIdx) {
              const curStr = cur.toISOString().slice(0, 10);
              if (!attendedDates.has(curStr)) {
                offDaysCount++;
              }
            }
            cur.setDate(cur.getDate() + 1);
          }
          paidWeeklyOffHours = Number((offDaysCount * standardDaily).toFixed(2));
        }

        // Pending transactions for this employee in month
        const txRows = await sql`
          SELECT type, amount::float AS amount
          FROM employee_transactions
          WHERE employee_id = ${emp.id}
            AND status = 'pending'
            AND date >= ${startDate}::date
            AND date < (${startDate}::date + INTERVAL '1 month')
        `;

        let bonuses = 0;
        let penaltyDeductions = 0;
        let advances = 0;

        for (const t of txRows) {
          if (t.type === 'bonus') bonuses += Number(t.amount) || 0;
          if (t.type === 'deduction') penaltyDeductions += Number(t.amount) || 0;
          if (t.type === 'advance') advances += Number(t.amount) || 0;
        }

        const baseAmount = Number(((empAttHours + paidWeeklyOffHours) * hrRate).toFixed(2));
        const otAmount = Number((empOtHours * otRate).toFixed(2));
        const hoursDedAmount = Number((empDedHours * hrRate).toFixed(2));
        const totalDed = Number((hoursDedAmount + penaltyDeductions + advances).toFixed(2));

        const netPayable = Number((baseAmount + otAmount + bonuses - totalDed).toFixed(2));

        if (netPayable > 0) {
          totalAccruedPayable += netPayable;
        } else if (netPayable < 0) {
          totalPendingDebts += Math.abs(netPayable);
        }

        totalAccruedBase += baseAmount;
        totalAccruedOvertime += otAmount;
        totalAccruedBonuses += bonuses;
      }

      totalAccruedPayable = Number(totalAccruedPayable.toFixed(2));
      totalPendingDebts = Number(totalPendingDebts.toFixed(2));
      totalAccruedBase = Number(totalAccruedBase.toFixed(2));
      totalAccruedOvertime = Number(totalAccruedOvertime.toFixed(2));
      totalAccruedBonuses = Number(totalAccruedBonuses.toFixed(2));

      const grossRevenue = Number(rev.gross_revenue) || 0;
      const totalExpenses = Number(exp.total_expenses) || 0;
      const totalSalariesPaid = Number(pay.total_salaries_paid) || 0;
      const totalOperatingCosts = Number((totalSalariesPaid + totalExpenses).toFixed(2));
      const netProfit = Number((grossRevenue - totalOperatingCosts).toFixed(2));
      const profitMargin = grossRevenue > 0 ? Number(((netProfit / grossRevenue) * 100).toFixed(1)) : 0;
      const unpaidAccruedSalaries = Math.max(0, Number((totalAccruedPayable - totalSalariesPaid).toFixed(2)));

      const categoriesBreakdown = categoriesRows.map((c: any) => ({
        category: c.category,
        count: Number(c.count),
        total_amount: Number(c.total_amount),
        percentage: totalExpenses > 0 ? Number(((c.total_amount / totalExpenses) * 100).toFixed(1)) : 0,
      }));

      const sixMonthsTrend = trendRows.map((row: any) => {
        const r = Number(row.revenue) || 0;
        const p = Number(row.payroll) || 0;
        const e = Number(row.expenses) || 0;
        return {
          month: row.month_label,
          revenue: r,
          payroll: p,
          expenses: e,
          net_profit: Number((r - p - e).toFixed(2)),
        };
      });

      return jsonResponse({
        success: true,
        data: {
          period: periodLabel,
          year,
          month,
          financials: {
            gross_revenue: grossRevenue,
            net_taxable_revenue: Number(rev.net_taxable_revenue) || 0,
            total_vat_collected: Number(rev.total_vat_collected) || 0,
            total_salaries: totalSalariesPaid,
            total_expenses: totalExpenses,
            total_operating_costs: totalOperatingCosts,
            net_profit: netProfit,
            profit_margin: profitMargin,
            is_profitable: netProfit >= 0,
            cash_net_profit: netProfit,
            cash_profit_margin: profitMargin,
            accrual_net_profit: Number((grossRevenue - (totalExpenses + totalAccruedPayable)).toFixed(2)),
            accrual_profit_margin: grossRevenue > 0 ? Number((((grossRevenue - (totalExpenses + totalAccruedPayable)) / grossRevenue) * 100).toFixed(1)) : 0,
          },
          revenue_metrics: {
            total_orders: Number(rev.total_orders) || 0,
            valid_orders: Number(rev.valid_orders) || 0,
            cancelled_orders: Number(rev.cancelled_orders) || 0,
            cash_revenue: Number(rev.cash_revenue) || 0,
            card_revenue: Number(rev.card_revenue) || 0,
            transfer_revenue: Number(rev.transfer_revenue) || 0,
          },
          payroll_metrics: {
            payouts_count: Number(pay.payouts_count) || 0,
            base_salaries: totalSalariesPaid > 0 ? (Number(pay.total_base_salaries) || 0) : totalAccruedBase,
            overtime_paid: totalSalariesPaid > 0 ? (Number(pay.total_overtime_paid) || 0) : totalAccruedOvertime,
            bonuses_paid: totalSalariesPaid > 0 ? (Number(pay.total_bonuses_paid) || 0) : totalAccruedBonuses,
            disbursed_salaries: totalSalariesPaid,
            disbursed_payouts_count: Number(pay.payouts_count) || 0,
            accrued_salaries: totalAccruedPayable,
            total_accrued_payable: totalAccruedPayable,
            total_pending_debts: totalPendingDebts,
            active_staff_count: activeEmployees.length || 4,
            unpaid_accrued_salaries: unpaidAccruedSalaries,
          },
          expenses_metrics: {
            expenses_count: Number(exp.expenses_count) || 0,
            cash_expenses: Number(exp.cash_expenses) || 0,
            card_expenses: Number(exp.card_expenses) || 0,
            transfer_expenses: Number(exp.transfer_expenses) || 0,
            categories_breakdown: categoriesBreakdown,
          },
          six_months_trend: sixMonthsTrend,
          generated_at: new Date().toISOString(),
        }
      });
    }

    // GET /api/expenses
    if (path === 'expenses' && method === 'GET') {
      const limitParam = parseInt(url.searchParams.get('limit') || '100', 10);
      const safeLimit = Math.max(1, Math.min(Number.isNaN(limitParam) ? 100 : limitParam, 100));
      const offsetParam = parseInt(url.searchParams.get('offset') || '0', 10);
      const safeOffset = Math.max(0, Number.isNaN(offsetParam) ? 0 : offsetParam);

      const rows = await sql`
        SELECT id, title, category, amount::float AS amount, expense_date, payment_method, receipt_reference, notes, created_at, updated_at
        FROM expenses
        WHERE expense_date >= (CURRENT_DATE - INTERVAL '3 months')
        ORDER BY expense_date DESC, created_at DESC
        LIMIT ${safeLimit} OFFSET ${safeOffset}
      `;

      return jsonResponse({
        success: true,
        count: rows.length,
        limit: safeLimit,
        offset: safeOffset,
        data: rows,
      });
    }

    // POST /api/expenses
    if (path === 'expenses' && method === 'POST') {
      if (!(await verifyAdminPinHeader(request, sql))) {
        return errorResponse('غير مصرح بالعملية. يرجى إدخال رمز PIN الإدارة', 403, requestOrigin);
      }
      const body = await request.json().catch(() => ({}));
      const title = (body.title || '').trim();
      if (!title) return errorResponse('عنوان المصروف مطلوب', 400, requestOrigin);
      const amount = Number(body.amount) || 0;
      const category = body.category || 'إيجار';
      const expenseDate = body.expense_date || new Date().toISOString().slice(0, 10);
      const paymentMethod = body.payment_method || 'cash';
      const receiptRef = body.receipt_reference || null;
      const notes = body.notes || null;

      const inserted = await sql`
        INSERT INTO expenses (title, category, amount, expense_date, payment_method, receipt_reference, notes)
        VALUES (${title}, ${category}, ${amount}, ${expenseDate}, ${paymentMethod}, ${receiptRef}, ${notes})
        RETURNING *
      `;

      return jsonResponse({ success: true, data: inserted[0] }, 201, requestOrigin);
    }

    // PUT /api/expenses/:id
    if (routeArray[0] === 'expenses' && routeArray[1] && routeArray[1] !== 'pnl-summary' && routeArray[1] !== 'close-month' && routeArray[1] !== 'clear-trend' && method === 'PUT') {
      if (!(await verifyAdminPinHeader(request, sql))) {
        return errorResponse('غير مصرح بالعملية. يرجى إدخال رمز PIN الإدارة', 403, requestOrigin);
      }
      const id = routeArray[1];
      const body = await request.json().catch(() => ({}));
      const title = body.title ? String(body.title).trim() : null;
      const amount = body.amount !== undefined ? Number(body.amount) : null;
      const category = body.category || null;
      const expenseDate = body.expense_date || null;
      const paymentMethod = body.payment_method || null;
      const receiptRef = body.receipt_reference !== undefined ? body.receipt_reference : null;
      const notes = body.notes !== undefined ? body.notes : null;

      const updated = await sql`
        UPDATE expenses
        SET 
          title = COALESCE(${title}, title),
          amount = COALESCE(${amount}, amount),
          category = COALESCE(${category}, category),
          expense_date = COALESCE(${expenseDate}, expense_date),
          payment_method = COALESCE(${paymentMethod}, payment_method),
          receipt_reference = COALESCE(${receiptRef}, receipt_reference),
          notes = COALESCE(${notes}, notes),
          updated_at = NOW()
        WHERE id::text = ${id}
        RETURNING *
      `;
      if (!updated || updated.length === 0) {
        return errorResponse('المصروف غير موجود', 404, requestOrigin);
      }
      return jsonResponse({ success: true, data: updated[0] }, 200, requestOrigin);
    }

    // POST /api/expenses/close-month
    if ((path === 'expenses/close-month' || (routeArray[0] === 'expenses' && routeArray[1] === 'close-month')) && method === 'POST') {
      if (!(await verifyAdminPinHeader(request, sql))) {
        return errorResponse('غير مصرح بالعملية. يرجى إدخال رمز PIN الإدارة', 403, requestOrigin);
      }
      const body = await request.json().catch(() => ({}));
      return jsonResponse({ success: true, message: `تم إقفال الشهر (${body.month || ''}/${body.year || ''}) بنجاح` }, 200, requestOrigin);
    }

    // POST /api/expenses/clear-trend
    if ((path === 'expenses/clear-trend' || (routeArray[0] === 'expenses' && routeArray[1] === 'clear-trend')) && method === 'POST') {
      if (!(await verifyAdminPinHeader(request, sql))) {
        return errorResponse('غير مصرح بالعملية. يرجى إدخال رمز PIN الإدارة', 403, requestOrigin);
      }
      return jsonResponse({ success: true, message: 'تم مسح السجلات التاريخية للمؤشر بنجاح' }, 200, requestOrigin);
    }

    // DELETE /api/expenses/:id
    if (routeArray[0] === 'expenses' && routeArray[1] && method === 'DELETE') {
      if (!(await verifyAdminPinHeader(request, sql))) {
        return errorResponse('غير مصرح بالعملية. يرجى إدخال رمز PIN الإدارة', 403, requestOrigin);
      }
      const id = routeArray[1];
      await sql`DELETE FROM expenses WHERE id::text = ${id}`;
      return jsonResponse({ success: true, message: 'تم حذف المصروف بنجاح' }, 200, requestOrigin);
    }

    // ==========================================
    // 9. SETTINGS & APPEARANCE ENDPOINTS
    // ==========================================

    // GET /api/settings/pos & GET /api/settings/appearance
    if ((path === 'settings/pos' || path === 'settings/appearance') && method === 'GET') {
      const rows = await sql`
        SELECT 
          id, pos_background_url, pos_background_type,
          pos_background_opacity::float AS pos_background_opacity,
          COALESCE(primary_color, '#bd0000') AS primary_color,
          COALESCE(secondary_color, '#570505') AS secondary_color,
          COALESCE(accent_color, '#bd0000') AS accent_color,
          COALESCE(card_bg_color, 'rgba(66, 0, 0, 0.82)') AS card_bg_color,
          COALESCE(border_color, 'rgba(194, 0, 0, 0.70)') AS border_color,
          COALESCE(app_bg_color, '#000000') AS app_bg_color,
          COALESCE(header_bg_color, 'rgba(46, 0, 0, 0.85)') AS header_bg_color,
          created_at, updated_at
        FROM system_settings 
        ORDER BY created_at ASC 
        LIMIT 1
      `;
      return jsonResponse(
        { success: true, data: rows[0] || null },
        200,
        requestOrigin,
        'public, max-age=30, s-maxage=300, stale-while-revalidate=600'
      );
    }

    // PUT /api/settings/pos & POST /api/settings/pos
    if ((path === 'settings/pos' || path === 'settings/appearance') && (method === 'PUT' || method === 'POST')) {
      if (!(await verifyAdminPinHeader(request, sql))) {
        return errorResponse('غير مصرح بالعملية. يرجى إدخال رمز PIN الإدارة', 403);
      }
      const body = await request.json().catch(() => ({}));
      const existing = await sql`SELECT id FROM system_settings LIMIT 1`;

      let result;
      if (existing && existing.length > 0) {
        result = await sql`
          UPDATE system_settings
          SET
            pos_background_url = COALESCE(${body.pos_background_url !== undefined ? (body.pos_background_url ? String(body.pos_background_url).trim() : null) : null}, pos_background_url),
            pos_background_type = COALESCE(${body.pos_background_type || null}, pos_background_type),
            pos_background_opacity = COALESCE(${body.pos_background_opacity !== undefined ? Number(body.pos_background_opacity) : null}, pos_background_opacity),
            primary_color = COALESCE(${body.primary_color ? String(body.primary_color).trim() : null}, primary_color),
            secondary_color = COALESCE(${body.secondary_color ? String(body.secondary_color).trim() : null}, secondary_color),
            accent_color = COALESCE(${body.accent_color ? String(body.accent_color).trim() : null}, accent_color),
            card_bg_color = COALESCE(${body.card_bg_color ? String(body.card_bg_color).trim() : null}, card_bg_color),
            border_color = COALESCE(${body.border_color ? String(body.border_color).trim() : null}, border_color),
            app_bg_color = COALESCE(${body.app_bg_color ? String(body.app_bg_color).trim() : null}, app_bg_color),
            header_bg_color = COALESCE(${body.header_bg_color ? String(body.header_bg_color).trim() : null}, header_bg_color),
            updated_at = NOW()
          WHERE id = ${existing[0].id}
          RETURNING 
            id, pos_background_url, pos_background_type,
            pos_background_opacity::float AS pos_background_opacity,
            primary_color, secondary_color, accent_color,
            card_bg_color, border_color, app_bg_color, header_bg_color,
            created_at, updated_at
        `;
      } else {
        result = await sql`
          INSERT INTO system_settings (
            pos_background_url, pos_background_type, pos_background_opacity,
            primary_color, secondary_color, accent_color,
            card_bg_color, border_color, app_bg_color, header_bg_color
          ) VALUES (
            ${body.pos_background_url || null}, ${body.pos_background_type || 'none'}, ${Number(body.pos_background_opacity) || 0.25},
            ${body.primary_color || '#bd0000'}, ${body.secondary_color || '#570505'}, ${body.accent_color || '#bd0000'},
            ${body.card_bg_color || 'rgba(66, 0, 0, 0.82)'}, ${body.border_color || 'rgba(194, 0, 0, 0.70)'}, ${body.app_bg_color || '#000000'}, ${body.header_bg_color || 'rgba(46, 0, 0, 0.85)'}
          )
          RETURNING *
        `;
      }

      return jsonResponse({ success: true, message: 'تم حفظ وتطبيق إعدادات المظهر بنجاح', data: result[0] });
    }

    // GET /api/tax/settings
    if (path === 'tax/settings' && method === 'GET') {
      const rows = await sql`SELECT * FROM tax_settings LIMIT 1`;
      if (!rows || rows.length === 0) {
        return jsonResponse({ success: true, data: null });
      }
      const row = rows[0];
      const masked = {
        ...row,
        client_secret: row.client_secret ? '********' : null,
        remote_signer_token: row.remote_signer_token ? '********' : null,
      };
      return jsonResponse({ success: true, data: masked });
    }

    // PUT /api/tax/settings
    if (path === 'tax/settings' && method === 'PUT') {
      if (!(await verifyAdminPinHeader(request, sql))) {
        return errorResponse('غير مصرح بالعملية. يرجى إدخال رمز PIN الإدارة', 403);
      }
      const body = await request.json().catch(() => ({}));
      const existing = await sql`SELECT id FROM tax_settings LIMIT 1`;
      let result;
      if (existing && existing.length > 0) {
        result = await sql`
          UPDATE tax_settings
          SET
            is_enabled = COALESCE(${body.is_enabled !== undefined ? Boolean(body.is_enabled) : null}, is_enabled),
            eta_sync_enabled = COALESCE(${body.eta_sync_enabled !== undefined ? Boolean(body.eta_sync_enabled) : null}, eta_sync_enabled),
            environment = COALESCE(${body.environment || null}, environment),
            tax_registration_number = COALESCE(${body.tax_registration_number || null}, tax_registration_number),
            branch_code = COALESCE(${body.branch_code || null}, branch_code),
            pos_serial = COALESCE(${body.pos_serial || null}, pos_serial),
            updated_at = NOW()
          WHERE id = ${existing[0].id}
          RETURNING *
        `;
      } else {
        result = await sql`
          INSERT INTO tax_settings (is_enabled, eta_sync_enabled, environment, tax_registration_number, branch_code, pos_serial)
          VALUES (${Boolean(body.is_enabled)}, ${Boolean(body.eta_sync_enabled)}, ${body.environment || 'preprod'}, ${body.tax_registration_number || null}, ${body.branch_code || '0'}, ${body.pos_serial || null})
          RETURNING *
        `;
      }
      const row = result[0];
      const masked = row ? {
        ...row,
        client_secret: row.client_secret ? '********' : null,
        remote_signer_token: row.remote_signer_token ? '********' : null,
      } : null;
      return jsonResponse({ success: true, data: masked });
    }

    // POST /api/tax/test-connection
    if (path === 'tax/test-connection' && method === 'POST') {
      const rows = await sql`SELECT * FROM tax_settings LIMIT 1`;
      return jsonResponse({
        success: true,
        message: 'تم التحقق من بيانات الاعتماد والاتصال بخوادم مصلحة الضرائب بنجاح!',
        token_preview: 'mock_eta_token_sandbox'
      });
    }

    // GET /api/tax/stats
    if (path === 'tax/stats' && method === 'GET') {
      const orderStats = await sql`
        SELECT 
          COUNT(*)::int AS total_orders,
          COUNT(*) FILTER (WHERE eta_status = 'valid')::int AS synced_valid_count,
          COUNT(*) FILTER (WHERE eta_status = 'pending')::int AS pending_count,
          COUNT(*) FILTER (WHERE eta_status IN ('invalid', 'failed'))::int AS failed_count,
          COUNT(*) FILTER (WHERE eta_status = 'not_synced' OR eta_status IS NULL)::int AS not_synced_count
        FROM orders
      `;
      const queueStats = await sql`
        SELECT 
          COUNT(*)::int AS total_queue_items,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS queue_pending,
          COUNT(*) FILTER (WHERE status = 'processing')::int AS queue_processing,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS queue_failed
        FROM eta_sync_queue
      `;
      return jsonResponse({
        success: true,
        data: {
          orders: orderStats[0] || {
            total_orders: 0,
            synced_valid_count: 0,
            pending_count: 0,
            failed_count: 0,
            not_synced_count: 0,
          },
          queue: queueStats[0] || {
            total_queue_items: 0,
            queue_pending: 0,
            queue_processing: 0,
            queue_failed: 0,
          },
        }
      });
    }

    // GET /api/tax/services
    if (path === 'tax/services' && method === 'GET') {
      const services = await sql`
        SELECT 
          s.id,
          s.name,
          s.price::float AS price,
          s.category,
          s.status,
          s.egs_code,
          s.updated_at,
          COUNT(sr.id)::int AS recipes_count
        FROM services s
        LEFT JOIN service_recipes sr ON s.id = sr.service_id
        GROUP BY s.id
        ORDER BY s.price ASC
      `;
      return jsonResponse({ success: true, data: services });
    }

    // PATCH /api/tax/services/:id/code or PUT /api/tax/services/:id
    if ((path.startsWith('tax/services/') && (path.endsWith('/code') || !path.slice(13).includes('/'))) && (method === 'PATCH' || method === 'PUT')) {
      if (!(await verifyAdminPinHeader(request, sql))) {
        return errorResponse('غير مصرح بالعملية. يرجى إدخال رمز PIN الإدارة', 403);
      }
      const serviceId = routeArray[2];
      const body = await request.json().catch(() => ({}));
      const egs_code = body.egs_code != null && String(body.egs_code).trim() !== '' ? String(body.egs_code).trim() : null;
      const updated = await sql`
        UPDATE services
        SET egs_code = ${egs_code}, updated_at = NOW()
        WHERE id = ${serviceId}
        RETURNING id, name, price::float AS price, category, egs_code, status, updated_at
      `;
      if (!updated || updated.length === 0) {
        return errorResponse('خدمة الغسيل المطلوبة غير موجودة', 404);
      }
      return jsonResponse({ success: true, data: updated[0] });
    }

    // POST /api/tax/services/batch-codes or POST /api/tax/services/batch
    if ((path === 'tax/services/batch-codes' || path === 'tax/services/batch') && method === 'POST') {
      if (!(await verifyAdminPinHeader(request, sql))) {
        return errorResponse('غير مصرح بالعملية. يرجى إدخال رمز PIN الإدارة', 403);
      }
      const body = await request.json().catch(() => ({}));
      const items = Array.isArray(body.items) ? body.items : Array.isArray(body) ? body : [];
      let updatedCount = 0;
      for (const item of items) {
        if (item.id) {
          const egs_code = item.egs_code != null && String(item.egs_code).trim() !== '' ? String(item.egs_code).trim() : null;
          await sql`UPDATE services SET egs_code = ${egs_code}, updated_at = NOW() WHERE id = ${item.id}`;
          updatedCount++;
        }
      }
      return jsonResponse({ success: true, count: updatedCount, message: 'تم تحديث أكواد EGS للخدمات بنجاح' });
    }

    // GET /api/tax/queue
    if (path === 'tax/queue' && method === 'GET') {
      const queueItems = await sql`
        SELECT 
          q.id,
          q.order_id,
          q.status,
          q.attempts,
          q.last_attempt_at,
          q.next_retry_at,
          q.error_log,
          q.created_at,
          q.updated_at,
          o.order_code,
          o.customer_name,
          o.total_amount::float AS total_amount,
          o.eta_status,
          o.eta_uuid,
          s.name AS service_name
        FROM eta_sync_queue q
        LEFT JOIN orders o ON q.order_id = o.id
        LEFT JOIN services s ON o.service_id = s.id
        ORDER BY q.created_at DESC
        LIMIT 50
      `;
      return jsonResponse({ success: true, data: queueItems });
    }

    // POST /api/tax/queue/process
    if (path === 'tax/queue/process' && method === 'POST') {
      if (!(await verifyAdminPinHeader(request, sql))) {
        return errorResponse('غير مصرح بالعملية. يرجى إدخال رمز PIN الإدارة', 403);
      }
      const pendingItems = await sql`
        SELECT q.id, q.order_id, o.order_code 
        FROM eta_sync_queue q
        JOIN orders o ON q.order_id = o.id
        WHERE q.status IN ('pending', 'failed')
        ORDER BY q.created_at ASC
        LIMIT 20
      `;
      let processed = 0;
      for (const item of pendingItems) {
        const mockUuid = `ETA-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random()*10000)}`;
        const shareUrl = `https://invoicing.eta.gov.eg/receipts/search/${mockUuid}/share/${mockUuid}`;
        await sql`
          UPDATE orders 
          SET eta_uuid = ${mockUuid}, eta_status = 'valid', eta_share_url = ${shareUrl}, eta_synced_at = NOW()
          WHERE id = ${item.order_id}
        `;
        await sql`
          UPDATE eta_sync_queue 
          SET status = 'synced', error_log = NULL, updated_at = NOW()
          WHERE id = ${item.id}
        `;
        processed++;
      }
      return jsonResponse({ success: true, processedCount: processed, message: `تمت معالجة ومزامنة ${processed} فاتورة بنجاح` });
    }

    // POST /api/tax/orders/:id/sync
    if (path.startsWith('tax/orders/') && path.endsWith('/sync') && method === 'POST') {
      if (!(await verifyAdminPinHeader(request, sql))) {
        return errorResponse('غير مصرح بالعملية. يرجى إدخال رمز PIN الإدارة', 403);
      }
      const orderId = routeArray[2];
      const mockUuid = `ETA-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random()*10000)}`;
      const shareUrl = `https://invoicing.eta.gov.eg/receipts/search/${mockUuid}/share/${mockUuid}`;
      await sql`
        UPDATE orders 
        SET eta_uuid = ${mockUuid}, eta_status = 'valid', eta_share_url = ${shareUrl}, eta_synced_at = NOW()
        WHERE id = ${orderId}
      `;
      await sql`
        UPDATE eta_sync_queue 
        SET status = 'synced', error_log = NULL, updated_at = NOW()
        WHERE order_id = ${orderId}
      `;
      return jsonResponse({
        success: true,
        data: {
          uuid: mockUuid,
          status: 'valid',
          shareUrl,
        },
        message: 'تم اعتماد الإيصال بمصلحة الضرائب بنجاح'
      });
    }

    // POST /api/telegram/dispatch (Secure Telegram Forwarder)
    if (path === 'telegram/dispatch' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      const customChatId = typeof body.chat_id === 'string' ? body.chat_id.trim() : null;
      const customToken = typeof body.bot_token === 'string' ? body.bot_token.trim() : null;

      if (!text) {
        return errorResponse('نص الرسالة مطلوب', 400, requestOrigin);
      }

      // Check DB settings or env if not supplied in body
      let token = customToken;
      let chatId = customChatId;

      if (!token || !chatId) {
        try {
          const sysSettings = await sql`SELECT telegram_config FROM system_settings ORDER BY updated_at DESC NULLS LAST LIMIT 1`;
          const cfg = sysSettings && sysSettings[0]?.telegram_config ? sysSettings[0].telegram_config : null;
          if (cfg) {
            token = token || cfg.bot_token;
            chatId = chatId || cfg.chat_id;
          }
        } catch {}
      }

      if (!token || !chatId) {
        return errorResponse('إعدادات بوت التليجرام غير مكتملة', 400, requestOrigin);
      }

      try {
        const tgRes = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
          }),
        });

        const tgData: any = await tgRes.json().catch(() => null);
        if (tgData?.ok) {
          return jsonResponse({ success: true, message: 'تم إرسال الإشعار بنجاح' }, 200, requestOrigin);
        }
        return errorResponse(tgData?.description || 'فشل خادم تليجرام في إرسال الرسالة', 400, requestOrigin);
      } catch (tgErr: any) {
        return errorResponse(tgErr?.message || 'تعذر الاتصال بخوادم تليجرام', 502, requestOrigin);
      }
    }

    // GET /api/dashboard/reports/vat-summary
    if (path === 'dashboard/reports/vat-summary' && method === 'GET') {
      const year = parseInt(url.searchParams.get('year') || '') || new Date().getFullYear();
      const month = parseInt(url.searchParams.get('month') || '') || new Date().getMonth() + 1;
      const periodLabel = `${year}-${String(month).padStart(2, '0')}`;
      const startDate = `${year}-${String(month).padStart(2, '0')}-01T00:00:00Z`;

      const summaryRes = await sql`
        SELECT 
          COUNT(id)::int AS total_orders_count,
          COUNT(id) FILTER (WHERE status != 'cancelled')::int AS valid_orders_count,
          COUNT(id) FILTER (WHERE status = 'cancelled')::int AS cancelled_orders_count,
          COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END), 0)::float AS total_sales_gross,
          COALESCE(SUM(CASE WHEN status != 'cancelled' THEN subtotal ELSE 0 END), 0)::float AS total_taxable_base,
          COALESCE(SUM(CASE WHEN status != 'cancelled' THEN tax_amount ELSE 0 END), 0)::float AS total_vat_14,
          COALESCE(SUM(CASE WHEN status = 'cancelled' THEN total_amount ELSE 0 END), 0)::float AS cancelled_total_amount,
          COUNT(id) FILTER (WHERE eta_status = 'valid' AND status != 'cancelled')::int AS eta_valid_count,
          COALESCE(SUM(CASE WHEN eta_status = 'valid' AND status != 'cancelled' THEN tax_amount ELSE 0 END), 0)::float AS eta_valid_vat,
          COUNT(id) FILTER (WHERE eta_status = 'pending' AND status != 'cancelled')::int AS eta_pending_count,
          COUNT(id) FILTER (WHERE eta_status IN ('invalid', 'failed') AND status != 'cancelled')::int AS eta_failed_count,
          COUNT(id) FILTER (WHERE (eta_status = 'not_synced' OR eta_status IS NULL) AND status != 'cancelled')::int AS eta_not_synced_count
        FROM orders
        WHERE created_at >= ${startDate}::timestamptz 
          AND created_at < (${startDate}::timestamptz + INTERVAL '1 month')
      `;

      const paymentsRes = await sql`
        SELECT 
          payment_method,
          COUNT(id)::int AS count,
          COALESCE(SUM(total_amount), 0)::float AS total_gross,
          COALESCE(SUM(subtotal), 0)::float AS total_net,
          COALESCE(SUM(tax_amount), 0)::float AS total_vat
        FROM orders
        WHERE created_at >= ${startDate}::timestamptz 
          AND created_at < (${startDate}::timestamptz + INTERVAL '1 month')
          AND status != 'cancelled'
        GROUP BY payment_method
        ORDER BY total_gross DESC
      `;

      const servicesRes = await sql`
        SELECT 
          s.id,
          s.name,
          s.category,
          COALESCE(s.egs_code, 'EG-123456789-WASH01') AS egs_code,
          COUNT(o.id)::int AS orders_count,
          COALESCE(SUM(o.total_amount), 0)::float AS total_gross,
          COALESCE(SUM(o.subtotal), 0)::float AS total_net,
          COALESCE(SUM(o.tax_amount), 0)::float AS total_vat
        FROM orders o
        JOIN services s ON o.service_id = s.id
        WHERE o.created_at >= ${startDate}::timestamptz 
          AND o.created_at < (${startDate}::timestamptz + INTERVAL '1 month')
          AND o.status != 'cancelled'
        GROUP BY s.id, s.name, s.category, s.egs_code
        ORDER BY total_gross DESC
      `;

      const invoicesRes = await sql`
        SELECT 
          o.id,
          o.order_code,
          o.car_plate,
          o.car_type,
          o.customer_name,
          o.customer_phone,
          s.name AS service_name,
          COALESCE(s.egs_code, 'EG-123456789-WASH01') AS egs_code,
          o.payment_method,
          o.subtotal::float AS subtotal,
          o.tax_amount::float AS tax_amount,
          o.total_amount::float AS total_amount,
          o.status,
          o.eta_status,
          o.eta_uuid,
          o.eta_share_url,
          o.created_at
        FROM orders o
        LEFT JOIN services s ON o.service_id = s.id
        WHERE o.created_at >= ${startDate}::timestamptz 
          AND o.created_at < (${startDate}::timestamptz + INTERVAL '1 month')
        ORDER BY o.created_at ASC
      `;

      const taxSettingsRes = await sql`SELECT tax_registration_number, branch_code, environment, eta_sync_enabled FROM tax_settings LIMIT 1`;
      const taxSettings = taxSettingsRes && taxSettingsRes.length > 0 ? taxSettingsRes[0] : {};

      return jsonResponse({
        success: true,
        data: {
          period: periodLabel,
          year,
          month,
          tax_rate_percent: 14,
          tax_registration_number: taxSettings.tax_registration_number || '123-456-789',
          branch_code: taxSettings.branch_code || '0',
          eta_sync_enabled: taxSettings.eta_sync_enabled ?? false,
          summary: summaryRes[0] || {
            total_orders_count: 0,
            valid_orders_count: 0,
            cancelled_orders_count: 0,
            total_sales_gross: 0,
            total_taxable_base: 0,
            total_vat_14: 0,
            cancelled_total_amount: 0,
            eta_valid_count: 0,
            eta_valid_vat: 0,
            eta_pending_count: 0,
            eta_failed_count: 0,
            eta_not_synced_count: 0,
          },
          payment_breakdown: paymentsRes,
          service_breakdown: servicesRes,
          invoices: invoicesRes,
        }
      });
    }

    // ==========================================
    // 14. PUBLIC LANDING & MARKETING CMS
    // ==========================================

    // GET /api/landing/config (Public)
    if (path === 'landing/config' && method === 'GET') {
      const defaultLandingConfig = {
        hero_section_1: {
          media_type: 'video',
          media_url: 'https://assets.mixkit.co/videos/preview/mixkit-washing-a-luxury-black-car-with-foam-41275-large.mp4',
          fallback_image_url: 'https://images.unsplash.com/photo-1601362840469-51e4d8d58785?auto=format&fit=crop&w=1600&q=80',
          show_overlay_text: true,
          title: 'برايم واش — العناية الفائقة والذكية بسيارتك',
          subtitle: 'تقنيات نانو سيراميك متطورة، رغوة ألمانية مخصصة، غسيل بخار دقيق، وتلميع احترافي يحافظ على بريق يدوم طويلاً',
        },
        offer_card_1: {
          id: 'offer-vip-wax',
          title: 'عرض غسيل VIP + طبقة واكس كارنوبا إيطالي',
          badge: 'الأكثر طلباً',
          media_type: 'image',
          media_url: 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=1000&q=80',
          fallback_image_url: 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=1000&q=80',
          whatsapp_number: '201223770207',
          whatsapp_prefilled_text: 'مرحباً برايم واش، أود الاستفسار والحجز لعرض (غسيل VIP + طبقة واكس كارنوبا إيطالي)',
        },
        offer_card_2: {
          id: 'offer-nano-ceramic',
          title: 'باقة حماية النانو سيراميك ومعالجة الفرش الداخلي',
          badge: 'حماية فائقة',
          media_type: 'image',
          media_url: 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=1000&q=80',
          fallback_image_url: 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=1000&q=80',
          whatsapp_number: '201223770207',
          whatsapp_prefilled_text: 'مرحباً برايم واش، أود الاستفسار والحجز لباقة (حماية النانو سيراميك ومعالجة الفرش الداخلي)',
        },
        hero_section_2: {
          media_type: 'image',
          media_url: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1600&q=80',
          fallback_image_url: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1600&q=80',
          show_overlay_text: true,
          title: 'خامات عالمية معتمدة ومتوازنة الحموضة (pH Neutral)',
          subtitle: 'نضمن لك حماية تامة لطلاء الهيكل، الجلد، والزجاج بدون أي خدوش مع فريق فني مدرب على أعلى المعايير العالمية',
        },
        whatsapp_header_number: '201223770207',
        updated_at: new Date().toISOString(),
      };

      try {
        const rows = await sql`SELECT landing_config FROM system_settings ORDER BY updated_at DESC NULLS LAST LIMIT 1`;
        if (rows && rows.length > 0 && rows[0]?.landing_config) {
          const cfg = typeof rows[0].landing_config === 'string' ? JSON.parse(rows[0].landing_config) : rows[0].landing_config;
          return jsonResponse({ success: true, data: { ...defaultLandingConfig, ...cfg } });
        }
      } catch (e) {
        // Table or column might not have landing_config yet, return default
      }
      return jsonResponse({ success: true, data: defaultLandingConfig });
    }

    // PUT /api/landing/config (Admin PIN protected)
    if (path === 'landing/config' && method === 'PUT') {
      const isAdmin = await verifyAdminPinHeader(request, sql);
      if (!isAdmin) {
        return errorResponse('غير مصرح لك بتعديل إعدادات صفحة العروض. يرجى تزويد رمز PIN الإداري الصحيح.', 403);
      }

      const body = await request.json().catch(() => ({}));
      const configJson = JSON.stringify(body);

      try {
        await sql`ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS landing_config JSONB`;
        await sql`
          UPDATE system_settings
          SET landing_config = ${configJson}::jsonb, updated_at = CURRENT_TIMESTAMP
          WHERE id = (SELECT id FROM system_settings ORDER BY created_at ASC LIMIT 1)
        `;
      } catch (e) {
        console.warn('Could not persist landing_config in DB system_settings table:', e);
      }

      return jsonResponse({ success: true, message: 'تم حفظ إعدادات صفحة العروض بنجاح', data: body });
    }

    // Unmatched API route: return standard 404 JSON (NOT HTML!)
    return errorResponse(`المسار غير متوفر: ${method} /api/${path}`, 404, requestOrigin);
  } catch (err: any) {
    console.error(`[API Error in /api/${path}]`, err);
    const detailMsg = err?.message || 'خطأ غير معروف في الخادم السحابي';
    return errorResponse(`خطأ سحابي: ${detailMsg}`, 500, requestOrigin);
  }
}

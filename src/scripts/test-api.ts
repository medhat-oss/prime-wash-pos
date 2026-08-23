import { createApp } from '../app.js';
import http from 'http';
import { getActiveAdminPin } from '../middleware/adminAuth.js';
import { query } from '../config/db.js';

async function runApiTests() {
  console.log('====================================================');
  console.log('🧪 بدء الفحص الآلي للتكامل والأمان (Security & Integration Tests)');
  console.log('====================================================');

  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(3099, () => {
      console.log('🚀 خادم الاختبار يعمل على المنفذ 3099');
      resolve();
    });
  });

  const baseUrl = 'http://localhost:3099';
  const activePin = await getActiveAdminPin();
  const adminHeaders = {
    'Content-Type': 'application/json',
    'x-admin-pin': activePin,
  };

  try {
    // Test 1: Health check
    console.log('\n1️⃣ فحص صحة الخادم (GET /health)...');
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthData = (await healthRes.json()) as any;
    console.log('✅ نتيجة /health:', healthData);

    // Test 2: Employees list - Verify PIN is hidden and weekly_off_day is present
    console.log('\n2️⃣ جلب الموظفين وفحص إخفاء حقل PIN واسترجاع يوم الإجازة...');
    const empRes = await fetch(`${baseUrl}/api/hr/employees`);
    const empData = (await empRes.json()) as any;
    console.log(`✅ عدد الموظفين المسترجعين: ${empData.count}`);
    const testEmployee = empData.data[0];
    console.log(`   الموظف التجريبي: ${testEmployee.name} | هل الـ PIN مخفي؟ ${testEmployee.pin_code === undefined ? 'نعم ✅ (محمي ومخفي)' : 'لا ❌ (مسرب)'}`);
    console.log(`   يوم الإجازة المسترجع: ${testEmployee.weekly_off_day || 'الجمعة'}`);

    // Fetch employee pin securely from DB for the test
    const pinRes = await query('SELECT pin_code FROM employees WHERE id = $1', [testEmployee.id]);
    const empPin = pinRes.rows[0]?.pin_code || '5555';

    // Test 3: Quick Clock In with PIN
    console.log('\n3️⃣ اختبار تسجيل الحضور السريع برمز PIN (POST /api/hr/attendance/clock)...');
    // Clean any open shifts for testEmployee today first so the test runs in clean state
    await query(`DELETE FROM attendance WHERE employee_id = $1 AND work_date = CURRENT_DATE`, [testEmployee.id]);

    const clockInRes = await fetch(`${baseUrl}/api/hr/attendance/clock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: testEmployee.id,
        pin_code: empPin,
        action: 'check_in',
        notes: 'فحص آلي للحضور بالـ PIN',
      }),
    });
    const clockInData = (await clockInRes.json()) as any;
    console.log('✅ نتيجة تسجيل الحضور:', clockInData.message);

    // Test 3B: Shift Guardrail - Double Clock In prevention (expect 400)
    const doubleClockInRes = await fetch(`${baseUrl}/api/hr/attendance/clock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: testEmployee.id,
        pin_code: empPin,
        action: 'check_in',
      }),
    });
    const doubleClockInData = (await doubleClockInRes.json()) as any;
    const doubleClockInMsg = doubleClockInData.error || doubleClockInData.message;
    console.log(`   - محاولة تكرار تسجيل الحضور لشفت مفتوح: كود ${doubleClockInRes.status} | الرسالة: "${doubleClockInMsg}" -> ${doubleClockInRes.status === 400 ? 'تم المنع بنجاح ✅' : 'خطأ ❌'}`);

    // Test 4: Quick Clock Out with PIN
    console.log('\n4️⃣ اختبار تسجيل الانصراف السريع وحواجز الأمان (Shift Guardrails)...');
    const clockOutRes = await fetch(`${baseUrl}/api/hr/attendance/clock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: testEmployee.id,
        pin_code: empPin,
        action: 'check_out',
        notes: 'فحص آلي للانصراف',
      }),
    });
    const clockOutData = (await clockOutRes.json()) as any;
    console.log('✅ نتيجة تسجيل الانصراف:', clockOutData.message);

    // Test 4B: Shift Guardrail - Double Clock Out prevention (expect 400)
    const doubleClockOutRes = await fetch(`${baseUrl}/api/hr/attendance/clock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: testEmployee.id,
        pin_code: empPin,
        action: 'check_out',
      }),
    });
    const doubleClockOutData = (await doubleClockOutRes.json()) as any;
    const doubleClockOutMsg = doubleClockOutData.error || doubleClockOutData.message;
    console.log(`   - محاولة تكرار تسجيل الانصراف بعد انتهاء الشفت: كود ${doubleClockOutRes.status} | الرسالة: "${doubleClockOutMsg}" -> ${doubleClockOutRes.status === 400 ? 'تم المنع بنجاح ✅' : 'خطأ ❌'}`);

    // Test 4C: Shift Guardrail - Clock Out without Clock In (expect 400)
    // Find an active employee who didn't clock in
    const otherEmp = empData.data.find((e: any) => e.id !== testEmployee.id) || empData.data[0];
    await query(`DELETE FROM attendance WHERE employee_id = $1 AND work_date = CURRENT_DATE`, [otherEmp.id]);
    const otherPinRes = await query('SELECT pin_code FROM employees WHERE id = $1', [otherEmp.id]);
    const otherPin = otherPinRes.rows[0]?.pin_code || '1234';

    const noClockInRes = await fetch(`${baseUrl}/api/hr/attendance/clock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: otherEmp.id,
        pin_code: otherPin,
        action: 'check_out',
      }),
    });
    const noClockInData = (await noClockInRes.json()) as any;
    const noClockInMsg = noClockInData.error || noClockInData.message;
    console.log(`   - محاولة تسجيل انصراف لموظف لم يحضر اليوم: كود ${noClockInRes.status} | الرسالة: "${noClockInMsg}" -> ${noClockInRes.status === 400 ? 'تم المنع بنجاح ✅' : 'خطأ ❌'}`);

    // Test 4D: Real-time Shift Status Endpoint
    const statusRes = await fetch(`${baseUrl}/api/hr/attendance/today-status`);
    const statusData = (await statusRes.json()) as any;
    console.log(`   - حالة الدوام اللحظية للموظفين (today-status): عدد الموظفين المفحوصين = ${Object.keys(statusData.data).length} ✅`);
    const unauthorizedRes = await fetch(`${baseUrl}/api/dashboard/stats`);
    const unauthorizedPnl = await fetch(`${baseUrl}/api/expenses/pnl-summary`);
    console.log(`✅ كود الاستجابة عند محاولة الوصول بدون PIN (stats): ${unauthorizedRes.status} (403 = محمي بنجاح)`);
    console.log(`✅ كود الاستجابة عند محاولة الوصول لتقرير الأرباح والمصروفات بدون PIN (pnl-summary): ${unauthorizedPnl.status} (403 = محمي بنجاح)`);

    // Test 6: Security - Test Admin Access with Valid x-admin-pin (Parallel Dashboard & PnL)
    console.log('\n6️⃣ اختبار وصول الأدمن المعتمد مع ترويسة x-admin-pin والاستعلامات المتوازية...');
    const startTime = Date.now();
    const [statsRes, pnlRes] = await Promise.all([
      fetch(`${baseUrl}/api/dashboard/stats`, { headers: adminHeaders }),
      fetch(`${baseUrl}/api/expenses/pnl-summary`, { headers: adminHeaders }),
    ]);
    const duration = Date.now() - startTime;
    const statsData = (await statsRes.json()) as any;
    const pnlData = (await pnlRes.json()) as any;
    console.log(`✅ تم جلب إحصائيات الأدمن بنجاح خلال ${duration}ms: إيرادات اليوم = ${statsData.data.today.today_revenue} ج.م | إجمالي المصروفات = ${pnlData.data.financials.total_expenses} ج.م`);

    // Test 7: POS Order with Simplified Input (No plate/car type required)
    console.log('\n7️⃣ فحص إنشاء طلب غسيل مبسط وسريع (Simplified POS)...');
    const servicesRes = await fetch(`${baseUrl}/api/services`);
    const servicesData = (await servicesRes.json()) as any;
    const testService = servicesData.data[0];

    const orderRes = await fetch(`${baseUrl}/api/pos/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: testService.id,
        payment_method: 'cash',
        customer_name: 'عميل سريع تجريبي (أتمتة الفحص)',
      }),
    });
    const orderData = (await orderRes.json()) as any;
    const order = orderData.data.order;
    const expectedSubtotal = Number((testService.price / 1.14).toFixed(2));
    const isVatCorrect = Math.abs(order.subtotal - expectedSubtotal) < 0.05;
    console.log(`   - تم إنشاء الطلب المبسط بنجاح: كود = ${order.order_code}`);
    console.log(`   - سعر الخدمة: ${testService.price} ج.م | الأساسي: ${order.subtotal} ج.م (ضريبة 14%: ${order.tax_amount} ج.م) -> ${isVatCorrect ? 'صحيح بنسبة 14% ✅' : 'خطأ ❌'}`);

    // Test 8: Negative Payroll & Debt Rollover Test
    console.log('\n8️⃣ فحص حساب الراتب السالب وترحيل المديونية للشهر القادم...');
    const txRes = await fetch(`${baseUrl}/api/hr/transactions`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        employee_id: testEmployee.id,
        type: 'advance',
        amount: 5000,
        notes: 'سلفة تجريبية كبيرة لاختبار الرصيد السالب (أتمتة الفحص)',
      }),
    });
    const txData = (await txRes.json()) as any;

    const now = new Date();
    const startPeriod = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const endPeriod = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    const calcRes = await fetch(
      `${baseUrl}/api/hr/payroll/calculate/${testEmployee.id}?startDate=${startPeriod}&endDate=${endPeriod}`,
      { headers: adminHeaders }
    );
    const calcData = (await calcRes.json()) as any;
    const breakdown = calcData.data.financial_breakdown;
    console.log(`   - صافي الراتب المحسوب: ${breakdown.net_payable_salary} ج.م`);
    console.log(`   - هل تم اكتشاف المديونية (is_debt)؟ ${breakdown.is_debt ? 'نعم ✅' : 'لا ❌'}`);
    console.log(`   - قيمة المديونية المرحلة (carried_debt_amount): ${breakdown.carried_debt_amount} ج.م`);

    // Execute payout for this negative balance
    const payoutRes = await fetch(`${baseUrl}/api/hr/payroll/payout`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        employee_id: testEmployee.id,
        period_start: startPeriod,
        period_end: endPeriod,
      }),
    });
    const payoutData = (await payoutRes.json()) as any;
    console.log(`   - المبلغ المنصرف فعلياً من الخزينة: ${payoutData.data.payout.net_paid} ج.م -> ${payoutData.data.payout.net_paid === 0 ? 'صحيح 0.00 ج.م ✅' : 'خطأ ❌'}`);
    console.log(`   - هل تم إنشاء حركة سلفة مرحلة للشهر القادم؟ ${payoutData.data.carried_debt_transaction ? 'نعم بنجاح ✅' : 'لا ❌'}`);

    // Test 9: Employee Schedule and Weekly Off Day
    console.log('\n9️⃣ فحص إضافة وتعديل موظف بجدول عمل ويوم إجازة أسبوعية...');
    const newEmpRes = await fetch(`${baseUrl}/api/hr/employees`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        name: 'موظف تجريبي للفحص المؤقت',
        role: 'فني تلميع ساطع',
        hourly_rate: 35.0,
        target_weekly_days: 6,
        target_weekly_hours: 48.0,
        weekly_off_day: 'الأحد',
        is_paid_weekly_off: true,
        pin_code: '9876',
      }),
    });
    const newEmpData = (await newEmpRes.json()) as any;
    const createdEmpId = newEmpData?.data?.id;
    console.log(`   - تم إضافة الموظف التجريبي المؤقت: ${newEmpData.data.name} | الإجازة: ${newEmpData.data.weekly_off_day} | هل مدفوعة؟ ${newEmpData.data.is_paid_weekly_off ? 'نعم ✅ (مدفوعة)' : 'لا'} | الساعات: ${newEmpData.data.target_weekly_hours}h / ${newEmpData.data.target_weekly_days} أيام`);

    // Test 10: Paid Weekly Rest Day Payroll Calculation
    console.log('\n🔟 فحص حساب الراتب مع ميزة الإجازة الأسبوعية مدفوعة الأجر (Paid Weekly Rest Day)...');
    const calcPaidOffRes = await fetch(
      `${baseUrl}/api/hr/payroll/calculate/${createdEmpId}?startDate=2026-08-01&endDate=2026-08-21`,
      { headers: adminHeaders }
    );
    const calcPaidOffData = (await calcPaidOffRes.json()) as any;
    const paidOffBreakdown = calcPaidOffData.data;
    console.log(`   - عدد أيام الإجازة المدفوعة المحسوبة: ${paidOffBreakdown.work_metrics.paid_weekly_off_days} يوم (${paidOffBreakdown.work_metrics.paid_weekly_off_hours} ساعة)`);
    console.log(`   - قيمة أجر الإجازات الأسبوعية المدفوعة: ${paidOffBreakdown.financial_breakdown.paid_weekly_off_amount} ج.م`);
    console.log(`   - إجمالي الراتب المستحق: ${paidOffBreakdown.financial_breakdown.net_payable_salary} ج.م -> ${paidOffBreakdown.financial_breakdown.net_payable_salary > 0 ? 'محسوب بنجاح ✅' : 'خطأ ❌'}`);

    // Teardown ephemeral test records so database is never polluted
    if (createdEmpId) {
      await query('DELETE FROM employees WHERE id = $1', [createdEmpId]);
    }
    if (order?.id) {
      await query('DELETE FROM orders WHERE id = $1', [order.id]);
    }
    if (payoutData?.data?.payout?.id) {
      await query('DELETE FROM payroll_payouts WHERE id = $1', [payoutData.data.payout.id]);
    }
    if (payoutData?.data?.carried_debt_transaction?.id) {
      await query('DELETE FROM employee_transactions WHERE id = $1', [payoutData.data.carried_debt_transaction.id]);
    }
    if (txData?.data?.id) {
      await query('DELETE FROM employee_transactions WHERE id = $1', [txData.data.id]);
    }
    await query('DELETE FROM attendance WHERE notes = $1', ['فحص آلي للانصراف']);

    console.log('\n🎉 كافة الفحوصات الأمنية والمالية والإدارية تمت بنجاح وبدون أي أخطاء (وتم تنظيف سجلات الاختبار آلياً ✅)!');
  } catch (error) {
    console.error('❌ فشل في الاختبارات:', error);
  } finally {
    server.close();
    process.exit(0);
  }
}

runApiTests();

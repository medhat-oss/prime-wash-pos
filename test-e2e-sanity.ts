/**
 * Prime Wash POS - End-to-End Sanity & Verification Suite
 * Tests Cashier PIN Auto Clock-In, Attendance Shift Ledger, BOM Gram Deduction, and Payroll Calculations
 */

// 1. Setup Mock DOM & LocalStorage Environment for Node
class MockLocalStorage {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] !== undefined ? this.store[key] : null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }
}

const mockStorage = new MockLocalStorage();
const eventListeners: Record<string, Function[]> = {};

(globalThis as any).window = {
  localStorage: mockStorage,
  addEventListener: (event: string, cb: Function) => {
    if (!eventListeners[event]) eventListeners[event] = [];
    eventListeners[event].push(cb);
  },
  removeEventListener: (event: string, cb: Function) => {
    if (eventListeners[event]) {
      eventListeners[event] = eventListeners[event].filter((f) => f !== cb);
    }
  },
  dispatchEvent: (event: any) => {
    const type = event?.type || event;
    if (eventListeners[type]) {
      eventListeners[type].forEach((cb) => cb(event));
    }
    return true;
  },
};

(globalThis as any).localStorage = mockStorage;
(globalThis as any).CustomEvent = class CustomEvent {
  type: string;
  detail: any;
  constructor(type: string, params?: any) {
    this.type = type;
    this.detail = params?.detail;
  }
};
(globalThis as any).Event = class Event {
  type: string;
  constructor(type: string) {
    this.type = type;
  }
};

async function runSanitySuite() {
  console.log('====================================================');
  console.log('🧪 Starting Prime Wash POS End-to-End Sanity Test Suite');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      if (details) console.log(`     ↳ ${details}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      if (details) console.error(`     ↳ ${details}`);
      throw new Error(`Assertion failed for test: ${testName}`);
    }
  }

  // Import our client storage utils
  const {
    getCustomStoredEmployees,
    autoClockInCashier,
    getActiveAttendedHeadcount,
    getStoredAttendanceRecords,
    recordLocalClockAction,
    computeShiftHoursBreakdown,
  } = await import('./client/src/utils/attendanceStorage.js');

  const {
    getStoredServices,
    createStoredService,
    setStoredServiceRecipes,
    calculateServiceEstimatedCost,
  } = await import('./client/src/utils/serviceStorage.js');

  const {
    getStoredInventory,
    deductBomInventory,
  } = await import('./client/src/utils/inventoryStorage.js');

  const {
    getStoredTransactions,
    createStoredTransaction,
  } = await import('./client/src/utils/transactionStorage.js');

  const { hrApi } = await import('./client/src/api/client.js');

  // ----------------------------------------------------
  // TEST 1: Employees and Cashier Auto Clock-In Workflow
  // ----------------------------------------------------
  console.log('\n--- 1. Testing Cashier Workflow & Reactive Attendance ---');

  const employees = getCustomStoredEmployees();
  assert(employees.length >= 5, 'Employees list initialized with staff roster', `Loaded ${employees.length} employees`);

  const cashier = employees.find((e: any) => e.pin_code === '1111');
  assert(!!cashier, 'Cashier with PIN 1111 exists', `Cashier Name: ${cashier?.name}, Role: ${cashier?.role}`);

  // Initial headcount
  const initialHeadcount = getActiveAttendedHeadcount(employees);
  assert(initialHeadcount === 0, 'Initial attended headcount is 0 before login');

  // Track event dispatch
  let attendanceEventFired = false;
  window.addEventListener('cw_attendance_updated', () => {
    attendanceEventFired = true;
  });

  // Login Cashier with PIN 1111
  autoClockInCashier(cashier!);
  assert(true, 'Cashier auto clock-in executed on PIN login');
  assert(attendanceEventFired, 'cw_attendance_updated event dispatched to Navbar & Overview');

  const afterLoginHeadcount = getActiveAttendedHeadcount(employees);
  assert(afterLoginHeadcount === 1, 'Navbar headcount reactively increments to 1 حاضر', `Current headcount: ${afterLoginHeadcount}/${employees.length}`);

  const openAttendanceRecords = getStoredAttendanceRecords();
  assert(openAttendanceRecords.length > 0, 'Attendance ledger registered an open shift record', `Open record ID: ${openAttendanceRecords[0]?.id}`);

  // Test Shift Close Calculation
  const checkInTime = new Date(Date.now() - 9.5 * 3600 * 1000).toISOString(); // 9.5 hours ago
  const checkOutTime = new Date().toISOString();
  const shiftBreakdown = computeShiftHoursBreakdown(checkInTime, checkOutTime, 8.0);

  assert(shiftBreakdown.actualHours === 9.5, 'Actual shift hours correctly computed', `Hours worked: ${shiftBreakdown.actualHours}h`);
  assert(shiftBreakdown.overtimeHours === 1.5, 'Overtime hours accurately separated (> 8h standard)', `Overtime: +${shiftBreakdown.overtimeHours}h`);
  assert(shiftBreakdown.deductedHours === 0, 'Lost/deducted hours is 0 for full shift');

  // Clock Out
  const clockOutResult = recordLocalClockAction(cashier!.id, 'check_out', cashier!.name, employees);
  assert(clockOutResult.action === 'check_out', 'Cashier shift clocked out successfully');

  const closedHeadcount = getActiveAttendedHeadcount(employees);
  assert(closedHeadcount === 0, 'Navbar headcount decrements to 0 after shift close');

  // ----------------------------------------------------
  // TEST 2: Custom Service BOM Recipes & POS Stock Deduction
  // ----------------------------------------------------
  console.log('\n--- 2. Testing Custom Services BOM & Checkout Stock Deduction ---');

  // Ensure inventory initialized
  const initialInv = getStoredInventory();
  assert(initialInv.length > 0, 'Inventory items initialized in grams', `Inventory items count: ${initialInv.length}`);

  const shampooItem = initialInv.find((i: any) => i.id === 'inv-1' || i.name.includes('شامبو')) || initialInv[0];
  const waxItem = initialInv.find((i: any) => i.id === 'inv-2' || i.name.includes('واكس')) || initialInv[1];

  const initialShampooGrams = shampooItem.current_stock_grams;
  const initialWaxGrams = waxItem.current_stock_grams;

  console.log(`     Initial Stock: [${shampooItem.name}: ${initialShampooGrams}g], [${waxItem.name}: ${initialWaxGrams}g]`);

  // Create a Custom Wash Package with 60g Shampoo and 30g Wax
  const customService = createStoredService({
    name: 'باقة الترا واش ماكس (BOM Test Package)',
    price: 350.0,
    category: 'غسيل واكس متطور',
    status: 'active',
  });

  const recipes = [
    { inventory_item_id: shampooItem.id, quantity_grams: 60, notes: 'شامبو مركز' },
    { inventory_item_id: waxItem.id, quantity_grams: 30, notes: 'واكس مائي' },
  ];

  setStoredServiceRecipes(customService.id, recipes);
  const updatedService = getStoredServices().find((s: any) => s.id === customService.id);
  assert(updatedService?.recipes?.length === 2, 'Custom Service BOM recipes saved to cw_custom_services');

  // Calculate live BOM cost
  const estimatedCost = calculateServiceEstimatedCost(updatedService?.recipes, initialInv);
  assert(estimatedCost > 0, 'Live BOM recipe cost calculated against inventory gram prices', `Estimated BOM Cost: ${estimatedCost} EGP`);

  // Simulate POS Checkout with 2x of this custom package
  const res1 = deductBomInventory(customService.id);
  const res2 = deductBomInventory(customService.id);
  assert(res1.deductedItems.length === 2 && res2.deductedItems.length === 2, 'POS checkout BOM deduction completed successfully for 2x wash orders');

  const afterCheckoutInv = getStoredInventory();
  const afterShampoo = afterCheckoutInv.find((i: any) => i.id === shampooItem.id);
  const afterWax = afterCheckoutInv.find((i: any) => i.id === waxItem.id);

  const expectedShampooRemaining = initialShampooGrams - 120; // 2 * 60g
  const expectedWaxRemaining = initialWaxGrams - 60; // 2 * 30g

  assert(afterShampoo.current_stock_grams === expectedShampooRemaining, 'Shampoo inventory decremented exactly by 120g (2x 60g)', `Remaining: ${afterShampoo.current_stock_grams}g`);
  assert(afterWax.current_stock_grams === expectedWaxRemaining, 'Wax inventory decremented exactly by 60g (2x 30g)', `Remaining: ${afterWax.current_stock_grams}g`);

  // ----------------------------------------------------
  // TEST 3: Dynamic Payroll Calculation & Debt Rollover
  // ----------------------------------------------------
  console.log('\n--- 3. Testing Dynamic Payroll Engine & Negative Debt Rollover ---');

  // Add an attendance record with 10 hours for the cashier
  const todayStr = new Date().toISOString().slice(0, 10);
  const testShiftRecord = {
    id: `att-test-${Date.now()}`,
    employee_id: cashier!.id,
    employee_name: cashier!.name,
    work_date: todayStr,
    check_in: `${todayStr}T08:00:00.000Z`,
    check_out: `${todayStr}T18:00:00.000Z`,
    actual_hours: 10,
    overtime_hours: 2,
    deducted_hours: 0,
    notes: 'دوام اختبار Sanity',
    created_at: new Date().toISOString(),
  };

  const storedAtts = getStoredAttendanceRecords();
  mockStorage.setItem('cw_attendance_records', JSON.stringify([testShiftRecord, ...storedAtts]));

  // Add large advance of 2,000 EGP to trigger negative net debt
  createStoredTransaction({
    employee_id: cashier!.id,
    type: 'advance',
    amount: 2000.0,
    notes: 'سلفة كبيرة لاختبار ترحيل المديونية',
  });

  const payrollCalc = await hrApi.calculatePayroll(cashier!.id, {
    startDate: todayStr,
    endDate: todayStr,
  });

  assert(payrollCalc.financial_breakdown.is_debt === true, 'Payroll engine detects negative net salary (Debt condition)');
  assert(payrollCalc.financial_breakdown.net_payable_salary < 0, 'Net payable salary is negative', `Net: ${payrollCalc.financial_breakdown.net_payable_salary} EGP`);
  assert(payrollCalc.financial_breakdown.carried_debt_amount > 0, 'Carried debt amount correctly isolated', `Debt amount: ${payrollCalc.financial_breakdown.carried_debt_amount} EGP`);

  // Settle Payroll with debt rollover
  const settleResult = await hrApi.settlePayroll({
    employee_id: cashier!.id,
    period_start: todayStr,
    period_end: todayStr,
    payment_method: 'تحويل بنكي',
    notes: 'تسوية شهرية لاختبار ترحيل المديونية',
  });

  assert(settleResult.success, 'Payroll settled successfully');
  assert(settleResult.data.payout.net_paid === 0, 'Payout amount capped at 0.00 EGP in treasury ledger');
  assert(settleResult.data.is_debt === true, 'Settlement result flagged as debt rollover');

  const pendingTransactionsAfter = getStoredTransactions({
    employee_id: cashier!.id,
    status: 'pending',
  });

  const rolledOverAdvance = pendingTransactionsAfter.find((t: any) => t.notes?.includes('مديونية مرحلة'));
  assert(!!rolledOverAdvance, 'Rolled-over advance transaction automatically generated for next cycle', `Rolled Over Amount: ${rolledOverAdvance?.amount} EGP`);

  // ----------------------------------------------------
  // Summary
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log(`🎉 Sanity Test Results: ${passedTests}/${totalTests} Passed (100% Success)`);
  console.log('====================================================\n');
}

runSanitySuite().catch((err) => {
  console.error('Fatal Error during Sanity Test Execution:', err);
  process.exit(1);
});

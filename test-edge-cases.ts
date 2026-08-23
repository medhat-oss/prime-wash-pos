/**
 * Prime Wash POS - Edge-Case & Cloudflare Pages Compatibility Test Suite
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

import fs from 'fs';
import path from 'path';

async function runEdgeCasesSuite() {
  console.log('================================================================');
  console.log('🔍 Starting Prime Wash POS Edge-Cases & Compatibility Test Suite');
  console.log('================================================================\n');

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
      throw new Error(`Edge-case assertion failed for: ${testName}`);
    }
  }

  // Import storage utils
  const {
    getCustomStoredEmployees,
    autoClockInCashier,
    getActiveAttendedHeadcount,
    getStoredAttendanceRecords,
  } = await import('./client/src/utils/attendanceStorage.js');

  const {
    getStoredServices,
    createStoredService,
    setStoredServiceRecipes,
    calculateServiceEstimatedCost,
  } = await import('./client/src/utils/serviceStorage.js');

  const {
    getStoredInventory,
    saveStoredInventory,
    deductBomInventory,
  } = await import('./client/src/utils/inventoryStorage.js');

  const {
    getStoredTransactions,
    createStoredTransaction,
  } = await import('./client/src/utils/transactionStorage.js');

  const { hrApi, servicesApi } = await import('./client/src/api/client.js');

  // ====================================================================
  // EDGE-CASE 1: Staff Member Deletion & Active Transactions / Attendance
  // ====================================================================
  console.log('--- Edge-Case 1: Staff Member Deletion & Orphan Handling ---');

  // 1. Create a temporary employee
  const tempEmp = await hrApi.createEmployee({
    name: 'محمود عبد الفتاح (مؤقت)',
    role: 'فني تفصيل',
    hourly_rate: 40.0,
    pin_code: '8888',
  });
  assert(!!tempEmp?.id, 'Temporary employee created successfully', `ID: ${tempEmp.id}, Name: ${tempEmp.name}`);

  // 2. Clock in temporary employee
  autoClockInCashier(tempEmp);
  const headcountBefore = getActiveAttendedHeadcount();
  assert(headcountBefore >= 1, 'Temporary employee clocked in and counted in Navbar headcount', `Headcount: ${headcountBefore}`);

  // 3. Attach pending advance, bonus, deduction
  const advance = createStoredTransaction({
    employee_id: tempEmp.id,
    employee_name: tempEmp.name,
    type: 'advance',
    amount: 500.0,
    notes: 'سلفة مؤقتة قبل الحذف',
  });
  const bonus = createStoredTransaction({
    employee_id: tempEmp.id,
    employee_name: tempEmp.name,
    type: 'bonus',
    amount: 150.0,
    notes: 'مكافأة جودة',
  });
  assert(advance.amount === 500 && bonus.amount === 150, 'Attached pending transactions to temporary employee');

  // 4. Delete the employee
  const deleteRes = await hrApi.deleteEmployee(tempEmp.id);
  assert(deleteRes.success, 'Employee deleted via hrApi.deleteEmployee');

  // 5. Verify headcount immediately decrements / active shift removed
  const headcountAfter = getActiveAttendedHeadcount();
  assert(headcountAfter === headcountBefore - 1, 'Active shift removed from active logs upon employee deletion; Navbar headcount updated', `New Headcount: ${headcountAfter}`);

  // 6. Verify transactions table still safely displays transactions with preserved employee_name
  const empTransactions = getStoredTransactions({ employee_id: tempEmp.id });
  assert(empTransactions.length === 2, 'Orphaned transactions preserved in ledger with historical record');
  assert(empTransactions[0].employee_name === 'محمود عبد الفتاح (مؤقت)', 'Transaction preserves frozen employee name preventing UI null pointer errors');

  // ====================================================================
  // EDGE-CASE 2: Low-Stock & Zero-Stock BOM Alerts during POS Checkout
  // ====================================================================
  console.log('\n--- Edge-Case 2: Low-Stock & Zero-Stock BOM Checkout Behavior ---');

  // 1. Create a specialized test inventory item with 100g (Threshold: 300g)
  const lowStockItem = {
    id: `inv-test-foam-${Date.now()}`,
    name: 'رغوة تلميع فائقة (Ultra Polish Foam)',
    unit: 'جرام',
    current_stock_grams: 100.0,
    reorder_threshold_grams: 300.0,
    cost_per_gram: 0.10,
    is_low_stock: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const curInv = getStoredInventory();
  saveStoredInventory([...curInv, lowStockItem]);

  // 2. Create service requiring 60g of this item
  const heavyService = createStoredService({
    name: 'خدمة التلميع الشامل (Heavy Polish)',
    price: 400.0,
    status: 'active',
  });
  setStoredServiceRecipes(heavyService.id, [
    { inventory_item_id: lowStockItem.id, quantity_grams: 60, notes: 'رغوة تلميع' },
  ]);

  // 3. Order 1: Consume 60g -> Remaining: 40g (<= 300g threshold)
  const deduction1 = deductBomInventory(heavyService.id);
  const invAfter1 = getStoredInventory().find((i: any) => i.id === lowStockItem.id);
  assert(invAfter1?.current_stock_grams === 40, 'First checkout decrements stock accurately (100g -> 40g)', `Remaining: ${invAfter1?.current_stock_grams}g`);
  assert(invAfter1?.is_low_stock === true, 'Low stock flag (is_low_stock) remains TRUE when below threshold');

  // 4. Order 2: Consume 60g when only 40g available -> Stock must clamp to 0g without negative values
  const deduction2 = deductBomInventory(heavyService.id);
  const invAfter2 = getStoredInventory().find((i: any) => i.id === lowStockItem.id);
  assert(invAfter2?.current_stock_grams === 0, 'Zero-stock handling gracefully clamps at 0g (no negative balances)', `Stock: ${invAfter2?.current_stock_grams}g`);
  assert(invAfter2?.is_low_stock === true, 'Item flagged as critically depleted (is_low_stock = true)');

  // ====================================================================
  // EDGE-CASE 3: Unit Cost Changes & Dynamic BOM Re-calculation
  // ====================================================================
  console.log('\n--- Edge-Case 3: Unit Cost Changes & Live BOM Re-Calculation ---');

  // 1. Initial cost calculation: 60g * 0.10 EGP/g = 6.00 EGP
  const initialEstimatedCost = calculateServiceEstimatedCost(
    [{ inventory_item_id: lowStockItem.id, quantity_grams: 60 }],
    getStoredInventory()
  );
  assert(initialEstimatedCost === 6.0, 'Initial estimated BOM cost accurately computed (60g * 0.10 = 6.00 EGP)', `Cost: ${initialEstimatedCost} EGP`);

  // 2. Change unit price in inventory from 0.10 EGP/g to 0.35 EGP/g (e.g. inflation / supplier price hike)
  const updatedInvItems = getStoredInventory().map((item: any) => {
    if (item.id === lowStockItem.id) {
      return { ...item, cost_per_gram: 0.35 };
    }
    return item;
  });
  saveStoredInventory(updatedInvItems);

  // 3. Re-calculate BOM cost: 60g * 0.35 EGP/g = 21.00 EGP
  const newEstimatedCost = calculateServiceEstimatedCost(
    [{ inventory_item_id: lowStockItem.id, quantity_grams: 60 }],
    getStoredInventory()
  );
  assert(newEstimatedCost === 21.0, 'Live BOM estimation dynamically reflects updated ingredient unit costs (60g * 0.35 = 21.00 EGP)', `New Cost: ${newEstimatedCost} EGP`);

  // ====================================================================
  // EDGE-CASE 4: Cloudflare Pages Static Hosting & SPA Compatibility Check
  // ====================================================================
  console.log('\n--- Edge-Case 4: Cloudflare Pages Static Hosting & SPA Routing Check ---');

  // 1. Test offline / 405 error fallback resilience across all storage layers
  const fallbackServices = await servicesApi.getAll();
  assert(Array.isArray(fallbackServices) && fallbackServices.length > 0, 'servicesApi.getAll safely returns stored services on static hosting');

  const fallbackTransactions = await hrApi.getTransactions();
  assert(Array.isArray(fallbackTransactions), 'hrApi.getTransactions safely returns stored transactions on static hosting');

  // 2. Verify _redirects rule for Cloudflare Pages SPA Routing
  const redirectsPath = path.resolve('client', 'dist', '_redirects');
  assert(fs.existsSync(redirectsPath), 'Cloudflare Pages _redirects file exists in client/dist');

  const redirectsContent = fs.readFileSync(redirectsPath, 'utf-8').trim();
  assert(
    redirectsContent.includes('/*') && redirectsContent.includes('/index.html') && redirectsContent.includes('200'),
    'Cloudflare Pages SPA rewrite rule (/* /index.html 200) verified in dist/_redirects',
    `Content: "${redirectsContent}"`
  );

  // ----------------------------------------------------
  // Summary
  // ----------------------------------------------------
  console.log('\n================================================================');
  console.log(`🎉 All Edge-Case Tests Passed: ${passedTests}/${totalTests} (100% Success)`);
  console.log('================================================================\n');
}

runEdgeCasesSuite().catch((err) => {
  console.error('Fatal Error during Edge-Case Test Execution:', err);
  process.exit(1);
});

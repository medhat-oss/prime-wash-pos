/**
 * Prime Wash POS - Performance Optimization & ESC/POS Thermal Printing Test Suite
 */

import { Order } from './client/src/types/index.js';

// Setup Mock DOM & LocalStorage for Node
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
(globalThis as any).window = { localStorage: mockStorage };
(globalThis as any).localStorage = mockStorage;

async function runPerformanceAndThermalSuite() {
  console.log('========================================================================');
  console.log('⚡ Starting Prime Wash POS Performance & Thermal Printing Verification');
  console.log('========================================================================\n');

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
      throw new Error(`Performance & Thermal assertion failed for: ${testName}`);
    }
  }

  // 1. Test Image Compressor Utilities
  console.log('--- 1. Testing Image Compressor & Byte Estimation ---');
  const { getBase64SizeBytes, formatBytes } = await import('./client/src/utils/imageCompressor.js');

  const testBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(4000);
  const estimatedBytes = getBase64SizeBytes(testBase64);
  assert(estimatedBytes > 0 && estimatedBytes <= 3000, 'Base64 byte size calculation is accurate', `Calculated: ${estimatedBytes} bytes`);

  const formattedKb = formatBytes(45200);
  assert(formattedKb === '44.1 KB', 'Byte formatting helper converts bytes to readable KB/MB', `Output: ${formattedKb}`);

  // 2. Test Debouncing Utility
  console.log('\n--- 2. Testing Event Debouncing & Throttling Engine ---');
  const { debounce, throttle } = await import('./client/src/utils/eventBus.js');

  let debouncedCallCount = 0;
  const testDebouncedFn = debounce(() => {
    debouncedCallCount++;
  }, 50);

  // Trigger 20 rapid calls in a loop
  for (let i = 0; i < 20; i++) {
    testDebouncedFn();
  }

  assert(debouncedCallCount === 0, 'Debounced function holds execution during rapid burst calls');

  // Wait 70ms for debounce timer to fire
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert(debouncedCallCount === 1, 'Debounced function executed exactly once after burst settlement', `Execution Count: ${debouncedCallCount}`);

  // 3. Test ESC/POS Thermal Receipt Generation
  console.log('\n--- 3. Testing ESC/POS Thermal Receipt Layout & Binary Generator ---');
  const {
    buildThermalReceiptHtml,
    generateEscPosBuffer,
    isDirectPrinterSupported,
  } = await import('./client/src/utils/thermalPrinter.js');

  const sampleOrder: Order = {
    id: 'ord-test-101',
    order_code: 'PW-20260823-999',
    service_id: 'srv-vip-01',
    service_name: 'غسيل بريميوم متكامل (VIP Wash & Wax)',
    service_egs_code: 'EG-100234567-SRV-01',
    customer_name: 'أحمد طارق الجندي',
    customer_phone: '01012345678',
    car_plate: 'أ ب ج 1 2 3 4',
    car_type: 'سيدان (Sedan)',
    assigned_employee_name: 'حسن علي مهران',
    payment_method: 'cash',
    subtotal: 307.02,
    tax_rate: 0.14,
    tax_amount: 42.98,
    total_amount: 350.0,
    status: 'completed',
    eta_uuid: 'E9B34821-48C1-4D3A-81FB-988478A308B1',
    eta_status: 'valid',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // 80mm HTML Layout Test
  const html80mm = buildThermalReceiptHtml(sampleOrder, { paperWidth: '80mm' });
  assert(html80mm.includes('مغسلة برايم واش'), 'Thermal 80mm HTML contains Arabic shop branding header');
  assert(html80mm.includes('PW-20260823-999'), 'Thermal 80mm HTML contains order code');
  assert(html80mm.includes('أ ب ج 1 2 3 4'), 'Thermal 80mm HTML contains vehicle plate badge');
  assert(html80mm.includes('350.00'), 'Thermal 80mm HTML contains formatted total amount');
  assert(html80mm.includes('E9B34821-48C1-4D3A-81FB-988478A308B1'), 'Thermal 80mm HTML contains ETA approval UUID');

  // 58mm HTML Layout Test
  const html58mm = buildThermalReceiptHtml(sampleOrder, { paperWidth: '58mm' });
  assert(html58mm.includes('48mm'), 'Thermal 58mm HTML applies compact 48mm printable width constraint');

  // ESC/POS Binary Buffer Test
  const escPosBuffer = generateEscPosBuffer(sampleOrder, {
    cutPaper: true,
    openDrawer: true,
  });

  assert(escPosBuffer instanceof Uint8Array, 'ESC/POS buffer successfully generated as Uint8Array');
  assert(escPosBuffer.length > 50, 'ESC/POS buffer populated with binary command sequences', `Buffer Length: ${escPosBuffer.length} bytes`);

  // Verify ESC @ (Init: 0x1B, 0x40)
  assert(escPosBuffer[0] === 0x1b && escPosBuffer[1] === 0x40, 'ESC/POS contains printer initialization sequence (ESC @: 0x1B 0x40)');

  // Verify GS V 66 0 (Paper Cut: 0x1D, 0x56, 0x42, 0x00)
  const cutIndex = escPosBuffer.findIndex(
    (b, i) =>
      b === 0x1d &&
      escPosBuffer[i + 1] === 0x56 &&
      escPosBuffer[i + 2] === 0x42 &&
      escPosBuffer[i + 3] === 0x00
  );
  assert(cutIndex !== -1, 'ESC/POS contains standard paper cut command (GS V 66 0)');

  // Verify Direct Printer Support Detector
  const support = isDirectPrinterSupported();
  assert(typeof support.serial === 'boolean' && typeof support.bluetooth === 'boolean', 'Direct printer support detector returned boolean status for serial and bluetooth');

  // ----------------------------------------------------
  // Summary
  // ----------------------------------------------------
  console.log('\n========================================================================');
  console.log(`🎉 Performance & Thermal Tests Passed: ${passedTests}/${totalTests} (100% Success)`);
  console.log('========================================================================\n');
}

runPerformanceAndThermalSuite().catch((err) => {
  console.error('Fatal Error during Performance & Thermal Test Execution:', err);
  process.exit(1);
});

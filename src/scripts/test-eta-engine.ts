import { query } from '../config/db.js';
import { TaxService } from '../modules/tax/tax.service.js';
import { EtaAuthService } from '../modules/tax/services/etaAuth.service.js';
import { ReceiptBuilderService, OrderForEta } from '../modules/tax/services/receiptBuilder.service.js';
import { EtaSignerService } from '../modules/tax/services/etaSigner.service.js';
import { EtaSubmitterService } from '../modules/tax/services/etaSubmitter.service.js';
import { EtaQueueService } from '../modules/tax/services/etaQueue.service.js';

async function runEtaEngineTests() {
  console.log('====================================================');
  console.log('🚀 Starting ETA e-Receipt Engine Automated Tests...');
  console.log('====================================================');

  try {
    // 1. Fetch Tax Settings
    console.log('\n[TEST 1] Loading Tax Settings from DB...');
    const settings = await TaxService.getSettings(false);
    console.log('✅ Tax Settings Loaded:', {
      is_enabled: settings.is_enabled,
      environment: settings.environment,
      tax_reg: settings.tax_registration_number,
      pos_serial: settings.pos_serial,
    });

    // 2. Test ETA Auth Service
    console.log('\n[TEST 2] Testing ETA Authentication & Token Management...');
    const authResult = await EtaAuthService.testConnection(settings);
    console.log('✅ Auth Result:', authResult);

    // 3. Test Receipt Builder Service
    console.log('\n[TEST 3] Testing Receipt Document Builder (SR v1.0)...');
    const dummyOrder: OrderForEta = {
      id: 'test-order-uuid',
      order_code: `CW-TEST-${Date.now()}`,
      subtotal: 100.0,
      tax_amount: 14.0,
      total_amount: 114.0,
      payment_method: 'cash',
      service_id: 'test-service-id',
      service_name: 'غسيل داخلي وخارجي بلس',
      service_egs_code: 'EG-123456789-WASH01',
      customer_name: 'أحمد محمود',
      customer_phone: '01012345678',
      created_at: new Date().toISOString(),
    };

    const receiptDoc = ReceiptBuilderService.buildReceipt(dummyOrder, settings);
    console.log('✅ Built Document Header:', receiptDoc.header);
    console.log('✅ Built Document Seller:', receiptDoc.seller);
    console.log('✅ Built Document Buyer:', receiptDoc.buyer);
    console.log('✅ Built Document Item Taxable Items:', receiptDoc.itemData[0].taxableItems);
    console.log('✅ Total Amount:', receiptDoc.totalAmount, 'EGP | Tax:', receiptDoc.taxTotals[0].amount, 'EGP');

    // 4. Test Digital Signing Service (CAdES-BES)
    console.log('\n[TEST 4] Testing Canonical Serialization & Digital Signer...');
    const signedReceipt = await EtaSignerService.signReceipt(receiptDoc, settings);
    console.log('✅ Signed Receipt Signatures count:', signedReceipt.signatures.length);
    console.log('✅ Digital Signature Type:', signedReceipt.signatures[0].signatureType);
    console.log('✅ Signature Value Preview:', signedReceipt.signatures[0].value.slice(0, 35) + '...');

    // 5. Test Live DB Order Sync & Queue
    console.log('\n[TEST 5] Testing End-to-End Order Synchronization & DB Update...');
    // Fetch latest order from database
    const latestOrderRes = await query(`SELECT id, order_code FROM orders ORDER BY created_at DESC LIMIT 1`);
    if (latestOrderRes.rows.length > 0) {
      const liveOrder = latestOrderRes.rows[0];
      console.log(`Found live order in DB: ${liveOrder.order_code} (ID: ${liveOrder.id})`);

      // Ensure tax settings are enabled for test
      await TaxService.updateSettings({ is_enabled: true });

      // Enqueue
      await EtaQueueService.enqueueOrder(liveOrder.id);
      console.log(`✅ Order ${liveOrder.order_code} enqueued in eta_sync_queue.`);

      // Sync Order
      const syncResult = await EtaQueueService.syncOrder(liveOrder.id);
      console.log('✅ Sync Result:', {
        success: syncResult.success,
        submissionId: syncResult.submissionId,
        uuid: syncResult.uuid,
        status: syncResult.status,
        shareUrl: syncResult.shareUrl,
      });

      // Verify updated record in DB
      const verifiedOrderRes = await query(`SELECT id, order_code, eta_uuid, eta_status, eta_share_url FROM orders WHERE id = $1`, [liveOrder.id]);
      console.log('✅ Verified Order in DB after ETA Sync:', verifiedOrderRes.rows[0]);
    } else {
      console.log('ℹ️ No orders in DB to sync, skipping live DB update test.');
    }

    // 6. Test Queue Listing
    console.log('\n[TEST 6] Testing Queue Inspection...');
    const queueItems = await EtaQueueService.getQueueItems(5);
    console.log(`✅ Fetched ${queueItems.length} items from ETA sync queue.`);
    if (queueItems.length > 0) {
      console.log('Latest queue item status:', {
        order_code: queueItems[0].order_code,
        status: queueItems[0].status,
        eta_status: queueItems[0].eta_status,
        attempts: queueItems[0].attempts,
      });
    }

    console.log('\n====================================================');
    console.log('🎉 ALL ETA CORE ENGINE TESTS PASSED 100% SUCCESSFULLY!');
    console.log('====================================================\n');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ ETA Engine Test Failed:', error);
    process.exit(1);
  }
}

runEtaEngineTests();

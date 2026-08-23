import { DashboardService } from '../modules/dashboard/dashboard.service.js';
import { TaxService } from '../modules/tax/tax.service.js';
import { pool } from '../config/db.js';

async function test() {
  console.log('--- 1. Testing Tax Settings with eta_sync_enabled ---');
  const settings = await TaxService.getSettings(true);
  console.log('Settings:', settings);

  console.log('\n--- 2. Testing Monthly VAT Report ---');
  const vatReport = await DashboardService.getMonthlyVatReport();
  console.log('VAT Report Period:', vatReport.period);
  console.log('VAT Report Summary:', vatReport.summary);
  console.log('VAT Report Invoices Count:', vatReport.invoices.length);
  console.log('VAT Report Service Breakdown Count:', vatReport.service_breakdown.length);
  console.log('VAT Report Payment Breakdown:', vatReport.payment_breakdown);

  console.log('\n--- 3. Testing Raw Material Consumption Report ---');
  const matReport = await DashboardService.getRawMaterialConsumptionReport();
  console.log('Material Report Period:', matReport.period);
  console.log('Total Completed Washes:', matReport.total_completed_washes);
  console.log('Total Grams Consumed:', matReport.total_grams_consumed);
  console.log('Total Cost EGP:', matReport.total_cost_egp);
  console.log('Materials Count:', matReport.materials.length);
  console.log('Materials Summary Sample:', matReport.materials.slice(0, 3));

  console.log('\n✅ All report services executed successfully with 0 errors!');
  await pool.end();
}

test().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

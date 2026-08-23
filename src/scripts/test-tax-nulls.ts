import dotenv from 'dotenv';
dotenv.config();

import { pool } from '../config/db.js';
import { TaxService } from '../modules/tax/tax.service.js';

async function testTaxSettings() {
  console.log('Testing TaxService.updateSettings with nulls and toggles...');
  try {
    const updated = await TaxService.updateSettings({
      is_enabled: true,
      eta_sync_enabled: false,
      client_id: null,
      client_secret: null,
      tax_registration_number: null,
      remote_signer_token: null,
    });
    console.log('✅ Updated successfully with null credentials:', updated);

    const toggleOff = await TaxService.updateSettings({
      is_enabled: false,
      eta_sync_enabled: false,
    });
    console.log('✅ Toggled off successfully:', toggleOff.is_enabled);
  } catch (err) {
    console.error('❌ Tax settings test failed:', err);
  } finally {
    await pool.end();
  }
}

testTaxSettings();

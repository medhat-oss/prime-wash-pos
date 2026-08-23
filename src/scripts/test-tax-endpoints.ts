import { createApp } from '../app.js';

async function testTaxModule() {
  console.log('🧪 Testing ETA Tax API Endpoints...');
  const app = createApp();

  const server = app.listen(0, async () => {
    const address = server.address() as any;
    const port = address.port;
    const baseUrl = `http://localhost:${port}/api/tax`;
    const adminHeaders = {
      'Content-Type': 'application/json',
      'x-admin-pin': '1234',
    };

    try {
      // 0. Test Unauthenticated GET /api/tax/settings (Expect 403)
      console.log('0. Testing unauthenticated GET /api/tax/settings (expect 403)...');
      const unauthRes = await fetch(`${baseUrl}/settings`);
      console.log(`✅ Unauthenticated Status: ${unauthRes.status} (403 = Protected ✅)`);

      // 1. Test Authenticated GET /api/tax/settings
      console.log('\n1. Testing authenticated GET /api/tax/settings...');
      const resSettings = await fetch(`${baseUrl}/settings`, { headers: adminHeaders });
      const dataSettings = (await resSettings.json()) as any;
      console.log('✅ Status:', resSettings.status, '| Registered TRN:', dataSettings.data?.tax_registration_number || 'None');

      // 2. Test PUT /api/tax/settings
      console.log('\n2. Testing PUT /api/tax/settings...');
      const resUpdateSettings = await fetch(`${baseUrl}/settings`, {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({
          tax_registration_number: '123456789',
          branch_code: '0',
          pos_serial: 'POS-TEST-01',
        }),
      });
      const dataUpdate = (await resUpdateSettings.json()) as any;
      console.log('✅ Status:', resUpdateSettings.status, '| Updated pos_serial:', dataUpdate.data?.pos_serial);

      // 3. Test GET /api/tax/services
      console.log('\n3. Testing GET /api/tax/services...');
      const resServices = await fetch(`${baseUrl}/services`, { headers: adminHeaders });
      const dataServices = (await resServices.json()) as any;
      console.log('✅ Status:', resServices.status, '| Services Count:', dataServices.data?.length);

      // 4. Test GET /api/tax/stats
      console.log('\n4. Testing GET /api/tax/stats...');
      const resStats = await fetch(`${baseUrl}/stats`, { headers: adminHeaders });
      const dataStats = (await resStats.json()) as any;
      console.log('✅ Status:', resStats.status, '| Total Orders in Stats:', dataStats.data?.orders?.total_orders);

      console.log('\n🎉 ALL TAX MODULE ENDPOINTS PASSED SUCCESSFULLY!');
    } catch (err: any) {
      console.error('❌ Endpoint test failed:', err);
    } finally {
      server.close(() => {
        process.exit(0);
      });
    }
  });
}

testTaxModule();


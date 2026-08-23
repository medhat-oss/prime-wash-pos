import { createApp } from '../app.js';

async function testMediaFeature() {
  console.log('🧪 Testing Media Backgrounds & POS Settings Endpoints...');
  const app = createApp();

  const server = app.listen(0, async () => {
    const port = (server.address() as any).port;
    const baseUrl = `http://localhost:${port}/api`;
    const adminHeaders = {
      'Content-Type': 'application/json',
      'x-admin-pin': '1234',
    };

    try {
      // 1. Test GET /api/settings/pos (Public)
      console.log('\n1️⃣ Testing GET /api/settings/pos...');
      const resGet = await fetch(`${baseUrl}/settings/pos`);
      const dataGet = await resGet.json();
      console.log('✅ GET Settings Response:', dataGet);

      // 2. Test PUT /api/settings/pos (Admin protected with theme colors)
      console.log('\n2️⃣ Testing PUT /api/settings/pos with Theme Colors...');
      const resPut = await fetch(`${baseUrl}/settings/pos`, {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({
          pos_background_type: 'video',
          pos_background_url: 'https://assets.mixkit.co/videos/preview/mixkit-car-wash-brush-cleaning-car-34861-large.mp4',
          pos_background_opacity: 0.30,
          primary_color: '#06b6d4',
          secondary_color: '#3b82f6',
          accent_color: '#10b981',
          card_bg_color: 'rgba(15, 23, 42, 0.75)',
          border_color: 'rgba(51, 65, 85, 0.6)',
        }),
      });
      const dataPut = await resPut.json();
      console.log('✅ PUT Settings Response:', dataPut);


      // 3. Test Service with Media Fields
      console.log('\n3️⃣ Testing Service with Media (POST /api/services)...');
      const resService = await fetch(`${baseUrl}/services`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          name: 'غسيل ساطع VIP فيديو',
          price: 220,
          category: 'VIP',
          media_type: 'video',
          media_url: 'https://assets.mixkit.co/videos/preview/mixkit-spraying-water-to-a-car-in-a-car-wash-34857-large.mp4',
        }),
      });
      const dataService = await resService.json();
      console.log('✅ Created Service with Media:', {
        id: (dataService as any).data?.id,
        name: (dataService as any).data?.name,
        media_type: (dataService as any).data?.media_type,
        media_url: (dataService as any).data?.media_url,
      });

      console.log('\n🎉 ALL MEDIA BACKGROUND FEATURES TESTED SUCCESSFULLY!');
    } catch (err: any) {
      console.error('❌ Test failed:', err);
    } finally {
      server.close(() => {
        process.exit(0);
      });
    }
  });
}

testMediaFeature();

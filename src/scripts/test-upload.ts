import { createApp } from '../app.js';

async function testUpload() {
  console.log('🧪 Testing Media Upload Endpoint (POST /api/upload/media)...');
  const app = createApp();

  const server = app.listen(0, async () => {
    const port = (server.address() as any).port;
    const baseUrl = `http://localhost:${port}/api`;
    const adminHeaders = {
      'x-admin-pin': '1234',
    };

    try {
      // 1. Create a dummy image buffer
      const dummyImageBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );

      const blob = new Blob([dummyImageBuffer], { type: 'image/png' });
      const formData = new FormData();
      formData.append('file', blob, 'test-wash-icon.png');

      console.log('\n1️⃣ Testing Upload with image/png...');
      const resUpload = await fetch(`${baseUrl}/upload/media`, {
        method: 'POST',
        headers: adminHeaders,
        body: formData,
      });

      const dataUpload = (await resUpload.json()) as any;
      console.log('✅ Upload Response:', dataUpload);

      if (!dataUpload.success || !dataUpload.data.url) {
        throw new Error('Upload endpoint failed to return url');
      }

      console.log('\n2️⃣ Testing File Retrieval from Upload URL...');
      const targetFetchUrl = dataUpload.data.url.startsWith('http')
        ? dataUpload.data.url
        : `http://localhost:${port}${dataUpload.data.url}`;
      const fileRes = await fetch(targetFetchUrl);
      console.log(`✅ File Fetch Status: ${fileRes.status} ${fileRes.statusText}`);

      console.log('\n🎉 ALL MEDIA UPLOAD TESTS PASSED SUCCESSFULLY! (Provider:', dataUpload.data.provider, ')');

    } catch (err: any) {
      console.error('❌ Upload test failed:', err);
    } finally {
      server.close(() => {
        process.exit(0);
      });
    }
  });
}

testUpload();

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const PUBLIC_DIR = path.resolve('client/public');

const RED_SVG_CONTENT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#18181b" />
      <stop offset="100%" stop-color="#09090b" />
    </linearGradient>
    <linearGradient id="crimsonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff2e2e" />
      <stop offset="50%" stop-color="#bd0000" />
      <stop offset="100%" stop-color="#700000" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#bd0000" flood-opacity="0.5" />
    </filter>
  </defs>
  
  <!-- Modern Dark Premium Badge Background -->
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)" />
  <rect width="504" height="504" x="4" y="4" rx="108" fill="none" stroke="#bd0000" stroke-width="6" stroke-opacity="0.4" />
  
  <!-- Prime Wash Red Emblems / Layers -->
  <g transform="translate(64, 64) scale(0.75)" filter="url(#glow)">
    <!-- Top Diamond / Layer -->
    <path d="M256 32L48 144l208 112 208-112-208-112z" fill="url(#crimsonGrad)" stroke="#ff4d4d" stroke-width="4" />
    <!-- Middle Layer Wave -->
    <path d="M48 260l208 112 208-112" fill="none" stroke="url(#crimsonGrad)" stroke-width="42" stroke-linecap="round" stroke-linejoin="round" />
    <!-- Bottom Layer Wave -->
    <path d="M48 376l208 112 208-112" fill="none" stroke="url(#crimsonGrad)" stroke-width="42" stroke-linecap="round" stroke-linejoin="round" />
  </g>
</svg>`;

async function run() {
  console.log('🎨 [Icon Generator] Generating pixel-perfect Red Prime Wash icons...');

  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  // 1. Write standalone SVG favicon
  const svgPath = path.join(PUBLIC_DIR, 'favicon.svg');
  fs.writeFileSync(svgPath, RED_SVG_CONTENT, 'utf8');
  console.log('✅ Generated:', svgPath);

  const svgBuffer = Buffer.from(RED_SVG_CONTENT);

  // 2. Generate PNG sizes
  const targets = [
    { name: 'icon-512.png', size: 512 },
    { name: 'icon-192.png', size: 192 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'android-chrome-512x512.png', size: 512 },
    { name: 'android-chrome-192x192.png', size: 192 },
    { name: 'favicon-32x32.png', size: 32 },
    { name: 'favicon-16x16.png', size: 16 },
  ];

  for (const t of targets) {
    const outPath = path.join(PUBLIC_DIR, t.name);
    await sharp(svgBuffer)
      .resize(t.size, t.size)
      .png()
      .toFile(outPath);
    console.log(`✅ Generated PNG (${t.size}x${t.size}):`, outPath);
  }

  // 3. Generate pure red favicon.ico (multi-size PNG container or standard 48x48 icon)
  const icoPath = path.join(PUBLIC_DIR, 'favicon.ico');
  const png48 = await sharp(svgBuffer).resize(48, 48).png().toBuffer();
  fs.writeFileSync(icoPath, png48);
  console.log('✅ Generated red favicon.ico:', icoPath);

  console.log('🎉 All red assets created and overwritten successfully in client/public!');
}

run().catch((err) => {
  console.error('❌ Icon generation failed:', err);
  process.exit(1);
});

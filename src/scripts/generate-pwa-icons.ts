import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createCRC32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[n] = c;
  }
  return table;
}

const crcTable = createCRC32Table();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const len = data.length;
  const chunk = Buffer.alloc(8 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crc = crc32(chunk.subarray(4, 8 + len));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function generatePngBuffer(size: number): Buffer {
  // Raw scanlines: each line starts with filter type 0x00 followed by size * 4 (RGBA) bytes
  const bytesPerLine = 1 + size * 4;
  const rawData = Buffer.alloc(bytesPerLine * size);

  const center = size / 2;
  const radius = size * 0.44;

  for (let y = 0; y < size; y++) {
    const lineOffset = y * bytesPerLine;
    rawData[lineOffset] = 0; // Filter: None

    for (let x = 0; x < size; x++) {
      const pixelOffset = lineOffset + 1 + x * 4;
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Gradient background from Cyan (#06b6d4) to Blue (#2563eb)
      const gradFactor = (x + y) / (size * 2);
      const r = Math.round(6 + gradFactor * (37 - 6));
      const g = Math.round(182 + gradFactor * (99 - 182));
      const b = Math.round(212 + gradFactor * (235 - 212));

      // Rounded app icon shape
      const cornerRadius = size * 0.22;
      const inBoxX = Math.abs(x - center) <= center - cornerRadius;
      const inBoxY = Math.abs(y - center) <= center - cornerRadius;
      const cornerDx = Math.max(0, Math.abs(x - center) - (center - cornerRadius));
      const cornerDy = Math.max(0, Math.abs(y - center) - (center - cornerRadius));
      const cornerDist = Math.sqrt(cornerDx * cornerDx + cornerDy * cornerDy);

      if (inBoxX || inBoxY || cornerDist <= cornerRadius) {
        // Car / Wash center highlight
        const inCarBody =
          y >= size * 0.42 &&
          y <= size * 0.65 &&
          x >= size * 0.22 &&
          x <= size * 0.78;
        const inCarRoof =
          y >= size * 0.28 &&
          y <= size * 0.44 &&
          x >= size * 0.35 &&
          x <= size * 0.65;
        const inWheel1 = Math.sqrt((x - size * 0.35) ** 2 + (y - size * 0.68) ** 2) <= size * 0.08;
        const inWheel2 = Math.sqrt((x - size * 0.65) ** 2 + (y - size * 0.68) ** 2) <= size * 0.08;

        if (inCarBody || inCarRoof || inWheel1 || inWheel2) {
          // White Icon
          rawData[pixelOffset] = 255;
          rawData[pixelOffset + 1] = 255;
          rawData[pixelOffset + 2] = 255;
          rawData[pixelOffset + 3] = 255;
        } else {
          rawData[pixelOffset] = r;
          rawData[pixelOffset + 1] = g;
          rawData[pixelOffset + 2] = b;
          rawData[pixelOffset + 3] = 255;
        }
      } else {
        // Transparent outside rounded icon
        rawData[pixelOffset] = 0;
        rawData[pixelOffset + 1] = 0;
        rawData[pixelOffset + 2] = 0;
        rawData[pixelOffset + 3] = 0;
      }
    }
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0); // width
  ihdrData.writeUInt32BE(size, 4); // height
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = makeChunk('IHDR', ihdrData);

  const compressedData = zlib.deflateSync(rawData);
  const idat = makeChunk('IDAT', compressedData);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function main() {
  const publicDir = path.resolve('client/public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  console.log('Generating PWA PNG icons in', publicDir);

  const icon192 = generatePngBuffer(192);
  fs.writeFileSync(path.join(publicDir, 'icon-192.png'), icon192);
  console.log('✅ Created icon-192.png (', icon192.length, 'bytes)');

  const icon512 = generatePngBuffer(512);
  fs.writeFileSync(path.join(publicDir, 'icon-512.png'), icon512);
  console.log('✅ Created icon-512.png (', icon512.length, 'bytes)');

  fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), icon192);
  console.log('✅ Created apple-touch-icon.png');

  // Also write favicon.svg
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#06b6d4" />
      <stop offset="100%" stop-color="#2563eb" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="128" fill="url(#grad)" />
  <path d="M140 330 h232 c16 0 28 -12 28 -28 v-50 c0 -18 -12 -34 -30 -38 l-36 -12 -38 -52 c-8 -11 -20 -18 -34 -18 H186 c-14 0 -26 7 -34 18 l-38 52 -36 12 c-18 4 -30 20 -30 38 v50 c0 16 12 28 28 28 h24" fill="none" stroke="#ffffff" stroke-width="26" stroke-linecap="round" stroke-linejoin="round" />
  <circle cx="170" cy="340" r="36" fill="#ffffff" />
  <circle cx="342" cy="340" r="36" fill="#ffffff" />
  <path d="M210 340 h92" stroke="#ffffff" stroke-width="26" stroke-linecap="round" />
  <path d="M256 90 v40 M210 100 l20 35 M302 100 l-20 35" stroke="#ffffff" stroke-width="18" stroke-linecap="round" />
</svg>`;
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgContent);
  console.log('✅ Created favicon.svg');
}

main();

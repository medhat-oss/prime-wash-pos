import fs from 'fs';
import path from 'path';

/**
 * Synchronizes client/dist build output into root dist directory
 * Ensures zero 404s and SPA parity whether deploying `dist` or `client/dist`.
 */
function copyDirSync(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

try {
  const clientDist = path.resolve(process.cwd(), 'client', 'dist');
  const rootDist = path.resolve(process.cwd(), 'dist');

  if (fs.existsSync(clientDist)) {
    copyDirSync(clientDist, rootDist);
    console.log('✅ Synchronized client/dist assets into root dist/ for unified Cloudflare Pages deployment.');
  }
} catch (err) {
  console.error('❌ Failed to sync dist directories:', err);
}

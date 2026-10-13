import fs from 'fs';
import path from 'path';

const source = path.resolve(process.cwd(), 'client', 'functions', 'api', '[[route]].ts');
const targetDir = path.resolve(process.cwd(), 'functions', 'api');
const target = path.resolve(targetDir, '[[route]].ts');

try {
  if (fs.existsSync(source)) {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.copyFileSync(source, target);
    console.log('✅ Synchronized Cloudflare Pages functions: client/functions -> functions');
  } else {
    console.warn('⚠️ Source function client/functions/api/[[route]].ts not found');
  }
} catch (err) {
  console.error('❌ Failed to sync functions:', err);
}

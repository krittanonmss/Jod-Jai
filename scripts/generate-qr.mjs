import qrcode from 'qrcode';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(__dirname);
const publicDir = path.join(root, 'public');
const qrPath = path.join(publicDir, 'line-oa-qr.svg');

await mkdir(publicDir, { recursive: true });

const lineUrl = 'https://line.me/R/ti/p/@332nhscs';
const svg = await qrcode.toString(lineUrl, {
  type: 'svg',
  width: 200,
  margin: 2,
  color: { dark: '#126858', light: '#F7FBF6' }
});

await writeFile(qrPath, svg);
console.log('QR code generated at', qrPath);

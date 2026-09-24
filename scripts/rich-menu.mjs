import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
process.chdir(root);
process.env.XDG_CACHE_HOME ||= '/tmp/jod-jai-font-cache';
try { process.loadEnvFile('.env.local'); } catch {}
const { default: sharp } = await import('sharp');

const outDir = 'example-slip';
const richMenuImage = path.join(outDir, 'jod-jai-rich-menu.jpg');
const richMenuSpec = path.join(outDir, 'jod-jai-rich-menu.json');
const W = 2500;
const H = 1686;
const rowH = 843;
const columns = [0, 833, 1667, 2500];

function esc(value) {
 return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
}

const menuItems = [
 { title: 'ส่งสลิป', subtitle: 'ถ่ายหรือแนบรูปสลิป', command: 'ส่งสลิป', icon: 'receipt', tone: '#126858' },
 { title: 'เพิ่มรายการ', subtitle: 'กรอกค่าใช้จ่ายเอง', command: 'เพิ่มรายการ', icon: 'plus', tone: '#E26D5A' },
 { title: 'ดูรายการ', subtitle: 'รายรับ/รายจ่าย', command: 'ดูรายรับรายจ่าย', icon: 'list', tone: '#2E7D6B' },
 { title: 'สรุปวันนี้', subtitle: 'ยอดใช้จ่ายวันนี้', command: 'สรุปวันนี้', icon: 'sun', tone: '#D99A2B' },
 { title: 'สรุปเดือนนี้', subtitle: 'รวมตามหมวดหมู่', command: 'สรุปเดือนนี้', icon: 'chart', tone: '#547C78' },
 { title: 'ช่วยเหลือ', subtitle: 'ดูวิธีใช้ Jod-Jai', command: 'ช่วยเหลือ', icon: 'help', tone: '#6B8F71' },
];

function iconSvg(type, x, y, color) {
 const p = { fill: 'none', stroke: color, sw: 13, cap: 'round', join: 'round' };
 const a = `fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.sw}" stroke-linecap="${p.cap}" stroke-linejoin="${p.join}"`;
 if (type === 'receipt') return `<path ${a} d="M${x+32} ${y+20}h112v150l-20-13-20 13-20-13-20 13-20-13-12 8z"/><path ${a} d="M${x+58} ${y+63}h60M${x+58} ${y+96}h76M${x+58} ${y+129}h48"/>`;
 if (type === 'plus') return `<circle ${a} cx="${x+88}" cy="${y+94}" r="72"/><path ${a} d="M${x+88} ${y+54}v80M${x+48} ${y+94}h80"/>`;
 if (type === 'list') return `<rect ${a} x="${x+31}" y="${y+32}" width="116" height="126" rx="18"/><path ${a} d="M${x+61} ${y+70}h58M${x+61} ${y+101}h58M${x+61} ${y+132}h58"/>`;
 if (type === 'sun') return `<circle ${a} cx="${x+88}" cy="${y+94}" r="42"/><path ${a} d="M${x+88} ${y+16}v25M${x+88} ${y+147}v25M${x+10} ${y+94}h25M${x+141} ${y+94}h25M${x+33} ${y+39}l18 18M${x+125} ${y+131}l18 18M${x+143} ${y+39}l-18 18M${x+51} ${y+131}l-18 18"/>`;
 if (type === 'chart') return `<path ${a} d="M${x+34} ${y+154}h120"/><rect ${a} x="${x+49}" y="${y+88}" width="24" height="66" rx="8"/><rect ${a} x="${x+83}" y="${y+54}" width="24" height="100" rx="8"/><rect ${a} x="${x+117}" y="${y+24}" width="24" height="130" rx="8"/>`;
 return `<circle ${a} cx="${x+88}" cy="${y+94}" r="70"/><path ${a} d="M${x+68} ${y+70}c6-22 46-25 51 2 5 26-31 27-31 55M${x+88} ${y+148}v2"/>`;
}

function menuSvg() {
 const cells = menuItems.map((item, i) => {
  const col = i % 3;
  const row = Math.floor(i / 3);
  const x = columns[col] + 42;
  const y = row * rowH + 46;
  const w = columns[col + 1] - columns[col] - 84;
  const h = rowH - 92;
  return `<g>
   <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="54" fill="#FFFFFF" fill-opacity="0.88"/>
   <rect x="${x+18}" y="${y+18}" width="${w-36}" height="${h-36}" rx="42" fill="none" stroke="${item.tone}" stroke-opacity="0.20" stroke-width="5"/>
   <circle cx="${x+w/2}" cy="${y+212}" r="126" fill="${item.tone}" fill-opacity="0.12"/>
   ${iconSvg(item.icon, x + w / 2 - 88, y + 118, item.tone)}
   <text x="${x+w/2}" y="${y+415}" text-anchor="middle" font-family="Noto Sans Thai, Noto Sans, sans-serif" font-size="82" font-weight="700" fill="#163D37">${esc(item.title)}</text>
   <text x="${x+w/2}" y="${y+505}" text-anchor="middle" font-family="Noto Sans Thai, Noto Sans, sans-serif" font-size="42" font-weight="500" fill="#55736D">${esc(item.subtitle)}</text>
   <path d="M${x+220} ${y+h-118}h${w-440}" stroke="${item.tone}" stroke-opacity="0.32" stroke-width="6" stroke-linecap="round"/>
  </g>`;
 }).join('\n');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#F7FBF6"/>
  <path d="M0 0h${W}v${H}H0z" fill="#F7FBF6" fill-opacity="0.50"/>
  <path d="M90 88c360 70 520-80 850-10 340 72 500 250 900 108 270-95 420 8 570 130" fill="none" stroke="#DCECE6" stroke-width="54" stroke-linecap="round" opacity="0.72"/>
  <path d="M-80 1540c270-168 590-122 870-40 330 97 590 128 930-40 250-123 520-103 850 28" fill="none" stroke="#F4D5CA" stroke-width="74" stroke-linecap="round" opacity="0.62"/>
  ${cells}
 </svg>`;
}

function richMenuObject() {
 const areas = menuItems.map((item, i) => {
  const col = i % 3;
  const row = Math.floor(i / 3);
  return {
   bounds: { x: columns[col], y: row * rowH, width: columns[col + 1] - columns[col], height: rowH },
   action: { type: 'message', text: item.command },
  };
 });
 return {
  size: { width: W, height: H },
  selected: true,
  name: 'Jod-Jai main menu',
  chatBarText: 'เมนู Jod-Jai',
  areas,
 };
}

export async function build() {
 await mkdir(outDir, { recursive: true });
 const composites = [];
 if (existsSync(path.join(outDir, 'jod-jai-line-background.png'))) {
  const background = await sharp(path.join(outDir, 'jod-jai-line-background.png')).resize(W, H, { fit: 'cover' }).blur(1.4).modulate({ saturation: 0.82, brightness: 1.05 }).jpeg({ quality: 88 }).toBuffer();
  composites.push({ input: background, left: 0, top: 0 });
 }
 composites.push({ input: Buffer.from(menuSvg()), left: 0, top: 0 });
 if (existsSync(path.join(outDir, 'jod-jai-line-logo.png'))) {
  const logo = await sharp(path.join(outDir, 'jod-jai-line-logo.png')).resize(154, 154).png().toBuffer();
  composites.push({ input: logo, left: 1173, top: 766 });
 }
 await sharp({ create: { width: W, height: H, channels: 3, background: '#F7FBF6' } })
  .composite(composites)
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile(richMenuImage);
 await writeFile(richMenuSpec, JSON.stringify(richMenuObject(), null, 2));
 const meta = await sharp(richMenuImage).metadata();
 console.log(JSON.stringify({ image: richMenuImage, spec: richMenuSpec, width: meta.width, height: meta.height, bytes: meta.size }, null, 2));
}

async function lineApi(url, options = {}) {
 const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
 if (!token) throw new Error('Missing LINE_CHANNEL_ACCESS_TOKEN');
 const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers }, signal: AbortSignal.timeout(60000) });
 if (!response.ok) throw new Error(`LINE API ${new URL(url).pathname}: HTTP ${response.status} ${await response.text()}`);
 return response.status === 204 ? null : response.json();
}

export async function apply() {
 await build();
 const info = await lineApi('https://api.line.me/v2/bot/info');
 if (info.basicId !== '@332nhscs') throw new Error(`Unexpected LINE OA: ${info.basicId}`);
 const menu = JSON.parse(await readFile(richMenuSpec, 'utf8'));
 const created = await lineApi('https://api.line.me/v2/bot/richmenu', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(menu),
 });
 const image = await readFile(richMenuImage);
 await lineApi(`https://api-data.line.me/v2/bot/richmenu/${created.richMenuId}/content`, {
  method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: image,
 });
 await lineApi(`https://api.line.me/v2/bot/user/all/richmenu/${created.richMenuId}`, { method: 'POST' });
 await writeFile(path.join(outDir, 'jod-jai-rich-menu-id.txt'), created.richMenuId + '\n');
 console.log(JSON.stringify({ richMenuId: created.richMenuId, default: true }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
 const action = process.argv[2] || 'build';
 try {
  if (action === 'build') await build();
  else if (action === 'apply') await apply();
  else throw new Error('Usage: node scripts/rich-menu.mjs [build|apply]');
 } catch (error) {
  console.error(error.message);
  process.exitCode = 1;
 }
}

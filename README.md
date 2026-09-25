# Jod-Jai — จดใจ

ระบบจดรายจ่ายส่วนตัวผ่าน LINE OA `@332nhscs` บน Next.js / Vercel และ Supabase PostgreSQL

- เว็บไซต์: https://jod-jai.vercel.app
- LINE OA: `@332nhscs`
- Production webhook: `https://jod-jai.vercel.app/api/line/webhook`

Jod-Jai ออกแบบไว้เป็นบอทส่วนตัวสำหรับส่งสลิปเข้า LINE แล้วให้ระบบอ่านข้อมูลพื้นฐาน ถามรายละเอียดที่ขาด และให้เจ้าของกดยืนยันก่อนบันทึกจริง เหมาะกับการจดรายจ่ายประจำวันแบบไม่ต้องเปิดแอปบัญชีแยกอีกตัว

## สิ่งที่ระบบทำได้

1. ส่งภาพสลิปเต็มจากเป๋าตัง, MAKE by KBank, Bangkok Bank หรือ SCB
2. อ่านในเซิร์ฟเวอร์ด้วย Tesseract ภาษาไทย/อังกฤษและกฎตามแบบสลิป ไม่มี AI API และไม่ต้องใช้ OCR API key
3. สร้าง **รายการร่าง** อ่านยอดจ่ายจริง วันเวลา ผู้รับ หมายเหตุ และเลขอ้างอิงเท่าที่อ่านได้
4. ใช้หมายเหตุเป็นรายละเอียดก่อน ถ้ายังไม่ทราบยอด/วันเวลา/รายละเอียด ให้ถามเติม ตอบตรง ๆ ได้เมื่อมีรายการค้างเพียงรายการเดียว และใช้ `#รหัสรายการ คำตอบ` เฉพาะเมื่อต้องแยกหลายสลิป
5. แสดงสรุปพร้อมปุ่ม **ยืนยันและบันทึก / แก้ไข / ยกเลิก** รายการร่างไม่นับในยอด
6. คำนวณสรุปเฉพาะรายการยืนยัน ป้องกันการยืนยันซ้ำและปุ่มเก่าหลังแก้ไข

คำสั่งหลัก: `ส่งสลิป`, `เพิ่มรายการ`, `ดูรายรับรายจ่าย`, `รายการค้าง`, `สรุปวันนี้`, `สรุปเดือนนี้`, `รายการล่าสุด`, `แก้รายการล่าสุด`, `ลบรายการล่าสุด`, `ส่งออกข้อมูล`, `ล้างประวัติ`, `ช่วยเหลือ`

หน้าสรุปทั้งสามแบบแสดงเป็น LINE Flex Message ที่อ่านง่ายบนมือถือ ผู้ใช้แก้หรือลบรายการล่าสุดได้โดยมีขั้นยืนยันก่อนลบ ส่งออกประวัติที่ยืนยันแล้วทั้งหมดเป็น CSV ผ่านลิงก์ส่วนตัวที่หมดอายุใน 10 นาที และล้างประวัติของตนเองได้โดยไม่ลบสิทธิ์เจ้าของบัญชี

Rich Menu ปัจจุบันมี 6 ปุ่ม: ส่งสลิป, เพิ่มรายการ, ดูรายการ, สรุปวันนี้, สรุปเดือนนี้ และช่วยเหลือ ภาพ Rich Menu สร้างจากโทนเดียวกับโลโก้/พื้นหลังของ LINE OA และเก็บไว้ใน `example-slip/` เฉพาะเครื่องผู้พัฒนา

`เพิ่มรายการ` ใช้จดรายจ่ายเองโดยไม่ต้องมีสลิป ถ้าพิมพ์ `เพิ่มรายการ 45 ค่าอาหาร` ระบบจะเติมยอดและรายละเอียดให้ก่อนพาไปยืนยัน รายรับยังไม่ได้เปิด logic จริงในรุ่นนี้ ปุ่มดูรายการจะแสดงรายจ่ายล่าสุดและบอกสถานะรายรับไว้ก่อน

ทุกสลิปถือเป็นรายจ่ายตามขอบเขตที่ตกลง ไม่พยายามแยกรายรับหรือโอนภายใน เป๋าตังใช้ยอดจ่ายสุทธิ (ตัวอย่าง 55 - 33 = 22 บาท) ค่าธรรมเนียมแสดงแยกจากยอดธุรกรรม ผู้ใช้แก้ยอดให้รวมค่าธรรมเนียมได้ก่อนยืนยัน

## เริ่มต้น

```sh
npm ci
cp .env.example .env.local  # เฉพาะกรณียังไม่มีไฟล์ ห้ามทับไฟล์เดิม
npm run dev
```

Node.js บน Vercel ใช้รุ่นตามค่าเริ่มต้นของโปรเจกต์ (local รองรับ Node.js >=20.19 พร้อม ws transport)

### ค่าที่ Backend ต้องใช้

| ตัวแปร | ที่มา |
|---|---|
| `SUPABASE_URL` | URL ของโปรเจกต์ |
| `SUPABASE_SECRET_KEY` | Secret API key ของ Supabase ใช้เฉพาะ server |
| `LINE_CHANNEL_SECRET` | LINE Developers → Basic settings |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers → Messaging API |
| `LINE_PAIRING_CODE` | bootstrap สร้างรหัสใช้ครั้งเดียว ส่ง `เชื่อมต่อ <รหัส>` ในแชต OA เพื่อผูกเจ้าของ |
| `LINE_ALLOWED_USER_IDS` | ทางเลือก: กำหนด User ID เอง หลายคนคั่นด้วย comma |
| `CRON_SECRET` | ค่าสุ่มสำหรับ worker; script bootstrap สร้างให้ |
| `APP_URL` | URL production สำหรับสร้างลิงก์ดาวน์โหลด CSV; ค่าเริ่มต้นคือเว็บไซต์ Jod-Jai |
| `RETENTION_MONTHS` | อายุข้อมูลก่อนลบอัตโนมัติ ค่าเริ่มต้น 6 เดือน |

ถ้า `LINE_ALLOWED_USER_IDS` ว่าง ระบบจะรับเฉพาะเจ้าของที่เชื่อมบัญชีด้วยรหัสครั้งเดียว มีเจ้าของได้หนึ่งคนและผู้อื่นแย่งลงทะเบียนซ้ำไม่ได้ หากยังไม่เชื่อมบัญชี จะรับเฉพาะคำสั่งเชื่อมต่อที่รหัสถูกต้อง ไม่เก็บรหัสเชื่อมต่อในคิวงาน ใช้เฉพาะแชตส่วนตัวกับ OA

### ติดตั้ง Supabase / Vercel

ค่าจัดการระบบ `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `VERCEL_TOKEN` อยู่ใน `.env.local` เฉพาะเครื่องผู้พัฒนา **ห้ามนำขึ้น runtime ของ Vercel**

```sh
node scripts/manage.mjs bootstrap
npm run db:migrate
npm run setup:check
npm test
npm run test:db
node --import tsx scripts/test-flow.ts # ทดสอบ flow กับ DB จริง จำลอง LINE ไม่ส่งข้อความ
npm run build
npm run deploy
node scripts/manage.mjs status
node scripts/manage.mjs cron
```

Deploy script ส่งเฉพาะโค้ด app/lib และไฟล์ build ที่ระบุชัดเจน ไม่อัปโหลด `.env.local`, ตัวอย่างสลิป หรือ administrative tokens ค่า runtime ส่งผ่าน encrypted environment variables

เมื่อ Vercel READY ให้นำ `https://<production-domain>/api/line/webhook` ไปตั้งค่า LINE → Messaging API → Webhook URL → Verify → Use webhook และ Webhook redelivery ปิด auto-reply ที่ซ้ำกับ bot ตรวจว่า production webhook ไม่ติด Deployment Protection

`cron` เปิด Supabase pg_cron/pg_net และตั้งเรียก worker ทุกนาที **เมื่อมีงานค้างเท่านั้น** เก็บ credential ใน Supabase Vault อาจต้องเปิด extensions ตามสิทธิ์โปรเจกต์

## ความทนทานและข้อมูลส่วนตัว

- ตรวจ HMAC ของ raw webhook ก่อนอ่านเหตุการณ์
- รับ event ลงคิวถาวรก่อนตอบ HTTP 200; ประมวลผลด้วย Next.js `after` และ cron ช่วยกู้งานหลัง crash
- ป้องกัน webhook ซ้ำด้วย event ID; ล็อกคิวทีละงานต่อผู้ใช้; lease 6 นาที; retry สูงสุด 5 ครั้ง
- บันทึก response ก่อนส่ง LINE และใช้ retry key เดิม ป้องกัน notification ซ้ำระหว่าง retry
- ยืนยัน/แก้ไข/ยกเลิกผ่าน SQL transaction มี user ownership, version และ event idempotency
- แยกข้อมูลตาม LINE user ID ทุก query; ตาราง/RPC ไม่เปิดให้ anon/authenticated; server secret ข้าม RLS จึงตรวจ ownership ใน Backend และ RPC
- กันสลิปซ้ำด้วย image SHA-256, QR hash และเลขอ้างอิงเมื่อ OCR อ่านได้; **ไม่ได้ยืนยันธุรกรรมกับธนาคาร**
- รูปสลิปถูกอ่านในหน่วยความจำเพื่อ OCR แล้วทิ้ง ไม่เก็บไฟล์รูปในฐานข้อมูลหรือ Supabase Storage ไม่สร้าง public bucket และไม่ส่งรูปให้บริการ AI
- LINE เก็บ content ที่ผู้ใช้ส่งไว้ชั่วคราวตามนโยบายของ LINE เอง ไม่มีการรับประกันระยะเวลาแน่นอนจาก Messaging API
- ตัวอย่างสลิปใน `example-slip/` ไม่เข้า Git/Deploy; ไม่มีข้อมูลสลิปจริงในหน้าเว็บสาธารณะ
- `jod_events` ล้าง payload/response เมื่อทำงานสำเร็จ งานที่ retry ไม่สำเร็จคงอยู่สถานะ `dead` ให้ผู้ดูแลตรวจและแก้ configuration ก่อน replay
- `jod_mutations` เก็บผลธุรกรรมเพื่อ replay; ผู้ดูแลต้องกำหนด retention/backup เพิ่มก่อนขยายเป็นบริการหลายผู้ใช้
- งานบำรุงรักษารายวันลบรายการและ operational logs ที่เก่ากว่า `RETENTION_MONTHS` โดยค่าเริ่มต้น 6 เดือน ผู้ใช้ควรใช้ `ส่งออกข้อมูล` หากต้องการเก็บสำเนาระยะยาว

## ค่าใช้จ่ายโดยประมาณ

ระบบไม่มีค่า OCR API เพราะใช้ Tesseract local และไม่ใช้ AI ภายนอก สำหรับการใช้เองปริมาณน้อยควรอยู่ใน free tier ได้ แต่มีโควตาจากผู้ให้บริการ 3 ฝั่ง:

- Vercel รัน Next.js backend และ webhook บน Hobby plan สำหรับงานส่วนตัว
- Supabase เก็บข้อมูลรายการใน PostgreSQL; รุ่นนี้ไม่เก็บรูปจึงใช้พื้นที่น้อยมาก
- LINE OA / Messaging API นับจำนวนข้อความที่บอทส่งตามแพ็กเกจของ LINE Official Account

ถ้าแชร์ให้คนอื่นใช้ ต้องติดตาม message quota ของ LINE และ usage ของ Vercel/Supabase เพิ่ม โดยเฉพาะกรณีส่งสลิปเยอะหรือมีผู้ใช้หลายคนพร้อมกัน

## การแชร์ให้เพื่อนใช้

โค้ดปัจจุบันล็อกการใช้งานเป็นส่วนตัวก่อน มีเจ้าของจาก owner pairing หรือ `LINE_ALLOWED_USER_IDS` เพื่อกันข้อมูลปนกันและกันคนอื่นใช้ quota โดยไม่ตั้งใจ

ทางเลือกในการแชร์:

1. เพิ่ม LINE user ID ของเพื่อนใน `LINE_ALLOWED_USER_IDS` แล้ว deploy ใหม่ เหมาะกับจำนวนคนน้อยและไว้ใจกัน
2. เพิ่มระบบ invite code ให้เจ้าของสร้าง/ยกเลิกคำเชิญได้จาก LINE เหมาะกับการแชร์ให้เพื่อนหลายคนและควบคุมสิทธิ์เป็นระบบ
3. เปิด public ให้ทุกคนที่แอด OA ใช้ได้ ไม่แนะนำจนกว่าจะมี rate limit, quota monitoring และหน้า admin สำหรับจัดการผู้ใช้

ข้อมูลรายการแยกตาม LINE user ID อยู่แล้ว แต่ก่อนเปิดหลายผู้ใช้จริงควรเพิ่ม user management, export/delete data, retention policy และ dashboard สำหรับผู้ดูแล

## ทดสอบ

`npm test` ทดสอบเงินหน่วยสตางค์ วันที่ พ.ศ./เวลาไทย การอ่านหมายเหตุ การยืนยัน ลายเซ็น และ OCR จากภาพจริงทั้งสี่ในเครื่อง (ข้ามชุดภาพหากไม่มีไฟล์ส่วนตัว) รวม QR ของรูปที่ถูกย่อ

`npm run test:db` ทดสอบฐานข้อมูลจริงภายใน transaction แล้ว rollback ทั้งหมด: รายการร่างไม่รวมยอด, cross-user denial, stale confirmation, event replay, duplicate slip, incomplete confirmation, cancellation, grants/RLS, queue order และ lease recovery

## ข้อจำกัดรุ่นแรก

OCR เป็นกฎสำหรับรูปสลิปเต็ม 4 รูปแบบที่ให้มา ยังไม่รับประกันภาพครอป ภาพเอียง รูปเบลอ หรือธีม/เลย์เอาต์ธนาคารอื่น ชื่อและเลขอ้างอิงอาจอ่านคลาดเคลื่อน จึงให้ผู้ใช้ตรวจสรุปทุกครั้ง การอ่าน QR ใช้กันซ้ำเท่านั้น ไม่ตรวจสลิปปลอม

ไม่มีค่าบริการ OCR API แต่ใช้ CPU/หน่วยความจำ Vercel, ฐานข้อมูล/cron Supabase และโควตา LINE Push ซึ่งขึ้นกับแพ็กเกจผู้ให้บริการ ไม่รับประกันการรันฟรีทั้งหมด

หน้าเว็บเป็นหน้าแนะนำ ไม่ใช่ dashboard รายการส่วนตัว การจัดการรายการทำผ่าน LINE OA

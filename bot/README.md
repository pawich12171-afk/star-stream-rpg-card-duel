# Star Stream RPG Discord Bot

บอท Discord ใช้ฐานข้อมูล Star Stream ชุดเดียวกันผ่าน Supabase และรันด้วย Node.js ได้ทั้ง VS Code และแอปบนมือถือที่รองรับ Node.js/Termux

## ไฟล์รอบแรก
- `src/index.js` จุดเริ่มต้นของบอท
- `src/config.js` อ่านค่าจาก `.env`
- `src/db.js` เชื่อม Supabase
- `src/commands/ping.js` `/ping`
- `src/commands/help.js` `/help`
- `src/commands/link.js` `/link`
- `src/commands/profile.js` `/profile`
- `src/commands/balance.js` `/balance`
- `register-commands.js` ลงทะเบียน Slash Commands

## วิธีรันใน VS Code

1. เปิด Terminal ในโฟลเดอร์โปรเจกต์
2. รัน `cd bot`
3. รัน `npm install`
4. คัดลอก `.env.example` เป็น `.env`
5. ใส่ Discord Token, Application ID และ Supabase URL/Service Role Key
6. รัน `npm run register`
7. รัน `npm start`

ถ้าใส่ `DISCORD_GUILD_ID` คำสั่งจะลงทะเบียนในเซิร์ฟเวอร์นั้นและเหมาะสำหรับทดสอบ เพราะอัปเดตเร็วกว่า Global Commands

## วิธีรันบนมือถือ

ใช้แอป/สภาพแวดล้อมที่มี Node.js เช่น Termux แล้วเข้าโฟลเดอร์ `bot` และใช้คำสั่งเดียวกัน:

`npm install`

`npm run register`

`npm start`

## ความปลอดภัย

ห้ามนำ `.env`, Discord Bot Token หรือ `SUPABASE_SERVICE_ROLE_KEY` ขึ้น GitHub และห้ามส่งคีย์เหล่านี้ให้คนอื่น

## หมายเหตุ

รอบแรกยังไม่ลบเว็บเดิม เพื่อรักษาข้อมูลและฐานข้อมูลเดิมไว้ก่อน ระบบ Discord จะถูกเพิ่มทีละระบบ จากนั้นจึงค่อยตัดส่วนเว็บที่ไม่จำเป็นออกเมื่อบอททำงานครบตามที่ต้องการ

# Star Stream RPG Card Duel

เกม RPG และ card duel ในจักรวาลดวงดาว สร้างตัวละคร ปรับแต่งโปรไฟล์ สะสมไอเทม เปิดกาชา ทำเควสต์ และแข่งขันบน leaderboard แบบ realtime ผ่าน Firebase Firestore

## Run locally

```bash
pnpm install
pnpm dev
```

## Build for production

```bash
pnpm run typecheck
pnpm run build
pnpm run preview
```

## Deploy to Vercel

Import this repository into Vercel. The included `vercel.json` configures the Vite build and SPA fallback automatically.

Before deploying, make sure the Firebase web app can be used from the Vercel domain and that your Firestore rules are configured for your intended environment. The browser Firebase configuration is in `firebase-applet-config.json`.

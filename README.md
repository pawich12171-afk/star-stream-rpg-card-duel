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


## Backend/API database migration
The app now uses Vercel API routes instead of calling Firebase/Firestore directly. The API stores documents in a Supabase PostgreSQL table.

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL Editor.
3. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the Vercel project Environment Variables. Keep the service-role key server-side only.
4. Redeploy Vercel.

The browser talks only to `/api/db/*`; it does not receive the Supabase service-role key. Existing application collections continue to use the same document-shaped data model.

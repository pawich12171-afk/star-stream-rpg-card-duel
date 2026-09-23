import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const root = document.getElementById('root');

function showFatalError(error: unknown) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error('Star Stream fatal runtime error:', error);
  if (!root) return;
  root.innerHTML = `
    <div style="min-height:100vh;background:#020617;color:#e2e8f0;padding:32px;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center">
      <div style="max-width:760px;width:100%;background:#0f172a;border:1px solid #7f1d1d;border-radius:18px;padding:24px">
        <div style="font-size:22px;font-weight:800;color:#f8fafc;margin-bottom:8px">Star Stream พบ Runtime Error</div>
        <div style="color:#94a3b8;margin-bottom:16px">เว็บไม่ได้จอดำเงียบ ๆ แล้ว ตอนนี้แสดงสาเหตุที่ Browser พบให้ตรวจสอบได้</div>
        <pre style="white-space:pre-wrap;word-break:break-word;background:#020617;border-radius:12px;padding:16px;color:#fda4af;font-size:13px">${message.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
        <button onclick="location.reload()" style="margin-top:16px;border:0;border-radius:10px;padding:10px 16px;background:#d946ef;color:white;font-weight:700">โหลดเว็บใหม่</button>
      </div>
    </div>`;
}

window.addEventListener('error', event => showFatalError(event.error || event.message));
window.addEventListener('unhandledrejection', event => showFatalError(event.reason));

import('./App.tsx')
  .then(({ default: App }) => {
    if (!root) throw new Error('ไม่พบ #root ใน index.html');
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch(showFatalError);

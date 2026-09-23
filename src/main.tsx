import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const root = document.getElementById('root');

function showFatalError(error: unknown) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error('Star Stream fatal runtime error:', error);
  if (!root) return;
  root.innerHTML = `
    <div style="min-height:100vh;background:#020617;color:#e2e8f0;padding:24px;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center">
      <div style="max-width:760px;width:100%;background:#0f172a;border:1px solid #7f1d1d;border-radius:18px;padding:24px">
        <div style="font-size:22px;font-weight:800;color:#f8fafc;margin-bottom:8px">Star Stream พบ Runtime Error</div>
        <div style="color:#94a3b8;margin-bottom:16px">ระบบตรวจพบข้อผิดพลาดระหว่างเปิดเว็บ</div>
        <pre style="white-space:pre-wrap;word-break:break-word;background:#020617;border-radius:12px;padding:16px;color:#fda4af;font-size:13px">${message.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
        <button onclick="location.reload()" style="margin-top:16px;border:0;border-radius:10px;padding:10px 16px;background:#d946ef;color:white;font-weight:700">โหลดเว็บใหม่</button>
      </div>
    </div>`;
}

class AppErrorBoundary extends React.Component<{children: React.ReactNode}, {error: Error | null}> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('Star Stream render runtime error:', error); }
  render() {
    if (this.state.error) {
      return (
        <div style={{minHeight:'100vh',background:'#020617',color:'#e2e8f0',display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
          <div style={{maxWidth:760,width:'100%',background:'#0f172a',border:'1px solid #7f1d1d',borderRadius:18,padding:24}}>
            <div style={{fontSize:22,fontWeight:800,marginBottom:8}}>Star Stream พบ Runtime Error</div>
            <div style={{color:'#94a3b8',marginBottom:16}}>ระบบตรวจพบข้อผิดพลาดระหว่างเปิดเว็บ</div>
            <pre style={{whiteSpace:'pre-wrap',wordBreak:'break-word',background:'#020617',borderRadius:12,padding:16,color:'#fda4af',fontSize:13}}>{this.state.error.message}</pre>
            <button onClick={() => location.reload()} style={{marginTop:16,border:0,borderRadius:10,padding:'10px 16px',background:'#d946ef',color:'white',fontWeight:700}}>โหลดเว็บใหม่</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

window.addEventListener('error', event => showFatalError(event.error || event.message));
window.addEventListener('unhandledrejection', event => showFatalError(event.reason));

if (!root) {
  throw new Error('ไม่พบ #root ใน index.html');
}

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);

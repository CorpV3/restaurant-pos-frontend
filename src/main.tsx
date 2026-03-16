import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// ── Global error overlay (visible on screen — helps debug Android/tablet issues) ──
const errors: string[] = []

function showErrorOverlay(msg: string) {
  errors.push(msg)
  const el = document.getElementById('debug-overlay')
  if (el) {
    el.style.display = 'block'
    el.innerHTML = `
      <div style="background:#1a1a1a;color:#fff;font-family:monospace;font-size:13px;padding:16px;min-height:100vh;word-break:break-all;white-space:pre-wrap;">
        <div style="color:#f87171;font-size:16px;font-weight:bold;margin-bottom:12px;">⚠ App Error — Screenshot this</div>
        <div style="color:#86efac;margin-bottom:12px;">
          Platform: ${(window as any).Capacitor?.getPlatform?.() ?? 'web'}
          | UA: ${navigator.userAgent.slice(0, 60)}
          | API: ${localStorage.getItem('pos_api_url') ?? 'default'}
        </div>
        ${errors.map((e, i) => `<div style="background:#2a2a2a;padding:8px;margin-bottom:8px;border-left:3px solid #f87171;">[${i + 1}] ${e}</div>`).join('')}
        <div style="margin-top:16px;color:#6b7280;font-size:11px;">Tap anywhere to dismiss and retry</div>
      </div>
    `
    el.onclick = () => { el.style.display = 'none'; errors.length = 0 }
  }
}

// Catch unhandled JS errors
window.addEventListener('error', (e) => {
  showErrorOverlay(`JS Error: ${e.message}\nat ${e.filename}:${e.lineno}\n${e.error?.stack ?? ''}`)
})

// Catch unhandled promise rejections
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason?.message ?? String(e.reason)
  const stack = e.reason?.stack ?? ''
  showErrorOverlay(`Unhandled Promise: ${msg}\n${stack}`)
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

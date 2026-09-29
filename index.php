<?php
$appDir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/');
$reqPath = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);

if ($reqPath === $appDir) {
    $qs = !empty($_SERVER['QUERY_STRING']) ? '?' . $_SERVER['QUERY_STRING'] : '';
    header('Location: ' . $appDir . '/' . $qs);
    exit;
}
?>
<!DOCTYPE html>
<html lang="tr">
<head>
  <script>window.__APP_DIR__ = "<?= $appDir ?>";</script>

  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Ulak — Cihazlar Arası Işık Hızında Geçici Pano & Veri Aktarımı</title>
  <meta name="description" content="Üyeliksiz, anında çoklu cihaz panosu. Yazıları, bağlantıları ve fotoğrafları QR kod veya kısa linkle (örn: a123) cihazlarınız arasında gerçek zamanlı paylaşın.">


  <link rel="icon" type="image/svg+xml" href="assets/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
/* ===================================================================
   Ulak — Modern High-Performance Design System
   Pure Vanilla CSS, Zero external framework, Rich Glassmorphism Aesthetics
   =================================================================== */

:root {
  --bg-main: #070a12;
  --bg-surface: #0e1526;
  --bg-card: rgba(18, 26, 45, 0.75);
  --bg-card-hover: rgba(24, 35, 61, 0.85);
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-accent: rgba(99, 102, 241, 0.35);
  --border-hover: rgba(56, 189, 248, 0.5);

  --text-main: #f8fafc;
  --text-muted: #94a3b8;
  --text-dim: #64748b;

  --accent-cyan: #06b6d4;
  --accent-sky: #38bdf8;
  --accent-indigo: #6366f1;
  --accent-violet: #8b5cf6;
  --accent-emerald: #10b981;
  --accent-rose: #f43f5e;
  --accent-amber: #f59e0b;

  --grad-primary: linear-gradient(135deg, #06b6d4 0%, #6366f1 100%);
  --grad-primary-hover: linear-gradient(135deg, #0ea5e9 0%, #4f46e5 100%);
  --grad-burn: linear-gradient(135deg, #f43f5e 0%, #fb923c 100%);
  --grad-card-border: linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.02));

  --font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  --radius-sm: 8px;
  --radius-md: 14px;
  --radius-lg: 20px;
  --radius-full: 9999px;

  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 8px 24px -4px rgba(0, 0, 0, 0.5);
  --shadow-lg: 0 16px 40px -8px rgba(0, 0, 0, 0.65);
  --shadow-glow: 0 0 25px rgba(99, 102, 241, 0.35);
}

/* Global Reset & Base */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  width: 100%;
  min-height: 100%;
  background-color: var(--bg-main);
  color: var(--text-main);
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overflow-x: hidden;
}

/* Custom Scrollbar */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: var(--bg-main);
}
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* Ambient Glow Blobs in Background */
.bg-glow {
  position: fixed;
  border-radius: 50%;
  filter: blur(140px);
  pointer-events: none;
  z-index: 0;
  opacity: 0.25;
}
.bg-glow-1 {
  top: -150px;
  left: 15%;
  width: 550px;
  height: 550px;
  background: radial-gradient(circle, var(--accent-cyan), transparent);
}
.bg-glow-2 {
  bottom: -150px;
  right: 15%;
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, var(--accent-indigo), transparent);
}

/* App Layout Container */
.app-container {
  position: relative;
  z-index: 1;
  max-width: 980px;
  margin: 0 auto;
  padding: 24px 20px 80px;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.view-screen {
  width: 100%;
  animation: fadeIn 0.3s ease-out forwards;
}

.hidden {
  display: none !important;
}

/* Typography Utilities */
.gradient-text {
  background: var(--grad-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.text-muted {
  color: var(--text-muted);
}
.text-danger {
  color: var(--accent-rose) !important;
}
.text-center {
  text-align: center;
}

/* ===================================================================
   LANDING VIEW
   =================================================================== */

.landing-header {
  text-align: center;
  margin-top: 24px;
  margin-bottom: 36px;
}

.brand-badge {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 8px 20px;
  border-radius: var(--radius-full);
  margin-bottom: 20px;
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
  transition: transform 0.2s ease, border-color 0.2s ease;
}

.brand-badge:hover {
  border-color: rgba(56, 189, 248, 0.4);
  transform: translateY(-1px);
}

.brand-icon {
  width: 42px;
  height: 42px;
  filter: drop-shadow(0 4px 12px rgba(6, 182, 212, 0.4));
  flex-shrink: 0;
}

.brand-name {
  font-weight: 800;
  font-size: 24px;
  letter-spacing: -0.03em;
  background: linear-gradient(135deg, #ffffff 0%, #38bdf8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.badge-tag {
  background: rgba(16, 185, 129, 0.15);
  color: var(--accent-emerald);
  font-size: 12px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 6px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.landing-title {
  font-size: clamp(2rem, 5vw, 3rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.15;
  margin-bottom: 16px;
}

.landing-subtitle {
  color: var(--text-muted);
  font-size: clamp(1rem, 2vw, 1.15rem);
  max-width: 620px;
  margin: 0 auto;
  line-height: 1.6;
}

/* Card Component */
.card {
  background: var(--bg-card);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 30px;
  box-shadow: var(--shadow-lg);
  position: relative;
}

.creation-card {
  max-width: 640px;
  margin: 0 auto 40px;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 24px;
  color: var(--text-main);
}

.form-group {
  margin-bottom: 22px;
}

.form-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
  font-weight: 600;
  margin-bottom: 10px;
  color: var(--text-main);
}

.label-hint {
  font-size: 0.78rem;
  font-weight: 400;
  color: var(--text-dim);
}

/* TTL Options Selector */
.ttl-selector {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(105px, 1fr));
  gap: 8px;
}

.ttl-option {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  color: var(--text-main);
  text-align: center;
  font-family: inherit;
}

.ttl-option:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
}

.ttl-option.active {
  background: rgba(99, 102, 241, 0.15);
  border-color: var(--accent-indigo);
  box-shadow: 0 0 16px rgba(99, 102, 241, 0.3);
}

.ttl-option[data-ttl="burn_read"].active {
  background: rgba(244, 63, 94, 0.15);
  border-color: var(--accent-rose);
  box-shadow: 0 0 16px rgba(244, 63, 94, 0.3);
}

.ttl-icon {
  font-size: 1.25rem;
  margin-bottom: 2px;
}

.ttl-name {
  font-weight: 700;
  font-size: 0.85rem;
}

.ttl-desc {
  font-size: 0.7rem;
  color: var(--text-dim);
}

.custom-room-group {
  margin-top: 18px;
}

.input-with-icon {
  display: flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 0 14px;
  transition: border-color 0.2s;
}

.input-with-icon:focus-within {
  border-color: var(--accent-sky);
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
}

.input-prefix {
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 0.85rem;
  user-select: none;
  margin-right: 4px;
}

input[type="text"], textarea {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-main);
  font-family: inherit;
  font-size: 0.95rem;
  padding: 12px 0;
}

input[type="text"]::placeholder, textarea::placeholder {
  color: var(--text-dim);
}

/* Button Component */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-family: inherit;
  font-weight: 600;
  font-size: 0.9rem;
  border-radius: var(--radius-md);
  padding: 10px 18px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  text-decoration: none;
  user-select: none;
}

.btn:active {
  transform: scale(0.98);
}

.btn-primary {
  background: var(--grad-primary);
  color: #ffffff;
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.35);
}

.btn-primary:hover {
  background: var(--grad-primary-hover);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
  transform: translateY(-1px);
}

.btn-large {
  width: 100%;
  padding: 15px 24px;
  font-size: 1.05rem;
  border-radius: var(--radius-md);
}

.btn-glow {
  box-shadow: var(--shadow-glow);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.08);
  border-color: var(--border-subtle);
  color: var(--text-main);
}
.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255, 255, 255, 0.2);
}

.btn-outline {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-subtle);
  color: var(--text-main);
}
.btn-outline:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.25);
}

.btn-ghost {
  background: transparent;
  color: var(--text-muted);
}
.btn-ghost:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-main);
}

.btn-danger {
  background: rgba(244, 63, 94, 0.15);
  border-color: rgba(244, 63, 94, 0.35);
  color: #fda4af;
}
.btn-danger:hover {
  background: var(--accent-rose);
  color: #ffffff;
  border-color: var(--accent-rose);
  box-shadow: 0 4px 16px rgba(244, 63, 94, 0.4);
}

.btn-sm {
  padding: 7px 12px;
  font-size: 0.82rem;
  border-radius: var(--radius-sm);
}

.btn-link {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 0.8rem;
  cursor: pointer;
  padding: 4px;
}
.btn-link:hover {
  color: var(--accent-rose);
}

.btn-full {
  width: 100%;
}

.divider {
  display: flex;
  align-items: center;
  text-align: center;
  margin: 24px 0;
  color: var(--text-dim);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.divider::before, .divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid var(--border-subtle);
}
.divider span {
  padding: 0 12px;
}

.join-form {
  display: flex;
  gap: 10px;
}
.join-form input {
  flex: 1;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 10px 16px;
  color: var(--text-main);
}
.join-form input:focus {
  border-color: var(--accent-indigo);
}

/* Feature Grid */
.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
  max-width: 860px;
  margin: 0 auto;
}
.feature-item {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 24px;
  text-align: left;
}
.feature-icon {
  font-size: 1.8rem;
  margin-bottom: 12px;
}
.feature-item h3 {
  font-size: 1.05rem;
  margin-bottom: 6px;
}
.feature-item p {
  color: var(--text-muted);
  font-size: 0.85rem;
  line-height: 1.5;
}

/* ===================================================================
   ROOM VIEW (ACTIVE SESSION)
   =================================================================== */

.room-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  background: var(--bg-card);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 12px 18px;
  margin-bottom: 18px;
  box-shadow: var(--shadow-md);
}

.room-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.room-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  color: var(--text-main);
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.room-brand:hover {
  opacity: 0.9;
  transform: scale(1.02);
}

.brand-icon-sm {
  width: 34px;
  height: 34px;
  filter: drop-shadow(0 2px 8px rgba(6, 182, 212, 0.35));
  flex-shrink: 0;
}

.room-brand-text {
  font-weight: 800;
  font-size: 1.35rem;
  letter-spacing: -0.03em;
  background: linear-gradient(135deg, #ffffff 0%, #38bdf8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.room-id-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--border-subtle);
  padding: 4px 10px;
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 0.15s;
}
.room-id-pill:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: var(--accent-sky);
}
.room-id-label {
  color: var(--text-dim);
}
.room-id-value {
  color: var(--accent-sky);
  font-weight: 600;
}
.copy-icon-inline {
  stroke: var(--text-dim);
}

.room-header-center {
  display: flex;
  align-items: center;
  gap: 10px;
}

.live-pill, .timer-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: var(--radius-full);
  white-space: nowrap;
}

.live-pill {
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: var(--accent-emerald);
}

.pulse-dot {
  width: 8px;
  height: 8px;
  background: var(--accent-emerald);
  border-radius: 50%;
  box-shadow: 0 0 10px var(--accent-emerald);
  animation: pulse 1.8s infinite;
}

.timer-pill {
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: var(--accent-amber);
  font-family: var(--font-mono);
}

.timer-pill.urgent {
  background: rgba(244, 63, 94, 0.15);
  border-color: rgba(244, 63, 94, 0.4);
  color: var(--accent-rose);
  animation: blink 1s infinite;
}

.room-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* Tabs Navigation */
.room-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 18px;
}

.room-tab-btn {
  flex: 1;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-muted);
  font-family: inherit;
  font-weight: 600;
  font-size: 0.92rem;
  cursor: pointer;
  transition: all 0.2s;
}

.room-tab-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-main);
}

.room-tab-btn.active {
  background: var(--bg-card);
  border-color: var(--border-accent);
  color: var(--text-main);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.tab-badge {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-main);
  padding: 2px 7px;
  border-radius: var(--radius-full);
  font-size: 0.75rem;
}

.live-sync-indicator {
  background: rgba(6, 182, 212, 0.2);
  color: var(--accent-cyan);
  border: 1px solid rgba(6, 182, 212, 0.4);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}

/* Composer Card */
.composer-card {
  padding: 18px;
  margin-bottom: 24px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-card);
}

.composer-body textarea {
  min-height: 80px;
  max-height: 250px;
  resize: vertical;
  line-height: 1.5;
  font-size: 0.95rem;
}

.image-preview-box {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px dashed var(--accent-sky);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  margin-top: 10px;
}

.preview-img-wrapper img {
  width: 50px;
  height: 50px;
  object-fit: cover;
  border-radius: 6px;
}

.preview-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.preview-info span:first-child {
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.preview-info span:last-child {
  font-size: 0.75rem;
  color: var(--text-dim);
}

.btn-cancel {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  padding: 6px;
  border-radius: 50%;
}
.btn-cancel:hover {
  color: var(--accent-rose);
  background: rgba(244, 63, 94, 0.15);
}

.composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--border-subtle);
  padding-top: 12px;
  margin-top: 8px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-input-label {
  cursor: pointer;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

/* Clips Feed */
.clips-stream-wrapper {
  margin-top: 8px;
}

.clips-stream-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.section-subtitle {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.clips-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

/* Individual Clip Card */
.clip-card {
  background: var(--bg-card);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 16px;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
  max-width: 82%;
  min-width: 280px;
}

/* OUTGOING: Mevcut Cihaz (Sağa Yassı / WhatsApp Tarzı) */
.clip-card.clip-outgoing {
  align-self: flex-end;
  background: linear-gradient(135deg, rgba(18, 38, 70, 0.9), rgba(13, 26, 50, 0.9));
  border: 1px solid rgba(56, 189, 248, 0.35);
  box-shadow: 0 4px 20px rgba(6, 182, 212, 0.08);
  border-bottom-right-radius: 4px;
}

.clip-card.clip-outgoing:hover {
  border-color: rgba(56, 189, 248, 0.55);
  box-shadow: 0 6px 24px rgba(6, 182, 212, 0.14);
}

.clip-card.clip-outgoing .clip-sender {
  background: rgba(56, 189, 248, 0.14);
  color: var(--accent-sky);
  border: 1px solid rgba(56, 189, 248, 0.3);
  font-weight: 700;
}

/* INCOMING: Diğer Cihazlar (Sola Yassı) */
.clip-card.clip-incoming {
  align-self: flex-start;
  background: rgba(18, 26, 45, 0.85);
  border: 1px solid var(--border-subtle);
  border-bottom-left-radius: 4px;
}

.clip-card.clip-incoming:hover {
  border-color: rgba(255, 255, 255, 0.18);
  box-shadow: var(--shadow-md);
}

.clip-card.clip-incoming .clip-sender {
  background: rgba(16, 185, 129, 0.12);
  color: var(--accent-emerald);
  border: 1px solid rgba(16, 185, 129, 0.3);
  font-weight: 700;
}

.sender-badge-inner {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.sender-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}

.clip-outgoing .sender-dot {
  background: var(--accent-sky);
  box-shadow: 0 0 6px var(--accent-sky);
}

.clip-incoming .sender-dot {
  background: var(--accent-emerald);
  box-shadow: 0 0 6px var(--accent-emerald);
}

.clip-card:hover {
  box-shadow: var(--shadow-md);
}

.clip-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.clip-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
  color: var(--text-dim);
}

.clip-sender {
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
}

.clip-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.clip-body {
  word-break: break-word;
  white-space: pre-wrap;
  font-size: 0.96rem;
  line-height: 1.6;
}

/* Hyperlinks in clip */
.clip-body a {
  color: var(--accent-sky);
  text-decoration: underline;
  text-underline-offset: 3px;
  transition: color 0.15s;
}
.clip-body a:hover {
  color: #7dd3fc;
}

/* Link pill inside clip */
.clip-link-preview {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.3);
  color: var(--accent-sky);
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  margin-top: 10px;
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s;
}
.clip-link-preview:hover {
  background: rgba(56, 189, 248, 0.2);
  border-color: var(--accent-sky);
  transform: translateY(-1px);
}

/* Image in clip */
.clip-image-wrapper {
  margin-top: 8px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  max-width: 100%;
  cursor: pointer;
  position: relative;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border-subtle);
  display: inline-block;
}

.clip-image-wrapper img {
  display: block;
  max-height: 380px;
  max-width: 100%;
  object-fit: contain;
  transition: transform 0.2s;
}

.clip-image-wrapper:hover img {
  transform: scale(1.015);
}

.empty-state {
  text-align: center;
  padding: 50px 20px;
  background: rgba(255, 255, 255, 0.015);
  border: 1px dashed var(--border-subtle);
  border-radius: var(--radius-lg);
  color: var(--text-dim);
}
.empty-state-icon {
  font-size: 2.8rem;
  margin-bottom: 12px;
  opacity: 0.6;
}
.empty-state h4 {
  color: var(--text-muted);
  font-size: 1.1rem;
  margin-bottom: 6px;
}
.empty-state p {
  max-width: 440px;
  margin: 0 auto;
  font-size: 0.85rem;
  line-height: 1.5;
}

/* ===================================================================
   LIVE SHARED NOTEPAD TAB
   =================================================================== */

.livepad-card {
  padding: 24px;
}

.livepad-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  gap: 16px;
}

.livepad-info h3 {
  font-size: 1.15rem;
  margin-bottom: 4px;
}

.livepad-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* Device Pill in Header & Landing */
.device-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--border-subtle);
  padding: 4px 12px;
  border-radius: var(--radius-full);
  font-size: 0.82rem;
  color: var(--text-main);
  cursor: pointer !important;
  pointer-events: auto !important;
  user-select: none;
  -webkit-user-select: none;
  transition: all 0.15s ease;
  font-family: inherit;
}

.device-pill:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: var(--accent-sky);
  color: var(--accent-sky);
  transform: translateY(-1px);
}

.device-pill:active {
  transform: scale(0.96);
}

.device-dot-indicator {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent-emerald);
  box-shadow: 0 0 6px var(--accent-emerald);
  pointer-events: none;
}

/* Yazar Renkleri Açıklaması (Legend Bar) */
.livepad-legend-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  font-size: 0.78rem;
}

.legend-title {
  color: var(--text-dim);
  font-weight: 600;
  margin-right: 4px;
}

.livepad-authors-chips {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.legend-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-weight: 600;
  font-size: 0.76rem;
}

.legend-chip.chip-emerald {
  background: rgba(16, 185, 129, 0.12);
  color: var(--accent-emerald);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.legend-chip.chip-amber {
  background: rgba(245, 158, 11, 0.12);
  color: var(--accent-amber);
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.legend-chip.chip-cyan {
  background: rgba(6, 182, 212, 0.12);
  color: var(--accent-cyan);
  border: 1px solid rgba(6, 182, 212, 0.3);
}

.legend-chip.chip-purple {
  background: rgba(168, 85, 247, 0.12);
  color: #c084fc;
  border: 1px solid rgba(168, 85, 247, 0.3);
}

.legend-chip.chip-rose {
  background: rgba(244, 63, 94, 0.12);
  color: var(--accent-rose);
  border: 1px solid rgba(244, 63, 94, 0.3);
}

.legend-chip.chip-indigo {
  background: rgba(99, 102, 241, 0.12);
  color: #818cf8;
  border: 1px solid rgba(99, 102, 241, 0.3);
}

/* Livepad Editor Wrapper & Backdrop Overlay */
.livepad-editor-wrapper {
  position: relative;
  background: #060913;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  margin-bottom: 12px;
  transition: border-color 0.2s, box-shadow 0.2s;
  min-height: 380px;
  overflow: hidden;
}

.livepad-editor-wrapper:focus-within {
  border-color: var(--accent-indigo);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.25);
}

.livepad-backdrop {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 1;
}

.livepad-highlights {
  padding: 16px;
  font-family: var(--font-mono);
  font-size: 0.95rem;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: transparent;
  user-select: none;
  min-height: 380px;
  box-sizing: border-box;
  transition: opacity 0.2s;
}

.livepad-textarea {
  position: relative;
  z-index: 2;
  width: 100%;
  min-height: 380px;
  padding: 16px;
  background: transparent !important;
  color: var(--text-main);
  font-family: var(--font-mono);
  font-size: 0.95rem;
  line-height: 1.6;
  border: none;
  outline: none;
  resize: vertical;
  white-space: pre-wrap;
  word-break: break-word;
  box-sizing: border-box;
}

/* Silik, göz yormayan zarif neon yazar vurguları */
.neon-chunk {
  border-radius: 3px;
  padding: 1px 0;
  transition: background 0.2s ease;
}

.neon-chunk-emerald {
  background: rgba(16, 185, 129, 0.13);
  border-bottom: 2px solid rgba(16, 185, 129, 0.45);
}

.neon-chunk-amber {
  background: rgba(245, 158, 11, 0.13);
  border-bottom: 2px solid rgba(245, 158, 11, 0.45);
}

.neon-chunk-cyan {
  background: rgba(6, 182, 212, 0.13);
  border-bottom: 2px solid rgba(6, 182, 212, 0.45);
}

.neon-chunk-purple {
  background: rgba(168, 85, 247, 0.13);
  border-bottom: 2px solid rgba(168, 85, 247, 0.45);
}

.neon-chunk-rose {
  background: rgba(244, 63, 94, 0.13);
  border-bottom: 2px solid rgba(244, 63, 94, 0.45);
}

.neon-chunk-indigo {
  background: rgba(99, 102, 241, 0.13);
  border-bottom: 2px solid rgba(99, 102, 241, 0.45);
}

.livepad-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.82rem;
  color: var(--text-dim);
}

.sync-status {
  color: var(--accent-emerald);
  font-weight: 600;
}

/* ===================================================================
   MODALS
   =================================================================== */

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(3, 7, 18, 0.82);
  backdrop-filter: blur(14px);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  animation: fadeIn 0.2s ease-out;
}

.modal-dialog {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 480px;
  padding: 26px;
  box-shadow: var(--shadow-lg);
  position: relative;
  animation: scaleUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-dialog-sm {
  max-width: 380px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.modal-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.15rem;
}

.btn-close-modal,
.modal-close-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 1.8rem;
  line-height: 1;
  cursor: pointer;
  padding: 4px;
  transition: color 0.15s;
}
.btn-close-modal:hover,
.modal-close-btn:hover {
  color: var(--text-main);
}

.modal-desc {
  color: var(--text-muted);
  font-size: 0.9rem;
  margin-bottom: 20px;
  line-height: 1.5;
}

.qr-image-container {
  background: #ffffff;
  padding: 16px;
  border-radius: var(--radius-md);
  display: inline-block;
  margin: 0 auto 20px;
  box-shadow: var(--shadow-md);
  position: relative;
  min-width: 200px;
  min-height: 200px;
}

.qr-image-container img {
  display: block;
  width: 200px;
  height: 200px;
}

.qr-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #0f172a;
  font-weight: 600;
  font-size: 0.85rem;
}

.modal-url-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  margin-bottom: 16px;
}

.modal-url-text {
  flex: 1;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--accent-sky);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
}

.network-notice {
  background: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.2);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.4;
  margin-top: 14px;
  text-align: left;
}

.modal-buttons {
  display: flex;
  gap: 10px;
  margin-top: 24px;
}
.modal-buttons .btn {
  flex: 1;
}

.destroy-alert-icon {
  font-size: 2.8rem;
  margin-bottom: 10px;
}

/* Lightbox Modal */
.lightbox-dialog {
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.lightbox-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 18px;
  background: var(--bg-surface);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
}

.lightbox-filename {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-main);
}

.lightbox-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.lightbox-body {
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 16px;
  border-radius: 0 0 var(--radius-md) var(--radius-md);
}

.lightbox-body img {
  max-width: 100%;
  max-height: 75vh;
  object-fit: contain;
  border-radius: 4px;
}

/* Quick Paste Modal & Dropzone */
.quick-paste-zone {
  border: 2px dashed rgba(56, 189, 248, 0.4);
  background: rgba(15, 23, 42, 0.6);
  border-radius: var(--radius-md);
  padding: 22px 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  outline: none;
  text-align: center;
}

.quick-paste-zone:hover,
.quick-paste-zone:focus-within {
  border-color: var(--accent-sky);
  background: rgba(56, 189, 248, 0.08);
  box-shadow: 0 0 20px rgba(56, 189, 248, 0.2);
}

.quick-paste-icon {
  font-size: 2.2rem;
  margin-bottom: 8px;
  filter: drop-shadow(0 2px 8px rgba(0,0,0,0.4));
}

.quick-paste-hint {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 12px;
}

.quick-paste-textarea {
  width: 100%;
  min-height: 80px;
  max-height: 120px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-main);
  padding: 10px 12px;
  font-family: inherit;
  font-size: 0.88rem;
  resize: none;
  outline: none;
  transition: border-color 0.2s;
  text-align: left;
}

.quick-paste-textarea:focus {
  border-color: var(--accent-sky);
}

/* Destroyed Screen Overlay */
.destroyed-overlay {
  position: fixed;
  inset: 0;
  background: rgba(3, 7, 18, 0.95);
  backdrop-filter: blur(20px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  animation: fadeIn 0.3s ease;
}

.destroyed-card {
  background: var(--bg-surface);
  border: 1px solid rgba(244, 63, 94, 0.3);
  box-shadow: 0 0 40px rgba(244, 63, 94, 0.2);
  border-radius: var(--radius-lg);
  padding: 40px 30px;
  max-width: 440px;
  width: 100%;
}

.destroyed-icon {
  font-size: 3.5rem;
  margin-bottom: 16px;
}

.destroyed-card h2 {
  font-size: 1.5rem;
  margin-bottom: 10px;
}

.destroyed-card p {
  color: var(--text-muted);
  font-size: 0.95rem;
  margin-bottom: 24px;
  line-height: 1.5;
}

/* Toast Container & Notification Pills */
.toast-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.toast {
  pointer-events: auto;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid var(--border-accent);
  backdrop-filter: blur(16px);
  color: #ffffff;
  padding: 10px 18px;
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-lg);
  font-size: 0.88rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  animation: slideToast 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  transition: opacity 0.3s, transform 0.3s;
}

.toast.toast-success {
  border-color: rgba(16, 185, 129, 0.5);
  box-shadow: 0 4px 20px rgba(16, 185, 129, 0.2);
}

.toast.toast-danger {
  border-color: rgba(244, 63, 94, 0.5);
  box-shadow: 0 4px 20px rgba(244, 63, 94, 0.2);
}

/* Animations */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleUp {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes slideToast {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes pulse {
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
  70% { transform: scale(1.1); box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

/* ===================================================================
   RESPONSIVE DESIGN (MOBILE & TABLET)
   =================================================================== */

@media (max-width: 680px) {
  .app-container {
    padding: 14px 12px 60px;
  }

  .landing-title {
    font-size: 1.8rem;
  }

  .ttl-selector {
    grid-template-columns: repeat(2, 1fr);
  }

  .room-header {
    flex-wrap: wrap;
    padding: 10px 14px;
    gap: 8px;
  }

  .room-header-center {
    order: 3;
    width: 100%;
    justify-content: space-between;
    margin-top: 4px;
  }

  .hide-mobile {
    display: none !important;
  }

  .composer-card {
    padding: 14px;
  }

  .livepad-header {
    flex-direction: column;
  }

  .toast-container {
    left: 14px;
    right: 14px;
    bottom: 14px;
    align-items: center;
  }
}

/* ===================================================================
   CODE BLOCKS & INLINE CODE STYLING (SNIPPET BOXES)
   =================================================================== */

.code-block-wrapper {
  background: #040711;
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: var(--radius-sm);
  margin: 10px 0;
  overflow: hidden;
  font-family: var(--font-mono);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
}

.code-block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  padding: 6px 12px;
}

.code-lang-tag {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--accent-sky);
  letter-spacing: 0.08em;
  font-family: var(--font-mono);
}

.btn-copy-code {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 600;
  padding: 3px 8px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  transition: all 0.15s;
  font-family: var(--font-sans);
}

.btn-copy-code:hover {
  background: rgba(99, 102, 241, 0.25);
  border-color: var(--accent-indigo);
  color: #ffffff;
}

.btn-copy-code.copied {
  background: rgba(16, 185, 129, 0.25);
  border-color: var(--accent-emerald);
  color: var(--accent-emerald);
}

.code-pre {
  margin: 0;
  padding: 12px 14px;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 0.88rem;
  line-height: 1.55;
  color: #e2e8f0;
  background: transparent;
}

.code-pre code {
  font-family: inherit;
  white-space: pre;
}

/* Inline Code Pill with Mini Copy Icon */
.inline-code-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 5px;
  padding: 1px 6px;
  margin: 0 2px;
  font-family: var(--font-mono);
  font-size: 0.88rem;
  color: var(--accent-sky);
  vertical-align: middle;
}

.inline-code-pill code {
  font-family: inherit;
}

.btn-copy-inline {
  background: none;
  border: none;
  color: var(--text-dim);
  padding: 2px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  border-radius: 3px;
  transition: all 0.15s;
}

.btn-copy-inline:hover {
  color: var(--accent-sky);
  background: rgba(255, 255, 255, 0.12);
}

.btn-copy-inline.copied {
  color: var(--accent-emerald);
}

/* ===================================================================
   LEGAL NOTICES, SECURITY BANNERS & FOOTER
   =================================================================== */

.security-banner {
  margin-top: 24px;
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: var(--radius-md);
  padding: 16px 20px;
  backdrop-filter: blur(12px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.security-banner-content {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.security-badge-icon {
  font-size: 1.8rem;
  line-height: 1;
  flex-shrink: 0;
}

.security-banner-text {
  flex: 1;
  min-width: 260px;
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.55;
}

.security-banner-text strong {
  color: #fca5a5;
}

.landing-footer {
  margin-top: 40px;
  padding-top: 24px;
  border-top: 1px solid var(--border-subtle);
  text-align: center;
}

.footer-links {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.footer-link {
  color: var(--text-muted);
  text-decoration: none;
  font-size: 0.82rem;
  transition: color 0.15s;
  cursor: pointer;
}

.footer-link:hover {
  color: var(--accent-sky);
  text-decoration: underline;
}

.footer-dot {
  color: var(--text-dim);
  font-size: 0.8rem;
}

.footer-copy {
  font-size: 0.76rem;
  color: var(--text-dim);
}

.composer-security-tip {
  margin-top: 8px;
  padding: 6px 12px;
  font-size: 0.78rem;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(239, 68, 68, 0.06);
  border: 1px solid rgba(239, 68, 68, 0.15);
  border-radius: var(--radius-sm);
}

.composer-security-tip a {
  color: #fca5a5;
  text-decoration: underline;
  cursor: pointer;
}

.composer-security-tip a:hover {
  color: #ffffff;
}

.modal-dialog-md {
  max-width: 620px;
}

.legal-modal-body::-webkit-scrollbar {
  width: 6px;
}

.legal-modal-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}

.btn-ghost {
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-muted);
}

.btn-ghost:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: var(--border-subtle);
  color: var(--text-main);
}

/* Language Toggle Button */
.lang-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--border-subtle);
  padding: 4px 10px;
  border-radius: var(--radius-full);
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-main);
  cursor: pointer !important;
  pointer-events: auto !important;
  user-select: none;
  -webkit-user-select: none;
  transition: all 0.15s ease;
  font-family: inherit;
}

.lang-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
  transform: translateY(-1px);
}

.lang-toggle-btn:active {
  transform: scale(0.96);
}

.lang-toggle-btn .lang-flag {
  font-size: 0.95rem;
  line-height: 1;
}

.lang-toggle-btn .lang-text {
  font-weight: 700;
  letter-spacing: 0.04em;
}

</style>
</head>
<body>
  <!-- Ambient background glow elements -->
  <div class="bg-glow bg-glow-1"></div>
  <div class="bg-glow bg-glow-2"></div>

  <div id="app" class="app-container">
    <!-- ========================================== -->
    <!-- VIEW 1: LANDING & ROOM CREATION            -->
    <!-- ========================================== -->
    <main id="landing-view" class="view-screen">
      <header class="landing-header">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <div class="brand-badge" style="margin-bottom: 0;">
            <svg class="brand-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="brand-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#06b6d4"/><stop offset="100%" stop-color="#6366f1"/></linearGradient><linearGradient id="arrow-grad-1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#06b6d4"/></linearGradient><linearGradient id="arrow-grad-2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#818cf8"/><stop offset="100%" stop-color="#a855f7"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="#0f172a" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/><circle cx="32" cy="32" r="22" fill="url(#brand-grad)" opacity="0.15"/><path d="M18 32C18 24.27 24.27 18 32 18C38.2 18 43.47 22.05 45.24 27.7" stroke="url(#arrow-grad-1)" stroke-width="4.5" stroke-linecap="round"/><polyline points="39 28.5 45.5 28.5 47 22" stroke="url(#arrow-grad-1)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M46 32C46 39.73 39.73 46 32 46C25.8 46 20.53 41.95 18.76 36.3" stroke="url(#arrow-grad-2)" stroke-width="4.5" stroke-linecap="round"/><polyline points="25 35.5 18.5 35.5 17 42" stroke="url(#arrow-grad-2)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="32" cy="32" r="3.5" fill="#38bdf8"/></svg>
            <span class="brand-name">Ulak</span>
            <span class="badge-tag" data-i18n="badge_tag">Hızlı & Geçici Pano</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button type="button" class="lang-toggle-btn" id="landing-lang-toggle" title="Change Language / Dili Değiştir">
              <span class="lang-flag" id="landing-lang-flag">🌐</span>
              <span class="lang-text" id="landing-lang-text">EN</span>
            </button>
            <button type="button" class="device-pill" id="landing-device-name" title="Cihaz adınızı değiştirmek için tıklayın" data-i18n-title="device_pill_title">
              <span class="device-dot-indicator" id="landing-device-dot"></span>
              <span class="device-pill-name" id="landing-device-name-text">Cihazım</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
          </div>
        </div>
        <h1 class="landing-title"><span data-i18n="landing_title_1">Cihazlar Arasında</span> <span class="gradient-text" data-i18n="landing_title_2">Işık Hızında</span> <span data-i18n="landing_title_3">Paylaşın</span></h1>
        <p class="landing-subtitle" data-i18n="landing_subtitle">Üyelik yok, kayıt yok. Yazı, bağlantı ve fotoğrafları bilgisayarlarınız ve telefonunuz arasında anında eşitleyin.</p>
      </header>

      <section class="card creation-card">
        <h2 class="card-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          <span data-i18n="create_card_title">Yeni Paylaşım Oturumu Başlat</span>
        </h2>

        <!-- TTL (Self-destruct) Options -->
        <div class="form-group">
          <label class="form-label">
            <span>Kendini İmha Süresi:</span>
            <span class="label-hint" id="ttl-hint" data-i18n="ttl_hint">Süre bitiminde tüm veriler bellekten silinir</span>
          </label>
          <div class="ttl-selector" id="ttl-selector">
            <button type="button" class="ttl-option" data-ttl="burn_read">
              <span class="ttl-icon">🔥</span>
              <span class="ttl-name" data-i18n="ttl_opt_burn">Okunur Okunmaz</span>
              <span class="ttl-desc" data-i18n="ttl_opt_burn_desc">Görüldükten 60sn sonra</span>
            </button>
            <button type="button" class="ttl-option" data-ttl="15m">
              <span class="ttl-icon">⚡</span>
              <span class="ttl-name" data-i18n="ttl_opt_15m">15 Dakika</span>
              <span class="ttl-desc" data-i18n="ttl_opt_15m_desc">Hızlı transfer</span>
            </button>
            <button type="button" class="ttl-option active" data-ttl="1h">
              <span class="ttl-icon">⏱️</span>
              <span class="ttl-name" data-i18n="ttl_opt_1h">1 Saat</span>
              <span class="ttl-desc" data-i18n="ttl_opt_1h_desc">Önerilen</span>
            </button>
            <button type="button" class="ttl-option" data-ttl="8h">
              <span class="ttl-icon">⏳</span>
              <span class="ttl-name" data-i18n="ttl_opt_8h">8 Saat</span>
              <span class="ttl-desc" data-i18n="ttl_opt_8h_desc">Mesai süresince</span>
            </button>
            <button type="button" class="ttl-option" data-ttl="24h">
              <span class="ttl-icon">📅</span>
              <span class="ttl-name" data-i18n="ttl_opt_24h">1 Gün</span>
              <span class="ttl-desc" data-i18n="ttl_opt_24h_desc">24 saat sakla</span>
            </button>
          </div>
        </div>

        <!-- Short Room Name (Optional) -->
        <div class="form-group custom-room-group">
          <label for="custom-room-input" class="form-label" data-i18n="custom_room_label">Özel Oda Adı (İsteğe Bağlı):</label>
          <div class="input-with-icon">
            <span class="input-prefix" id="room-prefix-label">.../</span>
            <input type="text" id="custom-room-input" placeholder="1a23, 123a (boş bırakırsanız 4 haneli kod verilir)" data-i18n-placeholder="custom_room_placeholder" maxlength="32" autocomplete="off">
          </div>
        </div>

        <button id="btn-create-room" class="btn btn-primary btn-large btn-glow">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
          <span data-i18n="btn_create_room">Hemen Oturumu Başlat</span>
        </button>

        <div class="divider">
          <span data-i18n="divider_or">VEYA VAR OLAN BİR ODAYA GİRİN</span>
        </div>

        <form id="form-join-room" class="join-form">
          <input type="text" id="join-room-input" placeholder="Oda Kodu (örn: 1a23, 123a) veya tam link..." data-i18n-placeholder="join_input_placeholder" autocomplete="off">
          <button type="submit" class="btn btn-secondary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>
            <span data-i18n="btn_join">Katıl</span>
          </button>
        </form>
      </section>

      <!-- Feature Highlights -->
      <section class="features-grid">
        <div class="feature-item">
          <div class="feature-icon">🛡️</div>
          <h3 data-i18n="feat_1_title">Sıfır Disk İzi</h3>
          <p data-i18n="feat_1_desc">Hiçbir veri sunucu diskine yazılmaz. Yalnızca geçici RAM'de tutulur, süre dolunca buharlaşır.</p>
        </div>
        <div class="feature-item">
          <div class="feature-icon">📱</div>
          <h3 data-i18n="feat_2_title">Kısa Link & QR Kod</h3>
          <p data-i18n-html="feat_2_desc">Kamerayı QR koda tutun veya <code>/chat/a123</code> gibi kısa linkle anında aynı odaya bağlanın.</p>
        </div>
        <div class="feature-item">
          <div class="feature-icon">⚡</div>
          <h3 data-i18n="feat_3_title">Gerçek Zamanlı Eşzamanlama</h3>
          <p data-i18n="feat_3_desc">Bir cihazdan eklenen metin, link veya fotoğraf diğer cihazlara anında yansır.</p>
        </div>
      </section>

      <!-- Security & Disclaimer Banner -->
      <section class="security-banner">
        <div class="security-banner-content">
          <div class="security-badge-icon">⚖️</div>
          <div class="security-banner-text" data-i18n-html="security_banner_text">
            <strong>Önemli Yasal Bildirim:</strong> Ulak geçici ve deneysel bir anlık aktarım aracıdır. Uçtan uca mutlak gizlilik garanti edilmez. Şifre, kredi kartı veya özel/gizli bilgilerinizi kesinlikle paylaşmayınız. İllegal içerik paylaşımı kesinlikle yasaktır; tüm hukuki ve cezai sorumluluk kullanıcıya aittir.
          </div>
          <button type="button" id="btn-open-legal" class="btn btn-sm btn-outline" data-i18n="btn_legal_terms">
            Yasal Şartlar & Sorumluluk Reddi
          </button>
        </div>
      </section>

      <!-- Landing Footer -->
      <footer class="landing-footer">
        <div class="footer-links">
          <a href="#" id="link-legal-privacy" class="footer-link" data-i18n="footer_privacy">Gizlilik Bildirimi</a>
          <span class="footer-dot">•</span>
          <a href="#" id="link-legal-terms" class="footer-link" data-i18n="footer_terms">Kullanım Şartları</a>
          <span class="footer-dot">•</span>
          <a href="#" id="link-legal-disclaimer" class="footer-link" data-i18n="footer_disclaimer">Sorumluluk Reddi</a>
          <span class="footer-dot">•</span>
          <a href="admin.html" class="footer-link" target="_blank" data-i18n="footer_admin">Yönetici</a>
        </div>
        <div class="footer-copy" data-i18n="footer_copy">
          Ulak — RAM üzerinde çalışan geçici ve anlık veri aktarım servisi. Sunucuda kalıcı log tutulmaz.
        </div>
      </footer>
    </main>

    <!-- ========================================== -->
    <!-- VIEW 2: ACTIVE SESSION ROOM                -->
    <!-- ========================================== -->
    <main id="room-view" class="view-screen hidden">
      <!-- Room Top Navigation Bar -->
      <header class="room-header">
        <div class="room-header-left">
          <a href="./" class="room-brand" title="Ana Sayfaya Dön">
            <svg class="brand-icon-sm" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="brand-grad-sm" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#06b6d4"/><stop offset="100%" stop-color="#6366f1"/></linearGradient><linearGradient id="arrow-grad-sm1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#06b6d4"/></linearGradient><linearGradient id="arrow-grad-sm2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#818cf8"/><stop offset="100%" stop-color="#a855f7"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="#0f172a" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/><circle cx="32" cy="32" r="22" fill="url(#brand-grad-sm)" opacity="0.15"/><path d="M18 32C18 24.27 24.27 18 32 18C38.2 18 43.47 22.05 45.24 27.7" stroke="url(#arrow-grad-sm1)" stroke-width="4.5" stroke-linecap="round"/><polyline points="39 28.5 45.5 28.5 47 22" stroke="url(#arrow-grad-sm1)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M46 32C46 39.73 39.73 46 32 46C25.8 46 20.53 41.95 18.76 36.3" stroke="url(#arrow-grad-sm2)" stroke-width="4.5" stroke-linecap="round"/><polyline points="25 35.5 18.5 35.5 17 42" stroke="url(#arrow-grad-sm2)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="32" cy="32" r="3.5" fill="#38bdf8"/></svg>
            <span class="room-brand-text">Ulak</span>
          </a>
          <div class="room-id-pill" id="room-id-badge" title="Oda Adını Kopyala">
            <span class="room-id-label" data-i18n="room_label">Oda:</span>
            <span class="room-id-value" id="current-room-name">...</span>
            <svg class="copy-icon-inline" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </div>
          <button type="button" class="device-pill" id="btn-device-name" title="Cihazınızın adını değiştirin">
            <span class="device-dot-indicator" id="header-device-dot"></span>
            <span class="device-pill-name" id="header-device-name">Cihazım</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          </button>
        </div>

        <div class="room-header-center">
          <div class="live-pill" id="device-counter-badge" title="Bağlı Cihazlar">
            <span class="pulse-dot"></span>
            <span id="device-count-text">1 Cihaz Bağlı</span>
          </div>
          <div class="timer-pill" id="ttl-timer-badge" title="Kalan Süre">
            <span id="ttl-timer-icon">⏳</span>
            <span id="ttl-countdown-text">Hesaplanıyor...</span>
          </div>
        </div>

        <div class="room-header-right">
          <button type="button" class="lang-toggle-btn" id="room-lang-toggle" title="Change Language / Dili Değiştir">
            <span class="lang-flag" id="room-lang-flag">🌐</span>
            <span class="lang-text" id="room-lang-text">EN</span>
          </button>
          <button id="btn-show-qr" class="btn btn-sm btn-outline" title="Cihaz Ekle / QR Kod">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
            <span class="hide-mobile" data-i18n="btn_qr">QR Kod</span>
          </button>
          <button id="btn-copy-link" class="btn btn-sm btn-outline" title="Bağlantıyı Kopyala">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
            <span class="hide-mobile" data-i18n="btn_copy_link">Linki Kopyala</span>
          </button>
          <button id="btn-prompt-destroy" class="btn btn-sm btn-danger" title="Odayı Şimdi İmha Et">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
            <span class="hide-mobile" data-i18n="btn_destroy">İmha Et</span>
          </button>
        </div>
      </header>

      <!-- Navigation Tabs (Clips Stream vs Live Shared Notepad) -->
      <nav class="room-tabs">
        <button class="room-tab-btn active" id="tab-clips-btn" data-tab="clips">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          <span data-i18n="tab_clips">Pano & Fotoğraf Akışı</span>
          <span class="tab-badge" id="clips-counter">0</span>
        </button>
        <button class="room-tab-btn" id="tab-livepad-btn" data-tab="livepad">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          <span data-i18n="tab_livepad">Canlı Ortak Not Defteri</span>
          <span class="live-sync-indicator" data-i18n="live_sync_tag" title="Her iki tarafta da anlık yazılır">CANLI</span>
        </button>
      </nav>

      <!-- TAB CONTENT 1: CLIPS STREAM -->
      <div id="tab-clips-content" class="tab-content active">
        <!-- New Item Composer Card -->
        <section class="card composer-card">
          <div class="composer-body">
            <textarea id="composer-text" placeholder="Yazı, link veya kod yapıştırın ya da yazın... (Ctrl+Enter ile gönder, Ctrl+V ile resim yapıştır)" data-i18n-placeholder="composer_placeholder" rows="3"></textarea>

            <!-- Image preview banner if an image is selected -->
            <div id="composer-img-preview" class="image-preview-box hidden">
              <div class="preview-img-wrapper">
                <img id="preview-img-tag" src="" alt="Yüklenecek Resim">
              </div>
              <div class="preview-info">
                <span id="preview-filename">image.jpg</span>
                <span id="preview-filesize">...</span>
              </div>
              <button type="button" id="btn-cancel-preview" class="btn-icon btn-cancel" title="Görseli Kaldır">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </div>

          <div class="composer-toolbar">
            <div class="toolbar-left">
              <button type="button" id="btn-quick-paste" class="btn btn-sm btn-ghost" title="Cihazınızın panosundaki metni veya resmi tek tıkla buraya yapıştırır">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                <span data-i18n="btn_paste">Panodan Yapıştır</span>
              </button>

              <label for="image-upload-input" class="btn btn-sm btn-ghost file-input-label" title="Fotoğraf veya Resim Ekle">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                <span data-i18n="btn_upload">Fotoğraf Ekle</span>
                <input type="file" id="image-upload-input" accept="image/*" class="sr-only">
              </label>
            </div>

            <div class="toolbar-right">
              <button id="btn-send-clip" class="btn btn-primary btn-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                <span data-i18n="btn_send">Gönder</span>
              </button>
            </div>
          </div>
        </section>

        <div class="composer-security-tip">
          <span>🛡️</span>
          <span data-i18n-html="composer_security_tip">Önemli: Şifre, kredi kartı veya hassas kişisel bilgi paylaşmayınız. <a href="#" id="link-composer-legal">Yasal Uyarı & Gizlilik</a></span>
        </div>

        <!-- Clips Feed List -->
        <section class="clips-stream-wrapper">
          <div class="clips-stream-header">
            <h3 class="section-subtitle" data-i18n="clips_section_title">Paylaşılan Pano Öğeleri</h3>
            <button id="btn-clear-all" class="btn-link" data-i18n="btn_clear_all" title="Tüm panoyu temizle">Tümünü Temizle</button>
          </div>

          <div id="clips-container" class="clips-container">
            <div id="empty-clips-placeholder" class="empty-state">
              <div class="empty-state-icon">📋</div>
              <h4 data-i18n="empty_clips_title">Henüz bir öğe paylaşılmadı</h4>
              <p data-i18n="empty_clips_desc">Yukarıdaki alana bir metin yazın, "Panodan Yapıştır" butonuna basın veya resim ekleyin. Diğer cihazlarınız anında görecek.</p>
            </div>
          </div>
        </section>
      </div>

      <!-- TAB CONTENT 2: LIVE SHARED NOTEPAD -->
      <div id="tab-livepad-content" class="tab-content hidden">
        <section class="card livepad-card">
          <div class="livepad-header">
            <div class="livepad-info">
              <h3 data-i18n="livepad_title">Ortak Anlık Not Defteri</h3>
              <p class="text-muted" data-i18n="livepad_desc">Buraya yazılan her harf bağlı tüm cihazlarda canlı güncellenir. Gönder butonuna gerek yoktur.</p>
            </div>
            <div class="livepad-actions">
              <button id="btn-livepad-paste" class="btn btn-sm btn-outline">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                <span>Panodan Yapıştır</span>
              </button>
              <button id="btn-livepad-copy" class="btn btn-sm btn-primary">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                <span data-i18n="livepad_copy">Tümünü Kopyala</span>
              </button>
              <button id="btn-livepad-clear" class="btn btn-sm btn-ghost text-danger" data-i18n="livepad_clear">Temizle</button>
            </div>
          </div>
          <!-- Author Colors Legend Bar -->
          <div class="livepad-legend-bar" id="livepad-legend-bar">
            <span class="legend-title" data-i18n="livepad_legend">Yazar İmzaları:</span>
            <div id="livepad-authors-chips" class="livepad-authors-chips"></div>
            <div style="margin-left: auto;">
              <button type="button" class="btn btn-sm btn-ghost" id="btn-toggle-neon-highlighter" title="Neon yazar vurgusunu aç/kapat" style="font-size: 0.76rem; padding: 2px 8px;">
                🎨 <span id="neon-toggle-text">Vurgu: Açık</span>
              </button>
            </div>
          </div>

          <div class="livepad-editor-wrapper" id="livepad-editor-wrapper">
            <div class="livepad-backdrop" id="livepad-backdrop" aria-hidden="true">
              <div class="livepad-highlights" id="livepad-highlights"></div>
            </div>
            <textarea id="livepad-textarea" class="livepad-textarea" placeholder="İki cihaz arasında canlı olarak paylaşmak istediğiniz metni buraya yazın veya yapıştırın..." data-i18n-placeholder="livepad_placeholder" spellcheck="false"></textarea>
          </div>
          <div class="livepad-footer">
            <span id="livepad-char-count">0 karakter | 0 kelime</span>
            <span id="livepad-sync-status" class="sync-status">🟢 Senkronize</span>
          </div>
        </section>
      </div>

      <!-- Room Footer -->
      <footer class="room-footer" style="margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--border-subtle); text-align: center;">
        <div class="footer-links" style="display: flex; justify-content: center; align-items: center; gap: 12px; margin-bottom: 8px; flex-wrap: wrap;">
          <a href="#" class="footer-link link-room-legal" id="link-room-legal-privacy" data-i18n="footer_privacy">Gizlilik Bildirimi</a>
          <span class="footer-dot">•</span>
          <a href="#" class="footer-link link-room-legal" id="link-room-legal-terms" data-i18n="footer_terms">Kullanım Şartları</a>
          <span class="footer-dot">•</span>
          <a href="#" class="footer-link link-room-legal" id="link-room-legal-disclaimer" data-i18n="footer_disclaimer">Sorumluluk Reddi</a>
          <span class="footer-dot">•</span>
          <a href="admin.html" class="footer-link" target="_blank" data-i18n="footer_admin">Yönetici</a>
        </div>
        <div class="footer-copy" data-i18n="footer_copy" style="font-size: 0.76rem; color: var(--text-dim);">
          Ulak — RAM üzerinde çalışan geçici ve anlık veri aktarım servisi. Sunucuda kalıcı log tutulmaz.
        </div>
      </footer>
    </main>

    <!-- ========================================== -->
    <!-- MODAL 1: QR CODE & QUICK LINK MODAL        -->
    <!-- ========================================== -->
    <div id="qr-modal" class="modal-backdrop hidden">
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
            <span data-i18n="modal_qr_title">Cihaz Bağla & QR Kod</span>
          </h3>
          <button type="button" class="btn-close-modal" id="btn-close-qr-modal">&times;</button>
        </div>
        <div class="modal-body text-center">
          <p class="modal-desc" data-i18n="modal_qr_desc">Diğer cihazınızın kamerasıyla bu QR kodu okutarak anında odaya girin:</p>
          
          <div class="qr-image-container" id="qr-canvas-holder"></div>

          <div class="modal-url-box">
            <span id="modal-room-url" class="modal-url-text">https://...</span>
            <button id="btn-modal-copy-link" class="btn btn-sm btn-secondary" title="Linki Kopyala">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span>Kopyala</span>
            </button>
          </div>

          <div class="modal-actions-row">
            <button id="btn-native-share" class="btn btn-outline btn-full hidden">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
              Mobilde Paylaş
            </button>
          </div>

          <div class="network-notice" id="network-notice">
            💡 Diğer cihazınızda sadece bu linki veya kısa oda kodunu girmeniz yeterlidir.
          </div>
        </div>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- MODAL 2: IMAGE LIGHTBOX PREVIEW            -->
    <!-- ========================================== -->
    <div id="lightbox-modal" class="modal-backdrop hidden">
      <div class="lightbox-dialog">
        <div class="lightbox-header">
          <span id="lightbox-filename" class="lightbox-filename" data-i18n="lightbox_default_title">Görsel</span>
          <div class="lightbox-actions">
            <button id="btn-lightbox-download" class="btn btn-sm btn-secondary" title="İndir">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              <span>İndir</span>
            </button>
            <button type="button" class="btn-close-modal" id="btn-close-lightbox">&times;</button>
          </div>
        </div>
        <div class="lightbox-body">
          <img id="lightbox-img" src="" alt="Büyük Görsel">
        </div>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- MODAL 3: SELF-DESTRUCT CONFIRMATION        -->
    <!-- ========================================== -->
    <div id="destroy-confirm-modal" class="modal-backdrop hidden">
      <div class="modal-dialog modal-dialog-sm text-center">
        <div class="destroy-alert-icon">💣</div>
        <h3 class="modal-title" data-i18n="modal_destroy_title">Oturumu Şimdi İmha Et?</h3>
        <p class="modal-desc" data-i18n-html="modal_destroy_desc">Bu işlem oturumdaki tüm metin ve görselleri <strong>sunucu belleğinden kalıcı olarak yok edecektir</strong>. Tüm cihazların bağlantısı kesilir.</p>
        <div class="modal-buttons">
          <button type="button" id="btn-cancel-destroy" class="btn btn-secondary" data-i18n="btn_cancel">Vazgeç</button>
          <button type="button" id="btn-confirm-destroy" class="btn btn-danger" data-i18n="btn_confirm_destroy">Evet, Tamamen İmha Et</button>
        </div>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- SCREEN 3: DESTROYED / EXPIRED NOTICE       -->
    <!-- ========================================== -->
    <div id="destroyed-screen" class="destroyed-overlay hidden">
      <div class="destroyed-card text-center">
        <div class="destroyed-icon">🔥</div>
        <h2 data-i18n="destroyed_title">Oturum Güvenle İmha Edildi</h2>
        <p id="destroyed-reason-text" data-i18n="destroyed_reason_default">Süre doldu veya imha edildi. Sunucu belleğindeki tüm veriler sıfırlandı.</p>
        <button id="btn-restart-app" class="btn btn-primary btn-large">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>
          <span data-i18n="btn_restart_app">Yeni Bir Oturum Aç</span>
        </button>
      </div>
    </div>

    <!-- MODAL: DEVICE RENAME -->
    <div id="device-rename-modal" class="modal-backdrop hidden">
      <div class="modal-dialog modal-dialog-sm">
        <div class="modal-header">
          <h3 class="modal-title" style="display: flex; align-items: center; gap: 8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            <span data-i18n="modal_rename_title">Cihaz Adınızı Belirleyin</span>
          </h3>
          <button type="button" class="btn-close-modal modal-close-btn" id="btn-close-device-modal" title="Kapat">&times;</button>
        </div>
        <div class="modal-body">
          <p class="modal-desc" style="margin-bottom: 12px; font-size: 0.88rem; color: var(--text-muted); line-height: 1.5;">
            <span data-i18n="modal_rename_desc">Mesajlarınızın ve canlı notlarınızın karışmaması için bu cihaza bir isim verin (örn: MacBook, Ofis PC, iPhone):</span>
          </p>
          <div class="form-group">
            <input type="text" id="device-rename-input" placeholder="Örn: MacBook, Ofis PC, iPhone..." data-i18n-placeholder="modal_rename_placeholder" maxlength="24" autocomplete="off" style="width: 100%; padding: 10px 14px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); color: var(--text-main); font-size: 0.95rem;">
          </div>
        </div>
        <div class="modal-buttons" style="display: flex; gap: 10px; margin-top: 18px;">
          <button type="button" class="btn btn-secondary" id="btn-cancel-device-rename" style="flex: 1;" data-i18n="btn_cancel">Vazgeç</button>
          <button type="button" class="btn btn-primary" id="btn-save-device-rename" style="flex: 1;" data-i18n="btn_save">Kaydet</button>
        </div>
      </div>
    </div>

    <!-- MODAL: QUICK PASTE DROPZONE -->
    <div id="quick-paste-modal" class="modal-backdrop hidden">
      <div class="modal-dialog modal-dialog-sm text-center">
        <div class="modal-header">
          <h3 class="modal-title" style="display: flex; align-items: center; gap: 8px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
            <span data-i18n="modal_paste_title">Panodan Yapıştır</span>
          </h3>
          <button type="button" class="btn-close-modal modal-close-btn" id="btn-close-paste-modal">&times;</button>
        </div>
        <div class="modal-body">
          <p class="modal-desc" data-i18n-html="modal_paste_desc" style="margin-bottom: 14px; font-size: 0.88rem; color: var(--text-muted); line-height: 1.5;">
            Tarayıcı güvenlik kısıtlaması nedeniyle panoya doğrudan erişilemedi. Aşağıdaki kutucuğa tıklayıp <strong>Ctrl + V</strong> (Mac: <strong>Cmd + V</strong>) veya mobilde <strong>Yapıştır</strong> yapabilirsiniz:
          </p>
          <div id="quick-paste-zone" class="quick-paste-zone" tabindex="0">
            <div class="quick-paste-icon">📋</div>
            <div class="quick-paste-hint" data-i18n="modal_paste_zone_hint">Buraya tıklayın ve Ctrl+V yapın</div>
            <textarea id="quick-paste-input" class="quick-paste-textarea" placeholder="Panodakini buraya yapıştırın (Metin veya Görsel)..." data-i18n-placeholder="modal_paste_placeholder"></textarea>
          </div>
        </div>
        <div class="modal-buttons" style="margin-top: 16px;">
          <button type="button" class="btn btn-secondary" id="btn-cancel-paste-modal" style="width: 100%;" data-i18n="btn_cancel">Vazgeç</button>
        </div>
      </div>
    </div>

    <div id="toast-container" class="toast-container"></div>
  </div>

  <!-- Standalone QR Code Generator (runs completely in the browser) -->
  <script src="qrcode.min.js"></script>
  <!-- Socket.IO library (optional, for Node.js servers) -->
  <script src="socket.io/socket.io.js" onerror="window.__socketIoFailed = true;"></script>
    <!-- MODAL: LEGAL, PRIVACY & DISCLAIMER -->
    <div id="legal-notice-modal" class="modal-backdrop hidden">
      <div class="modal-dialog modal-dialog-md">
        <div class="modal-header">
          <h3 class="modal-title" style="display: flex; align-items: center; gap: 8px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            <span data-i18n="legal_title">Yasal Uyarı, Gizlilik & Sorumluluk Reddi</span>
          </h3>
          <button type="button" class="btn-close-modal modal-close-btn" id="btn-close-legal-modal">&times;</button>
        </div>
        <div class="modal-body legal-modal-body" id="legal-modal-body" style="max-height: 65vh; overflow-y: auto; padding-right: 8px; font-size: 0.9rem; line-height: 1.6; color: var(--text-muted);">
          
          <div class="legal-section-callout" style="background: rgba(239, 68, 68, 0.1); border-left: 3px solid #ef4444; padding: 12px 14px; border-radius: 4px; margin-bottom: 16px; color: #fca5a5;">
            <strong>⚠️ LÜTFEN DİKKATLE OKUYUNUZ:</strong> Bu servisi kullanarak aşağıdaki şartları ve yasal sorumluluk reddini peşinen, gayrikabili rücu kabul etmiş sayılırsınız.
          </div>

          <h4 style="color: var(--text-main); margin: 14px 0 6px; font-size: 1rem; display: flex; align-items: center; gap: 6px;">
            <span>1.</span> Gizlilik Garantisi Verilmemektedir
          </h4>
          <p>
            Ulak, cihazlarınız arasında (telefon, bilgisayar vb.) pratik ve anlık veri aktarımı sağlamak amacıyla tasarlanmış açık bir web aracıdır. Sistem verileri geçici olarak sunucu belleğinde (RAM) tutsa ve süre bitiminde sıfırlasa dahi, <strong>uçtan uca şifreleme veya mutlak gizlilik garantisi verilmemektedir</strong>.
          </p>
          <p>
            Oda kodunu (örneğin <code>1a23</code>) veya doğrudan bağlantıyı bilen, tahmin eden, URL geçmişinden erişen ya da ortak ağları (halka açık Wi-Fi vb.) izleyen kötü niyetli üçüncü tarafların oturuma katılması teknik olarak mümkün olabilir.
          </p>

          <h4 style="color: var(--text-main); margin: 16px 0 6px; font-size: 1rem; display: flex; align-items: center; gap: 6px;">
            <span>2.</span> Özel, Gizli ve Hassas Bilgi Paylaşımı Yasağı
          </h4>
          <p>
            Kullanıcıların bu platform üzerinden <strong>şifreler, e-posta/hesap giriş bilgileri, kredi kartı ve banka detayları, T.C. kimlik numaraları, ticari sırlar, özel yazışmalar ve her türlü hassas kişisel veri (KVKK kapsamındaki nitelikli veriler dahil) paylaşması KESİNLİKLE YASAKTIR VE ÖNERİLMEZ</strong>.
          </p>
          <p style="color: #f87171;">
            Bu tür hassas bilgilerin paylaşılması durumunda meydana gelebilecek herhangi bir yetkisiz erişim, sızıntı, kopyalanma, çalınma veya üçüncü şahısların eline geçmesi nedeniyle doğabilecek maddi, manevi, cezai veya hukuki hiçbir zarardan <strong>servis sağlayıcı, geliştirici ve site sahibi SORUMLU TUTULAMAZ</strong>. Tüm risk ve sorumluluk münhasıran kullanıcıya aittir.
          </p>

          <h4 style="color: var(--text-main); margin: 16px 0 6px; font-size: 1rem; display: flex; align-items: center; gap: 6px;">
            <span>3.</span> Yasadışı İçerik Yasağı ve Hukuki Sorumluluk
          </h4>
          <p>
            Bu servis; Türkiye Cumhuriyeti Kanunları ve uluslararası mevzuat uyarınca suç teşkil eden, telif hakkı ihlali barındıran, müstehcen/yasadışı materyal, tehdit, hakaret, nefret söylemi, kişisel verileri ihlal eden veya zararlı yazılım/virüs dağıtımı içeren hiçbir içeriğin aktarımı için kullanılamaz.
          </p>
          <p>
            Sistem üzerinden paylaşılan her türlü metin, bağlantı ve dosyanın içeriğinden <strong>doğrudan ve yalnızca içeriği yükleyen/oluşturan kullanıcı sorumludur</strong>. Yetkili resmi makamlardan veya adli mercilerden talep gelmesi durumunda kanuni yükümlülükler eksiksiz yerine getirilir.
          </p>

          <h4 style="color: var(--text-main); margin: 16px 0 6px; font-size: 1rem; display: flex; align-items: center; gap: 6px;">
            <span>4.</span> Hizmetin "Olduğu Gibi" (As-Is) Sunulması
          </h4>
          <p>
            Servis herhangi bir kesintisizlik, veri kurtarma veya doğruluk garantisi olmaksızın "olduğu gibi" sunulmaktadır. Süresi dolan veya imha edilen veriler kalıcı olarak yok edilir; silinen içeriklerin geri getirilmesi teknik olarak imkansızdır. Olası veri kayıplarından sistem sorumlu değildir.
          </p>
        </div>
        <div class="modal-buttons" style="margin-top: 16px;">
          <button type="button" class="btn btn-primary" id="btn-accept-legal" style="width: 100%;">
            <span data-i18n="legal_accept_btn">Şartları & Sorumluluk Reddini Okudum, Anladım</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Main application logic -->
  <script src="app.js?v=<?= @filemtime(__DIR__ . '/app.js') ?: '2.3' ?>"></script>
</body>
</html>

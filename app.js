/**
 * Ulak — Universal Client Application Logic
 * Supports BOTH:
 * 1. Zero-Setup Shared Hosting (cPanel / FTP upload with api.php - NO Node.js required!)
 * 2. Node.js + Socket.IO servers (if running server.js)
 */

(function () {
  'use strict';

  // Application Base Path & URL calculation
  function getAppBase() {
    if (typeof window.__APP_DIR__ === 'string') {
      const folder = window.__APP_DIR__;
      return {
        path: folder,
        url: window.location.origin + (folder ? folder + '/' : '/')
      };
    }

    const pathname = window.location.pathname;
    const segments = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);

    let folder = '';
    if (segments.length >= 1 && (segments[0] === 'c' || segments[0] === 'chat')) {
      folder = '/' + segments[0];
    }

    return {
      path: folder,
      url: window.location.origin + (folder ? folder + '/' : '/')
    };
  }

  const APP_BASE = getAppBase();
  const BASE_PATH = APP_BASE.path; // e.g. "/c" or "/chat" or ""
  const BASE_URL = APP_BASE.url;   // e.g. "https://www.okanyesilyurt.com/c/"

  function getApiUrl(query) {
    return BASE_URL + 'api.php' + (query ? '?' + query : '');
  }
  const DEVICE_COLORS = [
    { id: 'emerald', name: 'Yeşil', accent: '#10b981' },
    { id: 'amber', name: 'Sarı', accent: '#f59e0b' },
    { id: 'cyan', name: 'Mavi', accent: '#06b6d4' },
    { id: 'purple', name: 'Mor', accent: '#a855f7' },
    { id: 'rose', name: 'Pembe', accent: '#f43f5e' },
    { id: 'indigo', name: 'İndigo', accent: '#6366f1' }
  ];

  function getDeviceColor(deviceId) {
    if (!deviceId) return DEVICE_COLORS[0];
    let hash = 0;
    for (let i = 0; i < deviceId.length; i++) {
      hash = (hash << 5) - hash + deviceId.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % DEVICE_COLORS.length;
    return DEVICE_COLORS[idx];
  }

  function getStoredDeviceId() {
    let id = null;
    try { id = localStorage.getItem('ulak_dev_id') || localStorage.getItem('airclip_dev_id'); } catch (e) {}
    if (!id) {
      id = 'dev_' + Math.random().toString(36).substring(2, 10);
      try { localStorage.setItem('ulak_dev_id', id); } catch (e) {}
    }
    return id;
  }

  function getStoredDeviceName() {
    let name = null;
    try { name = localStorage.getItem('ulak_dev_name') || localStorage.getItem('airclip_dev_name'); } catch (e) {}
    if (name && name.trim()) return name.trim();
    return getDeviceName();
  }

  const myDeviceId = getStoredDeviceId();
  let myDeviceName = getStoredDeviceName();
  const myDeviceColor = getDeviceColor(myDeviceId);

  // State
  let currentRoomId = null;
  let currentTtlMode = '1h';
  let roomExpiresAt = null;
  let countdownTimerInterval = null;
  let lanHostUrl = null;
  let pendingImageBase64 = null;
  let pendingImageFile = null;
  let isTypingInLivePad = false;
  let livePadDebounceTimeout = null;
  let lastServerModified = 0;
  let lastLocalPadChangeTime = 0;
  let phpPollInterval = null;
  let socket = null;
  let engineType = 'php'; // 'php' or 'socket'

  // DOM Elements
  const landingView = document.getElementById('landing-view');
  const roomView = document.getElementById('room-view');
  const ttlSelector = document.getElementById('ttl-selector');
  const customRoomInput = document.getElementById('custom-room-input');
  const roomPrefixLabel = document.getElementById('room-prefix-label');
  const btnCreateRoom = document.getElementById('btn-create-room');
  const formJoinRoom = document.getElementById('form-join-room');
  const joinRoomInput = document.getElementById('join-room-input');

  // Room Header Elements
  const currentRoomNameEl = document.getElementById('current-room-name');
  const roomIdBadge = document.getElementById('room-id-badge');
  const deviceCountText = document.getElementById('device-count-text');
  const ttlTimerBadge = document.getElementById('ttl-timer-badge');
  const ttlCountdownText = document.getElementById('ttl-countdown-text');
  const btnShowQr = document.getElementById('btn-show-qr');
  const btnCopyLink = document.getElementById('btn-copy-link');
  const btnPromptDestroy = document.getElementById('btn-prompt-destroy');

  // Tab Elements
  const tabClipsBtn = document.getElementById('tab-clips-btn');
  const tabLivepadBtn = document.getElementById('tab-livepad-btn');
  const tabClipsContent = document.getElementById('tab-clips-content');
  const tabLivepadContent = document.getElementById('tab-livepad-content');
  const clipsCounter = document.getElementById('clips-counter');

  // Composer Elements
  const composerText = document.getElementById('composer-text');
  const composerImgPreview = document.getElementById('composer-img-preview');
  const previewImgTag = document.getElementById('preview-img-tag');
  const previewFilename = document.getElementById('preview-filename');
  const previewFilesize = document.getElementById('preview-filesize');
  const btnCancelPreview = document.getElementById('btn-cancel-preview');
  const btnQuickPaste = document.getElementById('btn-quick-paste');
  const imageUploadInput = document.getElementById('image-upload-input');
  const btnSendClip = document.getElementById('btn-send-clip');
  const clipsContainer = document.getElementById('clips-container');
  const emptyClipsPlaceholder = document.getElementById('empty-clips-placeholder');
  const btnClearAll = document.getElementById('btn-clear-all');

  // Live Notepad Elements
  const livepadTextarea = document.getElementById('livepad-textarea');
  const livepadCharCount = document.getElementById('livepad-char-count');
  const livepadSyncStatus = document.getElementById('livepad-sync-status');
  const btnLivepadCopy = document.getElementById('btn-livepad-copy');
  const btnLivepadPaste = document.getElementById('btn-livepad-paste');
  const btnLivepadClear = document.getElementById('btn-livepad-clear');

  // Modals & Overlays
  const qrModal = document.getElementById('qr-modal');
  const btnCloseQrModal = document.getElementById('btn-close-qr-modal');
  const qrCanvasHolder = document.getElementById('qr-canvas-holder');
  const modalRoomUrl = document.getElementById('modal-room-url');
  const btnModalCopyLink = document.getElementById('btn-modal-copy-link');
  const btnNativeShare = document.getElementById('btn-native-share');
  const lightboxModal = document.getElementById('lightbox-modal');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxFilename = document.getElementById('lightbox-filename');
  const btnCloseLightbox = document.getElementById('btn-close-lightbox');
  const btnLightboxDownload = document.getElementById('btn-lightbox-download');
  const destroyConfirmModal = document.getElementById('destroy-confirm-modal');
  const btnCancelDestroy = document.getElementById('btn-cancel-destroy');
  const btnConfirmDestroy = document.getElementById('btn-confirm-destroy');
  const destroyedScreen = document.getElementById('destroyed-screen');
  const destroyedReasonText = document.getElementById('destroyed-reason-text');
  const btnRestartApp = document.getElementById('btn-restart-app');
  const toastContainer = document.getElementById('toast-container');

  // Device Header & Modal Elements
  const btnDeviceName = document.getElementById('btn-device-name');
  const headerDeviceName = document.getElementById('header-device-name');
  const headerDeviceDot = document.getElementById('header-device-dot');
  const deviceRenameModal = document.getElementById('device-rename-modal');
  const deviceRenameInput = document.getElementById('device-rename-input');
  const btnCloseDeviceModal = document.getElementById('btn-close-device-modal');
  const btnCancelDeviceRename = document.getElementById('btn-cancel-device-rename');
  const btnSaveDeviceRename = document.getElementById('btn-save-device-rename');

  // Livepad Overlay & Neon Highlights Elements
  const livepadBackdrop = document.getElementById('livepad-backdrop');
  const livepadHighlights = document.getElementById('livepad-highlights');
  const livepadAuthorsChips = document.getElementById('livepad-authors-chips');
  const btnToggleNeonHighlighter = document.getElementById('btn-toggle-neon-highlighter');
  const neonToggleText = document.getElementById('neon-toggle-text');
  let currentLivepadChunks = [];
  let isNeonHighlighterActive = true;

  // Update room prefix label
  if (roomPrefixLabel) {
    roomPrefixLabel.textContent = `${window.location.host}${BASE_PATH}/`;
  }

  function getDeviceName() {
    const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const platform = isMobile ? 'Mobil' : 'Masaüstü';
    return `${platform} (${navigator.userAgent.includes('Chrome') ? 'Chrome' : navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Tarayıcı'})`;
  }


  // =============================================================
  // LIVE PAD CHUNKS & NEON AUTHOR HIGHLIGHTS
  // =============================================================

  function sliceChunks(chunks, start, end) {
    if (start >= end) return [];
    const result = [];
    let curPos = 0;

    for (const chunk of chunks) {
      const chunkStart = curPos;
      const chunkEnd = curPos + chunk.t.length;
      curPos = chunkEnd;

      if (chunkEnd <= start || chunkStart >= end) {
        continue;
      }

      const sliceStart = Math.max(0, start - chunkStart);
      const sliceEnd = Math.min(chunk.t.length, end - chunkStart);
      const subText = chunk.t.slice(sliceStart, sliceEnd);
      if (subText) {
        result.push({
          t: subText,
          dev: chunk.dev,
          name: chunk.name,
          color: chunk.color
        });
      }
    }
    return result;
  }

  function mergeChunks(chunks) {
    const merged = [];
    for (const c of chunks) {
      if (!c.t) continue;
      const last = merged[merged.length - 1];
      if (last && last.dev === c.dev && last.color === c.color) {
        last.t += c.t;
      } else {
        merged.push({ ...c });
      }
    }
    return merged;
  }

  function computeUpdatedChunks(prevChunks, newText, authorDev, authorName, authorColor) {
    if (!newText) return [];
    if (!prevChunks || prevChunks.length === 0) {
      return [{ t: newText, dev: authorDev, name: authorName, color: authorColor }];
    }

    const oldText = prevChunks.map(c => c.t).join('');
    if (oldText === newText) return prevChunks;

    let prefixLen = 0;
    const maxPrefix = Math.min(oldText.length, newText.length);
    while (prefixLen < maxPrefix && oldText[prefixLen] === newText[prefixLen]) {
      prefixLen++;
    }

    let suffixLen = 0;
    const maxSuffix = Math.min(oldText.length - prefixLen, newText.length - prefixLen);
    while (suffixLen < maxSuffix && oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]) {
      suffixLen++;
    }

    const insertedText = newText.slice(prefixLen, newText.length - suffixLen);
    const prefixChunks = sliceChunks(prevChunks, 0, prefixLen);
    const suffixChunks = sliceChunks(prevChunks, oldText.length - suffixLen, oldText.length);

    const res = [...prefixChunks];
    if (insertedText.length > 0) {
      res.push({
        t: insertedText,
        dev: authorDev,
        name: authorName,
        color: authorColor
      });
    }
    res.push(...suffixChunks);
    return mergeChunks(res);
  }

  function renderLivepadHighlights(chunks) {
    if (!livepadHighlights) return;
    if (!chunks || chunks.length === 0) {
      livepadHighlights.innerHTML = '';
      updateAuthorsLegend([]);
      return;
    }

    const html = chunks.map(chunk => {
      const colorId = chunk.color || 'cyan';
      const cleanText = escapeHtml(chunk.t);
      return `<span class="neon-chunk neon-chunk-${colorId}" title="Yazan: ${escapeHtml(chunk.name || 'Cihaz')}">${cleanText}</span>`;
    }).join('');

    livepadHighlights.innerHTML = html + '<br>';
    updateAuthorsLegend(chunks);
  }

  function updateAuthorsLegend(chunks) {
    if (!livepadAuthorsChips) return;
    const authorMap = new Map();

    authorMap.set(myDeviceId, {
      dev: myDeviceId,
      name: `${myDeviceName} (Sen)`,
      color: myDeviceColor.id
    });

    if (chunks && Array.isArray(chunks)) {
      for (const c of chunks) {
        if (c.dev && c.dev !== myDeviceId && !authorMap.has(c.dev)) {
          const col = c.color || getDeviceColor(c.dev).id;
          authorMap.set(c.dev, {
            dev: c.dev,
            name: c.name || 'Diğer Cihaz',
            color: col
          });
        }
      }
    }

    livepadAuthorsChips.innerHTML = Array.from(authorMap.values()).map(a => {
      const isMe = a.dev === myDeviceId;
      const extraClass = isMe ? ' device-pill my-device-chip' : '';
      const extraTitle = isMe ? ' title="Cihaz adınızı değiştirmek için tıklayın"' : '';
      return `<span class="legend-chip chip-${a.color}${extraClass}"${extraTitle} style="${isMe ? 'cursor: pointer;' : ''}">● ${escapeHtml(a.name)}${isMe ? ' ✏️' : ''}</span>`;
    }).join('');
  }

  function syncLivepadScroll() {
    if (livepadBackdrop && livepadTextarea) {
      livepadBackdrop.scrollTop = livepadTextarea.scrollTop;
      livepadBackdrop.scrollLeft = livepadTextarea.scrollLeft;
    }
  }

  function updateDeviceHeaderBadge() {
    const allDeviceNames = document.querySelectorAll('#header-device-name, .header-device-name, .device-pill-name, #landing-device-name-text');
    allDeviceNames.forEach(el => { el.textContent = myDeviceName; });

    const allDeviceDots = document.querySelectorAll('#header-device-dot, .header-device-dot, .device-dot-indicator, #landing-device-dot');
    allDeviceDots.forEach(el => {
      el.style.background = myDeviceColor.accent;
      el.style.boxShadow = `0 0 6px ${myDeviceColor.accent}`;
    });

    updateAuthorsLegend(currentLivepadChunks);
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatTime(timestamp) {
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function looksLikeRawCode(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{') && trimmed.endsWith('}') && trimmed.includes(':')) return 'JSON';
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) return 'JSON';
    if (trimmed.startsWith('<?php')) return 'PHP';
    if (/^(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE)\s+/i.test(trimmed)) return 'SQL';
    if (/^<!DOCTYPE\s+html|<html[\s>]|<svg[\s>]/i.test(trimmed)) return 'HTML';
    if (/^(const|let|var|function|import|export|class)\s+[a-zA-Z0-9_$]+/m.test(trimmed) && (trimmed.includes(';') || trimmed.includes('{'))) return 'JAVASCRIPT';
    if (/^(def\s+[a-zA-Z0-9_$]+\s*\(|from\s+[a-zA-Z0-9_.]+\s+import|import\s+[a-zA-Z0-9_]+)/m.test(trimmed)) return 'PYTHON';
    if (/^(npm|yarn|pnpm|git|docker|docker-compose|curl|wget|sudo|chmod|chown|pip|composer|systemctl|service|ssh|apt|brew|kubectl)\s+[^\n]+/i.test(trimmed)) return 'BASH';
    return null;
  }

  function isCommandLine(line) {
    const t = (line || '').trim();
    if (!t) return false;
    const cmd = t.replace(/^[\$#>]\s+/, '');
    return /^(npm|npx|yarn|pnpm|pip|pip3|python|python3|node|php|composer|git|docker|docker-compose|curl|wget|sudo|chmod|chown|systemctl|service|ssh|scp|mkdir|rm|mv|cp|apt|apt-get|brew|dotnet|cargo|kubectl|pm2|nvm|deno|bun)\s+[^\n]+$/i.test(cmd);
  }

  function parseFormattedContent(text) {
    if (!text) return '';

    let workingText = text;

    // Auto-detect code blocks if not already formatted with markdown backticks
    if (!workingText.includes('```')) {
      const rawLang = looksLikeRawCode(workingText);
      if (rawLang) {
        workingText = '```' + rawLang + '\n' + workingText.trim() + '\n```';
      } else {
        const lines = workingText.split('\n');
        const newLines = [];
        let inCmdBlock = false;
        let cmdBuffer = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (isCommandLine(line)) {
            inCmdBlock = true;
            cmdBuffer.push(line.trim());
          } else {
            if (inCmdBlock) {
              newLines.push('```BASH\n' + cmdBuffer.join('\n') + '\n```');
              cmdBuffer = [];
              inCmdBlock = false;
            }
            newLines.push(line);
          }
        }
        if (inCmdBlock) {
          newLines.push('```BASH\n' + cmdBuffer.join('\n') + '\n```');
        }
        workingText = newLines.join('\n');
      }
    }

    // 1. Extract markdown fenced code blocks: ```lang ... ```
    const codeBlocks = [];
    let processed = workingText.replace(/```([a-zA-Z0-9_\-\+]*)\n?([\s\S]*?)```/g, (match, lang, code) => {
      const id = '___CODE_BLOCK_' + codeBlocks.length + '___';
      codeBlocks.push({ lang: (lang || 'KOD').toUpperCase(), code: code.trim() });
      return id;
    });

    // 2. Extract inline code: `code`
    const inlineCodes = [];
    processed = processed.replace(/`([^`\n]+)`/g, (match, code) => {
      const id = '___INLINE_CODE_' + inlineCodes.length + '___';
      inlineCodes.push(code);
      return id;
    });

    // 3. Escape HTML
    processed = escapeHtml(processed);

    // 4. Linkify remaining URLs
    const urlPattern = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
    processed = processed.replace(urlPattern, (url) => {
      return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>';
    });

    // 5. Convert line breaks (outside code blocks) to <br>
    processed = processed.replace(/\n/g, '<br>');

    // 6. Restore inline codes with mini copy button
    inlineCodes.forEach((code, idx) => {
      const cleanCode = escapeHtml(code);
      const pill = `<span class="inline-code-pill"><code>${cleanCode}</code><button type="button" class="btn-copy-inline" data-code="${cleanCode}" title="Kodu Kopyala"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button></span>`;
      processed = processed.replace('___INLINE_CODE_' + idx + '___', pill);
    });

    // 7. Restore code blocks with mini header, language tag, and mini copy button
    codeBlocks.forEach((item, idx) => {
      const cleanCode = escapeHtml(item.code);
      const cleanLang = escapeHtml(item.lang);
      const block = `<div class="code-block-wrapper"><div class="code-block-header"><span class="code-lang-tag">${cleanLang}</span><button type="button" class="btn-copy-code" data-code="${cleanCode}" title="Kodu Kopyala"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><span>Kopyala</span></button></div><pre class="code-pre"><code>${cleanCode}</code></pre></div>`;
      processed = processed.replace(new RegExp('(?:<br>)?___CODE_BLOCK_' + idx + '___(?:<br>)?', 'g'), block);
    });

    return processed;
  }

  function extractFirstUrl(text) {
    const urlPattern = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/;
    const match = text.match(urlPattern);
    return match ? match[0] : null;
  }

  function showToast(message, type = 'normal') {
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'danger' ? 'toast-danger' : type === 'success' ? 'toast-success' : ''}`;
    toast.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
      <span>${message}</span>
    `;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      showToast('Panoya kopyalandı!', 'success');
    } catch (err) {
      showToast('Kopyalama başarısız oldu.', 'danger');
    }
  }

  async function fetchSystemInfo() {
    try {
      const res = await fetch(`${BASE_PATH}/api/info`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.lanIp) lanHostUrl = data.lanUrl;
      }
    } catch (e) {
      // Local or PHP mode
    }
  }

  function getShareableRoomUrl(roomId) {
    let origin = window.location.origin;
    if ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && lanHostUrl) {
      origin = lanHostUrl;
    }
    return `${origin}${BASE_PATH}/${roomId}`;
  }

  function compressImage(file, maxDimension = 1920, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          const dataUrl = canvas.toDataURL(mimeType, quality);
          resolve({
            dataUrl,
            width,
            height,
            estimatedSize: Math.round((dataUrl.length * 3) / 4)
          });
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleImageFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Lütfen geçerli bir görsel seçin.', 'danger');
      return;
    }

    try {
      showToast('Görsel optimize ediliyor...');
      const compressed = await compressImage(file);
      pendingImageBase64 = compressed.dataUrl;
      pendingImageFile = {
        name: file.name,
        size: compressed.estimatedSize,
        type: file.type
      };

      previewImgTag.src = compressed.dataUrl;
      previewFilename.textContent = file.name;
      previewFilesize.textContent = formatBytes(compressed.estimatedSize);
      composerImgPreview.classList.remove('hidden');
      composerText.focus();
    } catch (err) {
      console.error(err);
      showToast('Görsel işlenirken hata oluştu.', 'danger');
    }
  }

  function clearPendingImage() {
    pendingImageBase64 = null;
    pendingImageFile = null;
    previewImgTag.src = '';
    composerImgPreview.classList.add('hidden');
    imageUploadInput.value = '';
  }

  async function handlePasteAction() {
    try {
      if (!navigator.clipboard) {
        showToast('Panoya erişim desteklenmiyor.', 'danger');
        return;
      }

      if (navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imageType = item.types.find(t => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            const file = new File([blob], `clipboard-image-${Date.now()}.png`, { type: imageType });
            await handleImageFile(file);
            showToast('Panodaki görsel eklendi!', 'success');
            return;
          }
        }
      }

      const text = await navigator.clipboard.readText();
      if (text) {
        composerText.value = (composerText.value ? composerText.value + '\n' : '') + text;
        composerText.focus();
        showToast('Panodaki metin yapıştırıldı!', 'success');
      } else {
        showToast('Pano boş.', 'danger');
      }
    } catch (err) {
      showToast('Lütfen panoya erişim izni verin.', 'danger');
    }
  }

  // =============================================================
  // UNIVERSAL SYNC ENGINE (PHP POLLING & NODE SOCKET.IO)
  // =============================================================

  function joinRoom(roomId) {
    currentRoomId = roomId;
    window.history.replaceState({}, '', `${BASE_PATH}/${roomId}`);

    currentRoomNameEl.textContent = roomId;
    landingView.classList.add('hidden');
    roomView.classList.remove('hidden');
    destroyedScreen.classList.add('hidden');
    composerText.focus();

    // Check if Socket.IO is available and not failed
    if (typeof io !== 'undefined' && !window.__socketIoFailed) {
      try {
        engineType = 'socket';
        connectSocket(roomId);
        return;
      } catch (e) {
        console.warn('Socket connection failed, switching to PHP sync', e);
      }
    }

    // Default: Shared hosting PHP sync
    engineType = 'php';
    startPhpSync(roomId);
  }

  function connectSocket(roomId) {
    if (!socket) {
      socket = io({
        path: BASE_PATH ? `${BASE_PATH}/socket.io` : '/socket.io',
        timeout: 4000
      });
      setupSocketListeners();
    }

    socket.emit('join_room', {
      roomId,
      deviceName: myDeviceName
    });
  }

  function setupSocketListeners() {
    socket.on('connect_error', () => {
      // Fallback to PHP engine if Node socket drops on shared hosting
      if (engineType === 'socket') {
        console.log('Socket failed, activating PHP engine...');
        engineType = 'php';
        startPhpSync(currentRoomId);
      }
    });

    socket.on('room_error', (data) => {
      showToast(data.message || 'Oturuma bağlanılamadı.', 'danger');
      setTimeout(() => { window.location.href = BASE_URL; }, 2000);
    });

    socket.on('room_joined', (data) => {
      currentTtlMode = data.ttlMode;
      roomExpiresAt = data.expiresAt;
      startTtlCountdown();
      renderAllClips(data.items || []);
      if (data.livePad !== undefined) {
        livepadTextarea.value = data.livePad || '';
        currentLivepadChunks = (data.livePadChunks && data.livePadChunks.length > 0)
          ? data.livePadChunks
          : (data.livePad ? [{ t: data.livePad, dev: 'init', name: 'Ortak', color: 'cyan' }] : []);
        renderLivepadHighlights(currentLivepadChunks);
        syncLivepadScroll();
        updateLivepadStats();
      }
      updateDeviceCount(data.deviceCount || 1);
      showToast(`Odaya bağlanıldı: ${data.roomId}`, 'success');
    });

    socket.on('device_count_updated', (data) => updateDeviceCount(data.count || 1));

    socket.on('burn_countdown_started', (data) => {
      roomExpiresAt = data.expiresAt;
      showToast('🔥 İkinci cihaz bağlandı! 60 saniye içinde kendini imha edecek.', 'danger');
      startTtlCountdown();
    });

    socket.on('item_added', (item) => addClipToDom(item, true));

    socket.on('item_deleted', ({ itemId }) => {
      const el = document.getElementById(`clip-${itemId}`);
      if (el) {
        el.style.opacity = '0';
        el.style.transform = 'scale(0.95)';
        setTimeout(() => el.remove(), 200);
      }
      updateClipsCounter();
    });

    socket.on('all_items_cleared', () => {
      clipsContainer.innerHTML = '';
      clipsContainer.appendChild(emptyClipsPlaceholder);
      emptyClipsPlaceholder.classList.remove('hidden');
      updateClipsCounter();
    });

    socket.on('live_pad_synced', (data) => {
      if (!isTypingInLivePad) {
        const start = livepadTextarea.selectionStart;
        const end = livepadTextarea.selectionEnd;
        livepadTextarea.value = data.text || '';
        livepadTextarea.setSelectionRange(start, end);
        updateLivepadStats();
        livepadSyncStatus.textContent = `🟢 ${data.updatedBy} güncelledi`;
        if (data.chunks && Array.isArray(data.chunks)) {
          currentLivepadChunks = data.chunks;
        } else if (data.text) {
          currentLivepadChunks = [{
            t: data.text,
            dev: 'other',
            name: data.updatedBy || 'Cihaz',
            color: getDeviceColor(data.updatedBy).id
          }];
        } else {
          currentLivepadChunks = [];
        }
        renderLivepadHighlights(currentLivepadChunks);
        syncLivepadScroll();
      }
    });

    socket.on('room_destroyed', (data) => {
      onRoomDestroyed(data.reason);
    });
  }

  // PHP Polling Engine (Every 1.5 seconds)
  function startPhpSync(roomId) {
    if (phpPollInterval) clearInterval(phpPollInterval);

    async function poll() {
      try {
        const url = `${BASE_PATH}/api.php?action=get_room&id=${encodeURIComponent(roomId)}&dev=${myDeviceId}&dev_name=${encodeURIComponent(myDeviceName)}`;
        const res = await fetch(url);
        
        if (res.status === 404) {
          onRoomDestroyed('Oturum süresi doldu veya imha edildi.');
          clearInterval(phpPollInterval);
          return;
        }

        if (!res.ok) return;

        const data = await res.json();
        currentTtlMode = data.ttlMode;
        roomExpiresAt = data.expiresAt;
        startTtlCountdown();
        updateDeviceCount(data.deviceCount || 1);

        // Check if new items exist
        if (data.lastModified !== lastServerModified) {
          lastServerModified = data.lastModified;
          renderAllClips(data.items || []);
        }

        // Live notepad sync
        if (!isTypingInLivePad && data.livePadUpdatedAt > lastLocalPadChangeTime) {
          if (livepadTextarea.value !== data.livePad) {
            const start = livepadTextarea.selectionStart;
            const end = livepadTextarea.selectionEnd;
            livepadTextarea.value = data.livePad || '';
            livepadTextarea.setSelectionRange(start, end);
            updateLivepadStats();
            if (data.livePadUpdatedBy) {
              livepadSyncStatus.textContent = `🟢 ${data.livePadUpdatedBy} güncelledi`;
            }
            if (data.livePadChunks && Array.isArray(data.livePadChunks)) {
              currentLivepadChunks = data.livePadChunks;
            } else if (data.livePad) {
              currentLivepadChunks = [{
                t: data.livePad,
                dev: 'other',
                name: data.livePadUpdatedBy || 'Cihaz',
                color: getDeviceColor(data.livePadUpdatedBy).id
              }];
            } else {
              currentLivepadChunks = [];
            }
            renderLivepadHighlights(currentLivepadChunks);
            syncLivepadScroll();
          }
        }
      } catch (err) {
        // Temporary network glitch, will retry on next tick
      }
    }

    poll();
    phpPollInterval = setInterval(poll, 1500);
  }

  function onRoomDestroyed(reason) {
    if (countdownTimerInterval) clearInterval(countdownTimerInterval);
    if (phpPollInterval) clearInterval(phpPollInterval);
    destroyedReasonText.textContent = reason || 'Oturum süresi doldu veya imha edildi.';
    destroyedScreen.classList.remove('hidden');
  }

  function updateDeviceCount(count) {
    deviceCountText.textContent = count === 1 ? '1 Cihaz Bağlı' : `${count} Cihaz Bağlı`;
  }

  function startTtlCountdown() {
    if (countdownTimerInterval) clearInterval(countdownTimerInterval);

    function update() {
      if (currentTtlMode === 'burn_read' && !roomExpiresAt) {
        ttlCountdownText.textContent = 'Okunduğunda İmha';
        ttlTimerBadge.classList.remove('urgent');
        return;
      }

      if (!roomExpiresAt) return;

      const diff = roomExpiresAt - Date.now();
      if (diff <= 0) {
        ttlCountdownText.textContent = 'İmha Ediliyor...';
        ttlTimerBadge.classList.add('urgent');
        clearInterval(countdownTimerInterval);
        return;
      }

      const totalSec = Math.floor(diff / 1000);
      const hours = Math.floor(totalSec / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const secs = totalSec % 60;

      let str = '';
      if (hours > 0) {
        str = `${hours}s ${mins.toString().padStart(2, '0')}dk`;
      } else {
        str = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }

      ttlCountdownText.textContent = str;

      if (totalSec < 120) {
        ttlTimerBadge.classList.add('urgent');
      } else {
        ttlTimerBadge.classList.remove('urgent');
      }
    }

    update();
    countdownTimerInterval = setInterval(update, 1000);
  }

  function renderAllClips(items) {
    clipsContainer.innerHTML = '';
    if (!items || items.length === 0) {
      clipsContainer.appendChild(emptyClipsPlaceholder);
      emptyClipsPlaceholder.classList.remove('hidden');
    } else {
      emptyClipsPlaceholder.classList.add('hidden');
      items.forEach(item => addClipToDom(item, false));
    }
    updateClipsCounter();
  }

  function addClipToDom(item, prepend = true) {
    // If element already exists, skip
    if (document.getElementById(`clip-${item.id}`)) return;

    emptyClipsPlaceholder.classList.add('hidden');

    const card = document.createElement('div');
    const isMine = item.senderDeviceId === myDeviceId || (!item.senderDeviceId && item.senderName === myDeviceName);
    card.className = `clip-card ${isMine ? 'clip-outgoing' : 'clip-incoming'}`;
    card.id = `clip-${item.id}`;
    const senderColor = isMine ? myDeviceColor : getDeviceColor(item.senderDeviceId || item.senderName);

    const isImage = item.type === 'image';
    const firstUrl = !isImage ? extractFirstUrl(item.content) : null;

    let contentHtml = '';
    if (isImage) {
      contentHtml = `
        <div class="clip-image-wrapper" data-img="${item.content}" data-name="${item.fileName || 'gorsel.jpg'}">
          <img src="${item.content}" alt="Paylaşılan Fotoğraf" loading="lazy">
        </div>
      `;
    } else {
      contentHtml = `
        <div class="clip-body">${parseFormattedContent(item.content)}</div>
        ${firstUrl ? `
          <div>
            <a href="${firstUrl}" target="_blank" rel="noopener noreferrer" class="clip-link-preview">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
              <span>Yeni Sekmede Aç</span>
            </a>
          </div>
        ` : ''}
      `;
    }

    card.innerHTML = `
      <div class="clip-header">
        <div class="clip-meta">
          <span class="clip-sender">
            <span class="sender-badge-inner">
              <span class="sender-dot" style="background:${senderColor.accent}; box-shadow: 0 0 6px ${senderColor.accent};"></span>
              <span>${isMine ? `Sen (${escapeHtml(item.senderName || 'Bu Cihaz')})` : escapeHtml(item.senderName || 'Diğer Cihaz')}</span>
            </span>
          </span>
          <span>${formatTime(item.createdAt)}</span>
          ${item.fileSize ? `<span>• ${formatBytes(item.fileSize)}</span>` : ''}
        </div>
        <div class="clip-actions">
          ${!isImage ? `
            <button class="btn btn-sm btn-outline btn-copy-clip" title="Metni Kopyala">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span>Kopyala</span>
            </button>
          ` : `
            <button class="btn btn-sm btn-outline btn-download-clip" title="Fotoğrafı İndir">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              <span>İndir</span>
            </button>
          `}
          <button class="btn btn-sm btn-ghost btn-delete-clip" title="Sil">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
      ${contentHtml}
    `;

    const btnCopy = card.querySelector('.btn-copy-clip');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => copyToClipboard(item.content));
    }

    // Mini copy buttons for code snippets inside the card
    card.querySelectorAll('.btn-copy-code').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const wrapper = btn.closest('.code-block-wrapper');
        const code = wrapper ? wrapper.querySelector('code').textContent : btn.getAttribute('data-code');
        if (code) {
          await copyToClipboard(code);
          const origHtml = btn.innerHTML;
          btn.classList.add('copied');
          btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Kopyalandı!</span>`;
          setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = origHtml;
          }, 1800);
        }
      });
    });

    card.querySelectorAll('.btn-copy-inline').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const pill = btn.closest('.inline-code-pill');
        const code = pill ? pill.querySelector('code').textContent : btn.getAttribute('data-code');
        if (code) {
          await copyToClipboard(code);
          btn.classList.add('copied');
          setTimeout(() => btn.classList.remove('copied'), 1500);
        }
      });
    });

    const btnDownload = card.querySelector('.btn-download-clip');
    if (btnDownload) {
      btnDownload.addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = item.content;
        a.download = item.fileName || `ulak-${Date.now()}.jpg`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast('İndirme başlatıldı.');
      });
    }

    const btnDelete = card.querySelector('.btn-delete-clip');
    if (btnDelete) {
      btnDelete.addEventListener('click', async () => {
        if (engineType === 'socket' && socket) {
          socket.emit('delete_item', { itemId: item.id });
        } else {
          card.remove();
          updateClipsCounter();
          await fetch(`${BASE_PATH}/api.php?action=delete_item`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: currentRoomId, itemId: item.id })
          });
        }
      });
    }

    const imgWrapper = card.querySelector('.clip-image-wrapper');
    if (imgWrapper) {
      imgWrapper.addEventListener('click', () => {
        openLightbox(item.content, item.fileName);
      });
    }

    if (prepend && clipsContainer.firstChild) {
      clipsContainer.insertBefore(card, clipsContainer.firstChild);
    } else {
      clipsContainer.appendChild(card);
    }

    updateClipsCounter();
  }

  function updateClipsCounter() {
    const count = clipsContainer.querySelectorAll('.clip-card').length;
    clipsCounter.textContent = count;
  }

  function openLightbox(imgSrc, filename) {
    lightboxImg.src = imgSrc;
    lightboxFilename.textContent = filename || 'Görsel Önizleme';
    btnLightboxDownload.onclick = () => {
      const a = document.createElement('a');
      a.href = imgSrc;
      a.download = filename || `ulak-photo-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
    lightboxModal.classList.remove('hidden');
  }

  async function sendCurrentClip() {
    const text = composerText.value.trim();

    if (pendingImageBase64) {
      const payload = {
        roomId: currentRoomId,
        type: 'image',
        content: pendingImageBase64,
        fileName: pendingImageFile?.name,
        fileSize: pendingImageFile?.size,
        fileType: pendingImageFile?.type,
        senderName: myDeviceName,
        senderDeviceId: myDeviceId
      };

      if (engineType === 'socket' && socket) {
        socket.emit('add_item', payload);
      } else {
        await fetch(`${BASE_PATH}/api.php?action=add_item`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      clearPendingImage();
    }

    if (text) {
      const payload = {
        roomId: currentRoomId,
        type: 'text',
        content: text,
        senderName: myDeviceName,
        senderDeviceId: myDeviceId
      };

      if (engineType === 'socket' && socket) {
        socket.emit('add_item', payload);
      } else {
        await fetch(`${BASE_PATH}/api.php?action=add_item`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      composerText.value = '';
    }

    if (!pendingImageBase64 && !text) {
      showToast('Lütfen bir metin yazın veya görsel ekleyin.', 'danger');
    }
  }

  function updateLivepadStats() {
    const val = livepadTextarea.value || '';
    const chars = val.length;
    const words = val.trim() ? val.trim().split(/\s+/).length : 0;
    livepadCharCount.textContent = `${chars} karakter | ${words} kelime`;
  }

  // Client-Side QR Generation (Zero dependencies, runs 100% inside browser)
  function renderQrCode(url) {
    qrCanvasHolder.innerHTML = '';
    if (window.QRCode) {
      new QRCode(qrCanvasHolder, {
        text: url,
        width: 200,
        height: 200,
        colorDark: '#0f172a',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    } else {
      const img = document.createElement('img');
      img.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
      img.alt = 'QR Kod';
      qrCanvasHolder.appendChild(img);
    }
  }

  function openQrModal() {
    const shareUrl = getShareableRoomUrl(currentRoomId);
    modalRoomUrl.textContent = shareUrl;
    renderQrCode(shareUrl);

    if (navigator.share) {
      btnNativeShare.classList.remove('hidden');
    } else {
      btnNativeShare.classList.add('hidden');
    }

    qrModal.classList.remove('hidden');
  }

  // ==========================================
  // EVENT LISTENERS
  // ==========================================

  ttlSelector.addEventListener('click', (e) => {
    const opt = e.target.closest('.ttl-option');
    if (!opt) return;
    ttlSelector.querySelectorAll('.ttl-option').forEach(b => b.classList.remove('active'));
    opt.classList.add('active');
    currentTtlMode = opt.dataset.ttl;
  });

  btnCreateRoom.addEventListener('click', async () => {
    const customId = customRoomInput.value.trim();
    try {
      btnCreateRoom.disabled = true;
      btnCreateRoom.textContent = 'Oda Başlatılıyor...';

      let data = null;

      // Try Node route first, then PHP fallback
      try {
        const res = await fetch(`${BASE_PATH}/api/rooms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customId, ttlMode: currentTtlMode })
        });
        if (res.ok) data = await res.json();
      } catch (err) {}

      if (!data) {
        // Standard PHP backend
        const res = await fetch(`${BASE_PATH}/api.php?action=create_room`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customId, ttlMode: currentTtlMode })
        });
        data = await res.json();
      }

      if (data && data.success) {
        joinRoom(data.roomId);
      } else {
        showToast('Oda oluşturulamadı.', 'danger');
      }
    } catch (err) {
      showToast('Bağlantı hatası.', 'danger');
    } finally {
      btnCreateRoom.disabled = false;
      btnCreateRoom.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
        Hemen Oturumu Başlat
      `;
    }
  });

  formJoinRoom.addEventListener('submit', (e) => {
    e.preventDefault();
    let val = joinRoomInput.value.trim();
    if (!val) return;

    if (val.includes('/chat/')) {
      val = val.split('/chat/')[1].split('?')[0].split('#')[0];
    } else if (val.includes('/s/')) {
      val = val.split('/s/')[1].split('?')[0].split('#')[0];
    } else if (val.includes('r=')) {
      val = new URL(val).searchParams.get('r');
    } else if (val.includes('room=')) {
      val = new URL(val).searchParams.get('room');
    }

    val = val.replace(/[^a-zA-Z0-9\-_]/g, '');
    if (val) {
      joinRoom(val);
    }
  });

  roomIdBadge.addEventListener('click', () => {
    copyToClipboard(currentRoomId);
  });

  btnCopyLink.addEventListener('click', () => {
    const shareUrl = getShareableRoomUrl(currentRoomId);
    copyToClipboard(shareUrl);
  });

  btnShowQr.addEventListener('click', openQrModal);
  btnCloseQrModal.addEventListener('click', () => qrModal.classList.add('hidden'));
  qrModal.addEventListener('click', (e) => {
    if (e.target === qrModal) qrModal.classList.add('hidden');
  });

  btnModalCopyLink.addEventListener('click', () => {
    copyToClipboard(getShareableRoomUrl(currentRoomId));
  });

  btnNativeShare.addEventListener('click', async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Ulak: ${currentRoomId}`,
          text: `Ulak anlık panosuna katıl:`,
          url: getShareableRoomUrl(currentRoomId)
        });
      } catch (err) {}
    }
  });

  btnCloseLightbox.addEventListener('click', () => lightboxModal.classList.add('hidden'));
  lightboxModal.addEventListener('click', (e) => {
    if (e.target === lightboxModal) lightboxModal.classList.add('hidden');
  });

  btnPromptDestroy.addEventListener('click', () => {
    destroyConfirmModal.classList.remove('hidden');
  });
  btnCancelDestroy.addEventListener('click', () => {
    destroyConfirmModal.classList.add('hidden');
  });
  destroyConfirmModal.addEventListener('click', (e) => {
    if (e.target === destroyConfirmModal) destroyConfirmModal.classList.add('hidden');
  });
  btnConfirmDestroy.addEventListener('click', async () => {
    destroyConfirmModal.classList.add('hidden');
    if (engineType === 'socket' && socket) {
      socket.emit('destroy_room_now');
    } else {
      await fetch(getApiUrl('action=destroy_room'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: currentRoomId })
      });
      onRoomDestroyed('Oturum kullanıcı tarafından anında imha edildi.');
    }
  });

  btnRestartApp.addEventListener('click', () => {
    window.location.href = BASE_URL;
  });

  tabClipsBtn.addEventListener('click', () => {
    tabClipsBtn.classList.add('active');
    tabLivepadBtn.classList.remove('active');
    tabClipsContent.classList.remove('hidden');
    tabLivepadContent.classList.add('hidden');
  });

  tabLivepadBtn.addEventListener('click', () => {
    tabLivepadBtn.classList.add('active');
    tabClipsBtn.classList.remove('active');
    tabLivepadContent.classList.remove('hidden');
    tabClipsContent.classList.add('hidden');
    livepadTextarea.focus();
  });

  btnQuickPaste.addEventListener('click', handlePasteAction);

  imageUploadInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImageFile(e.target.files[0]);
    }
  });

  btnCancelPreview.addEventListener('click', clearPendingImage);
  btnSendClip.addEventListener('click', sendCurrentClip);

  composerText.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      sendCurrentClip();
    }
  });

  window.addEventListener('paste', (e) => {
    if (landingView.classList.contains('hidden')) {
      const items = e.clipboardData?.items;
      if (items) {
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            const blob = item.getAsFile();
            if (blob) {
              handleImageFile(blob);
              showToast('Görsel yapıştırıldı!', 'success');
              break;
            }
          }
        }
      }
    }
  });

  btnClearAll.addEventListener('click', async () => {
    if (confirm('Tüm pano öğelerini bu oturumdan silmek istediğinize emin misiniz?')) {
      if (engineType === 'socket' && socket) {
        socket.emit('clear_items');
      } else {
        clipsContainer.innerHTML = '';
        clipsContainer.appendChild(emptyClipsPlaceholder);
        emptyClipsPlaceholder.classList.remove('hidden');
        updateClipsCounter();
        await fetch(`${BASE_PATH}/api.php?action=clear_items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: currentRoomId })
        });
      }
    }
  });

  livepadTextarea.addEventListener('input', () => {
    isTypingInLivePad = true;
    lastLocalPadChangeTime = Date.now() / 1000;
    const newText = livepadTextarea.value;

    // Compute updated chunks with author neon assignment
    currentLivepadChunks = computeUpdatedChunks(
      currentLivepadChunks,
      newText,
      myDeviceId,
      myDeviceName,
      myDeviceColor.id
    );

    renderLivepadHighlights(currentLivepadChunks);
    syncLivepadScroll();
    updateLivepadStats();
    livepadSyncStatus.textContent = '⏳ Gönderiliyor...';

    clearTimeout(livePadDebounceTimeout);
    livePadDebounceTimeout = setTimeout(async () => {
      const payload = {
        roomId: currentRoomId,
        text: livepadTextarea.value,
        chunks: currentLivepadChunks,
        senderName: myDeviceName,
        senderDeviceId: myDeviceId
      };

      if (engineType === 'socket' && socket) {
        socket.emit('update_live_pad', payload);
      } else {
        await fetch(`${BASE_PATH}/api.php?action=update_live_pad`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      livepadSyncStatus.textContent = '🟢 Senkronize';
      isTypingInLivePad = false;
    }, 250);
  });

  livepadTextarea.addEventListener('scroll', syncLivepadScroll);

  btnLivepadCopy.addEventListener('click', () => {
    copyToClipboard(livepadTextarea.value);
  });

  btnLivepadPaste.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        livepadTextarea.value = text;
        lastLocalPadChangeTime = Date.now() / 1000;
        updateLivepadStats();

        currentLivepadChunks = computeUpdatedChunks(
          currentLivepadChunks,
          livepadTextarea.value,
          myDeviceId,
          myDeviceName,
          myDeviceColor.id
        );
        renderLivepadHighlights(currentLivepadChunks);
        syncLivepadScroll();

        const pastePayload = {
          roomId: currentRoomId,
          text: livepadTextarea.value,
          chunks: currentLivepadChunks,
          senderName: myDeviceName,
          senderDeviceId: myDeviceId
        };

        if (engineType === 'socket' && socket) {
          socket.emit('update_live_pad', pastePayload);
        } else {
          await fetch(`${BASE_PATH}/api.php?action=update_live_pad`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pastePayload)
          });
        }
        showToast('Metin yapıştırıldı ve senkronize edildi!', 'success');
      }
    } catch (e) {
      showToast('Panodan okuma başarısız.', 'danger');
    }
  });

  btnLivepadClear.addEventListener('click', async () => {
    if (confirm('Canlı not defterini temizlemek istiyor musunuz?')) {
      livepadTextarea.value = '';
      lastLocalPadChangeTime = Date.now() / 1000;
      updateLivepadStats();

      currentLivepadChunks = [];
      renderLivepadHighlights(currentLivepadChunks);

      const clearPayload = {
        roomId: currentRoomId,
        text: '',
        chunks: [],
        senderName: myDeviceName,
        senderDeviceId: myDeviceId
      };

      if (engineType === 'socket' && socket) {
        socket.emit('update_live_pad', clearPayload);
      } else {
        await fetch(`${BASE_PATH}/api.php?action=update_live_pad`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(clearPayload)
        });
      }
      showToast('Not defteri temizlendi.');
    }
  });


  // =============================================================
  // DEVICE RENAMING (FAIL-SAFE: AUTO-INJECT MODAL & PROMPT FALLBACK)
  // =============================================================

  function ensureDeviceRenameModal() {
    let modal = document.getElementById('device-rename-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'device-rename-modal';
    modal.className = 'modal-backdrop hidden';
    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-sm">
        <div class="modal-header">
          <h3 class="modal-title" style="display: flex; align-items: center; gap: 8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            Cihaz Adınızı Belirleyin
          </h3>
          <button type="button" class="btn-close-modal modal-close-btn" id="btn-close-device-modal" title="Kapat">&times;</button>
        </div>
        <div class="modal-body">
          <p class="modal-desc" style="margin-bottom: 12px; font-size: 0.88rem; color: var(--text-muted); line-height: 1.5;">
            Mesajlarınızın ve canlı notlarınızın karışmaması için bu cihaza bir isim verin (örn: MacBook, Ofis PC, iPhone):
          </p>
          <div class="form-group">
            <input type="text" id="device-rename-input" placeholder="Örn: MacBook, Ofis PC, iPhone..." maxlength="24" autocomplete="off" style="width: 100%; padding: 10px 14px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); color: var(--text-main); font-size: 0.95rem;">
          </div>
        </div>
        <div class="modal-buttons" style="display: flex; gap: 10px; margin-top: 18px;">
          <button type="button" class="btn btn-secondary" id="btn-cancel-device-rename" style="flex: 1;">Vazgeç</button>
          <button type="button" class="btn btn-primary" id="btn-save-device-rename" style="flex: 1;">Kaydet</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function openDeviceRenameModal() {
    try {
      const modal = ensureDeviceRenameModal();
      const input = document.getElementById('device-rename-input');
      if (modal && input) {
        input.value = myDeviceName;
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        modal.style.zIndex = '99999';
        setTimeout(() => {
          input.focus();
          input.select();
        }, 50);
        return;
      }
    } catch (err) {
      console.warn('Modal open error, falling back to prompt:', err);
    }

    // Direct browser prompt fallback - NEVER fails under any browser environment
    const newName = window.prompt('Cihaz adınızı belirleyin (örn: MacBook, Ofis PC, iPhone):', myDeviceName);
    if (newName && newName.trim()) {
      applyDeviceName(newName.trim());
    }
  }

  function closeDeviceRenameModal() {
    const modal = document.getElementById('device-rename-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
  }

  function applyDeviceName(newName) {
    const val = (newName || '').trim();
    if (!val) {
      showToast('Cihaz adı boş olamaz.', 'danger');
      return;
    }
    myDeviceName = val;
    try {
      localStorage.setItem('ulak_dev_name', myDeviceName);
      localStorage.setItem('airclip_dev_name', myDeviceName);
    } catch (e) {}

    updateDeviceHeaderBadge();
    closeDeviceRenameModal();
    showToast(`Cihaz adınız güncellendi: ${myDeviceName}`, 'success');

    if (engineType === 'socket' && socket) {
      socket.emit('update_device_name', { deviceName: myDeviceName });
    }
  }

  function saveDeviceName() {
    const input = document.getElementById('device-rename-input');
    const val = input ? input.value : myDeviceName;
    applyDeviceName(val);
  }

  // Direct click binding if button exists
  if (btnDeviceName) {
    btnDeviceName.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openDeviceRenameModal();
    });
  }

  // =============================================================
  // LEGAL, PRIVACY & DISCLAIMER MODAL HANDLERS
  // =============================================================

  function openLegalNoticeModal() {
    const modal = document.getElementById('legal-notice-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      modal.style.zIndex = '10001';
    }
  }

  function closeLegalNoticeModal() {
    const modal = document.getElementById('legal-notice-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
  }

  // Global Event Delegation (Guarantees clicks on device pill, inner texts, dots, icons, and modals are ALWAYS caught)
  document.addEventListener('click', (e) => {
    // 1. Device pill / rename button clicked anywhere in the DOM
    const targetPill = e.target.closest('#btn-device-name, .device-pill, #header-device-name, #header-device-dot, .btn-device-edit, #landing-device-name, .my-device-chip');
    if (targetPill) {
      e.preventDefault();
      e.stopPropagation();
      openDeviceRenameModal();
      return;
    }

    // 2. Save rename button clicked
    if (e.target.closest('#btn-save-device-rename')) {
      e.preventDefault();
      saveDeviceName();
      return;
    }

    // 3. Close device rename modal
    if (e.target.closest('#btn-cancel-device-rename, #btn-close-device-modal') || e.target.id === 'device-rename-modal') {
      e.preventDefault();
      closeDeviceRenameModal();
      return;
    }

    // 4. Legal notice modal open triggers
    if (e.target.closest('#btn-open-legal, #link-legal-privacy, #link-legal-terms, #link-legal-disclaimer, #btn-room-legal, #link-composer-legal')) {
      e.preventDefault();
      openLegalNoticeModal();
      return;
    }

    // 5. Legal notice modal close triggers
    if (e.target.closest('#btn-close-legal-modal, #btn-accept-legal') || e.target.id === 'legal-notice-modal') {
      e.preventDefault();
      closeLegalNoticeModal();
      return;
    }
  });

  // Keyboard shortcut (Enter to save, Escape to cancel)
  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.id === 'device-rename-input') {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveDeviceName();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeDeviceRenameModal();
      }
    }
    if (e.key === 'Escape') {
      closeLegalNoticeModal();
    }
  });

  // Neon Highlighter Toggle
  if (btnToggleNeonHighlighter) {
    btnToggleNeonHighlighter.addEventListener('click', () => {
      isNeonHighlighterActive = !isNeonHighlighterActive;
      if (livepadHighlights) {
        livepadHighlights.style.opacity = isNeonHighlighterActive ? '1' : '0';
      }
      if (neonToggleText) {
        neonToggleText.textContent = isNeonHighlighterActive ? 'Vurgu: Açık' : 'Vurgu: Kapalı';
      }
      showToast(isNeonHighlighterActive ? 'Yazar neon vurguları açıldı.' : 'Yazar neon vurguları gizlendi.');
    });
  }

  function detectRoomFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('r')) return urlParams.get('r').trim();
    if (urlParams.has('room')) return urlParams.get('room').trim();

    let path = window.location.pathname;
    if (BASE_PATH && path.startsWith(BASE_PATH)) {
      path = path.substring(BASE_PATH.length);
    }
    const cleanPath = path.replace(/^\/+|\/+$/g, '');
    const parts = cleanPath.split('/').filter(Boolean);

    if (parts.length === 0) {
      return null;
    }

    let sub = parts.join('/');
    if (sub.startsWith('s/')) sub = sub.substring(2);

    const room = sub.split('/')[0];
    const reserved = ['index.html', 'index.php', 'api.php', 'style.css', 'app.js', 'qrcode.min.js', 'favicon.ico', 'c', 'chat', ''];
    if (room && !reserved.includes(room.toLowerCase())) {
      return room;
    }
    return null;
  }

  async function init() {
    updateDeviceHeaderBadge();
    await fetchSystemInfo();

    const detectedRoom = detectRoomFromUrl();
    if (detectedRoom) {
      joinRoom(detectedRoom);
    }
  }

  init();
})();

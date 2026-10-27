// Ulak admin panel (served as a file so the page can run under a strict Content-Security-Policy)
(function () {
  'use strict';

  // Base path calculation
  const pathname = window.location.pathname;
  const segments = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  let basePath = '';
  if (segments.length >= 1 && (segments[0] === 'c' || segments[0] === 'chat')) {
    basePath = '/' + segments[0];
  }
  const baseUrl = window.location.origin + (basePath ? basePath + '/' : '/');

  // State
  // Token lives only for this browser tab (sessionStorage), never in URLs
  const TOKEN_KEY = 'ulak_admin_token';
  function storeToken(value) {
    try {
      if (value) sessionStorage.setItem(TOKEN_KEY, value);
      else sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY); // clean up tokens persisted by older versions
    } catch (e) {}
  }
  function readToken() {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }

  let adminToken = readToken();
  let activeRooms = [];
  let autoRefreshTimer = null;
  let pendingDeleteAction = null;

  // DOM Elements
  const loginScreen = document.getElementById('admin-login-screen');
  const dashboard = document.getElementById('admin-dashboard');
  const loginForm = document.getElementById('admin-login-form');
  const inputUser = document.getElementById('login-username');
  const inputPass = document.getElementById('login-password');
  const btnLogout = document.getElementById('btn-logout');
  const btnRefresh = document.getElementById('btn-refresh');
  const chkAutoRefresh = document.getElementById('chk-auto-refresh');
  const searchInput = document.getElementById('search-rooms-input');
  const chkSelectAll = document.getElementById('chk-select-all');
  const btnBatchDelete = document.getElementById('btn-batch-delete');
  const batchCountEl = document.getElementById('batch-count');
  const selectedSummary = document.getElementById('selected-summary');
  const btnPurgeAll = document.getElementById('btn-purge-all');
  const tableBody = document.getElementById('rooms-table-body');
  const emptyMsg = document.getElementById('empty-rooms-msg');

  // Stats Elements
  const statTotalRooms = document.getElementById('stat-total-rooms');
  const statTotalSize = document.getElementById('stat-total-size');
  const statTotalDevices = document.getElementById('stat-total-devices');
  const statTotalItems = document.getElementById('stat-total-items');

  // Modal Elements
  const confirmModal = document.getElementById('admin-confirm-modal');
  const modalTitle = document.getElementById('admin-modal-title');
  const modalDesc = document.getElementById('admin-modal-desc');
  const btnModalCancel = document.getElementById('btn-admin-modal-cancel');
  const btnModalConfirm = document.getElementById('btn-admin-modal-confirm');
  const toastContainer = document.getElementById('toast-container');

  function showToast(message, type = 'normal') {
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'danger' ? 'toast-danger' : type === 'success' ? 'toast-success' : ''}`;
    const span = document.createElement('span');
    span.textContent = message;
    toast.appendChild(span);
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 2600);
  }

  let backendType = null; // 'node' or 'php'

  async function apiFetch(endpoint, options = {}) {
    options.headers = options.headers || {};
    options.headers['Content-Type'] = 'application/json';
    if (adminToken) {
      options.headers['Authorization'] = `Bearer ${adminToken}`;
      options.headers['x-admin-token'] = adminToken;
    }

    options.cache = 'no-store';

    await detectBackend();
    const url = backendType === 'node'
      ? `${basePath}/api/admin/${endpoint}`
      : `${basePath}/api.php?action=admin_${endpoint}`;
    return await fetch(url, options);
  }

  // Probe with a harmless GET so credentials are only ever posted to the real backend
  async function detectBackend() {
    if (backendType) return;
    try {
      const res = await fetch(`${basePath}/api/admin/me`, { cache: 'no-store' });
      const ctype = res.headers.get('content-type') || '';
      if (ctype.includes('application/json')) {
        backendType = 'node';
        return;
      }
    } catch (e) {
      // Node not available
    }
    backendType = 'php';
  }

  async function checkAuthAndLoad() {
    if (!adminToken) {
      showLogin();
      return;
    }

    try {
      const res = await apiFetch('rooms');
      if (res.ok) {
        const data = await res.json();
        showDashboard();
        renderDashboard(data);
      } else if (res.status === 403) {
        // Logged in, but the default password must be replaced first
        showLogin();
        openPasswordModal(true);
      } else {
        adminToken = null;
        storeToken(null);
        showLogin();
      }
    } catch (err) {
      console.error(err);
      showToast('Sunucuya bağlanılamadı.', 'danger');
    }
  }

  function showLogin() {
    loginScreen.classList.remove('hidden');
    dashboard.classList.add('hidden');
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  }

  function showDashboard() {
    loginScreen.classList.add('hidden');
    dashboard.classList.remove('hidden');
    setupAutoRefresh();
    loadFileSettings();
    loadStats();
    loadReports();
    loadAudit();
  }

  // Opening a room must not hand the admin token to the new tab (sessionStorage is copied without noopener)
  function openRoomSafely(roomId) {
    window.open(`${baseUrl}${encodeURIComponent(roomId)}`, '_blank', 'noopener,noreferrer');
  }

  function cell(text) {
    const td = document.createElement('td');
    td.textContent = text == null ? '' : String(text);
    return td;
  }

  function actionButton(label, className, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-sm ${className}`;
    btn.style.cssText = 'padding: 5px 9px; font-size: 0.78rem; margin-left: 6px;';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  // =============================================================
  // ABUSE REPORTS
  // =============================================================
  const REASON_LABELS = {
    illegal: 'Yasa dışı içerik',
    malware: 'Zararlı yazılım / oltalama',
    harassment: 'Taciz / tehdit',
    copyright: 'Telif ihlali',
    other: 'Diğer'
  };

  function renderReports(list) {
    const body = document.getElementById('reports-table-body');
    const empty = document.getElementById('reports-empty');
    const badge = document.getElementById('reports-open-count');
    body.textContent = '';
    empty.classList.toggle('hidden', list.length > 0);
    const open = list.filter(r => r.status === 'open').length;
    badge.textContent = `${open} açık`;
    badge.classList.toggle('hidden', open === 0);

    list.forEach(r => {
      const tr = document.createElement('tr');
      if (r.status === 'resolved') tr.style.opacity = '0.55';
      tr.append(
        cell(new Date(r.createdAt).toLocaleString('tr-TR')),
        cell(r.roomId + (r.roomActive ? '' : ' (kapalı)')),
        cell(REASON_LABELS[r.reason] || r.reason),
        cell(r.details || '—'),
        cell(r.reporterIp || '—'),
        cell(r.status === 'open' ? 'Açık' : 'Çözüldü')
      );
      const actions = document.createElement('td');
      actions.style.cssText = 'text-align: right; white-space: nowrap;';
      if (r.roomActive) {
        actions.append(
          actionButton('👁️ Odaya Bak', 'btn-outline', () => openRoomSafely(r.roomId)),
          actionButton('🗑️ İmha Et', 'btn-danger', () => askConfirmation(
            `Oda (${r.roomId}) imha edilsin mi?`,
            'Odadaki tüm içerik silinir. Bildirim kaydı kalır.',
            async () => {
              await deleteSingleRoom(r.roomId);
              await setReportStatus(r.id, 'resolved');
            }
          ))
        );
      }
      actions.append(actionButton(r.status === 'open' ? '✓ Çözüldü' : '↺ Yeniden Aç', 'btn-secondary',
        () => setReportStatus(r.id, r.status === 'open' ? 'resolved' : 'open')));
      tr.appendChild(actions);
      body.appendChild(tr);
    });
  }

  async function loadReports() {
    try {
      const res = await apiFetch('reports');
      if (res.ok) renderReports((await res.json()).reports || []);
    } catch (e) {}
  }

  async function setReportStatus(id, status) {
    try {
      const res = await apiFetch('reports', { method: 'POST', body: JSON.stringify({ id, status }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) renderReports(data.reports || []);
      else showToast(data.error || 'Bildirim güncellenemedi.', 'danger');
    } catch (e) {
      showToast('Sunucuya bağlanılamadı.', 'danger');
    }
  }

  // =============================================================
  // AUDIT LOG
  // =============================================================
  const auditDate = document.getElementById('audit-date');
  const auditSearch = document.getElementById('audit-search');
  const EVENT_LABELS = {
    room_create: 'Oda açıldı',
    item_add: 'Paylaşım',
    file_upload: 'Dosya yüklendi',
    report: 'Bildirim',
    room_destroy: 'Oda imha edildi'
  };
  let auditEntries = [];
  let auditSearchTimer = null;

  function auditDetail(e) {
    if (e.event === 'file_upload') return `${e.name} · ${formatBytesShort(e.size)} · sha256 ${String(e.sha256).slice(0, 16)}…`;
    if (e.event === 'item_add') return `${e.type} · ${formatBytesShort(e.size)} · sha256 ${String(e.sha256).slice(0, 16)}…`;
    if (e.event === 'report') return `${REASON_LABELS[e.reason] || e.reason} (#${e.report})`;
    if (e.event === 'room_destroy') return e.by === 'admin' ? 'yönetici' : 'oda sahibi';
    if (e.event === 'room_create') return `süre: ${e.ttl}`;
    return '';
  }

  function formatBytesShort(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
  }

  async function loadAudit() {
    const date = auditDate.value || '';
    const q = auditSearch.value.trim();
    try {
      const res = await apiFetch(`audit${backendType === 'node' ? '?' : '&'}date=${encodeURIComponent(date)}&q=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      const data = await res.json();
      auditEntries = data.entries || [];

      const dates = data.dates && data.dates.length ? data.dates : [data.date];
      if (auditDate.options.length !== dates.length) {
        auditDate.textContent = '';
        dates.forEach(d => {
          const opt = document.createElement('option');
          opt.value = d;
          opt.textContent = d;
          auditDate.appendChild(opt);
        });
      }
      auditDate.value = data.date;
      document.getElementById('audit-desc').textContent = data.retentionDays > 0
        ? `Oda açma, paylaşım, dosya yükleme, bildirim ve imha işlemlerinin IP ve zaman kaydı (${data.retentionDays} gün saklanır). İçerik saklanmaz; yalnızca dosya özeti (SHA-256).`
        : 'Kayıt tutma kapalı (Dosya Paylaşım Ayarları → kayıt saklama süresi 0).';

      const body = document.getElementById('audit-table-body');
      body.textContent = '';
      document.getElementById('audit-empty').classList.toggle('hidden', auditEntries.length > 0);
      auditEntries.forEach(e => {
        const tr = document.createElement('tr');
        tr.append(
          cell(new Date(e.t).toLocaleTimeString('tr-TR')),
          cell(EVENT_LABELS[e.event] || e.event),
          cell(e.room || ''),
          cell(e.ip || ''),
          cell(auditDetail(e))
        );
        tr.title = e.ua || '';
        body.appendChild(tr);
      });
    } catch (e) {}
  }

  auditDate.addEventListener('change', loadAudit);
  auditSearch.addEventListener('input', () => {
    clearTimeout(auditSearchTimer);
    auditSearchTimer = setTimeout(loadAudit, 300);
  });

  document.getElementById('btn-audit-csv').addEventListener('click', () => {
    const quote = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const header = ['zaman', 'islem', 'oda', 'ip', 'tarayici', 'tur', 'dosya', 'boyut', 'sha256', 'sebep'];
    const lines = [header.join(',')].concat(auditEntries.map(e => [
      new Date(e.t).toISOString(), e.event, e.room, e.ip, e.ua, e.type, e.name, e.size, e.sha256, e.reason
    ].map(quote).join(',')));
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ulak-kayitlar-${auditDate.value || 'bugun'}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // =============================================================
  // DAILY STATISTICS
  // =============================================================
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const statsRange = document.getElementById('stats-range');
  const statsMetric = document.getElementById('stats-metric');
  const statsKpis = document.getElementById('stats-kpis');
  const statsChart = document.getElementById('stats-chart');
  const statsHours = document.getElementById('stats-hours');
  const statsBreakdown = document.getElementById('stats-breakdown');
  const statsTableBody = document.getElementById('stats-table-body');
  const statsTooltip = document.getElementById('stats-tooltip');
  const statsTz = document.getElementById('stats-tz');
  let statsDays = 30;
  let statsMetricKey = 'visitorCount';
  let statsData = null;

  const METRICS = {
    visitorCount: { label: 'Tekil Ziyaretçi', value: d => d.visitorCount },
    pageViews: { label: 'Sayfa Görüntüleme', value: d => d.pageViews },
    roomsCreated: { label: 'Açılan Oda', value: d => d.roomsCreated },
    shares: { label: 'Paylaşım', value: d => d.shares.text + d.shares.image + d.shares.file },
    traffic: { label: 'Trafik', value: d => d.bytesIn + d.bytesOut, bytes: true }
  };

  function fmtNumber(n) {
    return Number(n || 0).toLocaleString('tr-TR');
  }

  function fmtBytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(1)).toLocaleString('tr-TR')} ${units[i]}`;
  }

  function fmtDate(iso, withYear) {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('tr-TR', withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
  }

  function niceMax(v) {
    if (v <= 0) return 4;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const step = [1, 2, 2.5, 5, 10].find(s => s * pow >= v / 4) * pow;
    return Math.ceil(v / step) * step;
  }

  function svgEl(name, attrs, text) {
    const el = document.createElementNS(SVG_NS, name);
    Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function showTooltip(evt, title, value) {
    statsTooltip.textContent = '';
    const strong = document.createElement('strong');
    strong.textContent = value;
    const span = document.createElement('span');
    span.textContent = title;
    statsTooltip.append(strong, span);
    statsTooltip.classList.remove('hidden');
    const rect = evt.target.getBoundingClientRect();
    const x = evt.clientX || rect.left + rect.width / 2;
    const y = evt.clientY || rect.top;
    statsTooltip.style.left = `${Math.min(window.innerWidth - statsTooltip.offsetWidth - 8, x + 12)}px`;
    statsTooltip.style.top = `${Math.max(8, y - statsTooltip.offsetHeight - 10)}px`;
  }

  function hideTooltip() {
    statsTooltip.classList.add('hidden');
  }

  // Single-series bar chart: rounded data-ends on a baseline, recessive grid, hover/focus tooltip per bar
  function renderBarChart(container, points, opts) {
    const width = Math.max(280, container.clientWidth || 600);
    const height = opts.height || 220;
    const pad = { top: 10, right: 8, bottom: 22, left: opts.bytes ? 64 : 40 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const max = niceMax(Math.max(...points.map(p => p.value), 0));
    const fmt = opts.bytes ? fmtBytes : fmtNumber;

    const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, height, role: 'img', 'aria-label': opts.label });
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + innerH - (innerH * i) / 4;
      svg.appendChild(svgEl('line', { class: 'grid-line', x1: pad.left, x2: width - pad.right, y1: y, y2: y }));
      svg.appendChild(svgEl('text', { class: 'axis-label', x: pad.left - 6, y: y + 4, 'text-anchor': 'end' }, fmt((max * i) / 4)));
    }

    const slot = innerW / points.length;
    const barW = Math.max(1, Math.min(28, slot - 2));
    const labelEvery = Math.ceil(points.length / Math.max(1, Math.floor(innerW / 64)));

    points.forEach((p, i) => {
      const x = pad.left + i * slot + (slot - barW) / 2;
      const h = max ? (p.value / max) * innerH : 0;
      const y = pad.top + innerH - h;
      const r = Math.min(4, barW / 2, h);

      const hit = svgEl('rect', { class: 'bar-hit', x: pad.left + i * slot, y: pad.top, width: slot, height: innerH, tabindex: 0 });
      hit.addEventListener('pointermove', e => showTooltip(e, p.title, fmt(p.value)));
      hit.addEventListener('focus', e => showTooltip(e, p.title, fmt(p.value)));
      hit.addEventListener('pointerleave', hideTooltip);
      hit.addEventListener('blur', hideTooltip);
      svg.appendChild(hit);

      // Path with rounded top corners anchored to the baseline
      const base = pad.top + innerH;
      const d = h <= 0 ? '' : `M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${base} Z`;
      svg.appendChild(svgEl('path', { class: 'bar', d }));

      if (i % labelEvery === 0) {
        svg.appendChild(svgEl('text', { class: 'axis-label', x: pad.left + i * slot + slot / 2, y: height - 6, 'text-anchor': 'middle' }, p.label));
      }
    });

    container.textContent = '';
    container.appendChild(svg);
  }

  function deltaHtml(current, previous) {
    const span = document.createElement('div');
    span.className = 'kpi-delta';
    if (!previous && !current) {
      span.textContent = 'Önceki dönemde de veri yok';
      return span;
    }
    if (!previous) {
      span.textContent = 'Önceki dönemde veri yok';
      return span;
    }
    const pct = Math.round(((current - previous) / previous) * 100);
    const mark = document.createElement('span');
    mark.className = pct > 0 ? 'up' : pct < 0 ? 'down' : '';
    mark.textContent = pct > 0 ? `▲ %${pct}` : pct < 0 ? `▼ %${Math.abs(pct)}` : '■ %0';
    span.append(mark, document.createTextNode(' önceki döneme göre'));
    return span;
  }

  function renderStats() {
    if (!statsData) return;
    const { days, totals, previousTotals } = statsData;
    statsTz.textContent = `Saat dilimi: ${statsData.timezone}`;

    const kpis = [
      ['Tekil Ziyaretçi', 'visitorCount', fmtNumber, 'Günlük tekil ziyaretçilerin toplamı'],
      ['Sayfa Görüntüleme', 'pageViews', fmtNumber],
      ['Açılan Oda', 'roomsCreated', fmtNumber],
      ['Paylaşım', 'shares', fmtNumber],
      ['Trafik', null, fmtBytes]
    ];
    statsKpis.textContent = '';
    kpis.forEach(([label, key, fmt, hint]) => {
      const cur = key ? totals[key] : totals.bytesIn + totals.bytesOut;
      const prev = key ? previousTotals[key] : previousTotals.bytesIn + previousTotals.bytesOut;
      const tile = document.createElement('div');
      tile.className = 'kpi-tile';
      if (hint) tile.title = hint;
      const l = document.createElement('div');
      l.className = 'kpi-label';
      l.textContent = label;
      const v = document.createElement('div');
      v.className = 'kpi-value';
      v.textContent = fmt(cur);
      tile.append(l, v, deltaHtml(cur, prev));
      statsKpis.appendChild(tile);
    });

    const metric = METRICS[statsMetricKey];
    renderBarChart(statsChart, days.map(d => ({
      value: metric.value(d),
      label: fmtDate(d.date),
      title: `${fmtDate(d.date, true)} · ${metric.label}`
    })), { label: `${metric.label} grafiği`, bytes: metric.bytes });

    const hours = new Array(24).fill(0);
    days.forEach(d => d.hours.forEach((n, h) => { hours[h] += n; }));
    renderBarChart(statsHours, hours.map((n, h) => ({
      value: n,
      label: String(h).padStart(2, '0'),
      title: `${String(h).padStart(2, '0')}:00 – ${String(h).padStart(2, '0')}:59 · Sayfa görüntüleme`
    })), { label: 'Saatlere göre sayfa görüntüleme', height: 150 });

    const sum = (fn) => days.reduce((t, d) => t + fn(d), 0);
    const rows = [
      ['📱 Mobil ziyaretçi', fmtNumber(sum(d => d.platforms.mobile))],
      ['💻 Masaüstü ziyaretçi', fmtNumber(sum(d => d.platforms.desktop))],
      ['📝 Metin paylaşımı', fmtNumber(sum(d => d.shares.text))],
      ['🖼️ Fotoğraf paylaşımı', fmtNumber(sum(d => d.shares.image))],
      ['📎 Dosya paylaşımı', fmtNumber(sum(d => d.shares.file))],
      ['⬇️ Dosya indirme', fmtNumber(totals.downloads)],
      ['⏫ Gelen veri', fmtBytes(totals.bytesIn)],
      ['⏬ Giden veri', fmtBytes(totals.bytesOut)]
    ];
    statsBreakdown.textContent = '';
    rows.forEach(([k, v]) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      statsBreakdown.append(dt, dd);
    });

    statsTableBody.textContent = '';
    days.slice().reverse().forEach(d => {
      const tr = document.createElement('tr');
      [fmtDate(d.date, true), fmtNumber(d.visitorCount), fmtNumber(d.pageViews), fmtNumber(d.roomsCreated),
        fmtNumber(d.activeRooms), fmtNumber(METRICS.shares.value(d)), fmtNumber(d.downloads), fmtBytes(d.bytesIn + d.bytesOut)
      ].forEach(text => {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
      });
      statsTableBody.appendChild(tr);
    });
  }

  async function loadStats() {
    statsChart.style.opacity = statsData ? '0.5' : '1';
    try {
      const res = await apiFetch(`stats${backendType === 'node' ? '?' : '&'}days=${statsDays}`);
      if (res.ok) {
        statsData = await res.json();
        renderStats();
      }
    } catch (e) {
    } finally {
      statsChart.style.opacity = '1';
    }
  }

  function bindTabs(container, attr, onSelect) {
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      container.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
      onSelect(btn.getAttribute(attr));
    });
  }

  bindTabs(statsRange, 'data-days', (v) => { statsDays = parseInt(v, 10); loadStats(); });
  bindTabs(statsMetric, 'data-metric', (v) => { statsMetricKey = v; renderStats(); });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderStats, 150);
  });

  document.getElementById('btn-stats-csv').addEventListener('click', () => {
    if (!statsData) return;
    const header = ['tarih', 'tekil_ziyaretci', 'sayfa_goruntuleme', 'acilan_oda', 'aktif_oda', 'metin', 'fotograf', 'dosya', 'indirme', 'gelen_bayt', 'giden_bayt', 'mobil', 'masaustu'];
    const lines = [header.join(',')].concat(statsData.days.map(d => [
      d.date, d.visitorCount, d.pageViews, d.roomsCreated, d.activeRooms, d.shares.text, d.shares.image, d.shares.file,
      d.downloads, d.bytesIn, d.bytesOut, d.platforms.mobile, d.platforms.desktop
    ].join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ulak-istatistik-${statsDays}gun.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // =============================================================
  // FILE SHARING SETTINGS
  // =============================================================
  const fileSettingsForm = document.getElementById('file-settings-form');
  const setMaxFile = document.getElementById('set-max-file');
  const setMaxRoom = document.getElementById('set-max-room');
  const setGroups = document.getElementById('set-groups');
  const settingsDiskFree = document.getElementById('settings-disk-free');
  const btnSaveSettings = document.getElementById('btn-save-settings');

  function renderFileSettings(data) {
    const settings = data.settings || {};
    const limits = data.limits || {};
    setMaxFile.value = settings.maxFileSizeMB;
    setMaxFile.max = limits.maxFileSizeMB || 500;
    setMaxRoom.value = settings.maxRoomStorageMB;
    setMaxRoom.max = limits.maxRoomStorageMB || 2000;
    document.getElementById('set-max-total').value = settings.maxTotalStorageMB;
    document.getElementById('set-max-hourly').value = settings.maxUploadMBPerHour;
    document.getElementById('set-max-downloads').value = settings.maxDownloadsPerFile;
    document.getElementById('set-audit-days').value = settings.auditLogDays;
    settingsDiskFree.textContent = [
      limits.used ? `Kullanılan: ${limits.used}` : '',
      limits.diskFree ? `Sunucuda boş alan: ${limits.diskFree}` : ''
    ].filter(Boolean).join(' · ');

    setGroups.innerHTML = '';
    (data.groups || []).forEach(group => {
      const label = document.createElement('label');
      label.className = 'settings-group-chip';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.value = group.key;
      chk.checked = (settings.allowedGroups || []).includes(group.key);
      const name = document.createElement('span');
      name.textContent = group.label;
      const exts = document.createElement('small');
      exts.textContent = group.extensions.map(e => '.' + e).join(' ');
      label.append(chk, name, exts);
      setGroups.appendChild(label);
    });
  }

  async function loadFileSettings() {
    try {
      const res = await apiFetch('settings');
      if (res.ok) renderFileSettings(await res.json());
    } catch (e) {}
  }

  fileSettingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const maxFileSizeMB = parseInt(setMaxFile.value, 10);
    const maxRoomStorageMB = parseInt(setMaxRoom.value, 10);
    if (maxRoomStorageMB < maxFileSizeMB) {
      showToast('Oda kotası, dosya başına sınırdan küçük olamaz.', 'danger');
      return;
    }
    const allowedGroups = Array.from(setGroups.querySelectorAll('input:checked')).map(c => c.value);

    btnSaveSettings.disabled = true;
    try {
      const res = await apiFetch('settings', {
        method: 'POST',
        body: JSON.stringify({
          maxFileSizeMB,
          maxRoomStorageMB,
          allowedGroups,
          maxTotalStorageMB: parseInt(document.getElementById('set-max-total').value, 10),
          maxUploadMBPerHour: parseInt(document.getElementById('set-max-hourly').value, 10),
          maxDownloadsPerFile: parseInt(document.getElementById('set-max-downloads').value, 10),
          auditLogDays: parseInt(document.getElementById('set-audit-days').value, 10)
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        renderFileSettings(data);
        showToast(data.message || 'Ayarlar kaydedildi.', 'success');
      } else {
        showToast(data.error || 'Ayarlar kaydedilemedi.', 'danger');
      }
    } catch (err) {
      showToast('Sunucuya bağlanırken bir hata oluştu.', 'danger');
    } finally {
      btnSaveSettings.disabled = false;
    }
  });

  const btnDoLogin = document.getElementById('btn-do-login');
  const btnLoginText = document.getElementById('btn-login-text');
  const loginErrorMsg = document.getElementById('login-error-msg');

  function showLoginError(msg) {
    if (loginErrorMsg) {
      loginErrorMsg.textContent = msg;
      loginErrorMsg.style.display = 'block';
    }
  }

  function hideLoginError() {
    if (loginErrorMsg) {
      loginErrorMsg.textContent = '';
      loginErrorMsg.style.display = 'none';
    }
  }

  async function handleLogin() {
    const username = inputUser.value.trim();
    const password = inputPass.value;

    if (!username || !password) {
      showLoginError('Lütfen kullanıcı adı ve şifre giriniz.');
      return;
    }

    hideLoginError();
    btnDoLogin.disabled = true;
    if (btnLoginText) btnLoginText.textContent = 'Giriş Yapılıyor...';

    try {
      const res = await apiFetch('login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        adminToken = data.token;
        storeToken(adminToken);
        inputPass.value = '';
        if (data.mustChangePassword) {
          showToast('İlk girişte yönetici şifresini değiştirmeniz gerekiyor.');
          openPasswordModal(true, data.username);
          return;
        }
        showToast('Giriş başarılı!', 'success');
        await checkAuthAndLoad();
      } else {
        showLoginError(data.error || 'Kullanıcı adı veya şifre hatalı.');
        showToast(data.error || 'Giriş başarısız.', 'danger');
      }
    } catch (err) {
      console.error('Login error:', err);
      showLoginError('Sunucuya bağlanırken bir hata oluştu.');
      showToast('Giriş yapılırken sunucu hatası oluştu.', 'danger');
    } finally {
      btnDoLogin.disabled = false;
      if (btnLoginText) btnLoginText.textContent = 'Yönetici Olarak Giriş Yap';
    }
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleLogin();
  });

  btnDoLogin.addEventListener('click', async (e) => {
    if (e.target === btnDoLogin || btnDoLogin.contains(e.target)) {
      e.preventDefault();
      await handleLogin();
    }
  });

  btnLogout.addEventListener('click', async () => {
    try {
      await apiFetch('logout', { method: 'POST' });
    } catch (e) {}
    adminToken = null;
    storeToken(null);
    showToast('Çıkış yapıldı.');
    showLogin();
  });

  btnRefresh.addEventListener('click', async () => {
    btnRefresh.disabled = true;
    await refreshRooms();
    btnRefresh.disabled = false;
    showToast('Veriler güncellendi.');
  });

  async function refreshRooms() {
    if (!adminToken) return;
    try {
      const res = await apiFetch('rooms');
      if (res.ok) {
        const data = await res.json();
        renderDashboard(data);
        loadReports();
      } else if (res.status === 401) {
        adminToken = null;
        storeToken(null);
        showLogin();
      }
    } catch (e) {}
  }

  function setupAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    if (chkAutoRefresh.checked) {
      autoRefreshTimer = setInterval(refreshRooms, 5000);
    }
  }

  chkAutoRefresh.addEventListener('change', setupAutoRefresh);

  function formatTimeAgo(timestamp) {
    if (!timestamp) return 'Bilinmiyor';
    const sec = Math.floor((Date.now() - timestamp) / 1000);
    if (sec < 60) return `${sec} sn önce`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} dk önce`;
    const hours = Math.floor(min / 60);
    return `${hours} saat önce`;
  }

  function formatTtlRemaining(room) {
    if (room.ttlMode === 'burn_read' && !room.burnTriggeredAt) {
      return '<span style="color: #fb923c; font-weight: 600;">🔥 Okunduğunda İmha</span>';
    }
    if (!room.expiresAt) return '<span class="text-muted">Süresiz</span>';

    const diff = room.expiresAt - Date.now();
    if (diff <= 0) {
      return '<span style="color: var(--accent-rose); font-weight: 700;">⏳ Süresi Doldu</span>';
    }
    const min = Math.floor(diff / 60000);
    const sec = Math.floor((diff % 60000) / 1000);
    if (min < 2) {
      return `<span style="color: var(--accent-rose); font-weight: 700;">⏱️ ${min}:${sec.toString().padStart(2, '0')} kaldı</span>`;
    }
    return `<span style="color: var(--accent-amber); font-weight: 600;">⏱️ ${min} dk kaldı</span>`;
  }

  function renderDashboard(data) {
    const stats = data.stats || {};
    activeRooms = data.rooms || [];

    statTotalRooms.textContent = stats.totalRooms || activeRooms.length;
    statTotalSize.textContent = stats.totalSizeFormatted || '0 B';
    statTotalDevices.textContent = stats.totalDevices || 0;
    statTotalItems.textContent = stats.totalItems || 0;

    renderTable();
  }

  function renderTable() {
    const filter = searchInput.value.toLowerCase().trim();
    const filtered = activeRooms.filter(r => {
      if (!filter) return true;
      if (r.id.toLowerCase().includes(filter)) return true;
      if (r.deviceNames && r.deviceNames.some(d => d.toLowerCase().includes(filter))) return true;
      return false;
    });

    tableBody.innerHTML = '';
    if (filtered.length === 0) {
      emptyMsg.classList.remove('hidden');
    } else {
      emptyMsg.classList.add('hidden');
    }

    filtered.forEach(room => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-room-id', room.id);

      const roomUrl = escapeHtml(`${baseUrl}${encodeURIComponent(room.id)}`);
      const deviceNamesStr = (room.deviceNames && room.deviceNames.length > 0)
        ? room.deviceNames.map(d => `<span class="dev-chip">${escapeHtml(d)}</span>`).join('')
        : '<span class="text-dim" style="font-size: 0.8rem;">(Cihaz bağlı değil)</span>';

      tr.innerHTML = `
        <td style="text-align: center;">
          <input type="checkbox" class="chk-room-select" value="${escapeHtml(room.id)}">
        </td>
        <td>
          <a href="${roomUrl}" target="_blank" rel="noopener noreferrer" class="room-code-badge" title="Odayı yeni sekmede aç">
            <span>${escapeHtml(room.id)}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
          </a>
        </td>
        <td>
          <div>${formatTtlRemaining(room)}</div>
          <div style="font-size: 0.76rem; color: var(--text-dim); margin-top: 3px;">${formatTimeAgo(room.createdAt)}</div>
        </td>
        <td>
          <div style="margin-bottom: 4px; font-weight: 700; font-size: 0.82rem; color: var(--accent-emerald);">
            ${room.deviceCount} Cihaz
          </div>
          <div class="device-chips-cell">
            ${deviceNamesStr}
          </div>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span class="size-pill">${escapeHtml(room.sizeFormatted || '0 B')}</span>
            <span style="font-size: 0.82rem; color: var(--text-muted);">${room.itemCount || 0} Öğe</span>
          </div>
          ${room.hasLivePad ? `<div style="font-size: 0.74rem; color: var(--accent-sky);">📝 LivePad: ${room.livePadLength} karakter</div>` : ''}
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <a href="${roomUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline" style="padding: 6px 10px; font-size: 0.8rem; margin-right: 6px;" title="Odaya Katıl">
            👁️ Git
          </a>
          <button type="button" class="btn btn-sm btn-danger btn-delete-single" data-id="${escapeHtml(room.id)}" style="padding: 6px 10px; font-size: 0.8rem;" title="Oturumu Kapat ve Bellekten Sil">
            🗑️ Sil
          </button>
        </td>
      `;

      tableBody.appendChild(tr);
    });

    bindTableEvents();
    updateSelectedSummary();
  }

  function bindTableEvents() {
    tableBody.querySelectorAll('.btn-delete-single').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const roomId = btn.getAttribute('data-id');
        askConfirmation(
          `Oda (${roomId}) Kapatılsın mı?`,
          `Bu oturumu kapattığınızda odadaki tüm metinler, kodlar ve görseller sunucudan kalıcı olarak silinecektir.`,
          async () => {
            await deleteSingleRoom(roomId);
          }
        );
      });
    });

    tableBody.querySelectorAll('.chk-room-select').forEach(chk => {
      chk.addEventListener('change', updateSelectedSummary);
    });
  }

  function updateSelectedSummary() {
    const checked = tableBody.querySelectorAll('.chk-room-select:checked');
    const count = checked.length;
    batchCountEl.textContent = count;
    selectedSummary.textContent = `${count} oda seçili`;

    if (count > 0) {
      btnBatchDelete.style.display = 'inline-flex';
    } else {
      btnBatchDelete.style.display = 'none';
    }
  }

  chkSelectAll.addEventListener('change', () => {
    const isChecked = chkSelectAll.checked;
    tableBody.querySelectorAll('.chk-room-select').forEach(chk => {
      chk.checked = isChecked;
    });
    updateSelectedSummary();
  });

  searchInput.addEventListener('input', renderTable);

  async function deleteSingleRoom(roomId) {
    try {
      const res = await apiFetch('destroy_room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Oda (${roomId}) başarıyla silindi.`, 'success');
        await refreshRooms();
      } else {
        showToast(data.error || 'Silme işlemi başarısız.', 'danger');
      }
    } catch (err) {
      showToast('İşlem sırasında hata oluştu.', 'danger');
    }
  }

  btnBatchDelete.addEventListener('click', () => {
    const checked = Array.from(tableBody.querySelectorAll('.chk-room-select:checked')).map(c => c.value);
    if (checked.length === 0) return;

    askConfirmation(
      `Seçilen ${checked.length} Oda Silinsin mi?`,
      `Seçtiğiniz ${checked.length} adet oturum kapatılacak ve içlerindeki tüm veriler bellekten tamamen silinecektir.`,
      async () => {
        try {
          const res = await apiFetch('destroy_batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomIds: checked })
          });
          const data = await res.json();
          if (res.ok && data.success) {
            showToast(`${checked.length} adet oturum başarıyla silindi.`, 'success');
            chkSelectAll.checked = false;
            await refreshRooms();
          } else {
            showToast(data.error || 'Toplu silme başarısız.', 'danger');
          }
        } catch (err) {
          showToast('İşlem sırasında hata oluştu.', 'danger');
        }
      }
    );
  });

  btnPurgeAll.addEventListener('click', () => {
    askConfirmation(
      'TÜM Oturumlar Kapatılsın ve Temizlensin mi?',
      'DİKKAT: Bu işlem sunucuda açık olan TÜM oturumları anında sonlandıracak ve belleği sıfırlayacaktır. Bu işlem geri alınamaz!',
      async () => {
        try {
          const res = await apiFetch('destroy_all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          const data = await res.json();
          if (res.ok && data.success) {
            showToast('Tüm oturumlar başarıyla temizlendi.', 'success');
            chkSelectAll.checked = false;
            await refreshRooms();
          } else {
            showToast(data.error || 'Temizleme başarısız.', 'danger');
          }
        } catch (err) {
          showToast('İşlem sırasında hata oluştu.', 'danger');
        }
      }
    );
  });

  function askConfirmation(title, desc, onConfirm) {
    modalTitle.textContent = title;
    modalDesc.textContent = desc;
    pendingDeleteAction = onConfirm;
    confirmModal.classList.remove('hidden');
  }

  btnModalCancel.addEventListener('click', () => {
    confirmModal.classList.add('hidden');
    pendingDeleteAction = null;
  });

  btnModalConfirm.addEventListener('click', async () => {
    confirmModal.classList.add('hidden');
    if (typeof pendingDeleteAction === 'function') {
      const action = pendingDeleteAction;
      pendingDeleteAction = null;
      await action();
    }
  });

  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) {
      confirmModal.classList.add('hidden');
      pendingDeleteAction = null;
    }
  });

  // =============================================================
  // CHANGE PASSWORD
  // =============================================================
  const passwordModal = document.getElementById('admin-password-modal');
  const passwordForm = document.getElementById('admin-password-form');
  const passwordModalDesc = document.getElementById('password-modal-desc');
  const pwCurrent = document.getElementById('pw-current');
  const pwUsername = document.getElementById('pw-username');
  const pwNew = document.getElementById('pw-new');
  const pwNewRepeat = document.getElementById('pw-new-repeat');
  const pwError = document.getElementById('password-error-msg');
  const btnPasswordCancel = document.getElementById('btn-password-cancel');
  const btnPasswordSave = document.getElementById('btn-password-save');
  const btnOpenPassword = document.getElementById('btn-open-password');
  const defaultPasswordDesc = passwordModalDesc.textContent;
  let passwordChangeForced = false;

  function showPasswordError(msg) {
    pwError.textContent = msg;
    pwError.style.display = msg ? 'block' : 'none';
  }

  async function openPasswordModal(forced, username) {
    passwordChangeForced = Boolean(forced);
    passwordForm.reset();
    showPasswordError('');
    btnPasswordCancel.textContent = passwordChangeForced ? 'Çıkış Yap' : 'Vazgeç';
    passwordModalDesc.textContent = passwordChangeForced
      ? 'Varsayılan şifreyle (admin / admin) giriş yaptınız. Panele geçmeden önce kendi şifrenizi belirleyin. ' + defaultPasswordDesc
      : defaultPasswordDesc;
    pwUsername.value = username || '';
    passwordModal.classList.remove('hidden');
    pwCurrent.focus();

    if (!username) {
      try {
        const res = await apiFetch('me');
        if (res.ok) {
          const data = await res.json();
          if (!pwUsername.value) pwUsername.value = data.username || '';
        }
      } catch (e) {}
    }
  }

  async function closePasswordModal() {
    passwordModal.classList.add('hidden');
    passwordForm.reset();
    if (passwordChangeForced) {
      // A forced change cannot be skipped: drop the restricted session
      passwordChangeForced = false;
      try { await apiFetch('logout', { method: 'POST' }); } catch (e) {}
      adminToken = null;
      storeToken(null);
      showLogin();
    }
  }

  btnOpenPassword.addEventListener('click', () => openPasswordModal(false));
  btnPasswordCancel.addEventListener('click', closePasswordModal);

  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showPasswordError('');

    const currentPassword = pwCurrent.value;
    const newUsername = pwUsername.value.trim();
    const newPassword = pwNew.value;

    if (newPassword !== pwNewRepeat.value) {
      showPasswordError('Yeni şifreler birbiriyle eşleşmiyor.');
      return;
    }

    btnPasswordSave.disabled = true;
    try {
      const res = await apiFetch('change_password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newUsername, newPassword })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        passwordChangeForced = false;
        passwordModal.classList.add('hidden');
        passwordForm.reset();
        showToast(data.message || 'Şifre güncellendi.', 'success');
        await checkAuthAndLoad();
      } else if (res.status === 401) {
        passwordChangeForced = false;
        passwordModal.classList.add('hidden');
        adminToken = null;
        storeToken(null);
        showLogin();
        showToast('Oturum süresi doldu. Lütfen tekrar giriş yapın.', 'danger');
      } else {
        showPasswordError(data.error || 'Şifre güncellenemedi.');
      }
    } catch (err) {
      showPasswordError('Sunucuya bağlanırken bir hata oluştu.');
    } finally {
      btnPasswordSave.disabled = false;
    }
  });

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Check on startup
  checkAuthAndLoad();
})();
  
// Admin Theme Switcher
const adminThemeBtn = document.getElementById('admin-theme-toggle');
const adminThemeIcon = document.getElementById('admin-theme-icon');
const adminThemeText = document.getElementById('admin-theme-text');
function syncAdminTheme() {
  const cur = localStorage.getItem('ulak_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', cur);
  if (adminThemeIcon) adminThemeIcon.textContent = cur === 'light' ? '🌙' : '☀️';
  if (adminThemeText) adminThemeText.textContent = cur === 'light' ? 'Karanlık' : 'Aydınlık';
}
if (adminThemeBtn) {
  adminThemeBtn.addEventListener('click', () => {
    const cur = localStorage.getItem('ulak_theme') || 'dark';
    const next = cur === 'light' ? 'dark' : 'light';
    localStorage.setItem('ulak_theme', next);
    syncAdminTheme();
  });
}
syncAdminTheme();

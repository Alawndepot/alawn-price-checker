'use strict';
// قارئ أسعار العون — قراءة فقط من Google Sheet
const CFG = window.APP_CONFIG || {};
const $ = id => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

// ---------- البيانات ----------
let DATA = null;          // {updated, fetchedAt, items:[[barcode,name,price,code]]}
let INDEX = new Map();    // كود موحّد ← رقم الصنف
let SEARCH = [];          // أسماء موحّدة للبحث

function normCode(s) {
  s = String(s == null ? '' : s).trim().replace(/\s+/g, '').toUpperCase();
  if (/^\d+$/.test(s)) s = s.replace(/^0+/, '') || '0';   // الصفر البادئ (UPC-A / EAN-13)
  return s;
}
function normAr(s) {
  return String(s || '').toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')   // تشكيل وتطويل
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ').trim();
}
function priceOf(v) {
  const n = Number(String(v == null ? '' : v).replace(/,/g, '').trim());
  return isFinite(n) && n > 0 ? n.toFixed(3) : null;   // 3 خانات زي ليبلات المحل
}
function buildIndex() {
  INDEX = new Map(); SEARCH = [];
  (DATA ? DATA.items : []).forEach((it, i) => {
    [it[0], it[3]].forEach(c => { const k = normCode(c); if (k && !INDEX.has(k)) INDEX.set(k, i); });
    SEARCH.push(normAr(it[1]));
  });
}
function loadLocal() {
  const raw = store.get('alawn_data');
  if (!raw) return false;
  try { DATA = JSON.parse(raw); buildIndex(); return true; } catch (e) { return false; }
}

async function fetchData(code) {
  if (!CFG.API_URL) throw new Error('no_api');
  const url = CFG.API_URL + (CFG.API_URL.includes('?') ? '&' : '?') + 'k=' + encodeURIComponent(code) + '&t=' + Date.now();
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(url, { cache: 'no-store', signal: ctrl.signal, redirect: 'follow' });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'bad');
    return { updated: j.updated || '', fetchedAt: new Date().toISOString(), items: j.items || [] };
  } finally { clearTimeout(t); }
}

let refreshing = false;
async function refresh(manual) {
  const code = store.get('alawn_code');
  if (!code || refreshing) return;
  refreshing = true; setStatus('جاري تحديث الأسعار…');
  try {
    const d = await fetchData(code);
    DATA = d; buildIndex();
    if (!store.set('alawn_data', JSON.stringify(d))) console.warn('storage full');
    setStatus();
    if (manual) toast('تحدّثت الأسعار ✓');
  } catch (e) {
    if (e.message === 'unauthorized') { logout('الكود تغيّر — اكتب الكود الجديد'); return; }
    setStatus(DATA ? 'ما قدرت أحدّث — شغال على آخر نسخة محفوظة' : 'ما في اتصال — لازم إنترنت أول مرة', true);
  } finally { refreshing = false; }
}

function fmtTime(iso) {
  try { const d = new Date(iso); return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
}
function setStatus(msg, warn) {
  const el = $('status');
  el.classList.toggle('warn', !!warn);
  if (msg) { el.textContent = msg; return; }
  if (!DATA) { el.textContent = ''; return; }
  const n = DATA.items.length;
  el.innerHTML = 'آخر تحديث للأسعار: <span class="num">' + esc(DATA.updated || '—') + '</span><br>' +
    '<span class="num">' + n + '</span> صنف · نزلت <span class="num">' + fmtTime(DATA.fetchedAt) + '</span>';
}
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------- عرض النتيجة ----------
function lookup(raw) {
  const k = normCode(raw);
  if (!k) return;
  const i = INDEX.get(k);
  if (i === undefined) renderNotFound(String(raw).trim());
  else renderItem(DATA.items[i]);
}
function renderItem(it) {
  const p = priceOf(it[2]);
  $('result').innerHTML =
    '<div class="card">' +
      '<div class="name">' + esc(it[1]) + '</div>' +
      (p ? '<div class="price"><span class="v num">' + p + '</span><span class="c">د.أ</span></div>'
         : '<div class="noprice">السعر غير متوفر — راجع الإدارة</div>') +
      '<div class="meta">الباركود: <span class="num">' + esc(it[0] || it[3]) + '</span></div>' +
    '</div>';
}
function renderNotFound(code) {
  $('result').innerHTML =
    '<div class="card notfound">' +
      '<div class="head">⚠️ الصنف غير موجود</div>' +
      '<div class="meta">الرقم الممسوح: <span class="num">' + esc(code) + '</span></div>' +
      '<div class="actions">' +
        '<button class="btn light" onclick="openManual()">⌨️ أدخل الرقم</button>' +
        '<button class="btn light" onclick="openSearch()">🔍 ابحث بالاسم</button>' +
      '</div>' +
    '</div>';
}

// ---------- صوت واهتزاز ----------
let audioCtx = null;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'square'; o.frequency.value = 1900; g.gain.value = 0.06;
    o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.08);
  } catch (e) {}
  try { navigator.vibrate && navigator.vibrate(60); } catch (e) {}
  const w = $('win'); w.classList.add('hit'); setTimeout(() => w.classList.remove('hit'), 700);
}

// ---------- الكاميرا والمسح ----------
const FORMATS = ['code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e'];
let detector = null, stream = null, track = null, scanning = false, torchOn = false;
let lastCode = '', lastAt = 0, lastActivity = Date.now();
const canvas = document.createElement('canvas');
const ctx2d = canvas.getContext('2d', { willReadFrequently: true });

async function getDetector() {
  if (detector) return detector;
  if ('BarcodeDetector' in window) {
    try {
      const sup = await window.BarcodeDetector.getSupportedFormats();
      if (sup.includes('code_128')) { detector = new window.BarcodeDetector({ formats: FORMATS.filter(f => sup.includes(f)) }); return detector; }
    } catch (e) {}
  }
  const mod = await import('https://cdn.jsdelivr.net/npm/barcode-detector@3.2.0/dist/es/ponyfill.js/+esm');
  detector = new mod.BarcodeDetector({ formats: FORMATS });
  return detector;
}

function overlay(html) {
  const o = $('camOverlay');
  if (!html) { o.classList.add('hidden'); o.innerHTML = ''; return; }
  o.innerHTML = html; o.classList.remove('hidden');
}

async function startCamera() {
  if (scanning) return;
  overlay('<div>جاري تشغيل الكاميرا…</div>');
  try {
    await getDetector();
  } catch (e) {
    overlay('<div class="big">قارئ الباركود ما اشتغل</div><div>تأكد من الإنترنت أول مرة، أو استخدم إدخال الرقم</div>');
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
  } catch (e) {
    overlay('<div class="big">ما في إذن للكاميرا</div><div>اسمح للكاميرا من إعدادات المتصفح، أو استخدم إدخال الرقم</div>' +
            '<button class="btn" style="flex:none;padding:0 24px" onclick="startCamera()">حاول مرة ثانية</button>');
    return;
  }
  const v = $('video');
  v.srcObject = stream;
  try { await v.play(); } catch (e) {}
  track = stream.getVideoTracks()[0];
  try { await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (e) {}
  const caps = (track.getCapabilities && track.getCapabilities()) || {};
  $('torchBtn').classList.toggle('hidden', !caps.torch);
  torchOn = false; $('torchBtn').classList.remove('on');
  scanning = true; lastActivity = Date.now();
  overlay(null);
  scanLoop();
}

function stopCamera(msg) {
  scanning = false;
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null; track = null;
  $('torchBtn').classList.add('hidden');
  if (msg) overlay('<div class="big">' + msg + '</div><div>اضغط هون للمتابعة</div>');
}

async function scanLoop() {
  if (!scanning) return;
  const v = $('video');
  if (Date.now() - lastActivity > (CFG.IDLE_SECONDS || 90) * 1000) { stopCamera('الكاميرا وقفت لتوفير البطارية'); return; }
  if (v.readyState >= 2 && v.videoWidth) {
    // نقرأ الشريط الأفقي بالنص بس (أسرع وأقل غلط)
    const vw = v.videoWidth, vh = v.videoHeight;
    const sx = Math.round(vw * 0.04), sw = Math.round(vw * 0.92);
    const sy = Math.round(vh * 0.25), sh = Math.round(vh * 0.5);
    const scale = Math.min(1, 1280 / sw);
    canvas.width = Math.round(sw * scale); canvas.height = Math.round(sh * scale);
    ctx2d.drawImage(v, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    try {
      const res = await detector.detect(canvas);
      if (res && res.length) onCode(res[0].rawValue);
    } catch (e) {}
  }
  setTimeout(scanLoop, 120);
}

function onCode(raw) {
  const code = String(raw || '').trim();
  if (!code) return;
  const now = Date.now();
  if (code === lastCode && now - lastAt < (CFG.SAME_CODE_SECONDS || 2.5) * 1000) { lastAt = now; lastActivity = now; return; }
  lastCode = code; lastAt = now; lastActivity = now;
  beep();
  lookup(code);
}
window.__simulateScan = onCode;   // للاختبار

async function toggleTorch() {
  if (!track) return;
  torchOn = !torchOn;
  try { await track.applyConstraints({ advanced: [{ torch: torchOn }] }); } catch (e) { torchOn = false; }
  $('torchBtn').classList.toggle('on', torchOn);
  lastActivity = Date.now();
}

// ---------- الإدخال اليدوي والبحث ----------
function openSheet(id) { $(id).classList.remove('hidden'); lastActivity = Date.now(); }
function closeSheets() { document.querySelectorAll('.sheet').forEach(s => s.classList.add('hidden')); lastActivity = Date.now(); }
function openManual() { closeSheets(); openSheet('manualSheet'); const i = $('manualInput'); i.value = ''; setTimeout(() => i.focus(), 50); }
function openSearch() { closeSheets(); openSheet('searchSheet'); const i = $('searchInput'); i.value = ''; $('searchList').innerHTML = ''; $('searchInfo').textContent = ''; setTimeout(() => i.focus(), 50); }
window.openManual = openManual; window.openSearch = openSearch;

function doManual() {
  const v = $('manualInput').value;
  if (!v.trim()) return;
  closeSheets(); lookup(v);
}

let searchTimer = null;
function doSearch() {
  const q = normAr($('searchInput').value);
  const list = $('searchList'), info = $('searchInfo');
  if (q.length < 2 || !DATA) { list.innerHTML = ''; info.textContent = q ? 'اكتب حرفين على الأقل' : ''; return; }
  const words = q.split(' ');
  const hits = [];
  for (let i = 0; i < SEARCH.length && hits.length < 200; i++) {
    const s = SEARCH[i];
    if (words.every(w => s.includes(w))) hits.push(i);
  }
  hits.sort((a, b) => (SEARCH[a].startsWith(q) ? 0 : 1) - (SEARCH[b].startsWith(q) ? 0 : 1) || SEARCH[a].length - SEARCH[b].length);
  const shown = hits.slice(0, 40);
  info.textContent = hits.length ? (hits.length > 40 ? 'أول 40 من ' + hits.length + ' نتيجة — زيد كلمة للتدقيق' : hits.length + ' نتيجة') : 'ما لقيت ولا صنف';
  list.innerHTML = shown.map(i => {
    const it = DATA.items[i], p = priceOf(it[2]);
    return '<li data-i="' + i + '"><span class="n">' + esc(it[1]) + '</span>' +
      (p ? '<span class="p num">' + p + '</span>' : '<span class="p z">بدون سعر</span>') + '</li>';
  }).join('');
}

// قارئ باركود Bluetooth (بيكتب زي الكيبورد وبيكبس Enter)
let kbBuf = '', kbAt = 0;
document.addEventListener('keydown', e => {
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const now = Date.now();
  if (now - kbAt > 100) kbBuf = '';
  kbAt = now;
  if (e.key === 'Enter') { if (kbBuf.length >= 4) { lastActivity = now; beep(); lookup(kbBuf); } kbBuf = ''; return; }
  if (e.key.length === 1) kbBuf += e.key;
});

// ---------- الدخول ----------
function logout(msg) {
  store.del('alawn_code');
  showSetup(msg);
}
function showSetup(msg) {
  stopCamera();
  $('app').classList.add('hidden'); $('setup').classList.remove('hidden');
  $('setupMsg').textContent = msg || '';
  setTimeout(() => $('codeInput').focus(), 50);
}
async function submitCode() {
  const code = $('codeInput').value.trim();
  if (!code) return;
  $('setupMsg').textContent = 'لحظة…';
  try {
    const d = await fetchData(code);
    store.set('alawn_code', code);
    DATA = d; buildIndex(); store.set('alawn_data', JSON.stringify(d));
    showApp();
  } catch (e) {
    $('setupMsg').textContent = e.message === 'unauthorized' ? 'الكود غلط' :
      e.message === 'no_api' ? 'التطبيق لسا ما انربط بالشيت' : 'ما في اتصال بالإنترنت — حاول مرة ثانية';
  }
}
function showApp() {
  $('setup').classList.add('hidden'); $('app').classList.remove('hidden');
  setStatus();
  startCamera();
}

function toast(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);background:#0f172a;color:#fff;padding:10px 18px;border-radius:999px;z-index:20;font-size:16px';
  document.body.appendChild(el); setTimeout(() => el.remove(), 1800);
}

// ---------- تثبيت التطبيق على التلفون ----------
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); installEvt = e;
  ['installBtn', 'installBtn2'].forEach(id => $(id).classList.remove('hidden'));
});
window.addEventListener('appinstalled', () => {
  installEvt = null;
  ['installBtn', 'installBtn2'].forEach(id => $(id).classList.add('hidden'));
  toast('انثبّت التطبيق ✓');
});
async function doInstall() {
  if (!installEvt) return;
  installEvt.prompt();
  try { await installEvt.userChoice; } catch (e) {}
  installEvt = null;
  ['installBtn', 'installBtn2'].forEach(id => $(id).classList.add('hidden'));
}

// ---------- التشغيل ----------
function init() {
  // رابط تفعيل: ...#k=الكود
  const m = location.hash.match(/k=([^&]+)/);
  if (m) { store.set('alawn_code', decodeURIComponent(m[1])); history.replaceState(null, '', location.pathname + location.search); }

  $('codeBtn').onclick = submitCode;
  $('codeInput').addEventListener('keydown', e => { if (e.key === 'Enter') submitCode(); });
  $('refreshBtn').onclick = () => refresh(true);
  $('installBtn').onclick = doInstall;
  $('installBtn2').onclick = doInstall;
  $('torchBtn').onclick = toggleTorch;
  $('manualBtn').onclick = openManual;
  $('searchBtn').onclick = openSearch;
  $('manualGo').onclick = doManual;
  $('manualInput').addEventListener('keydown', e => { if (e.key === 'Enter') doManual(); });
  $('searchInput').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(doSearch, 120); });
  $('searchList').addEventListener('click', e => {
    const li = e.target.closest('li'); if (!li) return;
    closeSheets(); renderItem(DATA.items[Number(li.dataset.i)]);
  });
  document.querySelectorAll('.sheet').forEach(s => s.addEventListener('click', e => {
    if (e.target === s || e.target.hasAttribute('data-close')) closeSheets();
  }));
  $('camOverlay').addEventListener('click', () => { if (!scanning) startCamera(); });
  $('cam').addEventListener('click', () => { lastActivity = Date.now(); });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCamera();
    else if (!$('app').classList.contains('hidden')) { startCamera(); maybeRefresh(); }
  });

  const hasCode = !!store.get('alawn_code');
  const hasData = loadLocal();
  if (!hasCode) { showSetup(); return; }
  showApp();
  if (!hasData) refresh(); else maybeRefresh();
  setInterval(maybeRefresh, 5 * 60 * 1000);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
function maybeRefresh() {
  const age = DATA && DATA.fetchedAt ? Date.now() - new Date(DATA.fetchedAt).getTime() : Infinity;
  if (age > (CFG.REFRESH_MINUTES || 60) * 60 * 1000) refresh();
}

init();

'use strict';
// تطبيق الصحي — محلات العون · قراءة فقط من شيتات الصحي
const CFG = window.APP_CONFIG || {};
const $ = id => document.getElementById(id);
// مفاتيح تخزين خاصة بالصحي (نفس الموقع فيه قارئ الأسعار)
const KEY_CODE = 'sihhi_code', KEY_DATA = 'sihhi_data';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

// ---------- البيانات ----------
// items: [كود, اسم, سعر القائمة, تعبئة الكرتونة, الخصم, سعر الجملة, سعر البيع, تنبيه الشيت, رقم الشيت, القسم]
const F = { code: 0, name: 1, list: 2, carton: 3, disc: 4, cost: 5, sale: 6, flag: 7, sheet: 8, sec: 9 };
let DATA = null;          // {updated, fetchedAt, sheets:[{title,discount,date,ok}], items:[...]}
let INDEX = new Map();    // كود موحّد ← رقم الصنف
let SEARCH = [];          // أسماء موحّدة للبحث
let FILTER = 'all';       // all · رقم الشيت · low

function num(v) {
  const n = Number(String(v == null ? '' : v).replace(/[,%\s]/g, ''));
  return String(v == null ? '' : v).trim() !== '' && isFinite(n) ? n : null;
}
function money(v) { const n = num(v); return n !== null && n > 0 ? n.toFixed(3) : null; }
// الربح على التكلفة: خسران · قليل · تمام
function profitOf(it) {
  const cost = num(it[F.cost]), sale = num(it[F.sale]);
  if (!(cost > 0) || !(sale > 0)) return null;
  const amt = sale - cost, pct = amt / cost * 100;
  const level = amt <= 0 ? 'loss' : (pct < (CFG.LOW_MARGIN_PCT || 20) || String(it[F.flag]).indexOf('قليل') >= 0) ? 'low' : 'ok';
  return { amt, pct, level };
}

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
function buildIndex() {
  INDEX = new Map(); SEARCH = [];
  (DATA ? DATA.items : []).forEach((it, i) => {
    const k = normCode(it[F.code]); if (k && !INDEX.has(k)) INDEX.set(k, i);
    SEARCH.push(normAr(it[F.name] + ' ' + (it[F.sec] || '')));
  });
}
function loadLocal() {
  const raw = store.get(KEY_DATA);
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
    return { updated: j.updated || '', fetchedAt: new Date().toISOString(), sheets: j.sheets || [], items: j.items || [] };
  } finally { clearTimeout(t); }
}

let refreshing = false;
async function refresh(manual) {
  const code = store.get(KEY_CODE);
  if (!code || refreshing) return;
  refreshing = true; setStatus('جاري تحديث الأسعار…');
  try {
    const d = await fetchData(code);
    DATA = d; buildIndex();
    if (!store.set(KEY_DATA, JSON.stringify(d))) console.warn('storage full');
    setStatus();
    if (manual) toast('تحدّثت الأسعار ✓');
  } catch (e) {
    if (e.message === 'unauthorized') { logout('الكود تغيّر — اكتب الكود الجديد'); return; }
    setStatus(DATA ? 'ما قدرت أحدّث — شغال على آخر نسخة محفوظة' : 'ما في اتصال — لازم إنترنت أول مرة', true);  } finally { refreshing = false; }
}

function fmtTime(iso) {
  try { const d = new Date(iso); return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
}
function setStatus(msg, warn) {
  const el = $('status');
  el.classList.toggle('warn', !!warn);
  if (msg) { el.textContent = msg; return; }
  if (!DATA) { el.textContent = ''; return; }
  const n = DATA.items.length, bad = (DATA.sheets || []).filter(s => !s.ok).map(s => s.title);
  el.classList.toggle('warn', bad.length > 0);
  el.innerHTML = '<span class="num">' + n + '</span> صنف · تحدّث <span class="num">' + fmtTime(DATA.fetchedAt) + '</span>' +
    (bad.length ? '<br>ما انقرا: ' + esc(bad.join('، ')) : '');
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
function cell(label, val, cls) {
  return '<div class="cell ' + (cls || '') + '"><div class="l">' + label + '</div><div class="x num">' + (val ? esc(val) : '—') + '</div></div>';
}
function renderItem(it) {
  const sh = (DATA.sheets || [])[it[F.sheet]] || {};
  const sale = money(it[F.sale]), cost = money(it[F.cost]), list = money(it[F.list]);
  const pr = profitOf(it);
  const disc = String(it[F.disc] || '').trim();
  const carton = String(it[F.carton] || '').trim();
  let profit = '';
  if (pr) {
    const t = pr.level === 'loss' ? '⛔ خسران' : pr.level === 'low' ? '⚠️ ربح قليل' : '✓ الربح';
    profit = '<div class="profit ' + pr.level + '">' + t + ': <span class="num">' + pr.amt.toFixed(3) + '</span> د.أ · <span class="num">' +
      Math.round(pr.pct) + '%</span> على التكلفة</div>';
  } else if (!cost) profit = '<div class="profit low">التكلفة مش مكتوبة بالشيت</div>';
  $('result').innerHTML =
    '<div class="card">' +
      '<div class="src">' + esc(sh.title || '') + (it[F.sec] ? ' · ' + esc(it[F.sec]) : '') + '</div>' +
      '<div class="name">' + esc(it[F.name]) + '</div>' +
      (sale ? '<div class="price"><span class="v num">' + sale + '</span><span class="c">د.أ سعر البيع</span></div>'
            : '<div class="noprice">سعر البيع مش مكتوب</div>') +
      profit +
      '<div class="grid">' +
        cell('سعر القائمة (الشركة)', list) +
        cell('الخصم', disc) +
        cell('سعر الجملة (التكلفة)', cost, 'cost') +
        (carton ? cell('تعبئة الكرتونة', carton) : cell('الكود', it[F.code] || 'بدون كود')) +
      '</div>' +
      (carton ? '<div class="meta">الكود: <span class="num">' + esc(it[F.code] || 'بدون كود') + '</span></div>' : '') +
      (sh.date ? '<div class="meta">خصم ' + esc(sh.title) + ': <span class="num">' + esc(sh.discount) + '</span> · من <span class="num">' + esc(sh.date) + '</span></div>' : '') +
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
function openSearch() { closeSheets(); openSheet('searchSheet'); const i = $('searchInput'); i.value = ''; renderChips(); doSearch(); }
window.openManual = openManual; window.openSearch = openSearch;

function doManual() {
  const v = $('manualInput').value;
  if (!v.trim()) return;
  closeSheets(); lookup(v);
}

let searchTimer = null;
// أزرار الفلترة: الكل · كل شيت لحاله · ربح قليل
function renderChips() {
  const sheets = (DATA && DATA.sheets) || [];
  const opts = [['all', 'الكل']].concat(sheets.map((s, i) => [String(i), s.title]), [['low', '⚠️ ربح قليل']]);
  $('chips').innerHTML = opts.map(([k, t]) => '<button class="chip' + (FILTER === k ? ' on' : '') + '" data-f="' + k + '">' + esc(t) + '</button>').join('');
}
function passFilter(it) {
  if (FILTER === 'all') return true;
  if (FILTER === 'low') { const p = profitOf(it); return !!p && p.level !== 'ok'; }
  return String(it[F.sheet]) === FILTER;
}
function doSearch() {
  const q = normAr($('searchInput').value);
  const list = $('searchList'), info = $('searchInfo');
  if (!DATA) { list.innerHTML = ''; info.textContent = 'لسا ما نزلت البيانات'; return; }
  const words = q ? q.split(' ') : [];
  const hits = [];
  for (let i = 0; i < SEARCH.length; i++) {
    if (!passFilter(DATA.items[i])) continue;
    if (words.every(w => SEARCH[i].includes(w))) hits.push(i);
  }
  const MAX = 300, shown = hits.slice(0, MAX);
  info.textContent = hits.length ? (hits.length > MAX ? 'أول ' + MAX + ' من ' + hits.length + ' — زيد كلمة للتدقيق' : hits.length + ' صنف') : 'ما لقيت ولا صنف';
  // ترتيب الشيت نفسه مع عناوين الأقسام
  let lastSec = null;
  list.innerHTML = shown.map(i => {
    const it = DATA.items[i], p = money(it[F.sale]), pr = profitOf(it);
    const secKey = it[F.sheet] + '|' + (it[F.sec] || '');
    let head = '';
    if (secKey !== lastSec) {
      lastSec = secKey;
      const sh = (DATA.sheets[it[F.sheet]] || {}).title || '';
      head = '<li class="sec">' + esc(sh) + (it[F.sec] ? ' · ' + esc(it[F.sec]) : '') + '</li>';
    }
    const mark = pr && pr.level === 'loss' ? '<span class="m loss">خسران</span>' : pr && pr.level === 'low' ? '<span class="m low">ربح قليل</span>' : '';
    return head + '<li data-i="' + i + '"><span class="n">' + esc(it[F.name]) + '</span>' + mark +
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
  store.del(KEY_CODE);
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
    store.set(KEY_CODE, code);
    DATA = d; buildIndex(); store.set(KEY_DATA, JSON.stringify(d));
    showApp();
  } catch (e) {
    $('setupMsg').textContent = e.message === 'unauthorized' ? 'الكود غلط' :
      e.message === 'no_api' ? 'التطبيق لسا ما انربط بالشيتات' : 'ما في اتصال بالإنترنت — حاول مرة ثانية';
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
  if (m) { store.set(KEY_CODE, decodeURIComponent(m[1])); history.replaceState(null, '', location.pathname + location.search); }

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
  $('chips').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    FILTER = b.dataset.f; renderChips(); doSearch(); lastActivity = Date.now();
  });
  $('searchList').addEventListener('click', e => {
    const li = e.target.closest('li'); if (!li || li.classList.contains('sec')) return;
    closeSheets(); renderItem(DATA.items[Number(li.dataset.i)]);
  });
  document.querySelectorAll('.sheet').forEach(s => s.addEventListener('click', e => {
    if (e.target === s || e.target.hasAttribute('data-close')) closeSheets();
  }));
  $('camOverlay').addEventListener('click', () => { if (!scanning) startCamera(); });
  $('cam').addEventListener('click', () => { lastActivity = Date.now(); });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCamera();
    else if (!$('app').classList.contains('hidden')) { startCamera(); maybeRefresh(); checkAppVersion(); }
  });

  const hasCode = !!store.get(KEY_CODE);
  const hasData = loadLocal();
  if (!hasCode) { showSetup(); return; }
  showApp();
  // تحديث الأسعار مع كل فتح (الأسعار المحفوظة بتنعرض فوراً والجديدة بتنزل بالخلفية)
  refresh();
  checkAppVersion();
  setInterval(() => { if (!document.hidden) { maybeRefresh(); checkAppVersion(); } }, 3 * 60 * 1000);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(reg => {
    window.__swReg = reg;
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { try { reg.update(); } catch (e) {} } });
  }).catch(() => {});
}
// تحديث الأسعار تلقائي: مع كل فتح/رجوع للتطبيق، وكل 3 دقايق وهو مفتوح (بدون ما نضغط على الخادم أكثر من مرة كل 30 ثانية)
function maybeRefresh() {
  const age = DATA && DATA.fetchedAt ? Date.now() - new Date(DATA.fetchedAt).getTime() : Infinity;
  if (age > (CFG.MIN_REFETCH_SECONDS || 30) * 1000) refresh();
}

// تحديث البرنامج نفسه: إذا في نسخة جديدة منزّلة بنعيد التحميل لحالنا (بدون ما نقطع مسح شغال)
const APP_VERSION = '2';
let versionChecking = false;
async function checkAppVersion() {
  if (versionChecking) return;
  versionChecking = true;
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    const j = await r.json();
    if (j && j.v && String(j.v) !== APP_VERSION) {
      const busy = !document.querySelector('.sheet:not(.hidden)') && (Date.now() - lastActivity > 4000);
      if (busy || document.hidden) {
        try { if (window.__swReg) await window.__swReg.update(); } catch (e) {}
        try { const ks = await caches.keys(); await Promise.all(ks.filter(k => k.startsWith('sihhi-')).map(k => caches.delete(k))); } catch (e) {}
        location.reload();
      }
    }
  } catch (e) {} finally { versionChecking = false; }
}

init();

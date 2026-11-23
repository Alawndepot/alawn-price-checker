'use strict';
// تطبيق الصحي 2 — مرجع أسعار الجملة والطلبيات · محلات العون لمواد البناء
const CFG = window.APP_CONFIG || {};
const $ = id => document.getElementById(id);
const KEY_CODE = 'sihhi_code', KEY_DATA = 'sihhi_data2', KEY_CART = 'sihhi_cart', KEY_QUOTE = 'sihhi_quote';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

// ---------- البيانات ----------
// items:     [المعرّف, الكود, الصنف, القسم, المصدر, تعبئة الكرتونة, سعر البيع, ملاحظة]
// suppliers: [المورد, التلفون, ملاحظة]
// prices:    [التاريخ, المعرّف, المورد, سعر القائمة, الخصم, الصافي, المصدر, ملاحظة]   (سجل — كل سعر بينضاف ما بينمسح)
const I = { id: 0, code: 1, name: 2, sec: 3, src: 4, carton: 5, sale: 6, note: 7 };
let DATA = null;
let BYID = new Map(), BYCODE = new Map(), SEARCH = [], PX = new Map();
let FILTER = 'all';
let QUOTE = store.get(KEY_QUOTE) || '';      // وضع «عرض مورد»: اسم المورد اللي عم ندخّل أسعاره
let CART = [];                                // [{id, qty, sup}]
try { CART = JSON.parse(store.get(KEY_CART) || '[]') || []; } catch (e) { CART = []; }
let CURRENT = null;                           // الصنف المعروض

function num(v) {
  const s = String(v == null ? '' : v).replace(/[,%\s]/g, '');
  const n = Number(s);
  return s !== '' && isFinite(n) ? n : null;
}
function m3(n) { return (n == null || !isFinite(n)) ? '—' : Number(n).toFixed(3); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function normCode(s) {
  s = String(s == null ? '' : s).trim().replace(/\s+/g, '').toUpperCase();
  if (/^\d+$/.test(s)) s = s.replace(/^0+/, '') || '0';
  return s;
}
function normAr(s) {
  return String(s || '').toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ').trim();
}
// "dd/MM/yyyy HH:mm" ← رقم للترتيب
function dkey(d) {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(String(d || ''));
  return m ? +(m[3] + ('0' + m[2]).slice(-2) + ('0' + m[1]).slice(-2) + ('0' + (m[4] || 0)).slice(-2) + (m[5] || '00')) : 0;
}
function dshort(d) { return String(d || '').split(' ')[0]; }

function buildIndex() {
  BYID = new Map(); BYCODE = new Map(); SEARCH = []; PX = new Map();
  if (!DATA) return;
  DATA.items.forEach((it, i) => {
    BYID.set(it[I.id], i);
    const k = normCode(it[I.code]); if (k && !BYCODE.has(k)) BYCODE.set(k, i);
    SEARCH.push(normAr(it[I.name] + ' ' + (it[I.sec] || '') + ' ' + (it[I.code] || '')));
  });
  // آخر سعر لكل مورد + أقل سعر حصلته بأي وقت
  const ps = DATA.prices.map((p, n) => ({ d: p[0], k: dkey(p[0]), n, id: p[1], sup: p[2], list: num(p[3]), disc: num(p[4]), net: num(p[5]) }))
    .filter(p => p.net > 0).sort((a, b) => a.k - b.k || a.n - b.n);
  ps.forEach(p => {
    let e = PX.get(p.id);
    if (!e) { e = { latest: new Map(), min: null }; PX.set(p.id, e); }
    e.latest.set(p.sup, p);
    if (!e.min || p.net < e.min.net) e.min = p;
  });
}
// موردين الصنف مرتبين من الأرخص
function supsOf(id) {
  const e = PX.get(id);
  return e ? [...e.latest.values()].sort((a, b) => a.net - b.net) : [];
}
function bestOf(id) { const s = supsOf(id); return s.length ? s[0] : null; }
function minEver(id) { const e = PX.get(id); return e ? e.min : null; }
function profit(cost, sale) {
  if (!(cost > 0) || !(sale > 0)) return null;
  const amt = sale - cost, pct = amt / cost * 100;
  return { amt, pct, level: amt <= 0 ? 'loss' : pct < (CFG.LOW_MARGIN_PCT || 20) ? 'low' : 'ok' };
}
function supplierPhone(name) { const s = (DATA.suppliers || []).find(x => x[0] === name); return s ? s[1] : ''; }

function loadLocal() {
  const raw = store.get(KEY_DATA);
  if (!raw) return false;
  try { DATA = JSON.parse(raw); buildIndex(); return true; } catch (e) { return false; }
}

// ---------- الاتصال ----------
async function fetchData(code) {
  if (!CFG.API_URL) throw new Error('no_api');
  const url = CFG.API_URL + (CFG.API_URL.includes('?') ? '&' : '?') + 'k=' + encodeURIComponent(code) + '&t=' + Date.now();
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(url, { cache: 'no-store', signal: ctrl.signal, redirect: 'follow' });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'bad');
    return { updated: j.updated || '', fetchedAt: new Date().toISOString(), items: j.items || [], suppliers: j.suppliers || [], prices: j.prices || [] };
  } finally { clearTimeout(t); }
}
async function api(body) {
  if (!CFG.API_URL) throw new Error('no_api');
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(CFG.API_URL, {
      method: 'POST', redirect: 'follow', signal: ctrl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ k: store.get(KEY_CODE) }, body))
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'bad');
    return j;
  } finally { clearTimeout(t); }
}
const ERR = {
  no_item: 'الصنف مش موجود بالمرجع', no_price: 'اكتب السعر', no_supplier: 'اختار المورد', no_name: 'اكتب اسم الصنف',
  code_exists: 'هالكود موجود لصنف ثاني', busy: 'السيرفر مشغول — جرب كمان شوي', empty: 'الطلبية فاضية', unauthorized: 'الكود تغيّر'
};
function errMsg(e) { return ERR[e && e.message] || 'ما انحفظ — تأكد من الإنترنت وجرب مرة ثانية'; }

let refreshing = false;
async function refresh(manual) {
  const code = store.get(KEY_CODE);
  if (!code || refreshing) return;
  refreshing = true; setStatus('جاري التحديث…');
  try {
    const d = await fetchData(code);
    DATA = d; buildIndex();
    store.set(KEY_DATA, JSON.stringify(d));
    setStatus(); updateCartBadge();
    if (CURRENT) { const i = BYID.get(CURRENT); if (i !== undefined && !isTyping()) renderItem(DATA.items[i]); }
    if (manual) toast('تحدّثت البيانات ✓');
  } catch (e) {
    if (e.message === 'unauthorized') { logout('الكود تغيّر — اكتب الكود الجديد'); return; }
    setStatus(DATA ? 'ما قدرت أحدّث — شغال على آخر نسخة' : 'ما في اتصال — لازم إنترنت أول مرة', true);
  } finally { refreshing = false; }
}
function isTyping() { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'SELECT'); }
function fmtTime(iso) { try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
function setStatus(msg, warn) {
  const el = $('status');
  el.classList.toggle('warn', !!warn);
  if (msg) { el.textContent = msg; return; }
  if (!DATA) { el.textContent = ''; return; }
  el.innerHTML = '<span class="num">' + DATA.items.length + '</span> صنف · <span class="num">' + DATA.suppliers.length +
    '</span> مورد<br>تحدّث <span class="num">' + fmtTime(DATA.fetchedAt) + '</span>';
}

// ---------- وضع «عرض مورد» ----------
function renderQuoteBar() {
  const b = $('quoteBar');
  if (!QUOTE) { b.classList.add('hidden'); b.innerHTML = ''; $('quoteBtn').classList.remove('on'); return; }
  b.innerHTML = '<span class="x">📝 عم تدخّل أسعار: ' + esc(QUOTE) + '</span><button id="quoteEnd">إنهاء</button>';
  b.classList.remove('hidden'); $('quoteBtn').classList.add('on');
  $('quoteEnd').onclick = () => { QUOTE = ''; store.del(KEY_QUOTE); renderQuoteBar(); if (CURRENT) showId(CURRENT); };
}
function openQuote() {
  const sups = (DATA ? DATA.suppliers : []).map(s => s[0]);
  form('<h2>📝 عرض سعر من مورد</h2>' +
    '<p style="margin:0;color:var(--muted)">اختار المورد، وبعدين امسح الأصناف أو ابحث عنها واكتب سعره. التطبيق بيقارنه فوراً بأقل سعر حصلته.</p>' +
    '<div class="f"><label>المورد<input id="qSup" list="supList" value="' + esc(QUOTE) + '" placeholder="اسم المورد" autocomplete="off"></label></div>' +
    supDatalist(sups) +
    '<div class="row2"><button class="btn" id="qGo">ابدأ</button><button class="btn light" data-close>إلغاء</button></div>');
  $('qGo').onclick = () => {
    const v = $('qSup').value.trim(); if (!v) return toast('اكتب اسم المورد');
    QUOTE = v; store.set(KEY_QUOTE, v); closeSheets(); renderQuoteBar();
    if (!sups.includes(v)) toast('مورد جديد — بينضاف مع أول سعر');
    if (CURRENT) showId(CURRENT);
  };
}
function supDatalist(sups) { return '<datalist id="supList">' + sups.map(s => '<option value="' + esc(s) + '">').join('') + '</datalist>'; }

// ---------- عرض الصنف ----------
function lookup(raw) {
  const k = normCode(raw);
  if (!k || !DATA) return;
  const i = BYCODE.has(k) ? BYCODE.get(k) : BYID.get(String(raw).trim());
  if (i === undefined) renderNotFound(String(raw).trim());
  else renderItem(DATA.items[i]);
}
function showId(id) { const i = BYID.get(id); if (i !== undefined) renderItem(DATA.items[i]); }

function renderItem(it) {
  CURRENT = it[I.id];
  const id = it[I.id], sups = supsOf(id), best = sups[0], low = minEver(id);
  const sale = num(it[I.sale]);
  const pr = best ? profit(best.net, sale) : null;
  const rows = sups.map((p, n) =>
    '<div class="row' + (n === 0 ? ' best' : '') + '"><span class="s">' + (n === 0 ? '⭐ ' : '') + esc(p.sup) + '</span>' +
    '<span class="d num">' + esc(dshort(p.d)) + (p.disc ? ' · خصم ' + esc(p.disc) + '%' : '') + '</span>' +
    '<span class="v num">' + m3(p.net) + '</span></div>').join('');
  const lowLine = low && best && low.net < best.net
    ? '<div class="lowever">⬇️ أقل سعر حصلته: <span class="num">' + m3(low.net) + '</span> من ' + esc(low.sup) + ' · <span class="num">' + esc(dshort(low.d)) + '</span></div>' : '';
  const inCart = CART.find(c => c.id === id);
  $('result').innerHTML =
    '<div class="card">' +
      '<div class="src">' + esc(it[I.sec] || it[I.src] || '') + '</div>' +
      '<div class="name">' + esc(it[I.name]) + '</div>' +
      '<div class="meta">الكود: <span class="num">' + esc(it[I.code] || 'بدون كود') + '</span>' + (it[I.carton] ? ' · الكرتونة: <span class="num">' + esc(it[I.carton]) + '</span>' : '') +
        (sale ? ' · البيع: <b class="num">' + m3(sale) + '</b>' : ' · <span style="color:var(--warn)">سعر البيع مش مكتوب</span>') + '</div>' +
      (best ? '<div class="price"><span class="v num">' + m3(best.net) + '</span><span class="c">أرخص سعر جملة · ' + esc(best.sup) + '</span></div>'
            : '<div class="noprice">ما في ولا سعر مورد لهالصنف لسا</div>') +
      (pr ? '<div class="profit ' + pr.level + '">' + (pr.level === 'loss' ? '⛔ خسران' : pr.level === 'low' ? '⚠️ ربح قليل' : '✓ الربح') +
            ' على أرخص سعر: <span class="num">' + m3(pr.amt) + '</span> د.أ · <span class="num">' + Math.round(pr.pct) + '%</span></div>' : '') +
      (sups.length ? '<div class="sups"><div class="row head"><span class="s">المورد</span><span class="d">آخر سعر</span><span class="v">الصافي</span></div>' + rows + '</div>' : '') +
      lowLine +
      '<div class="newp"><h3>' + (QUOTE ? '📝 سعر ' + esc(QUOTE) : '➕ سعر مورد جديد') + '</h3>' +
        '<div class="f">' +
          (QUOTE ? '' : '<label>المورد<input id="pSup" list="supList" autocomplete="off" placeholder="اسم المورد"></label>') +
          '<label>السعر الصافي<input id="pNet" inputmode="decimal" autocomplete="off" placeholder="0.000"></label>' +
        '</div>' +
        '<details style="margin-top:6px"><summary style="color:var(--muted);font-size:14px">سعر قائمة + خصم</summary><div class="f" style="margin-top:6px">' +
          '<label>سعر القائمة<input id="pList" inputmode="decimal" autocomplete="off"></label>' +
          '<label>الخصم %<input id="pDisc" inputmode="decimal" autocomplete="off"></label></div></details>' +
        '<div class="cmp" id="pCmp"></div>' +
        '<div class="row2" style="margin-top:8px"><button class="btn ok" id="pSave">💾 حفظ السعر</button></div>' +
      '</div>' +
      supDatalist((DATA.suppliers || []).map(s => s[0])) +
      '<div class="actions">' +
        '<div class="f" style="flex:1"><label>الكمية للطلبية<input id="cQty" inputmode="decimal" value="' + (inCart ? esc(inCart.qty) : '') + '" placeholder="مثلاً 10"></label></div>' +
        '<button class="btn" id="cAdd" style="align-self:flex-end">' + (inCart ? '🛒 عدّل الكمية' : '🛒 أضف للطلبية') + '</button>' +
      '</div>' +
    '</div>';
  const upd = () => compareInput(id, sale);
  ['pNet', 'pList', 'pDisc'].forEach(x => $(x).addEventListener('input', upd));
  $('pSave').onclick = () => savePrice(id);
  $('pNet').addEventListener('keydown', e => { if (e.key === 'Enter') savePrice(id); });
  $('cAdd').onclick = () => addToCart(id, $('cQty').value);
  if (QUOTE) setTimeout(() => $('pNet').focus(), 50);
}
// المقارنة الفورية مع أقل سعر
function inputNet() {
  const net = num($('pNet').value), list = num($('pList').value), disc = num($('pDisc').value);
  if (net > 0) return net;
  if (list > 0) return list * (1 - (disc > 0 ? disc : 0) / 100);
  return null;
}
function compareInput(id, sale) {
  const el = $('pCmp'), net = inputNet();
  if (!(net > 0)) { el.textContent = ''; el.className = 'cmp'; return; }
  const sup = QUOTE || ($('pSup') && $('pSup').value.trim());
  const others = supsOf(id).filter(p => p.sup !== sup);
  const ref = others.length ? others[0] : null, low = minEver(id);
  let t = '', cls = 'same';
  if (!ref && !low) { t = 'أول سعر لهالصنف'; }
  else {
    const base = ref ? ref.net : low.net, who = ref ? ref.sup : low.sup, diff = net - base, pct = Math.abs(diff) / base * 100;
    if (Math.abs(diff) < 0.0005) t = '= نفس أرخص سعر (' + who + ')';
    else if (diff < 0) { t = '✓ أرخص من ' + who + ' بـ ' + m3(-diff) + ' (' + Math.round(pct) + '%)'; cls = 'good'; }
    else { t = '✗ أغلى من ' + who + ' بـ ' + m3(diff) + ' (' + Math.round(pct) + '%)'; cls = 'bad'; }
    if (low && net > low.net && (!ref || low.net < ref.net)) t += ' · أقل سعر حصلته ' + m3(low.net) + ' من ' + low.sup;
  }
  const pr = profit(net, sale);
  if (pr) t += ' · ربحك ' + Math.round(pr.pct) + '%';
  el.textContent = t; el.className = 'cmp ' + cls;
}
let saving = false;
async function savePrice(id) {
  if (saving) return;
  const sup = QUOTE || ($('pSup').value || '').trim();
  const net = inputNet(), list = num($('pList').value), disc = num($('pDisc').value);
  if (!sup) return toast('اكتب اسم المورد');
  if (!(net > 0)) return toast('اكتب السعر');
  saving = true; $('pSave').textContent = 'لحظة…';
  try {
    await api({ action: 'price', id, supplier: sup, net: Math.round(net * 1000) / 1000, list: list || '', disc: disc || '' });
    // تحديث محلي فوري، وبعدين من السيرفر
    const nowS = new Date().toLocaleDateString('en-GB') + ' ' + fmtTime(new Date().toISOString());
    DATA.prices.push([nowS, id, sup, list || '', disc || '', String(Math.round(net * 1000) / 1000), 'التطبيق', '']);
    if (!DATA.suppliers.find(s => s[0] === sup)) DATA.suppliers.push([sup, '', '']);
    buildIndex(); store.set(KEY_DATA, JSON.stringify(DATA));
    toast('انحفظ سعر ' + sup + ' ✓');
    showId(id); setTimeout(() => refresh(), 1500);
  } catch (e) { toast(errMsg(e)); $('pSave').textContent = '💾 حفظ السعر'; }
  finally { saving = false; }
}
function renderNotFound(code) {
  CURRENT = null;
  $('result').innerHTML =
    '<div class="card notfound"><div class="head">⚠️ الصنف مش موجود بالمرجع</div>' +
    '<div class="meta">الرقم الممسوح: <span class="num">' + esc(code) + '</span></div>' +
    '<div class="actions"><button class="btn" onclick="openNewItem(\'' + esc(code).replace(/'/g, '') + '\')">➕ أضفه كصنف جديد</button>' +
    '<button class="btn light" onclick="openSearch()">🔍 ابحث بالاسم</button></div></div>';
}

// ---------- صنف جديد / مورد جديد ----------
function openMore() {
  form('<h2>إضافة</h2><div class="menu">' +
    '<button class="btn" onclick="openNewItem(\'\')">➕ صنف جديد</button>' +
    '<button class="btn" onclick="openNewSupplier()">👤 مورد جديد</button>' +
    '<button class="btn light" onclick="openSuppliers()">📋 قائمة الموردين</button>' +
    '<button class="btn light" data-close>إغلاق</button></div>');
}
function openNewItem(code) {
  const secs = [...new Set((DATA ? DATA.items : []).map(i => i[I.sec]).filter(Boolean))];
  form('<h2>➕ صنف جديد</h2>' +
    '<div class="f"><label>اسم الصنف (زي السيستيم)<input id="nName" autocomplete="off"></label></div>' +
    '<div class="f"><label>الكود (اختياري)<input id="nCode" inputmode="numeric" value="' + esc(code || '') + '" autocomplete="off"></label>' +
    '<label>القسم<input id="nSec" list="secList" autocomplete="off"></label></div>' +
    '<datalist id="secList">' + secs.map(s => '<option value="' + esc(s) + '">').join('') + '</datalist>' +
    '<div class="f"><label>تعبئة الكرتونة<input id="nCarton" inputmode="numeric"></label><label>سعر البيع<input id="nSale" inputmode="decimal"></label></div>' +
    '<div class="f"><label>المورد<input id="nSup" list="supList" value="' + esc(QUOTE) + '" autocomplete="off"></label><label>سعر الجملة الصافي<input id="nNet" inputmode="decimal"></label></div>' +
    supDatalist((DATA ? DATA.suppliers : []).map(s => s[0])) +
    '<div class="row2"><button class="btn ok" id="nSave">💾 حفظ الصنف</button><button class="btn light" data-close>إلغاء</button></div>');
  setTimeout(() => $('nName').focus(), 50);
  $('nSave').onclick = async () => {
    const b = { action: 'item', name: $('nName').value.trim(), code: $('nCode').value.trim(), sec: $('nSec').value.trim(),
      carton: $('nCarton').value.trim(), sale: num($('nSale').value) || '', supplier: $('nSup').value.trim(), net: num($('nNet').value) || '' };
    if (!b.name) return toast('اكتب اسم الصنف');
    if (b.net && !b.supplier) return toast('اكتب اسم المورد');
    $('nSave').textContent = 'لحظة…';
    try {
      const r = await api(b);
      closeSheets(); toast('انضاف الصنف ✓');
      await refresh(); showId(r.id);
    } catch (e) {
      $('nSave').textContent = '💾 حفظ الصنف';
      if (e.message === 'code_exists') { toast(ERR.code_exists); }
      else toast(errMsg(e));
    }
  };
}
function openNewSupplier() {
  form('<h2>👤 مورد جديد</h2>' +
    '<div class="f"><label>اسم المورد<input id="sName" autocomplete="off"></label></div>' +
    '<div class="f"><label>تلفون / واتساب<input id="sPhone" inputmode="tel" placeholder="07xxxxxxxx"></label></div>' +
    '<div class="row2"><button class="btn ok" id="sSave">💾 حفظ</button><button class="btn light" data-close>إلغاء</button></div>');
  setTimeout(() => $('sName').focus(), 50);
  $('sSave').onclick = async () => {
    const name = $('sName').value.trim(); if (!name) return toast('اكتب اسم المورد');
    try { await api({ action: 'supplier', name, phone: $('sPhone').value.trim() }); closeSheets(); toast('انضاف المورد ✓'); refresh(); }
    catch (e) { toast(errMsg(e)); }
  };
}
function openSuppliers() {
  const sups = (DATA ? DATA.suppliers : []).map(s => {
    let n = 0; PX.forEach(e => { if (e.latest.has(s[0])) n++; });
    return [s[0], s[1], n];
  }).sort((a, b) => b[2] - a[2]);
  form('<div class="row2" style="align-items:center"><h2 style="flex:1">📋 الموردين</h2><button class="btn light" style="flex:none;min-height:44px" data-close>إغلاق</button></div>' +
    '<ul class="plist">' + sups.map(s => '<li><span class="n">' + esc(s[0]) + '</span><span class="d num">' + esc(s[1] || '') +
      '</span><span class="p num">' + s[2] + ' صنف</span></li>').join('') + '</ul>');
}

// ---------- الطلبية ----------
function saveCart() { store.set(KEY_CART, JSON.stringify(CART)); updateCartBadge(); }
function updateCartBadge() { const n = CART.length; $('cartN').textContent = n; $('cartN').classList.toggle('hidden', !n); }
function addToCart(id, q) {
  const qty = num(q);
  if (!(qty > 0)) return toast('اكتب الكمية');
  const c = CART.find(x => x.id === id);
  if (c) c.qty = qty; else CART.push({ id, qty, sup: '' });
  saveCart(); toast('انضاف للطلبية ✓'); showId(id);
}
function lineSup(c) { if (c.sup) return c.sup; const b = bestOf(c.id); return b ? b.sup : 'بدون مورد'; }
function linePrice(c, sup) { const e = PX.get(c.id); const p = e && e.latest.get(sup); return p ? p.net : null; }
function openCart() {
  if (!CART.length) { form('<h2>🛒 الطلبية</h2><div class="empty">الطلبية فاضية — افتح أي صنف واكتب الكمية</div><button class="btn light" data-close>إغلاق</button>'); return; }
  const groups = new Map();
  CART.forEach((c, n) => { const s = lineSup(c); if (!groups.has(s)) groups.set(s, []); groups.get(s).push([c, n]); });
  let html = '<div class="row2" style="align-items:center"><h2 style="flex:1">🛒 الطلبية — مقسّمة على أرخص مورد</h2><button class="btn light" style="flex:none;min-height:44px" data-close>إغلاق</button></div><div style="overflow:auto;flex:1">';
  let gi = 0;
  groups.forEach((lines, sup) => {
    let tot = 0;
    const body = lines.map(([c, n]) => {
      const i = BYID.get(c.id), it = i !== undefined ? DATA.items[i] : null, p = linePrice(c, sup);
      if (p) tot += p * c.qty;
      const opts = supsOf(c.id).map(x => '<option value="' + esc(x.sup) + '"' + (x.sup === sup ? ' selected' : '') + '>' + esc(x.sup) + ' ' + m3(x.net) + '</option>').join('');
      return '<div class="ln"><span class="n">' + esc(it ? it[I.name] : c.id) + '<br><span class="num" style="color:var(--muted);font-size:13px">' + (p ? m3(p) + ' × ' + c.qty + ' = ' + m3(p * c.qty) : 'بدون سعر') + '</span></span>' +
        '<input data-q="' + n + '" inputmode="decimal" value="' + esc(c.qty) + '">' +
        (opts ? '<select data-s="' + n + '">' + opts + '</select>' : '') +
        '<button class="x" data-d="' + n + '">✕</button></div>';
    }).join('');
    const phone = supplierPhone(sup);
    html += '<div class="grp"><div class="gh"><span class="t">' + esc(sup) + '</span><span class="num">' + lines.length + ' صنف</span></div>' + body +
      '<div class="gf"><span class="tot">المجموع: <span class="num">' + m3(tot) + '</span> د.أ</span>' +
      '<button class="btn" style="flex:none;padding:0 12px" data-wa="' + gi + '">📲 واتساب</button>' +
      '<button class="btn ok" style="flex:none;padding:0 12px" data-save="' + gi + '">✓ حفظ</button></div>' +
      (phone ? '' : '<div class="d" style="padding:0 10px 8px;color:var(--muted);font-size:13px">ما في رقم للمورد — واتساب بيفتح لتختار المحادثة</div>') + '</div>';
    gi++;
  });
  html += '</div><button class="btn light" id="cClear" style="flex:none">🗑️ فضّي الطلبية</button>';
  form(html);
  const gl = [...groups.entries()];
  const p = $('formPanel');
  p.querySelectorAll('[data-q]').forEach(x => x.addEventListener('change', () => { const q = num(x.value); if (q > 0) { CART[+x.dataset.q].qty = q; saveCart(); openCart(); } }));
  p.querySelectorAll('[data-s]').forEach(x => x.addEventListener('change', () => { CART[+x.dataset.s].sup = x.value; saveCart(); openCart(); }));
  p.querySelectorAll('[data-d]').forEach(x => x.addEventListener('click', () => { CART.splice(+x.dataset.d, 1); saveCart(); openCart(); }));
  p.querySelectorAll('[data-wa]').forEach(x => x.addEventListener('click', () => { const [sup, lines] = gl[+x.dataset.wa]; sendWhatsApp(sup, lines.map(l => l[0])); }));
  p.querySelectorAll('[data-save]').forEach(x => x.addEventListener('click', () => { const [sup, lines] = gl[+x.dataset.save]; saveOrder(sup, lines.map(l => l[0]), x); }));
  $('cClear').onclick = () => { CART = []; saveCart(); closeSheets(); toast('فضيت الطلبية'); };
}
function orderText(sup, lines) {
  const rows = lines.map(c => { const i = BYID.get(c.id), it = i !== undefined ? DATA.items[i] : null; return '• ' + (it ? it[I.name] : c.id) + ' — ' + c.qty; });
  return 'السلام عليكم ' + sup + '\nطلبية محلات العون لمواد البناء:\n' + rows.join('\n') + '\nوشكراً';
}
function waPhone(p) {
  p = String(p || '').replace(/\D/g, '');
  if (/^07\d{8}$/.test(p)) return '962' + p.slice(1);
  if (/^7\d{8}$/.test(p)) return '962' + p;
  return p;
}
function sendWhatsApp(sup, lines) {
  const url = 'https://wa.me/' + waPhone(supplierPhone(sup)) + '?text=' + encodeURIComponent(orderText(sup, lines));
  window.open(url, '_blank');
}
async function saveOrder(sup, lines, btn) {
  btn.textContent = 'لحظة…';
  try {
    const r = await api({ action: 'order', supplier: sup, lines: lines.map(c => {
      const i = BYID.get(c.id), it = i !== undefined ? DATA.items[i] : null;
      return { id: c.id, name: it ? it[I.name] : '', qty: c.qty, price: linePrice(c, sup) || '', supplier: sup };
    }) });
    const ids = new Set(lines.map(c => c.id));
    CART = CART.filter(c => !(ids.has(c.id) && lineSup(c) === sup));
    saveCart(); toast('انحفظت الطلبية ' + (r.no || '') + ' ✓');
    if (CART.length) openCart(); else closeSheets();
  } catch (e) { btn.textContent = '✓ حفظ'; toast(errMsg(e)); }
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
  try { await getDetector(); }
  catch (e) { overlay('<div class="big">قارئ الباركود ما اشتغل</div><div>تأكد من الإنترنت أول مرة، أو استخدم البحث</div>'); return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
  } catch (e) {
    overlay('<div class="big">ما في إذن للكاميرا</div><div>اسمح للكاميرا من إعدادات المتصفح، أو استخدم البحث</div>' +
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
window.startCamera = startCamera;
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
  if (v.readyState >= 2 && v.videoWidth && !isTyping()) {
    const vw = v.videoWidth, vh = v.videoHeight;
    const sx = Math.round(vw * 0.04), sw = Math.round(vw * 0.92);
    const sy = Math.round(vh * 0.25), sh = Math.round(vh * 0.5);
    const scale = Math.min(1, 1280 / sw);
    canvas.width = Math.round(sw * scale); canvas.height = Math.round(sh * scale);
    ctx2d.drawImage(v, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    try { const res = await detector.detect(canvas); if (res && res.length) onCode(res[0].rawValue); } catch (e) {}
  }
  setTimeout(scanLoop, 120);
}
function onCode(raw) {
  const code = String(raw || '').trim();
  if (!code) return;
  const now = Date.now();
  if (code === lastCode && now - lastAt < (CFG.SAME_CODE_SECONDS || 2.5) * 1000) { lastAt = now; lastActivity = now; return; }
  lastCode = code; lastAt = now; lastActivity = now;
  beep(); closeSheets(); lookup(code);
}
window.__simulateScan = onCode;
async function toggleTorch() {
  if (!track) return;
  torchOn = !torchOn;
  try { await track.applyConstraints({ advanced: [{ torch: torchOn }] }); } catch (e) { torchOn = false; }
  $('torchBtn').classList.toggle('on', torchOn);
  lastActivity = Date.now();
}

// ---------- النوافذ والبحث ----------
function openSheet(id) { $(id).classList.remove('hidden'); lastActivity = Date.now(); }
function closeSheets() { document.querySelectorAll('.sheet').forEach(s => s.classList.add('hidden')); lastActivity = Date.now(); }
function form(html) { closeSheets(); $('formPanel').innerHTML = html; openSheet('formSheet'); }
function openManual() { openSearch(); }
function openSearch() { closeSheets(); openSheet('searchSheet'); const i = $('searchInput'); i.value = ''; renderChips(); doSearch(); setTimeout(() => i.focus(), 50); }
Object.assign(window, { openManual, openSearch, openNewItem, openNewSupplier, openSuppliers });

let searchTimer = null;
function renderChips() {
  const opts = [['all', 'الكل'], ['low', '⚠️ ربح قليل'], ['none', 'بدون سعر مورد'], ['cart', '🛒 بالطلبية']];
  $('chips').innerHTML = opts.map(([k, t]) => '<button class="chip' + (FILTER === k ? ' on' : '') + '" data-f="' + k + '">' + esc(t) + '</button>').join('');
}
function passFilter(it) {
  const id = it[I.id];
  if (FILTER === 'all') return true;
  if (FILTER === 'none') return !bestOf(id);
  if (FILTER === 'cart') return CART.some(c => c.id === id);
  if (FILTER === 'low') { const b = bestOf(id), p = b && profit(b.net, num(it[I.sale])); return !!p && p.level !== 'ok'; }
  return true;
}
function doSearch() {
  const q = normAr($('searchInput').value);
  const list = $('searchList'), info = $('searchInfo');
  if (!DATA) { list.innerHTML = ''; info.textContent = 'لسا ما نزلت البيانات'; return; }
  const qc = normCode(q);
  if (qc && BYCODE.has(qc) && /^\d{3,}$/.test(qc)) { /* رقم كامل */ }
  const words = q ? q.split(' ') : [];
  const hits = [];
  for (let i = 0; i < SEARCH.length; i++) {
    if (!passFilter(DATA.items[i])) continue;
    if (words.every(w => SEARCH[i].includes(w))) hits.push(i);
  }
  const MAX = 300, shown = hits.slice(0, MAX);
  info.textContent = hits.length ? (hits.length > MAX ? 'أول ' + MAX + ' من ' + hits.length + ' — زيد كلمة للتدقيق' : hits.length + ' صنف') : 'ما لقيت ولا صنف';
  let lastSec = null;
  list.innerHTML = shown.map(i => {
    const it = DATA.items[i], b = bestOf(it[I.id]), p = b && profit(b.net, num(it[I.sale]));
    const sec = it[I.sec] || it[I.src] || '';
    const head = sec !== lastSec ? (lastSec = sec, '<li class="sec">' + esc(sec) + '</li>') : '';
    const mark = p && p.level === 'loss' ? '<span class="m loss">خسران</span>' : p && p.level === 'low' ? '<span class="m low">ربح قليل</span>' : '';
    return head + '<li data-i="' + i + '"><span class="n">' + esc(it[I.name]) + (b ? '<br><span style="font-size:13px;color:var(--muted)">' + esc(b.sup) + '</span>' : '') + '</span>' + mark +
      (b ? '<span class="p num">' + m3(b.net) + '</span>' : '<span class="p z">بدون سعر</span>') + '</li>';
  }).join('');
}

// قارئ باركود Bluetooth (بيكتب زي الكيبورد وبيكبس Enter)
let kbBuf = '', kbAt = 0;
document.addEventListener('keydown', e => {
  if (isTyping()) return;
  const now = Date.now();
  if (now - kbAt > 100) kbBuf = '';
  kbAt = now;
  if (e.key === 'Enter') { if (kbBuf.length >= 4) { lastActivity = now; beep(); lookup(kbBuf); } kbBuf = ''; return; }
  if (e.key.length === 1) kbBuf += e.key;
});

// ---------- الدخول ----------
function logout(msg) { store.del(KEY_CODE); showSetup(msg); }
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
      e.message === 'no_api' ? 'التطبيق لسا ما انربط' : 'ما في اتصال بالإنترنت — حاول مرة ثانية';
  }
}
function showApp() {
  $('setup').classList.add('hidden'); $('app').classList.remove('hidden');
  setStatus(); renderQuoteBar(); updateCartBadge();
  startCamera();
}
function toast(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);background:#0f172a;color:#fff;padding:10px 18px;border-radius:999px;z-index:30;font-size:16px;max-width:90vw;text-align:center';
  document.body.appendChild(el); setTimeout(() => el.remove(), 2200);
}

// ---------- تثبيت التطبيق ----------
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; ['installBtn', 'installBtn2'].forEach(id => $(id).classList.remove('hidden')); });
window.addEventListener('appinstalled', () => { installEvt = null; ['installBtn', 'installBtn2'].forEach(id => $(id).classList.add('hidden')); toast('انثبّت التطبيق ✓'); });
async function doInstall() {
  if (!installEvt) return;
  installEvt.prompt();
  try { await installEvt.userChoice; } catch (e) {}
  installEvt = null;
  ['installBtn', 'installBtn2'].forEach(id => $(id).classList.add('hidden'));
}

// ---------- التشغيل ----------
function init() {
  const m = location.hash.match(/k=([^&]+)/);
  if (m) { store.set(KEY_CODE, decodeURIComponent(m[1])); history.replaceState(null, '', location.pathname + location.search); }
  $('codeBtn').onclick = submitCode;
  $('codeInput').addEventListener('keydown', e => { if (e.key === 'Enter') submitCode(); });
  $('refreshBtn').onclick = () => refresh(true);
  $('installBtn').onclick = doInstall; $('installBtn2').onclick = doInstall;
  $('torchBtn').onclick = toggleTorch;
  $('searchBtn').onclick = openSearch;
  $('quoteBtn').onclick = openQuote;
  $('cartBtn').onclick = openCart;
  $('moreBtn').onclick = openMore;
  $('manualGo').onclick = () => { const v = $('manualInput').value; if (v.trim()) { closeSheets(); lookup(v); } };
  $('searchInput').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(doSearch, 120); });
  $('searchInput').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const v = $('searchInput').value.trim(), k = normCode(v);
    if (BYCODE.has(k)) { closeSheets(); lookup(v); }
  });
  $('chips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; FILTER = b.dataset.f; renderChips(); doSearch(); });
  $('searchList').addEventListener('click', e => {
    const li = e.target.closest('li'); if (!li || li.classList.contains('sec') || li.dataset.i === undefined) return;
    closeSheets(); renderItem(DATA.items[Number(li.dataset.i)]);
  });
  document.querySelectorAll('.sheet').forEach(s => s.addEventListener('click', e => {
    if (e.target === s || (e.target.hasAttribute && e.target.hasAttribute('data-close'))) closeSheets();
  }));
  $('camOverlay').addEventListener('click', () => { if (!scanning) startCamera(); });
  $('cam').addEventListener('click', () => { lastActivity = Date.now(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCamera();
    else if (!$('app').classList.contains('hidden')) { startCamera(); maybeRefresh(); checkAppVersion(); }
  });

  const hasCode = !!store.get(KEY_CODE);
  loadLocal();
  if (!hasCode) { showSetup(); return; }
  showApp();
  refresh(); checkAppVersion();
  setInterval(() => { if (!document.hidden) { maybeRefresh(); checkAppVersion(); } }, 3 * 60 * 1000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(reg => {
    window.__swReg = reg;
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { try { reg.update(); } catch (e) {} } });
  }).catch(() => {});
}
function maybeRefresh() {
  const age = DATA && DATA.fetchedAt ? Date.now() - new Date(DATA.fetchedAt).getTime() : Infinity;
  if (age > (CFG.MIN_REFETCH_SECONDS || 30) * 1000 && !isTyping()) refresh();
}
const APP_VERSION = '3';
let versionChecking = false;
async function checkAppVersion() {
  if (versionChecking) return;
  versionChecking = true;
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    const j = await r.json();
    if (j && j.v && String(j.v) !== APP_VERSION) {
      const idle = !document.querySelector('.sheet:not(.hidden)') && !isTyping() && (Date.now() - lastActivity > 4000);
      if (idle || document.hidden) {
        try { if (window.__swReg) await window.__swReg.update(); } catch (e) {}
        try { const ks = await caches.keys(); await Promise.all(ks.filter(k => k.startsWith('sihhi-')).map(k => caches.delete(k))); } catch (e) {}
        location.reload();
      }
    }
  } catch (e) {} finally { versionChecking = false; }
}
init();

/**
 * تطبيق الصحي 2 — مرجع أسعار الجملة والطلبيات · محلات العون لمواد البناء
 * بيقرا ويكتب على شيت «مرجع جملة الصحي» بس (ما بيلمس أودو ولا الشيتات القديمة — القديمة بتنقرا مرة وحدة للاستيراد).
 * النشر: Deploy ← Manage deployments ← Edit ← New version (نفس الرابط) · Execute as: Me · Who has access: Anyone
 */
const ACCESS_CODE = 'ضع_الكود_هون';   // الكود الحقيقي بالسكربت المنشور بس
const REF_ID = '1DBGy0alMB2JIvhwKTtJETLS5KULW9WdeSEi1KZDIP5c';   // مرجع جملة الصحي
const T = { items: 'الأصناف', sup: 'الموردين', prices: 'الأسعار', orders: 'الطلبيات' };
const CACHE_KEY = 'sihhi_v2';

// الشيتات القديمة (للاستيراد مرة وحدة)
const OLD = [
  { id: '1GIseAKRHbc4-z8DuwEtJAJQ9BkstkVtQcQTR2FN0Owc', tab: 'الكتالوج',   title: 'كتالوج الصحي' },
  { id: '1fYrcvcqbuG2azfph0qI1w3IAjzailq0uAuXGdz_5B_U', tab: 'البرابيش',   title: 'برابيش الكيزر' },
  { id: '1vhQQUwmkN203I-deiRVfGqe9qyb7dwgZoqR65p-K3hQ', tab: 'المواسير',   title: 'سعودي — مواسير' },
  { id: '1vhQQUwmkN203I-deiRVfGqe9qyb7dwgZoqR65p-K3hQ', tab: 'القطع',      title: 'سعودي' },
  { id: '1zMEbdc1t-wr4rlr8CXgVtzc5cf2Ovm4x0AOaUJGEJ4s', tab: 'المرابط',    title: 'مرابط المواسير' },
  { id: '1aflh6KJE4Jcno0VfsSI2ca-t9_BXV4EQUoL_fdCj0Ns', tab: 'صغير ومرار', title: 'صغير ومرار' }
];

// ---------------- قراءة ----------------
function doGet(e) {
  const k = String((e && e.parameter && e.parameter.k) || '').trim();
  if (k !== ACCESS_CODE) return out_({ ok: false, error: 'unauthorized' });
  const c = CacheService.getScriptCache().get(CACHE_KEY);
  if (c) return ContentService.createTextOutput(c).setMimeType(ContentService.MimeType.JSON);
  const json = JSON.stringify(read_());
  try { CacheService.getScriptCache().put(CACHE_KEY, json, 60); } catch (err) {}
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function read_() {
  const ss = SpreadsheetApp.openById(REF_ID);
  const rows = name => { const v = ss.getSheetByName(name).getDataRange().getDisplayValues(); v.shift(); return v; };
  const items = rows(T.items).filter(r => r[0]).map(r => [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7]]);
  const suppliers = rows(T.sup).filter(r => r[0]).map(r => [r[0], r[1], r[2]]);
  const prices = rows(T.prices).filter(r => r[1] && r[3]).map(r => [r[0], r[1], r[3], r[4], r[5], r[6], r[7], r[8]]);
  return { ok: true, updated: now_(), items: items, suppliers: suppliers, prices: prices };
}

// ---------------- كتابة ----------------
function doPost(e) {
  let b = {};
  try { b = JSON.parse(e.postData.contents || '{}'); } catch (err) { return out_({ ok: false, error: 'bad_json' }); }
  if (String(b.k || '').trim() !== ACCESS_CODE) return out_({ ok: false, error: 'unauthorized' });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return out_({ ok: false, error: 'busy' });
  try {
    let r;
    if (b.action === 'price') r = addPrice_(b);
    else if (b.action === 'item') r = addItem_(b);
    else if (b.action === 'supplier') r = addSupplier_(b);
    else if (b.action === 'order') r = addOrder_(b);
    else if (b.action === 'import') r = importAll();
    else r = { ok: false, error: 'unknown_action' };
    CacheService.getScriptCache().remove(CACHE_KEY);
    return out_(r);
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  } finally { lock.releaseLock(); }
}

function sheet_(name) { return SpreadsheetApp.openById(REF_ID).getSheetByName(name); }
function now_() { return Utilities.formatDate(new Date(), 'Asia/Amman', 'dd/MM/yyyy HH:mm'); }
function today_() { return Utilities.formatDate(new Date(), 'Asia/Amman', 'dd/MM/yyyy'); }
function num_(v) { const n = Number(String(v == null ? '' : v).replace(/[,%\s]/g, '')); return isFinite(n) ? n : NaN; }
function r3_(n) { return Math.round(n * 1000) / 1000; }
function clean_(s, max) { return String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max || 200); }
// أي نص بيبلّش بـ = أو + أو - أو @ بنحميه عشان ما يصير معادلة
function safe_(s) { s = clean_(s); return /^[=+\-@]/.test(s) ? "'" + s : s; }

function itemName_(id) {
  const v = sheet_(T.items).getDataRange().getDisplayValues();
  for (let i = 1; i < v.length; i++) if (v[i][0] === id) return v[i][2];
  return null;
}
function ensureSupplier_(name, phone) {
  name = clean_(name, 60);
  if (!name) throw new Error('no_supplier');
  const sh = sheet_(T.sup), v = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < v.length; i++) if (v[i][0].trim() === name) return name;
  sh.appendRow([safe_(name), safe_(phone || ''), '', today_()]);
  return name;
}

function addPrice_(b) {
  const id = clean_(b.id, 40), name = itemName_(id);
  if (!name) return { ok: false, error: 'no_item' };
  const list = num_(b.list), disc = num_(b.disc);
  let net = num_(b.net);
  if (!(net > 0) && list > 0) net = list * (1 - (disc > 0 ? disc : 0) / 100);
  if (!(net > 0)) return { ok: false, error: 'no_price' };
  const sup = ensureSupplier_(b.supplier);
  sheet_(T.prices).appendRow([now_(), id, safe_(name), safe_(sup), list > 0 ? r3_(list) : '', disc > 0 ? disc : '', r3_(net), 'التطبيق', safe_(b.note || '')]);
  return { ok: true };
}

function addItem_(b) {
  const name = clean_(b.name, 150);
  if (!name) return { ok: false, error: 'no_name' };
  const code = clean_(b.code, 30).replace(/\s+/g, '');
  const sh = sheet_(T.items), v = sh.getDataRange().getDisplayValues();
  let maxN = 0;
  for (let i = 1; i < v.length; i++) {
    if (code && v[i][1] === code) return { ok: false, error: 'code_exists', id: v[i][0] };
    const m = /^N(\d+)$/.exec(v[i][0]); if (m) maxN = Math.max(maxN, +m[1]);
  }
  const id = code || ('N' + ('000' + (maxN + 1)).slice(-4));
  const sale = num_(b.sale);
  sh.appendRow([id, code, safe_(name), safe_(b.sec || ''), 'التطبيق', safe_(b.carton || ''), sale > 0 ? r3_(sale) : '', safe_(b.note || ''), today_()]);
  if (b.supplier && (num_(b.net) > 0 || num_(b.list) > 0)) addPrice_({ id: id, supplier: b.supplier, list: b.list, disc: b.disc, net: b.net });
  return { ok: true, id: id };
}

function addSupplier_(b) { ensureSupplier_(b.name, b.phone); return { ok: true }; }

function addOrder_(b) {
  const lines = (b.lines || []).filter(l => l && l.id && num_(l.qty) > 0);
  if (!lines.length) return { ok: false, error: 'empty' };
  const no = 'ط-' + Utilities.formatDate(new Date(), 'Asia/Amman', 'yyMMdd-HHmm');
  const at = now_();
  const rows = lines.map(l => {
    const q = num_(l.qty), p = num_(l.price);
    return [at, no, safe_(l.supplier || b.supplier || ''), clean_(l.id, 40), safe_(l.name || ''), q, p > 0 ? r3_(p) : '', p > 0 ? r3_(p * q) : '', 'مرسلة'];
  });
  const sh = sheet_(T.orders);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  return { ok: true, no: no };
}

// ---------------- الاستيراد من الشيتات القديمة (مرة وحدة) ----------------
const NOT_SUPPLIER = ['الكود', 'الصنف', 'سعر القائمة', 'تعبئة', 'الخصم', 'سعر الجملة', 'سعر البيع', 'ربح', 'أرخص', 'من عند', 'ملاحظة', 'داخلي'];

function importAll() {
  const ss = SpreadsheetApp.openById(REF_ID);
  const shI = ss.getSheetByName(T.items);
  if (shI.getLastRow() > 1) return { ok: false, error: 'already_imported' };
  const items = [], byCode = {}, byName = {}, prices = [], suppliers = {};
  let n = 0;
  // نفس المورد بـ«ال» وبدونها (القناص = قناص) بيصير اسم واحد
  const supKey = {}, canon = t => { const k = t.replace(/^ال/, ''); if (!supKey[k]) supKey[k] = t; return supKey[k]; };
  const norm = s => String(s).replace(/[ً-ْ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim();
  OLD.forEach(src => {
    const sh = SpreadsheetApp.openById(src.id).getSheetByName(src.tab);
    if (!sh) return;
    const v = sh.getDataRange().getDisplayValues();
    let date = today_(), orderDisc = '';
    for (let r = 0; r < Math.min(4, v.length); r++) {
      const d = v[r].findIndex(c => String(c).indexOf('تاريخ الخصم') >= 0); if (d >= 0 && v[r][d + 1]) date = v[r][d + 1];
    }
    const h = v.findIndex(row => String(row[0]).trim() === 'الكود');
    if (h < 0) return;
    const H = v[h].map(c => String(c).trim());
    const col = key => H.findIndex(c => c.indexOf(key) >= 0);
    const C = { name: col('الصنف'), list: col('سعر القائمة'), carton: col('تعبئة'), disc: col('الخصم'), cost: col('سعر الجملة'), sale: col('سعر البيع') };
    // أعمدة الموردين = كل عنوان مش من الأعمدة المعروفة
    const supCols = [];
    H.forEach((t, i) => { if (t && /[\u0600-\u06FFA-Za-z]/.test(t) && i > C.name && !NOT_SUPPLIER.some(x => t.indexOf(x) >= 0)) supCols.push([i, canon(t.replace(/\s*\(.*\)\s*/, '').trim() || t)]); });
    let section = '';
    for (let r = h + 1; r < v.length; r++) {
      const row = v[r], a = String(row[0] || '').trim(), name = String(row[C.name] || '').trim();
      if (!name) { if (a) section = a.replace(/^[^؀-ۿA-Za-z0-9]+/, '').trim(); continue; }
      const code = a.replace(/\s+/g, '');
      let id = code && byCode[code];
      if (!id && !code) id = byName[norm(name)];
      const sale = C.sale >= 0 ? num_(row[C.sale]) : NaN;
      if (!id) {
        id = code || ('N' + ('000' + (++n)).slice(-4));
        items.push([id, code, name, section, src.title, C.carton >= 0 ? row[C.carton] : '', sale > 0 ? r3_(sale) : '', '', today_()]);
        if (code) byCode[code] = id; else byName[norm(name)] = id;
      }
      if (supCols.length) {
        supCols.forEach(([i, sup]) => {
          const p = num_(row[i]);
          if (p > 0) { prices.push([date + ' 00:00', id, name, sup, '', '', r3_(p), 'استيراد: ' + src.title, section]); suppliers[sup] = 1; }
        });
      } else {
        const list = num_(row[C.list]), disc = num_(row[C.disc]), cost = num_(row[C.cost]);
        const net = cost > 0 ? cost : (list > 0 ? list * (1 - (disc > 0 ? disc : 0) / 100) : NaN);
        const m = /من\s+([؀-ۿ]+)/.exec(section);
        const sup = canon(m ? m[1] : src.title);
        if (net > 0) { prices.push([date + ' 00:00', id, name, sup, list > 0 ? r3_(list) : '', disc > 0 ? disc : '', r3_(net), 'استيراد: ' + src.title, section]); suppliers[sup] = 1; }
      }
    }
  });
  if (items.length) { shI.getRange(2, 2, items.length, 1).setNumberFormat('@'); shI.getRange(2, 1, items.length, 9).setValues(items); }
  const shP = ss.getSheetByName(T.prices);
  if (prices.length) shP.getRange(2, 1, prices.length, 9).setValues(prices);
  const sups = Object.keys(suppliers).map(s => [s, '', '', today_()]);
  if (sups.length) ss.getSheetByName(T.sup).getRange(2, 1, sups.length, 4).setValues(sups);
  return { ok: true, items: items.length, prices: prices.length, suppliers: sups.length };
}

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

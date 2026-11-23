/**
 * تطبيق الصحي — محلات العون لمواد البناء
 * قراءة فقط من شيتات الصحي (ما بيكتب على أي شيت ولا على أودو).
 * النشر: Deploy ← New deployment ← Web app ← Execute as: Me ← Who has access: Anyone
 */
const ACCESS_CODE = 'ضع_الكود_هون';   // الكود الحقيقي بينحط بالسكربت المنشور بس، مش بالمستودع

// الشيتات اللي بيقرا منها التطبيق (نفس الشكل: الكود · الصنف · سعر القائمة · الخصم · سعر الجملة · سعر البيع)
const SOURCES = [
  { id: '1zMEbdc1t-wr4rlr8CXgVtzc5cf2Ovm4x0AOaUJGEJ4s', tab: 'المرابط',   title: 'مرابط المواسير' },
  { id: '1vhQQUwmkN203I-deiRVfGqe9qyb7dwgZoqR65p-K3hQ', tab: 'القطع',     title: 'سعودي' },
  { id: '1aflh6KJE4Jcno0VfsSI2ca-t9_BXV4EQUoL_fdCj0Ns', tab: 'صغير ومرار', title: 'صغير ومرار' }
];

function doGet(e) {
  const k = String((e && e.parameter && e.parameter.k) || '').trim();
  if (k !== ACCESS_CODE) return out_({ ok: false, error: 'unauthorized' });
  const cache = CacheService.getScriptCache();
  const hit = cache.get('sihhi_v1');
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  const json = JSON.stringify(build_());
  try { cache.put('sihhi_v1', json, 60); } catch (err) {}   // دقيقة وحدة عشان ما نضغط على الشيتات
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function build_() {
  const sheets = [], items = [];
  SOURCES.forEach((src, si) => {
    const meta = { title: src.title, discount: '', date: '', ok: true };
    try {
      const sh = SpreadsheetApp.openById(src.id).getSheetByName(src.tab);
      const v = sh.getDataRange().getDisplayValues();
      // الخصم العام وتاريخه (الصف الثاني)
      for (let r = 0; r < Math.min(4, v.length); r++) {
        const i = v[r].findIndex(c => String(c).indexOf('خصم الطلبية') >= 0);
        if (i >= 0) { meta.discount = v[r][i + 1] || ''; const d = v[r].findIndex(c => String(c).indexOf('تاريخ الخصم') >= 0); if (d >= 0) meta.date = v[r][d + 1] || ''; }
      }
      // صف العناوين
      let h = v.findIndex(row => String(row[0]).trim() === 'الكود');
      if (h < 0) throw new Error('no header');
      const H = v[h].map(c => String(c));
      const col = key => H.findIndex(c => c.indexOf(key) >= 0);
      const C = { code: 0, name: col('الصنف'), list: col('سعر القائمة'), carton: col('تعبئة'), disc: col('الخصم'),
                  cost: col('سعر الجملة'), sale: col('سعر البيع'), flag: col('ربح قليل') };
      let section = '';
      for (let r = h + 1; r < v.length; r++) {
        const row = v[r], a = String(row[0] || '').trim(), name = String(row[C.name] || '').trim();
        if (!name) { if (a) section = a.replace(/^[^؀-ۿA-Za-z0-9]+/, '').trim(); continue; }
        const g = i => (i >= 0 ? String(row[i] || '').trim() : '');
        items.push([a, name, g(C.list), g(C.carton), g(C.disc), g(C.cost), g(C.sale), g(C.flag), si, section]);
      }
    } catch (err) { meta.ok = false; }
    sheets.push(meta);
  });
  return { ok: true, updated: Utilities.formatDate(new Date(), 'Asia/Amman', 'dd/MM/yyyy HH:mm'), sheets: sheets, items: items };
}

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// للتجربة من المحرر: شغّل هاي وشوف السجل
function test_() { const d = build_(); Logger.log(d.sheets); Logger.log(d.items.length + ' صنف'); Logger.log(d.items.slice(0, 3)); }

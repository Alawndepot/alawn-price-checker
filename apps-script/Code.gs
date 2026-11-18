/**
 * قارئ أسعار العون — رابط قراءة فقط لشيت «Alawn Products Live»
 * بيرجع: الباركود · اسم الصنف · سعر البيع · الكود الداخلي — للأصناف النشطة بس.
 * ما بيكتب ولا بيعدّل أي إشي بالشيت.
 * الكود السري بيتحط بمكان ACCESS_CODE تحت (مش بالمستودع العام).
 */
const ACCESS_CODE = 'ضع_الكود_هون';
const SHEET_NAME = 'Products';

function doGet(e) {
  const k = String((e && e.parameter && e.parameter.k) || '');
  if (!ACCESS_CODE || k !== ACCESS_CODE) return out_({ ok: false, error: 'unauthorized' });

  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sh) return out_({ ok: false, error: 'no_sheet' });

  const values = sh.getDataRange().getDisplayValues();
  const head = values[0].map(function (h) { return String(h).trim(); });
  const col = function (name) { return head.indexOf(name); };
  const iName = col('اسم الصنف'), iBar = col('الباركود'), iPrice = col('سعر البيع'),
        iCode = col('الكود الداخلي'), iAct = col('نشط'), iUpd = col('آخر تحديث');
  if (iName < 0 || iBar < 0 || iPrice < 0) return out_({ ok: false, error: 'columns' });

  const items = [];
  let updated = '';
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const name = String(row[iName] || '').trim();
    if (!name) continue;
    if (iAct >= 0 && String(row[iAct]).trim().toUpperCase() === 'FALSE') continue;
    const bar = String(row[iBar] || '').trim();
    const code = iCode >= 0 ? String(row[iCode] || '').trim() : '';
    if (!bar && !code) continue;
    if (bar.toUpperCase() === 'TIPS') continue;
    items.push([bar, name, String(row[iPrice] || '').trim(), code]);
    if (!updated && iUpd >= 0) updated = String(row[iUpd] || '').trim();
  }
  return out_({ ok: true, updated: updated, count: items.length, items: items });
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

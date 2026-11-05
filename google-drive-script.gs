/**
 * SURYAVIN VEEDU - GOOGLE DRIVE (SHEETS) DATABASE SCRIPT
 * Members: Saravanan, Surya, Ram, Sathish
 *
 * SETUP INSTRUCTIONS (Takes 2 minutes):
 * 1. Go to Google Drive (https://drive.google.com) -> New -> Google Sheets.
 * 2. Name the sheet "Suryavin Veedu Expenses".
 * 3. Click Extensions -> Apps Script.
 * 4. Delete any code there and paste this entire file.
 * 5. Click "Deploy" (top right) -> "New deployment".
 * 6. Select type: "Web app".
 *    - Execute as: "Me"
 *    - Who has access: "Anyone"
 * 7. Click "Deploy", authorize access, and copy the "Web app URL".
 * 8. Paste that Web app URL into the website's "Drive Sync" settings (or in config.js).
 */

const SHEET_NAME = 'Transactions';
const HEADERS = [
  'id',
  'date',
  'type',           // 'expense' | 'settlement'
  'paidBy',         // 'Saravanan' | 'Surya' | 'Ram' | 'Sathish'
  'amount',         // Number
  'reason',         // String
  'involved',       // Comma-separated members for expense (e.g. "Surya,Ram,Sathish")
  'paidTo',         // Recipient member for settlement
  'perPersonShare', // Calculated equal split amount
  'createdAt'       // ISO timestamp
];

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#1e293b')
      .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function doGet() {
  try {
    const sheet = getOrCreateSheet();
    const rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) {
      return jsonResponse({ status: 'ok', transactions: [] });
    }

    const transactions = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue;
      transactions.push({
        id: String(row[0]),
        date: formatDateValue(row[1]),
        type: String(row[2] || 'expense'),
        paidBy: String(row[3] || ''),
        amount: Number(row[4] || 0),
        reason: String(row[5] || ''),
        involved: row[6] ? String(row[6]).split(',').map(s => s.trim()).filter(Boolean) : [],
        paidTo: String(row[7] || ''),
        perPersonShare: Number(row[8] || 0),
        createdAt: String(row[9] || '')
      });
    }

    return jsonResponse({ status: 'ok', transactions });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getOrCreateSheet();
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    if (action === 'add') {
      const tx = payload.transaction;
      const involvedStr = Array.isArray(tx.involved) ? tx.involved.join(', ') : '';
      sheet.appendRow([
        tx.id,
        tx.date,
        tx.type,
        tx.paidBy,
        Number(tx.amount),
        tx.reason || '',
        involvedStr,
        tx.paidTo || '',
        Number(tx.perPersonShare || 0),
        tx.createdAt || new Date().toISOString()
      ]);
      return jsonResponse({ status: 'ok', added: tx.id });
    }

    if (action === 'delete') {
      const targetId = String(payload.id);
      const rows = sheet.getDataRange().getValues();
      for (let i = rows.length - 1; i >= 1; i--) {
        if (String(rows[i][0]) === targetId) {
          sheet.deleteRow(i + 1);
          break;
        }
      }
      return jsonResponse({ status: 'ok', deleted: targetId });
    }

    if (action === 'syncAll') {
      const list = Array.isArray(payload.transactions) ? payload.transactions : [];
      sheet.clearContents();
      sheet.appendRow(HEADERS);
      if (list.length > 0) {
        const values = list.map(tx => [
          tx.id,
          tx.date,
          tx.type,
          tx.paidBy,
          Number(tx.amount),
          tx.reason || '',
          Array.isArray(tx.involved) ? tx.involved.join(', ') : '',
          tx.paidTo || '',
          Number(tx.perPersonShare || 0),
          tx.createdAt || new Date().toISOString()
        ]);
        sheet.getRange(2, 1, values.length, HEADERS.length).setValues(values);
      }
      return jsonResponse({ status: 'ok', count: list.length });
    }

    return jsonResponse({ status: 'error', message: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function formatDateValue(val) {
  if (!val) return '';
  if (Object.prototype.toString.call(val) === '[object Date]') {
    const yyyy = val.getFullYear();
    const mm = String(val.getMonth() + 1).padStart(2, '0');
    const dd = String(val.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return String(val);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


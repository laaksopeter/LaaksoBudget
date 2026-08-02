// Google Apps Script template for forwarding entries to Google Sheets.
// 1) Create a new Apps Script project and paste this code.
// 2) Deploy as a Web App and copy the Web App URL into the settings modal.
// 3) Re-deploy after saving so the updated version is live.

const DEFAULT_SHEET_ID = '1A93xFMBcscSbtMFeWUmc4XbJIy_4rn4BBLcHP1Qj3cI';

function doGet(e) {
  return jsonResponse({ ok: true, message: 'LaaksoBudget Apps Script endpoint is live.' });
}

function doPost(e) {
  try {
    const raw = e.postData && e.postData.getDataAsString ? e.postData.getDataAsString() : '{}';
    const payload = JSON.parse(raw || '{}');
    const targetSheetId = payload.sheetId || e.parameter?.sheetId || DEFAULT_SHEET_ID;
    const spreadsheet = openTargetSpreadsheet(targetSheetId);
    const sheet = spreadsheet.getSheetByName('LaaksoBudget') || spreadsheet.getActiveSheet();

    ensureHeaders(sheet);

    const entries = Array.isArray(payload.entries) ? payload.entries : [payload.entry];
    const rows = entries
      .filter(Boolean)
      .map((entry) => [
        entry?.date || '',
        entry?.type || '',
        entry?.amount || '',
        entry?.category || '',
        entry?.note || '',
        entry?.createdAt || '',
        payload.app || 'LaaksoBudget'
      ]);

    if (!rows.length) {
      return jsonResponse({ ok: true, received: true, inserted: 0 });
    }

    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    return jsonResponse({ ok: true, received: true, inserted: rows.length });
  } catch (error) {
    return jsonResponse({ ok: false, error: error && error.toString ? error.toString() : String(error) });
  }
}

function doOptions(e) {
  return withCorsHeaders(ContentService.createTextOutput(''));
}

function openTargetSpreadsheet(sheetId) {
  try {
    return SpreadsheetApp.openById(sheetId || DEFAULT_SHEET_ID);
  } catch (error) {
    return SpreadsheetApp.getActiveSpreadsheet();
  }
}

function ensureHeaders(sheet) {
  const headers = ['Date', 'Type', 'Amount', 'Category', 'Note', 'Created At', 'Source'];
  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];

  if (firstRow.some((value) => value !== '')) {
    return;
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function jsonResponse(obj) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function withCorsHeaders(output) {
  return output;
}

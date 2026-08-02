// Google Apps Script template for forwarding entries to Google Sheets.
// 1) Create a new Apps Script project and paste this code.
// 2) Deploy as a Web App and copy the Web App URL into the settings modal.
// 3) Re-deploy after saving so the updated CORS behavior is live.

function doGet(e) {
  return jsonResponse({ ok: true, message: 'LaaksoBudget Apps Script endpoint is live.' });
}

function doPost(e) {
  try {
    const raw = e.postData && e.postData.getDataAsString ? e.postData.getDataAsString() : '{}';
    const payload = JSON.parse(raw);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    ensureHeaders(sheet);

    const entries = payload.entries || [payload.entry];
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
    return jsonResponse({ ok: false, error: error.toString() });
  }
}

function doOptions(e) {
  return withCorsHeaders(ContentService.createTextOutput(''));
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
  return withCorsHeaders(output);
}

function withCorsHeaders(output) {
  output.setHeader('Access-Control-Allow-Origin', '*');
  output.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  output.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  return output;
}

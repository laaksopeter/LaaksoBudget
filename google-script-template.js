// Google Apps Script template for forwarding entries to Google Sheets.
// 1) Create a new Apps Script project and paste this code.
// 2) Deploy as a Web App and copy the Web App URL into the settings modal.

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.getDataAsString());
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const row = [
      payload.entry?.date || '',
      payload.entry?.type || '',
      payload.entry?.amount || '',
      payload.entry?.category || '',
      payload.entry?.note || '',
      payload.entry?.createdAt || '',
      payload.app || ''
    ];

    sheet.appendRow(row);

    const output = ContentService.createTextOutput(JSON.stringify({ ok: true, received: true }));
    output.setMimeType(ContentService.MimeType.JSON);
    return output;
  } catch (error) {
    const output = ContentService.createTextOutput(JSON.stringify({ ok: false, error: error.toString() }));
    output.setMimeType(ContentService.MimeType.JSON);
    return output;
  }
}

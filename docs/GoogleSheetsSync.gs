/** FocusFlow Google Apps Script webhook.
 * Deploy: Extensions > Apps Script > Deploy > New deployment > Web app.
 * Set access to the intended FocusFlow users, then use the /exec URL in app/.env.
 */
function doPost(event) {
  const payload = JSON.parse(event.parameter.payload || '{}');
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const tasksSheet = sheet_(spreadsheet, 'Daily Tasks', ['Task ID', 'Date', 'Title', 'Category', 'Priority', 'Status', 'Reminder time', 'Created at', 'Completed at', 'Last synced']);
  const taskHistorySheet = sheet_(spreadsheet, 'Task History', ['Task ID', 'Date', 'Title', 'Category', 'Priority', 'Final status', 'Reminder time', 'Created at', 'Completed at', 'Last seen at']);
  const insightSheet = sheet_(spreadsheet, 'Insights', ['Date', 'Total tasks', 'Completed tasks', 'Completion rate', 'Focus seconds', 'Login count', 'Activity count', 'Last activity at', 'Last synced']);

  replaceTasks_(tasksSheet, payload.tasks || []);
  archiveTasks_(taskHistorySheet, payload.tasks || []);
  // The app sends a snapshot for every task date.
  replaceInsights_(insightSheet, payload.insights || (payload.insight ? [payload.insight] : []));
  saveState_(spreadsheet, payload);
  removeLegacySheets_(spreadsheet);
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}

/** Returns the last complete application state so a new browser/device can restore it. */
function doGet(event) {
  if (event.parameter.action !== 'state') return ContentService.createTextOutput(JSON.stringify({ ok: true }));
  const state = loadState_(SpreadsheetApp.getActiveSpreadsheet());
  return ContentService.createTextOutput(JSON.stringify({ ok: true, state: state })).setMimeType(ContentService.MimeType.JSON);
}

function sheet_(spreadsheet, name, headers) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  sheet.setFrozenRows(1);
  return sheet;
}

function replaceTasks_(sheet, tasks) {
  const headers = ['Task ID', 'Date', 'Title', 'Category', 'Priority', 'Status', 'Reminder time', 'Created at', 'Completed at', 'Last synced'];
  // Rewrite the task snapshot so a deleted task is also deleted in Google Sheets.
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (!tasks.length) return;
  const syncedAt = new Date().toISOString();
  const values = tasks.map(task => [task.id, task.date, task.title, task.category, task.priority, task.done ? 'Completed' : 'Active', task.reminderAt || '', task.createdAt || '', task.completedAt || '', syncedAt]);
  sheet.getRange(2, 1, values.length, headers.length).setValues(values);
}

// Unlike Daily Tasks, this sheet is an archive. Deleted tasks remain here so
// the user's task history is never lost.
function archiveTasks_(sheet, tasks) {
  const headers = ['Task ID', 'Date', 'Title', 'Category', 'Priority', 'Final status', 'Reminder time', 'Created at', 'Completed at', 'Last seen at'];
  const existing = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues() : [];
  const byId = new Map(existing.map((row, index) => [String(row[0]), index]));
  const now = new Date().toISOString();
  const currentIds = new Set(tasks.map(task => String(task.id)));
  const rows = existing.map(row => currentIds.has(String(row[0])) ? row : [...row.slice(0, 5), 'Deleted', ...row.slice(6, 9), now]);
  tasks.forEach(task => {
    const row = [task.id, task.date, task.title, task.category, task.priority, task.done ? 'Completed' : 'Active', task.reminderAt || '', task.createdAt || '', task.completedAt || '', now];
    const index = byId.get(String(task.id));
    if (index === undefined) rows.push(row); else rows[index] = row;
  });
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function saveState_(spreadsheet, payload) {
  const sheet = sheet_(spreadsheet, 'App State', ['Key', 'Value', 'Updated at']);
  // Google Sheets limits a single cell to 50,000 characters. Store a state in
  // fixed-size chunks so a long task/insight history remains restorable.
  const state = {
    tasks: payload.tasks || [], insights: payload.insights || [],
    focusByDate: payload.focusByDate || {}, settings: payload.settings || {}
  };
  const serialized = JSON.stringify(state);
  const chunkSize = 45_000;
  const chunks = serialized.match(new RegExp('.{1,' + chunkSize + '}', 'g')) || ['{}'];
  const updatedAt = new Date().toISOString();
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 3).setValues([['Key', 'Value', 'Updated at']]);
  sheet.getRange(2, 1, chunks.length, 3).setValues(chunks.map((chunk, index) => ['state:' + index, chunk, updatedAt]));
}

function loadState_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName('App State');
  if (!sheet || sheet.getLastRow() < 2) return null;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  // Support both the former one-row state and the chunked format.
  const raw = rows
    .filter(row => String(row[0]) === 'state' || String(row[0]).indexOf('state:') === 0)
    .sort((a, b) => Number(String(a[0]).split(':')[1] || 0) - Number(String(b[0]).split(':')[1] || 0))
    .map(row => String(row[1]))
    .join('');
  try { return raw ? JSON.parse(raw) : null; } catch (error) { return null; }
}

function replaceInsights_(sheet, insights) {
  const headers = ['Date', 'Total tasks', 'Completed tasks', 'Completion rate', 'Focus seconds', 'Login count', 'Activity count', 'Last activity at', 'Last synced'];
  // Keep the spreadsheet as the long-term store. The browser only sends its
  // recent cache, so older rows must not disappear from the reporting history.
  const existing = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues() : [];
  const byDate = new Map(existing.map(row => [String(row[0]), row]));
  insights.forEach(insight => byDate.set(String(insight.date), [insight.date, insight.totalTasks, insight.completedTasks, insight.completionRate, insight.focusSeconds, insight.loginCount || 0, insight.activityCount || 0, insight.lastActivityAt || '', insight.syncedAt]));
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  const values = [...byDate.values()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  if (!values.length) return;
  sheet.getRange(2, 1, values.length, headers.length).setValues(values);
}

function removeLegacySheets_(spreadsheet) {
  // Requested cleanup: these tabs are no longer written or needed by the app.
  ['Insight Chart', 'Activity Log'].forEach(name => {
    const sheet = spreadsheet.getSheetByName(name);
    if (sheet && spreadsheet.getSheets().length > 1) spreadsheet.deleteSheet(sheet);
  });
}

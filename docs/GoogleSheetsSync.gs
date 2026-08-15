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
  const activitySheet = sheet_(spreadsheet, 'Activity Log', ['Activity ID', 'Occurred at', 'Type', 'Description', 'Task ID', 'Last synced']);

  replaceTasks_(tasksSheet, payload.tasks || []);
  archiveTasks_(taskHistorySheet, payload.tasks || []);
  // The app sends a snapshot for every task date. Replacing this sheet keeps
  // deleted tasks and their former dates from remaining in the chart.
  replaceInsights_(insightSheet, payload.insights || (payload.insight ? [payload.insight] : []));
  mergeActivities_(activitySheet, payload.activities || []);
  saveState_(spreadsheet, payload);
  buildInsightChart_(spreadsheet, insightSheet);
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}

/** Returns the last complete application state so a new browser/device can restore it. */
function doGet(event) {
  if (event.parameter.action !== 'state') return ContentService.createTextOutput(JSON.stringify({ ok: true }));
  const state = loadState_(SpreadsheetApp.getActiveSpreadsheet());
  return ContentService.createTextOutput(JSON.stringify({ ok: true, state: state })).setMimeType(ContentService.MimeType.JSON);
}

function mergeActivities_(sheet, activities) {
  const headers = ['Activity ID', 'Occurred at', 'Type', 'Description', 'Task ID', 'Last synced'];
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (!activities.length) return;
  // This is an append-only audit trail.  The app sends its local history again
  // on each sync, so IDs are used to prevent duplicate rows.
  const existingIds = sheet.getLastRow() > 1
    ? new Set(sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat().map(String))
    : new Set();
  const syncedAt = new Date().toISOString();
  const values = activities
    .sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)))
    .filter(activity => !existingIds.has(String(activity.id)))
    .map(activity => [activity.id, activity.occurredAt, activity.kind, activity.description, activity.taskId || '', syncedAt]);
  if (values.length) sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
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
  const state = {
    tasks: payload.tasks || [], insights: payload.insights || [], activities: payload.activities || [],
    focusByDate: payload.focusByDate || {}, settings: payload.settings || {}
  };
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 3).setValues([['Key', 'Value', 'Updated at']]);
  sheet.getRange(2, 1, 1, 3).setValues([['state', JSON.stringify(state), new Date().toISOString()]);
}

function loadState_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName('App State');
  if (!sheet || sheet.getLastRow() < 2) return null;
  const raw = sheet.getRange(2, 2).getValue();
  try { return raw ? JSON.parse(raw) : null; } catch (error) { return null; }
}

function replaceInsights_(sheet, insights) {
  const headers = ['Date', 'Total tasks', 'Completed tasks', 'Completion rate', 'Focus seconds', 'Login count', 'Activity count', 'Last activity at', 'Last synced'];
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (!insights.length) return;
  const values = insights
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map(insight => [insight.date, insight.totalTasks, insight.completedTasks, insight.completionRate, insight.focusSeconds, insight.loginCount || 0, insight.activityCount || 0, insight.lastActivityAt || '', insight.syncedAt]);
  sheet.getRange(2, 1, values.length, headers.length).setValues(values);
}

function buildInsightChart_(spreadsheet, insightSheet) {
  const dashboard = spreadsheet.getSheetByName('Insight Chart') || spreadsheet.insertSheet('Insight Chart');
  dashboard.clear();
  dashboard.getRange('A1').setValue('FocusFlow completion by date');
  const rows = Math.max(insightSheet.getLastRow() - 1, 1);
  const chart = dashboard.newChart().asColumnChart().addRange(insightSheet.getRange(1, 1, rows + 1, 4)).setPosition(3, 1, 0, 0).setOption('title', 'Daily completion rate').setOption('legend', { position: 'none' }).build();
  dashboard.getCharts().forEach(existing => dashboard.removeChart(existing));
  dashboard.insertChart(chart);
}

/** FocusFlow Google Apps Script webhook.
 * Deploy: Extensions > Apps Script > Deploy > New deployment > Web app.
 * Set access to the intended FocusFlow users, then use the /exec URL in app/.env.
 */
function doPost(event) {
  const payload = JSON.parse(event.parameter.payload || '{}');
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const tasksSheet = sheet_(spreadsheet, 'Daily Tasks', ['Task ID', 'Date', 'Title', 'Category', 'Priority', 'Status', 'Reminder time', 'Created at', 'Completed at', 'Last synced']);
  const insightSheet = sheet_(spreadsheet, 'Insights', ['Date', 'Total tasks', 'Completed tasks', 'Completion rate', 'Focus seconds', 'Last synced']);
  const activitySheet = sheet_(spreadsheet, 'Activity Log', ['Activity ID', 'Occurred at', 'Type', 'Description', 'Task ID', 'Last synced']);

  replaceTasks_(tasksSheet, payload.tasks || []);
  // The app sends a snapshot for every task date. Replacing this sheet keeps
  // deleted tasks and their former dates from remaining in the chart.
  replaceInsights_(insightSheet, payload.insights || (payload.insight ? [payload.insight] : []));
  replaceActivities_(activitySheet, payload.activities || []);
  buildInsightChart_(spreadsheet, insightSheet);
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}

function replaceActivities_(sheet, activities) {
  const headers = ['Activity ID', 'Occurred at', 'Type', 'Description', 'Task ID', 'Last synced'];
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (!activities.length) return;
  const syncedAt = new Date().toISOString();
  const values = activities
    .sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)))
    .map(activity => [activity.id, activity.occurredAt, activity.kind, activity.description, activity.taskId || '', syncedAt]);
  sheet.getRange(2, 1, values.length, headers.length).setValues(values);
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

function replaceInsights_(sheet, insights) {
  const headers = ['Date', 'Total tasks', 'Completed tasks', 'Completion rate', 'Focus seconds', 'Last synced'];
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (!insights.length) return;
  const values = insights
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map(insight => [insight.date, insight.totalTasks, insight.completedTasks, insight.completionRate, insight.focusSeconds, insight.syncedAt]);
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

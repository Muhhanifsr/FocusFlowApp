# Google Sheets sync setup

1. Open the connected spreadsheet, then choose **Extensions → Apps Script**.
2. Replace the starter script with `GoogleSheetsSync.gs` from this folder and save it.
3. Deploy it as a **Web app**. Run as yourself and give access only to the people who use FocusFlow.
4. Copy the deployment URL ending in `/exec`, place it in `app/.env` as `VITE_GOOGLE_SHEETS_WEB_APP_URL=...`, then restart the app.

Every task create, completion, reopen, or deletion then synchronizes the following tabs. The task tab is a current snapshot, so deleted tasks are removed on the next sync.

- `Daily Tasks`: scheduled date, task detail, optional reminder time, creation time, completion time, and status.
- `Insights`: total/completed tasks and the daily completion rate.
- `Insight Chart`: an automatically refreshed completion chart.

The web app URL is intentionally not committed: it is an authorization boundary for your Google account.

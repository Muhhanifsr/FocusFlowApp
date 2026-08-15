# Google Sheets sync setup

1. Open the connected spreadsheet, then choose **Extensions → Apps Script**.
2. Replace the starter script with `GoogleSheetsSync.gs` from this folder and save it.
3. Deploy it as a **Web app**. Run as yourself and give access to the people who use FocusFlow. The app needs both `GET` and `POST` access: `GET` restores the saved state when the app opens, while `POST` saves changes.
4. Copy the deployment URL ending in `/exec`, place it in `app/.env` as `VITE_GOOGLE_SHEETS_WEB_APP_URL=...`, then restart the app.

Every task create, completion, reopen, deletion, focus-time update, activity, and theme change is saved. When FocusFlow is opened on the same or a new device, it first restores the latest saved state from the spreadsheet before it starts syncing.

- `Daily Tasks`: current task snapshot, with scheduled date, optional reminder, creation time, completion time, and status.
- `Task History`: permanent task archive. A deleted task remains here with status `Deleted`.
- `Insights`: total/completed tasks and the daily completion rate.
- `Activity Log`: append-only user activity history.
- `App State`: the backend snapshot used by the app to restore tasks, focus time, insights, activities, and appearance settings. Do not edit its JSON value manually.
- `Insight Chart`: an automatically refreshed completion chart.

The web app URL is intentionally not committed: it is an authorization boundary for your Google account.

# Google Sheets sync setup

1. Open the connected spreadsheet, then choose **Extensions → Apps Script**.
2. Replace the starter script with `GoogleSheetsSync.gs` from this folder and save it.
3. Deploy it as a **Web app**. Run as yourself and give access to the people who use FocusFlow. The app needs both `GET` and `POST` access: `GET` restores the saved state when the app opens, while `POST` saves changes.
4. Copy the deployment URL ending in `/exec`, place it in `app/.env` as `VITE_GOOGLE_SHEETS_WEB_APP_URL=...`, then restart the app.

Task, insight, focus-time, and theme changes are saved. FocusFlow coalesces normal changes for 5 seconds and permits only one request at a time, so rapid clicks cannot overload the browser or Apps Script. While the focus timer runs, its per-second display is kept only in the browser and is sent at the daily checkpoint, manual sync, or the next normal change. Activity events remain local to the device and are not uploaded.

When FocusFlow is opened on the same or a new device, it first restores the latest saved state from the spreadsheet before it starts syncing. After changing `GoogleSheetsSync.gs`, create a new deployment version (or update the existing deployment) so older insight rows are merged rather than removed by the bounded browser cache.

- `Daily Tasks`: current task snapshot, with scheduled date, optional reminder, creation time, completion time, and status.
- `Task History`: permanent task archive. A deleted task remains here with status `Deleted`.
- `Insights`: total/completed tasks and the daily completion rate.
- `App State`: the backend snapshot used by the app to restore tasks, focus time, insights, and appearance settings. Its JSON is automatically split across rows when needed; do not edit it manually.

On the first sync after this update, the script removes the legacy `Activity Log` and `Insight Chart` tabs.

The web app URL is intentionally not committed: it is an authorization boundary for your Google account.

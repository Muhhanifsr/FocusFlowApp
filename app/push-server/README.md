# FocusFlow push service

This small Node service schedules timer completion pushes. It must run on an always-on HTTPS host with persistent storage mounted at `PUSH_STORAGE_PATH`; browser timers alone cannot reliably wake a closed PWA.

## Configure

1. Install Node.js 20 or newer and run `npm install` in this directory.
2. Generate VAPID keys with `npm run vapid`. Keep the private key on the server only.
3. Set these server environment variables:

   - `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` from the generated key pair.
   - `VAPID_SUBJECT`, a `mailto:` address or HTTPS contact URL.
   - `ALLOWED_ORIGINS`, the exact deployed PWA origin (for example `https://focusflow.example.com`).
   - `PUSH_STORAGE_PATH`, a file on persistent storage (default `./data/push-jobs.json`).
   - `PORT`, if the host does not provide it automatically.

4. Start with `npm start` and expose the service at a stable HTTPS URL.
5. Set `VITE_PUSH_API_URL` in `app/.env` to that URL, rebuild, and redeploy the PWA.
6. Install/update the PWA, allow notifications, then start a timer. Permission must be granted on the installed PWA on iOS/iPadOS. Android browsers also require notification permission.

The service stores pending subscriptions and timer deadlines in its JSON data file so they survive process restarts. Use a single service instance or shared storage with locking; this implementation is intended for one instance. Keep the storage private and persistent. Do not expose the VAPID private key to the frontend.

The browser push provider delivers the completion notification while the PWA is closed. Timer display is calculated from the saved end time, so the display catches up when the PWA returns to the foreground. OS battery policies and push provider delivery can introduce some notification delay.

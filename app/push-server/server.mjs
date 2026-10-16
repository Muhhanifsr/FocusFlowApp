import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import webpush from "web-push";

const port = Number(process.env.PORT || 8788);
const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || "mailto:admin@focusflow.app";
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean));
const storagePath = resolve(process.env.PUSH_STORAGE_PATH || "./data/push-jobs.json");
const jobs = new Map();
const timers = new Map();

if (!publicKey || !privateKey || allowedOrigins.size === 0) {
  throw new Error("Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and ALLOWED_ORIGINS before starting the push server.");
}
webpush.setVapidDetails(subject, publicKey, privateKey);

function json(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

async function persist() {
  await mkdir(dirname(storagePath), { recursive: true });
  const temporary = `${storagePath}.tmp`;
  await writeFile(temporary, JSON.stringify([...jobs.values()]), { mode: 0o600 });
  await rename(temporary, storagePath);
}

function keyFor(subscription) {
  return createHash("sha256").update(subscription.endpoint).digest("hex");
}

function isPushEndpoint(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && (
      url.hostname === "fcm.googleapis.com" || url.hostname.endsWith(".push.services.mozilla.com") ||
      url.hostname === "web.push.apple.com" || url.hostname.endsWith(".notify.windows.com")
    );
  } catch { return false; }
}

function schedule(job) {
  const key = keyFor(job.subscription);
  clearTimeout(timers.get(key));
  const delay = Math.max(0, job.endAt - Date.now());
  timers.set(key, setTimeout(() => void deliver(key), Math.min(delay, 2_147_000_000)));
}

async function deliver(key) {
  const job = jobs.get(key);
  if (!job) return;
  if (job.endAt > Date.now()) { schedule(job); return; }
  jobs.delete(key);
  timers.delete(key);
  await persist();
  const title = job.period === "Focus" ? "Focus session complete" : `${job.period} complete`;
  const body = job.period === "Focus" ? "Waktunya beristirahat. Sesi fokusmu sudah selesai." : "Waktu istirahat selesai. Siap fokus lagi?";
  try {
    await webpush.sendNotification(job.subscription, JSON.stringify({ title, body, url: job.appUrl }));
  } catch (error) {
    if (error.statusCode !== 404 && error.statusCode !== 410) console.error("Push delivery failed:", error.message);
  }
}

async function readBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 24_000) throw new Error("Request body is too large.");
  }
  return JSON.parse(body || "{}");
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.has(origin)) return json(response, 403, { error: "Origin is not allowed." });
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (request.method === "OPTIONS") { response.writeHead(204); return response.end(); }
  const path = new URL(request.url || "/", `http://${request.headers.host}`).pathname;
  if (request.method === "GET" && path === "/health") return json(response, 200, { ok: true });
  if (request.method === "GET" && path === "/vapid-public-key") return json(response, 200, { publicKey });
  if (request.method !== "POST" || !["/schedule", "/cancel"].includes(path)) return json(response, 404, { error: "Not found." });

  try {
    const data = await readBody(request);
    const subscription = data.subscription;
    if (!subscription || typeof subscription.endpoint !== "string" || !isPushEndpoint(subscription.endpoint)) return json(response, 400, { error: "A valid browser push subscription is required." });
    const key = keyFor(subscription);
    if (path === "/cancel") {
      jobs.delete(key); clearTimeout(timers.get(key)); timers.delete(key); await persist();
      return json(response, 200, { ok: true });
    }
    const now = Date.now();
    if (!["Focus", "Short Break", "Long Break"].includes(data.period) || !Number.isSafeInteger(data.endAt) || data.endAt <= now || data.endAt > now + 31 * 60_000) return json(response, 400, { error: "The timer end time is invalid." });
    const appPath = typeof data.appPath === "string" && data.appPath.startsWith("/") ? data.appPath : "/";
    const appUrl = origin && allowedOrigins.has(origin) ? new URL(appPath, origin).href : [...allowedOrigins][0];
    const job = { subscription, period: data.period, endAt: data.endAt, appUrl };
    jobs.set(key, job); await persist(); schedule(job);
    return json(response, 200, { ok: true });
  } catch (error) {
    return json(response, 400, { error: error instanceof Error ? error.message : "Invalid request." });
  }
});

async function restore() {
  try {
    const saved = JSON.parse(await readFile(storagePath, "utf8"));
    if (Array.isArray(saved)) for (const job of saved) {
      if (job.subscription?.endpoint && Number.isSafeInteger(job.endAt)) { const key = keyFor(job.subscription); jobs.set(key, job); schedule(job); }
    }
  } catch (error) { if (error.code !== "ENOENT") throw error; }
}

await restore();
server.listen(port, "0.0.0.0", () => console.log(`FocusFlow push server listening on ${port}`));

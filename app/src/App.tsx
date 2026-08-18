import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import "./SyncButton.css";

type Priority = "High" | "Medium" | "Low";
type Period = "Focus" | "Short Break" | "Long Break";
type Task = { id: number; title: string; category: string; priority: Priority; done: boolean; date: string; reminderAt?: string; createdAt: string; completedAt?: string };
type ActivityKind = "login" | "task_created" | "task_completed" | "task_reopened" | "task_deleted" | "focus_started" | "focus_paused" | "timer_reset" | "page_viewed" | "theme_changed";
type Activity = { id: string; kind: ActivityKind; occurredAt: string; description: string; taskId?: number };
type DailyInsight = { date: string; totalTasks: number; completedTasks: number; completionRate: number; focusSeconds: number; loginCount: number; activityCount: number; lastActivityAt?: string; syncedAt: string };
type RemoteState = { tasks?: Task[]; insights?: DailyInsight[]; activities?: Activity[]; focusByDate?: Record<string, number>; settings?: { darkMode?: boolean } };
type TimerState = { activePeriod: Period | null; endAt: number | null; values: Record<Period, number>; focusStartedAt: number | null };
type AppNotification = { title: string; message: string; kind: "timer" | "reminder" };

const TASK_STORAGE_KEY = "focusflow-tasks";
const ACTIVITY_STORAGE_KEY = "focusflow-activities";
const INSIGHT_STORAGE_KEY = "focusflow-daily-insights";
const FOCUS_STORAGE_KEY = "focusflow-focus-seconds-by-date";
const TIMER_STORAGE_KEY = "focusflow-timer-state";
const REMINDER_NOTIFICATION_KEY = "focusflow-delivered-reminders";
const SHEETS_LAST_SYNC_KEY = "focusflow-sheets-last-sync-date";
const SHEETS_URL = import.meta.env.VITE_GOOGLE_SHEETS_WEB_APP_URL as string | undefined;
const SHEET_LINK = "https://docs.google.com/spreadsheets/d/1rsTToV5dWZGgjSrWNzV4eUcVN4XCJSSty9yMsAZWvls/edit?usp=sharing";
const DURATIONS: Record<Period, number> = { Focus: 25 * 60, "Short Break": 5 * 60, "Long Break": 15 * 60 };
const QUOTES = [
  { text: "The key is not to prioritize what's on your schedule, but to schedule your priorities.", author: "Stephen Covey" },
  { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
];

const jakartaDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const dateLabel = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const shortDateLabel = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const shiftDate = (date: string, days: number) => { const value = new Date(`${date}T00:00:00`); value.setDate(value.getDate() + days); return value.toLocaleDateString("en-CA"); };
const taskDateDescription = (date: string, today = jakartaDate()) => date === today ? "Today" : date === shiftDate(today, 1) ? "Tomorrow" : dateLabel(date);
const focusTimeLabel = (seconds: number) => seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m` : `${Math.floor(seconds / 60)}m`;

function readTimerState(): TimerState {
  const saved = readStored<Partial<TimerState>>(TIMER_STORAGE_KEY, {});
  return { activePeriod: saved.activePeriod || null, endAt: saved.endAt || null, values: { ...DURATIONS, ...(saved.values || {}) }, focusStartedAt: saved.focusStartedAt || null };
}

function playNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const audio = new AudioContextClass();
    const playTone = (frequency: number, at: number) => {
      const oscillator = audio.createOscillator(); const gain = audio.createGain();
      oscillator.frequency.value = frequency; oscillator.type = "sine"; gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(0.16, at + 0.02); gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.26);
      oscillator.connect(gain).connect(audio.destination); oscillator.start(at); oscillator.stop(at + 0.28);
    };
    playTone(880, audio.currentTime); playTone(1175, audio.currentTime + 0.18);
    window.setTimeout(() => void audio.close(), 650);
  } catch { /* Sound is optional when the device/browser blocks audio playback. */ }
}

async function syncGoogleSheets(tasks: Task[], insights: DailyInsight[], activities: Activity[], focusByDate: Record<string, number>, darkMode: boolean) {
  if (!SHEETS_URL) return false;
  const payload: Required<RemoteState> = { tasks, insights, activities, focusByDate, settings: { darkMode } };
  try { await fetch(SHEETS_URL, { method: "POST", mode: "no-cors", body: new URLSearchParams({ payload: JSON.stringify(payload) }) }); return true; } catch { return false; }
}

async function loadGoogleSheets(): Promise<RemoteState | null> {
  if (!SHEETS_URL) return null;
  const url = new URL(SHEETS_URL);
  url.searchParams.set("action", "state");
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Google Sheets returned ${response.status}`);
  const data = await response.json() as { ok?: boolean; state?: RemoteState };
  return data.ok && data.state ? data.state : null;
}

const jakartaDateFrom = (timestamp: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(timestamp));

function createdDate(task: Task) {
  return task.createdAt && !Number.isNaN(new Date(task.createdAt).getTime()) ? jakartaDateFrom(task.createdAt) : task.date;
}

function readStored<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || "") as T; } catch { return fallback; }
}

function makeInsight(date: string, tasks: Task[], activities: Activity[], focusByDate: Record<string, number>): DailyInsight {
  const dailyTasks = tasks.filter((task) => createdDate(task) === date);
  const completedTasks = dailyTasks.filter((task) => task.done).length;
  const dailyActivities = activities.filter((activity) => jakartaDateFrom(activity.occurredAt) === date);
  const logins = dailyActivities.filter((activity) => activity.kind === "login");
  return { date, totalTasks: dailyTasks.length, completedTasks, completionRate: dailyTasks.length ? Math.round((completedTasks / dailyTasks.length) * 100) : 0, focusSeconds: focusByDate[date] || 0, loginCount: logins.length, activityCount: dailyActivities.length, lastActivityAt: dailyActivities[dailyActivities.length - 1]?.occurredAt, syncedAt: new Date().toISOString() };
}

function hydrateInsights(tasks: Task[], activities: Activity[], saved: DailyInsight[], focusByDate: Record<string, number>) {
  const today = jakartaDate();
  const dates = new Set([...saved.map((item) => item.date), ...tasks.map(createdDate), ...activities.map((item) => jakartaDateFrom(item.occurredAt)), ...Object.keys(focusByDate), today]);
  return [...dates].sort().map((date) => {
    const old = saved.find((item) => item.date === date);
    const fresh = makeInsight(date, tasks, activities, focusByDate);
    // Historical values are a daily snapshot. Only the current day is recalculated,
    // so a later task edit cannot silently rewrite yesterday's chart.
    if (old && date !== today) return { ...old, loginCount: fresh.loginCount, activityCount: fresh.activityCount, lastActivityAt: fresh.lastActivityAt || old.lastActivityAt, focusSeconds: Math.max(old.focusSeconds || 0, fresh.focusSeconds), syncedAt: old.syncedAt };
    return fresh;
  });
}

function millisecondsUntilJakartaEight() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date());
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const nextEight = Date.UTC(value("year"), value("month") - 1, value("day"), 1); // 08:00 WIB is 01:00 UTC.
  return (nextEight > Date.now() ? nextEight : nextEight + 86_400_000) - Date.now();
}

function jakartaHour() {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", hour: "numeric", hourCycle: "h23" }).format(new Date()));
}

function streakFromTasks(tasks: Task[]) {
  const createdDates = new Set(tasks.map((task) => task.createdAt ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(task.createdAt)) : undefined).filter(Boolean));
  let streak = 0;
  let cursor = jakartaDate();
  while (createdDates.has(cursor)) { streak += 1; cursor = shiftDate(cursor, -1); }
  return streak;
}

const Icon = ({ name, size = 20 }: { name: string; size?: number }) => {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    check: <><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>, calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>, chart: <><path d="M3 3v18h18"/><path d="M7 16v-5M12 16V7M17 16v-8"/></>, settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.1 2.1-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56v.1h-3v-.1A1.7 1.7 0 0 0 10.7 18.6a1.7 1.7 0 0 0-1.88.34l-.06.06-2.1-2.1.06-.06A1.7 1.7 0 0 0 7.06 15 1.7 1.7 0 0 0 5.5 14H5.4v-3h.1A1.7 1.7 0 0 0 7.06 10a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.1-2.1.06.06A1.7 1.7 0 0 0 11.73 4.8v-.1h3v.1a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.1 2.1-.06.06A1.7 1.7 0 0 0 21 11h.1v3H21A1.7 1.7 0 0 0 19.4 15Z"/></>,
    plus: <path d="M12 5v14M5 12h14"/>, play: <path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none"/>, pause: <><path d="M8 5v14M16 5v14"/></>, rotate: <><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v5h5"/></>, more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></>, target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></>, menu: <path d="M4 7h16M4 12h16M4 17h16"/>, bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
};
//anime
function AnimeMark() { return <div className="anime-mark" aria-label="Focus companion"><span className="anime-hair"/><span className="anime-face"><i/><i/></span><b>✦</b></div>; }

function CalendarView({ tasks, openNewTask }: { tasks: Task[]; openNewTask: (date: string) => void }) {
  const today = jakartaDate(); const [cursor, setCursor] = useState(() => new Date(`${today}T00:00:00`)); const [selectedDate, setSelectedDate] = useState(today);
  const year = cursor.getFullYear(), month = cursor.getMonth(); const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => index + 1); const selectedTasks = tasks.filter((task) => createdDate(task) === selectedDate);
  const moveMonth = (amount: number) => { const next = new Date(year, month + amount, 1); setCursor(next); setSelectedDate(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`); };
  return <section className="page-panel"><div className="page-heading"><div><p className="eyebrow">PLAN WITH INTENTION</p><h1>Calendar</h1><p className="subtitle">Every task is recorded on the date it was created.</p></div><button className="new-task" onClick={() => openNewTask(selectedDate)}><Icon name="plus" size={18}/>Add task</button></div><div className="calendar-layout"><div className="calendar-card card"><div className="calendar-title"><button onClick={() => moveMonth(-1)} aria-label="Bulan sebelumnya">‹</button><h2>{cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2><button onClick={() => moveMonth(1)} aria-label="Bulan berikutnya">›</button></div><input className="date-jump" aria-label="Pilih bulan" type="month" value={`${year}-${String(month + 1).padStart(2, "0")}`} onChange={(event) => { const [nextYear, nextMonth] = event.target.value.split("-").map(Number); const next = new Date(nextYear, nextMonth - 1, 1); setCursor(next); setSelectedDate(event.target.value + "-01"); }}/><div className="weekday-row">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div><div className="month-grid">{Array.from({ length: firstDay }).map((_, index) => <i key={`blank-${index}`}/>)}{days.map((day) => { const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`; const count = tasks.filter((task) => createdDate(task) === date).length; return <button onClick={() => setSelectedDate(date)} className={`${date === selectedDate ? "selected-day" : ""} ${date === today ? "current-day" : ""} ${count ? "has-item" : ""}`} key={date}>{day}{count > 0 && <small title={`${count} task dibuat`}>{count}</small>}</button>; })}</div></div><aside className="agenda-card card"><h2>{taskDateDescription(selectedDate)}</h2><p className="muted">{dateLabel(selectedDate)} · {selectedTasks.length} task dibuat</p>{selectedTasks.length ? selectedTasks.map((task) => <div className="agenda-item" key={task.id}><b className="dot personal"/><div><strong>{task.title}</strong><span>{task.done ? "Completed" : `Due ${taskDateDescription(task.date)}`}</span></div></div>) : <p className="empty-agenda">Tidak ada task yang dibuat pada {taskDateDescription(selectedDate).toLowerCase()}.</p>}<button className="add-agenda" onClick={() => openNewTask(selectedDate)}><Icon name="plus" size={16}/>Add task for this date</button></aside></div></section>;
}

function InsightsView({ tasks, focusSeconds, insights }: { tasks: Task[]; focusSeconds: number; insights: DailyInsight[] }) {
  const today = jakartaDate(); const todayTasks = tasks.filter((task) => task.date === today); const completed = todayTasks.filter((task) => task.done).length; const rate = todayTasks.length ? Math.round((completed / todayTasks.length) * 100) : 0; const [range, setRange] = useState("This week");
  const chartDates = useMemo(() => range === "This week" ? Array.from({ length: 7 }, (_, index) => shiftDate(today, index - 6)) : range === "This month" ? Array.from({ length: Number(today.slice(-2)) }, (_, index) => `${today.slice(0, 8)}${String(index + 1).padStart(2, "0")}`) : Array.from({ length: 12 }, (_, index) => `${today.slice(0, 4)}-${String(index + 1).padStart(2, "0")}`), [range, today]);
  const chartData = chartDates.map((key) => { const matching = range === "This year" ? insights.filter((item) => item.date.startsWith(key)) : insights.filter((item) => item.date === key); const total = matching.reduce((sum, item) => sum + item.totalTasks, 0); const done = matching.reduce((sum, item) => sum + item.completedTasks, 0); const logins = matching.reduce((sum, item) => sum + (item.loginCount || 0), 0); const activities = matching.reduce((sum, item) => sum + (item.activityCount || 0), 0); const value = total ? Math.min(100, Math.round((done / total) * 100)) : 0; return { key, value, count: total, logins, activities, label: range === "This year" ? new Date(`${key}-01T00:00:00`).toLocaleDateString("en-US", { month: "short" }) : shortDateLabel(key) }; });
  const streak = streakFromTasks(tasks);
  return <section className="page-panel"><div className="page-heading"><div><p className="eyebrow"> PRODUCTIVITY</p><h1>Insights</h1><p className="subtitle">Setiap login menyimpan snapshot harian; completion dihitung dari task yang dibuat pada tanggal tersebut.</p></div><select className="period-select" value={range} onChange={(event) => setRange(event.target.value)}><option>This week</option><option>This month</option><option>This year</option></select></div><div className="insight-grid"><article className="insight-main card"><div><h2>Daily completion</h2></div><div className={`bar-chart ${chartData.length > 12 ? "dense" : ""}`}>{chartData.map((item) => <div className={item.key === today ? "chart-day active" : "chart-day"} key={item.key}>{(item.count > 0 || item.logins > 0) && <i className={item.count ? "" : "login-only"} style={{ height: `${item.value || 2}%` }} title={`${item.label}: ${item.value}% · ${item.count} task · ${item.logins} login · ${item.activities} aktivitas`}/>}<span>{item.label}</span></div>)}</div></article><article className="completion-card card"><div className="completion-ring" style={{ background: `conic-gradient(#7455dc ${rate * 3.6}deg, #f0edf5 0deg)` }}><span>{rate}%</span></div><h2>Today's progress</h2><p className="muted">{completed} of {todayTasks.length} tasks completed</p></article></div><div className="insight-summary card"><div><span>Focus time today</span><strong>{focusTimeLabel(focusSeconds)}</strong></div><div><span>Tasks planned today</span><strong>{todayTasks.length}</strong></div><div><span>Completion rate</span><strong>{rate}%</strong></div><div><span>Creation streak</span><strong>{streak} day{streak === 1 ? "" : "s"} {streak > 0 ? "🔥" : ""}</strong></div></div></section>;
}
//set to dark
function SettingsView({ darkMode, setDarkMode, addActivity }: { darkMode: boolean; setDarkMode: (value: boolean) => void; addActivity: (kind: ActivityKind, description: string) => void }) { return <section className="page-panel settings-page"><div className="page-heading"><div><p className="eyebrow">PERSONALIZE FOCUSFLOW</p><h1>Settings</h1><p className="subtitle">Set up your workspace exactly the way you need it.</p></div></div><div className="settings-card card"><div className="setting-row"><div><strong>Appearance</strong><span>Choose a theme that feels comfortable.</span></div><button className={darkMode ? "theme-toggle on" : "theme-toggle"} onClick={() => { const next = !darkMode; setDarkMode(next); addActivity("theme_changed", `Tema diubah ke ${next ? "gelap" : "terang"}`); }}><span className="theme-track"><i/></span><b>{darkMode ? "Dark mode" : "Light mode"}</b></button></div><div className="setting-row"><div><strong>Google Sheets</strong><span>Open task and insight records.</span></div><a className="sheet-link" href={SHEET_LINK} target="_blank" rel="noreferrer">Open spreadsheet ↗</a></div></div></section>; }

function App() {
  const initialTimer = readTimerState();
  const [tasks, setTasks] = useState<Task[]>(() => readStored<Task[]>(TASK_STORAGE_KEY, [])); const [activities, setActivities] = useState<Activity[]>(() => readStored<Activity[]>(ACTIVITY_STORAGE_KEY, [])); const [focusByDate, setFocusByDate] = useState<Record<string, number>>(() => readStored<Record<string, number>>(FOCUS_STORAGE_KEY, {})); const [dailyInsights, setDailyInsights] = useState<DailyInsight[]>(() => hydrateInsights(readStored<Task[]>(TASK_STORAGE_KEY, []), readStored<Activity[]>(ACTIVITY_STORAGE_KEY, []), readStored<DailyInsight[]>(INSIGHT_STORAGE_KEY, []), readStored<Record<string, number>>(FOCUS_STORAGE_KEY, {}))); const [filter, setFilter] = useState("Today"); const [taskTitle, setTaskTitle] = useState(""); const [taskPriority, setTaskPriority] = useState<Priority>("Low"); const [taskDate, setTaskDate] = useState(jakartaDate()); const [reminderAt, setReminderAt] = useState(""); const [period, setPeriod] = useState<Period>("Focus"); const [activePeriod, setActivePeriod] = useState<Period | null>(initialTimer.activePeriod); const [timerEndAt, setTimerEndAt] = useState<number | null>(initialTimer.endAt); const [timerValues, setTimerValues] = useState<Record<Period, number>>(initialTimer.values); const [focusStartedAt, setFocusStartedAt] = useState<number | null>(initialTimer.focusStartedAt); const [quoteIndex, setQuoteIndex] = useState(0); const [page, setPage] = useState<"overview" | "calendar" | "insights" | "settings">("overview"); const [darkMode, setDarkMode] = useState(() => readStored("focusflow-settings", { darkMode: false }).darkMode); const [remoteReady, setRemoteReady] = useState(!SHEETS_URL); const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "success" | "error">("idle"); const [showTaskForm, setShowTaskForm] = useState(false); const [taskMenu, setTaskMenu] = useState<number | null>(null); const [mobileNav, setMobileNav] = useState(false); const [focusSeconds, setFocusSeconds] = useState(() => readStored<Record<string, number>>(FOCUS_STORAGE_KEY, {})[jakartaDate()] || 0); const [notificationReady, setNotificationReady] = useState(() => "Notification" in window && Notification.permission === "granted"); const [appNotification, setAppNotification] = useState<AppNotification | null>(null); const focusSecondsRef = useRef(focusSeconds); const tasksRef = useRef(tasks); const activitiesRef = useRef(activities); const insightsRef = useRef(dailyInsights); const focusByDateRef = useRef(focusByDate); const darkModeRef = useRef(darkMode);
  const today = jakartaDate(); const todayTasks = useMemo(() => tasks.filter((task) => task.date === today), [tasks, today]); const visibleTasks = filter === "Completed" ? todayTasks.filter((task) => task.done) : todayTasks; const completed = todayTasks.filter((task) => task.done).length; const progress = todayTasks.length ? Math.round((completed / todayTasks.length) * 100) : 0; const seconds = timerValues[period]; const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; const timerRemainingPercent = Math.max(0, Math.min(100, (seconds / DURATIONS[period]) * 100));
  const closeTaskForm = () => { setShowTaskForm(false); setReminderAt(""); setTaskPriority("Low"); };
  const sendNotification = (notification: AppNotification, tag: string) => { playNotificationSound(); setAppNotification(notification); if (notificationReady) new Notification(`FocusFlow · ${notification.title}`, { body: notification.message, icon: "/anime-mark.svg", tag, requireInteraction: true }); };
  const commitFocusSession = (startedAt: number | null) => { if (!startedAt) return; const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000)); if (elapsed) setFocusSeconds((value) => value + elapsed); };
  useEffect(() => { localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify({ activePeriod, endAt: timerEndAt, values: timerValues, focusStartedAt } satisfies TimerState)); }, [activePeriod, timerEndAt, timerValues, focusStartedAt]);
  useEffect(() => {
    if (!activePeriod || !timerEndAt) return;
    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000));
      if (remaining > 0) {
        setTimerValues((values) => values[activePeriod] === remaining ? values : { ...values, [activePeriod]: remaining });
        if (activePeriod === "Focus" && focusStartedAt) { const elapsed = Math.floor((Date.now() - focusStartedAt) / 1000); if (elapsed > 0) { setFocusSeconds((value) => value + elapsed); setFocusStartedAt(focusStartedAt + elapsed * 1000); } }
        return;
      }
      setTimerValues((values) => ({ ...values, [activePeriod]: DURATIONS[activePeriod] })); setActivePeriod(null); setTimerEndAt(null);
      if (activePeriod === "Focus") { commitFocusSession(focusStartedAt); setFocusStartedAt(null); }
      sendNotification({ title: `${activePeriod} selesai`, message: activePeriod === "Focus" ? "Sesi fokus selesai. Saatnya beristirahat." : "Waktu istirahat selesai. Siap fokus lagi?", kind: "timer" }, `focusflow-timer-${activePeriod}`);
    };
    updateTimer(); const timer = window.setInterval(updateTimer, 500); return () => window.clearInterval(timer);
  }, [activePeriod, timerEndAt, focusStartedAt, notificationReady]);
  useEffect(() => { const carousel = window.setInterval(() => setQuoteIndex((value) => (value + 1) % QUOTES.length), 5500); return () => window.clearInterval(carousel); }, []);
  useEffect(() => { document.documentElement.classList.toggle("dark", darkMode); localStorage.setItem("focusflow-settings", JSON.stringify({ darkMode })); darkModeRef.current = darkMode; }, [darkMode]);
  const addActivity = (kind: ActivityKind, description: string, taskId?: number) => setActivities((current) => [...current, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind, description, taskId, occurredAt: new Date().toISOString() }]);
  useEffect(() => { if (remoteReady) addActivity("page_viewed", `Membuka halaman ${page}`); }, [page, remoteReady]);
  useEffect(() => { localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks)); tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(activities)); activitiesRef.current = activities; }, [activities]);
  useEffect(() => { localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(focusByDate)); focusByDateRef.current = focusByDate; }, [focusByDate]);
  useEffect(() => { setDailyInsights((current) => { const next = hydrateInsights(tasks, activities, current, focusByDate); return JSON.stringify(current) === JSON.stringify(next) ? current : next; }); }, [tasks, activities, focusByDate]);
  useEffect(() => { localStorage.setItem(INSIGHT_STORAGE_KEY, JSON.stringify(dailyInsights)); insightsRef.current = dailyInsights; }, [dailyInsights]);
  useEffect(() => { let cancelled = false; void loadGoogleSheets().then((remote) => { if (cancelled || !remote) return; const remoteTasks = Array.isArray(remote.tasks) ? remote.tasks : []; const remoteActivities = Array.isArray(remote.activities) ? remote.activities : []; const remoteFocus = remote.focusByDate || {}; setTasks(remoteTasks); setActivities(remoteActivities); setFocusByDate(remoteFocus); setDailyInsights(hydrateInsights(remoteTasks, remoteActivities, remote.insights || [], remoteFocus)); setFocusSeconds(remoteFocus[jakartaDate()] || 0); if (typeof remote.settings?.darkMode === "boolean") setDarkMode(remote.settings.darkMode); }).catch(() => { /* Local data remains available when offline or the deployment is not readable. */ }).finally(() => { if (!cancelled) setRemoteReady(true); }); return () => { cancelled = true; }; }, []);
  useEffect(() => { if (remoteReady) addActivity("login", "Aplikasi dibuka"); }, [remoteReady]);
  useEffect(() => { if (!SHEETS_URL || !remoteReady) return; const timer = window.setTimeout(() => syncGoogleSheets(tasksRef.current, insightsRef.current, activitiesRef.current, focusByDateRef.current, darkModeRef.current), 400); return () => window.clearTimeout(timer); }, [tasks, activities, focusByDate, dailyInsights, darkMode, remoteReady]);
  useEffect(() => { focusSecondsRef.current = focusSeconds; }, [focusSeconds]);
  useEffect(() => { setFocusByDate((current) => ({ ...current, [jakartaDate()]: focusSeconds })); }, [focusSeconds]);
  useEffect(() => {
    const notified = new Set<string>(readStored<string[]>(REMINDER_NOTIFICATION_KEY, []));
    const checkReminders = () => tasks.filter((task) => !task.done && task.reminderAt).forEach((task) => {
      const reminderTime = new Date(`${task.date}T${task.reminderAt}:00`).getTime(); const key = `${task.id}-${reminderTime}`;
      if (reminderTime <= Date.now() && !notified.has(key)) { notified.add(key); localStorage.setItem(REMINDER_NOTIFICATION_KEY, JSON.stringify([...notified])); sendNotification({ title: "Pengingat tugas", message: `Saatnya mengerjakan: ${task.title}`, kind: "reminder" }, `focusflow-task-${task.id}`); }
    });
    checkReminders(); const timer = window.setInterval(checkReminders, 15_000); return () => window.clearInterval(timer);
  }, [notificationReady, tasks]);
  useEffect(() => {
    if (!SHEETS_URL) return;
    if (!remoteReady) return;
    const syncForToday = () => { syncGoogleSheets(tasksRef.current, insightsRef.current, activitiesRef.current, focusByDateRef.current, darkModeRef.current); localStorage.setItem(SHEETS_LAST_SYNC_KEY, jakartaDate()); };
    // If the app is opened after 08:00 WIB, perform the missed daily report once.
    if (jakartaHour() >= 8 && localStorage.getItem(SHEETS_LAST_SYNC_KEY) !== jakartaDate()) syncForToday();
    let timer: number;
    const scheduleNext = () => { timer = window.setTimeout(() => { syncForToday(); scheduleNext(); }, millisecondsUntilJakartaEight()); };
    scheduleNext();
    return () => window.clearTimeout(timer);
  }, [remoteReady]);
  useEffect(() => { if (!appNotification) return; const timer = window.setTimeout(() => setAppNotification(null), 10_000); return () => window.clearTimeout(timer); }, [appNotification]);
  async function handleManualSync() { setSyncStatus("syncing"); const success = await syncGoogleSheets(tasksRef.current, insightsRef.current, activitiesRef.current, focusByDateRef.current, darkModeRef.current); setSyncStatus(success ? "success" : "error"); }
  function addTask(event: FormEvent) { event.preventDefault(); if (!taskTitle.trim()) return; const createdAt = new Date().toISOString(); const task: Task = { id: Date.now(), title: taskTitle.trim(), category: "Personal", priority: taskPriority, done: false, date: taskDate, reminderAt: reminderAt || undefined, createdAt }; if (reminderAt && "Notification" in window && Notification.permission === "default") void Notification.requestPermission().then((permission) => setNotificationReady(permission === "granted")); setTasks((current) => [...current, task]); addActivity("task_created", `Task dibuat: ${task.title}`, task.id); setTaskTitle(""); closeTaskForm(); }
  function toggleTask(id: number) { const task = tasks.find((item) => item.id === id); if (!task) return; setTasks((current) => current.map((item) => item.id === id ? { ...item, done: !item.done, completedAt: !item.done ? new Date().toISOString() : undefined } : item)); addActivity(task.done ? "task_reopened" : "task_completed", `${task.done ? "Task dibuka kembali" : "Task selesai"}: ${task.title}`, id); }
  const openNewTask = (date: string) => { setTaskDate(date); setReminderAt(""); setShowTaskForm(true); addActivity("page_viewed", `Membuka formulir task untuk jatuh tempo ${date}`); };
  return <div className="app-shell">
    {appNotification && <aside className="reminder-toast" role="alert" aria-live="assertive"><div className="reminder-bell"><Icon name="bell"/></div><div><small>{appNotification.kind === "timer" ? "FOCUS TIMER" : "TASK REMINDER"}</small><strong>{appNotification.title}</strong><span>{appNotification.message}</span></div><button onClick={() => setAppNotification(null)} aria-label="Tutup notifikasi">×</button></aside>}
    <button className="mobile-menu-button" onClick={() => setMobileNav(!mobileNav)} aria-label="Buka navigasi"><Icon name="menu" size={23}/></button>
    {mobileNav && <button className="nav-scrim" onClick={() => setMobileNav(false)} aria-label="Tutup navigasi"/>}
    <aside className={mobileNav ? "sidebar mobile-open" : "sidebar"}><div className="brand"><AnimeMark/><span>FocusFlowApp</span></div><nav className="main-nav">{([ ["overview", "grid", "Overview"], ["calendar", "calendar", "Calendar"], ["insights", "chart", "Insights"] ] as const).map(([target, icon, label]) => <button key={target} onClick={() => { setPage(target); setMobileNav(false); }} className={page === target ? "nav-item active" : "nav-item"}><Icon name={icon}/>{label}</button>)}</nav><div className="sidebar-bottom"><button onClick={() => { setPage("settings"); setMobileNav(false); }} className={page === "settings" ? "nav-item active" : "nav-item"}><Icon name="settings"/>Settings</button></div></aside>
    <main className="content">{page === "calendar" ? <CalendarView tasks={tasks} openNewTask={openNewTask}/> : page === "insights" ? <InsightsView tasks={tasks} focusSeconds={focusSeconds} insights={dailyInsights}/> : page === "settings" ? <SettingsView darkMode={darkMode} setDarkMode={setDarkMode} addActivity={addActivity}/> : <>
      <header className="topbar"><div><p className="eyebrow">PERSONAL DASHBOARD</p><h1>FocusFlow&apos;s App <span>✦</span></h1><p className="subtitle">Here&apos;s what you have planned for today.</p></div><div className="topbar-actions"><AnimeMark/><button className={`sync-button ${syncStatus}`} onClick={() => void handleManualSync()} disabled={syncStatus === "syncing" || !remoteReady} title={!SHEETS_URL ? "Tambahkan URL Google Sheets di file .env" : "Simpan data terbaru ke Google Sheets"}><Icon name="rotate" size={16}/><span>{syncStatus === "syncing" ? "Syncing..." : syncStatus === "success" ? "Synced" : syncStatus === "error" ? "Retry sync" : "Sync"}</span></button><button className="new-task" onClick={() => openNewTask(today)}><Icon name="plus" size={18}/>New task</button></div></header>
      <section className="stat-grid"><article><div className="stat-icon violet"><Icon name="check"/></div><div><span>Tasks completed</span><strong>{completed}<em> / {todayTasks.length}</em></strong></div></article><article><div className="stat-icon amber"><Icon name="target"/></div><div><span>Focus time</span><strong>{focusTimeLabel(focusSeconds)}</strong></div></article><article><div className="stat-icon pink"><Icon name="chart"/></div><div><span>Daily progress</span><strong>{progress}<em>%</em></strong></div></article></section>
      <div className="workspace-grid"><section className="tasks-card card"><div className="section-heading"><div><h2>Today&apos;s tasks</h2><p>{todayTasks.filter((task) => !task.done).length} tasks remaining</p></div></div><div className="filters">{["Today", "Completed"].map((item) => <button onClick={() => setFilter(item)} className={filter === item ? "selected" : ""} key={item}>{item}</button>)}</div><div className="task-list">{visibleTasks.length ? visibleTasks.map((task) => <div className={`task-row ${task.done ? "complete" : ""}`} key={task.id}><button className="checkbox" onClick={() => toggleTask(task.id)} aria-label={`Toggle ${task.title}`}>{task.done && "✓"}</button><div className="task-copy"><strong>{task.title}</strong><span>Created {dateLabel(createdDate(task))} · Due {taskDateDescription(task.date)}</span></div><span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span><div className="task-actions"><button className="more" onClick={() => setTaskMenu(taskMenu === task.id ? null : task.id)}><Icon name="more"/></button>{taskMenu === task.id && <div className="task-menu"><button onClick={() => toggleTask(task.id)}>{task.done ? "Mark active" : "Mark complete"}</button><button onClick={() => { setTasks((current) => current.filter((item) => item.id !== task.id)); addActivity("task_deleted", `Task dihapus: ${task.title}`, task.id); }}>Delete task</button></div>}</div></div>) : <p className="empty-tasks">No tasks for today.</p>}</div></section>
      <aside className="right-column"><section className="timer-card card"><div className="timer-heading"><div><h2>Focus timer</h2><p>{activePeriod ? `${activePeriod} is running` : "Stay in the zone"}</p></div></div><div className="timer-tabs">{(Object.keys(DURATIONS) as Period[]).map((item) => <button onClick={() => setPeriod(item)} className={period === item ? "active" : ""} key={item}>{item}</button>)}</div><div className="timer-wrap"><div className="timer-ring"><svg viewBox="0 0 168 168" aria-hidden="true"><circle className="ring-track" cx="84" cy="84" r="78"/><circle className="ring-progress" cx="84" cy="84" r="78" pathLength="100" style={{ strokeDasharray: `${timerRemainingPercent} 100` }}/></svg><span className="ring-marker" style={{ transform: `rotate(${timerRemainingPercent * 3.6}deg)` }}/><div><strong>{time}</strong><span>{period}</span></div></div></div><div className="timer-controls"><button className="reset" onClick={() => { if (activePeriod === period) { if (period === "Focus") { commitFocusSession(focusStartedAt); setFocusStartedAt(null); } setActivePeriod(null); setTimerEndAt(null); } setTimerValues((values) => ({ ...values, [period]: DURATIONS[period] })); addActivity("timer_reset", `Timer ${period} direset`); }}><Icon name="rotate"/></button><button className="start" onClick={() => { const stopping = activePeriod === period; if (stopping) { if (period === "Focus") { commitFocusSession(focusStartedAt); setFocusStartedAt(null); } setActivePeriod(null); setTimerEndAt(null); } else { const startedAt = Date.now(); if (activePeriod === "Focus") commitFocusSession(focusStartedAt); setActivePeriod(period); setTimerEndAt(startedAt + timerValues[period] * 1000); setFocusStartedAt(period === "Focus" ? startedAt : null); if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission().then((permission) => setNotificationReady(permission === "granted")); } addActivity(stopping ? "focus_paused" : "focus_started", `${period} ${stopping ? "dijeda" : "dimulai"}`); }}><Icon name={activePeriod === period ? "pause" : "play"}/>{activePeriod === period ? "Pause" : "Start"}</button></div></section><section className="quote-card"><span>“</span><div className="quote-content"><p>{QUOTES[quoteIndex].text}</p><small>— {QUOTES[quoteIndex].author}</small></div><div className="quote-controls"><button onClick={() => setQuoteIndex((quoteIndex - 1 + QUOTES.length) % QUOTES.length)}>←</button><button onClick={() => setQuoteIndex((quoteIndex + 1) % QUOTES.length)}>→</button></div></section></aside></div>
    </>}</main>
    {showTaskForm && <div className="modal-backdrop" onMouseDown={closeTaskForm}><form className="task-modal" onSubmit={addTask} onMouseDown={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={closeTaskForm}>×</button><p className="eyebrow">PLAN YOUR DAY</p><h2>New task</h2><label>Task title<input autoFocus value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="What needs to be done?"/></label><label>Due date<input type="date" value={taskDate} min={today} onChange={(event) => setTaskDate(event.target.value)}/></label><label>Reminder time<input type="time" value={reminderAt} onChange={(event) => setReminderAt(event.target.value)}/></label><label>Priority<select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as Priority)}><option>Low</option><option>Medium</option><option>High</option></select></label><button className="new-task" type="submit"><Icon name="plus"/>Add task</button></form></div>}
  </div>;
}

export default App;

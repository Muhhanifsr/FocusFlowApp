import { FormEvent, useEffect, useMemo, useState } from "react";
import "./App.css";

type Task = {
  id: number;
  title: string;
  category: string;
  due: string;
  priority: "High" | "Medium" | "Low";
  done: boolean;
  date: string;
};

const initialTasks: Task[] = [];
const jakartaDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

const Icon = ({ name, size = 20 }: { name: string; size?: number }) => {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    check: <><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    chart: <><path d="M3 3v18h18"/><path d="M7 16v-5M12 16V7M17 16v-8"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.1 2.1-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56v.1h-3v-.1A1.7 1.7 0 0 0 10.7 18.6a1.7 1.7 0 0 0-1.88.34l-.06.06-2.1-2.1.06-.06A1.7 1.7 0 0 0 7.06 15 1.7 1.7 0 0 0 5.5 14H5.4v-3h.1A1.7 1.7 0 0 0 7.06 10a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.1-2.1.06.06A1.7 1.7 0 0 0 10.7 6.36 1.7 1.7 0 0 0 11.73 4.8v-.1h3v.1a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.1 2.1-.06.06A1.7 1.7 0 0 0 19.4 10 1.7 1.7 0 0 0 21 11h.1v3H21A1.7 1.7 0 0 0 19.4 15Z"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    play: <path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none"/>,
    pause: <><path d="M8 5v14M16 5v14"/></>,
    rotate: <><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v5h5"/></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></>,
    target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></>,
    down: <path d="m6 9 6 6 6-6"/>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
};

function CalendarView({ tasks, openNewTask }: { tasks: Task[]; openNewTask: (date: string) => void }) {
  const now = new Date();
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selected, setSelected] = useState(now.getDate());
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => index + 1);
  const label = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const selectedLabel = new Date(year, month, selected).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const selectedDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(selected).padStart(2, "0")}`;
  const datedTasks = tasks.filter(task => task.date === selectedDate);
  return <section className="page-panel"><div className="page-heading"><div><p className="eyebrow">PLAN WITH INTENTION</p><h1>Calendar</h1><p className="subtitle">Choose a date to view and plan your tasks.</p></div><button className="new-task" onClick={() => openNewTask(selectedDate)}><Icon name="plus" size={18}/>Add task</button></div><div className="calendar-layout"><div className="calendar-card card"><div className="calendar-title"><button onClick={() => setCursor(new Date(year, month - 1, 1))}>‹</button><h2>{label}</h2><button onClick={() => setCursor(new Date(year, month + 1, 1))}>›</button></div><input className="date-jump" type="month" value={`${year}-${String(month + 1).padStart(2, "0")}`} onChange={event => { const [nextYear, nextMonth] = event.target.value.split("-").map(Number); setCursor(new Date(nextYear, nextMonth - 1, 1)); }} /><div className="weekday-row">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day => <span key={day}>{day}</span>)}</div><div className="month-grid">{Array.from({ length: firstDay }).map((_, index) => <i key={`blank-${index}`}/>)}{days.map(day => { const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`; return <button onClick={() => setSelected(day)} className={day === selected ? "today" : tasks.some(task => task.date === date) ? "has-item" : ""} key={day}>{day}</button>})}</div></div><aside className="agenda-card card"><h2>{selectedLabel}</h2><p className="muted">Tasks for this date</p>{datedTasks.length ? datedTasks.map(task => <div className="agenda-item" key={task.id}><b className={`dot ${task.category.toLowerCase()}`}/><div><strong>{task.title}</strong><span>{task.due}</span></div></div>) : <p className="empty-agenda">No tasks planned yet.</p>}<button className="add-agenda" onClick={() => openNewTask(selectedDate)}><Icon name="plus" size={16}/>Add task</button></aside></div></section>;
}

function InsightsView({ tasks, streak, focusSeconds }: { tasks: Task[]; streak: number; focusSeconds: number }) {
  const todayTasks = tasks.filter(task => task.date === jakartaDate());
  const completed = todayTasks.filter(task => task.done).length;
  const rate = todayTasks.length ? Math.round((completed / todayTasks.length) * 100) : 0;
  const focusDisplay = focusSeconds >= 3600 ? `${Math.floor(focusSeconds / 3600)}h ${Math.floor((focusSeconds % 3600) / 60)}m` : `${Math.floor(focusSeconds / 60)}m`;
  const [range, setRange] = useState("This week");
  const labels = range === "This week" ? ["Mon","Tue","Wed","Thu","Fri","Sat","Today"] : range === "This month" ? ["Week 1","Week 2","Week 3","Week 4","Today"] : ["Jan","Mar","May","Jul","Sep","Nov","Now"];
  const values = labels.map((_, index) => index === labels.length - 1 ? rate : [42, 70, 55, 88, 66, 35, 62][index] ?? 60);
  return <section className="page-panel"><div className="page-heading"><div><p className="eyebrow">YOUR PRODUCTIVITY</p><h1>Insights</h1><p className="subtitle">See your real-time daily progress and build better habits.</p></div><select className="period-select" value={range} onChange={event => setRange(event.target.value)}><option>This week</option><option>This month</option><option>This year</option></select></div><div className="insight-grid"><article className="insight-main card"><div><h2>Daily completion</h2><p className="muted">Tasks finished during {range.toLowerCase()}</p></div><div className="bar-chart">{values.map((value, index) => <div className={index === values.length - 1 ? "chart-day active" : "chart-day"} key={labels[index]}><i style={{ height: `${value}%` }}/><span>{labels[index]}</span></div>)}</div></article><article className="completion-card card"><div className="completion-ring" style={{ background: `conic-gradient(#7455dc ${rate * 3.6}deg, #f0edf5 0deg)` }}><span>{rate}%</span></div><h2>Today's progress</h2><p className="muted">{completed} of {todayTasks.length} tasks completed</p></article></div><div className="insight-summary card"><div><span>Focus time today</span><strong>{focusDisplay}</strong></div><div><span>Tasks created today</span><strong>{todayTasks.length}</strong></div><div><span>Completion rate</span><strong>{rate}%</strong></div><div><span>Current streak</span><strong>{streak} day{streak === 1 ? "" : "s"} {streak > 0 ? "🔥" : ""}</strong></div></div></section>;
}

function SettingsView({ darkMode, setDarkMode }: { darkMode: boolean; setDarkMode: (value: boolean) => void }) {
  return <section className="page-panel settings-page"><div className="page-heading"><div><p className="eyebrow">PERSONALIZE FOCUSFLOW</p><h1>Settings</h1><p className="subtitle">Set up your workspace exactly the way you need it.</p></div></div><div className="settings-card card"><div className="setting-row"><div><strong>Appearance</strong><span>Choose a theme that feels comfortable.</span></div><button className={darkMode ? "theme-toggle on" : "theme-toggle"} onClick={() => setDarkMode(!darkMode)} aria-label="Ganti mode terang atau gelap"><span className="theme-track"><i/></span><b>{darkMode ? "Dark mode" : "Light mode"}</b></button></div><div className="setting-row"><div><strong>Pomodoro focus duration</strong><span>Default duration for each focus session.</span></div><button className="setting-value">25 minutes <Icon name="down" size={15}/></button></div><div className="setting-row"><div><strong>Google Sheets</strong><span>Open your connected spreadsheet for task records.</span></div><a className="sheet-link" href="https://docs.google.com/spreadsheets/d/1rsTToV5dWZGgjSrWNzV4eUcVN4XCJSSty9yMsAZWvls/edit?usp=sharing" target="_blank" rel="noreferrer">Open spreadsheet ↗</a></div><div className="setting-row"><div><strong>Daily reminder</strong><span>Reminder to plan your day at 08:00.</span></div><button className="switch on" aria-label="Daily reminder"><i/></button></div></div></section>;
}

function App() {
  const [tasks, setTasks] = useState<Task[]>(() => {
    try { return JSON.parse(localStorage.getItem("focusflow-tasks") || "null") || initialTasks; } catch { return initialTasks; }
  });
  const [filter, setFilter] = useState("Today");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState<Task["priority"]>("Medium");
  const [taskDate, setTaskDate] = useState(jakartaDate());
  const [period, setPeriod] = useState<"Focus" | "Short Break" | "Long Break">("Focus");
  const [activePeriod, setActivePeriod] = useState<"Focus" | "Short Break" | "Long Break" | null>(null);
  const [timerValues, setTimerValues] = useState({ Focus: 25 * 60, "Short Break": 5 * 60, "Long Break": 15 * 60 });
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [page, setPage] = useState<"overview" | "calendar" | "insights" | "settings">("overview");
  const [darkMode, setDarkMode] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskMenu, setTaskMenu] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [mobileNav, setMobileNav] = useState(false);
  const [focusSeconds, setFocusSeconds] = useState(0);
  const jakartaHour = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", hour: "numeric", hour12: false }).format(new Date());
  const greeting = Number(jakartaHour) < 12 ? "Good morning" : Number(jakartaHour) < 18 ? "Good afternoon" : "Good evening";
  const quotes = [
    { text: "The key is not to prioritize what's on your schedule, but to schedule your priorities.", author: "Stephen Covey" },
    { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
    { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  ];

  const durations = { Focus: 25 * 60, "Short Break": 5 * 60, "Long Break": 15 * 60 };
  useEffect(() => {
    if (!activePeriod) return;
    const timer = window.setInterval(() => setTimerValues((current) => {
      const value = current[activePeriod];
      if (value <= 1) { setActivePeriod(null); return { ...current, [activePeriod]: durations[activePeriod] }; }
      return { ...current, [activePeriod]: value - 1 };
    }), 1000);
    return () => window.clearInterval(timer);
  }, [activePeriod]);

  useEffect(() => {
    if (activePeriod !== "Focus") return;
    const tracker = window.setInterval(() => setFocusSeconds((current) => current + 1), 1000);
    return () => window.clearInterval(tracker);
  }, [activePeriod]);

  useEffect(() => {
    const carousel = window.setInterval(() => setQuoteIndex((current) => (current + 1) % quotes.length), 5500);
    return () => window.clearInterval(carousel);
  }, [quotes.length]);

  useEffect(() => { document.documentElement.classList.toggle("dark", darkMode); }, [darkMode]);
  useEffect(() => { localStorage.setItem("focusflow-tasks", JSON.stringify(tasks)); }, [tasks]);

  useEffect(() => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
    const stored = JSON.parse(localStorage.getItem("focusflow-activity") || "[]") as string[];
    const activeDays = [...new Set([...stored, today])].sort().slice(-365);
    localStorage.setItem("focusflow-activity", JSON.stringify(activeDays));
    let count = 0, cursor = new Date(`${today}T00:00:00`);
    while (activeDays.includes(cursor.toLocaleDateString("en-CA"))) { count++; cursor.setDate(cursor.getDate() - 1); }
    setStreak(count);
  }, []);

  const todayTasks = useMemo(() => tasks.filter((task) => task.date === jakartaDate()), [tasks]);
  const visibleTasks = useMemo(() => filter === "Completed" ? todayTasks.filter((task) => task.done) : todayTasks, [filter, todayTasks]);
  const completed = todayTasks.filter((task) => task.done).length;
  const dailyProgress = todayTasks.length ? Math.round(completed / todayTasks.length * 100) : 0;
  const focusDisplay = focusSeconds >= 3600 ? `${Math.floor(focusSeconds / 3600)}h ${Math.floor((focusSeconds % 3600) / 60)}m` : `${Math.floor(focusSeconds / 60)}m`;
  const seconds = timerValues[period];
  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  function toggleTask(id: number) { setTasks((current) => current.map((task) => task.id === id ? { ...task, done: !task.done } : task)); }
  function addTask(event: FormEvent) {
    event.preventDefault();
    if (!taskTitle.trim()) return;
    setTasks((current) => [...current, { id: Date.now(), title: taskTitle.trim(), category: "Personal", due: taskDate === jakartaDate() ? "Today" : new Date(`${taskDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }), priority: taskPriority, done: false, date: taskDate }]);
    setTaskTitle("");
    setTaskPriority("Medium");
    setShowTaskForm(false);
  }
  function changePeriod(next: "Focus" | "Short Break" | "Long Break") { setPeriod(next); }

  return (
    <div className="app-shell">
      <button className="mobile-menu-button" onClick={() => setMobileNav(!mobileNav)} aria-label="Buka navigasi"><Icon name="menu" size={23}/></button>
      {mobileNav && <button className="nav-scrim" onClick={() => setMobileNav(false)} aria-label="Tutup navigasi"/>}
      <aside className={mobileNav ? "sidebar mobile-open" : "sidebar"}>
        <div className="brand"><span className="brand-mark"><span /></span><span>focusflow</span></div>
        <nav className="main-nav">
          <button onClick={() => { setPage("overview"); setMobileNav(false); }} className={page === "overview" ? "nav-item active" : "nav-item"}><Icon name="grid"/>Overview</button>
          <button onClick={() => { setPage("calendar"); setMobileNav(false); }} className={page === "calendar" ? "nav-item active" : "nav-item"}><Icon name="calendar"/>Calendar</button>
          <button onClick={() => { setPage("insights"); setMobileNav(false); }} className={page === "insights" ? "nav-item active" : "nav-item"}><Icon name="chart"/>Insights</button>
        </nav>
        <div className="sidebar-bottom"><button onClick={() => { setPage("settings"); setMobileNav(false); }} className={page === "settings" ? "nav-item active" : "nav-item"}><Icon name="settings"/>Settings</button></div>
      </aside>

      <main className="content">
        {page === "calendar" ? <CalendarView tasks={tasks} openNewTask={(date) => { setTaskDate(date); setShowTaskForm(true); }} /> : page === "insights" ? <InsightsView tasks={tasks} streak={streak} focusSeconds={focusSeconds} /> : page === "settings" ? <SettingsView darkMode={darkMode} setDarkMode={setDarkMode} /> : <>
        <header className="topbar"><div><p className="eyebrow">YOUR PERSONAL DASHBOARD</p><h1>{greeting}, Hanif <span>👋</span></h1><p className="subtitle">Here's what you have planned for today.</p></div><button className="new-task" onClick={() => { setTaskDate(jakartaDate()); setShowTaskForm(true); }}><Icon name="plus" size={18}/>New task</button></header>
        <section className="stat-grid"><article><div className="stat-icon violet"><Icon name="check"/></div><div><span>Tasks completed</span><strong>{completed}<em> / {todayTasks.length}</em></strong></div><div className="trend">↗ 12%</div></article><article><div className="stat-icon amber"><Icon name="target"/></div><div><span>Focus time</span><strong>{focusDisplay}</strong></div><div className="trend">Live</div></article><article><div className="stat-icon pink"><Icon name="chart"/></div><div><span>Daily progress</span><strong>{dailyProgress}<em>%</em></strong></div><div className="mini-bar"><i style={{ width: `${dailyProgress}%` }}/></div></article></section>
        <div className="workspace-grid">
          <section className="tasks-card card"><div className="section-heading"><div><h2>Today's tasks</h2><p>{todayTasks.filter(t => !t.done).length} tasks remaining</p></div></div><div className="filters">{["Today", "Completed"].map(item => <button onClick={() => setFilter(item)} className={filter === item ? "selected" : ""} key={item}>{item}</button>)}</div><div className="task-list">{visibleTasks.length ? visibleTasks.map(task => <div className={`task-row ${task.done ? "complete" : ""}`} key={task.id}><button className="checkbox" onClick={() => toggleTask(task.id)} aria-label={`Toggle ${task.title}`}>{task.done && "✓"}</button><div className="task-copy"><strong>{task.title}</strong><span><b className={`dot ${task.category.toLowerCase()}`}/>{task.category} <i>•</i> {task.due}</span></div><span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span><div className="task-actions"><button className="more" onClick={() => setTaskMenu(taskMenu === task.id ? null : task.id)} aria-label="Task options"><Icon name="more" size={20}/></button>{taskMenu === task.id && <div className="task-menu"><button onClick={() => toggleTask(task.id)}>{task.done ? "Mark active" : "Mark complete"}</button><button onClick={() => setTasks(tasks.filter(item => item.id !== task.id))}>Delete task</button></div>}</div></div>) : <p className="empty-tasks">No tasks for today. Plan one from the calendar or create a new task.</p>}</div></section>
          <aside className="right-column"><section className="timer-card card"><div className="timer-heading"><div><h2>Focus timer</h2><p>{activePeriod ? `${activePeriod} is running in the background` : "Stay in the zone"}</p></div><button className="timer-menu"><Icon name="more"/></button></div><div className="timer-tabs">{(Object.keys(durations) as Array<keyof typeof durations>).map(item => <button onClick={() => changePeriod(item)} className={period === item ? "active" : ""} key={item}>{item}</button>)}</div><div className="timer-wrap"><div className="timer-ring"><svg viewBox="0 0 190 190"><circle className="ring-track" cx="95" cy="95" r="82"/><circle className="ring-progress" cx="95" cy="95" r="82" style={{ strokeDashoffset: 515 - (515 * seconds / durations[period]) }}/></svg><div><strong>{time}</strong><span>{period === "Focus" ? "Focus session" : period}</span></div></div></div><div className="timer-controls"><button className="reset" onClick={() => { setTimerValues((current) => ({ ...current, [period]: durations[period] })); if (activePeriod === period) setActivePeriod(null); }}><Icon name="rotate" size={19}/></button><button className="start" onClick={() => setActivePeriod(activePeriod === period ? null : period)}><Icon name={activePeriod === period ? "pause" : "play"} size={18}/>{activePeriod === period ? "Pause" : activePeriod ? "Switch timer" : `Start ${period.toLowerCase()}`}</button></div><p className="session-note">🍅 <b>3</b> focus sessions completed today</p></section><section className="quote-card"><span>“</span><div className="quote-content" key={quoteIndex}><p>{quotes[quoteIndex].text}</p><small>— {quotes[quoteIndex].author}</small></div><div className="quote-controls"><button onClick={() => setQuoteIndex((quoteIndex - 1 + quotes.length) % quotes.length)} aria-label="Kutipan sebelumnya">←</button><div>{quotes.map((_, index) => <button key={index} className={index === quoteIndex ? "quote-dot active" : "quote-dot"} onClick={() => setQuoteIndex(index)} aria-label={`Kutipan ${index + 1}`}/>)}</div><button onClick={() => setQuoteIndex((quoteIndex + 1) % quotes.length)} aria-label="Kutipan selanjutnya">→</button></div></section></aside>
        </div></>}
      </main>{showTaskForm && <div className="modal-backdrop" onMouseDown={() => setShowTaskForm(false)}><form className="task-modal" onSubmit={addTask} onMouseDown={event => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setShowTaskForm(false)}>×</button><p className="eyebrow">PLAN YOUR DAY</p><h2>New task</h2><label>Task title<input autoFocus value={taskTitle} onChange={event => setTaskTitle(event.target.value)} placeholder="What needs to be done?" /></label><label>Due date<input type="date" value={taskDate} disabled={taskDate === jakartaDate()} onChange={event => setTaskDate(event.target.value)} /></label><label>Priority<select value={taskPriority} onChange={event => setTaskPriority(event.target.value as Task["priority"])}><option>Low</option><option>Medium</option><option>High</option></select></label><button className="new-task" type="submit"><Icon name="plus" size={18}/>Add task</button></form></div>}
    </div>
  );
}

export default App;

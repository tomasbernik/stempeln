import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

const TABLE = "stempeln_work_entries";
const isConfigured = SUPABASE_URL.startsWith("https://")
  && !SUPABASE_URL.includes("YOUR-PROJECT")
  && !SUPABASE_ANON_KEY.includes("YOUR-SUPABASE")
  && SUPABASE_ANON_KEY.length > 20;
const supabaseClient = isConfigured && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const STORAGE_KEY = "kikin-stempel-demo-v1";
const TYPE_LABELS = {
  work: "Arbeit",
  vacation: "Urlaub",
  sick: "Krankenstand",
  holiday: "Feiertag",
};

const INSTALL_DISMISSED_KEY = "stempeln-install-dismissed-at";
const INSTALL_DISMISS_DAYS = 14;

let session = null;
let entries = [];
let deferredInstallPrompt = null;

const $ = (selector) => document.querySelector(selector);
const controls = {
  loginView: $("#loginView"),
  mainView: $("#mainView"),
  editorPanel: $(".editor-panel"),
  email: $("#emailInput"),
  loginMessage: $("#loginMessage"),
  appMessage: $("#appMessage"),
  todayLabel: $("#todayLabel"),
  todayStatus: $("#todayStatus"),
  todayTimes: $("#todayTimes"),
  clockInButton: $("#clockInButton"),
  clockOutButton: $("#clockOutButton"),
  entryId: $("#entryIdInput"),
  date: $("#dateInput"),
  clockIn: $("#clockInInput"),
  clockOut: $("#clockOutInput"),
  breakMinutes: $("#breakInput"),
  type: $("#typeInput"),
  note: $("#noteInput"),
  month: $("#monthInput"),
  entriesList: $("#entriesList"),
  totalHours: $("#totalHours"),
  totalDays: $("#totalDays"),
  averageHours: $("#averageHours"),
  deleteButton: $("#deleteButton"),
  logoutButton: $("#logoutButton"),
  installPrompt: $("#installPrompt"),
  installText: $("#installText"),
  installButton: $("#installButton"),
  dismissInstallButton: $("#dismissInstallButton"),
};

function localDate(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function localMonth(date = new Date()) {
  return localDate(date).slice(0, 7);
}

function dateFromMonth(month, day) {
  return `${month}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

function toTimeInput(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function normalizeTimeInput(value) {
  const raw = String(value || "").trim().replace(".", ":");
  if (!raw) return "";

  let hourText;
  let minuteText;

  if (raw.includes(":")) {
    [hourText, minuteText = "0"] = raw.split(":");
  } else if (/^\d{1,2}$/.test(raw)) {
    hourText = raw;
    minuteText = "0";
  } else if (/^\d{3,4}$/.test(raw)) {
    hourText = raw.slice(0, -2);
    minuteText = raw.slice(-2);
  } else {
    return "";
  }

  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return "";
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function dateAndTimeToIso(date, time) {
  const normalizedTime = normalizeTimeInput(time);
  if (!date || !normalizedTime) return null;
  const [hour, minute] = normalizedTime.split(":").map(Number);
  const value = new Date(`${date}T00:00:00`);
  value.setHours(hour, minute, 0, 0);
  return value.toISOString();
}

function minutesFromIso(value) {
  const date = new Date(value);
  return date.getHours() * 60 + date.getMinutes();
}

function workedMinutes(entry) {
  if (entry.type !== "work" || !entry.clock_in || !entry.clock_out) return 0;
  let out = minutesFromIso(entry.clock_out);
  const into = minutesFromIso(entry.clock_in);
  if (out < into) out += 24 * 60;
  return Math.max(0, out - into - Number(entry.break_minutes || 0));
}

function formatDuration(minutes) {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${date}T12:00:00`));
}

function setMessage(text) {
  controls.appMessage.textContent = text;
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

function isIosSafari() {
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

function installDismissedRecently() {
  const dismissedAt = Number(localStorage.getItem(INSTALL_DISMISSED_KEY) || 0);
  if (!dismissedAt) return false;
  return Date.now() - dismissedAt < INSTALL_DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

function hideInstallPrompt() {
  controls.installPrompt.hidden = true;
}

function showInstallPrompt(mode) {
  if (isStandalone() || installDismissedRecently()) {
    hideInstallPrompt();
    return;
  }

  if (mode === "ios") {
    controls.installText.textContent = "In Safari teilen und „Zum Home-Bildschirm“ wählen.";
    controls.installButton.hidden = true;
  } else {
    controls.installText.textContent = "Stempeln zur Startseite hinzufügen.";
    controls.installButton.hidden = false;
  }

  controls.installPrompt.hidden = false;
}

function updateInstallPrompt() {
  if (isStandalone()) {
    hideInstallPrompt();
    return;
  }

  if (deferredInstallPrompt) {
    showInstallPrompt("prompt");
    return;
  }

  if (isIosSafari()) showInstallPrompt("ios");
}

function demoEntries() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
}

function saveDemoEntries(nextEntries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextEntries));
}

function userId() {
  return session?.user?.id || "demo";
}

async function loadSession() {
  if (!supabaseClient) {
    session = { user: { id: "demo", email: "demo" } };
    return;
  }

  const { data } = await supabaseClient.auth.getSession();
  session = data.session;
  supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
    session = nextSession;
    syncUi();
  });
}

async function signInWithGoogle() {
  if (!supabaseClient) {
    controls.loginMessage.textContent = "Supabase ist noch nicht eingerichtet.";
    return;
  }

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) controls.loginMessage.textContent = error.message;
}

async function signInWithEmail() {
  if (!supabaseClient) {
    controls.loginMessage.textContent = "Supabase ist noch nicht eingerichtet.";
    return;
  }

  const email = controls.email.value.trim();
  if (!email) {
    controls.loginMessage.textContent = "Bitte E-Mail eingeben.";
    return;
  }

  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  controls.loginMessage.textContent = error ? error.message : "Der Link wurde gesendet.";
}

async function signOut() {
  if (supabaseClient) await supabaseClient.auth.signOut();
  session = supabaseClient ? null : { user: { id: "demo", email: "demo" } };
  await syncUi();
}

async function fetchEntries() {
  if (!session) return [];

  const month = controls.month.value;
  const start = dateFromMonth(month, 1);
  const end = dateFromMonth(month, daysInMonth(month));

  if (!supabaseClient) {
    return demoEntries().filter((entry) => entry.work_date >= start && entry.work_date <= end);
  }

  const { data, error } = await supabaseClient
    .from(TABLE)
    .select("*")
    .gte("work_date", start)
    .lte("work_date", end)
    .order("work_date", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function saveEntry(entry) {
  if (!supabaseClient) {
    const current = demoEntries().filter((item) => item.id !== entry.id);
    saveDemoEntries([...current, entry]);
    return entry;
  }

  const payload = { ...entry, user_id: userId() };
  const { data, error } = await supabaseClient
    .from(TABLE)
    .upsert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteEntry(id) {
  if (!id) return;

  if (!supabaseClient) {
    saveDemoEntries(demoEntries().filter((entry) => entry.id !== id));
    return;
  }

  const { error } = await supabaseClient.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

function entryTimeValue(entry) {
  return new Date(entry.clock_in || entry.clock_out || `${entry.work_date}T00:00:00`).getTime();
}

function entriesForDate(date) {
  return entries
    .filter((entry) => entry.work_date === date)
    .sort((a, b) => entryTimeValue(b) - entryTimeValue(a));
}

function todayEntry() {
  return entriesForDate(localDate())[0];
}

function activeTodayEntry() {
  return entriesForDate(localDate()).find((entry) => entry.clock_in && !entry.clock_out);
}

function fillForm(entry = null) {
  controls.entryId.value = entry?.id || "";
  controls.date.value = entry?.work_date || localDate();
  controls.clockIn.value = toTimeInput(entry?.clock_in);
  controls.clockOut.value = toTimeInput(entry?.clock_out);
  controls.breakMinutes.value = String(entry?.break_minutes ?? 0);
  controls.type.value = entry?.type || "work";
  controls.note.value = entry?.note || "";
  controls.deleteButton.hidden = !entry?.id;
}

function entryForDate(date) {
  return entriesForDate(date)[0];
}

function readForm() {
  const loadedEntry = entries.find((entry) => entry.id === controls.entryId.value);
  const id = loadedEntry?.work_date === controls.date.value ? loadedEntry.id : crypto.randomUUID();

  return {
    id,
    user_id: userId(),
    work_date: controls.date.value,
    clock_in: dateAndTimeToIso(controls.date.value, controls.clockIn.value),
    clock_out: dateAndTimeToIso(controls.date.value, controls.clockOut.value),
    break_minutes: Number(controls.breakMinutes.value),
    type: controls.type.value,
    note: controls.note.value.trim(),
  };
}

function cleanTimeField(input) {
  const normalized = normalizeTimeInput(input.value);
  if (normalized) input.value = normalized;
  return !input.value.trim() || Boolean(normalized);
}

function renderToday() {
  const active = activeTodayEntry();
  const current = active || todayEntry();
  controls.todayLabel.textContent = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(`${localDate()}T12:00:00`));

  if (!current) {
    controls.todayStatus.textContent = "Noch nicht erfasst";
    controls.todayTimes.textContent = "";
    controls.clockInButton.disabled = false;
    controls.clockOutButton.disabled = true;
    return;
  }

  const inTime = toTimeInput(current.clock_in) || "--:--";
  const outTime = toTimeInput(current.clock_out) || "--:--";
  controls.todayStatus.textContent = active ? "Bei der Arbeit" : "Bereit";
  controls.todayTimes.textContent = `${inTime} - ${outTime}`;
  controls.clockInButton.disabled = Boolean(active);
  controls.clockOutButton.disabled = !active;
}

function renderEntries() {
  const sorted = [...entries].sort((a, b) => {
    const dateOrder = a.work_date.localeCompare(b.work_date);
    return dateOrder || entryTimeValue(a) - entryTimeValue(b);
  });
  controls.entriesList.replaceChildren();

  if (sorted.length === 0) {
    const empty = document.createElement("p");
    empty.className = "tiny";
    empty.textContent = "Dieser Monat ist noch leer.";
    controls.entriesList.append(empty);
    return;
  }

  for (const entry of sorted) {
    const item = document.createElement("button");
    item.className = "entry-item";
    item.type = "button";
    item.dataset.id = entry.id;
    item.innerHTML = `
      <span class="entry-main">
        <strong>${formatDate(entry.work_date)}</strong>
        <span>Kommen ${toTimeInput(entry.clock_in) || "--:--"} · Gehen ${toTimeInput(entry.clock_out) || "--:--"}</span>
        <span>${TYPE_LABELS[entry.type] || entry.type}</span>
      </span>
      <span class="entry-meta">${formatDuration(workedMinutes(entry))}</span>
    `;
    controls.entriesList.append(item);
  }
}

function renderSummary() {
  const workEntries = entries.filter((entry) => entry.type === "work");
  const total = workEntries.reduce((sum, entry) => sum + workedMinutes(entry), 0);
  const workDays = new Set(workEntries.map((entry) => entry.work_date));
  controls.totalHours.textContent = formatDuration(total);
  controls.totalDays.textContent = String(workDays.size);
  controls.averageHours.textContent = formatDuration(workDays.size ? Math.round(total / workDays.size) : 0);
}

function render() {
  renderToday();
  renderSummary();
  renderEntries();
}

async function refresh() {
  if (!session) return;
  entries = await fetchEntries();
  render();
}

async function syncUi() {
  const signedIn = Boolean(session);
  controls.loginView.hidden = signedIn;
  controls.mainView.hidden = !signedIn;
  controls.logoutButton.hidden = !signedIn || !supabaseClient;
  setMessage(supabaseClient ? "" : "Demo-Modus: Supabase-Konfiguration für die Datenbank ergänzen.");
  if (signedIn) {
    await refresh();
    fillForm(todayEntry());
  }
}

async function stamp(kind) {
  const now = new Date();
  const active = activeTodayEntry();

  if (kind === "out" && !active) return;

  const base = kind === "out" ? active : {
    id: crypto.randomUUID(),
    user_id: userId(),
    work_date: localDate(now),
    clock_in: null,
    clock_out: null,
    break_minutes: 0,
    type: "work",
    note: "",
  };

  if (kind === "in") base.clock_in = now.toISOString();
  if (kind === "out") base.clock_out = now.toISOString();

  await saveEntry(base);
  controls.month.value = localMonth(now);
  await refresh();
  fillForm(activeTodayEntry() || todayEntry());
}

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportRows() {
  return entries
    .sort((a, b) => {
      const dateOrder = a.work_date.localeCompare(b.work_date);
      return dateOrder || entryTimeValue(a) - entryTimeValue(b);
    })
    .map((entry) => [
      entry.work_date,
      toTimeInput(entry.clock_in),
      toTimeInput(entry.clock_out),
      entry.break_minutes,
      formatDuration(workedMinutes(entry)),
      TYPE_LABELS[entry.type] || entry.type,
      entry.note,
    ]);
}

function csvContent() {
  const header = ["Datum", "Kommen", "Gehen", "Pause (min)", "Gesamt", "Typ", "Notiz"];
  return [header, ...exportRows()].map((row) => row.map(csvEscape).join(";")).join("\n");
}

function downloadCsv() {
  const blob = new Blob([`\ufeff${csvContent()}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `zeiterfassung-${controls.month.value}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function shareCsv() {
  const file = new File([`\ufeff${csvContent()}`], `zeiterfassung-${controls.month.value}.csv`, {
    type: "text/csv",
  });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: "Zeiterfassung",
      text: `Zeiterfassung ${controls.month.value}`,
      files: [file],
    });
    return;
  }

  downloadCsv();
  setMessage("Die Datei wurde heruntergeladen. Am Handy kannst du sie über die Dateifreigabe senden.");
}

$("#googleLoginButton").addEventListener("click", signInWithGoogle);
$("#emailLoginButton").addEventListener("click", signInWithEmail);
$("#logoutButton").addEventListener("click", signOut);
$("#syncButton").addEventListener("click", async () => {
  await refresh();
  setMessage("Aktualisiert.");
});

controls.installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  hideInstallPrompt();
});

controls.dismissInstallButton.addEventListener("click", () => {
  localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now()));
  hideInstallPrompt();
});

controls.clockInButton.addEventListener("click", () => stamp("in"));
controls.clockOutButton.addEventListener("click", () => stamp("out"));
controls.clockIn.addEventListener("blur", () => cleanTimeField(controls.clockIn));
controls.clockOut.addEventListener("blur", () => cleanTimeField(controls.clockOut));

controls.date.addEventListener("change", () => {
  const existing = entryForDate(controls.date.value);
  if (existing) {
    fillForm(existing);
    return;
  }

  const loadedEntry = entries.find((entry) => entry.id === controls.entryId.value);
  if (loadedEntry?.work_date !== controls.date.value) {
    controls.entryId.value = "";
    controls.deleteButton.hidden = true;
  }
});

$("#entryForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!cleanTimeField(controls.clockIn) || !cleanTimeField(controls.clockOut)) {
    setMessage("Bitte Uhrzeit als HH:MM eingeben.");
    return;
  }

  const entry = readForm();
  await saveEntry(entry);
  controls.month.value = entry.work_date.slice(0, 7);
  await refresh();
  fillForm(entries.find((item) => item.id === entry.id));
  setMessage("Gespeichert.");
});

controls.deleteButton.addEventListener("click", async () => {
  if (!controls.entryId.value || !confirm("Diesen Eintrag löschen?")) return;
  await deleteEntry(controls.entryId.value);
  await refresh();
  fillForm();
});

controls.entriesList.addEventListener("click", (event) => {
  const item = event.target.closest(".entry-item");
  if (!item) return;
  fillForm(entries.find((entry) => entry.id === item.dataset.id));
  controls.editorPanel.scrollIntoView({ behavior: "smooth", block: "start" });
});

controls.month.addEventListener("change", refresh);
$("#exportCsvButton").addEventListener("click", downloadCsv);
$("#shareButton").addEventListener("click", shareCsv);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallPrompt();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  hideInstallPrompt();
});

const standaloneQuery = window.matchMedia("(display-mode: standalone)");
if (standaloneQuery.addEventListener) {
  standaloneQuery.addEventListener("change", updateInstallPrompt);
} else if (standaloneQuery.addListener) {
  standaloneQuery.addListener(updateInstallPrompt);
}

controls.month.value = localMonth();
fillForm();
await loadSession();
await syncUi();
updateInstallPrompt();

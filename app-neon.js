import { createStempelnClient } from "./neon-sdk.js";
import { NEON_AUTH_URL, NEON_DATA_API_URL } from "./neon-config.js";

const TABLE = "stempeln_work_entries";
const TARGET_HISTORY_TABLE = "stempeln_target_history";
const isConfigured = NEON_AUTH_URL.startsWith("https://")
  && NEON_DATA_API_URL.startsWith("https://")
  && !NEON_AUTH_URL.includes("YOUR-")
  && !NEON_DATA_API_URL.includes("YOUR-");
const neonClient = isConfigured
  ? createStempelnClient(NEON_AUTH_URL, NEON_DATA_API_URL)
  : null;

const STORAGE_KEY = "kikin-stempel-demo-v1";
const TARGET_HISTORY_KEY = "stempeln-target-history-v1";
const TARGET_HISTORY_MIGRATED_KEY = "stempeln-target-history-neon-v1";
const BALANCE_START_DATE = "2026-06-01";
const DEFAULT_TARGET_HISTORY = [
  { from: "0001-01-01", weeklyHours: 16.25, weekdayHours: [3.25, 3.25, 3.25, 3.25, 3.25] },
  { from: "2026-10-01", weeklyHours: 19.25, weekdayHours: [4.75, 3.25, 3.25, 3.25, 4.75] },
];
const COUNTED_DAY_TYPES = new Set(["work", "vacation", "sick", "holiday"]);
const CREDITED_ABSENCE_TYPES = new Set(["vacation", "sick", "holiday"]);
let targetHistoryPeriods = null;
const TYPE_LABELS = {
  work: "Arbeit",
  vacation: "Urlaub",
  sick: "Krank",
  holiday: "Feiertag",
};

const INSTALL_DISMISSED_KEY = "stempeln-install-dismissed-at";
const INSTALL_DISMISS_DAYS = 14;

let session = null;
let entries = [];
let deferredInstallPrompt = null;
let stampInProgress = false;

const $ = (selector) => document.querySelector(selector);
const controls = {
  loginView: $("#loginView"),
  mainView: $("#mainView"),
  editorPanel: $(".editor-panel"),
  entryMessage: $("#entryMessage"),
  email: $("#emailInput"),
  emailOtp: $("#emailOtpInput"),
  verifyEmailOtpButton: $("#verifyEmailOtpButton"),
  loginMessage: $("#loginMessage"),
  appMessage: $("#appMessage"),
  userInfo: $("#userInfo"),
  todayLabel: $("#todayLabel"),
  todayStatus: $("#todayStatus"),
  todayTimes: $("#todayTimes"),
  stampMessage: $("#stampMessage"),
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
  monthlyBalance: $("#monthlyBalance"),
  monthlyBalanceLabel: $("#monthlyBalanceLabel"),
  overtimeBalance: $("#overtimeBalance"),
  overtimeLabel: $("#overtimeLabel"),
  totalDays: $("#totalDays"),
  averageHours: $("#averageHours"),
  dailyTarget: $("#dailyTargetInput"),
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

function minutesFromTimeValue(value) {
  const normalized = normalizeTimeInput(value);
  if (!normalized) return 0;
  const [hours, minutes] = normalized.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeValueFromMinutes(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function workedMinutes(entry) {
  if (entry.type !== "work" || !entry.clock_in || !entry.clock_out) return 0;
  let out = minutesFromIso(entry.clock_out);
  const into = minutesFromIso(entry.clock_in);
  if (out < into) out += 24 * 60;
  return Math.max(0, out - into - Number(entry.break_minutes || 0));
}

function formatDuration(minutes) {
  const rounded = Math.round(minutes);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

function formatDecimalHours(minutes) {
  return (minutes / 60).toFixed(2).replace(".", ",");
}

function formatDurationWithDecimal(minutes) {
  return `${formatDuration(minutes)} (${formatDecimalHours(minutes)} h)`;
}

function formatSignedDuration(minutes) {
  const sign = minutes > 0 ? "+" : minutes < 0 ? "-" : "";
  return `${sign}${formatDuration(Math.abs(minutes))}`;
}

function selectedMonthRangeUntilToday() {
  const month = controls.month.value;
  const start = dateFromMonth(month, 1);
  const monthEnd = dateFromMonth(month, daysInMonth(month));
  const today = localDate();
  const yesterday = new Date(`${today}T12:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const previousDay = localDate(yesterday);

  if (month === localMonth()) return { start, end: previousDay >= start ? previousDay : "" };
  return { start, end: month < localMonth() ? monthEnd : "" };
}

function isWeekday(date) {
  const day = new Date(`${date}T12:00:00`).getDay();
  return day >= 1 && day <= 5;
}

function expectedMinutesUntil(dateStart, dateEnd) {
  return expectedMinutesForEntries(dateStart, dateEnd, []);
}

function entriesForRange(sourceEntries, dateStart, dateEnd) {
  if (!dateEnd || dateEnd < dateStart) return [];
  return sourceEntries.filter((entry) => entry.work_date >= dateStart && entry.work_date <= dateEnd);
}

function entriesGroupedByDate(sourceEntries) {
  const grouped = new Map();
  for (const entry of sourceEntries) {
    const dayEntries = grouped.get(entry.work_date) || [];
    dayEntries.push(entry);
    grouped.set(entry.work_date, dayEntries);
  }
  return grouped;
}

function creditedMinutesForDate(date, dayEntries) {
  const worked = dayEntries.reduce((sum, entry) => sum + workedMinutes(entry), 0);
  const hasCreditedAbsence = dayEntries.some((entry) => CREDITED_ABSENCE_TYPES.has(entry.type));
  return hasCreditedAbsence && isWeekday(date) ? Math.max(worked, dailyTargetMinutes(date)) : worked;
}

function displayedMinutes(entry) {
  if (CREDITED_ABSENCE_TYPES.has(entry.type) && isWeekday(entry.work_date)) return dailyTargetMinutes(entry.work_date);
  return workedMinutes(entry);
}

function creditedMinutes(sourceEntries) {
  let total = 0;
  for (const [date, dayEntries] of entriesGroupedByDate(sourceEntries)) {
    total += creditedMinutesForDate(date, dayEntries);
  }
  return Math.round(total);
}

function expectedMinutesForEntries(dateStart, dateEnd, sourceEntries) {
  if (!dateEnd) return 0;
  let count = 0;
  const cursor = new Date(`${dateStart}T12:00:00`);
  const end = new Date(`${dateEnd}T12:00:00`);

  while (cursor <= end) {
    const date = localDate(cursor);
    if (isWeekday(date)) count += dailyTargetMinutes(date);
    cursor.setDate(cursor.getDate() + 1);
  }

  return Math.round(count);
}

function balanceMinutes(sourceEntries, dateStart, dateEnd) {
  const periodEntries = entriesForRange(sourceEntries, dateStart, dateEnd);
  return creditedMinutes(periodEntries) - expectedMinutesForEntries(dateStart, dateEnd, periodEntries);
}

function localTargetHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(`${TARGET_HISTORY_KEY}:${userId()}`) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter((period) => /^\d{4}-\d{2}-\d{2}$/.test(period.from)
      && Number.isFinite(Number(period.weeklyHours))
      && Number(period.weeklyHours) > 0
      && Number(period.weeklyHours) <= 120)
      .map((period) => ({ from: period.from, weeklyHours: Number(period.weeklyHours) }));
  } catch {
    return [];
  }
}

function targetHistory() {
  const saved = targetHistoryPeriods ?? localTargetHistory();
  return [...DEFAULT_TARGET_HISTORY, ...saved].sort((a, b) => a.from.localeCompare(b.from));
}

async function fetchTargetHistoryFromNeon() {
  const { data, error } = await neonClient
    .from(TARGET_HISTORY_TABLE)
    .select("effective_from, weekly_hours")
    .order("effective_from", { ascending: true });
  if (error) throw error;
  return (data || []).map((period) => ({
    from: period.effective_from,
    weeklyHours: Number(period.weekly_hours),
  }));
}

async function loadTargetHistory() {
  const localPeriods = localTargetHistory();
  if (!neonClient) {
    targetHistoryPeriods = localPeriods;
    return;
  }

  let remotePeriods = await fetchTargetHistoryFromNeon();
  const fingerprint = JSON.stringify(localPeriods);
  const migratedKey = `${TARGET_HISTORY_MIGRATED_KEY}:${userId()}`;
  const alreadyMigrated = localStorage.getItem(migratedKey) === fingerprint;

  if (localPeriods.length && !alreadyMigrated) {
    const remoteByDate = new Map(remotePeriods.map((period) => [period.from, period.weeklyHours]));
    const missing = localPeriods.filter((period) => !remoteByDate.has(period.from));
    const conflicts = localPeriods.filter((period) => remoteByDate.has(period.from)
      && remoteByDate.get(period.from) !== period.weeklyHours);

    if (missing.length) {
      const { error } = await neonClient.from(TARGET_HISTORY_TABLE).insert(missing.map((period) => ({
        user_id: userId(),
        effective_from: period.from,
        weekly_hours: period.weeklyHours,
      })));
      if (error) throw error;
      remotePeriods = await fetchTargetHistoryFromNeon();
    }

    if (conflicts.length) {
      setMessage("Lokaler Stundenplan wurde wegen eines Konflikts nicht überschrieben. Die lokale Kopie bleibt erhalten.");
    } else {
      localStorage.setItem(migratedKey, fingerprint);
    }
  }

  targetHistoryPeriods = remotePeriods;
}

function dailyTargetMinutes(date) {
  const applicable = targetHistory().filter((period) => period.from <= date);
  const period = applicable[applicable.length - 1];
  const weekday = new Date(`${date}T12:00:00`).getDay();
  if (period.weekdayHours && weekday >= 1 && weekday <= 5) {
    return period.weekdayHours[weekday - 1] * 60;
  }
  return period.weeklyHours * 60 / 5;
}

function renderTargetHistory() {
  const list = $("#targetHistory");
  list.replaceChildren();
  for (const period of targetHistory()) {
    const item = document.createElement("li");
    const date = period.from === "0001-01-01" ? "Bis 30.09.2026" : `Ab ${period.from.split("-").reverse().join(".")}`;
    const distribution = period.weekdayHours
      ? ` · Mo ${formatDuration(period.weekdayHours[0] * 60)}, Di–Do ${formatDuration(period.weekdayHours[1] * 60)}, Fr ${formatDuration(period.weekdayHours[4] * 60)}`
      : "";
    item.textContent = `${date}: ${String(period.weeklyHours).replace(".", ",")} h/Woche${distribution}`;
    list.append(item);
  }
}

async function saveTargetPeriod(event) {
  event.preventDefault();
  const from = $("#targetFromInput").value;
  const weeklyHours = Number($("#weeklyHoursInput").value.replace(",", "."));
  const message = $("#targetMessage");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || from <= "2026-10-01"
      || !Number.isFinite(weeklyHours) || weeklyHours <= 0 || weeklyHours > 120) {
    message.textContent = "Bitte ein Datum nach dem 01.10.2026 und Wochenstunden zwischen 0 und 120 eingeben.";
    return;
  }
  const history = targetHistory();
  const previous = history.find((period) => period.from === from);
  if (from <= localDate() && !confirm("Diese Änderung betrifft vergangene Tage. Den Saldo ab diesem Datum neu berechnen?")) return;
  if (previous && !confirm("Für dieses Datum gibt es bereits einen Plan. Ersetzen?")) return;
  try {
    if (neonClient) {
      const { error } = await neonClient.from(TARGET_HISTORY_TABLE).upsert({
        user_id: userId(),
        effective_from: from,
        weekly_hours: weeklyHours,
      }, { onConflict: "user_id,effective_from" });
      if (error) throw error;
      targetHistoryPeriods = await fetchTargetHistoryFromNeon();
    } else {
      const saved = history.filter((period) => period.from > "2026-10-01" && period.from !== from);
      localStorage.setItem(`${TARGET_HISTORY_KEY}:${userId()}`, JSON.stringify([...saved, { from, weeklyHours }]));
      targetHistoryPeriods = localTargetHistory();
    }
    renderTargetHistory();
    renderSummary();
    message.textContent = neonClient
      ? "In Neon gespeichert. Frühere Tage behalten ihren bisherigen Stundenplan."
      : "Gespeichert. Frühere Tage behalten ihren bisherigen Stundenplan.";
  } catch {
    message.textContent = "Speichern fehlgeschlagen. Bitte erneut versuchen.";
  }
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

function setEntryMessage(text, tone = "") {
  controls.entryMessage.textContent = text;
  controls.entryMessage.dataset.tone = tone;
}

function setStampMessage(text, tone = "") {
  controls.stampMessage.textContent = text;
  controls.stampMessage.dataset.tone = tone;
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

function userDisplayName() {
  if (!session) return "";
  const metadata = session.user?.user_metadata || {};
  return metadata.full_name || metadata.name || session.user?.email || "Demo";
}

function updateUserInfo() {
  const name = userDisplayName();
  controls.userInfo.textContent = name ? `Angemeldet: ${name}` : "";
  controls.userInfo.hidden = !name;
}

function appSession(data) {
  return data?.session && data?.user ? { ...data.session, user: data.user } : null;
}

async function authPost(path, body) {
  const response = await fetch(`${NEON_AUTH_URL.replace(/\/$/, "")}/${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Better Auth can return an empty success response.
  }
  if (!response.ok) {
    throw new Error(
      payload?.message
        || payload?.error?.message
        || `Anmeldung fehlgeschlagen (${response.status}).`,
    );
  }
  return payload;
}

async function loadSession() {
  if (!neonClient) {
    session = { user: { id: "demo", email: "demo" } };
    return;
  }

  const { data, error } = await neonClient.auth.getSession({
    fetchOptions: { headers: { "X-Force-Fetch": "true" } },
  });
  if (error) throw error;
  session = appSession(data);
}

async function signInWithGoogle() {
  if (!neonClient) {
    controls.loginMessage.textContent = "Neon ist noch nicht eingerichtet.";
    return;
  }

  const { error } = await neonClient.auth.signIn.social({
    provider: "google",
    callbackURL: window.location.origin + window.location.pathname,
  });
  if (error) controls.loginMessage.textContent = error.message;
}

async function signInWithEmail() {
  if (!neonClient) {
    controls.loginMessage.textContent = "Neon ist noch nicht eingerichtet.";
    return;
  }

  const email = controls.email.value.trim();
  if (!email) {
    controls.loginMessage.textContent = "Bitte E-Mail eingeben.";
    return;
  }

  try {
    await authPost("email-otp/send-verification-otp", { email, type: "sign-in" });
    controls.loginMessage.textContent = "Der Code wurde gesendet.";
    controls.emailOtp.hidden = false;
    controls.verifyEmailOtpButton.hidden = false;
    controls.emailOtp.focus();
  } catch (error) {
    controls.loginMessage.textContent = error.message;
  }
}

async function verifyEmailOtp() {
  if (!neonClient) return;
  const email = controls.email.value.trim();
  const token = controls.emailOtp.value.trim();
  if (!email || !/^\d{6,10}$/.test(token)) {
    controls.loginMessage.textContent = "Bitte den Code aus der E-Mail eingeben.";
    return;
  }
  try {
    await authPost("sign-in/email-otp", { email, otp: token });
  } catch (error) {
    controls.loginMessage.textContent = error.message;
    return;
  }
  controls.loginMessage.textContent = "Angemeldet.";
  window.location.reload();
}

async function signOut() {
  if (neonClient) await neonClient.auth.signOut();
  session = neonClient ? null : { user: { id: "demo", email: "demo" } };
  await syncUi();
}

async function fetchEntries() {
  if (!session) return [];

  const month = controls.month.value;
  const monthStart = dateFromMonth(month, 1);
  const monthEnd = dateFromMonth(month, daysInMonth(month));
  const currentMonthEnd = dateFromMonth(localMonth(), daysInMonth(localMonth()));
  const start = monthStart < BALANCE_START_DATE ? monthStart : BALANCE_START_DATE;
  const end = monthEnd > currentMonthEnd ? monthEnd : currentMonthEnd;

  if (!neonClient) {
    return demoEntries().filter((entry) => entry.work_date >= start && entry.work_date <= end);
  }

  const { data, error } = await neonClient
    .from(TABLE)
    .select("*")
    .gte("work_date", start)
    .lte("work_date", end)
    .order("work_date", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function saveEntry(entry) {
  if (!neonClient) {
    const current = demoEntries().filter((item) => item.id !== entry.id);
    saveDemoEntries([...current, entry]);
    return entry;
  }

  const payload = { ...entry, user_id: userId() };
  const { data, error } = await neonClient
    .from(TABLE)
    .upsert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteEntry(id) {
  if (!id) return;

  if (!neonClient) {
    saveDemoEntries(demoEntries().filter((entry) => entry.id !== id));
    return;
  }

  const { error } = await neonClient.from(TABLE).delete().eq("id", id);
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
  updateEntryTypeFields();
}

function clearForm() {
  controls.entryId.value = "";
  controls.date.value = "";
  controls.clockIn.value = "";
  controls.clockOut.value = "";
  controls.breakMinutes.value = "0";
  controls.type.value = "work";
  controls.note.value = "";
  controls.deleteButton.hidden = true;
  updateEntryTypeFields();
}

function updateEntryTypeFields(clearValues = false) {
  const hasTimes = controls.type.value === "work";
  if (clearValues && !hasTimes) {
    controls.clockIn.value = "";
    controls.clockOut.value = "";
    controls.breakMinutes.value = "0";
  }
  controls.clockIn.disabled = !hasTimes;
  controls.clockOut.disabled = !hasTimes;
  controls.breakMinutes.disabled = !hasTimes;
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
    controls.clockInButton.disabled = stampInProgress;
    controls.clockOutButton.disabled = true;
    return;
  }

  const inTime = toTimeInput(current.clock_in) || "--:--";
  const outTime = toTimeInput(current.clock_out) || "--:--";
  controls.todayStatus.textContent = active ? "Bei der Arbeit" : "Bereit";
  controls.todayTimes.textContent = `${inTime} - ${outTime}`;
  controls.clockInButton.disabled = stampInProgress || Boolean(active);
  controls.clockOutButton.disabled = stampInProgress || !active;
}

function renderEntries() {
  const sorted = entriesForRange(
    entries,
    dateFromMonth(controls.month.value, 1),
    dateFromMonth(controls.month.value, daysInMonth(controls.month.value)),
  ).sort((a, b) => {
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
      <span class="entry-meta">${formatDurationWithDecimal(displayedMinutes(entry))}</span>
    `;
    controls.entriesList.append(item);
  }
}

function renderSummary() {
  const month = controls.month.value;
  const monthStart = dateFromMonth(month, 1);
  const monthEnd = dateFromMonth(month, daysInMonth(month));
  const monthEntries = entriesForRange(entries, monthStart, monthEnd);
  const countedEntries = monthEntries.filter((entry) => COUNTED_DAY_TYPES.has(entry.type));
  const total = creditedMinutes(monthEntries);
  const workDays = new Set(countedEntries.map((entry) => entry.work_date));
  const { end } = selectedMonthRangeUntilToday();
  const isCurrentMonth = month === localMonth();
  controls.dailyTarget.value = timeValueFromMinutes(Math.round(dailyTargetMinutes(monthStart)));
  controls.monthlyBalanceLabel.textContent = isCurrentMonth
    ? "Monatssaldo bis gestern"
    : "Monatssaldo bis Monatsende";
  controls.overtimeLabel.textContent = isCurrentMonth
    ? "Gesamtsaldo seit 01.06.2026 bis gestern"
    : "Gesamtsaldo seit 01.06.2026 bis Monatsende";
  controls.totalHours.textContent = formatDurationWithDecimal(total);
  controls.monthlyBalance.textContent = formatSignedDuration(balanceMinutes(entries, monthStart, end));
  controls.overtimeBalance.textContent = formatSignedDuration(balanceMinutes(entries, BALANCE_START_DATE, end));
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
  controls.logoutButton.hidden = !signedIn || !neonClient;
  updateUserInfo();
  setMessage(neonClient ? "" : "Demo-Modus: Neon-Konfiguration für die Datenbank ergänzen.");
  if (signedIn) {
    try {
      await loadTargetHistory();
      renderTargetHistory();
      await refresh();
      fillForm(todayEntry());
    } catch (error) {
      console.error(error);
      setMessage(error?.message || "Daten konnten nicht geladen werden.");
    }
  }
}

async function stamp(kind) {
  if (stampInProgress) return;

  const now = new Date();
  const active = activeTodayEntry();

  if (kind === "out" && !active) {
    setStampMessage("Kein offener Arbeitsbeginn gefunden. Bitte Daten aktualisieren.", "error");
    return;
  }

  const base = kind === "out" ? { ...active } : {
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

  const actionLabel = kind === "in" ? "Einstempeln" : "Ausstempeln";
  stampInProgress = true;
  renderToday();
  setStampMessage(`${actionLabel} wird gespeichert …`);

  try {
    const savedEntry = await saveEntry(base);
    entries = [...entries.filter((entry) => entry.id !== savedEntry.id), savedEntry];
    controls.month.value = localMonth(now);

    try {
      renderTargetHistory();
      await refresh();
    } catch (error) {
      console.error(error);
      render();
      fillForm(activeTodayEntry() || todayEntry());
      setStampMessage(`${actionLabel} wurde gespeichert. Die Ansicht konnte nicht aktualisiert werden.`, "success");
      return;
    }

    fillForm(activeTodayEntry() || todayEntry());
    setStampMessage(`${actionLabel} wurde gespeichert.`, "success");
  } catch (error) {
    console.error(error);
    setStampMessage(`${actionLabel} konnte nicht gespeichert werden. Bitte erneut versuchen.`, "error");
  } finally {
    stampInProgress = false;
    renderToday();
  }
}

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function exportReason(dayEntries) {
  const values = dayEntries
    .map((entry) => entry.note || (entry.type === "work" ? "" : TYPE_LABELS[entry.type] || entry.type))
    .filter(Boolean);
  return [...new Set(values)].join(", ");
}

function excelCell(value, className = "") {
  return `<td${className ? ` class="${className}"` : ""}>${htmlEscape(value)}</td>`;
}

function excelDayRows() {
  const month = controls.month.value;
  const dayCount = daysInMonth(month);
  const rows = [];

  for (let day = 1; day <= dayCount; day += 1) {
    const date = dateFromMonth(month, day);
    const dayEntries = entries
      .filter((entry) => entry.work_date === date)
      .sort((a, b) => entryTimeValue(a) - entryTimeValue(b));
    const intervals = dayEntries.slice(0, 3);
    const cells = [excelCell(day, "day")];

    for (let index = 0; index < 3; index += 1) {
      const entry = intervals[index];
      cells.push(excelCell(toTimeInput(entry?.clock_in), "time"));
      cells.push(excelCell(toTimeInput(entry?.clock_out), "time"));
    }

    const total = creditedMinutesForDate(date, dayEntries);
    cells.push(excelCell(formatDecimalHours(total), "number"));
    cells.push(excelCell("", "number"));
    cells.push(excelCell(exportReason(dayEntries), "reason"));
    rows.push(`<tr${isWeekday(date) ? "" : ' class="weekend"'}>${cells.join("")}</tr>`);
  }

  return rows.join("");
}

function excelContent() {
  const rows = excelDayRows();
  const person = userDisplayName();

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11pt; }
      th, td { border: 1px solid #000; padding: 2px 6px; height: 17px; }
      th { font-weight: 700; text-align: center; vertical-align: middle; }
      td { text-align: center; }
      .day { width: 38px; }
      .time { width: 60px; mso-number-format: "\\@"; }
      .number { width: 72px; mso-number-format: "0,00"; }
      .reason { width: 170px; text-align: left; }
      .weekend td { background: #d8e8bf; }
      .meta td { border: 0; font-weight: 700; text-align: left; }
      .datum { width: 38px; writing-mode: vertical-rl; transform: rotate(180deg); }
    </style>
  </head>
  <body>
    <table>
      <tr class="meta"><td colspan="10">Mitarbeiter: ${htmlEscape(person)}</td></tr>
      <tr class="meta"><td colspan="10">Monat: ${htmlEscape(controls.month.value)}</td></tr>
      <tr class="meta"><td colspan="10"></td></tr>
      <tr>
        <th rowspan="2" class="datum">Datum</th>
        <th colspan="2">Arbeitszeit</th>
        <th colspan="2">Arbeitszeit</th>
        <th colspan="2">Arbeitszeit</th>
        <th rowspan="2">Stunden<br>gesamt</th>
        <th rowspan="2">davon<br>TZ+VZ</th>
        <th rowspan="2">Grund / Einsatzort</th>
      </tr>
      <tr>
        <th>von</th>
        <th>bis</th>
        <th>von</th>
        <th>bis</th>
        <th>von</th>
        <th>bis</th>
      </tr>
      ${rows}
    </table>
  </body>
</html>`;
}

function excelFileName(now = new Date()) {
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-") + `_${[
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("-")}`;

  return `zeiterfassung-${controls.month.value}_${timestamp}.xls`;
}

function downloadExcel() {
  const blob = new Blob([excelContent()], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = excelFileName();
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function shareExcel() {
  setMessage("Excel-Datei für E-Mail wird vorbereitet.");
  const fileName = excelFileName();
  const file = new File([excelContent()], fileName, {
    type: "application/vnd.ms-excel;charset=utf-8",
  });

  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: "Zeiterfassung",
        text: `Zeiterfassung ${controls.month.value}`,
        files: [file],
      });
      return;
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      setMessage("E-Mail wurde abgebrochen.");
      return;
    }
    setMessage("E-Mail-Freigabe ist nicht verfügbar. Die Excel-Datei wird heruntergeladen.");
  }

  downloadExcel();
  setMessage("Die Excel-Datei wurde heruntergeladen. Am Handy kannst du sie über die Dateifreigabe senden.");
}

$("#googleLoginButton").addEventListener("click", signInWithGoogle);
$("#emailLoginButton").addEventListener("click", signInWithEmail);
controls.verifyEmailOtpButton.addEventListener("click", verifyEmailOtp);
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
controls.type.addEventListener("change", () => updateEntryTypeFields(true));

controls.date.addEventListener("change", () => {
  setEntryMessage("");
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
    setEntryMessage("Bitte Uhrzeit als HH:MM eingeben.", "error");
    return;
  }

  const entry = readForm();
  await saveEntry(entry);
  controls.month.value = entry.work_date.slice(0, 7);
  await refresh();
  clearForm();
  setEntryMessage("Gespeichert.", "success");
});

controls.deleteButton.addEventListener("click", async () => {
  if (!controls.entryId.value || !confirm("Diesen Eintrag löschen?")) return;
  await deleteEntry(controls.entryId.value);
  await refresh();
  fillForm();
  setEntryMessage("");
});

controls.entriesList.addEventListener("click", (event) => {
  const item = event.target.closest(".entry-item");
  if (!item) return;
  setEntryMessage("");
  fillForm(entries.find((entry) => entry.id === item.dataset.id));
  controls.editorPanel.scrollIntoView({ behavior: "smooth", block: "start" });
});

$("#targetForm").addEventListener("submit", saveTargetPeriod);
controls.month.addEventListener("change", refresh);
$("#exportCsvButton").addEventListener("click", downloadExcel);
$("#shareButton").addEventListener("click", shareExcel);

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

export const FIELDS = [
  { key: "minute", label: "Minute", min: 0, max: 59 },
  { key: "hour", label: "Hour", min: 0, max: 23 },
  { key: "dom", label: "Day of month", min: 1, max: 31 },
  { key: "month", label: "Month", min: 1, max: 12 },
  { key: "dow", label: "Day of week", min: 0, max: 7 },
];

export const MACROS = {
  "@hourly": { fields: ["0", "*", "*", "*", "*"], text: "At minute 0 of every hour." },
  "@daily": { fields: ["0", "0", "*", "*", "*"], text: "Every day at midnight (00:00)." },
  "@midnight": { fields: ["0", "0", "*", "*", "*"], text: "Every day at midnight (alias of @daily)." },
  "@weekly": { fields: ["0", "0", "*", "*", "0"], text: "Every Sunday at midnight (00:00)." },
  "@monthly": { fields: ["0", "0", "1", "*", "*"], text: "On the 1st of every month at midnight (00:00)." },
  "@yearly": { fields: ["0", "0", "1", "1", "*"], text: "On January 1 at midnight (00:00)." },
  "@annually": { fields: ["0", "0", "1", "1", "*"], text: "On January 1 at midnight (alias of @yearly)." },
  "@reboot": { fields: null, text: "Once at system startup, as handled by Ubuntu cron. Not a precise boot-ready time or a guarantee that the network, disks, or other services are ready. Use a systemd service with explicit dependencies for that." },
};

export const DEFAULT_JOB = {
  format: "user",
  schedule: "custom",
  fields: ["*/15", "*", "*", "*", "*"],
  username: "",
  label: "My first scheduled job",
  command: '/usr/bin/logger -t cron-learning "Hello from my scheduled job"',
  shell: "/bin/sh",
  path: "/usr/local/bin:/usr/bin:/bin",
  allowPercent: false,
};

export const PRESETS = {
  quarter: { label: "Every 15 minutes", fields: ["*/15", "*", "*", "*", "*"] },
  hourly: { label: "Hourly at :05", fields: ["5", "*", "*", "*", "*"] },
  morning: { label: "Daily at 09:00", fields: ["0", "9", "*", "*", "*"] },
  weekdays: { label: "Weekdays at 18:30", fields: ["30", "18", "*", "*", "1-5"] },
  monthly: { label: "1st of month at 08:00", fields: ["0", "8", "1", "*", "*"] },
};

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const unsafeLine = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const bytes = (value) => new TextEncoder().encode(value).length;

export function parseField(raw, field) {
  if (typeof raw !== "string" || !raw || raw.length > 200 || !/^[\d*,/-]+$/.test(raw)) {
    throw new Error(`${field.label}: use numbers, *, inclusive ranges (2-5), lists (1,3), or steps (*/2, 2-8/2). No spaces or names.`);
  }
  const values = new Set();
  for (const part of raw.split(",")) {
    const match = /^(\*|(\d{1,3})(?:-(\d{1,3}))?)(?:\/(\d{1,3}))?$/.exec(part);
    if (!match) throw new Error(`${field.label}: each list item must be a number, *, or a range, optionally with a range/wildcard step.`);
    const [, base, startText, endText, stepText] = match;
    if (stepText && base !== "*" && endText === undefined) {
      throw new Error(`${field.label}: put a step after * or a range, not a single number. Try */${Number(stepText) || 2}.`);
    }
    const start = base === "*" ? field.min : Number(startText);
    const end = base === "*" ? field.max : Number(endText ?? startText);
    if (start < field.min || end > field.max || start > end) {
      throw new Error(`${field.label}: values must be ${field.min}-${field.max}, with range start no greater than end.`);
    }
    const step = stepText === undefined ? 1 : Number(stepText);
    if (step < 1 || step > field.max - field.min + 1) {
      throw new Error(`${field.label}: step must be 1-${field.max - field.min + 1}. Larger steps are intentionally unsupported.`);
    }
    for (let value = start; value <= end; value += step) values.add(field.key === "dow" && value === 7 ? 0 : value);
  }
  return { raw, values: [...values].sort((a, b) => a - b), startsWithStar: raw.startsWith("*") };
}

export function parseSchedule(fields) {
  if (!Array.isArray(fields) || fields.length !== 5) throw new Error("A schedule needs exactly five fields.");
  return fields.map((raw, index) => parseField(raw, FIELDS[index]));
}

export function matchesDay(parsed, dom, dow) {
  const domMatch = parsed[2].values.includes(dom);
  const dowMatch = parsed[4].values.includes(dow === 7 ? 0 : dow);
  return parsed[2].startsWithStar || parsed[4].startsWithStar ? domMatch && dowMatch : domMatch || dowMatch;
}

export function hasUnescapedPercent(command) {
  let backslashes = 0;
  for (const char of command) {
    if (char === "%" && backslashes % 2 === 0) return true;
    backslashes = char === "\\" ? backslashes + 1 : 0;
  }
  return false;
}

function selection(parsed, allCount, name = String) {
  return parsed.values.length === allCount ? "every value" : parsed.values.map(name).join(", ");
}

export function explain(parsed) {
  const [minute, hour, dom, month, dow] = parsed;
  const useAnd = dom.startsWithStar || dow.startsWithStar;
  const dayRule = useAnd
    ? "BOTH day fields must match because at least one starts with * (including */steps)."
    : "EITHER day field may match (OR): day of month or day of week. A date matching both runs only once per matching minute.";
  const clauses = [
    `Minutes past the hour: ${selection(minute, 60)}.`,
    `Hours (24-hour clock): ${selection(hour, 24, (n) => `${String(n).padStart(2, "0")}:xx`)}.`,
    `Months: ${selection(month, 12, (n) => monthNames[n - 1])}.`,
    `Days of month: ${selection(dom, 31)}. Days of week: ${selection(dow, 7, (n) => dayNames[n])}.`,
    dayRule,
  ];
  return { text: clauses.join(" "), dayRule, useAnd };
}

function calendarPossible(parsed) {
  // A Gregorian 400-year cycle covers every month/day/weekday combination.
  for (let year = 2000; year < 2400; year++) {
    for (const month of parsed[3].values) {
      const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
      for (let day = 1; day <= count; day++) {
        if (matchesDay(parsed, day, new Date(Date.UTC(year, month - 1, day)).getUTCDay())) return true;
      }
    }
  }
  return false;
}

export function generate(job) {
  const errors = {};
  const warnings = [];
  let parsed;
  const macro = Object.hasOwn(MACROS, job.schedule) ? MACROS[job.schedule] : null;
  if (job.schedule !== "custom" && !macro) errors.schedule = "Choose a supported schedule or macro.";
  if (job.schedule === "custom") {
    if (!Array.isArray(job.fields) || job.fields.length !== 5) errors.schedule = "A schedule needs exactly five fields.";
    else {
      parsed = job.fields.map((raw, index) => {
        try { return parseField(raw, FIELDS[index]); }
        catch (error) { errors[FIELDS[index].key] = error.message; return null; }
      });
    }
  } else if (macro?.fields) parsed = parseSchedule(macro.fields);

  if (!["user", "system"].includes(job.format)) errors.format = "Choose user crontab or /etc/cron.d format.";
  if (job.format === "system" && (typeof job.username !== "string" || !/^[a-z_][a-z0-9_-]{0,31}\$?$/.test(job.username))) {
    errors.username = "Enter one existing Unix account, using lowercase letters, digits, _ or -, starting with a letter or _. This conservative subset supports up to 32 characters plus an optional final $. Verify it on Ubuntu with id; the app cannot check accounts.";
  }
  if (typeof job.label !== "string" || unsafeLine.test(job.label) || bytes(job.label) > 160) {
    errors.label = "Use a single-line label, at most 160 UTF-8 bytes, without control or invisible formatting characters.";
  }
  if (typeof job.command !== "string" || !job.command.trim() || unsafeLine.test(job.command) || bytes(job.command) > 998 || /^\s/.test(job.command) || /^[#*-]/.test(job.command)) {
    errors.command = "Enter one command line (1-998 UTF-8 bytes), without control characters or leading whitespace. Do not start with #, * or -. Put multiline logic in a script. Nothing is trimmed or rewritten.";
  } else if (hasUnescapedPercent(job.command)) {
    warnings.push("Unescaped % changes cron parsing even inside quotes: the first % ends the shell command; the remainder becomes standard input with % converted to newlines. For a literal percent, write \\% in the crontab. The app never rewrites your command.");
    if (!job.allowPercent) errors.command = "Unescaped % detected. Escape literal percent signs as \\%, or explicitly acknowledge intentional cron standard-input syntax below.";
  }
  const absolutePath = /^\/[A-Za-z0-9_./+-]+$/;
  if (typeof job.shell !== "string" || !absolutePath.test(job.shell) || bytes(job.shell) > 200) {
    errors.shell = "Use an absolute shell path without spaces, quotes or variables, e.g. /bin/sh. The app cannot check that it exists.";
  }
  if (typeof job.path !== "string" || !job.path || bytes(job.path) > 500 || !job.path.split(":").every((part) => absolutePath.test(part))) {
    errors.path = "Use colon-separated absolute directories, e.g. /usr/bin:/bin. No empty segments, spaces, quotes, $HOME, $PATH or ~ expansion.";
  }
  if (Object.keys(errors).length) return { ok: false, errors, warnings, output: "", explanation: "" };
  if (parsed && !calendarPossible(parsed)) warnings.push("This schedule has no matching calendar date (for example, February 31). It will never run.");
  if (job.schedule === "custom" && job.fields.some((field) => field.includes("/"))) {
    warnings.push("Steps restart inside each field, not from installation time. */35 minutes selects :00 and :35 each hour (then a 25-minute gap). Day-of-month steps start at 1; */2 selects 1,3,5,... and resets each month.");
  }
  if (job.format === "system") warnings.push("The account must already exist on the Ubuntu host. Use the least-privileged account; root is not a default recommendation.");
  const schedule = job.schedule === "custom" ? job.fields.join(" ") : job.schedule;
  const line = `${schedule}${job.format === "system" ? ` ${job.username}` : ""} ${job.command}`;
  const output = `# ${job.label || "Scheduled job"}\nSHELL=${job.shell}\nPATH=${job.path}\n${line}\n`;
  return {
    ok: true, errors, warnings, output, line, parsed,
    explanation: macro ? macro.text : explain(parsed).text,
    dayRule: parsed ? explain(parsed).dayRule : "",
  };
}

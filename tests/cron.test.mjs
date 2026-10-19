import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_JOB, FIELDS, MACROS, PRESETS, explain, generate, hasUnescapedPercent, matchesDay, parseField, parseSchedule } from "../src/cron.mjs";

const job = (overrides = {}) => ({ ...DEFAULT_JOB, fields: [...DEFAULT_JOB.fields], ...overrides });
const schedule = (fields) => parseSchedule(fields.split(" "));

for (const field of FIELDS) {
  test(`${field.label}: full bounds, range, list, step`, () => {
    assert.equal(parseField("*", field).values.length, field.key === "dow" ? 7 : field.max - field.min + 1);
    for (let n = field.min; n <= field.max; n++) {
      assert.deepEqual(parseField(String(n), field).values, [field.key === "dow" && n === 7 ? 0 : n]);
    }
    const range = parseField(`${field.min}-${field.max}/2`, field);
    assert.ok(range.values.length);
    assert.deepEqual(parseField(`${field.min},${field.min},${field.min + 1}`, field).values, [field.min, field.min + 1]);
    assert.deepEqual(parseField(`*/${field.max - field.min + 1}`, field).values, [field.min]);
  });
  test(`${field.label}: rejects out-of-bounds and malformed syntax`, () => {
    for (const invalid of [
      String(field.max + 1), String(field.min - 1), `${field.max}-${field.min}`,
      `${field.min}-${field.max + 1}`, "", " ", "1 2", "1\t2", "1\n2", "1,", ",1",
      "**", "*/0", "*/-1", `*/${field.max - field.min + 2}`, "*/999999999999999999999",
      "2/3", "1--2", "1,,2", "1-2/0", "1.5", "?", "L", "W", "MON", "JAN", "1~3",
      "1/2/3", "0;id", "\u200b*", null, 1, "*".repeat(201),
    ]) assert.throws(() => parseField(invalid, field), `${field.key}: ${invalid}`);
  });
}

test("lists, range steps, and Sunday aliases are exact", () => {
  assert.deepEqual(parseField("0-10/5,30,45-59/7", FIELDS[0]).values, [0, 5, 10, 30, 45, 52, 59]);
  assert.deepEqual(parseField("*/35", FIELDS[0]).values, [0, 35]);
  assert.deepEqual(parseField("*/2", FIELDS[2]).values, Array.from({ length: 16 }, (_, i) => i * 2 + 1));
  assert.deepEqual(parseField("0,7", FIELDS[4]).values, [0]);
  assert.deepEqual(parseField("5-7", FIELDS[4]).values, [0, 5, 6]);
});

test("schedule is exactly five fields", () => {
  for (const value of [null, "* * * * *", [], ["*"], Array(6).fill("*")]) assert.throws(() => parseSchedule(value));
});

test("DOM/DOW restricted fields use OR, never double execution", () => {
  const parsed = schedule("0 9 1 * 1");
  assert.equal(matchesDay(parsed, 1, 3), true);
  assert.equal(matchesDay(parsed, 2, 1), true);
  assert.equal(matchesDay(parsed, 1, 1), true);
  assert.equal(matchesDay(parsed, 2, 3), false);
  assert.match(explain(parsed).text, /EITHER.*OR/);
});

test("a syntactic leading star (including steps) switches to AND", () => {
  for (const fields of ["0 9 */2 * 1", "0 9 1-31/2 * *,1"]) {
    const parsed = schedule(fields);
    assert.equal(matchesDay(parsed, 2, 1), false);
    assert.equal(matchesDay(parsed, 1, 1), true);
    assert.match(explain(parsed).text, /BOTH/);
  }
  assert.equal(matchesDay(schedule("0 9 1-31 * 1"), 2, 3), true);
  assert.equal(matchesDay(schedule("0 9 *,1 * 1"), 2, 3), false);
  assert.equal(matchesDay(schedule("0 9 1,* * 1"), 2, 3), true);
  assert.equal(matchesDay(schedule("0 9 * * *"), 12, 7), true);
  assert.equal(matchesDay(schedule("0 9 * * 7"), 12, 0), true);
});

test("exact user and system output; command is never normalized", () => {
  const command = '/usr/bin/printf "hello  world" >> "$HOME/a.log" 2>&1  ';
  const result = generate(job({ command, label: "Hello # stays a comment" }));
  assert.equal(result.output, `# Hello # stays a comment\nSHELL=/bin/sh\nPATH=/usr/local/bin:/usr/bin:/bin\n*/15 * * * * ${command}\n`);
  const system = generate(job({ command, format: "system", username: "ubuntu" }));
  assert.equal(system.output, `# My first scheduled job\nSHELL=/bin/sh\nPATH=/usr/local/bin:/usr/bin:/bin\n*/15 * * * * ubuntu ${command}\n`);
  assert.equal(generate(job({ username: "ignored\nbad" })).ok, true);
  assert.equal(generate(job({ label: "" })).output.startsWith("# Scheduled job\n"), true);
  assert.ok(result.output.endsWith("\n"));
  assert.ok(!result.output.includes("\r"));
});

test("all macros are supported and system macros include username", () => {
  for (const macro of Object.keys(MACROS)) {
    const result = generate(job({ schedule: macro, fields: ["invalid"], format: "system", username: "nobody" }));
    assert.equal(result.ok, true, macro);
    assert.equal(result.line, `${macro} nobody ${DEFAULT_JOB.command}`);
    assert.ok(result.explanation);
  }
  assert.match(generate(job({ schedule: "@reboot" })).explanation, /network/);
  assert.equal(generate(job({ schedule: "@every" })).ok, false);
  assert.equal(generate(job({ schedule: "constructor" })).ok, false);
});

test("useful presets all generate a valid snippet", () => {
  for (const preset of Object.values(PRESETS)) assert.equal(generate(job({ fields: preset.fields })).ok, true, preset.label);
});

test("unescaped % is detected independent of shell quoting, with slash parity", () => {
  for (const command of ["date +%F", "date '+%F'", 'date "+%F"', "printf x%input", "date +\\\\%F"]) {
    assert.equal(hasUnescapedPercent(command), true, command);
    assert.equal(generate(job({ command })).ok, false);
    const intentional = generate(job({ command, allowPercent: true }));
    assert.equal(intentional.ok, true);
    assert.ok(intentional.warnings.some((w) => w.includes("even inside quotes")));
    assert.ok(intentional.output.includes(command));
  }
  for (const command of ["date +\\%F", "date '+\\%F'", "echo \\\\\\%"]) {
    assert.equal(hasUnescapedPercent(command), false, command);
    assert.equal(generate(job({ command })).ok, true);
  }
});

test("all multiline and invisible/control characters are rejected without repair", () => {
  for (const char of ["\n", "\r", "\r\n", "\t", "\0", "\x1b", "\x7f", "\u0085", "\u2028", "\u2029", "\u202e", "\u200b", "\ufeff"]) {
    for (const key of ["command", "label", "shell", "path"]) {
      const result = generate(job({ [key]: `${DEFAULT_JOB[key]}${char}* * * * * /bin/true` }));
      assert.equal(result.ok, false, `${key}: ${JSON.stringify(char)}`);
      assert.equal(result.output, "");
    }
  }
});

test("command prefix, empty and UTF-8 byte limit guard parser ambiguities", () => {
  for (const command of ["", " ", "#comment", "* mistaken", "-option", " leading", "/bin/echo " + "x".repeat(999)]) assert.equal(generate(job({ command })).ok, false, command);
  assert.equal(generate(job({ command: "x".repeat(998) })).ok, true);
  assert.equal(generate(job({ command: "é".repeat(499) })).ok, true);
  assert.equal(generate(job({ command: "é".repeat(500) })).ok, false);
  assert.equal(generate(job({ label: "x".repeat(161) })).ok, false);
});

test("command text is data, not JS, HTML, a shell sandbox, or an execution request", () => {
  const command = '/bin/echo "<img src=x onerror=alert(1)>"; $(something) `something` && :';
  assert.equal(generate(job({ command })).line, `*/15 * * * * ${command}`);
});

test("username is only required for system format and cannot inject fields", () => {
  for (const username of ["", "root /bin/true", "a\nb", "-root", "0", "A", "a:b", "x".repeat(33)]) {
    assert.equal(generate(job({ format: "system", username })).ok, false, username);
  }
  for (const username of ["root", "ubuntu", "my_user", "_agent", "worker-1", "machine$"]) {
    assert.equal(generate(job({ format: "system", username })).ok, true, username);
  }
  assert.equal(generate(job({ format: "invalid" })).ok, false);
});

test("environment output is explicit; no expansion, quotes, empty PATH parts or injection", () => {
  for (const shell of ["sh", "/bin/sh\nPATH=oops", "/bin/sh #", "/bin/sh;id", "/bin/my shell", ""]) assert.equal(generate(job({ shell })).ok, false);
  for (const path of ["", "/usr/bin:", ":/bin", "/usr/bin::/bin", "$HOME/bin:/bin", "~/bin", "/bin:.", '"/bin"', "/bin\n* * * * * evil"]) assert.equal(generate(job({ path })).ok, false, path);
  assert.equal(generate(job({ shell: "/bin/bash", path: "/opt/venv/bin:/usr/bin:/bin" })).ok, true);
});

test("calendar impossibility respects OR, leap years, and Sunday", () => {
  assert.ok(generate(job({ fields: ["0", "9", "31", "2", "*"] })).warnings.some((w) => w.includes("never run")));
  assert.ok(!generate(job({ fields: ["0", "9", "31", "2", "1"] })).warnings.some((w) => w.includes("never run")));
  assert.ok(!generate(job({ fields: ["0", "9", "29", "2", "*"] })).warnings.some((w) => w.includes("never run")));
  assert.ok(!generate(job({ fields: ["0", "9", "*", "*", "7"] })).warnings.some((w) => w.includes("never run")));
});

test("errors aggregate and suppress output rather than export stale content", () => {
  const result = generate(job({ fields: ["60", "24", "0", "13", "8"], shell: "sh", command: "bad\njob" }));
  for (const key of ["minute", "hour", "dom", "month", "dow", "shell", "command"]) assert.ok(result.errors[key], key);
  assert.equal(result.output, "");
});

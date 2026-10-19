import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_JOB, FIELDS, MACROS, generate, parseSchedule, matchesDay } from "../src/cron.mjs";

const isWindows = process.platform === "win32";
const parser = (input, format = "user") => {
  // stdin is always data. Never interpolate command text into a shell.
  const binary = isWindows ? "wsl.exe" : "./.ubuntu-fixture/parser";
  const args = isWindows ? ["-d", "Ubuntu-24.04", "--", "./.ubuntu-fixture/parser", format] : [format];
  const result = spawnSync(binary, args, { input, encoding: "utf8", timeout: 5000 });
  if (result.error) throw result.error;
  return result;
};
let checked = 0;
function compare(job) {
  const generated = generate(job);
  assert.equal(generated.ok, true, JSON.stringify(generated.errors));
  const result = parser(generated.output, job.format);
  assert.equal(result.status, 0, result.stderr);
  const actual = JSON.parse(result.stdout);
  assert.equal(actual.command, job.command);
  assert.equal(actual.shell, job.shell);
  assert.equal(actual.path, job.path);
  if (job.schedule !== "@reboot") {
    const fields = job.schedule === "custom" ? job.fields : MACROS[job.schedule].fields;
    const parsed = parseSchedule(fields);
    for (let i = 0; i < 5; i++) {
      const values = i === 4 ? actual.fields[i].filter((v) => v !== 7) : actual.fields[i];
      assert.deepEqual(values, parsed[i].values, fields.join(" "));
    }
    const and = Boolean(actual.flags & (1 | 2));
    for (let day = 1; day <= 31; day++) {
      for (let dow = 0; dow < 7; dow++) {
        const domMatch = actual.fields[2].includes(day);
        const dowMatch = actual.fields[4].includes(dow);
        assert.equal(matchesDay(parsed, day, dow), and ? domMatch && dowMatch : domMatch || dowMatch);
      }
    }
  } else assert.ok(actual.flags & 4);
  checked++;
}
const base = { ...DEFAULT_JOB, fields: [...DEFAULT_JOB.fields] };
compare(base);
for (let index = 0; index < 5; index++) {
  const field = FIELDS[index];
  for (let n = field.min; n <= field.max; n++) {
    const fields = Array(5).fill("*");
    fields[index] = String(n);
    compare({ ...base, fields });
  }
  for (const raw of ["*", `*/${field.max - field.min + 1}`, `${field.min}-${field.max}/2`, `${field.min},${field.max}`]) {
    const fields = Array(5).fill("*");
    fields[index] = raw;
    compare({ ...base, fields });
  }
}
for (const fields of [
  ["0", "9", "1", "*", "1"],
  ["0", "9", "*/2", "*", "1"],
  ["0", "9", "1-31", "*", "1"],
  ["0", "9", "*,1", "*", "1"],
  ["0", "9", "1,*", "*", "1"],
  ["0", "9", "1-31/2", "*", "*,1"],
  ["0-10/5,30", "2-18/4", "1,15", "2,4-6", "5-7"],
]) compare({ ...base, fields });
for (const schedule of Object.keys(MACROS)) {
  compare({ ...base, schedule });
  compare({ ...base, schedule, format: "system", username: "nobody" });
}
for (const command of [
  "/usr/bin/date '+\\%F'", "/usr/bin/date '+%F'", "/bin/echo 'hello  world'  ",
  "/usr/bin/printf a%input", "x".repeat(998), "é".repeat(499),
]) compare({ ...base, command, allowPercent: true });
compare({ ...base, shell: "/bin/bash", path: "/opt/test/bin:/usr/bin:/bin" });
assert.notEqual(parser(generate(base).output.slice(0, -1)).status, 0, "missing final newline must fail");
for (const fields of ["60 * * * *", "* 24 * * *", "* * 0 * *", "* * * 13 *", "* * * * 8", "* * * * */0"]) {
  assert.notEqual(parser(`${fields} /bin/true\n`).status, 0, fields);
}
assert.notEqual(parser("* * * * * nonexistent_cron_fixture_user /bin/true\n", "system").status, 0);
// Ensure the scheduler expression inspected in this baseline is still the one our day comparison represents.
const source = readFileSync(".ubuntu-fixture/source/cron.c", "utf8");
assert.match(source, /\(\(e->flags & DOM_STAR\) \|\| \(e->flags & DOW_STAR\)\)/);
assert.match(source, /\? \(bit_test\(e->dow,dow\) && bit_test\(e->dom,dom\)\)/);
assert.match(source, /: \(bit_test\(e->dow,dow\) \|\| bit_test\(e->dom,dom\)\)/);
console.log(`${checked} generated snippets match actual Ubuntu cron 3.0pl1-137ubuntu3 parser bits, command bytes, environment and DOM/DOW flags.`);
console.log("Also checked missing newline, invalid field bounds/zero step and unknown system account rejection. No jobs installed or executed.");

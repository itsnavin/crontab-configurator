# Ubuntu crontab configurator

[Open the app](https://itsnavin.github.io/crontab-configurator/) · [CI and deployment](https://github.com/itsnavin/crontab-configurator/actions/workflows/pages.yml)

A beginner-friendly static cron builder for Ubuntu learners, including Raspberry Pi users running Ubuntu. Choose a schedule, understand its calendar meaning, add a harmless command, then copy or download a **snippet** to review. There is no backend, account, analytics, persisted command history, or command execution. Hosting providers and browser extensions operate independently of the app.

## What it does

- Five numeric fields with `*`, inclusive ranges, lists, wildcard/range steps and explicit bounds/error messages. Presets for quarter-hourly, hourly, daily, weekdays and monthly jobs.
- Syntax-sensitive Ubuntu/Vixie day matching: restricted DOM/DOW use **OR**; a **leading** `*` in either day field (including `*/2`) changes the day tests to **AND**. `1-31` is not a syntactic wildcard. Sunday `0` and `7` are equivalent.
- Calendar macros: `@hourly`, `@daily` / `@midnight`, `@weekly`, `@monthly`, `@yearly` / `@annually`, and a clearly explained `@reboot`.
- User crontab versus `/etc/cron.d` format; only the latter includes a username. Explicit `SHELL` and `PATH`; separate job-label comment.
- Live text-only output, exact command preservation, clipboard failure feedback and UTF-8 downloads with the final LF newline. System download has no dot/extension; its MIME type prevents Chromium from adding `.txt`.
- No silent multiline/control-character repair or auto-escaping. Unescaped `%`, including quoted `%`, blocks export until corrected or explicitly acknowledged for cron standard-input syntax. Changing the command resets that acknowledgment.
- Responsive layout, keyboard-accessible controls, visible focus, native labels/details, associated validation errors and live status announcements.
- Installation guidance that preserves existing jobs, with permissions, shell environment, logging, overlap, timezone, DST, missed-job and alternative-scheduler notes.

## Try it locally

Install Node.js 22+ (CI uses Node 24), then:

```sh
npm ci
npm start
```

Open **http://127.0.0.1:43827**. The preview binds only to loopback. A dedicated port and no test-server reuse avoid testing another application's server. Stop it with Ctrl+C.

The deployed app has **no runtime dependencies or build-time service**. `npm run build` copies only `index.html`, `styles.css`, `favicon.svg` and `src/` into `dist/`. To preview that output, use `SERVE_DIST=1 npm start` in a POSIX shell, or `$env:SERVE_DIST='1'; npm start` in PowerShell. Serve it over HTTP(S), not `file://`, for JavaScript modules and clipboard support. Clipboard access requires a secure context or localhost and browser permission; download/manual selection is available when it fails.

## A safe first job

Start with **My user crontab** and **Every 15 min**:

```cron
# My first scheduled job
SHELL=/bin/sh
PATH=/usr/local/bin:/usr/bin:/bin
*/15 * * * * /usr/bin/logger -t cron-learning "Hello from my scheduled job"
```

The selected minutes are `:00`, `:15`, `:30` and `:45` each hour, **not** 15 minutes after installation. Use `journalctl -t cron-learning` on a host using the journal to inspect the message, or your configured system log.

1. On your Ubuntu host, run `crontab -l` without `sudo`. If it succeeds, back up to a **new, unused** filename, for example `crontab -l > "$HOME/crontab-backup-$(date +%Y%m%d-%H%M%S).txt"`. Verify success and inspect the backup. Stop on errors; distinguish an explicit "no crontab" message from access failures.
2. Run `crontab -e`. Keep your existing jobs. Add the reviewed comment and job line. Reconcile environment settings carefully: `SHELL`/`PATH` assignments affect **all following jobs**, not just the snippet.
3. Save and exit. Run `crontab -l` again to confirm both old and new jobs. Observe the next selected minute on the host.

**`crontab filename` replaces the entire current table; it does not append a job. Never blindly install this download with that command. `crontab -r` deletes the entire table.** Remove a single job with `crontab -e`. Do not edit spool files directly. The app never installs cron, starts/restarts services, or installs any generated job.

### System format

An administrator can instead review a **new** `/etc/cron.d/learning-job` file. Choose an existing least-privileged account; verify with `id username`. Its job line is `minute hour dom month dow username command`, or `@macro username command`. **Do not use this format in `crontab -e`.**

Under the baseline's default rules, filenames contain only ASCII letters, digits, `_` and `-`, **no dots**. Use a regular root-owned file (conventionally `root:root`), mode `0644`, not group/other-writable; executable permission is unnecessary. Preserve the final newline. Each file has its own environment and does not inherit `/etc/crontab` settings. Review existing files to avoid collisions; never install a system-format file using `crontab filename`. Files in `/etc/cron.daily` are a different mechanism: executable scripts.

### Before using your own command

Commands are **user-authored shell text**, not sandboxed or audited scripts. The app never runs or evaluates them. Use absolute paths and ensure the chosen account has appropriate file/directory/execution/log permissions. Cron is not a login shell; aliases, activated environments and shell profiles are not assumed. Use `cd /absolute/project && /absolute/script` for a specific working directory; select `/bin/bash` only when needed and present.

For literal percent signs, e.g. a date format, use `/usr/bin/date '+\%F'` inside a crontab. **Quotes do not protect `%` from cron.** The first unescaped `%` ends the shell command; the rest becomes stdin, with later percent signs converted to newlines. An odd run of backslashes immediately before `%` escapes it; an even run does not. Commands are not automatically rewritten. Put multiline logic in a script.

Output is mailed only if mail delivery is configured. A reviewed command can use `>> "$HOME/job.log" 2>&1` for an appended file log; `>` truncates instead. Check write permissions, privacy and rotation. Cron does not prevent overlapping jobs: consider `/usr/bin/flock -n "$HOME/.learning-job.lock" /absolute/script`, using a private, writable lock location. `-n` skips a busy invocation; it is not retry or recovery logic. Never put credentials in a crontab/public example.

## Compatibility and deliberate limits

**Baseline: Ubuntu 22.04 LTS (Jammy), `cron` source package `3.0pl1-137ubuntu3`**, Debian/Vixie-derived. The isolated source fixture pins and checksums that exact source and its Debian/Ubuntu patches. It is not Cronie, Quartz, Kubernetes cron, or every cron package available for Ubuntu. On your actual host, inspect `dpkg-query -W cron`, `man 5 crontab`, `man 1 crontab` and `man 8 cron`; security updates and alternate packages may differ.

- Numeric fields only, not month/day names, seconds, `?`, `L`, `W`, random ranges, or single-number steps such as `5/10`. Steps are restricted to `1..field size`; some cron parsers accept additional syntax. Bounds and ascending ranges are enforced even if another parser is lenient. Fields are at most 200 characters.
- Day syntax is preserved: `0 9 1 * 1` runs at 09:00 on the 1st **or** any Monday (once if both). `0 9 */2 * 1` runs only on Mondays falling on odd-numbered dates. `*,1` and `1,*` cover the same DOM values but have different wildcard flags. Impossible dates are warned about using a Gregorian 400-year cycle, not a next-execution prediction.
- Labels are single-line, at most 160 UTF-8 bytes. Commands are single-line, at most 998 UTF-8 bytes, with no leading whitespace or `#`, `*`, `-` ambiguity. Controls, invisible format characters, and Unicode line/paragraph separators are rejected, never stripped. Shell/PATH accept a conservative absolute-path subset without expansion, spaces, quoting or empty search-path segments.
- System usernames use a conservative lowercase Unix syntax subset, at most 32 characters plus an optional final `$`. This is not the universe of NSS/account names, nor a check that an account or shell exists. User-format jobs never emit a username.
- **No next-run preview.** The daemon's host timezone, not your browser, controls execution. Check `timedatectl` on the host. This baseline has no per-crontab scheduling timezone: `TZ` affects commands, not scheduling; do not assume `CRON_TZ` support.
- For clock changes under three hours, Ubuntu cron catches up skipped **fixed-time** jobs soon after a forward jump and avoids rerunning them on a backward jump. Wildcard minute/hour jobs follow the changed clock immediately; syntax matters. Larger corrections use the new time immediately. The app does not simulate DST, daemon uptime or runtime timing.
- Ordinary missed jobs while powered off/stopped are not automatically replayed. Anacron can catch up its configured daily/weekly/monthly jobs. systemd calendar timers with explicitly chosen persistence/dependencies may better fit catch-up or service integration.
- `@reboot` is a startup hook, not a network-ready/boot-ready promise, precise timestamp, periodic timer or service manager. Ubuntu's reboot-marker logic normally prevents rerunning these jobs on an ordinary daemon restart. Prefer a systemd service with explicit dependencies for managed startup work.
- Clipboard/download availability depends on browser policies. GitHub Pages hosts the public assets; content entered in the builder is never sent by the app, but browser extensions, OS tooling and hosting access logs are outside its control. No local/session storage or service worker is used.

## Validation

```sh
npm test
npm run build
npx playwright install chromium firefox
npm run test:browser
```

The 25 focused unit tests cover every allowed field value and both bounds of all fields, ranges/lists/steps, malformed input, syntax-sensitive DOM/DOW, Sunday aliases, macros/presets, impossible dates, percent/slash parity, UTF-8 lengths, newline/control injection, username/environment restrictions and exact user/system output.

The 30 browser cases run in desktop Chromium, mobile Chromium (Pixel 7 emulation) and desktop Firefox. They cover responsive overflow, keyboard entry/labels, live validation/recovery, presets, macros/system username, day semantics, percent acknowledgment reset, literal HTML rendering, exact downloaded bytes/final newline/system filename, clipboard success/denial, no stored history and a strict static-only network check. Mobile emulation is not physical-device testing. Clipboard tests simulate granted/denied access; they do not prove every OS clipboard integration.

For a real Ubuntu parser comparison on Linux (GCC, libc development headers, curl and dpkg-source required):

```sh
sh scripts/ubuntu-fixture.sh
npm run test:ubuntu
```

The fixture downloads checksum-pinned Ubuntu source archives, applies the package's patches with `dpkg-source`, and links only parser/environment/utility objects into a small stdin-to-JSON executable. **It never installs the cron package, invokes `crontab`, builds/runs a daemon, schedules a job or executes a generated command.** Only temporary fixture files inside the ignored `.ubuntu-fixture/` directory are used. On Windows the integration test can call the fixture through an existing `Ubuntu-24.04` WSL distribution after compiling it there.

**186 generated fixtures** compare the actual Ubuntu parser's selected bits, DOM/DOW flags, exact stored command text, shell and PATH with the JavaScript generator. All individual field values, representative steps/ranges/lists, mixed wildcard ordering, all macros and both formats are included. Every date/weekday pair is checked against parsed day flags. Negative cases cover missing final newline, bounds, zero steps and a nonexistent system username. The baseline scheduler's AND/OR expression is also checked in the extracted source.

**Not runtime-validated:** no scheduled command is ever executed; actual shell correctness, `%` stdin delivery, daemon DST/clock jumps, service startup/network readiness, mail/log delivery, host accounts/permissions, or every Ubuntu release are not end-to-end tested. Percent behavior and DST notes are based on the official manual/source; a successful parser test is not a guarantee a job will run successfully on your machine.

Local validation used Windows browsers plus the exact Ubuntu source fixture compiled under Ubuntu 24.04 WSL. The local machine's AdGuard injects its own `local.adguard.org` requests into test browsers; the privacy test intentionally reports these instead of silently allowing them. The clean GitHub Actions browser suite is the authoritative static-only network check; no host security software is disabled or bypassed.

## Publishing

GitHub Pages URL: **https://itsnavin.github.io/crontab-configurator/**

`.github/workflows/pages.yml` runs unit tests, builds the static output, compiles/checks the isolated Ubuntu fixture, then runs all three browser projects. Pull requests/branches are checked but do not deploy. A successful `main` build uploads **only `dist/`**, then deploys through GitHub's Pages environment using scoped `pages:write` / `id-token:write` permissions. No secrets or user-command input are used by CI. Enable **Settings → Pages → Source: GitHub Actions** once for a fork/new repository. See the Actions run for the actual revision and deployment status.

## Official references

- Ubuntu [crontab(5)](https://manpages.ubuntu.com/manpages/jammy/man5/crontab.5.html): file syntax, environment, macros, percent, limitations and final newline.
- Ubuntu [crontab(1)](https://manpages.ubuntu.com/manpages/jammy/man1/crontab.1.html): listing, editing and replacement behavior.
- Ubuntu [cron(8)](https://manpages.ubuntu.com/manpages/jammy/man8/cron.8.html): `/etc/cron.d`, naming/ownership, timezone and clock-change behavior.
- [Ubuntu package source](https://launchpad.net/ubuntu/+source/cron/3.0pl1-137ubuntu3) and [archive files](https://archive.ubuntu.com/ubuntu/pool/main/c/cron/): exact parser baseline. Other releases' online manual alternatives can describe a different cron implementation; always verify the package on the host.

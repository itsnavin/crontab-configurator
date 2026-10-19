import { test, expect } from "@playwright/test";
import { DEFAULT_JOB, generate } from "../../src/cron.mjs";

test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("live initial preview, preset and no horizontal page overflow", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Right on schedule");
  await expect(page.locator("#output")).toHaveText(generate(DEFAULT_JOB).output, { useInnerText: false });
  await page.getByRole("button", { name: "Weekdays", exact: true }).click();
  await expect(page.locator("#output")).toContainText("30 18 * * 1-5");
  await expect(page.locator("#explanation")).toContainText("Monday, Tuesday, Wednesday, Thursday, Friday");
  await expect(page.getByRole("button", { name: "Weekdays", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("invalid fields block both exports and clear stale preview, then recover", async ({ page }) => {
  await page.getByLabel("Minute", { exact: true }).fill("60");
  await expect(page.getByLabel("Minute", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#minute-error")).toContainText("0-59");
  await expect(page.getByRole("button", { name: "Copy snippet" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Download", exact: true })).toBeDisabled();
  await expect(page.locator("#output")).not.toContainText(DEFAULT_JOB.command);
  await page.getByLabel("Minute", { exact: true }).fill("0-20/10,45");
  await expect(page.getByRole("button", { name: "Copy snippet" })).toBeEnabled();
});

test("system format and macros use the username only where appropriate", async ({ page }) => {
  await page.getByRole("radio", { name: "System file: /etc/cron.d" }).check();
  await expect(page.getByRole("button", { name: "Copy snippet" })).toBeDisabled();
  await page.getByLabel("Run as existing user").fill("ubuntu");
  await page.getByLabel("Schedule type").selectOption("@reboot");
  await expect(page.locator("#fields-group")).toBeHidden();
  await expect(page.locator("#output")).toContainText("@reboot ubuntu /usr/bin/logger");
  await expect(page.locator("#explanation")).toContainText("network");
  await page.getByRole("radio", { name: "My user crontab" }).check();
  await expect(page.locator("#output")).not.toContainText("ubuntu");
});

test("DOM/DOW explanations preserve syntax-sensitive wildcard behavior", async ({ page }) => {
  await page.getByLabel("Day of month", { exact: true }).fill("1");
  await page.getByLabel("Day of week", { exact: true }).fill("1");
  await expect(page.locator("#explanation")).toContainText("EITHER");
  await page.getByLabel("Day of month", { exact: true }).fill("*/2");
  await expect(page.locator("#explanation")).toContainText("BOTH");
  await expect(page.locator("#explanation")).toContainText("1, 3, 5");
});

test("percent acknowledgment is explicit and resets when the command changes", async ({ page }) => {
  await page.getByLabel("Your command", { exact: true }).fill("/usr/bin/date '+%F'");
  await expect(page.locator("#command-error")).toContainText("Unescaped %");
  await page.locator("#allowPercent").check();
  await expect(page.getByRole("button", { name: "Copy snippet" })).toBeEnabled();
  await page.getByLabel("Your command", { exact: true }).fill("/usr/bin/date '+%T'");
  await expect(page.locator("#allowPercent")).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Copy snippet" })).toBeDisabled();
  await page.getByLabel("Your command", { exact: true }).fill("/usr/bin/date '+\\%F'");
  await expect(page.getByRole("button", { name: "Copy snippet" })).toBeEnabled();
});

test("multiline commands are rejected and HTML is displayed literally", async ({ page }) => {
  await page.getByLabel("Your command", { exact: true }).fill("/bin/true\n* * * * * /bin/false");
  await expect(page.getByRole("button", { name: "Download", exact: true })).toBeDisabled();
  await page.getByLabel("Your command", { exact: true }).fill('/bin/echo "<img src=x onerror=alert(1)>"');
  await expect(page.locator("#output")).toContainText("<img src=x onerror=alert(1)>");
  await expect(page.locator("#preview img")).toHaveCount(0);
});

test("downloads preserve exact bytes, newline and safe system filename", async ({ page }) => {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("crontab-snippet.txt");
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString("utf8")).toBe(generate(DEFAULT_JOB).output);
  await page.getByRole("radio", { name: "System file: /etc/cron.d" }).check();
  await page.getByLabel("Run as existing user").fill("ubuntu");
  const systemDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  expect((await systemDownload).suggestedFilename()).toBe("learning-job");
});

test("clipboard success and denied clipboard are announced, never silent", async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.copiedSnippet = text; } } });
  });
  await page.getByRole("button", { name: "Copy snippet" }).click();
  await expect(page.locator("#export-status")).toContainText("including the final newline");
  expect(await page.evaluate(() => window.copiedSnippet)).toBe(generate(DEFAULT_JOB).output);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Denied"); } } });
  });
  await page.getByRole("button", { name: "Copy snippet" }).click();
  await expect(page.locator("#export-status")).toContainText("Download the snippet instead");
});

test("keyboard entry point, accessible labels, examples and environment controls", async ({ page }) => {
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to schedule builder" })).toBeFocused();
  await page.getByLabel("Try a safe example").selectOption("uptime");
  await expect(page.getByLabel("Your command", { exact: true })).toHaveValue('/usr/bin/uptime >> "$HOME/cron-uptime.log" 2>&1');
  await page.getByText("Shell & command search path", { exact: true }).click();
  await page.getByLabel("PATH", { exact: true }).fill("$HOME/bin");
  await expect(page.locator("#path-error")).toContainText("absolute directories");
  await expect(page.locator("#validation-summary")).toContainText("1 field");
});

test("no network requests beyond static assets and no browser errors", async ({ page }) => {
  const errors = [];
  const requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));
  await page.reload();
  await page.getByLabel("Your command", { exact: true }).fill('/usr/bin/echo "private local text"');
  await page.getByLabel("Minute", { exact: true }).fill("*/5");
  expect(errors).toEqual([]);
  expect(requests.filter((url) => !url.startsWith("http://127.0.0.1:43827/"))).toEqual([]);
  expect(requests.some((url) => url.includes("private"))).toBe(false);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

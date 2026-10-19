import { DEFAULT_JOB, FIELDS, PRESETS, generate } from "./cron.mjs";

const $ = (id) => document.getElementById(id);
const form = $("cron-form");
const samples = {
  hello: { label: "A hello from cron", command: '/usr/bin/logger -t cron-learning "Hello from my scheduled job"' },
  uptime: { label: "Record uptime", command: '/usr/bin/uptime >> "$HOME/cron-uptime.log" 2>&1' },
  disk: { label: "Record free disk space", command: '/usr/bin/df -h / >> "$HOME/cron-disk.log" 2>&1' },
};
let result;

function readJob() {
  return {
    ...DEFAULT_JOB,
    format: form.elements.format.value,
    schedule: $("schedule").value,
    fields: FIELDS.map(({ key }) => $(key).value),
    ...Object.fromEntries(["username", "label", "command", "shell", "path"].map((key) => [key, $(key).value])),
    allowPercent: $("allowPercent").checked,
  };
}

function update() {
  const job = readJob();
  $("username-group").hidden = job.format !== "system";
  $("username").disabled = job.format !== "system";
  $("fields-group").disabled = job.schedule !== "custom";
  $("fields-group").hidden = job.schedule !== "custom";
  result = generate(job);
  for (const key of [...FIELDS.map(({ key }) => key), "username", "label", "command", "shell", "path", "schedule"]) {
    $(`${key}-error`).textContent = result.errors[key] || "";
    $(key).setAttribute("aria-invalid", String(Boolean(result.errors[key])));
    if (result.errors[key]) $(key).closest("details")?.setAttribute("open", "");
  }
  $("output").textContent = result.ok ? result.output : "# Fix the highlighted fields to generate a snippet.";
  $("explanation").textContent = result.ok ? result.explanation : "Your explanation will appear here when all fields are valid.";
  $("copy").disabled = !result.ok;
  $("download").disabled = !result.ok;
  $("validity").textContent = result.ok ? "Ready to review" : "Needs a change";
  $("validity").classList.toggle("invalid", !result.ok);
  $("format-caption").textContent = job.format === "user" ? "USER CRONTAB · SCHEDULE + COMMAND" : "/ETC/CRON.D · SCHEDULE + USERNAME + COMMAND";
  $("validation-summary").textContent = result.ok ? "" : `${Object.keys(result.errors).length} field(s) need attention. Copy and download are unavailable until they are fixed.`;
  $("warnings").replaceChildren(...result.warnings.map((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    return li;
  }));
  $("warnings-box").hidden = !result.warnings.length;
  $("export-status").textContent = "";
  document.querySelectorAll("[data-preset]").forEach((button) => {
    const selected = job.schedule === "custom" && PRESETS[button.dataset.preset].fields.every((field, index) => field === job.fields[index]);
    button.setAttribute("aria-pressed", String(selected));
  });
}

form.addEventListener("submit", (event) => event.preventDefault());
form.addEventListener("input", update);
form.addEventListener("change", update);
document.querySelectorAll("[data-preset]").forEach((button) => {
  button.addEventListener("click", () => {
    $("schedule").value = "custom";
    PRESETS[button.dataset.preset].fields.forEach((field, index) => { $(FIELDS[index].key).value = field; });
    update();
  });
});
$("sample").addEventListener("change", () => {
  const sample = samples[$("sample").value];
  if (sample) {
    $("label").value = sample.label;
    $("command").value = sample.command;
    $("allowPercent").checked = false;
    update();
  }
});
$("command").addEventListener("input", () => {
  $("allowPercent").checked = false;
  update();
});
$("copy").addEventListener("click", async () => {
  if (!result.ok) return;
  const output = result.output;
  try {
    await navigator.clipboard.writeText(output);
    $("export-status").textContent = "Snippet copied, including the final newline.";
  } catch {
    $("export-status").textContent = "Clipboard access is unavailable. Download the snippet instead, or select the preview and copy it manually (preserve the final newline).";
  }
});
$("download").addEventListener("click", () => {
  if (!result.ok) return;
  const system = readJob().format === "system";
  const url = URL.createObjectURL(new Blob([result.output], { type: system ? "application/octet-stream" : "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = system ? "learning-job" : "crontab-snippet.txt";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $("export-status").textContent = "Snippet downloaded. Review it and follow the installation guide; do not replace your existing table.";
});
update();

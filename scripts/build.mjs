import { cp, mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });
for (const file of ["index.html", "styles.css", "favicon.svg", "src"]) {
  await cp(file, `dist/${file}`, { recursive: true });
}
console.log("Static site built in dist/ (no user commands processed).");

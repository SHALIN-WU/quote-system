import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const items = ["index.html", "login.html", "css", "js", "images", "libs", "admin"];
const forbidden = new Set([".dev.vars", ".env", ".wrangler", "node_modules", "credentials.json", "worker", "functions", "migrations"]);

function blocked(name) {
  return forbidden.has(name) || name.startsWith(".env") || name.startsWith(".dev.vars") || name.startsWith("quote-backup-");
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const item of items) {
  await cp(path.join(root, item), path.join(dist, item), {
    recursive: true,
    filter(source) {
      return !blocked(path.basename(source));
    }
  });
}

await writeFile(path.join(dist, "_headers"), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: same-origin

/
  Cache-Control: no-store

/index.html
  Cache-Control: no-store

/login
  Cache-Control: no-store

/login.html
  Cache-Control: no-store

/admin/*
  Cache-Control: no-store
`, "utf8");

async function assertClean(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (blocked(entry.name)) throw new Error("dist 含有不該部署的檔案：" + entry.name);
    if (entry.isDirectory()) await assertClean(path.join(dir, entry.name));
  }
}

await assertClean(dist);

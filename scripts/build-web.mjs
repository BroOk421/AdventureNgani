// Copies the game (index.html, style.css, js/, assets/) into www/ for Capacitor.
// Leaves out source/working files the game never loads (Aseprite files, tools, the save tools).
import { cpSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
const ROOT = new URL("..", import.meta.url).pathname, OUT = join(ROOT, "www");
const SKIP_EXT = new Set([".aseprite", ".ase", ".psd", ".kra", ".xcf", ".zip", ".md", ".py", ".pyc"]);
// Folders / files the game never loads (art sources the tools/ scripts read, the full-size HUD sheets —
// the game uses the *_hud.png copies). Keeps the APK about half the size and quicker to start.
const SKIP_PATHS = [
  "assets/pixelcrawler/source",
  "assets/asset/sunny_cycle_monitoring.png", "assets/asset/night_cycle_monitoring.png",
];
const skip = (src) => { const rel = src.slice(ROOT.length).replace(/\\/g, "/"); return SKIP_PATHS.some((p) => rel === p || rel.startsWith(p + "/")); };
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const f of ["index.html", "style.css", "favicon.ico"]) if (existsSync(join(ROOT, f))) cpSync(join(ROOT, f), join(OUT, f));
for (const d of ["js", "assets"]) cpSync(join(ROOT, d), join(OUT, d), { recursive: true, filter: (src) => !SKIP_EXT.has(extname(src).toLowerCase()) && !skip(src) });
console.log("www/ ready");

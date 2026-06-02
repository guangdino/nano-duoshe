// Copies non-TS skill assets (skill.json, README.md, etc.) from src/skills/
// into dist/skills/ after `tsc` runs. tsc only emits .js / .d.ts, so without
// this the bundled-skill installer would find empty directories.
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcSkills = join(here, "..", "src", "skills");
const dstSkills = join(here, "..", "dist", "skills");

const ASSET_EXTS = [".json", ".md", ".txt"];

function copyAssets(srcDir, dstDir) {
  if (!existsSync(srcDir)) return;
  mkdirSync(dstDir, { recursive: true });
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const src = join(srcDir, entry.name);
    const dst = join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyAssets(src, dst);
    } else if (ASSET_EXTS.some((ext) => entry.name.endsWith(ext))) {
      cpSync(src, dst);
    }
  }
}

copyAssets(srcSkills, dstSkills);
console.log(`Copied skill assets from ${srcSkills} → ${dstSkills}`);

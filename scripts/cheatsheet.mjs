// Writes the Markdown copies of src/cheatsheet.json (the ? overlay's source).
//   node scripts/cheatsheet.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sheet = JSON.parse(readFileSync(join(root, "src/cheatsheet.json"), "utf8"));
const cell = (s) => s.replaceAll("|", "\\|");

let md = `# ${sheet.title}\n\n_Generated from \`~/Developer/atlas/src/cheatsheet.json\` — edit that, not this. In Atlas, press \`?\`._\n`;
for (const s of sheet.sections) {
  md += `\n## ${s.title}\n\n| Keys | Does |\n|---|---|\n`;
  for (const [k, v] of s.rows) md += `| \`${cell(k)}\` | ${cell(v)} |\n`;
}

// The interview-prep copy is a convenience for the author's setup; it's only written if that folder exists.
const outs = [join(root, "docs/CHEATSHEET.md")];
if (existsSync(join(homedir(), "Developer/interview-prep"))) outs.push(join(homedir(), "Developer/interview-prep/CHEATSHEET.md"));
for (const out of outs) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, md);
  console.log(`wrote ${out}`);
}

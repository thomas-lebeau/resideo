import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const changelogPath = "CHANGELOG.md";
let changelog = await readFile(changelogPath, "utf8");

const heading = /^### Other Changes\s*$/m;
const match = heading.exec(changelog);
if (!match) {
  console.log("No Other Changes section found; nothing to annotate.");
  process.exit(0);
}

const sectionStart = match.index + match[0].length;
const nextHeading = /^#{2,3} .+$/gm;
nextHeading.lastIndex = sectionStart;
const nextMatch = nextHeading.exec(changelog);
const sectionEnd = nextMatch ? nextMatch.index : changelog.length;
let section = changelog.slice(sectionStart, sectionEnd);

const titleCache = new Map();
const lines = section.split("\n");
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!/^\s*[-*]\s+/.test(line) || /\*\*[a-z][a-z0-9-]*:\*\*\s/i.test(line)) continue;

  const prMatch = line.match(/#(\d+)\b/);
  if (!prMatch) continue;

  const number = prMatch[1];
  let title = titleCache.get(number);
  if (!title) {
    try {
      title = execFileSync("gh", ["api", `repos/${process.env.GITHUB_REPOSITORY}/pulls/${number}`, "--jq", ".title"], { encoding: "utf8" }).trim();
      titleCache.set(number, title);
    } catch {
      console.warn(`Could not retrieve title for PR #${number}; leaving entry unchanged.`);
      continue;
    }
  }

  const typeMatch = title.match(/^([a-z][a-z0-9-]*)(?:\([^)]*\))?!?:\s*/i);
  if (!typeMatch) continue;
  lines[i] = line.replace(/^(\s*[-*]\s+)/, `$1**${typeMatch[1].toLowerCase()}:** `);
}

const updatedSection = lines.join("\n");
if (updatedSection !== section) {
  changelog = changelog.slice(0, sectionStart) + updatedSection + changelog.slice(sectionEnd);
  await writeFile(changelogPath, changelog);
  console.log("Annotated Other Changes entries with their conventional commit types.");
} else {
  console.log("No entries needed annotation.");
}

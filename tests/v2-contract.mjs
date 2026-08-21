import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const script = readFileSync(join(root, "script.js"), "utf8");
const readme = readFileSync(join(root, "README.md"), "utf8");

const requiredPlaces = ["threshold", "conversation", "hall", "colour", "garden", "window", "machine"];
for (const place of requiredPlaces) {
  assert.match(html, new RegExp('data-place="' + place + '"'), "missing persistent place: " + place);
}

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, "document IDs must be unique");

const referencedFiles = [...html.matchAll(/\s(?:src|href)="([^"]+)"/g)]
  .map(match => match[1].split("?")[0])
  .filter(reference => !reference.startsWith("#") && !reference.includes("://"));
for (const reference of referencedFiles) {
  assert.ok(existsSync(join(root, reference)), "missing root asset: " + reference);
}

assert.doesNotMatch(html, /house-nav|8\/8|Eight rooms|room-list/i);
assert.doesNotMatch(html, /href="rooms\//i, "the V2 root must not link to standalone room pages");
assert.doesNotMatch(script, /location\.(?:href|assign|replace)/, "place changes must not reload the document");
assert.match(script, /class HouseMemory/);
assert.match(script, /class HouseSound/);
assert.match(script, /windowStillness/);
assert.match(script, /leaveTrace/);

for (const role of ["Visible places", "Hidden place", "House-wide acoustic layer", "Afterimage", "Archive"]) {
  assert.ok(readme.includes(role), "README is missing V2 role: " + role);
}

const textExtensions = new Set([".html", ".js", ".css", ".md", ".json", ".py"]);
const sourceFiles = [];
function walk(directory) {
  for (const name of readdirSync(directory)) {
    if (name === ".git" || name === "tests") continue;
    const path = join(directory, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (textExtensions.has(extname(name))) sourceFiles.push(path);
  }
}
walk(root);
const source = sourceFiles.map(path => readFileSync(path, "utf8")).join("\n");
assert.doesNotMatch(source, /speechSynthesis|SpeechSynthesisUtterance/);
assert.doesNotMatch(source, /Manche Räume verändern|verändern uns|Some rooms do not change/i);

console.log("V2 contract holds.");

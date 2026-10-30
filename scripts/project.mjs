#!/usr/bin/env node
// 跨平台项目维护脚本：版本同步、前端同步与一致性检查。
// 用法：
//   node scripts/project.mjs sync-version 6.5.0
//   node scripts/project.mjs sync-frontend
//   node scripts/project.mjs check-version
//   node scripts/project.mjs check-parity
//   node scripts/project.mjs check          （同步前端 + 检查版本 + 检查一致性 + Playwright 测试）
//   node scripts/project.mjs release-notes 6.5.0   （输出 docs/更新日志-6.5.md 中 ## 6.5.0 一节，缺失时报错）

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tauriIndex = "tauri/web/index.html";
const electronIndex = "windows-electron/index.html";

const jsonFiles = ["package.json", "tauri/package.json", "tauri/src-tauri/tauri.conf.json", "windows-electron/package.json"];
const packageLocks = ["package-lock.json", "tauri/package-lock.json", "windows-electron/package-lock.json"];
const cargoToml = "tauri/src-tauri/Cargo.toml";
const cargoLock = "tauri/src-tauri/Cargo.lock";
const htmlFiles = [tauriIndex, electronIndex];

const semver = /^\d+\.\d+\.\d+$/;
const versionField = /"version"\s*:\s*"(\d+\.\d+\.\d+)"/g;
const cargoPackageVersion = /^version = "(\d+\.\d+\.\d+)"/m;
const cargoLockVersion = /(name = "teleprompter_tauri"\r?\nversion = ")(\d+\.\d+\.\d+)(")/;
const htmlVersion = /(app-version" content=")(\d+\.\d+)(")/;

const abs = (path) => join(root, path);
const read = (path) => readFileSync(abs(path), "utf8");
const write = (path, content) => writeFileSync(abs(path), content, "utf8");
const shortVersion = (version) => version.split(".").slice(0, 2).join(".");
const sha256 = (path) => createHash("sha256").update(readFileSync(abs(path))).digest("hex").toUpperCase();

function readVersion() {
  if (!existsSync(abs("VERSION"))) throw new Error("VERSION file is missing.");
  const version = read("VERSION").trim();
  if (!semver.test(version)) throw new Error(`VERSION must use x.y.z format. Current value: ${version}`);
  return version;
}

// package-lock.json 的前两个 version 字段分别是根包和 packages[""]
function lockRootVersions(content) {
  return [...content.matchAll(versionField)].slice(0, 2);
}

function syncVersion(version) {
  if (!semver.test(version ?? "")) throw new Error("Usage: node scripts/project.mjs sync-version x.y.z");

  write("VERSION", `${version}\n`);
  for (const path of jsonFiles) {
    write(path, read(path).replace(/"version"\s*:\s*"\d+\.\d+\.\d+"/, `"version": "${version}"`));
  }
  for (const path of packageLocks) {
    let content = read(path);
    const matches = lockRootVersions(content);
    if (matches.length < 2) throw new Error(`${path} does not contain expected root version fields.`);
    for (const match of matches.reverse()) {
      const start = match.index;
      content = content.slice(0, start) + `"version": "${version}"` + content.slice(start + match[0].length);
    }
    write(path, content);
  }
  write(cargoToml, read(cargoToml).replace(cargoPackageVersion, `version = "${version}"`));
  if (existsSync(abs(cargoLock))) {
    write(cargoLock, read(cargoLock).replace(cargoLockVersion, `$1${version}$3`));
  }
  for (const path of htmlFiles) {
    write(path, read(path).replace(htmlVersion, `$1${shortVersion(version)}$3`));
  }
  console.log(`Synchronized desktop app version to ${version}`);
}

function syncFrontend() {
  if (!existsSync(abs(tauriIndex))) throw new Error(`Missing source frontend file: ${tauriIndex}`);
  copyFileSync(abs(tauriIndex), abs(electronIndex));
  console.log(`Synchronized frontend: ${tauriIndex} -> ${electronIndex}`);
}

function checkVersion() {
  const expected = readVersion();
  const errors = [];
  const missing = (path) => !existsSync(abs(path)) && errors.push(`${path} is missing.`);

  for (const path of jsonFiles) {
    if (missing(path)) continue;
    const actual = JSON.parse(read(path)).version;
    if (actual !== expected) errors.push(`${path} version is ${actual}, expected ${expected}.`);
  }
  for (const path of packageLocks) {
    if (missing(path)) continue;
    const matches = lockRootVersions(read(path));
    if (matches.length < 2) errors.push(`${path} does not contain expected root version fields.`);
    for (const match of matches) {
      if (match[1] !== expected) errors.push(`${path} root version is ${match[1]}, expected ${expected}.`);
    }
  }
  if (!missing(cargoToml) && read(cargoToml).match(cargoPackageVersion)?.[1] !== expected) {
    errors.push(`${cargoToml} version is not ${expected}.`);
  }
  if (existsSync(abs(cargoLock))) {
    const actual = read(cargoLock).match(cargoLockVersion)?.[2];
    if (actual !== expected) errors.push(`${cargoLock} teleprompter_tauri version is ${actual}, expected ${expected}.`);
  }
  for (const path of htmlFiles) {
    if (missing(path)) continue;
    if (read(path).match(htmlVersion)?.[2] !== shortVersion(expected)) {
      errors.push(`${path} app-version is not ${shortVersion(expected)}.`);
    }
  }

  if (errors.length > 0) throw new Error(errors.join("\n"));
  console.log(`Version check passed: ${expected}`);
}

function checkParity() {
  for (const path of htmlFiles) {
    if (!existsSync(abs(path))) throw new Error(`Missing frontend file: ${path}`);
  }
  const tauriHash = sha256(tauriIndex);
  if (tauriHash !== sha256(electronIndex)) {
    throw new Error(`Frontend drift detected. ${tauriIndex} and ${electronIndex} must stay identical.`);
  }
  console.log(`Frontend parity check passed: ${tauriHash}`);
}

function runTests() {
  if (!existsSync(abs("node_modules/@playwright/test"))) {
    throw new Error("Missing Playwright dependency. Run `npm install` from the project root first.");
  }
  const result = spawnSync("npx", ["playwright", "test"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) throw new Error(`Playwright smoke tests failed with exit code ${result.status}.`);
}

function check() {
  const steps = [
    ["Sync shared frontend", syncFrontend],
    ["Check versions", checkVersion],
    ["Check frontend parity", checkParity],
    ["Run Playwright smoke tests", runTests],
  ];
  for (const [name, step] of steps) {
    console.log(`\n==> ${name}`);
    step();
  }
  console.log("\nProject check passed.");
}

// 发版说明取自 docs/更新日志-X.Y.md 中对应的 "## X.Y.Z" 小节，直到下一个同级标题
function releaseNotes(version) {
  if (!semver.test(version ?? "")) throw new Error("Usage: node scripts/project.mjs release-notes x.y.z");
  const path = `docs/更新日志-${shortVersion(version)}.md`;
  if (!existsSync(abs(path))) throw new Error(`Missing changelog file: ${path}`);
  const lines = read(path).split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start === -1) throw new Error(`${path} has no "## ${version}" section.`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  const notes = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
  if (!notes) throw new Error(`${path} "## ${version}" section is empty.`);
  console.log(notes);
}

const commands = {
  "sync-version": syncVersion,
  "sync-frontend": syncFrontend,
  "check-version": checkVersion,
  "check-parity": checkParity,
  check,
  "release-notes": releaseNotes,
};

const [command, ...args] = process.argv.slice(2);
if (!commands[command]) {
  console.error(`Unknown command: ${command ?? "(none)"}\nAvailable: ${Object.keys(commands).join(", ")}`);
  process.exit(1);
}
try {
  commands[command](...args);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

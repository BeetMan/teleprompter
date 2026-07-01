const { defineConfig } = require("@playwright/test");
const fs = require("node:fs");

const browserCandidates = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];

const executablePath = browserCandidates.find((candidate) => fs.existsSync(candidate));

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  use: {
    viewport: { width: 1280, height: 720 },
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  reporter: [["list"]],
});

const { test, expect } = require("@playwright/test");
const { _electron } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const appDirectory = path.resolve(__dirname, "../windows-electron");
const electronExecutable = path.join(appDirectory, "node_modules/electron/dist/electron.exe");

async function getOutputWindow(electronApp) {
  await expect.poll(() => electronApp.windows().filter((window) => window.url().includes("mode=output")).length).toBe(1);
  return electronApp.windows().find((window) => window.url().includes("mode=output"));
}

test("Electron output window can reopen and restore document and playback state", async () => {
  test.skip(!fs.existsSync(electronExecutable), "Electron dependencies are not installed");

  const electronApp = await _electron.launch({
    executablePath: electronExecutable,
    args: [appDirectory],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    },
  });

  try {
    const mainWindow = await electronApp.firstWindow();
    await mainWindow.waitForLoadState("domcontentloaded");
    await expect(mainWindow.locator("#outputButton")).toBeVisible();
    const outputStatus = await mainWindow.evaluate(() => window.teleprompterBridge.getOutputStatus());
    expect(outputStatus.displays.length).toBeGreaterThan(0);
    expect(outputStatus.selectedDisplayId).toBeTruthy();
    expect(outputStatus.displays.some((display) => display.id === outputStatus.selectedDisplayId)).toBe(true);

    await mainWindow.locator("#outputButton").click();
    let outputWindow = await getOutputWindow(electronApp);
    await expect(outputWindow.locator("body")).toHaveClass(/output-mode/);

    await mainWindow.locator("#outputButton").click();
    await expect.poll(() => electronApp.windows().filter((window) => window.url().includes("mode=output")).length).toBe(0);

    await mainWindow.locator("#outputButton").click();
    outputWindow = await getOutputWindow(electronApp);

    const importedText = Array.from({ length: 100 }, (_, index) => `桌面同步测试第 ${index + 1} 行`).join("\n");
    await mainWindow.locator("#fileInput").setInputFiles({
      name: "desktop-sync.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(importedText, "utf8"),
    });
    await expect(outputWindow.locator("#scriptText")).toContainText("桌面同步测试第 100 行");

    await mainWindow.locator("#speedRange").fill("240");
    await mainWindow.locator("#playButton").click();
    await expect(outputWindow.locator("#playButton")).not.toHaveClass(/primary/);
    await expect.poll(async () => Number.parseInt(await outputWindow.locator("#progressValue").textContent(), 10)).toBeGreaterThan(0);

    await mainWindow.locator("#outputButton").click();
    await expect.poll(() => electronApp.windows().filter((window) => window.url().includes("mode=output")).length).toBe(0);
    await mainWindow.locator("#outputButton").click();
    outputWindow = await getOutputWindow(electronApp);
    await expect(outputWindow.locator("#scriptText")).toContainText("桌面同步测试第 100 行");
    await expect(outputWindow.locator("#playButton")).not.toHaveClass(/primary/);
  } finally {
    await electronApp.close();
  }
});

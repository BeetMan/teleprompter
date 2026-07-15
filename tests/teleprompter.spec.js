const { test, expect } = require("@playwright/test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const appPath = path.resolve(__dirname, "../windows-tauri/web/index.html");
const appUrl = pathToFileURL(appPath).toString();

test("main UI renders the preview and controls", async ({ page }) => {
  await page.goto(appUrl);

  await expect(page.locator("#stage")).toBeVisible();
  await expect(page.locator("#scriptText")).toBeVisible();
  await expect(page.locator("#playButton")).toBeVisible();
  await expect(page.locator("body")).toHaveClass(/web-preview/);
  await expect(page.locator("#outputButton")).toBeHidden();
  await expect(page.locator("#scriptInput")).toHaveValue(/大家好/);
});

test("editing script and display sliders update without layout failure", async ({ page }) => {
  await page.goto(appUrl);

  await page.locator("#toggleEditorButton").click();
  await page.locator("#scriptInput").fill("第一行测试\n\n第二行测试比较长，用来验证自动换行和基础渲染。\n第三行测试");
  await page.locator("#sizeRange").fill("72");
  await page.locator("#lineRange").fill("96");
  await page.locator("#widthRange").fill("70");

  await expect(page.locator("#scriptText")).toContainText("第一行测试");
  await expect(page.locator("#scriptText")).toContainText("第二行测试比较长");
  await expect(page.locator("#sizeValue")).toContainText("72");
  await expect(page.locator("#widthValue")).toContainText("70%");
});

test("output mode hides controls and keeps teleprompter indicators", async ({ page }) => {
  await page.goto(`${appUrl}?mode=output`);

  await expect(page.locator("body")).toHaveClass(/output-mode/);
  await expect(page.locator(".control-panel")).toBeHidden();
  await expect(page.locator("#outputRemaining")).toBeVisible();
  await expect(page.locator("#guideProgressDot")).toBeVisible();
  await expect(page.locator("#scriptText")).toBeVisible();
});

test("secondary display aspect ratio drives both output and main preview layout", async ({ page }) => {
  await page.addInitScript(() => {
    window.teleprompterBridge = {
      toggleOutputWindow: async () => ({
        opened: true,
        displayCount: 2,
        outputWidth: 1024,
        outputHeight: 768,
      }),
      closeOutputWindow: async () => ({ opened: false, displayCount: 2 }),
      sendState: () => {},
      onState: () => {},
      onOutputStatus: () => {},
    };
  });

  await page.goto(appUrl);
  await page.locator("#outputButton").click();

  await expect(page.locator("#previewSurface")).toHaveCSS("width", "960px");
  await expect(page.locator("#previewSurface")).toHaveCSS("height", "720px");
  await expect(page.locator("#outputButton")).toHaveAttribute("aria-pressed", "true");

  await page.locator("#lightModeButton").click();
  await expect(page.locator("#stage")).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await expect(page.locator("#previewSurface")).toHaveCSS("background-color", "rgb(255, 255, 255)");
});

test("changing line spacing preserves the current scroll progress", async ({ page }) => {
  await page.goto(appUrl);

  await page.locator("#toggleEditorButton").click();
  await page.locator("#scriptInput").fill(Array.from({ length: 100 }, (_, index) => `第 ${index + 1} 行测试文字`).join("\n"));
  await page.locator("#lineRange").fill("120");
  await page.locator("#browseRange").fill("75");
  await expect(page.locator("#browseValue")).toHaveText("75%");

  await page.locator("#lineRange").fill("64");
  await expect(page.locator("#browseValue")).toHaveText("75%");
});

test("importing a dropped file publishes the final text and reset position", async ({ page }) => {
  await page.addInitScript(() => {
    window.__states = [];
    window.teleprompterBridge = {
      sendState: (state) => window.__states.push(state),
      onState: () => {},
      onOutputStatus: () => {},
    };
  });

  await page.goto(appUrl);
  await page.locator("#fileInput").setInputFiles({
    name: "second.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("second document\nwith two lines", "utf8"),
  });

  await expect(page.locator("#scriptText")).toContainText("second document");
  await expect.poll(() => page.evaluate(() => window.__states.some((state) => state.text === "second document\nwith two lines"))).toBe(true);
});

test("output mode ignores playback keys and only handles Escape", async ({ page }) => {
  await page.addInitScript(() => {
    window.__closeCalls = 0;
    window.teleprompterBridge = {
      closeOutputWindow: () => {
        window.__closeCalls += 1;
        return Promise.resolve({ opened: false });
      },
      onState: () => {},
      onOutputStatus: () => {},
    };
  });

  await page.goto(`${appUrl}?mode=output`);
  await expect(page.locator("#playButton")).toHaveClass(/primary/);
  await page.keyboard.press("Space");
  await expect(page.locator("#playButton")).toHaveClass(/primary/);
  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => window.__closeCalls)).toBe(1);
});

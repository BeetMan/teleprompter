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
  await expect(page.locator("#outputButton")).toBeVisible();
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

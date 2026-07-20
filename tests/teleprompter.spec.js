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

test("vertical mirror moves the remaining indicator to the opposite edge", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("local-teleprompter-state-v2", JSON.stringify({ mirrorY: true }));
  });

  await page.goto(`${appUrl}?mode=output`);

  await expect(page.locator("#outputRemaining")).toHaveClass(/mirrored-y/);
  await expect(page.locator("#outputRemaining")).toHaveCSS("bottom", "18px");
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

test("desktop display picker remembers selection and handles disconnection", async ({ page }) => {
  await page.addInitScript(() => {
    window.__selectedDisplays = [];
    const displays = [
      { id: "primary", name: "内置屏幕", width: 1920, height: 1080, isPrimary: true },
      { id: "secondary", name: "演示屏", width: 1024, height: 768, isPrimary: false },
    ];
    const statusFor = (displayId) => {
      const display = displays.find((candidate) => candidate.id === displayId) || displays[1];
      return {
        opened: false,
        displayCount: displays.length,
        outputWidth: display.width,
        outputHeight: display.height,
        selectedDisplayId: display.id,
        displays,
      };
    };
    window.teleprompterBridge = {
      getOutputStatus: async () => statusFor("secondary"),
      selectOutputDisplay: async (displayId) => {
        window.__selectedDisplays.push(displayId);
        return statusFor(displayId);
      },
      toggleOutputWindow: async () => ({ ...statusFor("secondary"), opened: true }),
      closeOutputWindow: async () => ({ ...statusFor("secondary"), opened: false }),
      sendState: () => {},
      onState: () => {},
      onOutputStatus: (callback) => { window.__receiveOutputStatus = callback; },
    };
  });

  await page.goto(appUrl);
  await expect(page.locator("#outputDisplayPicker")).toBeVisible();
  await expect(page.locator("#outputDisplaySelect option")).toHaveCount(2);
  await expect(page.locator("#outputDisplaySelect")).toHaveValue("secondary");

  await page.locator("#outputDisplaySelect").selectOption("primary");
  await expect.poll(() => page.evaluate(() => window.__selectedDisplays.at(-1))).toBe("primary");
  await expect.poll(() => page.evaluate(() => (
    JSON.parse(localStorage.getItem("local-teleprompter-state-v2")).outputDisplayId
  ))).toBe("primary");

  await page.locator("#outputDisplaySelect").selectOption("secondary");
  await page.evaluate(() => {
    window.__receiveOutputStatus({
      opened: false,
      displayCount: 1,
      outputWidth: 1920,
      outputHeight: 1080,
      selectedDisplayId: "primary",
      displays: [
        { id: "primary", name: "内置屏幕", width: 1920, height: 1080, isPrimary: true },
      ],
      notice: "display-disconnected",
    });
  });

  await expect(page.locator("#outputDisplayPicker")).toBeHidden();
  await expect(page.locator("#statusToast")).toContainText("输出显示器已断开");
  await expect(page.locator("#outputButton")).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => page.evaluate(() => (
    JSON.parse(localStorage.getItem("local-teleprompter-state-v2")).outputDisplayId
  ))).toBe("");
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
  await expect.poll(() => page.evaluate(() => window.__states.some((message) => (
    message.kind === "snapshot" && message.state?.text === "second document\nwith two lines"
  )))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__states.some((message) => (
    message.kind === "playback" && message.state?.progress === 0
  )))).toBe(true);
});

test("importing a GBK-encoded txt file decodes Chinese text without mojibake", async ({ page }) => {
  await page.goto(appUrl);
  // “你好，提词器”的 GBK 编码字节
  const gbkBytes = Buffer.from([0xC4, 0xE3, 0xBA, 0xC3, 0xA3, 0xAC, 0xCC, 0xE1, 0xB4, 0xCA, 0xC6, 0xF7]);
  await page.locator("#fileInput").setInputFiles({
    name: "gbk.txt",
    mimeType: "text/plain",
    buffer: gbkBytes,
  });

  await expect(page.locator("#scriptText")).toContainText("你好，提词器");
});

test("editing the script preserves the current scroll progress", async ({ page }) => {
  await page.goto(appUrl);

  await page.locator("#toggleEditorButton").click();
  await page.locator("#scriptInput").fill(Array.from({ length: 100 }, (_, index) => `第 ${index + 1} 行测试文字`).join("\n"));
  await page.locator("#browseRange").fill("75");
  await expect(page.locator("#browseValue")).toHaveText("75%");

  // 等待填充文本的布局稳定后再编辑下一行，模拟真实操作节奏
  await page.waitForFunction(() => document.querySelector("#scriptText").offsetHeight > 9000);
  await page.locator("#scriptInput").fill(Array.from({ length: 150 }, (_, index) => `第 ${index + 1} 行测试文字`).join("\n"));
  await expect(page.locator("#browseValue")).toHaveText("75%");

  await page.evaluate(() => {
    localStorage.setItem("local-teleprompter-state-v2", JSON.stringify({ mirrorY: true }));
  });
  await page.reload();
  await page.locator("#toggleEditorButton").click();
  await page.locator("#scriptInput").fill(Array.from({ length: 100 }, (_, index) => `第 ${index + 1} 行测试文字`).join("\n"));
  // 等待填充文本的布局稳定，避免 seek 撞上 fill 的中间帧
  await page.waitForTimeout(400);
  // 镜像模式下用 change 事件 seek，避免 range fill 的中间 input 事件把进度带偏
  await page.locator("#browseRange").evaluate((slider) => {
    slider.value = "25";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("#browseValue")).toHaveText("75%");

  // 模拟连续输入：每次输入都应保持当前进度（修复前会跳回顶部）
  const input = page.locator("#scriptInput");
  await input.evaluate((node) => { node.focus(); });
  await page.keyboard.press("End");
  for (let index = 101; index <= 130; index += 1) {
    await page.keyboard.type(`\n第 ${index} 行测试文字`);
  }
  await expect(page.locator("#browseValue")).toHaveText("75%");
});

test("global shortcuts leave focused form controls alone", async ({ page }) => {
  await page.goto(appUrl);

  const speed = page.locator("#speedRange");
  const initialSpeed = await speed.inputValue();
  await speed.focus();
  await speed.press("ArrowRight");
  await expect.poll(() => speed.inputValue()).not.toBe(initialSpeed);

  await page.locator("#importButton").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#playLabel")).toHaveText("开始");

  await page.locator("#stage").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#playLabel")).toHaveText("暂停");
});

test("arrow keys adjust progress while playing instead of snapping back", async ({ page }) => {
  await page.goto(appUrl);

  await page.locator("#toggleEditorButton").click();
  await page.locator("#scriptInput").fill(Array.from({ length: 200 }, (_, index) => `第 ${index + 1} 行测试文字`).join("\n"));
  await page.waitForTimeout(400);
  await page.locator("#toggleEditorButton").click();
  await page.locator("#playButton").click();
  await page.waitForTimeout(300);

  // 快进：向上回退三行（镜像开启时 ↓ 也会向上回退，文本高度足够不会触底）
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  const nudgedScroll = await page.evaluate(() => parseFloat(document.querySelector("#scriptText").style.getPropertyValue("--scroll-y")));
  await page.waitForTimeout(300);
  const laterScroll = await page.evaluate(() => parseFloat(document.querySelector("#scriptText").style.getPropertyValue("--scroll-y")));
  // 锚点已同步时，后续播放从回退位置继续向前（值更负），而不是跳回接近 0
  expect(laterScroll).toBeLessThan(nudgedScroll);
  expect(laterScroll).toBeLessThan(-150);
});

test("clicking the progress slider keeps the editor drawer open", async ({ page }) => {
  await page.goto(appUrl);

  await page.locator("#toggleEditorButton").click();
  await expect(page.locator("#scriptDrawer")).toHaveClass(/open/);

  await page.locator(".stage-progress").click();
  await expect(page.locator("#scriptDrawer")).toHaveClass(/open/);

  await page.locator("#previewSurface").click({ position: { x: 40, y: 40 } });
  await expect(page.locator("#scriptDrawer")).not.toHaveClass(/open/);
});

test("sync protocol separates document snapshots from playback clocks", async ({ page }) => {
  await page.addInitScript(() => {
    window.__states = [];
    window.teleprompterBridge = {
      sendState: (state) => window.__states.push(state),
      onState: () => {},
      onOutputStatus: () => {},
    };
  });

  await page.goto(appUrl);
  await expect.poll(() => page.evaluate(() => window.__states.some((message) => message.kind === "snapshot"))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__states.some((message) => message.kind === "playback"))).toBe(true);

  await page.evaluate(() => { window.__states = []; });
  await page.locator("#playButton").click();
  await page.waitForTimeout(250);

  const counts = await page.evaluate(() => ({
    snapshots: window.__states.filter((message) => message.kind === "snapshot").length,
    playbacks: window.__states.filter((message) => message.kind === "playback").length,
    playing: window.__states.find((message) => message.kind === "playback")?.state?.playing,
  }));
  expect(counts.snapshots).toBe(0);
  expect(counts.playbacks).toBe(1);
  expect(counts.playing).toBe(true);
});

test("output applies ordered protocol messages and ignores stale playback revisions", async ({ page }) => {
  await page.addInitScript(() => {
    window.teleprompterBridge = {
      closeOutputWindow: () => Promise.resolve({ opened: false }),
      outputWindowReady: () => Promise.resolve(),
      onState: (callback) => { window.__receiveState = callback; },
      onOutputStatus: () => {},
    };
  });

  await page.goto(`${appUrl}?mode=output`);
  await page.evaluate(() => {
    window.__receiveState({
      kind: "snapshot",
      protocolVersion: 1,
      sessionId: "session-a",
      revision: 1,
      state: {
        text: Array.from({ length: 80 }, (_, index) => `协议测试第 ${index + 1} 行`).join("\n"),
        size: 64,
        line: 91,
        lineMode: "lineBox",
        spacing: 0,
        width: 84,
        offset: 0,
        guide: 50,
        displayMode: "dark",
        mirrorX: true,
        mirrorY: false,
        previewWidth: 1280,
        previewHeight: 720,
      },
    });
    window.__receiveState({
      kind: "playback",
      protocolVersion: 1,
      sessionId: "session-a",
      revision: 2,
      state: { progress: 0.6, playing: false, speed: 42, anchorAt: Date.now() },
    });
    window.__receiveState({
      kind: "playback",
      protocolVersion: 1,
      sessionId: "session-a",
      revision: 1,
      state: { progress: 0.1, playing: false, speed: 42, anchorAt: Date.now() },
    });
  });

  await expect(page.locator("#scriptText")).toContainText("协议测试第 80 行");
  // 快进窗口布局完成后再校验播放定位，避免 CI 机器上动画帧/定时器时序差异
  await page.evaluate(() => window.__receiveState({
    kind: "playback",
    protocolVersion: 1,
    sessionId: "session-a",
    revision: 3,
    state: { progress: 0.6, playing: false, speed: 42, anchorAt: Date.now() },
  }));
  await expect.poll(() => page.locator("#progressValue").textContent()).toBe("60%");

  await page.evaluate(() => {
    window.__receiveState({
      kind: "playback",
      protocolVersion: 1,
      sessionId: "session-b",
      revision: 1,
      state: { progress: 0.25, playing: false, speed: 42, anchorAt: Date.now() },
    });
  });
  await expect.poll(() => page.locator("#progressValue").textContent()).toBe("25%");
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

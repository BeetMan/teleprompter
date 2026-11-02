const { test, expect } = require("@playwright/test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const appPath = path.resolve(__dirname, "../tauri/web/index.html");
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

test("control panel fits its content by default without an inner scrollbar", async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => localStorage.removeItem("local-teleprompter-state-v2"));
  await page.reload();

  // 默认状态应完整展开两行内容
  await expect.poll(() => page.evaluate(() => {
    const main = document.querySelector(".control-main");
    return main.scrollHeight - main.clientHeight;
  })).toBeLessThanOrEqual(1);

  // 第一行主操作都可见
  await expect(page.locator("#playButton")).toBeVisible();
  await expect(page.locator("#speedRange")).toBeVisible();
  await expect(page.locator("#toggleEditorButton")).toBeVisible();

  // 用户拖过高度后刷新应沿用用户高度
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("local-teleprompter-state-v2") || "{}");
    state.controlHeight = 220;
    localStorage.setItem("local-teleprompter-state-v2", JSON.stringify(state));
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Math.round(document.querySelector(".control-panel").getBoundingClientRect().height))).toBe(220);
});

test("control panel height floors to content and large stored height does not creep up", async ({ page }) => {
  await page.goto(appUrl);

  // 旧的小高度（折叠）会被展开到内容高度
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("local-teleprompter-state-v2") || "{}");
    state.controlHeight = 96;
    localStorage.setItem("local-teleprompter-state-v2", JSON.stringify(state));
  });
  await page.reload();
  await page.waitForTimeout(600);
  const floored = await page.evaluate(() => ({
    panelH: Math.round(document.querySelector(".control-panel").getBoundingClientRect().height),
    noScroll: document.querySelector(".control-main").scrollHeight <= document.querySelector(".control-main").clientHeight + 1,
  }));
  expect(floored.noScroll).toBe(true);
  expect(floored.panelH).toBeGreaterThan(96);

  // 大高度保持，不会在 resize/刷新时继续被顶大
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("local-teleprompter-state-v2") || "{}");
    state.controlHeight = 300;
    localStorage.setItem("local-teleprompter-state-v2", JSON.stringify(state));
  });
  await page.reload();
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => Math.round(document.querySelector(".control-panel").getBoundingClientRect().height));
  expect(before).toBe(300);
  // 触发一次窗口 resize（setControlHeight 重算），高度不应被推高
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => Math.round(document.querySelector(".control-panel").getBoundingClientRect().height));
  expect(after).toBeLessThanOrEqual(before);
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

test("importing an unsupported file type is rejected with a notice", async ({ page }) => {
  await page.goto(appUrl);
  const before = await page.locator("#scriptText").textContent();

  await page.locator("#fileInput").setInputFiles({
    name: "brochure.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 not real", "utf8"),
  });

  // 稿件内容不变，并弹出类型提示
  await expect(page.locator("#scriptText")).toHaveText(before);
  await expect(page.locator("#statusToast")).toContainText("不支持的文件类型");
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

test("global shortcuts work even when a button or slider is focused", async ({ page }) => {
  await page.goto(appUrl);

  // 焦点在按钮上时，空格触发播放而不是按钮点击
  await page.locator("#importButton").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#playLabel")).toHaveText("暂停");

  await page.locator("#stage").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#playLabel")).toHaveText("开始");

  // 焦点在镜像按钮上时，空格仍然触发播放（不是再次切换镜像）
  await page.locator("#mirrorXButton").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#playLabel")).toHaveText("暂停");
});

test("timer readout shows elapsed and remaining time and updates during playback", async ({ page }) => {
  await page.goto(appUrl);

  await page.locator("#toggleEditorButton").click();
  await page.locator("#scriptInput").fill(Array.from({ length: 200 }, (_, index) => `第 ${index + 1} 行测试文字`).join("\n"));
  await page.locator("#speedRange").fill("120");
  await page.waitForTimeout(300);
  await page.locator("#toggleEditorButton").click();

  // 静止时剩余时间应大于已用时间（初始进度接近 0）
  const initial = await page.evaluate(() => ({
    elapsed: document.querySelector("#timerElapsed").textContent,
    remaining: document.querySelector("#timerRemaining").textContent,
  }));
  expect(initial.elapsed).toMatch(/^\d{2}:\d{2}$/);
  expect(initial.remaining).toMatch(/^\d{2}:\d{2}$/);

  await page.locator("#playButton").click();
  await page.waitForTimeout(1200);
  const later = await page.evaluate(() => ({
    elapsed: document.querySelector("#timerElapsed").textContent,
    remaining: document.querySelector("#timerRemaining").textContent,
  }));
  // 播放后已用时间应增长、剩余时间应减少
  expect(later.elapsed).not.toBe(initial.elapsed);
});

test("arrow keys adjust progress while playing instead of snapping back", async ({ page }) => {  await page.goto(appUrl);

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

test("F key toggles native fullscreen via the Tauri bridge", async ({ page }) => {
  await page.addInitScript(() => {
    window.__invokes = [];
    window.__TAURI__ = {
      core: {
        invoke: (cmd) => {
          window.__invokes.push(cmd);
          return Promise.resolve(cmd === "toggle_fullscreen");
        },
      },
      event: { listen: () => Promise.resolve(() => {}) },
    };
  });

  await page.goto(appUrl);
  await page.locator("#stage").focus();
  await page.keyboard.press("f");

  // F 键应走原生窗口全屏命令，而不是元素 requestFullscreen
  await expect.poll(() => page.evaluate(() => window.__invokes)).toContain("toggle_fullscreen");
  await expect(page.locator(".app")).toHaveClass(/fullscreen-mode/);
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
  // 等初始 publish 完成（双 rAF 后的 hydrate），再清空并开始测试
  await page.waitForTimeout(300);

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
  await expect.poll(() => page.locator("#browseValue").textContent()).toBe("60%");

  await page.evaluate(() => {
    window.__receiveState({
      kind: "playback",
      protocolVersion: 1,
      sessionId: "session-b",
      revision: 1,
      state: { progress: 0.25, playing: false, speed: 42, anchorAt: Date.now() },
    });
  });
  await expect.poll(() => page.locator("#browseValue").textContent()).toBe("25%");
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

test("Escape in the main window closes an open output window", async ({ page }) => {
  await page.addInitScript(() => {
    window.__closeCalls = 0;
    window.teleprompterBridge = {
      toggleOutputWindow: async () => ({ opened: true, displayCount: 2, outputWidth: 1280, outputHeight: 720 }),
      closeOutputWindow: async () => {
        window.__closeCalls += 1;
        return { opened: false, displayCount: 2 };
      },
      sendState: () => {},
      onState: () => {},
      onOutputStatus: () => {},
    };
  });

  await page.goto(appUrl);
  await page.locator("#outputButton").click();
  await expect(page.locator("#outputButton")).toHaveAttribute("aria-pressed", "true");

  // 播放中按 Esc 只关第二屏，不改变播放状态
  await page.keyboard.press("Space");
  await expect(page.locator("#playButton")).not.toHaveClass(/primary/);
  await page.keyboard.press("Escape");
  await expect(page.locator("#outputButton")).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => page.evaluate(() => window.__closeCalls)).toBe(1);
  await expect(page.locator("#playButton")).not.toHaveClass(/primary/);

  // 第二屏关闭后，Esc 恢复为暂停播放，不再调用关闭
  await page.keyboard.press("Escape");
  await expect(page.locator("#playButton")).toHaveClass(/primary/);
  expect(await page.evaluate(() => window.__closeCalls)).toBe(1);

  // 编辑稿件时按 Esc 也能关闭第二屏
  await page.locator("#outputButton").click();
  await expect(page.locator("#outputButton")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#toggleEditorButton").click();
  await page.locator("#scriptInput").focus();
  await page.keyboard.press("Escape");
  await expect(page.locator("#outputButton")).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => page.evaluate(() => window.__closeCalls)).toBe(2);
});

// 主窗口与第二屏用两个页面模拟：主窗口 sendState 直接转发给输出页，验证手动定位后第二屏及时跟随
async function openLinkedOutput(context) {
  const output = await context.newPage();
  await output.addInitScript(() => {
    window.teleprompterBridge = {
      onState: (callback) => { window.__receiveState = callback; },
      onOutputStatus: () => {},
      outputWindowReady: () => Promise.resolve(),
      closeOutputWindow: () => Promise.resolve({ opened: false }),
    };
  });
  await output.goto(`${appUrl}?mode=output`);

  const main = await context.newPage();
  await main.exposeFunction("__forwardState", (message) => output.evaluate((state) => window.__receiveState(state), message));
  await main.addInitScript(() => {
    localStorage.setItem("local-teleprompter-state-v2", JSON.stringify({
      text: Array.from({ length: 200 }, (_, index) => `同步测试第 ${index + 1} 行`).join("\n"),
    }));
    const status = { opened: false, displayCount: 2, outputWidth: 1280, outputHeight: 720 };
    window.teleprompterBridge = {
      sendState: (state) => { window.__forwardState(state); },
      onState: () => {},
      onOutputStatus: () => {},
      toggleOutputWindow: async () => { status.opened = !status.opened; return { ...status }; },
      closeOutputWindow: async () => { status.opened = false; return { ...status }; },
      getOutputStatus: async () => ({ ...status }),
    };
  });
  await main.goto(appUrl);
  await main.locator("#outputButton").click();
  await expect(main.locator("#outputButton")).toHaveAttribute("aria-pressed", "true");
  await expect(output.locator("#scriptText")).toContainText("同步测试第 200 行");
  return { main, output };
}

function readProgress(page) {
  return page.evaluate(() => {
    const text = document.querySelector("#scriptText");
    const scroll = parseFloat(getComputedStyle(text).getPropertyValue("--scroll-y")) || 0;
    return Math.abs(scroll) / text.offsetHeight;
  });
}

async function expectInSync(main, output) {
  await expect.poll(async () => Math.abs(await readProgress(main) - await readProgress(output))).toBeLessThan(0.005);
}

test("dragging the progress slider while playing seeks and keeps the output in sync", async ({ context }) => {
  const { main, output } = await openLinkedOutput(context);
  await main.locator("#stage").focus();
  await main.keyboard.press("Space");
  await expect(main.locator("#playButton")).not.toHaveClass(/primary/);

  const slider = await main.locator("#browseRange").boundingBox();
  const x = slider.x + slider.width / 2;
  await main.mouse.move(x, slider.y + slider.height * 0.2);
  await main.mouse.down();
  await main.mouse.move(x, slider.y + slider.height * 0.6, { steps: 6 });
  // 拖动中：主窗口跟随进度条，第二屏实时跟随
  await expect.poll(() => readProgress(main)).toBeGreaterThan(0.5);
  await expectInSync(main, output);
  await main.mouse.up();

  // 松手后继续播放，不会被拉回拖动前的位置
  await main.waitForTimeout(300);
  expect(await readProgress(main)).toBeGreaterThan(0.5);
  await expect(main.locator("#playButton")).not.toHaveClass(/primary/);
  await expectInSync(main, output);
});

test("manual moves while paused and playing reach the output window", async ({ context }) => {
  const { main, output } = await openLinkedOutput(context);
  const stage = await main.locator("#stage").boundingBox();

  for (const mode of ["paused", "playing"]) {
    await main.locator("#resetButton").click();
    await main.locator("#stage").focus();
    if (mode === "playing") {
      await main.keyboard.press("Space");
    }

    await main.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
    await main.mouse.wheel(0, 2000);
    await expect.poll(() => readProgress(main)).toBeGreaterThan(0.1);
    await expectInSync(main, output);

    await main.keyboard.press("Shift+ArrowDown");
    await expectInSync(main, output);

    await main.locator("#endButton").click();
    await expect.poll(() => readProgress(output)).toBeGreaterThan(0.99);

    await main.locator("#stage").focus();
    await main.keyboard.press("r");
    await expect.poll(() => readProgress(output)).toBeLessThan(0.01);
    await expectInSync(main, output);

    if (mode === "playing") {
      await main.keyboard.press("Space");
    }
  }
});

test("horizontal offset matches between main preview and a larger output display", async ({ browser }) => {
  // 第二屏 1920 宽、主窗口 1280 宽：水平位置必须按画布比例换算，而不是各自窗口宽度
  const outputContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const mainContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const output = await outputContext.newPage();
    await output.addInitScript(() => {
      window.teleprompterBridge = {
        onState: (callback) => { window.__receiveState = callback; },
        onOutputStatus: () => {},
        outputWindowReady: () => Promise.resolve(),
        closeOutputWindow: () => Promise.resolve({ opened: false }),
      };
    });
    await output.goto(`${appUrl}?mode=output`);

    const main = await mainContext.newPage();
    await main.exposeFunction("__forwardState", (message) => output.evaluate((state) => window.__receiveState(state), message));
    await main.addInitScript(() => {
      const status = { opened: false, displayCount: 2, outputWidth: 1920, outputHeight: 1080 };
      window.teleprompterBridge = {
        sendState: (state) => { window.__forwardState(state); },
        onState: () => {},
        onOutputStatus: () => {},
        toggleOutputWindow: async () => { status.opened = !status.opened; return { ...status }; },
        getOutputStatus: async () => ({ ...status }),
      };
    });
    await main.goto(appUrl);
    await main.locator("#outputButton").click();
    await expect(main.locator("#outputButton")).toHaveAttribute("aria-pressed", "true");

    const textCenter = (page) => page.evaluate(() => {
      const surface = document.querySelector("#previewSurface").getBoundingClientRect();
      const text = document.querySelector("#scriptText").getBoundingClientRect();
      return ((text.left + text.right) / 2 - surface.left) / surface.width;
    });

    await main.locator("#offsetRange").fill("10");
    await main.locator("#offsetRange").dispatchEvent("input");
    await expect(main.locator("#offsetValue")).toHaveText("10%");
    await expect.poll(() => textCenter(main)).toBeCloseTo(0.6, 2);
    await expect.poll(() => textCenter(output)).toBeCloseTo(0.6, 2);
  } finally {
    await outputContext.close();
    await mainContext.close();
  }
});

test("output window reports its measured viewport and the main canvas follows it", async ({ page, context }) => {
  // 输出页：尺寸变化后上报实测可用区域
  await page.addInitScript(() => {
    window.__reports = [];
    window.teleprompterBridge = {
      onState: () => {},
      onOutputStatus: () => {},
      outputWindowReady: () => Promise.resolve(),
      reportOutputViewport: (size) => { window.__reports.push(size); return Promise.resolve(); },
    };
  });
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto(`${appUrl}?mode=output`);
  await expect.poll(() => page.evaluate(() => window.__reports.at(-1))).toEqual({ width: 1200, height: 900 });
  await page.setViewportSize({ width: 1000, height: 900 });
  await expect.poll(() => page.evaluate(() => window.__reports.at(-1))).toEqual({ width: 1000, height: 900 });

  // 主窗口：收到带实测尺寸的状态后，画布改用该比例，并把新比例发给第二屏
  const main = await context.newPage();
  await main.addInitScript(() => {
    window.__snapshots = [];
    const status = { opened: false, displayCount: 2, outputWidth: 1920, outputHeight: 1080 };
    window.teleprompterBridge = {
      sendState: (state) => { if (state.kind === "snapshot") window.__snapshots.push(state.state); },
      onState: () => {},
      onOutputStatus: (callback) => { window.__pushStatus = callback; },
      toggleOutputWindow: async () => { status.opened = true; return { ...status }; },
      getOutputStatus: async () => ({ ...status }),
      __setMeasured: (width, height) => { Object.assign(status, { outputWidth: width, outputHeight: height }); },
    };
  });
  await main.goto(appUrl);
  await main.locator("#outputButton").click();
  await expect(main.locator("#previewSurface")).toHaveCSS("width", "1280px");

  await main.evaluate(() => {
    window.teleprompterBridge.__setMeasured(1000, 900);
    window.__pushStatus({ opened: true, displayCount: 2, outputWidth: 1000, outputHeight: 900 });
  });
  await expect(main.locator("#previewSurface")).toHaveCSS("width", "800px");
  await expect(main.locator("#previewSurface")).toHaveCSS("height", "720px");
  await expect.poll(() => main.evaluate(() => window.__snapshots.at(-1)?.previewWidth)).toBe(800);
});

test("main window moves controls to the side for portrait outputs", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("local-teleprompter-state-v2", JSON.stringify({ controlHeight: 150 }));
    const status = { opened: false, displayCount: 2, outputWidth: 1920, outputHeight: 1080 };
    window.teleprompterBridge = {
      sendState: () => {},
      onState: () => {},
      onOutputStatus: (callback) => { window.__pushStatus = (next) => { Object.assign(status, next); callback({ ...status }); }; },
      toggleOutputWindow: async () => { status.opened = true; return { ...status }; },
      getOutputStatus: async () => ({ ...status }),
    };
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(appUrl);
  await page.locator("#outputButton").click();
  await expect(page.locator(".app")).not.toHaveClass(/layout-side/);

  // 第二屏变成竖屏：控制栏移到右侧，预览用满窗口高度
  await page.evaluate(() => window.__pushStatus({ outputWidth: 1080, outputHeight: 1920 }));
  await expect(page.locator(".app")).toHaveClass(/layout-side/);
  await expect.poll(() => page.evaluate(() => Math.round(document.querySelector("#previewSurface").getBoundingClientRect().height))).toBe(900);
  // 浏览进度在画布外，不遮挡稿件
  const overlap = await page.evaluate(() => {
    const surface = document.querySelector("#previewSurface").getBoundingClientRect();
    const progress = document.querySelector(".stage-progress").getBoundingClientRect();
    return progress.left < surface.right && progress.right > surface.left;
  });
  expect(overlap).toBe(false);

  // 侧栏布局下保存设置不会把底栏高度改成整窗高度
  await page.locator("#darkModeButton").click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("local-teleprompter-state-v2")).controlHeight)).toBe(150);

  // 窗口太窄时回到底栏
  await page.setViewportSize({ width: 860, height: 900 });
  await expect(page.locator(".app")).not.toHaveClass(/layout-side/);

  // 换回横屏输出后保持底栏
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.__pushStatus({ outputWidth: 1920, outputHeight: 1080 }));
  await expect(page.locator(".app")).not.toHaveClass(/layout-side/);
});

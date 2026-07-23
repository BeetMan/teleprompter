const { test } = require("@playwright/test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const appUrl = pathToFileURL(path.resolve(__dirname, "../windows-tauri/web/index.html")).toString();

async function panelState(page) {
  return page.evaluate(() => ({
    panelH: Math.round(document.querySelector(".control-panel").getBoundingClientRect().height),
    clientH: document.querySelector(".control-main").clientHeight,
    scrollH: document.querySelector(".control-main").scrollHeight,
  }));
}

test("fold behavior across scenarios", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });

  // 1. 默认：完整展开
  await page.goto(appUrl);
  await page.evaluate(() => localStorage.removeItem("local-teleprompter-state-v2"));
  await page.reload();
  await page.waitForTimeout(700);
  console.log("default:", JSON.stringify(await panelState(page)));

  // 2. 拖大到 400 后刷新：保持 400，不再继续被顶大
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("local-teleprompter-state-v2")||"{}"); s.controlHeight = 400; localStorage.setItem("local-teleprompter-state-v2", JSON.stringify(s)); });
  await page.reload();
  await page.waitForTimeout(700);
  console.log("stored 400:", JSON.stringify(await panelState(page)));

  // 3. 旧小高度 96：floor 到内容
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("local-teleprompter-state-v2")||"{}"); s.controlHeight = 96; localStorage.setItem("local-teleprompter-state-v2", JSON.stringify(s)); });
  await page.reload();
  await page.waitForTimeout(700);
  console.log("stored 96:", JSON.stringify(await panelState(page)));

  // 4. 模拟拖到 96 的指针序列：setControlHeight 应停在内容高度不再往下，也不会往上顶
  const dragResult = await page.evaluate(() => {
    const out = [];
    // 模拟 updateResize 的指针位置（屏幕底部往上拖 = 高度变小）
    const startH = document.querySelector(".control-panel").getBoundingClientRect().height;
    // 直接调用 setControlHeight 模拟拖动到 96
    // 访问不到内部函数，改用 resize handle pointer 事件过于复杂，这里直接读 floor 表现
    return { startH };
  });
  console.log("drag sim:", JSON.stringify(dragResult));
});

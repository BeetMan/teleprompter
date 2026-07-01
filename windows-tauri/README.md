# 提词器 Tauri 版

Tauri 版是提词器的轻量桌面版本，当前版本为 `6.0.0`。它复用网页界面，并通过 Rust/Tauri 实现第二屏窗口、双屏状态同步、文件导入和程序生命周期管理。

## 功能

- 稿件编辑及 `.txt`、`.md`、`.markdown`、`.docx` 导入
- 文件拖拽读取并保留原始连续空行
- 自动滚动、手动定位、速度调节和快捷键控制
- 独立第二屏输出，输出窗口不显示底部控制栏
- 主屏固定比例预览及双屏滚动同步
- 水平镜像、垂直镜像和两种明暗显示模式
- 字号、行距、字间距、宽度、水平位置和指示线调节
- 剩余字数、浏览进度条及指示线进度点
- 关闭主程序时彻底结束所有相关窗口和进程

## 环境要求

- Windows 10 或更高版本
- Microsoft Edge WebView2 Runtime
- Node.js 20 LTS 或 22 LTS
- Rust 稳定版工具链

确认环境：

```powershell
node --version
npm --version
rustc --version
cargo --version
```

## 开发运行

```powershell
npm install
npm run dev
```

## Windows 打包

```powershell
npm install
npm run build
```

主要构建结果：

```text
src-tauri/target/release/teleprompter_tauri.exe
src-tauri/target/release/bundle/nsis/提词器_6.0.0_x64-setup.exe
```

## 目录说明

- `web/index.html`：主窗口界面、第二屏输出模式和提词逻辑
- `src-tauri/src/lib.rs`：窗口、事件和状态同步逻辑
- `src-tauri/tauri.conf.json`：Tauri 应用与打包配置
- `src-tauri/capabilities/`：Tauri 权限配置
- `功能介绍.md`：完整功能说明

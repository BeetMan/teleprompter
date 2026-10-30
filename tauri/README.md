# 提词器 Tauri 版

Tauri 版是提词器的主力桌面版本，支持 Windows、macOS 和 Linux，版本号以仓库根目录的 `VERSION` 为准。它复用网页界面，并通过 Rust/Tauri 实现第二屏窗口、双屏状态同步、文件导入和程序生命周期管理。

## 功能

- 导入 `.txt`、`.md`、`.markdown`、`.docx` 稿件，并保留原始连续空行
- 拖拽文件到窗口直接读取
- 自动滚动、手动定位、速度调节和快捷键控制
- 独立第二屏输出，输出窗口不显示底部控制栏
- 主屏真实预览及双屏滚动同步
- 水平镜像、垂直镜像和黑白两种显示模式
- 字号、行间距、字间距、宽度、水平位置和指示线调节
- 剩余字数、浏览进度条及指示线进度点

## 环境要求

- Node.js 20 LTS 或 22 LTS
- Rust 稳定版工具链
- Windows：WebView2 Runtime
- macOS：Xcode Command Line Tools
- Linux：`libwebkit2gtk-4.1-dev`、`libappindicator3-dev`、`librsvg2-dev`、`patchelf`

## 开发运行

```bash
npm install
npm run dev
```

## 打包

```bash
npm install
npm run build
```

构建结果位于 `src-tauri/target/release/bundle/`。各平台的格式、通用 macOS 包和签名说明见 [打包说明](../docs/打包说明.md)。

## 目录说明

- `web/index.html`：主窗口界面、第二屏输出模式和提词逻辑
- `src-tauri/src/lib.rs`：窗口、事件和状态同步逻辑
- `src-tauri/tauri.conf.json`：Tauri 应用与打包配置
- `src-tauri/capabilities/`：Tauri 权限配置
- `功能介绍.md`：完整功能说明

根目录的 `.github/workflows/release.yml` 会在推送版本标签时自动构建 Electron 和 Tauri 发布包。

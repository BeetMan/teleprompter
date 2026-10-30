# 提词器

一款面向录课、直播、短视频拍摄、演讲和会议发言的提词器。支持稿件导入、连续空行、自动滚动、镜像显示、双屏同步和第二显示器独立输出。

本项目完全由 AI 大模型编写，包括功能实现、桌面端适配、打包配置和项目文档。

## 在线预览

无需安装，可直接在浏览器中使用：[beetya.ng/teleprompter](https://beetya.ng/teleprompter)

在线版适合单屏使用；第二屏输出和双屏同步等功能请使用桌面版。

## 当前版本

当前统一版本号为 `6.5.0`，记录在根目录的 `VERSION` 文件中。

- **Tauri 版（主力维护）**：支持 Windows、macOS、Linux，体积较小、启动较快，推荐日常使用。
- **Electron 版（备用）**：仅提供 Windows 版本，功能与 Tauri 版保持一致，不再新增平台。

| 平台 | 安装包 |
| --- | --- |
| Windows 10 / 11（x64 / ARM64） | Tauri 安装版 `.exe`；x64 另有 Electron 便携版 / 安装版 |
| macOS 10.15+（Apple 芯片与 Intel 通用） | Tauri `.dmg` |
| Linux（x86_64 / ARM64） | Tauri `.AppImage`、`.deb` 或 `.rpm` |

最新安装包可在 [GitHub Releases](https://github.com/BeetMan/teleprompter/releases/latest) 获取。

当前发布包尚未配置代码签名证书，这是发布者身份未经过证书验证导致的安全提示，不代表项目必然包含恶意代码。正式分发前建议核对 Release 中的 SHA256 校验文件。

- **Windows**：部分设备可能显示 Smart App Control 或 SmartScreen 警告。
- **macOS**：首次打开如提示"已损坏"或"无法验证开发者"，将应用拖入"应用程序"后在终端执行 `xattr -cr /Applications/提词器.app`，或在"系统设置 → 隐私与安全性"中选择"仍要打开"。

## 主要功能

- 导入 `.txt`、`.md`、`.markdown`、`.docx` 稿件
- 拖拽文件到窗口直接读取，并保留原始连续空行
- 在应用内编辑稿件，导入新文件时更新当前稿件
- 第二显示器独立输出，输出窗口不显示底部控制栏
- 主屏按第二屏比例显示真实预览，并与第二屏同步播放和定位
- 水平镜像与垂直镜像，默认开启水平镜像
- 黑底白字与纯白底黑字两种显示模式
- 调节速度、字号、行间距、字间距、显示宽度和水平位置
- 调节第二屏指示线位置，显示进度点和剩余字数
- 回到顶部、回到尾部、进度拖动及键盘快捷控制

## 快速开始

### Tauri 版

环境要求：Node.js、Rust 稳定版，以及各平台的 WebView 依赖：

- **Windows**：WebView2 Runtime（Windows 11 已内置）
- **macOS**：Xcode Command Line Tools（`xcode-select --install`）
- **Linux**：`libwebkit2gtk-4.1-dev`、`libappindicator3-dev`、`librsvg2-dev`、`patchelf`

```bash
cd tauri
npm install
npm run dev
```

构建当前平台的安装包：

```bash
npm run build
```

输出位于 `tauri/src-tauri/target/release/bundle/`，按平台分别生成 `nsis/`、`dmg/`、`macos/`、`deb/`、`appimage/` 等目录。

### Electron 版

环境要求：Windows 与 Node.js。

```powershell
cd windows-electron
npm install
npm start
```

构建 Windows 便携版和安装版：

```powershell
npm run dist:win -- --config.win.signAndEditExecutable=false
```

主要输出位于 `windows-electron/dist/`。

## 快捷键

| 按键 | 功能 |
| --- | --- |
| `Space` | 播放 / 暂停 |
| `R` | 回到顶部 |
| `↑` / `↓` | 快速滚动页面 |
| `←` / `→` | 调节滚动速度 |
| `Esc` | 关闭第二屏输出（仅桌面版，主窗口或第二屏中均可）；未开第二屏时停止播放 |

## 开发检查

维护脚本基于 Node.js，Windows、macOS、Linux 通用。根目录安装测试依赖后运行：

```bash
npm install
npx playwright install chromium
npm run check
```

检查会把 Tauri 前端同步到 Electron，验证版本号和前端一致性，并运行 Playwright 测试。

版本号变更时使用同步脚本：

```bash
npm run sync:version -- 6.5.0
```

## GitHub Actions 发版

1. 在 `docs/更新日志-X.Y.md` 中写好 `## X.Y.Z` 小节并推送到 `main`。
2. 在 GitHub 打开 **Actions → Release → Run workflow**，填写版本号。

工作流会同步版本号、提交并打标签，然后并行构建 Tauri 的 Windows（x64 / ARM64）、macOS 通用、Linux（x86_64 / ARM64，`.AppImage` / `.deb` / `.rpm`）安装包和 Electron Windows 备用版本，生成 `SHA256SUMS.txt`，最后用更新日志创建 GitHub Release。也可以在本地同步版本号后直接推送 `vX.Y.Z` 标签触发。详细说明见 [项目维护说明](./docs/项目维护说明.md#自动发布)。

每个 PR 都会运行 `.github/workflows/build.yml` 完成检查和全平台构建。

## 项目结构

```text
.
├── tauri/               Tauri 桌面版源码（全平台，主力维护）
├── windows-electron/    Electron 桌面版源码（仅 Windows，备用）
├── scripts/             版本同步和项目检查脚本（Node.js）
├── tests/               Playwright 自动化测试
├── docs/                打包、发布、更新日志和维护说明
├── VERSION              当前统一产品版本号
├── 使用指南.md          用户操作指南
├── LICENSE              MIT 许可证
└── README.md            项目总说明
```

## 相关文档

- [使用指南](./使用指南.md)
- [Tauri 功能介绍](./tauri/功能介绍.md)
- [Electron 功能介绍](./windows-electron/功能介绍.md)
- [打包说明](./docs/打包说明.md)
- [项目维护说明](./docs/项目维护说明.md)
- [更新日志](./docs/)

## 许可证

本项目使用 [MIT License](./LICENSE) 开源。

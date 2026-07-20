# 提词器

一款面向录课、直播、短视频拍摄、演讲和会议发言的提词器。支持稿件导入、连续空行、自动滚动、镜像显示、双屏同步和第二显示器独立输出。

本项目完全由 AI 大模型编写，包括功能实现、桌面端适配、打包配置和项目文档。

## 在线预览

无需安装，可直接在浏览器中使用：[beetya.ng/teleprompter](https://beetya.ng/teleprompter)

在线版适合单屏使用；第二屏输出和双屏同步等功能请使用桌面版。

## 当前版本

当前统一版本号为 `6.2.1`，记录在根目录的 `VERSION` 文件中。

- **Tauri 版**：体积较小、启动较快，推荐日常使用。
- **Electron 版**：兼容性较好，适合作为备用桌面版本。

最新安装包可在 [GitHub Releases](https://github.com/BeetMan/teleprompter/releases/latest) 获取。

当前发布包尚未配置 Windows 代码签名证书。部分 Windows 设备可能显示 Smart App Control 或 SmartScreen 警告，这是发布者身份未经过证书验证导致的安全提示，不代表项目必然包含恶意代码。正式分发前建议核对 Release 中的 SHA256 校验文件，并优先使用 Tauri 版本。

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

环境要求：Node.js、Rust 稳定版和 Windows WebView2 Runtime。

```powershell
cd windows-tauri
npm install
npm run dev
```

构建 Windows 安装包：

```powershell
npm run build
```

主要输出位于 `windows-tauri/src-tauri/target/release/bundle/nsis/`。

### Electron 版

环境要求：Node.js。

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
| `Esc` | 关闭第二屏输出窗口（仅桌面版） |

## 开发检查

根目录安装测试依赖后运行：

```powershell
npm install
npm run check
```

检查会验证版本号、Tauri/Electron 前端一致性，并运行 Playwright 测试。

版本号变更时使用同步脚本：

```powershell
.\scripts\sync-version.ps1 -Version 6.2.1
```

## GitHub Actions 发布

发布流程由 `.github/workflows/release.yml` 管理。提交版本号同步改动后，推送符合 `vX.Y.Z` 格式的标签即可触发 Windows 自动构建：

```powershell
git tag -a v6.2.1 -m "Release v6.2.1"
git push origin v6.2.1
```

Actions 会先执行项目检查，然后构建 Electron 便携版、Electron 安装版和 Tauri 安装版，生成 `SHA256SUMS.txt`，最后创建或更新对应的 GitHub Release。当前工作流默认生成未签名安装包；后续接入证书后，可在工作流中增加签名步骤。

## 项目结构

```text
.
├── windows-tauri/       Tauri 桌面版源码
├── windows-electron/    Electron 桌面版源码
├── scripts/             版本同步和项目检查脚本
├── tests/               Playwright 自动化测试
├── docs/                打包、发布、更新日志和维护说明
├── VERSION              当前统一产品版本号
├── 使用指南.md          用户操作指南
├── LICENSE              MIT 许可证
└── README.md            项目总说明
```

## 相关文档

- [使用指南](./使用指南.md)
- [Tauri 功能介绍](./windows-tauri/功能介绍.md)
- [Electron 功能介绍](./windows-electron/功能介绍.md)
- [打包说明](./docs/打包说明.md)
- [项目维护说明](./docs/项目维护说明.md)
- [更新日志](./docs/)

## 许可证

本项目使用 [MIT License](./LICENSE) 开源。

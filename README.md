# 提词器

一款面向录课、直播、短视频拍摄、演讲和会议发言的桌面提词器。它支持主屏预览、第二显示器独立输出、镜像显示、稿件导入、键盘控制和双屏同步，适合普通外接屏、监看屏及反射式提词器使用。

本项目完全由 Codex（GPT-5.5）编写，包括功能实现、桌面端适配、打包配置和项目文档。

## 桌面版本

- **Tauri 版 `6.0.0`**：体积较小、启动较快，推荐日常使用。
- **Electron 版 `6.0.0`**：运行环境更完整，适合作为兼容版本。

两个版本使用相同的提词器界面与核心功能。

项目使用统一产品版本号，当前版本记录在 `VERSION`。修改版本号时先运行：

```powershell
.\scripts\sync-version.ps1 -Version 6.0.0
```

## 主要功能

- 导入 `.txt`、`.md`、`.markdown`、`.docx` 稿件
- 拖拽文件到窗口直接读取
- 在应用内编辑稿件并自动保存
- 保留原始文档中的连续空行
- 第二显示器独立输出，输出窗口不显示控制栏
- 主屏按第二屏比例显示真实预览
- 主屏与第二屏同步播放、定位和快速滚动
- 水平镜像与垂直镜像，默认开启水平镜像
- 黑底白字与纯白底黑字两种显示模式
- 调节速度、字号、行距、字间距、显示宽度和水平位置
- 调节第二屏指示线位置
- 剩余字数、指示线进度点和浏览进度条
- 回到顶部、回到尾部及键盘快捷控制

## 快速开始

### Tauri 版

需要 Node.js、Rust 和 Windows WebView2：

```powershell
cd windows-tauri
npm install
npm run dev
```

构建 Windows 安装包：

```powershell
npm run build
```

安装包输出到：

```text
windows-tauri/src-tauri/target/release/bundle/nsis/
```

### Electron 版

需要 Node.js：

```powershell
cd windows-electron
npm install
npm start
```

构建 Windows 便携版和安装版：

```powershell
npm run dist:win -- --config.win.signAndEditExecutable=false
```

构建结果输出到：

```text
windows-electron/dist/
```

## 快捷键

| 按键 | 功能 |
| --- | --- |
| `Space` | 播放 / 暂停 |
| `R` | 回到顶部 |
| `↑` / `↓` | 快速滚动页面 |
| `←` / `→` | 调节滚动速度 |
| `Esc` | 关闭第二屏输出窗口 |

## 项目结构

```text
.
├── windows-tauri/       Tauri 6.0 桌面版本
├── windows-electron/    Electron 6.0 桌面版本
├── scripts/             维护脚本
├── VERSION              当前统一产品版本号
├── 使用指南.md          用户操作指南
├── docs/                打包说明、更新日志和发布清单
└── README.md            项目总说明
```

## 相关文档

- [使用指南](./使用指南.md)
- [Tauri 功能介绍](./windows-tauri/功能介绍.md)
- [Electron 功能介绍](./windows-electron/功能介绍.md)
- [打包说明](./docs/打包说明.md)
- [项目维护说明](./docs/项目维护说明.md)
- [6.0 更新日志](./docs/更新日志-6.0.md)

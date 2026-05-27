# 提词器

一款面向录课、直播、短视频拍摄、演讲和会议发言的桌面提词器工具。它支持主屏预览、第二显示器独立输出、镜像显示、稿件导入、键盘控制和双屏同步，适合普通外接屏、反射式提词器和监看屏使用。

本项目完全由 Codex（GPT-5.5）编写，包括功能实现、桌面端打包配置和项目文档整理。

当前整理版包含两个桌面版本：

- Tauri 版：体积更小、启动更快，当前版本 `6.0.0`
- Electron 版：兼容性较好，当前版本 `4.6.0`

## 功能亮点

- 支持 `.txt`、`.md`、`.markdown`、`.docx` 稿件导入
- 支持把文件拖拽到窗口中直接读取
- 支持在应用内直接编辑稿件，并自动保存稿件和显示设置
- 支持第二屏独立输出，第二屏只显示提词内容，不显示底部控制栏
- 主屏采用固定比例预览，尽量保持与第二屏一致的排版和滚动位置
- 支持水平镜像和垂直镜像，默认开启水平镜像，适合反射式提词器
- 支持黑底白字、白底黑字两种显示模式
- 支持调节字号、行距、字间距、显示宽度、水平位置和指示线位置
- 支持顶部剩余字数提示、指示线进度点、右侧浏览进度条
- 支持回到顶部、回到尾部、播放/暂停、鼠标滚轮和键盘快速控制
- 支持导入文档中的连续空行，并在提词显示中保留空行节奏

## 快速开始

### Tauri 版

进入 Tauri 项目目录：

```powershell
cd windows-tauri
npm install
npm run build
```

构建完成后，常见产物位置：

```text
windows-tauri/src-tauri/target/release/teleprompter_tauri.exe
windows-tauri/src-tauri/target/release/bundle/nsis/提词器_6.0.0_x64-setup.exe
```

### Electron 版

进入 Electron 项目目录：

```powershell
cd windows-electron
npm install
npm run dist:win -- --config.win.signAndEditExecutable=false
```

构建完成后，常见产物位置：

```text
windows-electron/dist/提词器 4.6.0.exe
windows-electron/dist/提词器 Setup 4.6.0.exe
```

## 使用文档

- [使用指南](./使用指南.md)
- [功能介绍 - Tauri 版](./windows-tauri/功能介绍.md)
- [功能介绍 - Electron 版](./windows-electron/功能介绍.md)
- [打包说明](./docs/打包说明.md)
- [6.0 更新日志](./docs/更新日志-6.0.md)
- [发布清单](./docs/发布清单.md)

## 项目结构

```text
.
├── windows-tauri/       Tauri 桌面版本
├── windows-electron/    Electron 桌面版本
├── 使用指南.md          面向最终用户的操作说明
├── docs/                打包、更新日志、发布清单等文档
├── .gitignore           忽略构建缓存和本机依赖
└── README.md            项目总说明
```

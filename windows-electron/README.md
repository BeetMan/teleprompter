# 提词器 Electron 版

Electron 版是提词器的兼容桌面版本，当前产品版本为 `6.1.5`。它与 Tauri 版共享主要界面和提词功能，并通过 Electron 管理主窗口、第二屏输出和程序退出。

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

- Windows 10 或更高版本
- Node.js 20 LTS 或 22 LTS
- npm

## 开发运行

```powershell
npm install
npm start
```

## Windows 打包

```powershell
npm install
npm run dist:win -- --config.win.signAndEditExecutable=false
```

构建结果位于 `dist/`：

- `提词器 6.1.5.exe`：便携版
- `提词器 Setup 6.1.5.exe`：安装版

当前构建默认未配置 Windows 代码签名证书，部分设备可能显示 Smart App Control 或 SmartScreen 警告。

## 目录说明

- `index.html`：主界面、提词逻辑和样式
- `main.js`：Electron 主进程及窗口管理
- `preload.js`：主进程与网页之间的安全接口
- `resources/`：应用图标等资源
- `功能介绍.md`：完整功能说明

根目录的 `.github/workflows/release.yml` 会在推送版本标签时自动构建 Electron 和 Tauri 发布包。

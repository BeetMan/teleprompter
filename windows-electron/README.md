# 提词器 Electron 版

Electron 版是提词器的兼容桌面版本，当前版本为 `6.1.0`。它与 Tauri 版共享主要界面和提词功能，并通过 Electron 管理主窗口、第二屏输出和程序退出。

## 功能

- 稿件编辑及 `.txt`、`.md`、`.markdown`、`.docx` 导入
- 文件拖拽读取并保留原始连续空行
- 自动滚动、手动定位、速度调节和快捷键控制
- 独立第二屏输出，输出窗口不显示底部控制栏
- 主屏固定比例预览及双屏滚动同步
- 水平镜像、垂直镜像和两种明暗显示模式
- 字号、行距、字间距、宽度、水平位置和指示线调节
- 剩余字数、浏览进度条及指示线进度点
- 关闭主程序时彻底结束第二屏窗口和相关进程

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

- `提词器 6.1.0.exe`：便携版
- `提词器 Setup 6.1.0.exe`：安装版

## 目录说明

- `index.html`：主界面、提词逻辑和样式
- `main.js`：Electron 主进程及窗口管理
- `preload.js`：主进程与网页之间的安全接口
- `resources/`：应用图标等资源
- `功能介绍.md`：完整功能说明

## 常见问题

依赖下载较慢时，可以临时配置 npm 和 Electron 镜像：

```powershell
npm config set registry https://registry.npmmirror.com
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
npm install --no-audit
```

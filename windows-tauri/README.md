# 提词器 Tauri 版本

这是提词器的轻量桌面版本，目标是替代 Electron 包，减少安装体积并提升启动速度。

## 当前状态

- 复用现有网页 UI 和提词逻辑。
- 保留主窗口控制、第二屏输出、镜像仅作用于第二屏、Esc 关闭第二屏等功能。
- 使用 Tauri/Rust 实现第二屏窗口创建、关闭和状态同步。
- 版本号为 `4.0.0`。

## 运行前准备

Tauri 需要本机安装 Rust 工具链。当前电脑还没有检测到 `cargo`，所以暂时不能直接构建。

安装 Rust 后，重新打开终端并确认：

```powershell
rustc --version
cargo --version
```

## 开发运行

```powershell
npm install
npm run dev
```

## 打包

```powershell
npm run build
```

打包成功后，Windows 安装包会生成在：

```text
src-tauri\target\release\bundle
```

## 目录说明

- `web/index.html`：提词器网页 UI。
- `src-tauri/src/lib.rs`：Tauri 主逻辑，负责第二屏窗口和状态同步。
- `src-tauri/tauri.conf.json`：Tauri 应用配置。
- `功能介绍.md`：面向用户的功能介绍文档。

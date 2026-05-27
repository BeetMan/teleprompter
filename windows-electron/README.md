# Windows 打包 v2.0

这个目录用于把提词器网页打包成 Windows 程序。

在 Windows 电脑上运行：

```powershell
npm install
npm run dist:win
```

生成结果会在 `dist` 目录里：

- `提词器 ... .exe`：安装版
- `提词器 ... portable.exe`：便携版

如果只想先预览：

```powershell
npm install
npm start
```

如果安装依赖报错，建议使用 Node.js 22 LTS 或 20 LTS，然后清理后重装：

```powershell
rd /s /q node_modules
del package-lock.json
npm cache clean --force
npm config set registry https://registry.npmmirror.com
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
npm install --no-audit
```

# layafill

A Chromium-based browser extension that fills job applications automatically.

## Setup

### Laya server (optional)

```powershell
powershell -ExecutionPolicy Bypass -File server\setup.ps1   # -Cpu if you have no NVIDIA GPU
powershell -ExecutionPolicy Bypass -File server\start.ps1   # add -Device cpu if you have no NVIDIA GPU
```

Without the server, the extension still fills everything the rules recognize.

### Extension

```powershell
npm install
npm run build
```

Open `chrome://extensions` (or whatever browser in use), turn on "**Developer mode**", click "**Load unpacked**", and choose the `dist` folder. Then, click "**Profile & settings**".

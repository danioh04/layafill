# Runs laya-serve on 127.0.0.1 for the layafill extension.
# Usage: powershell -ExecutionPolicy Bypass -File server\start.ps1 [-Model typed-decisions] [-Device cuda] [-Port 8000] [-ApiKey secret]
param(
    [ValidateSet("english", "multilingual", "typed-decisions")]
    [string]$Model = "typed-decisions",
    [ValidateSet("cuda", "cpu")]
    [string]$Device = "cuda",
    [int]$Port = 8000,
    [string]$ApiKey = ""
)

$ErrorActionPreference = "Stop"
$serve = Join-Path $PSScriptRoot ".venv\Scripts\laya-serve.exe"
if (-not (Test-Path $serve)) {
    throw "laya-serve not found. Run server\setup.ps1 first."
}

# Localhost only: the extension is the only client.
$env:LAYA_HOST = "127.0.0.1"
$env:LAYA_PORT = "$Port"
$env:LAYA_DEVICE = $Device
# Preload just one checkpoint so it fits comfortably in 4 GB of VRAM.
$env:LAYA_MODELS = $Model
$env:LAYA_PRELOAD = "1"
# fp16 tracks the fp32 forward more closely than the bf16 default (Laya README).
$env:LAYA_CUDA_AMP = "fp16"
# Windows without Developer Mode cannot symlink; the cache still works, so hide the warning.
$env:HF_HUB_DISABLE_SYMLINKS_WARNING = "1"
if ($ApiKey) { $env:LAYA_API_KEY = $ApiKey } else { Remove-Item Env:LAYA_API_KEY -ErrorAction SilentlyContinue }

Write-Host "laya-serve: model=$Model device=$Device http://127.0.0.1:$Port"
& $serve

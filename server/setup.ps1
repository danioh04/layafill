# Creates server/.venv with CUDA PyTorch and laya-serve.
# Usage: powershell -ExecutionPolicy Bypass -File server\setup.ps1 [-Cpu]
param(
    [switch]$Cpu,
    [string]$CudaIndex = "https://download.pytorch.org/whl/cu130"
)

$ErrorActionPreference = "Stop"
$venv = Join-Path $PSScriptRoot ".venv"
$python = Join-Path $venv "Scripts\python.exe"

if (-not (Test-Path $python)) {
    Write-Host "Creating virtual environment in $venv"
    py -3.11 -m venv $venv
    if ($LASTEXITCODE -ne 0) { throw "Could not create the venv. Is Python 3.11 installed (py -3.11)?" }
}

& $python -m pip install --quiet --upgrade pip
if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed" }

if ($Cpu) {
    Write-Host "Installing CPU PyTorch"
    & $python -m pip install --quiet torch
} else {
    Write-Host "Installing CUDA PyTorch from $CudaIndex"
    & $python -m pip install --quiet torch --index-url $CudaIndex
}
if ($LASTEXITCODE -ne 0) { throw "PyTorch install failed" }

Write-Host "Installing laya[serve]"
& $python -m pip install --quiet -r (Join-Path $PSScriptRoot "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "laya install failed" }

& $python -I -c "import laya, torch; print('laya', laya.__version__); print('torch', torch.__version__); print('cuda available:', torch.cuda.is_available()); print('device:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'cpu')"
if ($LASTEXITCODE -ne 0) { throw "Verification failed" }

Write-Host "Done. Start the server with: powershell -ExecutionPolicy Bypass -File server\start.ps1"

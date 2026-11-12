$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    if (-not (Test-Path '.venv')) {
        & py -3.13 -c "import sys; assert sys.version_info[:2] == (3, 13)"
        if ($LASTEXITCODE -ne 0) { throw 'Install Python 3.13 with the Windows py launcher.' }
        & py -3.13 -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw 'Could not create .venv.' }
    }
    $venvPython = Join-Path $projectRoot '.venv/Scripts/python.exe'
    if (-not (Test-Path $venvPython)) { throw 'Existing .venv is invalid; it was not modified.' }
    & $venvPython -c "import sys; assert sys.version_info[:2] == (3, 13), 'Existing .venv must use Python 3.13'"
    if ($LASTEXITCODE -ne 0) { throw 'Wrong Python version. Preserve or rename your old environment manually.' }
    & $venvPython -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) { throw 'pip upgrade failed. Check network and permissions.' }
    & $venvPython -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check the pip error above.' }
    & $venvPython -c "import gymnasium, numpy, torch, pandas, matplotlib, streamlit, yaml, pytest; import importlib.metadata as m; print({p: m.version(p) for p in ['gymnasium','numpy','torch','pandas','matplotlib','streamlit','PyYAML','pytest','ruff']}); print('CPU tensor:', torch.ones(1, device='cpu'))"
    if ($LASTEXITCODE -ne 0) { throw 'Dependency import or CPU smoke check failed.' }
    Write-Host 'Setup completed successfully.'
} finally {
    Pop-Location
}

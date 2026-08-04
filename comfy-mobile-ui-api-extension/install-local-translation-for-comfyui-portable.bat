@echo off
setlocal

set "COMFY_PYTHON=%~dp0..\..\..\python_embeded\python.exe"
set "LOCAL_REQUIREMENTS=%~dp0requirements-local-translation.txt"

if not exist "%COMFY_PYTHON%" (
  echo [ComfyMobileUI] ComfyUI portable Python was not found:
  echo %COMFY_PYTHON%
  pause
  exit /b 1
)

echo [ComfyMobileUI] Installing optional Argos local translation support...
"%COMFY_PYTHON%" -m pip install -r "%LOCAL_REQUIREMENTS%"
if errorlevel 1 (
  echo.
  echo [ComfyMobileUI] Installation failed.
  pause
  exit /b 1
)

echo.
echo [ComfyMobileUI] Installation complete. Restart ComfyUI, then install
echo only the language packs you need from the string translation panel.
pause

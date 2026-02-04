@echo off
setlocal

REM ===============================================================
REM  Comfy Mobile UI API Extension - Portable Installer
REM  (For Vanilla Portable environments without ComfyUI-Manager)
REM
REM  Place this .bat in:
REM    ComfyUI\custom_nodes\comfy-mobile-ui-api-extension\
REM ===============================================================

echo.
echo [*] ComfyUI Mobile UI API Extension - Installer for Vanilla Portable
echo.

for %%i in ("%~dp0..\..\..\python_embeded\python.exe") do set "PYTHON_EXE=%%~fi"

if not exist "%PYTHON_EXE%" (
    echo [ERROR] Embedded python not found at:
    echo   %PYTHON_EXE%
    echo.
    echo This script is specifically for the ComfyUI Windows Portable version.
    echo It seems you are not using the Portable version or the file is missing.
    echo.
    echo If you are using a regular Python environment, please install 
    echo requirements manually:
    echo   pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

echo.
echo [*] Installing requirements for ComfyUI Mobile UI API Extension...
echo [*] Target Python: %PYTHON_EXE%
echo.

"%PYTHON_EXE%" -s -m pip install -r "%~dp0requirements.txt"

echo.
echo [!] Installation complete. Please restart ComfyUI.
echo.
pause
endlocal

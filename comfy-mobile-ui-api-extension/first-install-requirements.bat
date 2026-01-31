@echo off
setlocal enabledelayedexpansion

REM =========================================================
REM  Comfy Mobile UI API Extension - Portable Installer
REM  Place this .bat in:
REM    ComfyUI\custom_nodes\comfy-mobile-ui-api-extension\
REM =========================================================

REM Try to locate embedded python relative to this script:
REM custom_nodes\comfy-mobile-ui-api-extension\ -> back up 2 levels to ComfyUI\ then 1 to portable root
set "SCRIPT_DIR=%~dp0"
set "PYTHON_EXE=%SCRIPT_DIR%..\..\..\python_embeded\python.exe"

set "REQ_TXT=%SCRIPT_DIR%requirements.txt"
set "REPAIR_TXT=%SCRIPT_DIR%repair_dependency_list.txt"

echo Installing Comfy Mobile UI API Extension with ComfyUI Portable
echo.

if not exist "%PYTHON_EXE%" (
  echo [ERROR] Embedded python not found at:
  echo   %PYTHON_EXE%
  echo.
  echo Edit PYTHON_EXE in this script to point at your python_embeded\python.exe
  pause
  exit /b 1
)

REM Ensure pip exists
echo Ensuring pip...
"%PYTHON_EXE%" -s -m ensurepip >nul 2>&1
"%PYTHON_EXE%" -s -m pip --version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] pip is not available in the embedded python.
  echo Try running:
  echo   "%PYTHON_EXE%" -s -m ensurepip
  pause
  exit /b 1
)

echo.
echo Upgrading pip (safe)...
"%PYTHON_EXE%" -s -m pip install --upgrade pip

echo.
echo Installing core dependency needed by this extension...
"%PYTHON_EXE%" -s -m pip install aiofiles

REM If the extension provides a requirements.txt, install everything in it line-by-line
if exist "%REQ_TXT%" (
  echo.
  echo Installing requirements.txt...
  "%PYTHON_EXE%" -s -m pip install -r "%REQ_TXT%"
) else (
  echo.
  echo No requirements.txt found at:
  echo   %REQ_TXT%
  echo (That's okay.)
)

REM Optional repair pass (only if repair list exists)
if exist "%REPAIR_TXT%" (
  echo.
  echo Fixing dependency packages (repair list)...
  REM Only do opencv nuking if your repair list expects it; otherwise comment this out.
  "%PYTHON_EXE%" -s -m pip uninstall -y opencv-python opencv-contrib-python opencv-python-headless opencv-contrib-python-headless

  for /f "usebackq delims=" %%i in ("%REPAIR_TXT%") do (
    if not "%%i"=="" (
      echo   - %%i
      "%PYTHON_EXE%" -s -m pip install "%%i"
    )
  )
) else (
  echo.
  echo No repair_dependency_list.txt found (skipping repair step).
)

echo.
echo Install finished.
echo Restart ComfyUI after this.
pause
endlocal

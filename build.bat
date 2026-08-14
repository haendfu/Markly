@echo off
title Markly Build
cd /d "%~dp0"

echo ============================================
echo   Markly one-click build
echo   Output in release\ :
echo     - Markly-Setup-*.exe  installer (no admin required)
echo     - Markly-Portable.zip portable
echo ============================================
echo.

if not exist node_modules (
  echo [1/2] Installing dependencies...
  call npm install
  if errorlevel 1 goto :fail
)

echo [2/2] Building installer and portable zip...
node scripts\build.mjs
if errorlevel 1 goto :fail

echo.
echo Done! Output in release\
explorer "release"
pause
exit /b 0

:fail
echo.
echo *** BUILD FAILED - check errors above ***
pause
exit /b 1

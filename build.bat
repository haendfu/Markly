@echo off
chcp 65001 >nul
title Markly 一键打包
cd /d "%~dp0"

echo ============================================
echo   Markly 一键打包
echo   产物: release\ 目录
echo     - Markly-Setup-*.exe  安装包（免管理员）
echo     - Markly-Portable.zip 便携版
echo ============================================
echo.

if not exist node_modules (
  echo [1/2] 安装依赖...
  call npm install || goto :fail
)

echo [2/2] 构建安装包与便携版...
node scripts\build.mjs || goto :fail

echo.
echo 打包完成！产物在 release\ 目录。
explorer "release"
pause
exit /b 0

:fail
echo.
echo *** 打包失败，请检查上方错误信息 ***
pause
exit /b 1

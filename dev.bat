@echo off
chcp 65001 >nul
title Markly 开发模式
cd /d "%~dp0"
node node_modules\@tauri-apps\cli\tauri.js dev
pause

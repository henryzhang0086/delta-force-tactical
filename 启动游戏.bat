@echo off
chcp 65001 >nul
title 三角洲行动 · Delta Force Tactical
cd /d "%~dp0"

echo ============================================
echo   三角洲行动 · 启动中心（3D 高清 / 经典 2D）
echo ============================================
echo.

rem 端口 8199（避开被占用的 8080）
set PORT=8199

where py >nul 2>nul
if %errorlevel%==0 (
  echo 正在启动本地服务器 http://localhost:%PORT% ...
  start "" http://localhost:%PORT%/index.html
  py -m http.server %PORT%
  goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
  echo 正在启动本地服务器 http://localhost:%PORT% ...
  start "" http://localhost:%PORT%/index.html
  python -m http.server %PORT%
  goto :eof
)

echo 未检测到 Python，直接用浏览器打开 index.html
start "" "index.html"

@echo off
title 智能断路器监控系统 - 停止服务
chcp 65001 >nul

echo ====================================
echo    智能断路器监控系统 - 停止服务
echo ====================================
echo.

echo 正在停止所有相关服务...
echo.

echo 停止Node.js进程...
taskkill /f /im node.exe >nul 2>&1

echo 停止npm进程...
taskkill /f /im npm.cmd >nul 2>&1

echo 停止nodemon进程...
taskkill /f /im nodemon.exe >nul 2>&1

echo.
echo ✅ 所有服务已停止！
echo.
pause 
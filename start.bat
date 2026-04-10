@echo off
title 智能断路器监控系统启动器
chcp 65001 >nul

echo 启动后端服务...
start "后端服务" cmd /k "cd /d %~dp0src && npm start"

timeout /t 3 /nobreak >nul

echo 启动前端服务...
start "前端服务" cmd /k "cd /d %~dp0 && npm run dev"

echo 所有服务已启动！
echo 后端: http://localhost:3000
echo 前端: http://localhost:8000
pause 
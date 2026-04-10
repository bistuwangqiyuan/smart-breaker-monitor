@echo off
title 智能断路器监控系统 - 开发模式
chcp 65001 >nul

echo ====================================
echo    智能断路器监控系统 - 开发模式
echo ====================================
echo.

echo 🔧 开发模式特性:
echo    - 后端支持热重载 (nodemon)
echo    - 前端支持热重载 (Vite HMR)
echo    - 代码修改自动生效
echo.

echo 启动后端开发服务 (nodemon)...
start "后端开发服务" cmd /k "cd /d %~dp0src && npm run dev"

timeout /t 3 /nobreak >nul

echo 启动前端开发服务 (Vite)...
start "前端开发服务" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo ✅ 开发环境启动完成！
echo.
echo 📡 后端API: http://localhost:3000
echo 🌐 前端界面: http://localhost:8000
echo.
echo 💡 开发提示:
echo    - 修改代码后会自动重载
echo    - 查看各自窗口的日志信息
echo    - 使用 stop.bat 停止所有服务
echo.
pause 
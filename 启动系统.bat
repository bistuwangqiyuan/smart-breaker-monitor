@echo off
chcp 65001 >nul
echo ====================================
echo    智能断路器监控系统 - 一键启动
echo ====================================
echo.

echo 正在启动服务...
echo.

echo [1/2] 启动后端服务 (端口3000)...
start "后端服务 - 智能断路器监控系统" cmd /k "cd /d %~dp0src && npm start"

echo [2/2] 等待2秒后启动前端服务 (端口8000)...
timeout /t 2 /nobreak >nul

start "前端服务 - 智能断路器监控系统" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo ✅ 服务启动完成！
echo.
echo 📡 后端API服务: http://localhost:3000
echo 🌐 前端界面:   http://localhost:8000
echo.
echo 💡 提示:
echo    - 两个服务将在独立的命令行窗口中运行
echo    - 关闭对应窗口即可停止相应服务
echo    - 建议先启动后端服务，再启动前端服务
echo.
pause 
/**
 * 智能断路器监控系统 - 服务器启动入口 (CommonJS版本)
 */
console.log('正在启动智能断路器监控系统服务器...');

// 使用CommonJS格式
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// 启动src下的服务器
try {
  console.log('加载服务器模块...');
  
  // 确认src/index.js文件存在
  const indexPath = path.join(__dirname, 'src', 'index.js');
  if (!fs.existsSync(indexPath)) {
    console.error(`错误: 找不到文件 ${indexPath}`);
    process.exit(1);
  }
  
  console.log(`启动后端服务: ${indexPath}`);
  
  // 启动后端服务
  const server = spawn('node', [indexPath], {
    stdio: 'inherit',
    shell: true
  });
  
  server.on('error', (error) => {
    console.error('服务器启动失败:', error.message);
    process.exit(1);
  });
  
  process.on('exit', () => {
    console.log('正在关闭服务器...');
    if (server && !server.killed) {
      server.kill();
    }
  });
  
  // 处理进程退出
  process.on('SIGINT', () => {
    console.log('收到终止信号，正在关闭服务器...');
    if (server && !server.killed) {
      server.kill('SIGINT');
    }
    process.exit(0);
  });
  
  console.log('服务器已启动，按Ctrl+C终止服务');
} catch (error) {
  console.error('启动失败:', error.message);
  console.error(error.stack);
  process.exit(1);
} 
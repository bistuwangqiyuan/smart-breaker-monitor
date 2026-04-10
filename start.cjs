/**
 * 智能断路器监控系统 - 启动脚本
 */
console.log('正在启动智能断路器监控系统...');

// 使用CommonJS格式
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// 确保目录存在
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`创建目录: ${dirPath}`);
  }
}

// 启动前的准备
function prepare() {
  console.log('开始启动前准备...');
  
  // 创建必要的目录
  ensureDirectoryExists(path.join(__dirname, 'exports'));
  ensureDirectoryExists(path.join(__dirname, 'data'));
  
  console.log('准备工作完成');
}

// 启动后端服务
function startBackend() {
  console.log('正在启动后端服务...');
  
  // 使用node执行index.cjs
  const backend = exec('node index.cjs', (error, stdout, stderr) => {
    if (error) {
      console.error(`后端启动错误: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`后端错误输出: ${stderr}`);
      return;
    }
    console.log(`后端输出: ${stdout}`);
  });
  
  backend.stdout.on('data', (data) => {
    console.log(`后端: ${data}`);
  });
  
  backend.stderr.on('data', (data) => {
    console.error(`后端错误: ${data}`);
  });
  
  backend.on('close', (code) => {
    console.log(`后端进程已退出，退出码: ${code}`);
  });
  
  // 在进程退出时关闭子进程
  process.on('exit', () => {
    backend.kill();
  });
  
  // 处理Ctrl+C等中断信号
  process.on('SIGINT', () => {
    console.log('收到中断信号，正在关闭服务...');
    backend.kill();
    process.exit(0);
  });
  
  return backend;
}

// 启动前端开发服务器
function startFrontend() {
  console.log('正在启动前端开发服务器...');
  
  // 使用npm run dev启动前端
  const frontend = exec('npm run dev', (error, stdout, stderr) => {
    if (error) {
      console.error(`前端启动错误: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`前端错误输出: ${stderr}`);
      return;
    }
    console.log(`前端输出: ${stdout}`);
  });
  
  frontend.stdout.on('data', (data) => {
    console.log(`前端: ${data}`);
  });
  
  frontend.stderr.on('data', (data) => {
    console.error(`前端错误: ${data}`);
  });
  
  frontend.on('close', (code) => {
    console.log(`前端进程已退出，退出码: ${code}`);
  });
  
  return frontend;
}

// 主函数
function main() {
  prepare();
  
  // 先启动后端
  const backendProcess = startBackend();
  
  // 等待后端启动完成后再启动前端
  setTimeout(() => {
    const frontendProcess = startFrontend();
    
    // 在进程退出时关闭前端子进程
    process.on('exit', () => {
      frontendProcess.kill();
    });
    
    console.log('所有服务已启动，按Ctrl+C终止所有服务');
  }, 3000);
}

// 执行主函数
main(); 
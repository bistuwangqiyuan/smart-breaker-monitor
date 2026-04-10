/**
 * 智能断路器监控系统 - 服务器启动入口
 */
console.log('正在启动智能断路器监控系统服务器...');

// 启动src下的服务器
try {
  console.log('加载服务器模块...');
  
  // ES模块兼容性处理
  import('child_process').then(({ spawn }) => {
    console.log('启动后端服务...');
    
    // 启动后端服务
    const server = spawn('node', ['src/index.js'], {
      stdio: 'inherit',
      shell: true
    });
    
    server.on('error', (error) => {
      console.error('服务器启动失败:', error.message);
      process.exit(1);
    });
    
    // 处理进程退出
    process.on('SIGINT', () => {
      console.log('正在关闭服务器...');
      server.kill('SIGINT');
      process.exit(0);
    });
    
    console.log('服务器已启动，按Ctrl+C终止服务');
  }).catch(error => {
    console.error('加载子进程模块失败:', error.message);
    process.exit(1);
  });
} catch (error) {
  console.error('启动失败:', error.message);
  process.exit(1);
} 
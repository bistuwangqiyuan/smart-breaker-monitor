const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const winston = require('winston');
const serialService = require('./serialService');
const exportService = require('./exportService');
const wsService = require('./wsService');

// 创建日志记录器
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'server.log' })
  ]
});

// 创建导出目录
const EXPORT_DIR = path.join(__dirname, 'exports');
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

// 创建Express应用
const app = express();
const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 8080;

// 中间件
app.use(cors());
app.use(express.json());

// 静态文件服务
app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));

// API路由
// 获取可用串口列表
app.get('/api/ports', async (req, res) => {
  try {
    const ports = await serialService.listPorts();
    res.json(ports);
  } catch (error) {
    logger.error(`获取串口列表失败: ${error.message}`);
    res.status(500).json({ error: '获取串口列表失败' });
  }
});

// 连接串口
app.post('/api/connect', async (req, res) => {
  const { path, options } = req.body;
  try {
    const result = await serialService.connect(path, options);
    if (result) {
      res.json({ success: true, message: '串口连接成功' });
    } else {
      res.status(500).json({ success: false, error: '串口连接失败' });
    }
  } catch (error) {
    logger.error(`连接串口失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 断开串口连接
app.post('/api/disconnect', async (req, res) => {
  try {
    await serialService.disconnect();
    res.json({ success: true, message: '串口已断开连接' });
  } catch (error) {
    logger.error(`断开串口连接失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 发送关断命令
app.post('/api/shutdown', async (req, res) => {
  try {
    await serialService.sendShutdownCommand();
    res.json({ success: true, message: '关断命令已发送' });
  } catch (error) {
    logger.error(`发送关断命令失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 发送开启命令
app.post('/api/start', async (req, res) => {
  try {
    await serialService.sendStartCommand();
    res.json({ success: true, message: '开启命令已发送' });
  } catch (error) {
    logger.error(`发送开启命令失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取当前数据
app.get('/api/data/current', (req, res) => {
  const data = serialService.getCurrentData();
  res.json(data);
});

// 获取历史数据
app.get('/api/data/history', (req, res) => {
  const data = serialService.getDataHistory();
  res.json(data);
});

// 清除历史数据
app.post('/api/data/clear', (req, res) => {
  serialService.clearDataHistory();
  res.json({ success: true, message: '历史数据已清除' });
});

// 导出数据到Excel
app.post('/api/export', async (req, res) => {
  const { deviceAddr } = req.body;
  try {
    const data = serialService.getCurrentData();
    if (!data || !data.current || !data.voltage || data.current.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: '没有可用数据进行导出' 
      });
    }
    
    const result = await exportService.exportData(deviceAddr || 1, data);
    if (result.success) {
      res.json({
        success: true,
        fileName: result.fileName,
        message: '数据导出成功'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || '导出数据失败'
      });
    }
  } catch (error) {
    logger.error(`导出数据失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取导出文件列表
app.get('/api/exports', (req, res) => {
  try {
    const files = exportService.listExportedFiles();
    res.json(files);
  } catch (error) {
    logger.error(`获取导出文件列表失败: ${error.message}`);
    res.status(500).json({ error: '获取导出文件列表失败' });
  }
});

// 下载导出文件
app.get('/api/exports/:fileName', (req, res) => {
  try {
    const filePath = exportService.getFilePath(req.params.fileName);
    res.download(filePath);
  } catch (error) {
    logger.error(`下载文件失败: ${error.message}`);
    res.status(500).json({ error: '下载文件失败' });
  }
});

// 删除导出文件
app.delete('/api/exports/:fileName', (req, res) => {
  try {
    const result = exportService.deleteFile(req.params.fileName);
    if (result) {
      res.json({ success: true, message: '文件已删除' });
    } else {
      res.status(500).json({ success: false, error: '删除文件失败' });
    }
  } catch (error) {
    logger.error(`删除文件失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 前端路由处理
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
});

// 启动服务器
app.listen(PORT, () => {
  logger.info(`HTTP服务器启动在端口 ${PORT}`);
});

// 启动WebSocket服务器
wsService.init(WS_PORT);
logger.info(`WebSocket服务器启动在端口 ${WS_PORT}`);

// 将串口数据广播到WebSocket客户端
serialService.on('data', (data) => {
  wsService.broadcast({
    type: 'serialData',
    data
  });
});

// 将串口连接状态广播到WebSocket客户端
serialService.on('connected', (path) => {
  wsService.broadcast({
    type: 'serialStatus',
    status: 'connected',
    path
  });
});

serialService.on('disconnected', () => {
  wsService.broadcast({
    type: 'serialStatus',
    status: 'disconnected'
  });
});

// 优雅关闭
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown() {
  logger.info('正在关闭服务器...');
  
  try {
    await serialService.disconnect();
    wsService.close();
    
    logger.info('服务器已关闭');
    process.exit(0);
  } catch (error) {
    logger.error(`关闭服务器时出错: ${error.message}`);
    process.exit(1);
  }
} 
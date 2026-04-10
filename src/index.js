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

// 日志级别配置
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

// 创建导出目录
const EXPORT_DIR = path.join(__dirname, '..', 'exports');
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

// 创建Express应用
const app = express();
const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 8080;

// 中间件
// 允许所有跨域请求
app.use(cors({
  origin: '*', // 允许所有来源
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// 日志中间件
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// 错误处理中间件
app.use((err, req, res, next) => {
  logger.error(`API错误: ${err.message}`);
  res.status(500).json({ success: false, error: '服务器内部错误' });
});

// 静态文件服务 - 使用内部前端文件
app.use(express.static(path.join(__dirname, '..', 'public')));

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
    const result = await serialService.sendShutdownCommand();
    if (result) {
      res.json({ success: true, message: '关断命令已发送' });
    } else {
      res.status(500).json({ success: false, error: '发送关断命令失败' });
    }
  } catch (error) {
    logger.error(`发送关断命令失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 发送开启命令
app.post('/api/start', async (req, res) => {
  try {
    const result = await serialService.sendStartCommand();
    if (result) {
      res.json({ success: true, message: '开启命令已发送' });
    } else {
      res.status(500).json({ success: false, error: '发送开启命令失败' });
    }
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

// 设置日志级别
app.post('/api/logs/level', (req, res) => {
  const { level } = req.body;
  
  if (!level || !logLevels.hasOwnProperty(level)) {
    return res.status(400).json({ 
      success: false, 
      error: '无效的日志级别，可选值: error, warn, info, debug' 
    });
  }
  
  try {
    // 设置主日志记录器的级别
    logger.level = level;
    
    // 如果有访问其他模块的记录器，也设置它们
    if (serialService.logger) {
      serialService.logger.level = level;
    }
    
    if (exportService.logger) {
      exportService.logger.level = level;
    }
    
    if (wsService.logger) {
      wsService.logger.level = level;
    }
    
    logger.info(`日志级别已设置为: ${level}`);
    res.json({ success: true, message: `日志级别已设置为: ${level}` });
  } catch (error) {
    logger.error(`设置日志级别失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 导出数据到Excel
app.post('/api/export', async (req, res) => {
  const { deviceAddr } = req.body;
  try {
    const data = serialService.getCurrentData();
    if (!data || ((!data.current || data.current.length === 0) && (!data.voltage || data.voltage.length === 0))) {
      return res.status(400).json({ 
        success: false, 
        error: '没有任何可用数据进行导出' 
      });
    }
    
    if (!data.current) data.current = [];
    if (!data.voltage) data.voltage = [];
    
    // 使用数据中的实际设备地址，或者API传入的地址，或者默认值1
    const actualDeviceAddr = data.deviceAddr || deviceAddr || 1;
    logger.info(`导出数据，使用设备地址: ${actualDeviceAddr}`);
    
    const result = await exportService.exportData(actualDeviceAddr, data);
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

// 获取所有数据文件列表
app.get('/api/data/files', (req, res) => {
  try {
    const files = serialService.getDataFiles();
    res.json(files);
  } catch (error) {
    logger.error(`获取数据文件列表失败: ${error.message}`);
    res.status(500).json({ error: '获取数据文件列表失败' });
  }
});

// 下载数据文件
app.get('/api/data/files/:fileName', (req, res) => {
  try {
    const filePath = serialService.getDataFilePath(req.params.fileName);
    res.download(filePath);
  } catch (error) {
    logger.error(`下载数据文件失败: ${error.message}`);
    res.status(500).json({ error: '下载数据文件失败' });
  }
});

// 删除数据文件
app.delete('/api/data/files/:fileName', (req, res) => {
  try {
    const result = serialService.deleteDataFile(req.params.fileName);
    if (result) {
      res.json({ success: true, message: '数据文件已删除' });
    } else {
      res.status(500).json({ success: false, error: '删除数据文件失败' });
    }
  } catch (error) {
    logger.error(`删除数据文件失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取数据文件统计信息
app.get('/api/data/stats', (req, res) => {
  try {
    const files = serialService.getDataFiles();
    const stats = {
      totalFiles: files.length,
      filesByType: {
        json: files.filter(f => f.type === 'json').length,
        csv: files.filter(f => f.type === 'csv').length,
        bin: files.filter(f => f.type === 'bin').length
      },
      latestFile: files.length > 0 ? files[0] : null,
      recordStart: files.length > 0 ? files[files.length - 1].created : null,
      recordEnd: files.length > 0 ? files[0].created : null
    };
    
    // 计算存储空间
    let totalSize = 0;
    for (const file of files) {
      try {
        const fileStats = fs.statSync(file.path);
        totalSize += fileStats.size;
      } catch (error) {
        // 忽略无法获取大小的文件
      }
    }
    
    stats.totalSizeBytes = totalSize;
    stats.totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    
    res.json(stats);
  } catch (error) {
    logger.error(`获取数据统计信息失败: ${error.message}`);
    res.status(500).json({ error: '获取数据统计信息失败' });
  }
});

// 删除所有数据文件
app.delete('/api/data/files', (req, res) => {
  try {
    const files = serialService.getDataFiles();
    let deletedCount = 0;
    let failedCount = 0;
    
    for (const file of files) {
      if (serialService.deleteDataFile(file.name)) {
        deletedCount++;
      } else {
        failedCount++;
      }
    }
    
    res.json({
      success: true,
      message: `已删除 ${deletedCount} 个数据文件，失败 ${failedCount} 个`
    });
  } catch (error) {
    logger.error(`删除所有数据文件失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 设置最大缓存大小
app.post('/api/cache/max-size', (req, res) => {
  const { size } = req.body;
  
  if (!size || typeof size !== 'number' || size <= 0) {
    return res.status(400).json({ 
      success: false, 
      error: '无效的缓存大小，必须是大于0的数字' 
    });
  }
  
  try {
    const result = serialService.setMaxCacheSize(size);
    if (result) {
      logger.info(`最大缓存大小已设置为: ${size}`);
      res.json({ success: true, message: `最大缓存大小已设置为: ${size}` });
    } else {
      res.status(500).json({ success: false, error: '设置缓存大小失败' });
    }
  } catch (error) {
    logger.error(`设置缓存大小失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取当前最大缓存大小
app.get('/api/cache/max-size', (req, res) => {
  try {
    const size = serialService.getMaxCacheSize();
    res.json({ size });
  } catch (error) {
    logger.error(`获取缓存大小失败: ${error.message}`);
    res.status(500).json({ error: '获取缓存大小失败' });
  }
});

// 设置最大数据文件数量
app.post('/api/files/max-count', (req, res) => {
  const { count } = req.body;
  
  if (!count || typeof count !== 'number' || count <= 0) {
    return res.status(400).json({ 
      success: false, 
      error: '无效的文件数量，必须是大于0的数字' 
    });
  }
  
  try {
    const result = serialService.setMaxDataFiles(count);
    if (result) {
      logger.info(`最大数据文件数量已设置为: ${count}`);
      res.json({ success: true, message: `最大数据文件数量已设置为: ${count}` });
    } else {
      res.status(500).json({ success: false, error: '设置最大数据文件数量失败' });
    }
  } catch (error) {
    logger.error(`设置最大数据文件数量失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取当前最大数据文件数量
app.get('/api/files/max-count', (req, res) => {
  try {
    const count = serialService.getMaxDataFiles();
    res.json({ count });
  } catch (error) {
    logger.error(`获取最大数据文件数量失败: ${error.message}`);
    res.status(500).json({ error: '获取最大数据文件数量失败' });
  }
});

// 设置是否启用自动清理内存缓存
app.post('/api/cache/auto-clean', (req, res) => {
  const { enabled } = req.body;
  
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ 
      success: false, 
      error: '参数错误，enabled必须是布尔值' 
    });
  }
  
  try {
    const result = serialService.setAutoCleanMemoryCache(enabled);
    if (result) {
      logger.info(`内存缓存自动清理已${enabled ? '启用' : '禁用'}`);
      res.json({ 
        success: true, 
        message: `内存缓存自动清理已${enabled ? '启用' : '禁用'}` 
      });
    } else {
      res.status(500).json({ success: false, error: '设置内存缓存自动清理状态失败' });
    }
  } catch (error) {
    logger.error(`设置内存缓存自动清理状态失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取当前内存缓存自动清理状态
app.get('/api/cache/auto-clean', (req, res) => {
  try {
    const enabled = serialService.getAutoCleanMemoryCache();
    res.json({ enabled });
  } catch (error) {
    logger.error(`获取内存缓存自动清理状态失败: ${error.message}`);
    res.status(500).json({ error: '获取内存缓存自动清理状态失败' });
  }
});

// 手动清理数据文件
app.post('/api/data/clean-files', (req, res) => {
  try {
    const result = serialService.manualCleanDataFiles();
    if (result.success) {
      logger.info(`手动清理数据文件成功: 已删除${result.deletedCount}个文件，失败${result.failedCount}个`);
      res.json({
        success: true,
        message: `已清理数据文件: 删除了${result.deletedCount}个文件，失败${result.failedCount}个`,
        result
      });
    } else {
      logger.error(`手动清理数据文件失败: ${result.error}`);
      res.status(500).json({
        success: false,
        error: result.error || '清理数据文件失败'
      });
    }
  } catch (error) {
    logger.error(`手动清理数据文件失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================== 自动导出配置API =====================

// 设置自动导出开关
app.post('/api/auto-export/enabled', (req, res) => {
  const { enabled } = req.body;
  
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ 
      success: false, 
      error: '参数错误，enabled必须是布尔值' 
    });
  }
  
  try {
    const result = exportService.setAutoExportEnabled(enabled);
    if (result) {
      logger.info(`自动导出功能已${enabled ? '启用' : '禁用'}`);
      res.json({ 
        success: true, 
        message: `自动导出功能已${enabled ? '启用' : '禁用'}` 
      });
    } else {
      res.status(500).json({ success: false, error: '设置自动导出状态失败' });
    }
  } catch (error) {
    logger.error(`设置自动导出状态失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取自动导出状态
app.get('/api/auto-export/enabled', (req, res) => {
  try {
    const enabled = exportService.getAutoExportEnabled();
    res.json({ enabled });
  } catch (error) {
    logger.error(`获取自动导出状态失败: ${error.message}`);
    res.status(500).json({ error: '获取自动导出状态失败' });
  }
});

// 设置文件名模板
app.post('/api/auto-export/filename-template', (req, res) => {
  const { template } = req.body;
  
  if (!template || typeof template !== 'string') {
    return res.status(400).json({ 
      success: false, 
      error: '参数错误，template必须是非空字符串' 
    });
  }
  
  try {
    const result = exportService.setCustomFileNameTemplate(template);
    if (result) {
      logger.info(`文件名模板已设置为: ${template}`);
      res.json({ 
        success: true, 
        message: `文件名模板已设置为: ${template}` 
      });
    } else {
      res.status(500).json({ success: false, error: '设置文件名模板失败' });
    }
  } catch (error) {
    logger.error(`设置文件名模板失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取当前文件名模板
app.get('/api/auto-export/filename-template', (req, res) => {
  try {
    const template = exportService.getCustomFileNameTemplate();
    res.json({ 
      template,
      availableVariables: [
        '{deviceAddr} - 设备地址',
        '{deviceType} - 设备类型',
        '{timestamp} - 完整时间戳 (ISO格式)',
        '{date} - 日期 (YYYY-MM-DD)',
        '{time} - 时间 (HH-MM-SS)'
      ]
    });
  } catch (error) {
    logger.error(`获取文件名模板失败: ${error.message}`);
    res.status(500).json({ error: '获取文件名模板失败' });
  }
});

// 设置用户自定义文件名前缀
app.post('/api/auto-export/user-filename', (req, res) => {
  const { fileName } = req.body;
  
  if (typeof fileName !== 'string') {
    return res.status(400).json({ 
      success: false, 
      error: '参数错误，fileName必须是字符串' 
    });
  }
  
  try {
    const result = exportService.setUserCustomFileName(fileName);
    if (result) {
      logger.info(`用户自定义文件名前缀已设置为: ${fileName}`);
      res.json({ 
        success: true, 
        message: `文件名前缀已设置为: ${fileName}`,
        finalFileName: fileName.trim() === '' ? '将使用默认模板' : `${fileName}_时间戳.xlsx`
      });
    } else {
      res.status(500).json({ success: false, error: '设置文件名前缀失败' });
    }
  } catch (error) {
    logger.error(`设置文件名前缀失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取用户自定义文件名前缀
app.get('/api/auto-export/user-filename', (req, res) => {
  try {
    const fileName = exportService.getUserCustomFileName();
    res.json({ 
      fileName,
      isDefault: !fileName || fileName.trim() === '',
      previewName: !fileName || fileName.trim() === '' ? 
        'data_设备地址_时间戳.xlsx (默认格式)' : 
        `${fileName}_时间戳.xlsx`
    });
  } catch (error) {
    logger.error(`获取用户自定义文件名前缀失败: ${error.message}`);
    res.status(500).json({ error: '获取文件名前缀失败' });
  }
});

// 获取数据缓存状态
app.get('/api/auto-export/cache-status', (req, res) => {
  try {
    const status = exportService.getCacheStatus();
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    logger.error(`获取缓存状态失败: ${error.message}`);
    res.status(500).json({ success: false, error: '获取缓存状态失败' });
  }
});

// 手动导出当前缓存的数据（即使不足100条）
app.post('/api/auto-export/export-cache', (req, res) => {
  try {
    exportService.exportCachedData().then(result => {
      if (result.success) {
        logger.info(`手动导出缓存数据成功: ${result.fileName}`);
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    }).catch(error => {
      logger.error(`手动导出缓存数据失败: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    });
  } catch (error) {
    logger.error(`手动导出缓存数据失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 手动导出数据（支持自定义文件名）
app.post('/api/export-custom', async (req, res) => {
  const { deviceAddr, customFileName } = req.body;
  try {
    const data = serialService.getCurrentData();
    if (!data || ((!data.current || data.current.length === 0) && (!data.voltage || data.voltage.length === 0))) {
      return res.status(400).json({ 
        success: false, 
        error: '没有任何可用数据进行导出' 
      });
    }
    
    if (!data.current) data.current = [];
    if (!data.voltage) data.voltage = [];
    
    // 使用数据中的实际设备地址，或者API传入的地址，或者默认值1
    const actualDeviceAddr = data.deviceAddr || deviceAddr || 1;
    logger.info(`手动导出数据，使用设备地址: ${actualDeviceAddr}, 自定义文件名: ${customFileName || '无'}`);
    
    const result = await exportService.exportData(actualDeviceAddr, data, customFileName);
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
    logger.error(`手动导出数据失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================== End 自动导出配置API =====================

// 健康检查端点
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    wsConnections: wsService.getConnectionCount(),
    serialConnected: serialService.isConnected,
    autoExportEnabled: exportService.getAutoExportEnabled()
  });
});

// 启动服务器
app.listen(PORT, () => {
  logger.info(`HTTP服务器启动在端口 ${PORT}`);
});

// 前端路由处理 - 必须放在最后，避免拦截API路由
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 启动WebSocket服务器
wsService.init(WS_PORT);
logger.info(`WebSocket服务器启动在端口 ${WS_PORT}`);

// 自动连接串口
let autoConnectTimer = null;
const AUTO_CONNECT_INTERVAL = 3000;
const DEFAULT_BAUD_RATE = 115200;

async function tryAutoConnect() {
  if (serialService.isConnected) {
    if (autoConnectTimer) {
      clearInterval(autoConnectTimer);
      autoConnectTimer = null;
    }
    return;
  }
  
  try {
    const ports = await serialService.listPorts();
    if (ports.length > 0) {
      const targetPort = ports[0].path;
      logger.info(`自动连接: 发现串口 ${targetPort}，正在连接...`);
      const result = await serialService.connect(targetPort, { baudRate: DEFAULT_BAUD_RATE });
      if (result) {
        logger.info(`自动连接成功: ${targetPort} @ ${DEFAULT_BAUD_RATE}`);
        if (autoConnectTimer) {
          clearInterval(autoConnectTimer);
          autoConnectTimer = null;
        }
      }
    } else {
      logger.debug('自动连接: 未发现可用串口，将继续扫描...');
    }
  } catch (error) {
    logger.error(`自动连接失败: ${error.message}`);
  }
}

tryAutoConnect();
autoConnectTimer = setInterval(tryAutoConnect, AUTO_CONNECT_INTERVAL);

// 断开后自动重连
serialService.on('disconnected', () => {
  logger.info('串口已断开，启动自动重连...');
  if (!autoConnectTimer) {
    autoConnectTimer = setInterval(tryAutoConnect, AUTO_CONNECT_INTERVAL);
  }
});

// 将串口数据广播到WebSocket客户端
serialService.on('data', async (data) => {
  // 广播数据到WebSocket客户端
  wsService.broadcast({
    type: 'serialData',
    data
  });
  
  // 自动导出功能 - 使用缓存模式（累积100条数据后导出）
  if (exportService.getAutoExportEnabled()) {
    try {
      logger.info('收到数据，添加到缓存...');
      const result = await exportService.addDataToCache(data.deviceAddr || 1, data);
      
      if (result.success) {
        if (result.cached) {
          // 数据已缓存，但还未达到100条
          logger.info(`数据已缓存: ${result.progress || result.message}`);
          
          // 广播缓存状态到WebSocket客户端
          wsService.broadcast({
            type: 'dataCached',
            currentCount: result.currentCount,
            targetCount: result.targetCount,
            progress: result.progress || `${result.currentCount}/${result.targetCount}`,
            percentage: Math.round((result.currentCount / result.targetCount) * 100),
            timestamp: new Date(),
            message: result.message || `已缓存${result.currentCount}条数据`
          });
        } else {
          // 达到100条，已完成导出
          logger.info(`批量导出成功: ${result.fileName}，导出了${result.exportedCount}条数据`);
          
          // 广播导出成功消息到WebSocket客户端
          wsService.broadcast({
            type: 'autoExportSuccess',
            fileName: result.fileName,
            exportedCount: result.exportedCount,
            timestamp: new Date(),
            message: `已成功导出${result.exportedCount}条数据到Excel文件`
          });
        }
      } else {
        logger.error(`自动导出失败: ${result.error}`);
        
        // 广播导出失败消息到WebSocket客户端
        wsService.broadcast({
          type: 'autoExportError',
          error: result.error,
          timestamp: new Date(),
          message: '自动导出失败'
        });
      }
    } catch (error) {
      logger.error(`自动导出过程出错: ${error.message}`);
      
      // 广播导出错误消息到WebSocket客户端
      wsService.broadcast({
        type: 'autoExportError',
        error: error.message,
        timestamp: new Date(),
        message: '自动导出过程出错'
      });
    }
  }
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

// 监听缓存清理事件并广播
serialService.on('cache-cleaned', (data) => {
  wsService.broadcast({
    type: 'cache-cleaned',
    data
  });
  logger.info('缓存清理事件已广播到所有客户端');
});

// 优雅关闭
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// 防止未捕获的异常导致进程崩溃
process.on('uncaughtException', (error) => {
  logger.error(`未捕获的异常: ${error.message}`);
  logger.error(error.stack);
  // 不退出进程，继续运行
});

// 防止未处理的Promise拒绝导致进程崩溃
process.on('unhandledRejection', (reason, promise) => {
  logger.error(`未处理的Promise拒绝: ${reason}`);
  // 不退出进程，继续运行
});

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
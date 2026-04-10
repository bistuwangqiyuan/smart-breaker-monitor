const WebSocket = require('ws');
const winston = require('winston');

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
    new winston.transports.File({ filename: 'websocket.log' })
  ]
});

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Set();
  }

  // 初始化WebSocket服务器
  init(port = 8080) {
    try {
      // 关闭现有连接
      if (this.wss) {
        this.close();
      }

      // 创建新的WebSocket服务器
      this.wss = new WebSocket.Server({ port });
      logger.info(`WebSocket服务器启动在端口 ${port}`);

      // 设置连接事件处理
      this.wss.on('connection', (ws) => {
        this.handleConnection(ws);
      });

      this.wss.on('error', (error) => {
        logger.error(`WebSocket服务器错误: ${error.message}`);
      });

      return true;
    } catch (error) {
      logger.error(`WebSocket服务器初始化失败: ${error.message}`);
      return false;
    }
  }

  // 处理新连接
  handleConnection(ws) {
    // 添加到客户端集合
    this.clients.add(ws);
    logger.info(`新的WebSocket客户端连接，当前连接数: ${this.clients.size}`);

    // 发送欢迎消息
    this.sendToClient(ws, {
      type: 'connected',
      message: '已连接到服务器',
      timestamp: new Date()
    });

    // 监听消息
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        logger.info(`收到客户端消息: ${JSON.stringify(data)}`);
        this.handleMessage(ws, data);
      } catch (error) {
        logger.error(`处理客户端消息失败: ${error.message}`);
      }
    });

    // 监听断开连接
    ws.on('close', () => {
      this.clients.delete(ws);
      logger.info(`WebSocket客户端断开连接，当前连接数: ${this.clients.size}`);
    });
  }

  // 处理接收到的消息
  handleMessage(ws, data) {
    // 根据消息类型进行处理
    switch (data.type) {
      case 'ping':
        this.sendToClient(ws, { type: 'pong', timestamp: new Date() });
        break;
      default:
        // 其他消息类型通过事件发出
        if (this.messageHandler) {
          this.messageHandler(data);
        }
        break;
    }
  }

  // 设置消息处理函数
  setMessageHandler(handler) {
    this.messageHandler = handler;
  }

  // 向单个客户端发送消息
  sendToClient(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  // 广播消息给所有客户端
  broadcast(data) {
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  }

  // 关闭WebSocket服务器
  close() {
    if (this.wss) {
      // 关闭所有连接
      this.clients.forEach((client) => {
        client.terminate();
      });
      this.clients.clear();

      // 关闭服务器
      this.wss.close();
      this.wss = null;
      logger.info('WebSocket服务器已关闭');
    }
  }

  // 获取连接数
  getConnectionCount() {
    return this.clients.size;
  }
}

module.exports = new WebSocketService(); 
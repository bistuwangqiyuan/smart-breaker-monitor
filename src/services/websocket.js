// WebSocket客户端服务
class WebSocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.listeners = {};
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10; // 最大重连次数
    this.reconnectInterval = 3000; // 重连间隔为3秒
  }

  // 连接WebSocket服务器
  connect(url = 'ws://localhost:8080') {
    if (this.socket && this.isConnected) {
      return;
    }

    console.log(`尝试连接WebSocket服务器: ${url}`);
    this.socket = new WebSocket(url);

    // 连接事件
    this.socket.onopen = () => {
      console.log('WebSocket连接已建立');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connected');
    };

    // 消息事件
    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.emit(data.type, data);
      } catch (error) {
        console.error('处理WebSocket消息失败:', error);
      }
    };

    // 错误事件
    this.socket.onerror = (error) => {
      console.error('WebSocket连接错误:', error);
      this.emit('error', error);
    };

    // 关闭事件
    this.socket.onclose = (event) => {
      console.log(`WebSocket连接已关闭: ${event.code} ${event.reason}`);
      this.isConnected = false;
      this.emit('disconnected');

      // 尝试重新连接
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`尝试重新连接 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        setTimeout(() => this.connect(url), this.reconnectInterval);
      } else {
        console.log('达到最大重连次数，无法连接到WebSocket服务器');
        this.emit('max_reconnect_failed');
      }
    };
  }

  // 断开连接
  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    
    this.isConnected = false;
  }

  // 发送消息
  send(data) {
    if (!this.isConnected) {
      console.error('WebSocket未连接');
      return false;
    }

    try {
      this.socket.send(JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('发送WebSocket消息失败:', error);
      return false;
    }
  }

  // 添加事件监听器
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  // 移除事件监听器
  off(event, callback) {
    if (!this.listeners[event]) {
      return;
    }
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  // 触发事件
  emit(event, data) {
    if (!this.listeners[event]) {
      return;
    }
    this.listeners[event].forEach(callback => callback(data));
  }

  // 检查连接状态
  isConnected() {
    return this.isConnected;
  }

  // 发送ping消息
  ping() {
    return this.send({
      type: 'ping',
      timestamp: new Date()
    });
  }
}

// 创建单例实例
const wsService = new WebSocketService();

export default wsService; 
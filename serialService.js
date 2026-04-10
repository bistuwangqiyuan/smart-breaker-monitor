const { SerialPort } = require('serialport');
const EventEmitter = require('events');
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
    new winston.transports.File({ filename: 'serial.log' })
  ]
});

class SerialService extends EventEmitter {
  constructor() {
    super();
    this.port = null;
    this.isConnected = false;
    this.dataBuffer = Buffer.alloc(0);
    this.recordingData = false;
    this.currentData = {
      current: [],
      voltage: []
    };
    this.dataHistory = [];
  }

  // 列出所有可用串口
  async listPorts() {
    try {
      logger.info('开始获取串口列表...');
      const ports = await SerialPort.list();
      logger.info(`发现 ${ports.length} 个串口设备: ${JSON.stringify(ports.map(p => p.path))}`);
      
      // 如果没有找到任何串口，返回一个模拟串口用于测试
      if (ports.length === 0) {
        logger.warn('没有找到任何串口设备，返回模拟串口');
        return [{
          path: 'COM1',
          manufacturer: '模拟串口 (测试用)',
          serialNumber: 'TEST-1234'
        }];
      }
      
      return ports.map(port => ({
        path: port.path,
        manufacturer: port.manufacturer || 'Unknown',
        serialNumber: port.serialNumber || 'Unknown'
      }));
    } catch (error) {
      logger.error(`获取串口列表失败: ${error.message}`);
      logger.error(error.stack);
      
      // 返回一个模拟串口用于测试
      return [{
        path: 'COM1',
        manufacturer: '模拟串口 (测试用)',
        serialNumber: 'TEST-1234'
      }];
    }
  }

  // 连接串口
  async connect(path, options = {}) {
    try {
      if (this.isConnected) {
        await this.disconnect();
      }

      logger.info(`尝试连接串口: ${path}, 参数: ${JSON.stringify(options)}`);

      this.port = new SerialPort({
        path,
        baudRate: options.baudRate || 9600,
        dataBits: options.dataBits || 8,
        stopBits: options.stopBits || 1,
        parity: options.parity || 'none'
      });

      this.port.on('data', (data) => this.onData(data));
      this.port.on('error', (error) => this.onError(error));

      this.isConnected = true;
      logger.info(`已连接到串口: ${path}`);
      this.emit('connected', path);
      return true;
    } catch (error) {
      logger.error(`连接串口失败: ${error.message}`);
      logger.error(error.stack);
      this.emit('error', error);
      return false;
    }
  }

  // 断开连接
  async disconnect() {
    if (!this.isConnected || !this.port) {
      return true;
    }

    return new Promise((resolve) => {
      this.port.close((error) => {
        if (error) {
          logger.error(`断开连接失败: ${error.message}`);
          this.emit('error', error);
        } else {
          logger.info('串口已断开连接');
          this.isConnected = false;
          this.emit('disconnected');
        }
        resolve(!error);
      });
    });
  }

  // 发送数据
  async sendCommand(data) {
    if (!this.isConnected) {
      throw new Error('串口未连接');
    }

    return new Promise((resolve, reject) => {
      this.port.write(data, (error) => {
        if (error) {
          logger.error(`发送数据失败: ${error.message}`);
          reject(error);
        } else {
          logger.info(`已发送命令: ${data.toString('hex').toUpperCase()}`);
          resolve();
        }
      });
    });
  }

  // 发送关断命令
  async sendShutdownCommand() {
    // 关断命令: AF FF 04 00 AE
    const cmd = Buffer.from([0xAF, 0xFF, 0x04, 0x00, 0xAE]);
    await this.sendCommand(cmd);
  }

  // 发送开启命令
  async sendStartCommand() {
    // 开启命令: AF FF 04 01 AE
    const cmd = Buffer.from([0xAF, 0xFF, 0x04, 0x01, 0xAE]);
    await this.sendCommand(cmd);
  }

  // 数据接收处理
  onData(data) {
    // 将接收到的数据添加到缓冲区
    this.dataBuffer = Buffer.concat([this.dataBuffer, data]);
    
    // 查找数据帧开始标志 (0xAF)
    const startIndex = this.dataBuffer.indexOf(0xAF);
    if (startIndex === -1) {
      // 没有找到帧头，清空缓冲区
      this.dataBuffer = Buffer.alloc(0);
      return;
    }

    // 检查是否有完整数据帧（至少405字节）
    if (this.dataBuffer.length >= startIndex + 405) {
      const frameData = this.dataBuffer.slice(startIndex, startIndex + 405);
      // 移除已处理的数据
      this.dataBuffer = this.dataBuffer.slice(startIndex + 405);

      // 验证帧头和命令
      if (frameData[0] === 0xAF && frameData[3] === 0x06) {
        this.parseDataFrame(frameData);
      }
    }
  }

  // 解析数据帧
  parseDataFrame(frame) {
    try {
      // 提取设备类型和地址
      const deviceType = frame[1];
      const deviceAddr = frame[2];
      
      // 解析电流数据
      const currentArray = [];
      for (let i = 0; i < 100; i++) {
        const highByte = frame[5 + i*2];
        const lowByte = frame[6 + i*2];
        const value = ((highByte << 8) | lowByte) / 1000.0;
        currentArray.push(value);
      }
      
      // 解析电压数据
      const voltageArray = [];
      for (let i = 0; i < 100; i++) {
        const highByte = frame[205 + i*2];
        const lowByte = frame[206 + i*2];
        const value = ((highByte << 8) | lowByte) / 1000.0;
        voltageArray.push(value);
      }
      
      // 验证校验和
      let checksum = 0;
      for (let i = 1; i < 404; i++) {
        checksum += frame[i];
      }
      checksum = checksum & 0xFF;
      
      const isValid = (checksum === frame[404]);
      
      if (isValid) {
        const timestamp = new Date();
        const dataPacket = {
          timestamp,
          deviceType,
          deviceAddr,
          current: currentArray,
          voltage: voltageArray
        };
        
        // 保存当前数据（确保包含设备类型和地址信息）
        this.currentData = {
          timestamp,
          deviceType,
          deviceAddr,
          current: currentArray,
          voltage: voltageArray
        };
        
        // 添加到历史记录
        this.dataHistory.push(this.currentData);
        if (this.dataHistory.length > 100) {
          this.dataHistory.shift(); // 保留最新的100条记录
        }
        
        // 发出数据事件
        this.emit('data', dataPacket);
        logger.info(`接收到数据: 设备类型=${deviceType}, 设备地址=${deviceAddr}, 数据点数=100`);
      } else {
        logger.warn('数据校验失败');
      }
    } catch (error) {
      logger.error(`解析数据帧失败: ${error.message}`);
    }
  }

  // 错误处理
  onError(error) {
    logger.error(`串口错误: ${error.message}`);
    this.emit('error', error);
  }

  // 获取当前数据
  getCurrentData() {
    return this.currentData;
  }

  // 获取历史数据
  getDataHistory() {
    return this.dataHistory;
  }

  // 清除历史数据
  clearDataHistory() {
    this.dataHistory = [];
    return true;
  }
}

module.exports = new SerialService(); 
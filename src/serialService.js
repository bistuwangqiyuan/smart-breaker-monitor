const { SerialPort } = require('serialport');
const EventEmitter = require('events');
const winston = require('winston');
const fs = require('fs');
const path = require('path');

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

// 创建数据存储目录
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

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
    
    // 添加缓存容量限制配置
    this.maxCacheSize = 20; // 最大缓存20条数据
    
    // 添加文件存储限制配置
    this.maxDataFiles = 20; // 最多保存20个数据文件
    
    // 控制是否启用自动清理内存缓存（默认关闭）
    this.autoCleanMemoryCache = false;
    
    // 暴露logger属性以便外部可以调整日志级别
    this.logger = logger;
    
    // 数据存储路径
    this.dataDir = DATA_DIR;
    
    // Modbus 电流采集相关
    this.modbusDeviceAddr = 1;
    this.modbusCurrentValue = 0;
    this.pendingModbusRequest = null;
    this.currentPollTimer = null;
    this.modbusResponseBuffer = Buffer.alloc(0);
    
    // 防止未捕获的错误导致程序崩溃
    this.on('error', (error) => {
      logger.error(`串口服务错误已捕获: ${error.message}`);
      // 不再向上传播错误，避免程序崩溃
    });
  }

  // 列出所有可用串口
  async listPorts() {
    try {
      this.logger.info('开始获取串口列表...');
      const ports = await SerialPort.list();
      this.logger.info(`发现 ${ports.length} 个串口设备: ${JSON.stringify(ports.map(p => p.path))}`);
      
      // 如果没有找到任何串口，返回空数组
      if (ports.length === 0) {
        this.logger.warn('没有找到任何串口设备');
        return [];
      }
      
      return ports.map(port => ({
        path: port.path,
        manufacturer: port.manufacturer || 'Unknown',
        serialNumber: port.serialNumber || 'Unknown'
      }));
    } catch (error) {
      this.logger.error(`获取串口列表失败: ${error.message}`);
      this.logger.error(error.stack);
      return [];
    }
  }

  // 连接串口
  async connect(path, options = {}) {
    try {
      if (this.isConnected) {
        await this.disconnect();
      }

      this.logger.info(`尝试连接串口: ${path}, 参数: ${JSON.stringify(options)}`);

      this.port = new SerialPort({
        path,
        baudRate: options.baudRate || 9600,
        dataBits: options.dataBits || 8,
        stopBits: options.stopBits || 1,
        parity: options.parity || 'none'
      });

      this.port.on('data', (data) => this.onData(data));
      this.port.on('error', (error) => {
        // 防止错误向上传播导致程序崩溃
        this.onError(error);
      });

      this.isConnected = true;
      this.logger.info(`已连接到串口: ${path}`);
      this.emit('connected', path);
      this.startCurrentPolling();
      return true;
    } catch (error) {
      this.logger.error(`连接串口失败: ${error.message}`);
      this.logger.error(error.stack);
      this.emit('error', error);
      return false;
    }
  }

  // 断开连接
  async disconnect() {
    this.stopCurrentPolling();
    if (!this.isConnected || !this.port) {
      return true;
    }

    return new Promise((resolve) => {
      this.port.close((error) => {
        if (error) {
          this.logger.error(`断开连接失败: ${error.message}`);
          this.emit('error', error);
        } else {
          this.logger.info('串口已断开连接');
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
          this.logger.error(`发送数据失败: ${error.message}`);
          reject(error);
        } else {
          this.logger.info(`已发送命令: ${data.toString('hex').toUpperCase()}`);
          resolve();
        }
      });
    });
  }

  // 发送关断命令
  async sendShutdownCommand() {
    try {
      // 关断命令: AF FF 04 00 AE
      const cmd = Buffer.from([0xAF, 0xFF, 0x04, 0x00, 0xAE]);
      await this.sendCommand(cmd);
      return true;
    } catch (error) {
      this.logger.error(`发送关断命令失败: ${error.message}`);
      // 不向上传播错误，返回失败结果
      return false;
    }
  }

  // 发送开启命令
  async sendStartCommand() {
    try {
      // 开启命令: AF FF 04 01 AE
      const cmd = Buffer.from([0xAF, 0xFF, 0x04, 0x01, 0xAE]);
      await this.sendCommand(cmd);
      return true;
    } catch (error) {
      this.logger.error(`发送开启命令失败: ${error.message}`);
      // 不向上传播错误，返回失败结果
      return false;
    }
  }

  // CRC-16/MODBUS 校验计算
  calculateCRC16(buffer) {
    let crc = 0xFFFF;
    for (let i = 0; i < buffer.length; i++) {
      crc ^= buffer[i];
      for (let j = 0; j < 8; j++) {
        if (crc & 0x0001) {
          crc = (crc >> 1) ^ 0xA001;
        } else {
          crc >>= 1;
        }
      }
    }
    return crc;
  }

  // 按协议发送 Modbus 读取电流命令 (读输入寄存器 0x0703, 数量2)
  async pollCurrent() {
    try {
      if (!this.isConnected || this.pendingModbusRequest) return;

      const cmd = Buffer.from([
        this.modbusDeviceAddr,
        0x04,       // 功能码: 读取输入寄存器
        0x07, 0x03, // 寄存器起始地址: 0x0703 (电流高16位)
        0x00, 0x02  // 读取数量: 2个寄存器
      ]);

      const crc = this.calculateCRC16(cmd);
      const fullCmd = Buffer.concat([cmd, Buffer.from([crc & 0xFF, (crc >> 8) & 0xFF])]);

      this.pendingModbusRequest = 'current';
      this.modbusResponseBuffer = Buffer.alloc(0);
      await this.sendCommand(fullCmd);

      setTimeout(() => {
        if (this.pendingModbusRequest === 'current') {
          this.logger.debug('Modbus 读取电流超时');
          this.pendingModbusRequest = null;
          this.modbusResponseBuffer = Buffer.alloc(0);
        }
      }, 1000);
    } catch (error) {
      this.logger.error(`Modbus 轮询电流失败: ${error.message}`);
      this.pendingModbusRequest = null;
      this.modbusResponseBuffer = Buffer.alloc(0);
    }
  }

  // 启动电流 Modbus 轮询
  startCurrentPolling(intervalMs = 2000) {
    if (this.currentPollTimer) return;

    this.logger.info(`启动 Modbus 电流轮询，间隔 ${intervalMs}ms`);

    setTimeout(() => {
      if (this.isConnected) this.pollCurrent();
    }, 500);

    this.currentPollTimer = setInterval(() => {
      if (this.isConnected) this.pollCurrent();
    }, intervalMs);
  }

  // 停止电流轮询
  stopCurrentPolling() {
    if (this.currentPollTimer) {
      clearInterval(this.currentPollTimer);
      this.currentPollTimer = null;
      this.logger.info('Modbus 电流轮询已停止');
    }
    this.pendingModbusRequest = null;
    this.modbusResponseBuffer = Buffer.alloc(0);
  }

  // 处理 Modbus 响应
  handleModbusResponse(response) {
    try {
      const dataWithoutCRC = response.slice(0, response.length - 2);
      const receivedCRC = response[response.length - 2] | (response[response.length - 1] << 8);
      const calculatedCRC = this.calculateCRC16(dataWithoutCRC);

      if (receivedCRC !== calculatedCRC) {
        this.logger.warn(`Modbus CRC 校验失败: 接收=0x${receivedCRC.toString(16)}, 计算=0x${calculatedCRC.toString(16)}`);
        this.pendingModbusRequest = null;
        return;
      }

      const funcCode = response[1];
      const byteCount = response[2];

      if (this.pendingModbusRequest === 'current' && funcCode === 0x04 && byteCount === 4) {
        // 解析 32 位电流值: 高16位 + 低16位, 单位 mA
        const highWord = (response[3] << 8) | response[4];
        const lowWord = (response[5] << 8) | response[6];
        const currentMA = highWord * 65536 + lowWord;
        const currentA = currentMA / 1000.0;

        this.modbusCurrentValue = currentA;

        if (!this.currentData) {
          this.currentData = { current: [], voltage: [] };
        }
        this.currentData.current = [currentA];
        this.currentData.timestamp = new Date();

        this.logger.info(`Modbus 电流: ${currentA.toFixed(3)}A (${currentMA}mA)`);
      }

      this.pendingModbusRequest = null;
    } catch (error) {
      this.logger.error(`处理 Modbus 响应失败: ${error.message}`);
      this.pendingModbusRequest = null;
    }
  }

  // 数据接收处理（统一缓冲区，顺序处理 0xAF 帧和 Modbus 响应）
  onData(data) {
    this.saveRawReceived(data);
    this.dataBuffer = Buffer.concat([this.dataBuffer, data]);
    this.processBuffer();
  }

  // 顺序处理缓冲区：按首字节判断帧类型，避免扫描内部数据导致误判
  processBuffer() {
    let progress = true;
    while (this.dataBuffer.length > 0 && progress) {
      progress = false;
      const firstByte = this.dataBuffer[0];

      // 0xAF 帧 (405 字节)
      if (firstByte === 0xAF) {
        if (this.dataBuffer.length >= 405) {
          const frameData = this.dataBuffer.slice(0, 405);
          this.dataBuffer = this.dataBuffer.slice(405);
          if (frameData[3] === 0x06) {
            this.saveRawData(frameData);
            this.parseDataFrame(frameData);
          }
          progress = true;
          continue;
        }
        // 部分帧，传给 parseIncompleteData 提取可用数据
        this.parseIncompleteData(this.dataBuffer);
        break;
      }

      // Modbus 响应（仅在有待处理请求时尝试匹配）
      if (this.pendingModbusRequest && firstByte === this.modbusDeviceAddr) {
        if (this.dataBuffer.length >= 5) {
          const funcCode = this.dataBuffer[1];

          // Modbus 错误响应: [addr][func|0x80][errCode][CRC_L][CRC_H] = 5 bytes
          if (funcCode & 0x80) {
            const candidate = this.dataBuffer.slice(0, 5);
            const recvCRC = candidate[3] | (candidate[4] << 8);
            const calcCRC = this.calculateCRC16(candidate.slice(0, 3));
            if (recvCRC === calcCRC) {
              this.logger.warn(`Modbus 错误响应: 错误码=0x${candidate[2].toString(16)}`);
              this.dataBuffer = this.dataBuffer.slice(5);
              this.pendingModbusRequest = null;
              progress = true;
              continue;
            }
          }

          // Modbus 正常响应: [addr][0x04][byteCount=4][4 bytes data][CRC_L][CRC_H] = 9 bytes
          if (funcCode === 0x04 && this.dataBuffer.length >= 3) {
            const byteCount = this.dataBuffer[2];
            if (byteCount === 4 && this.dataBuffer.length >= 9) {
              const candidate = this.dataBuffer.slice(0, 9);
              const recvCRC = candidate[7] | (candidate[8] << 8);
              const calcCRC = this.calculateCRC16(candidate.slice(0, 7));
              if (recvCRC === calcCRC) {
                this.dataBuffer = this.dataBuffer.slice(9);
                this.handleModbusResponse(candidate);
                progress = true;
                continue;
              }
            }
          }
        } else {
          // 不够 5 字节，等待更多数据
          break;
        }
      }

      // 首字节无法识别，跳到下一个有意义的字节位置
      let nextPos = 1;
      while (nextPos < this.dataBuffer.length) {
        const b = this.dataBuffer[nextPos];
        if (b === 0xAF || (this.pendingModbusRequest && b === this.modbusDeviceAddr)) {
          break;
        }
        nextPos++;
      }
      if (nextPos > 1) {
        this.logger.debug(`跳过 ${nextPos} 个无法识别的字节`);
      }
      this.dataBuffer = this.dataBuffer.slice(nextPos);
      progress = this.dataBuffer.length > 0;
    }
  }

  // 保存每次接收到的原始数据（无论是否为完整帧）
  saveRawReceived(data) {
    try {
      const timestamp = new Date();
      const fileName = `received_data_${timestamp.toISOString().replace(/[:.]/g, '-')}.bin`;
      const filePath = path.join(this.dataDir, fileName);
      
      fs.writeFileSync(filePath, data);
      this.logger.debug(`原始接收数据已保存到: ${filePath}`);
      
      // 移除对清理操作的直接调用
    } catch (error) {
      this.logger.error(`保存原始接收数据失败: ${error.message}`);
      this.logger.error(error.stack);
    }
  }

  // 解析不完整的数据
  parseIncompleteData(buffer) {
    try {
      if (buffer.length < 7) {
        return;
      }
      
      const deviceType = buffer.length > 1 ? buffer[1] : 0;
      const deviceAddr = buffer.length > 2 ? buffer[2] : 0;
      
      // 电流数据区域: bytes 5~204 (最多100个点, 每点2字节)
      const currentArray = [];
      const currentEndByte = Math.min(buffer.length, 205);
      for (let i = 0; i < 100; i++) {
        const offset = 5 + i * 2;
        if (offset + 1 < currentEndByte) {
          const value = ((buffer[offset] << 8) | buffer[offset + 1]) / 1000.0;
          currentArray.push(value);
        } else {
          break;
        }
      }
      
      // 电压数据区域: bytes 205~404 (最多100个点, 每点2字节)
      const voltageArray = [];
      if (buffer.length > 206) {
        for (let i = 0; i < 100; i++) {
          const offset = 205 + i * 2;
          if (offset + 1 < buffer.length) {
            const value = ((buffer[offset] << 8) | buffer[offset + 1]) / 1000.0;
            voltageArray.push(value);
          } else {
            break;
          }
        }
      }
      
      // 只有在有数据时才更新当前数据
      if (currentArray.length > 0 || voltageArray.length > 0) {
        const timestamp = new Date();
        
        // 更新当前数据，但保持原有数据
        if (currentArray.length > 0) {
          this.currentData.current = currentArray;
        }
        
        if (voltageArray.length > 0) {
          this.currentData.voltage = voltageArray;
        }
        
        this.currentData.timestamp = timestamp;
        
        // 记录解析到的数据点数量
        this.logger.info(`解析不完整数据: 电流=${currentArray.length}点, 电压=${voltageArray.length}点`);
        
        // 保存解析后的不完整数据
        const dataPacket = {
          timestamp,
          deviceType,
          deviceAddr,
          current: currentArray,
          voltage: voltageArray,
          isComplete: false // 标记为不完整数据
        };
        
        this.saveProcessedData(dataPacket);
        
        // 发出数据事件
        this.emit('data', dataPacket);
      }
    } catch (error) {
      this.logger.error(`解析不完整数据失败: ${error.message}`);
      this.logger.error(error.stack);
    }
  }

  // 保存原始数据帧到文件
  saveRawData(frameData) {
    try {
      const timestamp = new Date();
      const fileName = `raw_data_${timestamp.toISOString().replace(/[:.]/g, '-')}.bin`;
      const filePath = path.join(this.dataDir, fileName);
      
      fs.writeFileSync(filePath, frameData);
      this.logger.debug(`原始数据帧已保存到: ${filePath}`);
      
      // 移除对清理操作的直接调用
    } catch (error) {
      this.logger.error(`保存原始数据帧失败: ${error.message}`);
      this.logger.error(error.stack);
    }
  }

  // 保存解析后的数据到JSON文件
  saveProcessedData(dataPacket) {
    try {
      const timestamp = new Date();
      const completenessTag = dataPacket.isComplete ? 'complete' : 'incomplete';
      const fileName = `processed_data_${completenessTag}_${timestamp.toISOString().replace(/[:.]/g, '-')}.json`;
      const filePath = path.join(this.dataDir, fileName);
      
      fs.writeFileSync(filePath, JSON.stringify(dataPacket, null, 2));
      this.logger.debug(`解析后的数据已保存到: ${filePath}`);
      
      // 保存CSV格式的数据，方便直接导入到Excel或数据分析工具
      const csvFileName = `data_${completenessTag}_${timestamp.toISOString().replace(/[:.]/g, '-')}.csv`;
      const csvFilePath = path.join(this.dataDir, csvFileName);
      
      let csvContent = '序号,电流(A),电压(V),功率(W),完整性\n';
      
      // 计算最大数据点数（电流或电压中的较大值）
      const maxPoints = Math.max(
        dataPacket.current ? dataPacket.current.length : 0,
        dataPacket.voltage ? dataPacket.voltage.length : 0
      );
      
      for (let i = 0; i < maxPoints; i++) {
        const current = dataPacket.current && i < dataPacket.current.length ? dataPacket.current[i] : '';
        const voltage = dataPacket.voltage && i < dataPacket.voltage.length ? dataPacket.voltage[i] : '';
        const power = (current !== '' && voltage !== '') ? current * voltage : '';
        csvContent += `${i+1},${current},${voltage},${power},${dataPacket.isComplete ? '完整' : '不完整'}\n`;
      }
      
      fs.writeFileSync(csvFilePath, csvContent);
      this.logger.debug(`CSV格式数据已保存到: ${csvFilePath}`);
      
      // 移除对清理操作的直接调用
      
      return {
        jsonPath: filePath,
        csvPath: csvFilePath,
        isComplete: dataPacket.isComplete
      };
    } catch (error) {
      this.logger.error(`保存解析后的数据失败: ${error.message}`);
      this.logger.error(error.stack);
      return null;
    }
  }

  // 解析数据帧
  parseDataFrame(frame) {
    try {
      // 提取设备类型和地址
      const deviceType = frame[1];
      const deviceAddr = frame[2];
      
      // 解析电流数据 (帧 bytes 5~204, 100个点, 每点2字节, 单位mA)
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
        // 在调试级别记录每个数据点
        this.logger.debug(`电压数据点[${i}]: ${value}V, 原始值: 高字节=${highByte}, 低字节=${lowByte}`);
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
          voltage: voltageArray,
          isComplete: true // 标记为完整数据
        };
        
        // 保存当前数据
        this.currentData = {
          timestamp,
          current: currentArray,
          voltage: voltageArray,
          isComplete: true
        };
        
        // 添加到历史记录
        this.dataHistory.push(this.currentData);
        if (this.dataHistory.length > 100) {
          this.dataHistory.shift(); // 保留最新的100条记录
        }
        
        // 计算统计数据并记录
        const avgCurrent = currentArray.reduce((sum, val) => sum + val, 0) / currentArray.length;
        const maxCurrent = Math.max(...currentArray);
        const minCurrent = Math.min(...currentArray);
        
        const avgVoltage = voltageArray.reduce((sum, val) => sum + val, 0) / voltageArray.length;
        const maxVoltage = Math.max(...voltageArray);
        const minVoltage = Math.min(...voltageArray);
        
        // 记录详细统计数据
        this.logger.info(`接收到完整数据: 设备类型=${deviceType}, 设备地址=${deviceAddr}, 数据点数=100`);
        this.logger.info(`电流数据统计: 平均=${avgCurrent.toFixed(3)}A, 最大=${maxCurrent.toFixed(3)}A, 最小=${minCurrent.toFixed(3)}A`);
        this.logger.info(`电压数据统计: 平均=${avgVoltage.toFixed(3)}V, 最大=${maxVoltage.toFixed(3)}V, 最小=${minVoltage.toFixed(3)}V`);
        
        // 保存解析后的数据到文件
        const savedFiles = this.saveProcessedData(dataPacket);
        if (savedFiles) {
          this.logger.info(`完整数据已保存: JSON文件=${path.basename(savedFiles.jsonPath)}, CSV文件=${path.basename(savedFiles.csvPath)}`);
        }
        
        // 发出数据事件
        this.emit('data', dataPacket);
      } else {
        this.logger.warn(`数据校验失败: 计算校验和=${checksum}, 帧校验和=${frame[404]}`);
      }
    } catch (error) {
      this.logger.error(`解析数据帧失败: ${error.message}`);
      this.logger.error(error.stack);
    }
  }

  // 错误处理
  onError(error) {
    this.logger.error(`串口错误: ${error.message}`);
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
  
  // 获取保存的数据文件列表
  getDataFiles() {
    try {
      const files = fs.readdirSync(this.dataDir);
      const jsonFiles = files.filter(file => file.startsWith('processed_data_') && file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(this.dataDir, file),
          created: fs.statSync(path.join(this.dataDir, file)).birthtime,
          type: 'json'
        }));
        
      const csvFiles = files.filter(file => file.endsWith('.csv'))
        .map(file => ({
          name: file,
          path: path.join(this.dataDir, file),
          created: fs.statSync(path.join(this.dataDir, file)).birthtime,
          type: 'csv'
        }));
        
      const rawFiles = files.filter(file => file.startsWith('raw_data_') && file.endsWith('.bin'))
        .map(file => ({
          name: file,
          path: path.join(this.dataDir, file),
          created: fs.statSync(path.join(this.dataDir, file)).birthtime,
          type: 'bin'
        }));
      
      return [...jsonFiles, ...csvFiles, ...rawFiles].sort((a, b) => b.created - a.created);
    } catch (error) {
      this.logger.error(`获取数据文件列表失败: ${error.message}`);
      return [];
    }
  }
  
  // 获取数据文件路径
  getDataFilePath(fileName) {
    return path.join(this.dataDir, fileName);
  }
  
  // 删除数据文件
  deleteDataFile(fileName) {
    try {
      const filePath = path.join(this.dataDir, fileName);
      fs.unlinkSync(filePath);
      this.logger.info(`已删除数据文件: ${filePath}`);
      return true;
    } catch (error) {
      this.logger.error(`删除数据文件失败: ${error.message}`);
      return false;
    }
  }
  
  // 检查并清理缓存
  checkAndCleanCache() {
    // 如果自动清理内存缓存已关闭，则不执行清理
    if (!this.autoCleanMemoryCache) {
      return;
    }
    
    // 检查当前数据缓存大小
    if (this.currentData && this.currentData.current && this.currentData.current.length > this.maxCacheSize) {
      this.logger.info(`当前数据点数(${this.currentData.current.length})超过限制(${this.maxCacheSize})，自动清理缓存`);
      
      // 保留最新的数据点
      this.currentData.current = this.currentData.current.slice(-this.maxCacheSize);
      
      // 如果电压数据也存在，同样保留最新的数据点
      if (this.currentData.voltage && this.currentData.voltage.length > this.maxCacheSize) {
        this.currentData.voltage = this.currentData.voltage.slice(-this.maxCacheSize);
      }
      
      // 更新时间戳
      this.currentData.timestamp = new Date();
      
      // 发出缓存清理事件
      this.emit('cache-cleaned', {
        message: '数据缓存已自动清理',
        timestamp: this.currentData.timestamp,
        currentSize: this.currentData.current.length
      });
      
      this.logger.info(`缓存已清理，当前数据点数: ${this.currentData.current.length}`);
    }
    
    // 同样限制历史数据记录
    if (this.dataHistory.length > this.maxCacheSize) {
      this.dataHistory = this.dataHistory.slice(-this.maxCacheSize);
      this.logger.info(`历史数据记录已清理，保留最新的 ${this.maxCacheSize} 条记录`);
    }
  }
  
  // 设置最大缓存大小
  setMaxCacheSize(size) {
    if (typeof size === 'number' && size > 0) {
      this.maxCacheSize = size;
      this.logger.info(`最大缓存大小已设置为 ${size} 条数据`);
      // 立即检查并清理缓存
      this.checkAndCleanCache();
      return true;
    }
    return false;
  }
  
  // 获取当前缓存大小设置
  getMaxCacheSize() {
    return this.maxCacheSize;
  }

  // 手动清理数据文件
  manualCleanDataFiles() {
    try {
      this.logger.info('开始执行手动清理数据文件...');
      const result = this.checkAndCleanDataFiles();
      this.logger.info('手动清理数据文件完成');
      return result;
    } catch (error) {
      this.logger.error(`手动清理数据文件失败: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 修改检查并清理旧的数据文件方法，返回清理结果
  checkAndCleanDataFiles() {
    try {
      const files = this.getDataFiles();
      
      // 获取JSON和CSV文件数量
      const jsonFiles = files.filter(f => f.type === 'json');
      const csvFiles = files.filter(f => f.type === 'csv');
      const rawFiles = files.filter(f => f.type === 'bin');
      
      this.logger.debug(`当前数据文件数量: JSON=${jsonFiles.length}, CSV=${csvFiles.length}, RAW=${rawFiles.length}`);
      
      let deletedCount = 0;
      let failedCount = 0;
      
      // 清理JSON文件
      if (jsonFiles.length > this.maxDataFiles) {
        // 按时间排序，删除最旧的文件（文件已经按创建时间降序排列，所以删除最后几个）
        const filesToDelete = jsonFiles.slice(this.maxDataFiles);
        for (const file of filesToDelete) {
          if (this.deleteDataFile(file.name)) {
            deletedCount++;
            this.logger.info(`自动清理: 已删除旧的JSON文件 ${file.name}`);
          } else {
            failedCount++;
          }
        }
      }
      
      // 清理CSV文件
      if (csvFiles.length > this.maxDataFiles) {
        const filesToDelete = csvFiles.slice(this.maxDataFiles);
        for (const file of filesToDelete) {
          if (this.deleteDataFile(file.name)) {
            deletedCount++;
            this.logger.info(`自动清理: 已删除旧的CSV文件 ${file.name}`);
          } else {
            failedCount++;
          }
        }
      }
      
      // 清理原始数据文件
      if (rawFiles.length > this.maxDataFiles) {
        const filesToDelete = rawFiles.slice(this.maxDataFiles);
        for (const file of filesToDelete) {
          if (this.deleteDataFile(file.name)) {
            deletedCount++;
            this.logger.info(`自动清理: 已删除旧的原始数据文件 ${file.name}`);
          } else {
            failedCount++;
          }
        }
      }
      
      return {
        success: true,
        deletedCount,
        failedCount,
        remainingFiles: {
          json: Math.min(jsonFiles.length, this.maxDataFiles),
          csv: Math.min(csvFiles.length, this.maxDataFiles),
          raw: Math.min(rawFiles.length, this.maxDataFiles)
        }
      };
    } catch (error) {
      this.logger.error(`清理数据文件失败: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 设置最大数据文件数量
  setMaxDataFiles(count) {
    if (typeof count === 'number' && count > 0) {
      this.maxDataFiles = count;
      this.logger.info(`最大数据文件数量已设置为 ${count} 个`);
      // 立即检查并清理文件
      this.checkAndCleanDataFiles();
      return true;
    }
    return false;
  }

  // 获取当前最大数据文件数量设置
  getMaxDataFiles() {
    return this.maxDataFiles;
  }

  // 设置是否启用自动清理内存缓存
  setAutoCleanMemoryCache(enabled) {
    this.autoCleanMemoryCache = !!enabled;
    this.logger.info(`内存缓存自动清理已${this.autoCleanMemoryCache ? '启用' : '禁用'}`);
    return true;
  }

  // 获取当前自动清理内存缓存的状态
  getAutoCleanMemoryCache() {
    return this.autoCleanMemoryCache;
  }
}

module.exports = new SerialService();
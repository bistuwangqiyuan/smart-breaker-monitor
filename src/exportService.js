const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const winston = require('winston');

// 创建导出目录
const EXPORT_DIR = path.join(__dirname, '..', 'exports');
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

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
    new winston.transports.File({ filename: 'export.log' })
  ]
});

class ExportService {
  constructor() {
    this.exportDir = EXPORT_DIR;
    // 暴露logger属性以便外部可以调整日志级别
    this.logger = logger;
    
    // 自动导出配置
    this.autoExportEnabled = true; // 默认启用自动导出
    this.customFileNameTemplate = 'data_{deviceAddr}_{timestamp}'; // 默认文件名模板
    this.userCustomFileName = ''; // 用户自定义的固定文件名前缀（不包含后缀）
    
    // 数据缓存配置 - 累积100条数据后导出
    this.dataCache = []; // 缓存收到的数据
    this.maxCacheSize = 100; // 累积100条数据后导出
    this.cacheStartTime = null; // 缓存开始时间
  }

  // 设置自动导出开关
  setAutoExportEnabled(enabled) {
    this.autoExportEnabled = enabled;
    this.logger.info(`自动导出功能已${enabled ? '启用' : '禁用'}`);
    return true;
  }

  // 获取自动导出状态
  getAutoExportEnabled() {
    return this.autoExportEnabled;
  }

  // 设置自定义文件名模板
  setCustomFileNameTemplate(template) {
    if (!template || typeof template !== 'string') {
      return false;
    }
    this.customFileNameTemplate = template;
    this.logger.info(`文件名模板已设置为: ${template}`);
    return true;
  }

  // 获取当前文件名模板
  getCustomFileNameTemplate() {
    return this.customFileNameTemplate;
  }

  // 设置用户自定义文件名前缀
  setUserCustomFileName(fileName) {
    if (typeof fileName !== 'string') {
      return false;
    }
    // 移除可能的.xlsx后缀
    const cleanFileName = fileName.replace(/\.xlsx$/, '');
    this.userCustomFileName = cleanFileName;
    this.logger.info(`用户自定义文件名前缀已设置为: ${cleanFileName}`);
    return true;
  }

  // 获取用户自定义文件名前缀
  getUserCustomFileName() {
    return this.userCustomFileName;
  }

  // 收集数据到缓存，累积100条后自动导出
  async addDataToCache(deviceAddr, dataPacket) {
    try {
      // 🔍 关键修复：只处理完整的数据包，避免数据错位
      if (!dataPacket.isComplete) {
        this.logger.debug('跳过不完整数据包，避免数据错位');
        return {
          success: true,
          cached: false,
          message: '数据包不完整，已跳过'
        };
      }

      // 验证数据完整性：确保电流和电压数组都有100个元素
      const currentArray = Array.isArray(dataPacket.current) ? dataPacket.current : [];
      const voltageArray = Array.isArray(dataPacket.voltage) ? dataPacket.voltage : [];
      
      if (currentArray.length !== 100 || voltageArray.length !== 100) {
        this.logger.warn(`数据长度异常: 电流=${currentArray.length}点, 电压=${voltageArray.length}点，跳过处理`);
        return {
          success: true,
          cached: false,
          message: `数据长度异常，已跳过`
        };
      }

      // 如果是第一条完整数据，记录开始时间
      if (this.dataCache.length === 0) {
        this.cacheStartTime = new Date();
        this.logger.info('开始收集完整数据包，目标: 100条数据后导出Excel');
      }

      // 🚀 修复：一次性添加整个完整数据包（100个数据点）
      for (let i = 0; i < 100; i++) {
        const current = currentArray[i];
        const voltage = voltageArray[i];
        const power = current !== null && voltage !== null ? current * voltage : null;

        this.dataCache.push({
          index: this.dataCache.length + 1,
          current: current,
          voltage: voltage,
          power: power,
          timestamp: dataPacket.timestamp || new Date().toISOString().split('T')[0].replace(/-/g, '/'),
          deviceAddr: deviceAddr || dataPacket.deviceAddr || 1,
          deviceType: dataPacket.deviceType || '大机'
        });

        // 检查是否达到100条数据
        if (this.dataCache.length >= this.maxCacheSize) {
          this.logger.info(`已收集${this.maxCacheSize}条数据，开始导出Excel文件`);
          const result = await this.exportCachedData();
          return result;
        }
      }

      this.logger.info(`已收集${this.dataCache.length}/${this.maxCacheSize}条数据（添加了完整数据包100点）`);
      return {
        success: true,
        cached: true,
        currentCount: this.dataCache.length,
        targetCount: this.maxCacheSize,
        message: `数据已缓存，当前${this.dataCache.length}/${this.maxCacheSize}条`
      };

    } catch (error) {
      this.logger.error(`添加数据到缓存失败: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 导出缓存的数据到Excel（按用户格式）
  async exportCachedData() {
    try {
      if (this.dataCache.length === 0) {
        return {
          success: false,
          error: '没有缓存数据可以导出'
        };
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('数据表');

      // 设置列标题（按用户提供的格式）
      worksheet.columns = [
        { header: '序号', key: 'index', width: 8 },
        { header: '电流（A）', key: 'current', width: 15 },
        { header: '电压（V）', key: 'voltage', width: 15 },
        { header: '功率（W）', key: 'power', width: 15 },
        { header: '时间限', key: 'timestamp', width: 12 },
        { header: '设备地址', key: 'deviceAddr', width: 10 },
        { header: '设备类型', key: 'deviceType', width: 10 }
      ];

      // 添加表头说明行（可选）
      worksheet.insertRow(1, [
        '序号', '电流（A）', '电压（V）', '功率（W）', 
        '时间限', '设备地址设备类型',
        `数据数量: ${this.dataCache.length}`,
        `收集时间: ${this.cacheStartTime ? this.cacheStartTime.toLocaleString() : ''}`,
        '设备类型', '设备名称'
      ]);

      // 设置表头样式
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.alignment = { horizontal: 'center' };

      // 添加数据行
      this.dataCache.forEach((dataItem, index) => {
        worksheet.addRow({
          index: index + 1,
          current: parseFloat(dataItem.current || 0).toFixed(5),
          voltage: parseFloat(dataItem.voltage || 0).toFixed(5),
          power: parseFloat(dataItem.power || 0).toFixed(5),
          timestamp: dataItem.timestamp,
          deviceAddr: dataItem.deviceAddr,
          deviceType: dataItem.deviceType
        });
      });

      // 设置数字格式
      for (let i = 2; i <= this.dataCache.length + 1; i++) {
        const row = worksheet.getRow(i);
        row.getCell(2).numFmt = '0.00000'; // 电流格式
        row.getCell(3).numFmt = '0.00000'; // 电压格式
        row.getCell(4).numFmt = '0.00000'; // 功率格式
      }

      // 生成文件名
      const fileName = this.generateFileName(
        this.dataCache[0]?.deviceAddr || 1,
        {
          deviceAddr: this.dataCache[0]?.deviceAddr || 1,
          deviceType: this.dataCache[0]?.deviceType || '大机',
          timestamp: this.cacheStartTime || new Date()
        }
      );

      const filePath = path.join(this.exportDir, fileName);

      // 保存Excel文件
      await workbook.xlsx.writeFile(filePath);
      
      this.logger.info(`成功导出${this.dataCache.length}条数据到: ${fileName}`);

      // 清空缓存，准备下一批数据
      const exportedCount = this.dataCache.length;
      this.dataCache = [];
      this.cacheStartTime = null;

      return {
        success: true,
        fileName,
        filePath,
        exportedCount,
        message: `成功导出${exportedCount}条数据`
      };

    } catch (error) {
      this.logger.error(`导出缓存数据失败: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 获取当前缓存状态
  getCacheStatus() {
    return {
      currentCount: this.dataCache.length,
      maxCount: this.maxCacheSize,
      progress: `${this.dataCache.length}/${this.maxCacheSize}`,
      percentage: Math.round((this.dataCache.length / this.maxCacheSize) * 100),
      startTime: this.cacheStartTime
    };
  }

  // 生成文件名的通用方法
  generateFileName(deviceAddr, dataPacket, template = null) {
    // 如果用户设置了自定义文件名，优先使用（在文件名后添加时间戳以避免覆盖）
    if (this.userCustomFileName && this.userCustomFileName.trim() !== '') {
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
      return `${this.userCustomFileName}_${timestamp}.xlsx`;
    }
    
    // 否则使用模板生成
    const actualTemplate = template || this.customFileNameTemplate;
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const deviceAddress = dataPacket.deviceAddr || deviceAddr || 1;
    const deviceType = dataPacket.deviceType || 'unknown';
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD格式
    const time = new Date().toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS格式
    
    let fileName = actualTemplate
      .replace(/{deviceAddr}/g, deviceAddress)
      .replace(/{deviceType}/g, deviceType)
      .replace(/{timestamp}/g, timestamp)
      .replace(/{date}/g, date)
      .replace(/{time}/g, time);
    
    // 确保文件名以.xlsx结尾
    if (!fileName.endsWith('.xlsx')) {
      fileName += '.xlsx';
    }
    
    return fileName;
  }

  // 导出电流和电压数据到Excel（支持自定义文件名）
  async exportData(deviceAddr, dataPacket, customFileName = null) {
    try {
      // 创建工作簿和工作表
      const workbook = new ExcelJS.Workbook();
      workbook.creator = '智能断路器监控系统';
      workbook.lastModifiedBy = '智能断路器监控系统';
      workbook.created = new Date();
      workbook.modified = new Date();
      
      // 使用数据包中的真实设备地址，而不是API传入的默认值
      const realDeviceAddr = dataPacket.deviceAddr || deviceAddr;
      
      // 创建详细数据工作表 (只保留详细数据表，移除概览工作表)
      const dataSheet = workbook.addWorksheet('详细数据');
      dataSheet.columns = [
        { header: '序号', key: 'index', width: 10 },
        { header: '电流 (A)', key: 'current', width: 15 },
        { header: '电压 (V)', key: 'voltage', width: 15 },
        { header: '功率 (W)', key: 'power', width: 15 },
        { header: '时间戳', key: 'timestamp', width: 25 },
        { header: '设备地址', key: 'deviceAddr', width: 10 },
        { header: '设备类型', key: 'deviceType', width: 10 }
      ];
      
      // 确保数据存在，如果不存在则初始化为空数组
      if (!dataPacket.current) dataPacket.current = [];
      if (!dataPacket.voltage) dataPacket.voltage = [];
      
      // 获取两个数组的最大长度
      const maxLength = Math.max(dataPacket.current.length, dataPacket.voltage.length);
      
      // 添加元数据信息到表头
      dataSheet.addRow({ 
        index: '数据信息', 
        current: `记录时间: ${dataPacket.timestamp}`,
        voltage: `设备地址: ${realDeviceAddr}`,
        power: `设备类型: ${dataPacket.deviceType || '未知'}`,
        timestamp: `数据点数: ${maxLength}`,
        deviceAddr: '数据完整性:',
        deviceType: dataPacket.current.length === dataPacket.voltage.length ? '完整' : '部分'
      });
      
      // 添加空行
      dataSheet.addRow({});

      // 添加详细数据
      for (let i = 0; i < maxLength; i++) {
        const current = i < dataPacket.current.length ? dataPacket.current[i] : null;
        const voltage = i < dataPacket.voltage.length ? dataPacket.voltage[i] : null;
        const power = current !== null && voltage !== null ? current * voltage : null;
        
        dataSheet.addRow({
          index: i + 1,
          current,
          voltage,
          power,
          timestamp: dataPacket.timestamp,
          deviceAddr: realDeviceAddr,
          deviceType: dataPacket.deviceType || '未知'
        });
      }
      
      // 设置详细数据表格式
      dataSheet.getRow(1).font = { bold: true };
      dataSheet.getRow(3).font = { bold: true }; // 列名行的样式
      for (let i = 4; i <= maxLength + 3; i++) {
        if (dataSheet.getRow(i).getCell(2).value !== null) {
          dataSheet.getRow(i).getCell(2).numFmt = '0.00000';
        }
        if (dataSheet.getRow(i).getCell(3).value !== null) {
          dataSheet.getRow(i).getCell(3).numFmt = '0.00000';
        }
        if (dataSheet.getRow(i).getCell(4).value !== null) {
          dataSheet.getRow(i).getCell(4).numFmt = '0.00000';
        }
      }
      
      // 生成文件名 - 支持自定义文件名或使用模板
      let fileName;
      if (customFileName) {
        fileName = customFileName.endsWith('.xlsx') ? customFileName : customFileName + '.xlsx';
      } else {
        fileName = this.generateFileName(realDeviceAddr, dataPacket);
      }
      
      const filePath = path.join(this.exportDir, fileName);
      
      // 保存工作簿
      await workbook.xlsx.writeFile(filePath);
      this.logger.info(`完整原始数据已导出到: ${filePath}`);
      
      return {
        success: true,
        fileName,
        filePath
      };
    } catch (error) {
      this.logger.error(`导出数据失败: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 导出多个数据包(可以是历史数据或所有保存的数据)到单个Excel文件
  async exportMultipleDataPackets(deviceAddr, dataPackets, options = {}) {
    try {
      if (!dataPackets || !Array.isArray(dataPackets) || dataPackets.length === 0) {
        return {
          success: false,
          error: '没有可用数据进行导出'
        };
      }

      // 创建工作簿和工作表
      const workbook = new ExcelJS.Workbook();
      workbook.creator = '智能断路器监控系统';
      workbook.lastModifiedBy = '智能断路器监控系统';
      workbook.created = new Date();
      workbook.modified = new Date();
      
      // 为每个数据包创建详细数据工作表
      for (let i = 0; i < dataPackets.length; i++) {
        const packet = dataPackets[i];
        const realDeviceAddr = packet.deviceAddr || deviceAddr;
        const sheetName = `数据包${i + 1}`;
        
        // 确保数据存在，如果不存在则初始化为空数组
        if (!packet.current) packet.current = [];
        if (!packet.voltage) packet.voltage = [];
        
        // 获取两个数组的最大长度
        const maxLength = Math.max(packet.current.length, packet.voltage.length);
        
        // 创建工作表
        const dataSheet = workbook.addWorksheet(sheetName);
        dataSheet.columns = [
          { header: '序号', key: 'index', width: 10 },
          { header: '电流 (A)', key: 'current', width: 15 },
          { header: '电压 (V)', key: 'voltage', width: 15 },
          { header: '功率 (W)', key: 'power', width: 15 },
          { header: '时间戳', key: 'timestamp', width: 25 },
          { header: '设备地址', key: 'deviceAddr', width: 10 },
          { header: '设备类型', key: 'deviceType', width: 10 }
        ];
        
        // 添加元数据信息到表头
        dataSheet.addRow({ 
          index: '数据信息', 
          current: `记录时间: ${packet.timestamp}`,
          voltage: `设备地址: ${realDeviceAddr}`,
          power: `设备类型: ${packet.deviceType || '未知'}`,
          timestamp: `数据点数: ${maxLength}`,
          deviceAddr: '数据完整性:',
          deviceType: packet.current.length === packet.voltage.length ? '完整' : '部分'
        });
        
        // 添加空行
        dataSheet.addRow({});
        
        // 添加详细数据
        for (let j = 0; j < maxLength; j++) {
          const current = j < packet.current.length ? packet.current[j] : null;
          const voltage = j < packet.voltage.length ? packet.voltage[j] : null;
          const power = current !== null && voltage !== null ? current * voltage : null;
          
          dataSheet.addRow({
            index: j + 1,
            current,
            voltage,
            power,
            timestamp: packet.timestamp,
            deviceAddr: realDeviceAddr,
            deviceType: packet.deviceType || '未知'
          });
        }
        
        // 设置详细数据表格式
        dataSheet.getRow(1).font = { bold: true };
        dataSheet.getRow(3).font = { bold: true }; // 列名行的样式
        for (let j = 4; j <= maxLength + 3; j++) {
          if (dataSheet.getRow(j).getCell(2).value !== null) {
            dataSheet.getRow(j).getCell(2).numFmt = '0.00000';
          }
          if (dataSheet.getRow(j).getCell(3).value !== null) {
            dataSheet.getRow(j).getCell(3).numFmt = '0.00000';
          }
          if (dataSheet.getRow(j).getCell(4).value !== null) {
            dataSheet.getRow(j).getCell(4).numFmt = '0.00000';
          }
        }
      }
      
      // 生成文件名
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
      const fileName = `all_data_detail_${deviceAddr}_${timestamp}.xlsx`;
      const filePath = path.join(this.exportDir, fileName);
      
      // 保存工作簿
      await workbook.xlsx.writeFile(filePath);
      this.logger.info(`多个数据包的完整原始数据已导出到: ${filePath}`);
      
      return {
        success: true,
        fileName,
        filePath,
        dataPacketsCount: dataPackets.length,
        dataPointsCount: dataPackets.reduce((sum, packet) => sum + packet.current.length, 0)
      };
    } catch (error) {
      this.logger.error(`导出多个数据包失败: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // 计算平均值
  calculateAverage(array) {
    const sum = array.reduce((acc, val) => acc + val, 0);
    return sum / array.length;
  }
  
  // 获取文件路径
  getFilePath(fileName) {
    return path.join(this.exportDir, fileName);
  }
  
  // 列出所有导出的文件
  listExportedFiles() {
    try {
      const files = fs.readdirSync(this.exportDir);
      return files.filter(file => file.endsWith('.xlsx'))
        .map(file => ({
          name: file,
          path: path.join(this.exportDir, file),
          created: fs.statSync(path.join(this.exportDir, file)).birthtime
        }))
        .sort((a, b) => b.created - a.created); // 按创建时间降序排列
    } catch (error) {
      this.logger.error(`列出导出文件失败: ${error.message}`);
      return [];
    }
  }
  
  // 删除导出文件
  deleteFile(fileName) {
    try {
      const filePath = path.join(this.exportDir, fileName);
      fs.unlinkSync(filePath);
      this.logger.info(`已删除文件: ${filePath}`);
      return true;
    } catch (error) {
      this.logger.error(`删除文件失败: ${error.message}`);
      return false;
    }
  }
}

module.exports = new ExportService(); 
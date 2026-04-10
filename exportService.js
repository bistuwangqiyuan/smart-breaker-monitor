const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const winston = require('winston');

// 创建导出目录
const EXPORT_DIR = path.join(__dirname, 'exports');
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
  }

  // 导出电流和电压数据到Excel
  async exportData(deviceAddr, dataPacket) {
    try {
      // 创建工作簿和工作表
      const workbook = new ExcelJS.Workbook();
      workbook.creator = '智能断路器监控系统';
      workbook.lastModifiedBy = '智能断路器监控系统';
      workbook.created = new Date();
      workbook.modified = new Date();
      
      // 创建概览工作表
      const summarySheet = workbook.addWorksheet('概览');
      summarySheet.columns = [
        { header: '项目', key: 'item', width: 20 },
        { header: '值', key: 'value', width: 20 }
      ];
      
      // 添加概览数据
      summarySheet.addRow({ item: '设备地址', value: deviceAddr });
      summarySheet.addRow({ item: '数据点数', value: dataPacket.current.length });
      summarySheet.addRow({ item: '记录时间', value: dataPacket.timestamp });
      summarySheet.addRow({ item: '平均电流 (A)', value: this.calculateAverage(dataPacket.current) });
      summarySheet.addRow({ item: '最大电流 (A)', value: Math.max(...dataPacket.current) });
      summarySheet.addRow({ item: '最小电流 (A)', value: Math.min(...dataPacket.current) });
      summarySheet.addRow({ item: '平均电压 (V)', value: this.calculateAverage(dataPacket.voltage) });
      summarySheet.addRow({ item: '最大电压 (V)', value: Math.max(...dataPacket.voltage) });
      summarySheet.addRow({ item: '最小电压 (V)', value: Math.min(...dataPacket.voltage) });
      
      // 创建详细数据工作表
      const dataSheet = workbook.addWorksheet('详细数据');
      dataSheet.columns = [
        { header: '序号', key: 'index', width: 10 },
        { header: '电流 (A)', key: 'current', width: 15 },
        { header: '电压 (V)', key: 'voltage', width: 15 },
        { header: '功率 (W)', key: 'power', width: 15 }
      ];
      
      // 添加详细数据
      for (let i = 0; i < dataPacket.current.length; i++) {
        const current = dataPacket.current[i];
        const voltage = dataPacket.voltage[i];
        const power = current * voltage;
        dataSheet.addRow({
          index: i + 1,
          current,
          voltage,
          power
        });
      }
      
      // 给详细数据表添加样式
      dataSheet.getRow(1).font = { bold: true };
      
      // 生成文件名
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
      const fileName = `device_${deviceAddr}_${timestamp}.xlsx`;
      const filePath = path.join(this.exportDir, fileName);
      
      // 保存工作簿
      await workbook.xlsx.writeFile(filePath);
      logger.info(`数据已导出到: ${filePath}`);
      
      return {
        success: true,
        fileName,
        filePath
      };
    } catch (error) {
      logger.error(`导出数据失败: ${error.message}`);
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
      logger.error(`列出导出文件失败: ${error.message}`);
      return [];
    }
  }
  
  // 删除导出文件
  deleteFile(fileName) {
    try {
      const filePath = path.join(this.exportDir, fileName);
      fs.unlinkSync(filePath);
      logger.info(`已删除文件: ${filePath}`);
      return true;
    } catch (error) {
      logger.error(`删除文件失败: ${error.message}`);
      return false;
    }
  }
}

module.exports = new ExportService(); 
import axios from 'axios';

// 创建axios实例
const apiClient = axios.create({
  baseURL: 'http://localhost:3000/api', // 后端运行在3000端口
  timeout: 30000, // 增加超时时间到30秒
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// 格式化错误信息
const formatError = (error) => {
  if (error.code === 'ECONNABORTED') {
    return {
      message: '请求超时，请检查后端服务是否正常运行',
      code: 'TIMEOUT',
      original: error
    };
  } else if (error.response) {
    // 服务器返回了错误状态码
    return {
      message: error.response.data.error || `服务器错误: ${error.response.status}`,
      code: 'SERVER_ERROR',
      status: error.response.status,
      original: error
    };
  } else if (error.request) {
    // 请求已发送但没有收到响应
    return {
      message: '无法连接到后端服务器',
      code: 'CONNECTION_ERROR',
      original: error
    };
  } else {
    // 发送请求时出现问题
    return {
      message: error.message || '未知错误',
      code: 'UNKNOWN_ERROR',
      original: error
    };
  }
};

// API服务对象
const apiService = {
  // 串口管理
  async getPortsList() {
    try {
      const response = await apiClient.get('/ports');
      return response.data;
    } catch (error) {
      console.error('获取串口列表失败:', error);
      throw formatError(error);
    }
  },

  async connectPort(path, options) {
    try {
      const response = await apiClient.post('/connect', { path, options });
      return response.data;
    } catch (error) {
      console.error('连接串口失败:', error);
      throw formatError(error);
    }
  },

  async disconnectPort() {
    try {
      const response = await apiClient.post('/disconnect');
      return response.data;
    } catch (error) {
      console.error('断开串口失败:', error);
      throw formatError(error);
    }
  },

  // 设备控制
  async sendShutdownCommand() {
    try {
      const response = await apiClient.post('/shutdown');
      return response.data;
    } catch (error) {
      console.error('发送关断命令失败:', error);
      throw formatError(error);
    }
  },

  async sendStartCommand() {
    try {
      const response = await apiClient.post('/start');
      return response.data;
    } catch (error) {
      console.error('发送开启命令失败:', error);
      throw formatError(error);
    }
  },

  // 数据管理
  async getCurrentData() {
    try {
      const response = await apiClient.get('/data/current');
      return response.data;
    } catch (error) {
      console.error('获取当前数据失败:', error);
      throw formatError(error);
    }
  },

  async getHistoryData() {
    try {
      const response = await apiClient.get('/data/history');
      return response.data;
    } catch (error) {
      console.error('获取历史数据失败:', error);
      throw formatError(error);
    }
  },

  async clearHistoryData() {
    try {
      const response = await apiClient.post('/data/clear');
      return response.data;
    } catch (error) {
      console.error('清除历史数据失败:', error);
      throw formatError(error);
    }
  },

  // 数据导出
  async exportData(deviceAddr, customFileName = null) {
    try {
      const response = await apiClient.post('/export-custom', { 
        deviceAddr, 
        customFileName 
      });
      return response.data;
    } catch (error) {
      console.error('导出数据失败:', error);
      throw formatError(error);
    }
  },

  async getExportsList() {
    try {
      const response = await apiClient.get('/exports');
      return response.data;
    } catch (error) {
      console.error('获取导出列表失败:', error);
      throw formatError(error);
    }
  },

  async deleteExportFile(fileName) {
    try {
      const response = await apiClient.delete(`/exports/${fileName}`);
      return response.data;
    } catch (error) {
      console.error('删除导出文件失败:', error);
      throw formatError(error);
    }
  },

  // 自定义文件名管理
  async setUserCustomFileName(fileName) {
    try {
      const response = await apiClient.post('/auto-export/user-filename', { fileName });
      return response.data;
    } catch (error) {
      console.error('设置用户自定义文件名失败:', error);
      throw formatError(error);
    }
  },

  async getUserCustomFileName() {
    try {
      const response = await apiClient.get('/auto-export/user-filename');
      return response.data;
    } catch (error) {
      console.error('获取用户自定义文件名失败:', error);
      throw formatError(error);
    }
  },

  // 自动导出设置
  async getAutoExportEnabled() {
    try {
      const response = await apiClient.get('/auto-export/enabled');
      return response.data;
    } catch (error) {
      console.error('获取自动导出状态失败:', error);
      throw formatError(error);
    }
  },

  async setAutoExportEnabled(enabled) {
    try {
      const response = await apiClient.post('/auto-export/enabled', { enabled });
      return response.data;
    } catch (error) {
      console.error('设置自动导出状态失败:', error);
      throw formatError(error);
    }
  },

  // 获取下载链接
  getDownloadUrl(fileName) {
    return `${apiClient.defaults.baseURL}/exports/${fileName}`;
  },
  
  // 健康检查，用于确认后端服务是否正常运行
  async checkHealth() {
    try {
      const response = await apiClient.get('/health');
      return {
        isHealthy: response.status === 200,
        data: response.data
      };
    } catch (error) {
      console.error('服务器健康检查失败:', error);
      return {
        isHealthy: false,
        error: formatError(error)
      };
    }
  },
  
  // 手动清理数据文件
  async cleanDataFiles() {
    try {
      const response = await apiClient.post('/data/clean-files');
      return response.data;
    } catch (error) {
      console.error('清理数据文件失败:', error);
      throw formatError(error);
    }
  },

  // 获取数据缓存状态
  async getCacheStatus() {
    try {
      const response = await apiClient.get('/auto-export/cache-status');
      return response.data;
    } catch (error) {
      console.error('获取缓存状态失败:', error);
      throw formatError(error);
    }
  },

  // 手动导出当前缓存数据
  async exportCache() {
    try {
      const response = await apiClient.post('/auto-export/export-cache');
      return response.data;
    } catch (error) {
      console.error('导出缓存数据失败:', error);
      throw formatError(error);
    }
  }
};

export default apiService; 
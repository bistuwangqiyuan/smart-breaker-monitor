<template>
  <div class="home-container">
    <el-row :gutter="20" class="header-row">
      <el-col :span="24">
        <div class="page-header">
          <h1>智能断路器监控系统</h1>
          <div class="connection-status" :class="{ 'connected': isConnected }">
            {{ isConnected ? '已连接' : '未连接' }}
          </div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="main-row">
      <!-- 左侧控制面板 -->
      <el-col :span="6">
        <el-card class="control-card">
          <template #header>
            <div class="card-header">
              <span>设备控制</span>
            </div>
          </template>
          
          <div class="control-content">
            <h3>设备连接</h3>
            <el-form label-position="top">
              <el-form-item label="选择串口">
                <el-select 
                  v-model="selectedPort" 
                  placeholder="选择串口"
                  :disabled="isConnected">
                  <el-option
                    v-for="port in portsList"
                    :key="port.path"
                    :label="port.path"
                    :value="port.path">
                    <span>{{ port.path }}</span>
                    <span class="port-info">{{ port.manufacturer || 'Unknown' }}</span>
                  </el-option>
                </el-select>
              </el-form-item>
              
              <el-form-item label="波特率">
                <el-select 
                  v-model="baudRate" 
                  placeholder="选择波特率"
                  :disabled="isConnected">
                  <el-option label="9600" value="9600"></el-option>
                  <el-option label="19200" value="19200"></el-option>
                  <el-option label="38400" value="38400"></el-option>
                  <el-option label="57600" value="57600"></el-option>
                  <el-option label="115200" value="115200"></el-option>
                </el-select>
              </el-form-item>
              
              <el-form-item>
                <el-button 
                  type="primary" 
                  :disabled="!selectedPort || isConnected"
                  @click="connectPort">
                  连接设备
                </el-button>
                <el-button 
                  type="danger" 
                  :disabled="!isConnected"
                  @click="disconnectPort">
                  断开连接
                </el-button>
              </el-form-item>
            </el-form>
            
            <el-divider></el-divider>
            
            <h3>设备操作</h3>
            <div class="device-actions">
              <el-button 
                type="success" 
                :disabled="!isConnected"
                @click="sendStartCommand">
                设备开启
              </el-button>
              <el-button 
                type="warning" 
                :disabled="!isConnected"
                @click="sendShutdownCommand">
                设备关断
              </el-button>
              <el-button 
                type="primary" 
                :disabled="!isConnected"
                @click="sendPulseCommand">
                短脉冲开启
              </el-button>
            </div>
            
            <el-divider></el-divider>
            
            <h3>数据操作</h3>
            <div class="data-actions">
              <!-- 自定义文件名设置 -->
              <div class="custom-filename-section">
                <div class="filename-label">
                  <label>自定义文件名（不含后缀）：</label>
                </div>
                <div class="filename-input-row">
                  <el-input 
                    v-model="customFileName" 
                    type="textarea"
                    :rows="2"
                    placeholder="例如：监测报告、设备数据、实验记录等（支持中英文）"
                    clearable
                    maxlength="50"
                    show-word-limit
                    class="large-filename-input">
                  </el-input>
                </div>
                <div class="filename-preview" v-if="customFileName.trim() !== ''">
                  <small>📁 预览效果: {{ customFileName }}_时间戳.xlsx</small>
                </div>
                <div class="filename-preview default-preview" v-else>
                  <small>📁 当前使用默认格式: data_设备地址_时间戳.xlsx</small>
                </div>
                <div class="filename-save-row">
                  <el-button 
                    type="primary" 
                    @click="saveCustomFileName"
                    :disabled="customFileName === currentSavedFileName"
                    class="save-filename-btn">
                    保存文件名设置
                  </el-button>
                </div>
              </div>
              
              <el-button 
                type="primary" 
                :disabled="!hasData"
                @click="exportData">
                导出数据
              </el-button>
              <el-button 
                type="info" 
                :disabled="!hasData"
                @click="clearData">
                清除数据
              </el-button>
              
              <el-divider></el-divider>
              
              <!-- 数据缓存状态显示 - 移到最下边 -->
              <div class="cache-status-section">
                <div class="cache-status-header">
                  <h4>📊 数据收集状态</h4>
                  <el-button 
                    size="small" 
                    type="info" 
                    @click="refreshCacheStatus"
                    :loading="cacheStatusLoading">
                    刷新状态
                  </el-button>
                </div>
                
                <div class="cache-info" v-if="cacheStatus">
                  <div class="cache-progress">
                    <div class="progress-text">
                      <span>收集进度: {{ cacheStatus.currentCount }}/{{ cacheStatus.maxCount }}条数据</span>
                      <span class="progress-percentage">{{ cacheStatus.percentage }}%</span>
                    </div>
                    <el-progress 
                      :percentage="cacheStatus.percentage" 
                      :color="cacheStatus.percentage === 100 ? '#67C23A' : '#409EFF'"
                      :stroke-width="10">
                    </el-progress>
                  </div>
                  
                  <div class="cache-details">
                    <el-tag v-if="cacheStatus.percentage === 100" type="success" size="large">
                      ✅ 已达到100条，可以导出
                    </el-tag>
                    <el-tag v-else type="info" size="large">
                      🔄 还需 {{ cacheStatus.maxCount - cacheStatus.currentCount }} 条数据
                    </el-tag>
                    
                    <div class="cache-actions" v-if="cacheStatus.currentCount > 0">
                      <el-button 
                        type="warning" 
                        size="small"
                        @click="exportCacheManually"
                        :loading="exportingCache">
                        手动导出当前数据 ({{ cacheStatus.currentCount }}条)
                      </el-button>
                    </div>
                  </div>
                </div>

                <div class="cache-empty" v-else>
                  <el-empty 
                    :image-size="60" 
                    description="暂无缓存数据，等待设备数据接收">
                  </el-empty>
                </div>
              </div>
            </div>
            
            <el-divider></el-divider>
            
            <h3>系统维护</h3>
            <div class="maintenance-actions">
              <el-button 
                type="warning" 
                @click="cleanDataFiles">
                清理数据文件
              </el-button>
            </div>
          </div>
        </el-card>
      </el-col>
      
      <!-- 右侧数据显示区 -->
      <el-col :span="18">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header">
              <span>正常工作数据（每5秒采集）</span>
              <div class="header-tags">
                <el-tag v-if="anomalyState.status === 'warning'" type="warning" size="small" effect="dark">
                  ⚠ 可能异常（等待恢复中...）
                </el-tag>
                <el-tag v-if="anomalyState.status === 'fault'" type="danger" size="small" effect="dark">
                  ✕ 异常已关断
                </el-tag>
                <el-tag v-if="monitorData.timestamps.length > 0" size="small">
                  数据点: {{ monitorData.timestamps.length }}
                </el-tag>
              </div>
            </div>
          </template>
          
          <div class="chart-container">
            <div v-if="monitorData.timestamps.length === 0" class="no-data-overlay">
              <el-empty description="等待采集数据..." />
            </div>
            <div ref="monitorChartRef" class="chart"></div>
          </div>
        </el-card>

        <el-card class="chart-card">
          <template #header>
            <div class="card-header">
              <span>关断数据</span>
              <el-tag v-if="lastUpdateTime" size="small">
                最后更新: {{ formatTime(lastUpdateTime) }}
              </el-tag>
            </div>
          </template>
          
          <div class="chart-container">
            <div v-if="!hasData" class="no-data-overlay">
              <el-empty description="暂无数据" />
            </div>
            <div ref="chartRef" class="chart"></div>
          </div>
        </el-card>
        
        <el-card class="export-card">
          <template #header>
            <div class="card-header">
              <span>导出记录</span>
              <el-button 
                size="small" 
                @click="refreshExportsList">
                刷新
              </el-button>
            </div>
          </template>
          
          <div class="exports-list">
            <el-table :data="exportsList" style="width: 100%">
              <el-table-column prop="name" label="文件名"></el-table-column>
              <el-table-column prop="created" label="创建时间">
                <template #default="scope">
                  {{ formatDate(scope.row.created) }}
                </template>
              </el-table-column>
              <el-table-column label="操作" width="150">
                <template #default="scope">
                  <el-button 
                    size="small" 
                    type="primary"
                    @click="downloadExportFile(scope.row.name)">
                    下载
                  </el-button>
                  <el-button 
                    size="small" 
                    type="danger"
                    @click="deleteExportFile(scope.row.name)">
                    删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as echarts from 'echarts';
import apiService from '../services/api';
import wsService from '../services/websocket';

export default {
  name: 'HomePage',
  
  setup() {
    // 状态变量
    const isConnected = ref(false);
    const portsList = ref([]);
    const selectedPort = ref('');
    const baudRate = ref('115200');
    const chartRef = ref(null);
    const chartInstance = ref(null);
    const currentData = ref({ current: [], voltage: [] });
    const lastUpdateTime = ref(null);
    
    const monitorChartRef = ref(null);
    const monitorChartInstance = ref(null);
    const monitorData = ref({ timestamps: [], current: [], voltage: [], power: [] });
    const monitorPollTimer = ref(null);
    
    // 异常检测相关
    const anomalyState = ref({
      status: 'normal',        // 'normal' | 'warning' | 'fault'
      warningIndex: -1,        // "可能异常"触发时的数据点索引
      warningTime: null,       // "可能异常"触发时间
      baselinePower: 0,        // 异常前的基线功率
      faultIndex: -1,          // "异常"确认时的数据点索引
      markPoints: [],          // 标记点列表（用于图表显示）
    });
    const exportsList = ref([]);
    const customFileName = ref(''); // 新增：自定义文件名
    const currentSavedFileName = ref(''); // 新增：当前保存的文件名
    
    // 自动连接相关
    const portScanTimer = ref(null);
    
    // 缓存状态相关
    const cacheStatus = ref(null);
    const cacheStatusLoading = ref(false);
    const exportingCache = ref(false);
    
    // 计算属性
    const hasData = computed(() => {
      // 只要有任何数据就允许导出
      return currentData.value && 
             ((currentData.value.current && currentData.value.current.length > 0) || 
              (currentData.value.voltage && currentData.value.voltage.length > 0));
    });
    
    // 获取串口列表并自动连接
    const fetchPortsList = async (autoConnect = false) => {
      try {
        portsList.value = await apiService.getPortsList();
        
        if (autoConnect && !isConnected.value && portsList.value.length > 0) {
          selectedPort.value = portsList.value[0].path;
          await autoConnectPort();
        }
      } catch (error) {
        console.warn('获取串口列表失败:', error);
      }
    };
    
    // 自动连接第一个可用串口
    const autoConnectPort = async () => {
      if (isConnected.value || !selectedPort.value) return;
      try {
        await apiService.connectPort(selectedPort.value, {
          baudRate: parseInt(baudRate.value)
        });
        isConnected.value = true;
        ElMessage.success(`已自动连接设备: ${selectedPort.value}`);
        stopPortScan();
      } catch (error) {
        console.warn('自动连接失败:', error);
      }
    };
    
    // 启动端口扫描定时器
    const startPortScan = () => {
      if (portScanTimer.value) return;
      portScanTimer.value = setInterval(() => {
        if (!isConnected.value) {
          fetchPortsList(true);
        } else {
          stopPortScan();
        }
      }, 3000);
    };
    
    // 停止端口扫描
    const stopPortScan = () => {
      if (portScanTimer.value) {
        clearInterval(portScanTimer.value);
        portScanTimer.value = null;
      }
    };
    
    // 连接设备
    const connectPort = async () => {
      try {
        await apiService.connectPort(selectedPort.value, {
          baudRate: parseInt(baudRate.value)
        });
        isConnected.value = true;
        ElMessage.success('设备连接成功');
      } catch (error) {
        ElMessage.error('设备连接失败');
      }
    };
    
    // 断开连接
    const disconnectPort = async () => {
      try {
        await apiService.disconnectPort();
        isConnected.value = false;
        ElMessage.success('设备已断开连接');
      } catch (error) {
        ElMessage.error('断开连接失败');
      }
    };
    
    // 发送开启命令
    const sendStartCommand = async () => {
      try {
        await apiService.sendStartCommand();
        ElMessage.success('开启命令已发送');
      } catch (error) {
        ElMessage.error('发送开启命令失败');
      }
    };
    
    // 发送关断命令
    const sendShutdownCommand = async () => {
      try {
        await apiService.sendShutdownCommand();
        ElMessage.success('关断命令已发送');
      } catch (error) {
        ElMessage.error('发送关断命令失败');
      }
    };
    
    // 发送短脉冲命令（开启后100ms自动关断）
    const sendPulseCommand = async () => {
      try {
        await apiService.sendStartCommand();
        ElMessage.success('开启命令已发送');
        
        // 等待100ms后发送关断命令
        setTimeout(async () => {
          try {
            await apiService.sendShutdownCommand();
            ElMessage.success('关断命令已发送（短脉冲完成）');
          } catch (error) {
            ElMessage.error('发送关断命令失败');
          }
        }, 900);
      } catch (error) {
        ElMessage.error('发送开启命令失败');
      }
    };
    
    // 导出数据
    const exportData = async () => {
      try {
        // 在导出前自动设置文件名到后端，确保使用输入框中的最新值
        if (customFileName.value.trim() !== '') {
          await apiService.setUserCustomFileName(customFileName.value.trim());
        }
        
        // 直接使用输入框中的当前值，无需点击保存按钮
        const fileNameToUse = customFileName.value.trim() !== '' ? customFileName.value : null;
        const result = await apiService.exportData(1, fileNameToUse); // 使用默认设备地址1
        ElMessage.success(`数据导出成功: ${result.fileName}`);
        refreshExportsList();
      } catch (error) {
        ElMessage.error('导出数据失败: ' + (error.message || '未知错误'));
      }
    };
    
    // 清除数据
    const clearData = async () => {
      try {
        await ElMessageBox.confirm('确定要清除当前数据吗？', '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        });
        
        await apiService.clearHistoryData();
        currentData.value = { current: [], voltage: [] };
        lastUpdateTime.value = null;
        updateChart();
        ElMessage.success('数据已清除');
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('清除数据失败');
        }
      }
    };
    
    // 清理数据文件
    const cleanDataFiles = async () => {
      try {
        await ElMessageBox.confirm('确定要清理旧的数据文件吗？将保留最新的文件。', '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        });
        
        const result = await apiService.cleanDataFiles();
        if (result.success) {
          ElMessage.success(`文件清理成功: ${result.message}`);
        } else {
          ElMessage.error('文件清理失败');
        }
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('清理数据文件失败');
        }
      }
    };
    
    // 获取导出文件列表
    const refreshExportsList = async () => {
      try {
        exportsList.value = await apiService.getExportsList();
      } catch (error) {
        ElMessage.error('获取导出文件列表失败');
      }
    };
    
    // 下载导出文件
    const downloadExportFile = (fileName) => {
      const url = apiService.getDownloadUrl(fileName);
      window.open(url, '_blank');
    };
    
    // 删除导出文件
    const deleteExportFile = async (fileName) => {
      try {
        await ElMessageBox.confirm(`确定要删除文件 ${fileName} 吗？`, '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        });
        
        await apiService.deleteExportFile(fileName);
        refreshExportsList();
        ElMessage.success('文件已删除');
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('删除文件失败');
        }
      }
    };

    // 保存自定义文件名
    const saveCustomFileName = async () => {
      try {
        const result = await apiService.setUserCustomFileName(customFileName.value || '');
        currentSavedFileName.value = customFileName.value;
        ElMessage.success(result.message);
        
        // 同时保存到localStorage作为备份
        if (customFileName.value.trim() !== '') {
          localStorage.setItem('customExportFileName', customFileName.value);
        } else {
          localStorage.removeItem('customExportFileName');
        }
      } catch (error) {
        ElMessage.error('保存文件名失败: ' + (error.message || '未知错误'));
      }
    };

    // 加载用户自定义文件名设置
    const loadCustomFileName = async () => {
      try {
        const result = await apiService.getUserCustomFileName();
        if (result.fileName && result.fileName.trim() !== '') {
          customFileName.value = result.fileName;
          currentSavedFileName.value = result.fileName;
        }
      } catch (error) {
        console.warn('从服务器加载自定义文件名失败，尝试从本地加载:', error);
        // 如果服务器获取失败，尝试从localStorage加载
        const savedFileName = localStorage.getItem('customExportFileName');
        if (savedFileName) {
          customFileName.value = savedFileName;
          currentSavedFileName.value = savedFileName;
        }
      }
    };

    // 刷新缓存状态
    const refreshCacheStatus = async () => {
      cacheStatusLoading.value = true;
      try {
        const result = await apiService.getCacheStatus();
        if (result.success) {
          cacheStatus.value = result;
        }
      } catch (error) {
        console.error('获取缓存状态失败:', error);
        ElMessage.error('获取缓存状态失败');
      } finally {
        cacheStatusLoading.value = false;
      }
    };

    // 手动导出当前缓存数据
    const exportCacheManually = async () => {
      exportingCache.value = true;
      try {
        // 在导出前自动设置文件名到后端，确保使用输入框中的最新值
        if (customFileName.value.trim() !== '') {
          await apiService.setUserCustomFileName(customFileName.value.trim());
        }
        
        const result = await apiService.exportCache();
        if (result.success) {
          ElMessage.success(`成功导出${result.exportedCount}条数据: ${result.fileName}`);
          // 刷新缓存状态和文件列表
          await refreshCacheStatus();
          await refreshExportsList();
        } else {
          ElMessage.error('手动导出失败: ' + result.error);
        }
      } catch (error) {
        console.error('手动导出缓存失败:', error);
        ElMessage.error('手动导出缓存失败: ' + (error.message || '未知错误'));
      } finally {
        exportingCache.value = false;
      }
    };
    
    // 初始化图表
    const initChart = () => {
      if (chartRef.value) {
        chartInstance.value = echarts.init(chartRef.value);
        updateChart();
        
        // 响应窗口调整大小
        window.addEventListener('resize', () => {
          chartInstance.value?.resize();
        });
      }
    };
    
    // 更新图表数据
    const updateChart = () => {
      if (!chartInstance.value) return;
      
      const currentArr = currentData.value.current;
      let shutdownIndex = -1;
      for (let i = 0; i < currentArr.length; i++) {
        if (currentArr[i] < 0.7) {
          shutdownIndex = i;
          break;
        }
      }
      
      const currentSeriesMarkLine = shutdownIndex >= 0 ? {
        symbol: 'none',
        data: [
          {
            xAxis: shutdownIndex,
            label: {
              show: true,
              formatter: `关断时间: ${shutdownIndex} ms`,
              position: 'insideStartTop',
              color: '#FF0000',
              fontWeight: 'bold',
              fontSize: 13,
              rotate: 0
            },
            lineStyle: {
              color: '#FF0000',
              type: 'solid',
              width: 2
            }
          }
        ]
      } : undefined;
      
      const option = {
        title: {
          text: '电流和电压波形'
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: {
            type: 'cross'
          }
        },
        legend: {
          data: ['电流 (A)', '电压 (V)']
        },
        toolbox: {
          feature: {
            saveAsImage: {}
          }
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '3%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: Array.from({ length: currentArr.length }, (_, i) => i)
        },
        yAxis: [
          {
            type: 'value',
            name: '电流 (A)',
            position: 'left',
            axisLine: {
              show: true,
              lineStyle: {
                color: '#5470C6'
              }
            }
          },
          {
            type: 'value',
            name: '电压 (V)',
            position: 'right',
            axisLine: {
              show: true,
              lineStyle: {
                color: '#91CC75'
              }
            }
          }
        ],
        series: [
          {
            name: '电流 (A)',
            type: 'line',
            smooth: true,
            data: currentArr,
            itemStyle: {
              color: '#5470C6'
            },
            markLine: currentSeriesMarkLine
          },
          {
            name: '电压 (V)',
            type: 'line',
            smooth: true,
            yAxisIndex: 1,
            data: currentData.value.voltage,
            itemStyle: {
              color: '#91CC75'
            }
          }
        ]
      };
      
      chartInstance.value.setOption(option, true);
    };
    
    // 初始化正常工作数据图表
    const initMonitorChart = () => {
      if (monitorChartRef.value) {
        monitorChartInstance.value = echarts.init(monitorChartRef.value);
        updateMonitorChart();
        
        window.addEventListener('resize', () => {
          monitorChartInstance.value?.resize();
        });
      }
    };
    
    // 更新正常工作数据图表
    const updateMonitorChart = () => {
      if (!monitorChartInstance.value) return;
      
      // 构建异常标记点
      const warningPoints = anomalyState.value.markPoints
        .filter(p => p.type === 'warning' && p.index < monitorData.value.power.length)
        .map(p => ({
          coord: [p.index, monitorData.value.power[p.index]],
          symbol: 'triangle',
          symbolSize: 14,
          itemStyle: { color: '#E6A23C' },
          label: { show: true, formatter: '可能异常', color: '#E6A23C', fontWeight: 'bold', position: 'top', fontSize: 12 }
        }));
      
      const faultPoints = anomalyState.value.markPoints
        .filter(p => p.type === 'fault' && p.index < monitorData.value.power.length)
        .map(p => ({
          coord: [p.index, monitorData.value.power[p.index]],
          symbol: 'pin',
          symbolSize: 18,
          itemStyle: { color: '#F56C6C' },
          label: { show: true, formatter: '异常关断', color: '#F56C6C', fontWeight: 'bold', position: 'top', fontSize: 12 }
        }));
      
      const powerMarkPoint = (warningPoints.length > 0 || faultPoints.length > 0) ? {
        data: [...warningPoints, ...faultPoints]
      } : undefined;
      
      const option = {
        title: {
          text: '电压电流功率实时监测'
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: {
            type: 'cross'
          }
        },
        legend: {
          data: ['电流 (A)', '电压 (V)', '功率 (W)']
        },
        toolbox: {
          feature: {
            saveAsImage: {}
          }
        },
        grid: {
          left: '3%',
          right: '8%',
          bottom: '3%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: monitorData.value.timestamps,
          axisLabel: {
            rotate: 30
          }
        },
        yAxis: [
          {
            type: 'value',
            name: '电流 (A)',
            position: 'left',
            axisLine: {
              show: true,
              lineStyle: { color: '#5470C6' }
            }
          },
          {
            type: 'value',
            name: '电压 (V)',
            position: 'right',
            offset: 0,
            axisLine: {
              show: true,
              lineStyle: { color: '#91CC75' }
            }
          },
          {
            type: 'value',
            name: '功率 (W)',
            position: 'right',
            offset: 60,
            axisLine: {
              show: true,
              lineStyle: { color: '#EE6666' }
            }
          }
        ],
        series: [
          {
            name: '电流 (A)',
            type: 'line',
            smooth: true,
            data: monitorData.value.current,
            itemStyle: { color: '#5470C6' }
          },
          {
            name: '电压 (V)',
            type: 'line',
            smooth: true,
            yAxisIndex: 1,
            data: monitorData.value.voltage,
            itemStyle: { color: '#91CC75' }
          },
          {
            name: '功率 (W)',
            type: 'line',
            smooth: true,
            yAxisIndex: 2,
            data: monitorData.value.power,
            itemStyle: { color: '#EE6666' },
            lineStyle: { width: 2, type: 'solid' },
            markPoint: powerMarkPoint
          }
        ]
      };
      
      monitorChartInstance.value.setOption(option, true);
    };
    
    // 从真实串口数据中采样一个监测点（由handleSerialData调用）
    const addMonitorSample = (sampleCurrent, sampleVoltage) => {
      const now = new Date();
      const timeLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      
      const curPower = Math.round(sampleCurrent * sampleVoltage * 1000) / 1000;
      
      monitorData.value.timestamps.push(timeLabel);
      monitorData.value.current.push(sampleCurrent);
      monitorData.value.voltage.push(sampleVoltage);
      monitorData.value.power.push(curPower);
      
      const idx = monitorData.value.power.length - 1;
      
      // --- 异常检测逻辑 ---
      const SAMPLE_INTERVAL = 5;    // 5秒采集间隔
      const SLOPE_THRESHOLD = 1;    // 1 W/s
      const RECOVERY_TIMEOUT = 30000; // 30秒（毫秒）
      const RECOVERY_RATIO = 0.8;   // 恢复到基线的80%
      
      if (monitorData.value.power.length >= 2) {
        const prevPower = monitorData.value.power[idx - 1];
        const powerSlope = Math.abs(curPower - prevPower) / SAMPLE_INTERVAL;
        
        if (anomalyState.value.status === 'normal') {
          if (powerSlope > SLOPE_THRESHOLD) {
            anomalyState.value.status = 'warning';
            anomalyState.value.warningIndex = idx;
            anomalyState.value.warningTime = now;
            anomalyState.value.baselinePower = prevPower;
            anomalyState.value.markPoints.push({
              index: idx,
              type: 'warning',
              label: `可能异常 (${powerSlope.toFixed(2)} W/s)`
            });
            ElMessage.warning(`功率变化率 ${powerSlope.toFixed(2)} W/s 超过阈值 1 W/s，可能异常！`);
          }
        } else if (anomalyState.value.status === 'warning') {
          const baseline = anomalyState.value.baselinePower;
          const recoveryTarget = baseline * RECOVERY_RATIO;
          const elapsed = now.getTime() - anomalyState.value.warningTime.getTime();
          
          if (baseline > 0 && curPower >= recoveryTarget) {
            anomalyState.value.status = 'normal';
            anomalyState.value.warningIndex = -1;
            anomalyState.value.warningTime = null;
            ElMessage.success('功率已恢复正常');
          } else if (elapsed >= RECOVERY_TIMEOUT) {
            anomalyState.value.status = 'fault';
            anomalyState.value.faultIndex = idx;
            anomalyState.value.markPoints.push({
              index: idx,
              type: 'fault',
              label: `异常关断 (30s未恢复)`
            });
            ElMessage.error('30秒内未恢复至正常功率的80%，确认异常，正在关断设备...');
            
            apiService.sendShutdownCommand().then(() => {
              ElMessage.warning('已发送关断命令');
            }).catch((err) => {
              ElMessage.error('关断命令发送失败: ' + (err.message || ''));
            });
            
            anomalyState.value.status = 'normal';
            anomalyState.value.warningIndex = -1;
            anomalyState.value.warningTime = null;
          }
        }
      }
      
      // 限制最大数据点数
      const maxPoints = 360;
      if (monitorData.value.timestamps.length > maxPoints) {
        const removeCount = monitorData.value.timestamps.length - maxPoints;
        monitorData.value.timestamps.splice(0, removeCount);
        monitorData.value.current.splice(0, removeCount);
        monitorData.value.voltage.splice(0, removeCount);
        monitorData.value.power.splice(0, removeCount);
        anomalyState.value.markPoints = anomalyState.value.markPoints
          .map(p => ({ ...p, index: p.index - removeCount }))
          .filter(p => p.index >= 0);
      }
      
      updateMonitorChart();
    };
    
    // 格式化时间
    const formatTime = (date) => {
      if (!date) return '';
      const d = new Date(date);
      return d.toLocaleTimeString();
    };
    
    // 格式化日期
    const formatDate = (date) => {
      if (!date) return '';
      const d = new Date(date);
      return d.toLocaleString();
    };
    
    // 每5秒主动轮询后端获取最新数据，更新正常工作数据图表
    const startMonitorPolling = () => {
      if (monitorPollTimer.value) return;
      monitorPollTimer.value = setInterval(async () => {
        try {
          const data = await apiService.getCurrentData();
          const currArr = data.current || [];
          const voltArr = data.voltage || [];
          
          if (currArr.length > 0 || voltArr.length > 0) {
            const sampleCurrent = currArr.length > 0
              ? Math.round((currArr.reduce((a, b) => a + b, 0) / currArr.length) * 1000) / 1000
              : 0;
            const sampleVoltage = voltArr.length > 0
              ? Math.round((voltArr.reduce((a, b) => a + b, 0) / voltArr.length) * 1000) / 1000
              : 0;
            
            if (!monitorChartInstance.value) {
              nextTick(() => {
                initMonitorChart();
                addMonitorSample(sampleCurrent, sampleVoltage);
              });
            } else {
              addMonitorSample(sampleCurrent, sampleVoltage);
            }
          }
        } catch (error) {
          // 后端未连接时静默忽略
        }
      }, 5000);
    };
    
    const stopMonitorPolling = () => {
      if (monitorPollTimer.value) {
        clearInterval(monitorPollTimer.value);
        monitorPollTimer.value = null;
      }
    };
    
    // 处理WebSocket数据（仅更新关断数据图表）
    const handleSerialData = (data) => {
      if (data && data.data) {
        currentData.value = {
          current: data.data.current,
          voltage: data.data.voltage
        };
        lastUpdateTime.value = new Date();
        
        if (!chartInstance.value) {
          nextTick(() => {
            initChart();
          });
        } else {
          updateChart();
        }
      }
    };
    
    // 处理WebSocket连接状态
    const handleSerialStatus = (data) => {
      isConnected.value = data.status === 'connected';
      if (isConnected.value) {
        ElMessage.success(`已连接到设备: ${data.path}`);
        stopPortScan();
      } else {
        ElMessage.warning('设备已断开连接，正在尝试重连...');
        startPortScan();
      }
    };

    // 处理数据缓存状态更新
    const handleDataCached = (data) => {
      // 更新缓存状态
      cacheStatus.value = {
        currentCount: data.currentCount,
        maxCount: data.targetCount,
        progress: data.progress,
        percentage: data.percentage,
        startTime: data.timestamp
      };
      
      // 显示进度提示
      if (data.percentage >= 90) {
        ElMessage.info(`数据收集接近完成: ${data.progress}`);
      } else if (data.currentCount % 20 === 0) {
        // 每收集20条显示一次进度
        ElMessage.info(`数据收集中: ${data.progress}`);
      }
    };

    // 处理自动导出成功
    const handleAutoExportSuccess = async (data) => {
      ElMessage.success(`🎉 自动导出成功: ${data.fileName} (${data.exportedCount}条数据)`);
      
      // 刷新文件列表和缓存状态
      await refreshExportsList();
      await refreshCacheStatus();
    };

    // 处理自动导出错误
    const handleAutoExportError = (data) => {
      ElMessage.error(`❌ 自动导出失败: ${data.error || data.message}`);
    };
    
    // 处理缓存清理事件
    const handleCacheCleaned = (data) => {
      ElMessage.info({
        message: '系统已自动清理数据缓存，保留最新数据',
        duration: 5000
      });
      // 更新图表，确保显示最新的数据
      updateChart();
    };
    
    // 初始化
    onMounted(() => {
      // 获取串口列表并尝试自动连接
      fetchPortsList(true);
      startPortScan();
      
      // 初始化图表
      initChart();
      initMonitorChart();
      startMonitorPolling();
      
      // 获取导出文件列表
      refreshExportsList();

      // 尝试从localStorage加载自定义文件名
      const savedFileName = localStorage.getItem('customExportFileName');
      if (savedFileName) {
        customFileName.value = savedFileName;
        currentSavedFileName.value = savedFileName;
      }

      // 加载用户自定义文件名设置
      loadCustomFileName();
      
      // 初始化缓存状态
      refreshCacheStatus();
      
      // 连接WebSocket
      wsService.connect();
      
      // 设置WebSocket事件监听
      wsService.on('serialData', handleSerialData);
      wsService.on('serialStatus', handleSerialStatus);
      wsService.on('dataCached', handleDataCached);
      wsService.on('autoExportSuccess', handleAutoExportSuccess);
      wsService.on('autoExportError', handleAutoExportError);
      wsService.on('cache-cleaned', handleCacheCleaned);
      wsService.on('connected', () => {
        ElMessage.success('已连接到服务器');
      });
      wsService.on('disconnected', () => {
        ElMessage.warning('与服务器连接断开');
      });
    });
    
    // 清理资源
    onUnmounted(() => {
      wsService.disconnect();
      stopPortScan();
      stopMonitorPolling();
      
      if (chartInstance.value) {
        chartInstance.value.dispose();
      }
      if (monitorChartInstance.value) {
        monitorChartInstance.value.dispose();
      }
    });
    
    return {
      isConnected,
      portsList,
      selectedPort,
      baudRate,
      chartRef,
      monitorChartRef,
      monitorData,
      anomalyState,
      currentData,
      lastUpdateTime,
      exportsList,
      hasData,
      customFileName,
      currentSavedFileName,
      // 缓存状态相关
      cacheStatus,
      cacheStatusLoading,
      exportingCache,
      refreshCacheStatus,
      exportCacheManually,
      // 原有方法
      fetchPortsList,
      connectPort,
      disconnectPort,
      sendStartCommand,
      sendShutdownCommand,
      sendPulseCommand,
      exportData,
      clearData,
      cleanDataFiles,
      refreshExportsList,
      downloadExportFile,
      deleteExportFile,
      saveCustomFileName,
      formatTime,
      formatDate
    };
  }
};
</script>

<style scoped>
.home-container {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.connection-status {
  padding: 8px 16px;
  border-radius: 4px;
  background-color: #f56c6c;
  color: white;
}

.connection-status.connected {
  background-color: #67c23a;
}

.main-row {
  margin-bottom: 20px;
}

.control-card,
.chart-card,
.export-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-tags {
  display: flex;
  gap: 8px;
  align-items: center;
}

.control-content {
  padding: 10px 0;
}

.device-actions,
.data-actions,
.maintenance-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 20px;
}

.port-info {
  float: right;
  color: #999;
  font-size: 13px;
}

.chart-container {
  height: 400px;
  width: 100%;
  position: relative;
}

.chart {
  height: 100%;
  width: 100%;
}

.no-data-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1;
  background: #fff;
}

.custom-filename-section {
  margin-bottom: 15px;
  padding: 20px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background-color: #fafbfc;
}

.custom-filename-section .el-form-item {
  margin-bottom: 10px;
}

.filename-label {
  margin-bottom: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.filename-input-row {
  margin-bottom: 20px;
}

.large-filename-input {
  width: 100%;
}

.large-filename-input .el-input__inner,
.large-filename-input .el-textarea__inner {
  height: 250px !important;
  font-size: 22px !important;
  line-height: 1.6 !important;
  padding: 20px 24px !important;
  border-radius: 8px;
  border: 2px solid #dcdfe6;
  transition: all 0.3s ease;
  resize: vertical;
  min-height: 200px;
  max-height: 400px;
  background-color: #ffffff;
}

.large-filename-input .el-input__inner:focus,
.large-filename-input .el-textarea__inner:focus {
  border-color: #409eff;
  box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.15);
  outline: none;
}

.large-filename-input .el-input__inner::placeholder,
.large-filename-input .el-textarea__inner::placeholder {
  font-size: 18px;
  color: #c0c4cc;
  line-height: 1.8;
}

.large-filename-input .el-textarea {
  position: relative;
}

.large-filename-input .el-input__count {
  position: absolute;
  bottom: 10px;
  right: 15px;
  background-color: rgba(255, 255, 255, 0.9);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 14px;
  z-index: 1;
}

.filename-save-row {
  margin-bottom: 15px;
}

.save-filename-btn {
  width: 100%;
  height: 50px;
  font-size: 18px;
  font-weight: 600;
  border-radius: 8px;
}

.filename-preview {
  margin-top: 8px;
  color: #666;
  font-size: 15px;
  padding: 8px 12px;
  background-color: #f0f2f5;
  border-radius: 6px;
  border-left: 4px solid #409eff;
}

.filename-preview.default-preview {
  border-left-color: #67c23a; /* 默认预览的边框颜色 */
}

.data-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.data-actions .el-button {
  width: 100%;
}

/* 缓存状态样式 */
.cache-status-section {
  margin-bottom: 20px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 16px;
  background: #f8f9fa;
}

.cache-status-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.cache-status-header h4 {
  margin: 0;
  color: #409eff;
  font-size: 16px;
  font-weight: 600;
}

.cache-info {
  background: white;
  border-radius: 6px;
  padding: 16px;
}

.cache-progress {
  margin-bottom: 15px;
}

.progress-text {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 14px;
  color: #606266;
}

.progress-percentage {
  font-weight: 600;
  color: #409eff;
}

.cache-details {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
}

.cache-actions {
  width: 100%;
}

.cache-empty {
  text-align: center;
  padding: 20px 0;
}

.el-progress {
  margin: 0;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .cache-status-header {
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;
  }
  
  .progress-text {
    flex-direction: column;
    gap: 5px;
    align-items: flex-start;
  }
}
</style> 
/**
 * 智能断路器监控系统 - 自动导出功能测试脚本
 * 使用方法: node 测试自动导出.js
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';

// 测试配置
const tests = [
  {
    name: '检查自动导出状态',
    method: 'GET',
    url: '/api/auto-export/enabled'
  },
  {
    name: '检查文件名模板',
    method: 'GET', 
    url: '/api/auto-export/filename-template'
  },
  {
    name: '设置自定义文件名模板',
    method: 'POST',
    url: '/api/auto-export/filename-template',
    data: { template: '测试数据_{deviceAddr}_{date}_{time}' }
  },
  {
    name: '开启自动导出',
    method: 'POST',
    url: '/api/auto-export/enabled',
    data: { enabled: true }
  }
];

async function runTests() {
  console.log('🚀 开始测试智能断路器监控系统自动导出功能...\n');
  
  // 检查服务器是否运行
  try {
    await axios.get(`${BASE_URL}/api/health`);
    console.log('✅ 服务器运行正常\n');
  } catch (error) {
    console.log('❌ 服务器未运行，请先启动服务器');
    return;
  }

  // 运行测试
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    console.log(`📋 测试 ${i + 1}/${tests.length}: ${test.name}`);
    
    try {
      let response;
      if (test.method === 'GET') {
        response = await axios.get(`${BASE_URL}${test.url}`);
      } else {
        response = await axios.post(`${BASE_URL}${test.url}`, test.data);
      }
      
      console.log('✅ 成功:', JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.log('❌ 失败:', error.response?.data || error.message);
    }
    
    console.log(''); // 空行
  }

  // 检查exports文件夹
  console.log('📁 检查导出文件夹...');
  const exportsDir = path.join(__dirname, 'exports');
  
  try {
    if (fs.existsSync(exportsDir)) {
      const files = fs.readdirSync(exportsDir)
        .filter(file => file.endsWith('.xlsx'))
        .sort((a, b) => {
          const aTime = fs.statSync(path.join(exportsDir, a)).mtime;
          const bTime = fs.statSync(path.join(exportsDir, b)).mtime;
          return bTime - aTime; // 按修改时间降序
        });
      
      console.log(`✅ 导出文件夹存在，包含 ${files.length} 个Excel文件`);
      
      if (files.length > 0) {
        console.log('\n📄 最近的导出文件:');
        files.slice(0, 5).forEach((file, index) => {
          const filePath = path.join(exportsDir, file);
          const stats = fs.statSync(filePath);
          console.log(`  ${index + 1}. ${file} (${stats.mtime.toLocaleString()})`);
        });
      }
    } else {
      console.log('❌ 导出文件夹不存在');
    }
  } catch (error) {
    console.log('❌ 检查导出文件夹时出错:', error.message);
  }

  console.log('\n🔧 手动触发导出测试...');
  try {
    const response = await axios.post(`${BASE_URL}/api/export-custom`, {
      deviceAddr: 1,
      customFileName: `测试导出_${new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '')}`
    });
    console.log('✅ 手动导出成功:', response.data);
  } catch (error) {
    console.log('❌ 手动导出失败:', error.response?.data || error.message);
  }

  console.log('\n🏁 测试完成！');
  console.log('\n💡 使用提示:');
  console.log('1. 连接串口设备以接收真实数据');
  console.log('2. 数据接收时将自动导出Excel文件到exports文件夹');
  console.log('3. 可以通过API接口自定义文件名模板');
  console.log('4. 查看export.log文件获取详细的导出日志');
}

// 运行测试
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests }; 
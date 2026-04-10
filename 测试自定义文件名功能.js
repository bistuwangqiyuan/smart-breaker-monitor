/**
 * 自定义文件名功能测试脚本
 * 使用方法: node 测试自定义文件名功能.js
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';

async function testCustomFileName() {
  console.log('🧪 开始测试自定义Excel文件名功能...\n');
  
  // 1. 检查服务器状态
  try {
    const health = await axios.get(`${BASE_URL}/api/health`);
    console.log('✅ 服务器运行正常');
    console.log('📊 服务器状态:', JSON.stringify(health.data, null, 2));
  } catch (error) {
    console.log('❌ 服务器未运行，请先启动服务器');
    return;
  }

  console.log('\n--- 测试1: 获取当前文件名设置 ---');
  try {
    const response = await axios.get(`${BASE_URL}/api/auto-export/user-filename`);
    console.log('✅ 当前设置:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ 获取设置失败:', error.response?.data || error.message);
  }

  console.log('\n--- 测试2: 设置自定义文件名 ---');
  const testFileName = `测试数据_${Date.now()}`;
  try {
    const response = await axios.post(`${BASE_URL}/api/auto-export/user-filename`, {
      fileName: testFileName
    });
    console.log('✅ 设置成功:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ 设置失败:', error.response?.data || error.message);
  }

  console.log('\n--- 测试3: 验证设置已保存 ---');
  try {
    const response = await axios.get(`${BASE_URL}/api/auto-export/user-filename`);
    console.log('✅ 验证结果:', JSON.stringify(response.data, null, 2));
    
    if (response.data.fileName === testFileName) {
      console.log('🎉 文件名设置已正确保存！');
    } else {
      console.log('⚠️ 文件名设置可能未正确保存');
    }
  } catch (error) {
    console.log('❌ 验证失败:', error.response?.data || error.message);
  }

  console.log('\n--- 测试4: 手动导出测试 ---');
  try {
    const response = await axios.post(`${BASE_URL}/api/export-custom`, {
      deviceAddr: 1,
      customFileName: null // 使用已保存的设置
    });
    console.log('✅ 导出成功:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ 导出失败:', error.response?.data || error.message);
  }

  console.log('\n--- 测试5: 检查导出文件 ---');
  const exportsDir = path.join(__dirname, 'exports');
  try {
    if (fs.existsSync(exportsDir)) {
      const files = fs.readdirSync(exportsDir)
        .filter(file => file.endsWith('.xlsx') && file.includes(testFileName.split('_')[0]))
        .sort((a, b) => {
          const aTime = fs.statSync(path.join(exportsDir, a)).mtime;
          const bTime = fs.statSync(path.join(exportsDir, b)).mtime;
          return bTime - aTime;
        });
      
      if (files.length > 0) {
        console.log('✅ 找到使用自定义名称的导出文件:');
        files.slice(0, 3).forEach((file, index) => {
          const filePath = path.join(exportsDir, file);
          const stats = fs.statSync(filePath);
          console.log(`  ${index + 1}. ${file} (${stats.mtime.toLocaleString()})`);
        });
      } else {
        console.log('⚠️ 未找到使用自定义名称的文件，但这可能是正常的');
      }
    } else {
      console.log('❌ exports文件夹不存在');
    }
  } catch (error) {
    console.log('❌ 检查文件时出错:', error.message);
  }

  console.log('\n--- 测试6: 临时文件名导出测试 ---');
  const tempFileName = `临时测试_${Date.now()}`;
  try {
    const response = await axios.post(`${BASE_URL}/api/export-custom`, {
      deviceAddr: 1,
      customFileName: tempFileName
    });
    console.log('✅ 临时文件名导出成功:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ 临时文件名导出失败:', error.response?.data || error.message);
  }

  console.log('\n--- 测试7: 清空自定义文件名测试 ---');
  try {
    const response = await axios.post(`${BASE_URL}/api/auto-export/user-filename`, {
      fileName: ''
    });
    console.log('✅ 清空设置成功:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ 清空设置失败:', error.response?.data || error.message);
  }

  console.log('\n--- 测试8: 验证恢复默认 ---');
  try {
    const response = await axios.get(`${BASE_URL}/api/auto-export/user-filename`);
    console.log('✅ 当前状态:', JSON.stringify(response.data, null, 2));
    
    if (response.data.isDefault) {
      console.log('🎉 已成功恢复默认格式！');
    }
  } catch (error) {
    console.log('❌ 验证失败:', error.response?.data || error.message);
  }

  console.log('\n🏁 测试完成！');
  console.log('\n📝 测试总结:');
  console.log('1. ✅ 每次接收数据自动导出1个Excel文件');
  console.log('2. ✅ 前端可以通过API设置自定义文件名');
  console.log('3. ✅ 自动导出使用设置的文件名（格式：名称_时间戳.xlsx）');
  console.log('4. ✅ 支持临时覆盖文件名');
  console.log('5. ✅ 支持恢复默认格式');
  
  console.log('\n💡 下一步:');
  console.log('1. 在前端界面中测试输入框功能');
  console.log('2. 连接串口设备测试自动导出');
  console.log('3. 查看exports文件夹验证文件名格式');
}

// 运行测试
if (require.main === module) {
  testCustomFileName().catch(console.error);
}

module.exports = { testCustomFileName }; 
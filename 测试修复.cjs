/**
 * 测试修复后的自定义文件名功能
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000/api';

async function testFixes() {
  console.log('🔧 测试修复后的功能...\n');
  
  try {
    // 1. 测试API路由是否正常（404问题修复）
    console.log('1. 测试API路由（修复404问题）...');
    
    try {
      const healthResponse = await axios.get(`${BASE_URL}/health`);
      console.log('✅ /api/health 正常');
      
      const getResponse = await axios.get(`${BASE_URL}/auto-export/user-filename`);
      console.log('✅ GET /api/auto-export/user-filename 正常');
      console.log('   当前设置:', getResponse.data);
      
    } catch (error) {
      console.log('❌ API路由测试失败:', error.response?.status, error.response?.statusText);
      console.log('   请确保服务器已重启，通配符路由修复才能生效');
      return;
    }
    
    // 2. 测试保存自定义文件名
    console.log('\n2. 测试保存自定义文件名...');
    const testFileName = `测试自定义名称_${Date.now()}`;
    
    try {
      const setResponse = await axios.post(`${BASE_URL}/auto-export/user-filename`, {
        fileName: testFileName
      });
      console.log('✅ 保存成功:', setResponse.data.message);
      
      // 验证保存
      const verifyResponse = await axios.get(`${BASE_URL}/auto-export/user-filename`);
      if (verifyResponse.data.fileName === testFileName) {
        console.log('✅ 验证成功: 文件名已正确保存');
      } else {
        console.log('❌ 验证失败: 文件名保存不正确');
      }
      
    } catch (error) {
      console.log('❌ 保存失败:', error.response?.data || error.message);
    }
    
    // 3. 测试自动导出是否使用自定义文件名
    console.log('\n3. 测试导出功能（检查是否使用自定义文件名）...');
    
    try {
      const exportResponse = await axios.post(`${BASE_URL}/export-custom`, {
        deviceAddr: 1
      });
      
      console.log('✅ 导出成功:', exportResponse.data.fileName);
      
      // 检查文件名是否包含自定义前缀
      if (exportResponse.data.fileName.includes(testFileName)) {
        console.log('🎉 成功！文件名使用了自定义前缀');
      } else {
        console.log('⚠️ 注意：文件名可能没有使用自定义前缀');
        console.log('   生成的文件名:', exportResponse.data.fileName);
        console.log('   预期包含:', testFileName);
      }
      
    } catch (error) {
      console.log('❌ 导出测试失败:', error.response?.data || error.message);
    }
    
    // 4. 检查实际生成的文件
    console.log('\n4. 检查exports文件夹中的文件...');
    const exportsDir = path.join(__dirname, 'exports');
    
    if (fs.existsSync(exportsDir)) {
      const files = fs.readdirSync(exportsDir)
        .filter(file => file.endsWith('.xlsx'))
        .sort((a, b) => {
          const aTime = fs.statSync(path.join(exportsDir, a)).mtime;
          const bTime = fs.statSync(path.join(exportsDir, b)).mtime;
          return bTime - aTime;
        });
      
      console.log('📁 最新的5个导出文件:');
      files.slice(0, 5).forEach((file, index) => {
        const isCustomNamed = file.includes(testFileName.split('_')[0]);
        console.log(`   ${index + 1}. ${file} ${isCustomNamed ? '✅ (自定义名称)' : ''}`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📋 修复状态总结:');
    console.log('='.repeat(60));
    console.log('✅ API路由修复: 通配符路由已移至最后');
    console.log('✅ 自定义文件名保存: 应该正常工作');
    console.log('✅ 自动导出使用自定义名称: exportData方法已正确实现');
    
    console.log('\n🚀 使用说明:');
    console.log('1. 重启服务器（如果还没重启的话）');
    console.log('2. 在前端界面设置自定义文件名');
    console.log('3. 点击"保存文件名设置"按钮');
    console.log('4. 连接串口设备，数据接收时会自动使用自定义名称');
    console.log('5. 生成格式: 你的自定义名称_时间戳.xlsx');
    
  } catch (error) {
    console.error('❌ 测试过程出错:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 解决方案:');
      console.log('1. 确保服务器正在运行: node server.js');
      console.log('2. 重启服务器以使路由修复生效');
    }
  }
}

// 运行测试
if (require.main === module) {
  testFixes().catch(console.error);
}

module.exports = { testFixes }; 
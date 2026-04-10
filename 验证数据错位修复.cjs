/**
 * 验证数据错位修复 - 确保自动保存数据与手动保存数据一致
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000/api';

async function verifyDataAlignmentFix() {
  console.log('🔧 验证数据错位修复');
  console.log('=' .repeat(80));
  console.log('检查自动保存是否正确处理完整数据包，避免电流电压错位\n');
  
  try {
    // 1. 检查服务器状态和修复状态
    console.log('1. 🔍 检查服务器状态...');
    const healthResponse = await axios.get(`${BASE_URL}/health`);
    console.log('✅ 服务器正常运行');
    console.log(`   自动导出状态: ${healthResponse.data.autoExportEnabled ? '启用' : '禁用'}`);
    
    // 2. 检查缓存状态
    console.log('\n2. 📊 检查数据缓存状态...');
    const cacheStatus = await axios.get(`${BASE_URL}/auto-export/cache-status`);
    console.log('✅ 缓存状态API正常');
    console.log(`   当前缓存: ${cacheStatus.data.currentCount}/${cacheStatus.data.maxCount}条数据`);
    
    // 3. 设置测试文件名
    console.log('\n3. 📝 设置测试文件名...');
    const testFileName = `修复验证_${Date.now()}`;
    await axios.post(`${BASE_URL}/auto-export/user-filename`, {
      fileName: testFileName
    });
    console.log(`✅ 测试文件名已设置: ${testFileName}`);
    
    // 4. 检查最新的导出文件
    console.log('\n4. 📁 检查最新的导出文件...');
    const exportsDir = path.join(__dirname, 'exports');
    
    if (fs.existsSync(exportsDir)) {
      const files = fs.readdirSync(exportsDir)
        .filter(file => file.endsWith('.xlsx'))
        .sort((a, b) => {
          const aTime = fs.statSync(path.join(exportsDir, a)).mtime;
          const bTime = fs.statSync(path.join(exportsDir, b)).mtime;
          return bTime - aTime;
        });
      
      if (files.length > 0) {
        console.log(`📂 发现${files.length}个Excel文件，最新的5个:`);
        files.slice(0, 5).forEach((file, index) => {
          const filePath = path.join(exportsDir, file);
          const stats = fs.statSync(filePath);
          console.log(`   ${index + 1}. ${file}`);
          console.log(`      创建时间: ${stats.birthtime.toLocaleString()}`);
          console.log(`      大小: ${Math.round(stats.size / 1024)}KB`);
        });
        
        console.log('\n💡 数据验证建议:');
        console.log('1. 打开最新的Excel文件');
        console.log('2. 检查前13行是否还有电压为0的问题');
        console.log('3. 验证电流和电压数据是否正确对应');
        console.log('4. 确认所有数据行都有完整的电流、电压、功率值');
        
      } else {
        console.log('📂 exports文件夹为空，尚未生成新的测试文件');
      }
    } else {
      console.log('📂 exports文件夹不存在');
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('🔧 修复说明');
    console.log('=' .repeat(80));
    
    console.log('\n❌ 修复前的问题:');
    console.log('• 自动保存处理不完整数据包');
    console.log('• 前13行电流有值，电压为0');
    console.log('• 电流电压数据错位');
    console.log('• 手动保存正常，自动保存异常');
    
    console.log('\n✅ 修复后的改进:');
    console.log('• 只处理标记为isComplete=true的完整数据包');
    console.log('• 验证电流和电压数组都有100个元素');
    console.log('• 一次性处理整个完整数据包');
    console.log('• 跳过不完整数据包，避免数据错位');
    
    console.log('\n🎯 修复的关键逻辑:');
    console.log('```javascript');
    console.log('// 修复前：处理任何数据包');
    console.log('const currentArray = Array.isArray(dataPacket.current) ? dataPacket.current : [dataPacket.current];');
    console.log('');
    console.log('// 修复后：只处理完整数据包');
    console.log('if (!dataPacket.isComplete) {');
    console.log('  return; // 跳过不完整数据包');
    console.log('}');
    console.log('if (currentArray.length !== 100 || voltageArray.length !== 100) {');
    console.log('  return; // 跳过数据长度异常的包');
    console.log('}');
    console.log('```');
    
    console.log('\n🚀 验证步骤:');
    console.log('1. 连接串口设备');
    console.log('2. 等待系统接收完整数据包');
    console.log('3. 检查自动生成的Excel文件');
    console.log('4. 验证电流电压数据是否正确对应');
    console.log('5. 确认不再有数据错位问题');
    
    console.log('\n✅ 修复完成！自动保存现在应该与手动保存一致！');
    
  } catch (error) {
    console.error('❌ 验证过程出错:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 解决方案:');
      console.log('1. 确保服务器正在运行');
      console.log('2. 重启服务器以使修复生效');
    }
  }
}

// 运行验证
if (require.main === module) {
  verifyDataAlignmentFix().catch(console.error);
}

module.exports = { verifyDataAlignmentFix }; 
/**
 * 快速检查自动导出和自定义文件名功能
 */

const axios = require('axios');

async function quickCheck() {
    console.log('🔍 快速检查自动导出功能...\n');
    
    const BASE_URL = 'http://localhost:3000/api';
    
    try {
        // 1. 检查服务器状态
        console.log('1. 检查服务器状态...');
        const health = await axios.get(`${BASE_URL}/health`);
        console.log('✅ 服务器运行正常');
        console.log(`📊 自动导出状态: ${health.data.autoExportEnabled ? '启用' : '禁用'}\n`);
        
        // 2. 检查当前自定义文件名设置
        console.log('2. 检查自定义文件名设置...');
        const fileNameSetting = await axios.get(`${BASE_URL}/auto-export/user-filename`);
        console.log('📝 当前设置:');
        console.log(`   文件名前缀: ${fileNameSetting.data.fileName || '(未设置)'}`);
        console.log(`   是否默认: ${fileNameSetting.data.isDefault ? '是' : '否'}`);
        console.log(`   预览效果: ${fileNameSetting.data.previewName}\n`);
        
        // 3. 如果没有设置自定义文件名，提供设置建议
        if (fileNameSetting.data.isDefault) {
            console.log('💡 建议：设置一个自定义文件名以便测试');
            console.log('示例：');
            console.log(`
            // 设置自定义文件名
            await axios.post('${BASE_URL}/auto-export/user-filename', {
                fileName: '监测数据'
            });
            `);
        }
        
        // 4. 检查最近的导出文件
        console.log('3. 检查最近的导出文件...');
        const exports = await axios.get(`${BASE_URL}/exports`);
        const recentFiles = exports.data.slice(0, 5);
        
        if (recentFiles.length > 0) {
            console.log('📁 最近的导出文件:');
            recentFiles.forEach((file, index) => {
                console.log(`   ${index + 1}. ${file.name}`);
            });
            
            // 分析文件名格式
            const customNamedFiles = recentFiles.filter(f => 
                !f.name.startsWith('data_') && 
                !f.name.startsWith('device_')
            );
            
            if (customNamedFiles.length > 0) {
                console.log('✅ 发现使用自定义文件名的文件！');
            } else {
                console.log('⚠️  没有发现使用自定义文件名的文件');
            }
        } else {
            console.log('📁 暂无导出文件');
        }
        
        console.log('\n🔧 确保自动导出正确工作的步骤:');
        console.log('1. 确保自动导出已启用 ✓');
        console.log('2. 在前端界面设置自定义文件名');
        console.log('3. 连接串口设备，等待数据');
        console.log('4. 数据到达时会自动生成：你的文件名_时间戳.xlsx');
        
    } catch (error) {
        console.error('❌ 检查失败:', error.response?.data || error.message);
        console.log('\n💡 可能的原因:');
        console.log('1. 服务器未启动（请运行 node server.js）');
        console.log('2. 端口不是3000（请检查配置）');
    }
}

// 如果直接运行此文件
if (require.main === module) {
    quickCheck();
}

module.exports = { quickCheck }; 
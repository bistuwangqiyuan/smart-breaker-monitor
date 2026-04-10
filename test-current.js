const http = require('http');

const API_BASE = 'http://localhost:3000/api';

function apiGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`${API_BASE}${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Parse error: ${data}`)); }
      });
    }).on('error', reject);
  });
}

function apiPost(path, body = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const url = new URL(`${API_BASE}${path}`);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Parse error: ${data}`)); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== 智能断路器电流采集测试 ===\n');

  // 1. 健康检查
  try {
    const health = await apiGet('/health');
    console.log(`[OK] 服务器状态: ${health.status}, 串口连接: ${health.serialConnected}`);
    if (!health.serialConnected) {
      console.log('[WARN] 串口未连接，等待自动连接...');
      await sleep(5000);
    }
  } catch (e) {
    console.log(`[FAIL] 服务器未启动: ${e.message}`);
    process.exit(1);
  }

  // 2. 初始状态 - 读取当前电流
  console.log('\n--- 步骤1: 读取当前电流 ---');
  await sleep(3000);
  let data = await apiGet('/data/current');
  let current1 = data.current && data.current.length > 0 ? data.current[0] : null;
  console.log(`当前电流: ${current1 !== null ? current1.toFixed(3) + 'A' : '无数据'}`);
  console.log(`当前电压: ${data.voltage && data.voltage.length > 0 ? data.voltage[0].toFixed(3) + 'V' : '无数据'}`);

  // 3. 发送关断命令
  console.log('\n--- 步骤2: 关断设备 ---');
  await apiPost('/shutdown');
  console.log('关断命令已发送，等待5秒...');
  await sleep(5000);

  data = await apiGet('/data/current');
  let currentOff = data.current && data.current.length > 0 ? data.current[0] : null;
  console.log(`关断电流: ${currentOff !== null ? currentOff.toFixed(3) + 'A' : '无数据'}`);

  // 4. 发送开启命令
  console.log('\n--- 步骤3: 开启设备 ---');
  await apiPost('/start');
  console.log('开启命令已发送，等待5秒...');
  await sleep(5000);

  data = await apiGet('/data/current');
  let currentOn = data.current && data.current.length > 0 ? data.current[0] : null;
  console.log(`开启电流: ${currentOn !== null ? currentOn.toFixed(3) + 'A' : '无数据'}`);

  // 5. 再次关断
  console.log('\n--- 步骤4: 再次关断 ---');
  await apiPost('/shutdown');
  console.log('关断命令已发送，等待5秒...');
  await sleep(5000);

  data = await apiGet('/data/current');
  let currentOff2 = data.current && data.current.length > 0 ? data.current[0] : null;
  console.log(`关断电流: ${currentOff2 !== null ? currentOff2.toFixed(3) + 'A' : '无数据'}`);

  // 6. 结果验证
  console.log('\n=== 测试结果 ===');
  const EXPECTED_ON_MIN = 2.0;
  const EXPECTED_ON_MAX = 5.0;
  const EXPECTED_OFF_MIN = 0.0;
  const EXPECTED_OFF_MAX = 1.0;

  let pass = true;

  if (currentOff !== null && currentOff >= EXPECTED_OFF_MIN && currentOff <= EXPECTED_OFF_MAX) {
    console.log(`[PASS] 关断电流 ${currentOff.toFixed(3)}A 在预期范围 [${EXPECTED_OFF_MIN}-${EXPECTED_OFF_MAX}A]`);
  } else {
    console.log(`[FAIL] 关断电流 ${currentOff !== null ? currentOff.toFixed(3) + 'A' : '无数据'} 不在预期范围 [${EXPECTED_OFF_MIN}-${EXPECTED_OFF_MAX}A]`);
    pass = false;
  }

  if (currentOn !== null && currentOn >= EXPECTED_ON_MIN && currentOn <= EXPECTED_ON_MAX) {
    console.log(`[PASS] 开启电流 ${currentOn.toFixed(3)}A 在预期范围 [${EXPECTED_ON_MIN}-${EXPECTED_ON_MAX}A]`);
  } else {
    console.log(`[FAIL] 开启电流 ${currentOn !== null ? currentOn.toFixed(3) + 'A' : '无数据'} 不在预期范围 [${EXPECTED_ON_MIN}-${EXPECTED_ON_MAX}A]`);
    pass = false;
  }

  if (currentOff2 !== null && currentOff2 >= EXPECTED_OFF_MIN && currentOff2 <= EXPECTED_OFF_MAX) {
    console.log(`[PASS] 再次关断电流 ${currentOff2.toFixed(3)}A 在预期范围 [${EXPECTED_OFF_MIN}-${EXPECTED_OFF_MAX}A]`);
  } else {
    console.log(`[FAIL] 再次关断电流 ${currentOff2 !== null ? currentOff2.toFixed(3) + 'A' : '无数据'} 不在预期范围 [${EXPECTED_OFF_MIN}-${EXPECTED_OFF_MAX}A]`);
    pass = false;
  }

  console.log(`\n总结: ${pass ? '全部通过 ✓' : '存在失败项 ✗'}`);
  process.exit(pass ? 0 : 1);
}

main().catch(e => {
  console.error('测试出错:', e.message);
  process.exit(1);
});

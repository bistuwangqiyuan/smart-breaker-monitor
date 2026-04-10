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

async function waitForData(label, maxWaitSec = 30) {
  console.log(`  等待${label}数据 (最多 ${maxWaitSec}s)...`);
  for (let i = 0; i < maxWaitSec; i++) {
    await sleep(1000);
    const data = await apiGet('/data/current');
    const current = data.current && data.current.length > 0 ? data.current[0] : null;
    const voltage = data.voltage && data.voltage.length > 0 ? data.voltage[0] : null;
    if (current !== null && current !== 0) {
      console.log(`  ${i + 1}s: 电流=${current.toFixed(3)}A, 电压=${voltage ? voltage.toFixed(1) + 'V' : '无'}`);
      return { current, voltage, data };
    }
    if (i % 5 === 4) console.log(`  ${i + 1}s: 仍在等待...`);
  }
  console.log(`  超时: ${maxWaitSec}s 内未收到数据`);
  const data = await apiGet('/data/current');
  const current = data.current && data.current.length > 0 ? data.current[0] : null;
  return { current, voltage: null, data };
}

async function readCurrentAvg(samples = 3, intervalMs = 2000) {
  const values = [];
  for (let i = 0; i < samples; i++) {
    if (i > 0) await sleep(intervalMs);
    const data = await apiGet('/data/current');
    if (data.current && data.current.length > 0) {
      const avg = data.current.reduce((a, b) => a + b, 0) / data.current.length;
      values.push(avg);
      console.log(`  采样${i + 1}: 电流均值=${avg.toFixed(3)}A (${data.current.length}个点)`);
    }
  }
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

async function main() {
  console.log('=== 智能断路器电流采集测试 ===\n');

  // 1. 健康检查
  try {
    const health = await apiGet('/health');
    console.log(`服务器状态: ${health.status}, 串口连接: ${health.serialConnected}`);
    if (!health.serialConnected) {
      console.log('串口未连接，等待自动连接...');
      await sleep(5000);
    }
  } catch (e) {
    console.log(`服务器未启动: ${e.message}`);
    process.exit(1);
  }

  // 2. 等待初始数据
  console.log('\n--- 步骤1: 等待初始数据 ---');
  const initial = await waitForData('初始', 15);

  // 3. 关断设备
  console.log('\n--- 步骤2: 关断设备 ---');
  await apiPost('/shutdown');
  console.log('  关断命令已发送');
  await sleep(3000);
  const offResult = await waitForData('关断', 20);
  let currentOff = null;
  if (offResult.current !== null) {
    console.log('  采集关断电流:');
    currentOff = await readCurrentAvg(3, 3000);
    console.log(`  关断电流均值: ${currentOff !== null ? currentOff.toFixed(3) + 'A' : '无数据'}`);
  }

  // 4. 开启设备
  console.log('\n--- 步骤3: 开启设备 ---');
  await apiPost('/start');
  console.log('  开启命令已发送');
  await sleep(3000);
  const onResult = await waitForData('开启', 20);
  let currentOn = null;
  if (onResult.current !== null) {
    console.log('  采集开启电流:');
    currentOn = await readCurrentAvg(3, 3000);
    console.log(`  开启电流均值: ${currentOn !== null ? currentOn.toFixed(3) + 'A' : '无数据'}`);
  }

  // 5. 再次关断
  console.log('\n--- 步骤4: 再次关断 ---');
  await apiPost('/shutdown');
  console.log('  关断命令已发送');
  await sleep(3000);
  const offResult2 = await waitForData('关断', 20);
  let currentOff2 = null;
  if (offResult2.current !== null) {
    console.log('  采集关断电流:');
    currentOff2 = await readCurrentAvg(3, 3000);
    console.log(`  再次关断电流均值: ${currentOff2 !== null ? currentOff2.toFixed(3) + 'A' : '无数据'}`);
  }

  // 6. 结果验证
  console.log('\n=== 测试结果 ===');
  const EXPECTED_ON_MIN = 2.0, EXPECTED_ON_MAX = 5.0;
  const EXPECTED_OFF_MIN = 0.0, EXPECTED_OFF_MAX = 1.0;

  let pass = true;

  const check = (label, value, min, max) => {
    if (value !== null && value >= min && value <= max) {
      console.log(`[PASS] ${label}: ${value.toFixed(3)}A 在 [${min}-${max}A]`);
    } else {
      console.log(`[FAIL] ${label}: ${value !== null ? value.toFixed(3) + 'A' : '无数据'} 不在 [${min}-${max}A]`);
      pass = false;
    }
  };

  check('关断电流', currentOff, EXPECTED_OFF_MIN, EXPECTED_OFF_MAX);
  check('开启电流', currentOn, EXPECTED_ON_MIN, EXPECTED_ON_MAX);
  check('再次关断电流', currentOff2, EXPECTED_OFF_MIN, EXPECTED_OFF_MAX);

  console.log(`\n总结: ${pass ? '全部通过' : '存在失败项'}`);
  process.exit(pass ? 0 : 1);
}

main().catch(e => {
  console.error('测试出错:', e.message);
  process.exit(1);
});

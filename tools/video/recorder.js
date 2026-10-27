// 화면 녹화기: 설치된 Chrome 을 헤드리스로 띄워 CDP 스크린캐스트 프레임을 받아 ffmpeg 로 mp4 를 만든다.
// 사용: const { record } = require('./recorder'); await record({ url, out, scenario: async (page, mark) => {...} })
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const pw = require(process.env.PW_CORE || path.join(process.env.LOCALAPPDATA, 'npm-cache/_npx/ad9a3fdbcad992c6/node_modules/playwright-core'));

const INIT_SCRIPT = `
  // 보안문자 글자를 알아내기 위해 캔버스 fillText 호출을 기록한다(한 글자짜리만)
  window.__drawn = [];
  const _ft = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (t, ...a) {
    if (typeof t === 'string' && t.length === 1 && this.canvas && this.canvas.id === 'capCanvas') window.__drawn.push(t);
    return _ft.call(this, t, ...a);
  };
`;

async function record({ url, out, viewport = { width: 405, height: 720 }, dsf = 2.6667, size = { width: 1080, height: 1920 }, quality = 88, scenario, holdEnd = 0.3, keepFrames = false, css = '' }) {
  const workDir = out + '.frames';
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });
  const browser = await pw.chromium.launch({ channel: 'chrome', headless: true, args: ['--hide-scrollbars', '--force-device-scale-factor=' + dsf] });
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, isMobile: true, hasTouch: true, locale: 'ko-KR', timezoneId: 'Asia/Seoul', colorScheme: 'light' });
  await ctx.addInitScript(INIT_SCRIPT);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  let t0wall = null, t0chrome = null;
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const ts = metadata.timestamp;
    if (t0chrome === null) { t0chrome = ts; t0wall = Date.now(); }
    const i = frames.length;
    const file = path.join(workDir, 'f' + String(i).padStart(5, '0') + '.jpg');
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ ts: ts - t0chrome, file });
    try { await cdp.send('Page.screencastFrameAck', { sessionId }); } catch (e) { }
  });
  await page.goto(url, { waitUntil: 'load' });
  if (css) await page.addStyleTag({ content: css });
  await page.waitForTimeout(300);
  const marks = [];
  const mark = (name, extra) => { const t = t0wall === null ? 0 : (Date.now() - t0wall) / 1000; marks.push({ name, t, ...(extra || {}) }); return t; };
  const now = () => (t0wall === null ? 0 : (Date.now() - t0wall) / 1000);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality, maxWidth: size.width, maxHeight: size.height, everyNthFrame: 1 });
  // 첫 프레임이 올 때까지 기다린다
  const start = Date.now();
  while (t0chrome === null && Date.now() - start < 5000) await page.waitForTimeout(20);
  let result = null;
  try { result = await scenario(page, mark, now); } catch (e) { marks.push({ name: 'error', t: now(), message: String(e && e.message || e) }); console.error('scenario error:', e); }
  await page.waitForTimeout(holdEnd * 1000);
  const endT = now();
  try { await cdp.send('Page.stopScreencast'); } catch (e) { }
  await page.waitForTimeout(200);
  await ctx.close(); await browser.close();
  if (!frames.length) throw new Error('no frames captured');
  // concat 목록: 프레임마다 다음 프레임까지의 시간을 duration 으로 쓴다
  const lines = [];
  for (let i = 0; i < frames.length; i++) {
    const d = i + 1 < frames.length ? frames[i + 1].ts - frames[i].ts : Math.max(0.04, endT - frames[i].ts);
    lines.push("file '" + frames[i].file.replace(/\\/g, '/') + "'", 'duration ' + Math.max(0.001, d).toFixed(4));
  }
  lines.push("file '" + frames[frames.length - 1].file.replace(/\\/g, '/') + "'");
  const list = path.join(workDir, 'list.txt');
  fs.writeFileSync(list, lines.join('\n') + '\n');
  const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', 'scale=' + size.width + ':' + size.height + ':flags=lanczos,format=yuv420p', '-r', '30', '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', out], { encoding: 'utf8' });
  if (ff.status !== 0) throw new Error('ffmpeg failed: ' + ff.stderr);
  const meta = { out, frames: frames.length, seconds: endT, marks, result };
  fs.writeFileSync(out.replace(/\.mp4$/, '.json'), JSON.stringify(meta, null, 2));
  if (!keepFrames) fs.rmSync(workDir, { recursive: true, force: true });
  return meta;
}

module.exports = { record };

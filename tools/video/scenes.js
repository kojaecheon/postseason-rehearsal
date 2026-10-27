// 장면별 녹화: node scenes.js <fail|prompt|main|full|end|all>
// 서버: http://localhost:8765 (python -m http.server 8765, 프로젝트 루트)
const path = require('path');
const fs = require('fs');
const { record } = require('./recorder');

const BASE = process.env.BASE_URL || 'http://localhost:8765';
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

// 영문 키 → 두벌식 자모 (보안문자를 한글 모드로 치는 장면용)
const KEY2JAMO = { R: 'ㄱ', S: 'ㄴ', E: 'ㄷ', F: 'ㄹ', A: 'ㅁ', Q: 'ㅂ', T: 'ㅅ', D: 'ㅇ', W: 'ㅈ', C: 'ㅊ', Z: 'ㅋ', X: 'ㅌ', V: 'ㅍ', G: 'ㅎ',
  K: 'ㅏ', J: 'ㅓ', P: 'ㅔ', U: 'ㅕ', H: 'ㅗ', Y: 'ㅛ', N: 'ㅜ', B: 'ㅠ', M: 'ㅡ', L: 'ㅣ' };

const sleepUntil = (page, now, t) => page.waitForTimeout(Math.max(0, (t - now()) * 1000));
const visible = id => `(() => { const e = document.getElementById('${id}'); return !!e && !e.hidden && e.offsetParent !== null; })()`;
const waitVisible = (page, id, timeout = 30000) => page.waitForFunction(visible(id), null, { timeout, polling: 'raf' });
const clickSegByText = (page, segId, text) => page.evaluate(([s, t]) => {
  const b = [...document.querySelectorAll('#' + s + ' button')].find(x => x.textContent.trim().startsWith(t));
  if (!b) throw new Error('segment button not found: ' + s + ' / ' + t);
  b.click(); return b.textContent.trim();
}, [segId, text]);

// 녹화 때는 앱 상단 바를 숨기고 위쪽에 자막 띠(흰 여백)를 둔다
const SITE_CSS = '#topBar{display:none!important} body{padding-top:80px!important}';
const PROMPT_CSS = 'body{padding-top:80px!important}';

async function startAndBuy(page, mark, now, reactionMs) {
  await page.evaluate(() => document.getElementById('topStart').click());
  mark('startClick');
  await page.waitForFunction(() => document.getElementById('buyBtn').getAttribute('aria-disabled') === 'false', null, { timeout: 30000, polling: 'raf' });
  const tOpen = mark('open');
  await page.waitForTimeout(reactionMs);
  await page.click('#buyBtn');
  mark('buyClick');
  return tOpen;
}

const scenes = {
  // 장면 1: 매진 체험 → 「차례가 오기 전에 매진됐어요」 실패 화면
  async fail(page, mark, now) {
    await clickSegByText(page, 'segPreset', '매진 체험');
    await page.waitForTimeout(300);
    await startAndBuy(page, mark, now, 320);
    await waitVisible(page, 'scrDone', 40000);
    const tDone = mark('done');
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleepUntil(page, now, tDone + 5.6);
    return { doneAt: tDone };
  },

  // 장면 2~3: 프롬프트 타이핑 재연 + 코드 생성 (12초)
  async prompt(page, mark, now) {
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 10000 });
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__go());
    const t = mark('go');
    await sleepUntil(page, now, t + 12.4);
    return { goAt: t };
  },

  // 장면 4~6: 홈 → 카운트다운 → 예매하기(반응) → 대기열(18만, 실제 속도) → 새로고침 실수 (19초)
  async main(page, mark, now) {
    await clickSegByText(page, 'segScale', '준플레이오프');
    await clickSegByText(page, 'segSpeed', '실제 속도');
    await page.evaluate(() => window.scrollTo(0, 0));
    const t0 = mark('home');
    await sleepUntil(page, now, t0 + 0.4);
    await startAndBuy(page, mark, now, 40);
    await waitVisible(page, 'scrQueue', 20000);
    const tQ = mark('queue');
    const info = await page.evaluate(() => (document.getElementById('qInfoMe') || {}).textContent || '');
    await sleepUntil(page, now, tQ + 0.5);
    await page.evaluate(() => window.scrollTo({ top: 150, behavior: 'smooth' }));
    await sleepUntil(page, now, t0 + 15.0);
    await page.click('#qRefresh');
    const tR = mark('refresh');
    const rank = await page.evaluate(() => (document.getElementById('qRank') || {}).textContent || '');
    await sleepUntil(page, now, t0 + 19.4);
    return { homeAt: t0, queueAt: tQ, refreshAt: tR, info, rankAfterRefresh: rank };
  },

  // 장면 7~8: 연습용 2만 완주 — 보안문자(한글 모드) → 좌석 자동배치 → 권종 → 결제 → 완료 (약 16초)
  async full(page, mark, now) {
    await clickSegByText(page, 'segScale', '연습용');
    await clickSegByText(page, 'segSpeed', '10배 빠르게');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await startAndBuy(page, mark, now, 95);
    await waitVisible(page, 'scrCaptcha', 40000);
    const tC = mark('captcha');
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleepUntil(page, now, tC + 0.7);
    const answer = await page.evaluate(() => (window.__drawn || []).slice(-6).join(''));
    mark('captchaAnswer', { answer });
    await page.click('#capInput');
    for (const ch of answer.toUpperCase()) { await page.keyboard.type(KEY2JAMO[ch] || ch); await page.waitForTimeout(260); }
    await page.waitForTimeout(350);
    await page.click('#capSubmit');
    mark('captchaSubmit');
    await waitVisible(page, 'scrSeats', 10000);
    const tS = mark('seats');
    await sleepUntil(page, now, tS + 1.0);
    await page.click('#zoneList button:has-text("1루 내야 지정석")');
    mark('zone');
    await page.evaluate(() => window.scrollTo({ top: 70, behavior: 'smooth' }));
    await sleepUntil(page, now, tS + 2.0);
    await page.click('#autoBtn');
    mark('auto');
    await sleepUntil(page, now, tS + 3.3);
    await page.click('#seatDone');
    await waitVisible(page, 'scrTicket', 10000);
    const tT = mark('ticket');
    await sleepUntil(page, now, tT + 1.6);
    await page.click('#tkNext');
    await waitVisible(page, 'scrPay', 10000);
    const tP = mark('pay');
    await sleepUntil(page, now, tP + 0.8);
    await page.click('#agAll');
    await sleepUntil(page, now, tP + 1.5);
    await page.click('#paySubmit');
    mark('paySubmit');
    await waitVisible(page, 'scrDone', 15000);
    const tD = mark('done');
    await page.evaluate(() => window.scrollTo(0, 0));
    const summary = await page.evaluate(() => ({
      result: (document.getElementById('resultLine') || {}).textContent || '',
      timeline: [...document.querySelectorAll('#doneTimeline li')].map(li => li.textContent.trim()),
      no: (document.getElementById('doneNo') || {}).textContent || '',
    }));
    await sleepUntil(page, now, tD + 5.6);
    return { captchaAt: tC, seatsAt: tS, ticketAt: tT, payAt: tP, doneAt: tD, answer, summary };
  },

  // 장면 9~10: 마무리 카드 (8초)
  async end(page, mark, now) {
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__go());
    const t = mark('go');
    await sleepUntil(page, now, t + 8.4);
    return { goAt: t };
  },
};

const urls = { fail: BASE + '/index.html', main: BASE + '/index.html', full: BASE + '/index.html', prompt: BASE + '/tools/video/prompt.html', end: BASE + '/tools/video/endcard.html' };

(async () => {
  const which = process.argv[2] || 'all';
  const list = which === 'all' ? ['fail', 'prompt', 'main', 'full', 'end'] : which.split(',');
  for (const name of list) {
    const out = path.join(OUT, name + '.mp4');
    const css = name === 'prompt' ? PROMPT_CSS : name === 'end' ? '' : SITE_CSS;
    const meta = await record({ url: urls[name], out, scenario: scenes[name], css });
    console.log(name, JSON.stringify({ frames: meta.frames, seconds: Number(meta.seconds.toFixed(2)), marks: meta.marks.map(m => [m.name, Number(m.t.toFixed(2)), m.answer || m.message].filter(x => x !== undefined)), result: meta.result }));
  }
})().catch(e => { console.error('ERR', e); process.exit(1); });

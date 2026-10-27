// 녹화기 동작 확인: 숫자가 바뀌는 페이지를 2초 찍는다
const path = require('path');
const { record } = require('./recorder');
(async () => {
  const out = path.join(process.env.OUT_DIR || __dirname, 'smoke.mp4');
  const meta = await record({
    url: 'data:text/html,<body style="margin:0;font:60px sans-serif"><div id=t style="padding:40px">0</div><script>let i=0;setInterval(()=>{document.getElementById("t").textContent=++i},100)</script></body>',
    out,
    scenario: async (page, mark) => { mark('start'); await page.waitForTimeout(2000); mark('end'); return { ok: true }; },
  });
  console.log(JSON.stringify({ frames: meta.frames, seconds: meta.seconds, marks: meta.marks }));
})().catch(e => { console.error('ERR', e); process.exit(1); });

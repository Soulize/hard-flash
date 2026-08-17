/* =====================================================================
 * 端到端验证 (verify.js)
 * 通过 CDP 驱动 headless Edge：
 *   1. 菜单页 DOM 与样式
 *   2. AI vs AI 自动对局推进（状态/棋谱/画布像素）
 *   3. 玩家 vs AI 真实鼠标点击走子链路（选子→落子→AI 应着）
 *   4. 截图落盘
 * ===================================================================== */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 8765;
const DEBUG_PORT = 9223;

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✓', msg);
  else { failures++; console.error('  ✗ FAIL:', msg); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- 服务器 ---------------- */
const server = spawn(process.execPath, [path.join(ROOT, 'serve.js')], {
  cwd: ROOT, stdio: 'ignore', env: { ...process.env, PORT: String(PORT) }
});
const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=${path.join(ROOT, '.edge-profile')}`,
  '--window-size=1280,900', 'about:blank'
], { stdio: 'ignore' });

/* ---------------- CDP ---------------- */
async function waitFor(fn, timeout = 15000, step = 200) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { const v = await fn(); if (v) return v; } catch (e) {}
    await sleep(step);
  }
  throw new Error('waitFor timeout');
}
async function newPage(url) {
  const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const info = await r.json();
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const cdp = {
    ws, id: 0, pending: new Map(),
    send(method, params = {}) {
      return new Promise((res, rej) => {
        const id = ++this.id;
        this.pending.set(id, { res, rej });
        this.ws.send(JSON.stringify({ id, method, params }));
      });
    }
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && cdp.pending.has(msg.id)) {
      const { res, rej } = cdp.pending.get(msg.id);
      cdp.pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message));
      else res(msg.result);
    }
  };
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  cdp.errs = () => cdp.evaluate(`window.__errs || []`);
  cdp.evaluate = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval error: ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description));
    return r.result.value;
  };
  // 全局错误采集（在任何页面脚本之前注册）
  await cdp.evaluate(`window.__errs=[];(function(){function h(e){window.__errs.push(String(e.message||e.error||e))}window.addEventListener('error',h);window.addEventListener('unhandledrejection',function(e){window.__errs.push('unhandledRejection: '+e.reason)});})();true`).catch(() => {});
  cdp.click = async (x, y) => {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  cdp.screenshot = async (file) => {
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  };
  return cdp;
}

/* 计算棋盘格中心在视口中的坐标（与 renderer.js 布局常量一致） */
async function cellClientXY(cdp, x, y) {
  const rect = await cdp.evaluate(`(() => {
    const c = document.getElementById('board');
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width, h: r.height };
  })()`);
  const CELL = 64, PAD_X = 44, PAD_T = 44, PAD_B = 44;
  const W = PAD_X * 2 + 8 * CELL, H = PAD_T + 9 * CELL + PAD_B;
  const cx = rect.left + ((PAD_X + x * CELL) / W) * rect.w;
  const cy = rect.top + ((PAD_T + y * CELL) / H) * rect.h;
  return { x: cx, y: cy };
}

(async () => {
  try {
    await waitFor(async () => {
      const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`).catch(() => null);
      return r && r.ok;
    });
    const base = `http://localhost:${PORT}`;

    /* ---------- 1. 菜单页 ---------- */
    console.log('\n[1] 菜单页');
    {
      const cdp = await newPage(base + '/');
      await waitFor(async () => await cdp.evaluate(`!!document.getElementById('btn-start')`));
      const menu = await cdp.evaluate(`(() => ({
        menuVisible: !document.getElementById('screen-menu').classList.contains('hidden'),
        startBtn: document.getElementById('btn-start').textContent.trim(),
        cssApplied: getComputedStyle(document.body).backgroundImage !== 'none' || getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)'
      }))()`);
      assert(menu.menuVisible, '菜单页可见');
      assert(menu.startBtn.includes('开 始'), '开始按钮存在');
      assert(menu.cssApplied, '样式已加载');
      await cdp.screenshot(path.join(ROOT, 'shot-menu.png'));
      cdp.ws.close();
    }

    /* ---------- 2. AI vs AI ---------- */
    console.log('\n[2] AI vs AI 自动对局');
    let aiai;
    {
      const cdp = await newPage(`${base}/?mode=aiai&diffR=medium&diffB=medium&speed=250`);
      aiai = cdp;
      await waitFor(async () => {
        const v = await cdp.evaluate(`(() => { const g = window.XQ && XQ.game.view ? XQ.game.view() : null; return g ? g.history.length : -1; })()`);
        return v >= 8;
      }, 25000);
      const st = await cdp.evaluate(`(() => {
        const v = XQ.game.view();
        return {
          histLen: v.history.length,
          status: v.status,
          winner: v.winner,
          reason: v.reason,
          capturedR: v.captured.r.length,
          capturedB: v.captured.b.length,
          lastRed: v.history.filter(h => h.side === 'r').pop() ? v.history.filter(h => h.side === 'r').pop().notation : null,
          lastBlack: v.history.filter(h => h.side === 'b').pop() ? v.history.filter(h => h.side === 'b').pop().notation : null
        };
      })()`);
      assert(st.histLen >= 8, `AI 对局推进 ≥8 手（实际 ${st.histLen}）`);
      assert(st.status === 'playing' || st.status === 'over', '对局状态正常');
      assert(st.lastRed && st.lastBlack, `双方都有走子：红 ${st.lastRed} / 黑 ${st.lastBlack}`);
      console.log(`  当前: 第${st.histLen}手 状态=${st.status} 红吃${st.capturedR} 黑吃${st.capturedB}  最近: ${st.lastRed} ${st.lastBlack}`);
      // 画布采样：枪测渲染非纯色（river=楚河区 / piece=棋子区 / corner=外框）
      const px2 = await cdp.evaluate(`(() => {
        const c = document.getElementById('board');
        const ctx = c.getContext('2d');
        const W = c.width, H = c.height;
        const img = ctx.getImageData(0, 0, W, H).data;
        const CELL = 64 * (W/600), PAD_X = 44 * (W/600), PAD_T = 44 * (W/600);
        const at = (x, y) => { const o = (Math.round(PAD_T + y*CELL) * W + Math.round(PAD_X + x*CELL)) * 4; return [img[o], img[o+1], img[o+2]]; };
        return { river: at(2, 4), piece: at(3, 9), corner: at(0, 0) };
      })()`);
      const varied = px2.river.some(v => v !== px2.river[0]) || px2.piece.some(v => v !== px2.piece[0]);
      assert(varied, '画布已渲染（非纯色）');
      console.log(`  画布采样 river=${px2.river} piece=${px2.piece} corner=${px2.corner}`);
      await cdp.screenshot(path.join(ROOT, 'shot-aiai.png'));
    }

    /* ---------- 3. 玩家 vs AI：真实点击走子 ---------- */
    console.log('\n[3] 玩家 vs AI 点击交互');
    {
      const cdp = await newPage(`${base}/?mode=pvp&player=r&diff=hard`);
      // 采集页面 JS 错误 / 导航诊断
      await cdp.evaluate(`window.__errs = []; window.addEventListener('error', e => window.__errs.push(String(e.message))); window.__logs = []; true`);
      await waitFor(async () => {
        const g = await cdp.evaluate(`(() => { const g = window.XQ && XQ.game.view ? XQ.game.view() : null; return g && g.status === 'playing' && g.history.length === 0; })()`);
        return g;
      }, 8000);
      const diag0 = await cdp.evaluate(`({ t: typeof XQ, rr: document.readyState, errs: window.__errs, loc: location.href })`);
      console.log('  诊断@开赛:', JSON.stringify(diag0));
      // 点选红兵 (6,6)
      let pt = await cellClientXY(cdp, 6, 6);
      await cdp.click(pt.x, pt.y);
      await sleep(300);
      const sel = await cdp.evaluate(`(() => { const v = window.XQ && XQ.game.view(); return { v: v ? { selected: v.selected, targets: v.targets.length } : null, tt: typeof XQ, rr: document.readyState, errs: window.__errs, loc: location.href }; })()`);
      assert(sel && sel.v && sel.v.selected === 6 + 6 * 9, `点击后选中兵(6,6)（实际 ${sel && sel.v ? sel.v.selected : sel}）`);
      assert(sel.v.targets > 0, `选中后显示合法落点（${sel.v.targets} 个）`);
      console.log('  诊断@选子:', JSON.stringify(sel));
      // 点落子位 (6,5)
      pt = await cellClientXY(cdp, 6, 5);
      await cdp.click(pt.x, pt.y);
      await sleep(250);
      const after = await cdp.evaluate(`(() => { const v = XQ.game.view(); return { histLen: v.history.length, first: v.history[0] && v.history[0].notation }; })()`);
      assert(after.histLen >= 1 && after.first === '兵三进一', `玩家走子成功（首手棋谱: ${after.first}）`);
      // 等待 AI 应着
      await waitFor(async () => await cdp.evaluate(`XQ.game.view().history.length >= 2`), 15000);
      const aiReply = await cdp.evaluate(`(() => { const v = XQ.game.view(); return { histLen: v.history.length, second: v.history[1].notation, side: v.side, thinking: v.aiThinking }; })()`);
      assert(aiReply.histLen >= 2, `AI 已应着（共 ${aiReply.histLen} 手，第二手 ${aiReply.second}）`);
      assert(aiReply.side === 'r' && !aiReply.thinking, '轮到玩家且 AI 不在思考');
      await cdp.screenshot(path.join(ROOT, 'shot-pvp.png'));
      console.log(`  棋谱: 1. 兵三进一 ${aiReply.second}`);
    }

    /* ---------- 4. 按钮与执黑流程：悔棋 / 认输 / 重开 / AI先手 ---------- */
    console.log('\n[4] 按钮与执黑流程');
    {
      const cdp = await newPage(`${base}/?mode=pvp&player=r&diff=easy&sel=6,6&to=6,5`);
      await waitFor(async () => await cdp.evaluate(`(() => { const v = XQ.game.view(); return v && v.history.length >= 2; })()`), 12000);
      // 悔棋：应退回 0 手、轮到玩家
      const preUndo = await cdp.evaluate(`(() => { const v = XQ.game.view(); return { ai: v.aiThinking, hist: v.history.length, disabled: document.getElementById('btn-undo').disabled }; })()`);
      const pageErrs = await cdp.errs();
      console.log('  诊断@悔棋前:', JSON.stringify(preUndo), ' 页面错误:', JSON.stringify(pageErrs));
      await cdp.evaluate(`XQ.game.notify(); true`);
      await sleep(100);
      const afterNotify = await cdp.evaluate(`(() => ({ disabled: document.getElementById('btn-undo').disabled, statusText: document.getElementById('game-status').textContent, errs: window.__errs }))()`);
      console.log('  诊断@手动notify后:', JSON.stringify(afterNotify));
      await cdp.evaluate(`document.getElementById('btn-undo').click(); true`);
      await sleep(200);
      const und = await cdp.evaluate(`(() => { const v = XQ.game.view(); return { hist: v.history.length, side: v.side, status: v.status, ai: v.aiThinking }; })()`);
      assert(und.hist === 0 && und.side === 'r' && und.status === 'playing', `悔棋退回初始且轮到红方（hist=${und.hist}, side=${und.side}）`);
      // 再走一手，立刻认输
      await cdp.evaluate(`(() => { XQ.game.playerClick(${6 + 6 * 9}); XQ.game.playerClick(${6 + 5 * 9}); })()`);
      await sleep(200);
      await cdp.evaluate(`document.getElementById('btn-resign').click(); true`);
      await sleep(150);
      const res = await cdp.evaluate(`(() => { const v = XQ.game.view(); return { status: v.status, winner: v.winner, reason: v.reason }; })()`);
      assert(res.status === 'over' && res.winner === 'b' && res.reason === '认输', `认输生效（${JSON.stringify(res)}）`);
      // 重新开始
      await cdp.evaluate(`document.getElementById('btn-restart').click(); true`);
      await sleep(250);
      const rst = await cdp.evaluate(`(() => { const v = XQ.game.view(); return { status: v.status, hist: v.history.length }; })()`);
      assert(rst.status === 'playing' && rst.hist === 0, '重新开始重置对局');
      cdp.ws.close();
    }
    {
      // 玩家执黑：红方 AI 应先手
      const cdp = await newPage(`${base}/?mode=pvp&player=b&diff=easy`);
      await waitFor(async () => await cdp.evaluate(`(() => { const v = XQ.game.view(); return v && v.history.length >= 1; })()`), 10000);
      const st = await cdp.evaluate(`(() => { const v = XQ.game.view(); return { side: v.side, first: v.history[0] && v.history[0].notation, side0: v.history[0] && v.history[0].side }; })()`);
      assert(st.side0 === 'r' && st.side === 'b', `玩家执黑时 AI 执红先手（首手 ${st.first}）`);
      cdp.ws.close();
    }

    /* ---------- 5. file:// 直开兼容性（双击 index.html） ---------- */
    console.log('\n[5] file:// 直开兼容性');
    {
      const fileUrl = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
      const cdp = await newPage(fileUrl);
      await waitFor(async () => await cdp.evaluate(`typeof window.XQ === 'object' && !!window.XQ.rules`), 8000);
      const loaded = await cdp.evaluate(`({ rules: typeof XQ.rules, ai: typeof XQ.ai, renderer: typeof XQ.renderer, textureReady: XQ.texture.ready, ballot: !!document.getElementById('btn-start') })`);
      assert(loaded.rules === 'object' && loaded.ai === 'object' && loaded.renderer === 'object', 'file:// 下核心模块加载成功');
      // 模拟点击“开始对局”
      await cdp.evaluate(`document.getElementById('btn-start').click(); true`);
      await sleep(400);
      const started = await cdp.evaluate(`(() => ({
        gameVisible: !document.getElementById('screen-game').classList.contains('hidden'),
        board: !!document.getElementById('board'),
        status: document.getElementById('game-status').textContent
      }))()`);
      assert(started.gameVisible && started.board, 'file:// 下可进入对局');
      console.log('  状态栏:', started.status);
      await cdp.screenshot(path.join(ROOT, 'shot-file.png'));
      cdp.ws.close();
    }

    console.log(failures === 0 ? '\n端到端验证全部通过 ✔' : `\n${failures} 项失败 ✘`);
  } catch (e) {
    failures++;
    console.error('\n验证脚本异常:', e.message);
    console.error(e.stack);
  } finally {
    try { server.kill(); } catch (e) {}
    try { edge.kill(); } catch (e) {}
    process.exit(failures === 0 ? 0 : 1);
  }
})();
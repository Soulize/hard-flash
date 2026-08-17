/* =====================================================================
 * 中国象棋 · 主程序 (main.js)
 * 界面接线：菜单 <-> 对局，画布交互，状态面板刷新
 * 支持 URL 参数自动开局（便于演示/验证）：
 *   ?mode=aiai&diffR=hard&diffB=medium&speed=800
 *   ?mode=pvp&player=b&diff=hard
 * ===================================================================== */
(function () {
  'use strict';
  const XQ = window.XQ;
  const R = XQ.rules;
  const game = XQ.game;
  const renderer = XQ.renderer;

  const $ = (id) => document.getElementById(id);

  /* ---------------- 菜单状态 ---------------- */
  let mode = 'pvp';
  const ui = {
    playerSide: 'r',
    diff: 'hard',
    diffR: 'hard',
    diffB: 'medium',
    speedMs: 900
  };

  const canvas = $('board');

  function switchMode(m) {
    mode = m;
    $('mode-pvp').classList.toggle('active', m === 'pvp');
    $('mode-aiai').classList.toggle('active', m === 'aiai');
    $('opts-pvp').classList.toggle('hidden', m !== 'pvp');
    $('opts-aiai').classList.toggle('hidden', m !== 'aiai');
  }

  /* ---------------- 面板刷新 ---------------- */
  const SIDE_LABEL = { r: '红方', b: '黑方' };

  function paint(v) {
    // 状态栏
    const st = $('game-status');
    if (v.status === 'over') {
      if (v.winner) st.textContent = `${SIDE_LABEL[v.winner]}胜（${v.reason}）`;
      else st.textContent = `和棋（${v.reason}）`;
      st.className = 'status over';
    } else if (v.paused) {
      st.textContent = '已暂停';
      st.className = 'status paused';
    } else if (v.aiThinking) {
      st.textContent = `${SIDE_LABEL[v.thinkingSide]} AI 思考中…`;
      st.className = 'status thinking';
    } else if (v.mode === 'pvp') {
      st.textContent = v.side === v.playerSide ? `轮到你（${SIDE_LABEL[v.side]}）` : `AI 回合（${SIDE_LABEL[v.side]}）`;
      st.className = 'status turn';
    } else {
      st.textContent = `对局中 · ${SIDE_LABEL[v.side]}走子`;
      st.className = 'status turn';
    }

    // 吃子
    const capR = $('cap-r');
    const capB = $('cap-b');
    capR.textContent = v.captured.r.map((p) => R.PIECE_CHAR.r[p.type]).join(' ');
    capB.textContent = v.captured.b.map((p) => R.PIECE_CHAR.b[p.type]).join(' ');
    capR.classList.toggle('empty', v.captured.r.length === 0);
    capB.classList.toggle('empty', v.captured.b.length === 0);

    // 棋谱
    const ml = $('move-list');
    ml.textContent = '';
    for (let i = 0; i < v.history.length; i += 2) {
      const li = document.createElement('li');
      const red = v.history[i];
      const black = v.history[i + 1];
      li.innerHTML = `<span class="num">${i / 2 + 1}.</span> <span class="mv red">${red ? red.notation : ''}</span> <span class="mv black">${black ? black.notation : ''}</span>`;
      ml.appendChild(li);
    }
    ml.scrollTop = ml.scrollHeight;

    // 按钮状态
    $('btn-undo').disabled = v.history.length === 0 || v.aiThinking;
    $('btn-resign').disabled = v.mode !== 'pvp' || v.status !== 'playing';
    const pauseBtn = $('btn-pause');
    if (v.mode === 'aiai') {
      pauseBtn.classList.remove('hidden');
      pauseBtn.textContent = v.paused ? '▶ 继续' : '❚❚ 暂停';
    } else {
      pauseBtn.classList.add('hidden');
    }
    $('btn-sound').textContent = XQ.sound.enabled ? '🔊 声音开' : '🔇 声音关';

    // AI 思考信息
    const info = $('ai-info');
    if (v.lastStats && v.lastStats.depth > 0) {
      info.textContent = `上次搜索：深度 ${v.lastStats.depth} · 节点 ${v.lastStats.nodes.toLocaleString()} · ${v.lastStats.timeMs}ms`;
    } else {
      info.textContent = '';
    }
  }

  /* ---------------- 开始对局 ---------------- */
  function startGame() {
    XQ.sound.ensure();
    $('screen-menu').classList.add('hidden');
    $('screen-game').classList.remove('hidden');

    if (!renderer.canvas) renderer.init(canvas);

    game.onChange = paint;
    game.newGame({
      mode,
      playerSide: ui.playerSide,
      diff: ui.diff,
      diffR: ui.diffR,
      diffB: ui.diffB,
      speedMs: ui.speedMs
    });
    paint(game.view());

    if (mode === 'aiai') {
      game.startAiai();
    } else if (mode === 'pvp' && ui.playerSide === 'b') {
      // 玩家执黑：红方 AI 先手
      game.scheduleAI(500);
    }
  }

  function backToMenu() {
    game.token++; // 取消所有待定 AI 调度
    game.paused = false;
    $('screen-game').classList.add('hidden');
    $('screen-menu').classList.remove('hidden');
  }

  /* ---------------- 事件绑定 ---------------- */
  $('mode-pvp').addEventListener('click', () => switchMode('pvp'));
  $('mode-aiai').addEventListener('click', () => switchMode('aiai'));

  $('opt-side').addEventListener('change', (e) => { ui.playerSide = e.target.value; });
  $('opt-diff').addEventListener('change', (e) => { ui.diff = e.target.value; });
  $('opt-diff-r').addEventListener('change', (e) => { ui.diffR = e.target.value; });
  $('opt-diff-b').addEventListener('change', (e) => { ui.diffB = e.target.value; });
  $('opt-speed').addEventListener('input', (e) => { ui.speedMs = +e.target.value; $('speed-val').textContent = (ui.speedMs / 1000).toFixed(1) + 's'; });

  $('btn-start').addEventListener('click', startGame);
  $('btn-undo').addEventListener('click', () => game.undo());
  $('btn-resign').addEventListener('click', () => game.resign());
  $('btn-pause').addEventListener('click', () => game.togglePause());
  $('btn-restart').addEventListener('click', startGame);
  $('btn-back').addEventListener('click', backToMenu);
  $('btn-sound').addEventListener('click', () => {
    XQ.sound.enabled = !XQ.sound.enabled;
    if (XQ.sound.enabled) XQ.sound.select();
    paint(game.view() || { captured: { r: [], b: [] }, history: [], mode: 'pvp', status: 'playing' });
  });

  canvas.addEventListener('click', (e) => {
    const i = renderer.pointAt(e.clientX, e.clientY);
    if (i >= 0) game.playerClick(i);
  });
  canvas.addEventListener('mousemove', (e) => {
    renderer.setHover(e.clientX, e.clientY);
  });
  canvas.addEventListener('mouseleave', () => { renderer.hover = -1; });

  /* ---------------- 渲染循环 ---------------- */
  function frame(now) {
    const v = game.board ? game.view() : null;
    if (v) renderer.draw(v, now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ---------------- 页面背景素材 ---------------- */
  XQ.texture.init().then(() => {
    XQ.texture.applyPanelBackground(document.body);
  });

  /* ---------------- URL 参数自动开局（演示/验证） ---------------- */
  (function autostart() {
    const q = new URLSearchParams(location.search);
    const m = q.get('mode');
    if (!m) return;
    if (m === 'aiai') {
      mode = 'aiai';
      ui.diffR = q.get('diffR') || 'hard';
      ui.diffB = q.get('diffB') || 'medium';
      ui.speedMs = +q.get('speed') || 800;
    } else {
      mode = 'pvp';
      ui.playerSide = q.get('player') === 'b' ? 'b' : 'r';
      ui.diff = q.get('diff') || 'hard';
    }
    startGame();

    // 验证钩子：?sel=6,6&to=6,5 模拟玩家选子并走子（触发完整交互链路）
    if (m === 'pvp' && q.get('sel')) {
      const [sx, sy] = q.get('sel').split(',').map(Number);
      setTimeout(() => game.playerClick(R.idx(sx, sy)), 400);
      if (q.get('to')) {
        const [tx, ty] = q.get('to').split(',').map(Number);
        setTimeout(() => game.playerClick(R.idx(tx, ty)), 500);
      }
    }
  })();
})();
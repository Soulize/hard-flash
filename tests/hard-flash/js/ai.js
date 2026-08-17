/* =====================================================================
 * 中国象棋 · AI 引擎 (ai.js)
 * 极小极大 + Alpha-Beta 剪枝 + 迭代加深 + 历史启发/吃子优先着法排序
 * 结束局面用大分数 (MATE)，局势评分 = 子力价值 + 位置价值表
 * ===================================================================== */
(function (global) {
  'use strict';
  const XQ = (global.XQ = global.XQ || {});
  const R = XQ.rules;

  const MATE = 1000000;
  const VAL = { s: 100, e: 200, a: 200, h: 400, c: 450, r: 900, g: 100000 };
  const TIMEOUT = { timeout: true };
  let nodeCount = 0;

  /* ---------------- 位置价值表（红方视角，y=0 为黑方底线） ---------------- */
  function T(rows) { return rows.join(' ').split(/\s+/).map(Number); }
  const T_S = T([
    '20 20 20 25 25 25 20 20 20',
    '30 35 40 45 50 45 40 35 30',
    '35 40 45 55 60 55 45 40 35',
    '45 50 55 65 70 65 55 50 45',
    '50 55 60 70 75 70 60 55 50',
    '45 50 55 60 65 60 55 50 45',
    '40 45 50 55 60 55 50 45 40',
    '30 35 40 45 50 45 40 35 30',
    '25 30 35 40 45 40 35 30 25',
    '20 25 30 35 40 35 30 25 20'
  ]);
  const T_H = T([
    '0 -5 -5 -5 -5 -5 -5 -5 0',
    '-5 0 5 5 5 5 5 0 -5',
    '-5 5 10 15 15 15 10 5 -5',
    '-5 10 15 20 20 20 15 10 -5',
    '-5 5 10 20 25 20 10 5 -5',
    '-5 5 10 15 20 15 10 5 -5',
    '-5 5 10 15 15 15 10 5 -5',
    '-5 0 5 10 10 10 5 0 -5',
    '-5 0 0 5 5 5 0 0 -5',
    '-10 -5 -5 -5 -5 -5 -5 -5 -10'
  ]);
  const T_C = T([
    '0 0 5 10 10 10 5 0 0',
    '0 5 10 10 10 10 10 5 0',
    '0 5 10 15 15 15 10 5 0',
    '0 5 10 15 15 15 10 5 0',
    '0 0 10 15 15 15 10 0 0',
    '0 0 10 15 15 15 10 0 0',
    '0 5 10 15 15 15 10 5 0',
    '0 5 10 15 15 15 10 5 0',
    '0 5 10 10 10 10 10 5 0',
    '0 0 5 10 10 10 5 0 0'
  ]);
  const T_R = T([
    '0 0 5 10 10 10 5 0 0',
    '0 5 5 10 10 10 5 5 0',
    '0 5 10 10 10 10 10 5 0',
    '0 5 10 10 10 10 10 5 0',
    '0 5 10 12 12 12 10 5 0',
    '0 5 10 12 12 12 10 5 0',
    '0 5 10 10 10 10 10 5 0',
    '0 5 10 10 10 10 10 5 0',
    '0 5 5 10 10 10 5 5 0',
    '0 0 5 10 10 10 5 0 0'
  ]);
  const T_A = T([
    '0 0 0 30 0 30 0 0 0',
    '0 0 0 0 40 0 0 0 0',
    '0 0 0 30 0 30 0 0 0',
    '0 0 0 0 0 0 0 0 0',
    '0 0 0 0 0 0 0 0 0',
    '0 0 0 0 0 0 0 0 0',
    '0 0 0 0 0 0 0 0 0',
    '0 0 0 30 0 30 0 0 0',
    '0 0 0 0 40 0 0 0 0',
    '0 0 0 30 0 30 0 0 0'
  ]);
  const T_E = T([
    '0 0 0 0 0 0 0 0 0',
    '0 0 0 0 0 0 0 0 0',
    '0 0 0 0 0 0 0 0 0',
    '0 0 0 0 0 0 0 0 0',
    '0 0 0 0 0 0 0 0 0',
    '0 0 30 0 0 0 30 0 0',
    '0 0 0 0 0 0 0 0 0',
    '0 20 0 40 0 40 0 20 0',
    '0 0 0 0 0 0 0 0 0',
    '0 20 0 0 0 0 0 20 0'
  ]);
  const T_G = T([
    '0 0 0 10 0 10 0 0 0',
    '0 0 0 0 20 0 0 0 0',
    '0 0 0 10 0 10 0 0 0',
    '0 0 0 0 0 0 0 0 0',
    '0 0 0 0 0 0 0 0 0',
    '0 0 0 0 0 0 0 0 0',
    '0 0 0 0 0 0 0 0 0',
    '0 0 0 10 0 10 0 0 0',
    '0 0 0 0 20 0 0 0 0',
    '0 0 0 10 0 10 0 0 0'
  ]);
  const TABLES = { s: T_S, h: T_H, c: T_C, r: T_R, a: T_A, e: T_E, g: T_G };

  /* ---------------- 局势评估（红方为正） ---------------- */
  function evalRed(board) {
    let s = 0;
    for (let i = 0; i < 90; i++) {
      const p = board[i];
      if (!p) continue;
      const x = i % 9, y = (i / 9) | 0;
      let v = VAL[p.type];
      // 过河兵欲望更高
      if (p.type === 's' && ((p.side === 'r' && y <= 4) || (p.side === 'b' && y >= 5))) v += 100;
      const yy = p.side === 'r' ? y : 9 - y; // 黑子垂直翻转查表
      v += TABLES[p.type][yy * 9 + x];
      s += p.side === 'r' ? v : -v;
    }
    return s;
  }
  const evaluate = (board, side) => (side === 'r' ? evalRed(board) : -evalRed(board));

  /* ---------------- 着法排序 ---------------- */
  function orderMoves(moves, hist) {
    if (moves.length < 2) return moves;
    const scored = moves.map((m) => {
      let s = 0;
      if (m.captured) s += 10 * VAL[m.captured.type] - VAL[m.piece.type] * 0.1;
      const h = hist[m.from * 90 + m.to];
      if (h) s += h;
      return s;
    });
    const order = moves.map((_, i) => i).sort((a, b) => scored[b] - scored[a]);
    return order.map((i) => moves[i]);
  }

  /* ---------------- 搜索 ---------------- */
  function negamax(board, side, depth, alpha, beta, ply, deadline, hist) {
    if ((++nodeCount & 1023) === 0 && Date.now() > deadline) throw TIMEOUT;
    const moves = orderMoves(R.legalMoves(board, side), hist);
    if (!moves.length) return -(MATE - ply); // 无子可动 = 输
    if (depth === 0) return evaluate(board, side);

    let best = -Infinity;
    for (const m of moves) {
      R.applyMove(board, m);
      const sc = -negamax(board, R.other(side), depth - 1, -beta, -alpha, ply + 1, deadline, hist);
      R.revertMove(board, m);
      if (sc > best) {
        best = sc;
        if (sc > alpha) alpha = sc;
        if (alpha >= beta) {
          if (!m.captured) hist[m.from * 90 + m.to] += depth * depth; // 历史启发
          break;
        }
      }
    }
    return best;
  }

  /* ---------------- 对外接口：选一步棋 ---------------- */
  /**
   * cfg: { maxDepth: 1..6, timeMs: 毫秒(0=不限), randomness: 0..1 }
   * 返回 { move, depth, nodes, timeMs, score } 或 null（无棋可走）
   */
  function chooseMove(board, side, cfg) {
    const t0 = Date.now();
    const deadline = cfg.timeMs > 0 ? t0 + cfg.timeMs : Infinity;
    const all = R.legalMoves(board, side);
    if (!all.length) return null;

    const hist = new Int32Array(90 * 90);
    nodeCount = 0;
    let best = null, bestScore = -Infinity, bestDepth = 0;
    let rootScored = [];

    for (let d = 1; d <= cfg.maxDepth; d++) {
      if (Date.now() > deadline) break;
      const moves = orderMoves(all, hist);
      let curBest = null, curScore = -Infinity;
      const scored = [];
      try {
        let alpha = -Infinity;
        for (const m of moves) {
          R.applyMove(board, m);
          const sc = -negamax(board, R.other(side), d - 1, -alpha, Infinity, 1, deadline, hist);
          R.revertMove(board, m);
          scored.push({ m, sc });
          if (sc > curScore) { curScore = sc; curBest = m; }
          if (sc > alpha) alpha = sc;
        }
      } catch (e) {
        if (e !== TIMEOUT) throw e;
      }
      if (curBest) {
        best = curBest; bestScore = curScore; bestDepth = d; rootScored = scored;
      }
      if (Date.now() > deadline) break;
    }

    if (!best) {
      best = all[Math.floor(Math.random() * all.length)];
      bestScore = 0;
    } else if (cfg.randomness > 0 && rootScored.length > 1) {
      // 在最优附近小范围内随机挑选，增加棋风变化
      const threshold = bestScore - 25;
      const near = rootScored.filter((s) => s.sc >= threshold);
      if (near.length > 1 && Math.random() < cfg.randomness) {
        best = near[Math.floor(Math.random() * near.length)].m;
      }
    }

    return {
      move: best,
      depth: bestDepth,
      nodes: nodeCount,
      timeMs: Date.now() - t0,
      score: bestScore
    };
  }

  XQ.ai = { chooseMove, evalRed, MATE, VAL };
})(typeof window !== 'undefined' ? window : globalThis);
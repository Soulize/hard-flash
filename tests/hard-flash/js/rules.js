/* =====================================================================
 * 中国象棋 · 规则引擎 (rules.js)
 * 棋盘：9 路 (x: 0..8) × 10 排 (y: 0..9)
 *   - 黑方在上 (y=0 为黑方底线)，红方在下 (y=9 为红方底线)
 *   - 番将 (双方将帅) 直面对视判定、士象马腿等规则均已实现
 * 兼容浏览器 (window.XQ) 与 Node (globalThis.XQ)
 * ===================================================================== */
(function (global) {
  'use strict';

  const XQ = (global.XQ = global.XQ || {});

  const FILES = 9;
  const RANKS = 10;
  const SIZE = FILES * RANKS;

  const idx = (x, y) => y * FILES + x;
  const xOf = (i) => i % FILES;
  const yOf = (i) => (i / FILES) | 0;
  const onBoard = (x, y) => x >= 0 && x < FILES && y >= 0 && y < RANKS;
  const other = (s) => (s === 'r' ? 'b' : 'r');

  const PIECE_CHAR = {
    r: { g: '帥', a: '仕', e: '相', h: '傌', r: '俥', c: '炮', s: '兵' },
    b: { g: '將', a: '士', e: '象', h: '馬', r: '車', c: '砲', s: '卒' }
  };
  const CHAR_PIECE = {};
  for (const s in PIECE_CHAR) {
    for (const t in PIECE_CHAR[s]) CHAR_PIECE[PIECE_CHAR[s][t]] = t;
  }

  /* ---------------- 初始局面 ---------------- */
  function initialBoard() {
    const b = new Array(SIZE).fill(null);
    const put = (side, type, x, y) => { b[idx(x, y)] = { side, type }; };
    const back = ['r', 'h', 'e', 'a', 'g', 'a', 'e', 'h', 'r'];
    for (let x = 0; x < FILES; x++) {
      put('b', back[x], x, 0); // 黑方底线
      put('r', back[x], x, 9); // 红方底线
    }
    put('b', 'c', 1, 2); put('b', 'c', 7, 2);
    put('r', 'c', 1, 7); put('r', 'c', 7, 7);
    const sCols = [0, 2, 4, 6, 8];
    for (const x of sCols) { put('b', 's', x, 3); put('r', 's', x, 6); }
    return b;
  }

  /* ---------------- 九宫 ---------------- */
  function inPalace(side, x, y) {
    if (side === 'r') return x >= 3 && x <= 5 && y >= 7 && y <= 9;
    return x >= 3 && x <= 5 && y >= 0 && y <= 2;
  }

  /* ---------------- 假走法（未过滤自照将） ---------------- */
  const RAYS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function pseudoMoves(board, side) {
    const moves = [];
    const add = (moves, from, tx, ty) => {
      if (!onBoard(tx, ty)) return;
      const t = board[idx(tx, ty)];
      if (t && t.side === side) return;
      moves.push({ from, to: idx(tx, ty), piece: board[from], captured: t || null });
    };

    for (let i = 0; i < SIZE; i++) {
      const p = board[i];
      if (!p || p.side !== side) continue;
      const x = xOf(i), y = yOf(i);

      switch (p.type) {
        case 'g': { // 帅/将：九宫内走一格
          for (const [dx, dy] of RAYS) {
            if (inPalace(side, x + dx, y + dy)) add(moves, i, x + dx, y + dy);
          }
          break;
        }
        case 'a': { // 仕/士：九宫内斜走一格
          for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            if (inPalace(side, x + dx, y + dy)) add(moves, i, x + dx, y + dy);
          }
          break;
        }
        case 'e': { // 相/象：田字，塞象眼，不过河
          for (const [dx, dy] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
            const tx = x + dx, ty = y + dy;
            if (!onBoard(tx, ty)) continue;
            if (side === 'r' && ty < 5) continue;
            if (side === 'b' && ty > 4) continue;
            if (board[idx(x + dx / 2, y + dy / 2)]) continue; // 象眼
            add(moves, i, tx, ty);
          }
          break;
        }
        case 'h': { // 傌/馬：日字，蹩马腿
          const offsets = [
            [1, 2, [0, 1]], [2, 1, [1, 0]], [2, -1, [1, 0]], [1, -2, [0, -1]],
            [-1, -2, [0, -1]], [-2, -1, [-1, 0]], [-2, 1, [-1, 0]], [-1, 2, [0, 1]]
          ];
          for (const [dx, dy, leg] of offsets) {
            const tx = x + dx, ty = y + dy;
            if (!onBoard(tx, ty)) continue;
            if (board[idx(x + leg[0], y + leg[1])]) continue; // 马腿
            add(moves, i, tx, ty);
          }
          break;
        }
        case 'r': { // 俥/車：直线任意距离
          for (const [dx, dy] of RAYS) {
            let tx = x + dx, ty = y + dy;
            while (onBoard(tx, ty)) {
              const t = board[idx(tx, ty)];
              if (t) {
                if (t.side !== side) add(moves, i, tx, ty);
                break;
              }
              add(moves, i, tx, ty);
              tx += dx; ty += dy;
            }
          }
          break;
        }
        case 'c': { // 炮/砲：隔一子打
          for (const [dx, dy] of RAYS) {
            let tx = x + dx, ty = y + dy;
            let screened = false;
            while (onBoard(tx, ty)) {
              const t = board[idx(tx, ty)];
              if (!t) {
                if (!screened) add(moves, i, tx, ty);
              } else {
                if (!screened) {
                  screened = true;
                } else {
                  if (t.side !== side) add(moves, i, tx, ty);
                  break;
                }
              }
              tx += dx; ty += dy;
            }
          }
          break;
        }
        case 's': { // 兵/卒：只进不退，过河可横
          const fwd = side === 'r' ? -1 : 1;
          add(moves, i, x, y + fwd);
          const crossed = side === 'r' ? y <= 4 : y >= 5;
          if (crossed) { add(moves, i, x + 1, y); add(moves, i, x - 1, y); }
          break;
        }
      }
    }
    return moves;
  }

  /* ---------------- 走法应用/还原 ---------------- */
  function applyMove(board, move) {
    board[move.to] = board[move.from];
    board[move.from] = null;
  }
  function revertMove(board, move) {
    board[move.from] = board[move.to];
    board[move.to] = move.captured || null;
  }

  /* ---------------- 将军判定 ---------------- */
  function findGeneral(board, side) {
    for (let i = 0; i < SIZE; i++) {
      const p = board[i];
      if (p && p.side === side && p.type === 'g') return i;
    }
    return -1;
  }

  /** (x, y) 是否被 bySide 一方攻击（含番将、炮架） */
  function isSquareAttacked(board, x, y, bySide) {
    const enemyAt = (px, py) => {
      if (!onBoard(px, py)) return null;
      const p = board[idx(px, py)];
      return p && p.side === bySide ? p : null;
    };
    // 兵/卒
    if (bySide === 'r') {
      const p0 = enemyAt(x, y + 1);
      if (p0 && p0.type === 's') return true;
      for (const dx of [-1, 1]) {
        const s = enemyAt(x + dx, y);
        if (s && s.type === 's' && yOf(idx(x + dx, y)) <= 4) return true;
      }
    } else {
      const p0 = enemyAt(x, y - 1);
      if (p0 && p0.type === 's') return true;
      for (const dx of [-1, 1]) {
        const s = enemyAt(x + dx, y);
        if (s && s.type === 's' && yOf(idx(x + dx, y)) >= 5) return true;
      }
    }
    // 仕/士
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const p = enemyAt(x + dx, y + dy);
      if (p && p.type === 'a') return true;
    }
    // 相/象（含象眼、不过河约束，攻击源与目标都须在本方半场）
    for (const [dx, dy] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
      const sx = x + dx, sy = y + dy;
      const p = enemyAt(sx, sy);
      if (!p || p.type !== 'e') continue;
      if (bySide === 'r' && (sy < 5 || y < 5)) continue;
      if (bySide === 'b' && (sy > 4 || y > 4)) continue;
      if (!board[idx(x + dx / 2, y + dy / 2)]) return true; // 象眼
    }
    // 傌/馬（含马腿）
    const hOff = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
    for (const [dx, dy] of hOff) {
      const sx = x + dx, sy = y + dy;
      const p = enemyAt(sx, sy);
      if (!p || p.type !== 'h') continue;
      const legX = Math.abs(dx) === 2 ? x + dx / 2 : x;
      const legY = Math.abs(dy) === 2 ? y + dy / 2 : y;
      if (!board[idx(legX, legY)]) return true;
    }
    // 帅/将相邻
    for (const [dx, dy] of RAYS) {
      const p = enemyAt(x + dx, y + dy);
      if (p && p.type === 'g') return true;
    }
    // 直线：俥/車、炮/砲、番将
    for (const [dx, dy] of RAYS) {
      let tx = x + dx, ty = y + dy;
      let screens = 0;
      while (onBoard(tx, ty)) {
        const t = board[idx(tx, ty)];
        if (t) {
          if (screens === 0) {
            if (t.side === bySide && (t.type === 'r' || t.type === 'g')) return true;
            screens = 1; // 成为炮架
          } else if (screens === 1) {
            if (t.side === bySide && t.type === 'c') return true;
            break;
          }
        }
        tx += dx; ty += dy;
      }
    }
    return false;
  }

  function inCheck(board, side) {
    const g = findGeneral(board, side);
    if (g < 0) return false;
    return isSquareAttacked(board, xOf(g), yOf(g), other(side));
  }

  /* ---------------- 合法走法（不允许自照将；不允许吃将） ---------------- */
  function legalMoves(board, side) {
    const out = [];
    for (const m of pseudoMoves(board, side)) {
      if (m.captured && m.captured.type === 'g') continue; // 将死以“无着法”判定，不产生吃将走法
      applyMove(board, m);
      const safe = !inCheck(board, side);
      revertMove(board, m);
      if (safe) out.push(m);
    }
    return out;
  }

  /* ---------------- 局面指纹（循环检测用） ---------------- */
  function boardKey(board, side) {
    let s = side + '|';
    for (let i = 0; i < SIZE; i++) {
      const p = board[i];
      s += p ? p.side + p.type : '.';
    }
    return s;
  }

  /* ---------------- 中文记谱 ---------------- */
  const RED_FILE = ['九', '八', '七', '六', '五', '四', '三', '二', '一'];
  const RED_RANK = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

  function moveNotation(board, move, side) {
    const fx = xOf(move.from), fy = yOf(move.from);
    const tx = xOf(move.to), ty = yOf(move.to);
    const ch = PIECE_CHAR[side][move.piece.type];
    const file = side === 'r' ? RED_FILE[fx] : String(fx + 1);
    const adv = side === 'r' ? ty < fy : ty > fy;
    // 马/象/士 永远变路：进/退 + 目标路
    const alwaysFile = move.piece.type === 'h' || move.piece.type === 'e' || move.piece.type === 'a';
    if (alwaysFile) {
      const tf = side === 'r' ? RED_FILE[tx] : String(tx + 1);
      return ch + file + (adv ? '进' : '退') + tf;
    }
    if (tx === fx) { // 同路直走：进/退 + 步数
      const n = side === 'r' ? RED_RANK[Math.abs(ty - fy) - 1] : String(Math.abs(ty - fy));
      return ch + file + (adv ? '进' : '退') + n;
    }
    const tf = side === 'r' ? RED_FILE[tx] : String(tx + 1);
    return ch + file + '平' + tf;
  }

  XQ.rules = {
    FILES, RANKS, SIZE, idx, xOf, yOf, onBoard, other,
    PIECE_CHAR, CHAR_PIECE,
    initialBoard, inPalace, pseudoMoves, applyMove, revertMove,
    findGeneral, isSquareAttacked, inCheck, legalMoves,
    boardKey, moveNotation
  };
})(typeof window !== 'undefined' ? window : globalThis);
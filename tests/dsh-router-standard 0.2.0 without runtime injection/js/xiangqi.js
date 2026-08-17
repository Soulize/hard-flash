/**
 * xiangqi.js — 中国象棋棋盘、规则与走法生成
 * 使用行(row)0~9、列(col)0~8。
 * 红方在下(第5~9行为红方半场)，黑方在上(第0~4行为黑方半场)。
 */
(function (global) {
  'use strict';

  const RED = 'r';
  const BLACK = 'b';

  const TYPES = {
    KING: 'king',
    ADVISOR: 'advisor',
    ELEPHANT: 'elephant',
    HORSE: 'horse',
    ROOK: 'rook',
    CANNON: 'cannon',
    SOLDIER: 'soldier'
  };

  const TYPE_NAMES = {
    king: '将',
    advisor: '士',
    elephant: '象',
    horse: '马',
    rook: '车',
    cannon: '炮',
    soldier: '兵'
  };

  const RED_NAMES = {
    king: '帅',
    advisor: '仕',
    elephant: '相',
    horse: '马',
    rook: '车',
    cannon: '炮',
    soldier: '兵'
  };

  const BLACK_NAMES = {
    king: '将',
    advisor: '士',
    elephant: '象',
    horse: '马',
    rook: '车',
    cannon: '炮',
    soldier: '卒'
  };

  const DIRECTIONS = {
    ORTH: [[-1, 0], [1, 0], [0, -1], [0, 1]],
    DIAG: [[-1, -1], [-1, 1], [1, -1], [1, 1]]
  };

  function opposite(color) {
    return color === RED ? BLACK : RED;
  }

  function isInside(r, c) {
    return r >= 0 && r <= 9 && c >= 0 && c <= 8;
  }

  function inPalace(r, c, color) {
    if (c < 3 || c > 5) return false;
    return color === RED ? (r >= 7 && r <= 9) : (r >= 0 && r <= 2);
  }

  function ownSide(r, color) {
    return color === RED ? r >= 5 : r <= 4;
  }

  function crossedRiver(r, color) {
    return color === RED ? r <= 4 : r >= 5;
  }

  function createEmptyBoard() {
    const b = [];
    for (let r = 0; r < 10; r++) {
      b.push(new Array(9).fill(null));
    }
    return b;
  }

  function initialBoard() {
    const b = createEmptyBoard();

    function put(r, c, color, type) {
      b[r][c] = { color, type };
    }

    // 黑方
    const blackBack = [TYPES.ROOK, TYPES.HORSE, TYPES.ELEPHANT, TYPES.ADVISOR, TYPES.KING,
                       TYPES.ADVISOR, TYPES.ELEPHANT, TYPES.HORSE, TYPES.ROOK];
    for (let c = 0; c < 9; c++) put(0, c, BLACK, blackBack[c]);
    put(2, 1, BLACK, TYPES.CANNON);
    put(2, 7, BLACK, TYPES.CANNON);
    for (let c = 0; c < 9; c += 2) put(3, c, BLACK, TYPES.SOLDIER);

    // 红方
    const redBack = [TYPES.ROOK, TYPES.HORSE, TYPES.ELEPHANT, TYPES.ADVISOR, TYPES.KING,
                     TYPES.ADVISOR, TYPES.ELEPHANT, TYPES.HORSE, TYPES.ROOK];
    for (let c = 0; c < 9; c++) put(9, c, RED, redBack[c]);
    put(7, 1, RED, TYPES.CANNON);
    put(7, 7, RED, TYPES.CANNON);
    for (let c = 0; c < 9; c += 2) put(6, c, RED, TYPES.SOLDIER);

    return b;
  }

  function cloneBoard(board) {
    return board.map(row => row.slice());
  }

  function getPiece(board, r, c) {
    if (!isInside(r, c)) return null;
    return board[r][c];
  }

  function findKing(board, color) {
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = board[r][c];
        if (p && p.color === color && p.type === TYPES.KING) return { r, c };
      }
    }
    return null;
  }

  /**
   * 判断是否存在“将帅对脸”：两王同一列且中间无棋子。
   * 若存在即该局面非法，对任何一方都视为被“飞将”。
   */
  function hasFlyingGeneral(board) {
    const rk = findKing(board, RED);
    const bk = findKing(board, BLACK);
    if (!rk || !bk || rk.c !== bk.c) return false;
    const from = Math.min(rk.r, bk.r);
    const to = Math.max(rk.r, bk.r);
    for (let r = from + 1; r < to; r++) {
      if (board[r][rk.c]) return false;
    }
    return true;
  }

  /**
   * 某棋子能否攻击/到达某格（不检查走后是否被将军，也不检查目的地是否为空）。
   * 用于将军检测。
   */
  function canPieceAttackSquare(board, r, c, tr, tc) {
    const p = board[r][c];
    if (!p || !isInside(tr, tc)) return false;
    const dr = tr - r;
    const dc = tc - c;
    const adr = Math.abs(dr);
    const adc = Math.abs(dc);

    switch (p.type) {
      case TYPES.KING: {
        // 通常走一步
        if (adr + adc === 1) return true;
        // 飞将：同列直线上无子
        if (dc === 0 && adr > 0) {
          const from = Math.min(r, tr);
          const to = Math.max(r, tr);
          for (let rr = from + 1; rr < to; rr++) {
            if (board[rr][c]) return false;
          }
          return true;
        }
        return false;
      }
      case TYPES.ADVISOR:
        return adr === 1 && adc === 1;
      case TYPES.ELEPHANT:
        if (adr !== 2 || adc !== 2) return false;
        // 不能过河，且象眼不能有子
        if (!ownSide(tr, p.color)) return false;
        return board[r + dr / 2][c + dc / 2] === null;
      case TYPES.HORSE: {
        if (adr === 2 && adc === 1) {
          const legR = r + dr / 2;
          return board[legR][c] === null;
        }
        if (adr === 1 && adc === 2) {
          const legC = c + dc / 2;
          return board[r][legC] === null;
        }
        return false;
      }
      case TYPES.ROOK: {
        if (dr !== 0 && dc !== 0) return false;
        const stepR = dr === 0 ? 0 : dr / adr;
        const stepC = dc === 0 ? 0 : dc / adc;
        let rr = r + stepR;
        let cc = c + stepC;
        while (rr !== tr || cc !== tc) {
          if (board[rr][cc]) return false;
          rr += stepR;
          cc += stepC;
        }
        return true;
      }
      case TYPES.CANNON: {
        if (dr !== 0 && dc !== 0) return false;
        const stepR = dr === 0 ? 0 : dr / adr;
        const stepC = dc === 0 ? 0 : dc / adc;
        let screens = 0;
        let rr = r + stepR;
        let cc = c + stepC;
        while (rr !== tr || cc !== tc) {
          if (board[rr][cc]) screens++;
          if (screens > 1) return false;
          rr += stepR;
          cc += stepC;
        }
        // 炮要吃子必须恰有一个炮架；不吃子时路径不能有炮架
        const target = board[tr][tc];
        if (target) return screens === 1;
        return screens === 0;
      }
      case TYPES.SOLDIER: {
        // 永远不能后退
        if (p.color === RED && dr > 0) return false;
        if (p.color === BLACK && dr < 0) return false;
        // 向前一步
        if (dc === 0 && adr === 1) return true;
        // 过河后可横走一步
        if (crossedRiver(r, p.color) && dr === 0 && adc === 1) return true;
        return false;
      }
      default:
        return false;
    }
  }

  /** 某格是否被某一方攻击（包括飞将）。 */
  function isSquareAttacked(board, tr, tc, byColor) {
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = board[r][c];
        if (p && p.color === byColor) {
          if (canPieceAttackSquare(board, r, c, tr, tc)) return true;
        }
      }
    }
    return hasFlyingGeneral(board);
  }

  function isInCheck(board, color) {
    const king = findKing(board, color);
    if (!king) return false;
    return isSquareAttacked(board, king.r, king.c, opposite(color));
  }

  /** 根据类型生成该棋子的全部“伪合法”走法（不含自己颜色、不含走后将军过滤）。 */
  function pseudoMovesForPiece(board, r, c) {
    const p = board[r][c];
    if (!p) return [];
    const moves = [];
    const color = p.color;
    const push = (tr, tc) => {
      if (!isInside(tr, tc)) return;
      const target = board[tr][tc];
      if (target && target.color === color) return; // 不能吃己方
      moves.push({
        from: { r, c },
        to: { r: tr, c: tc },
        piece: p,
        captured: target || null,
        isCapture: !!target
      });
    };

    switch (p.type) {
      case TYPES.KING:
        for (const [dr, dc] of DIRECTIONS.ORTH) {
          const tr = r + dr;
          const tc = c + dc;
          if (inPalace(tr, tc, color)) push(tr, tc);
        }
        break;

      case TYPES.ADVISOR:
        for (const [dr, dc] of DIRECTIONS.DIAG) {
          const tr = r + dr;
          const tc = c + dc;
          if (inPalace(tr, tc, color)) push(tr, tc);
        }
        break;

      case TYPES.ELEPHANT:
        for (const [dr, dc] of [[-2, -2], [-2, 2], [2, -2], [2, 2]]) {
          const tr = r + dr;
          const tc = c + dc;
          if (!isInside(tr, tc)) continue;
          if (!ownSide(tr, color)) continue; // 象不能过河
          if (board[r + dr / 2][c + dc / 2]) continue; // 塞象眼
          push(tr, tc);
        }
        break;

      case TYPES.HORSE:
        for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
          const tr = r + dr;
          const tc = c + dc;
          if (!isInside(tr, tc)) continue;
          let legR, legC;
          if (Math.abs(dr) === 2) {
            legR = r + dr / 2;
            legC = c;
          } else {
            legR = r;
            legC = c + dc / 2;
          }
          if (board[legR][legC]) continue; // 蹩马腿
          push(tr, tc);
        }
        break;

      case TYPES.ROOK:
        for (const [dr, dc] of DIRECTIONS.ORTH) {
          let tr = r + dr;
          let tc = c + dc;
          while (isInside(tr, tc)) {
            const target = board[tr][tc];
            if (!target) {
              push(tr, tc);
            } else {
              if (target.color !== color) push(tr, tc);
              break;
            }
            tr += dr;
            tc += dc;
          }
        }
        break;

      case TYPES.CANNON:
        for (const [dr, dc] of DIRECTIONS.ORTH) {
          let tr = r + dr;
          let tc = c + dc;
          let screenPassed = false;
          while (isInside(tr, tc)) {
            const target = board[tr][tc];
            if (!screenPassed) {
              if (!target) {
                push(tr, tc); // 不吃子移动，不能越子
              } else {
                screenPassed = true; // 遇到第一个炮架
              }
            } else {
              if (target) {
                if (target.color !== color) push(tr, tc); // 隔一个子吃
                break; // 第二个子后挡住
              }
            }
            tr += dr;
            tc += dc;
          }
        }
        break;

      case TYPES.SOLDIER: {
        const forward = color === RED ? -1 : 1;
        push(r + forward, c);
        if (crossedRiver(r, color)) {
          push(r, c - 1);
          push(r, c + 1);
        }
        break;
      }
    }

    return moves;
  }

  /** 伪合法走法（所有棋子）。 */
  function generatePseudoMoves(board, color) {
    const all = [];
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = board[r][c];
        if (p && p.color === color) {
          all.push(...pseudoMovesForPiece(board, r, c));
        }
      }
    }
    return all;
  }

  function applyMove(board, move) {
    const b = cloneBoard(board);
    const { from, to } = move;
    b[to.r][to.c] = b[from.r][from.c];
    b[from.r][from.c] = null;
    return b;
  }

  /** 合法走法：走完后己方王不能被将军，且不允许将帅对脸。 */
  function generateLegalMoves(board, color) {
    const pseudo = generatePseudoMoves(board, color);
    const legal = [];
    for (const move of pseudo) {
      // 直接吃掉对方将/帅在正式局面中不应出现
      if (move.captured && move.captured.color !== color && move.captured.type === TYPES.KING) continue;
      const next = applyMove(board, move);
      if (hasFlyingGeneral(next)) continue;
      if (isInCheck(next, color)) continue;
      legal.push(move);
    }
    return legal;
  }

  function boardKey(board, turn) {
    let s = turn + ':';
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = board[r][c];
        s += p ? (p.color + p.type[0]) : '.';
      }
      s += '|';
    }
    return s;
  }

  function pieceName(piece) {
    if (!piece) return '';
    return piece.color === RED ? (RED_NAMES[piece.type] || piece.type) : (BLACK_NAMES[piece.type] || piece.type);
  }

  function colorName(color) {
    return color === RED ? '红方' : '黑方';
  }

  const Xiangqi = {
    RED,
    BLACK,
    TYPES,
    TYPE_NAMES,
    RED_NAMES,
    BLACK_NAMES,
    opposite,
    isInside,
    createEmptyBoard,
    initialBoard,
    cloneBoard,
    getPiece,
    findKing,
    hasFlyingGeneral,
    canPieceAttackSquare,
    isSquareAttacked,
    isInCheck,
    pseudoMovesForPiece,
    generatePseudoMoves,
    generateLegalMoves,
    applyMove,
    boardKey,
    pieceName,
    colorName
  };

  global.Xiangqi = Xiangqi;
})(typeof window !== 'undefined' ? window : globalThis);
/**
 * ai.js — 中国象棋 AI（Minimax + Alpha-Beta 剪枝 + 局面评估）
 */
(function (global) {
  'use strict';

  const XQ = global.Xiangqi;

  const MATE = 100000;

  const MATERIAL = {
    king: 10000,
    rook: 900,
    cannon: 450,
    horse: 400,
    elephant: 200,
    advisor: 200,
    soldier: 100
  };

  // 位置价值表：按红方视角定义（第 0 行为黑方底线，第 9 行为红方底线）。
  // 黑方棋子使用时镜像翻转。
  const TABLES = {
    king: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 4, 0, 0, 0, 4, 0, 0],
      [0, 0, 8, 12, 14, 12, 8, 0, 0],
      [0, 0, 10, 14, 16, 14, 10, 0, 0]
    ],
    advisor: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 4, 0, 0, 0, 4, 0, 0],
      [0, 0, 8, 12, 0, 12, 8, 0, 0],
      [0, 0, 0, 12, 16, 12, 0, 0, 0]
    ],
    elephant: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 10, 0, 0, 0, 10, 0, 0],
      [0, 0, 0, 14, 0, 14, 0, 0, 0],
      [8, 0, 12, 0, 16, 0, 12, 0, 8]
    ],
    horse: [
      [4, 8, 16, 12, 14, 12, 16, 8, 4],
      [4, 10, 28, 16, 8, 16, 28, 10, 4],
      [12, 14, 16, 20, 18, 20, 16, 14, 12],
      [8, 24, 30, 32, 32, 32, 30, 24, 8],
      [0, 16, 24, 26, 26, 26, 24, 16, 0],
      [0, 14, 22, 26, 26, 26, 22, 14, 0],
      [6, 10, 18, 22, 22, 22, 18, 10, 6],
      [10, 16, 14, 20, 18, 20, 14, 16, 10],
      [4, 12, 16, 16, 16, 16, 16, 12, 4],
      [2, 4, 8, 8, 10, 8, 8, 4, 2]
    ],
    rook: [
      [14, 14, 12, 18, 16, 18, 12, 14, 14],
      [16, 20, 18, 24, 26, 24, 18, 20, 16],
      [12, 12, 12, 18, 18, 18, 12, 12, 12],
      [12, 18, 16, 22, 22, 22, 16, 18, 12],
      [12, 14, 12, 18, 18, 18, 12, 14, 12],
      [12, 16, 14, 20, 20, 20, 14, 16, 12],
      [6, 10, 8, 14, 14, 14, 8, 10, 6],
      [4, 8, 6, 14, 12, 14, 6, 8, 4],
      [8, 4, 8, 16, 8, 16, 8, 4, 8],
      [4, 8, 6, 14, 12, 14, 6, 8, 4]
    ],
    cannon: [
      [6, 4, 0, 10, 12, 10, 0, 4, 6],
      [2, 6, 4, 8, 14, 8, 4, 6, 2],
      [4, 2, 8, 6, 10, 6, 8, 2, 4],
      [6, 8, 12, 10, 12, 10, 12, 8, 6],
      [2, 6, 8, 12, 12, 12, 8, 6, 2],
      [4, 8, 10, 14, 14, 14, 10, 8, 4],
      [0, 4, 6, 10, 12, 10, 6, 4, 0],
      [4, 4, 4, 8, 8, 8, 4, 4, 4],
      [8, 8, 4, 8, 8, 8, 4, 8, 8],
      [2, 0, 4, 6, 6, 6, 4, 0, 2]
    ],
    soldier: [
      [0, 3, 6, 9, 12, 9, 6, 3, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [2, 2, 4, 6, 8, 6, 4, 2, 2],
      [4, 6, 8, 12, 16, 12, 8, 6, 4],
      [10, 12, 14, 18, 20, 18, 14, 12, 10],
      [8, 10, 12, 14, 16, 14, 12, 10, 8],
      [6, 8, 10, 12, 14, 12, 10, 8, 6],
      [4, 6, 8, 10, 12, 10, 8, 6, 4],
      [2, 4, 6, 8, 10, 8, 6, 4, 2]
    ]
  };

  function tableFor(piece, r, c) {
    const table = TABLES[piece.type];
    const rr = piece.color === XQ.RED ? r : 9 - r;
    return table[rr][c];
  }

  /** 从某方视角评估局面：正数表示该方有利。 */
  function evaluateBoard(board, perspective) {
    let redScore = 0;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = board[r][c];
        if (!p) continue;
        let value = MATERIAL[p.type] + tableFor(p, r, c);
        // 过河兵额外加分
        if (p.type === XQ.TYPES.SOLDIER) {
          if (p.color === XQ.RED && r <= 4) value += 40;
          if (p.color === XQ.BLACK && r >= 5) value += 40;
        }
        if (p.color === XQ.RED) redScore += value;
        else redScore -= value;
      }
    }
    return perspective === XQ.RED ? redScore : -redScore;
  }

  function moveOrderScore(board, move) {
    if (move.captured) {
      return 10000 + MATERIAL[move.captured.type] * 10 - MATERIAL[move.piece.type];
    }
    return 0;
  }

  function chooseBestMove(moves, scores) {
    let bestScore = -Infinity;
    let bestIndices = [];
    for (let i = 0; i < moves.length; i++) {
      if (scores[i] > bestScore + 1e-9) {
        bestScore = scores[i];
        bestIndices = [i];
      } else if (Math.abs(scores[i] - bestScore) <= 1e-9) {
        bestIndices.push(i);
      }
    }
    // 同级最优中随机选择，增加棋风变化
    const idx = bestIndices[Math.floor(Math.random() * bestIndices.length)];
    return moves[idx];
  }

  /**
   * 计算 AI 最佳走法。
   * @param {Array} board
   * @param {string} turn - 当前轮到的颜色
   * @param {number} depth - 搜索深度
   * @returns {{move:Object, score:number}|null}
   */
  function findBestMove(board, turn, depth) {
    const moves = XQ.generateLegalMoves(board, turn);
    if (moves.length === 0) return null;
    if (depth <= 0) return { move: moves[Math.floor(Math.random() * moves.length)], score: 0 };

    // 排序以便剪枝
    moves.sort((a, b) => moveOrderScore(board, b) - moveOrderScore(board, a));

    let alpha = -Infinity;
    const beta = Infinity;
    const scores = new Array(moves.length);

    for (let i = 0; i < moves.length; i++) {
      const next = XQ.applyMove(board, moves[i]);
      scores[i] = -negamax(next, XQ.opposite(turn), depth - 1, -beta, -alpha, true);
      if (scores[i] > alpha) alpha = scores[i];
    }

    return { move: chooseBestMove(moves, scores), score: alpha };
  }

  function negamax(board, turn, depth, alpha, beta, isRootChild) {
    const moves = XQ.generateLegalMoves(board, turn);

    // 无子可走：当前方判负（困毙）
    if (moves.length === 0) {
      return -(MATE + (depth * 10 || 1));
    }

    if (depth <= 0) {
      return evaluateBoard(board, turn);
    }

    moves.sort((a, b) => moveOrderScore(board, b) - moveOrderScore(board, a));

    let best = -Infinity;
    for (const move of moves) {
      const next = XQ.applyMove(board, move);
      const score = -negamax(next, XQ.opposite(turn), depth - 1, -beta, -alpha, false);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  function depthForDifficulty(difficulty) {
    switch (difficulty) {
      case 'easy': return 1;
      case 'hard': return 3;
      case 'normal':
      default: return 2;
    }
  }

  global.XiangqiAI = {
    findBestMove,
    evaluateBoard,
    depthForDifficulty
  };
})(typeof window !== 'undefined' ? window : globalThis);
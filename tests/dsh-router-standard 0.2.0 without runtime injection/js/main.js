/**
 * main.js — 页面交互、渲染、玩家 vs AI / AI vs AI 调度
 */
(function () {
  'use strict';

  const XQ = window.Xiangqi;
  const AI = window.XiangqiAI;

  // ---------- DOM ----------
  const boardEl = document.getElementById('board');
  const statusEl = document.getElementById('status');
  const moveListEl = document.getElementById('move-list');
  const modePvaiBtn = document.getElementById('mode-pvai');
  const modeAiaiBtn = document.getElementById('mode-aiai');
  const playerColorSel = document.getElementById('player-color');
  const difficultySel = document.getElementById('difficulty');
  const newGameBtn = document.getElementById('new-game');
  const undoBtn = document.getElementById('undo-btn');
  const flipBtn = document.getElementById('flip-btn');
  const pauseBtn = document.getElementById('pause-btn');

  // ---------- 状态 ----------
  const state = {
    mode: 'pvai',          // 'pvai' | 'aiai'
    playerColor: null,     // 'r' | 'b' | null(aiai)
    difficulty: 'normal',
    flipped: false,
    board: null,
    turn: XQ.RED,
    selected: null,        // {r,c} 或 null
    legalMoves: [],        // 当前选中棋子的合法走法
    history: [],           // {move, color, check, gameOver...}
    gameOver: false,
    winner: null,
    reason: '',
    positionCounts: new Map(),
    paused: false,
    isAiThinking: false,
    aiTimer: null,
    squares: []
  };

  // ---------- 棋盘生成 ----------
  function boardSvg() {
    const X_MIN = 0, X_MAX = 8, Y_MIN = 0, Y_MAX = 9;
    const W = X_MAX - X_MIN;
    const H = Y_MAX - Y_MIN;
    const parts = [];

    parts.push(`<svg class="board-svg" viewBox="0 0 8 9" preserveAspectRatio="none" aria-hidden="true">`);
    parts.push(`<defs>`);
    parts.push(`<linearGradient id="wood-grad" x1="0" y1="0" x2="1" y2="1">`);
    parts.push(`<stop offset="0%" stop-color="#e5bc7f" />`);
    parts.push(`<stop offset="45%" stop-color="#d6a45f" />`);
    parts.push(`<stop offset="100%" stop-color="#b9833f" />`);
    parts.push(`</linearGradient>`);
    parts.push(`</defs>`);
    parts.push(`<rect x="${X_MIN}" y="${Y_MIN}" width="${W}" height="${H}" class="board-bg" style="fill:url(#wood-grad)" />`);
    // 外框：稍向内收，避免描边被 viewBox 裁掉一半
    parts.push(`<rect x="0.08" y="0.08" width="${W - 0.16}" height="${H - 0.16}" class="board-line board-line-outer" fill="none" />`);

    // 横向线
    for (let r = 0; r <= 9; r++) {
      parts.push(`<line x1="${X_MIN}" y1="${r}" x2="${X_MAX}" y2="${r}" class="board-line" />`);
    }

    // 纵向线（河流区域断开）
    for (let c = 0; c <= 8; c++) {
      if (c === 0 || c === 8) {
        parts.push(`<line x1="${c}" y1="${Y_MIN}" x2="${c}" y2="${Y_MAX}" class="board-line board-line-outer" />`);
      } else {
        parts.push(`<line x1="${c}" y1="${Y_MIN}" x2="${c}" y2="4" class="board-line" />`);
        parts.push(`<line x1="${c}" y1="5" x2="${c}" y2="${Y_MAX}" class="board-line" />`);
      }
    }

    // 九宫斜线
    // 黑方
    parts.push(`<line x1="3" y1="0" x2="5" y2="2" class="board-line palace-line" />`);
    parts.push(`<line x1="5" y1="0" x2="3" y2="2" class="board-line palace-line" />`);
    // 红方
    parts.push(`<line x1="3" y1="7" x2="5" y2="9" class="board-line palace-line" />`);
    parts.push(`<line x1="5" y1="7" x2="3" y2="9" class="board-line palace-line" />`);

    // 河界
    parts.push(`<text x="4" y="4.55" class="river-text" text-anchor="middle">楚 河</text>`);
    parts.push(`<text x="4" y="4.9" class="river-text" text-anchor="middle">漢 界</text>`);

    parts.push(`</svg>`);
    return parts.join('\n');
  }

  function buildIntersections() {
    const container = document.createElement('div');
    container.className = 'intersections';
    container.id = 'intersections';

    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const sq = document.createElement('div');
        sq.className = 'square';
        sq.dataset.r = String(r);
        sq.dataset.c = String(c);
        // 先按红方视角摆坐标；flipped 时通过数组索引映射到翻转后的交叉点
        sq.style.left = (c / 8 * 100) + '%';
        sq.style.top = (r / 9 * 100) + '%';
        container.appendChild(sq);
        state.squares.push(sq);
      }
    }

    boardEl.innerHTML = boardSvg();
    boardEl.appendChild(container);
  }

  function displayPosition(r, c) {
    if (state.flipped) {
      return { r: 9 - r, c: 8 - c };
    }
    return { r, c };
  }

  function render() {
    if (!state.board) return;

    // 清空棋盘上的棋子与标记
    for (const sq of state.squares) {
      sq.innerHTML = '';
      sq.classList.remove('selected', 'legal', 'capture', 'last-move');
    }

    // 最后一步高亮
    let lastFrom = null;
    let lastTo = null;
    if (state.history.length > 0) {
      const last = state.history[state.history.length - 1];
      lastFrom = last.move.from;
      lastTo = last.move.to;
    }

    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const piece = state.board[r][c];
        const pos = displayPosition(r, c);
        const idx = pos.r * 9 + pos.c;
        const sq = state.squares[idx];
        const actual = { r, c };

        if ((lastFrom && lastFrom.r === r && lastFrom.c === c) ||
            (lastTo && lastTo.r === r && lastTo.c === c)) {
          sq.classList.add('last-move');
        }

        if (piece) {
          const pieceEl = document.createElement('div');
          pieceEl.className = 'piece ' + (piece.color === XQ.RED ? 'red' : 'black');
          pieceEl.textContent = XQ.pieceName(piece);
          pieceEl.dataset.r = String(r);
          pieceEl.dataset.c = String(c);
          sq.appendChild(pieceEl);
        }

        // 选中高亮
        if (state.selected && state.selected.r === r && state.selected.c === c) {
          sq.classList.add('selected');
        }

        // 合法走法标记
        if (state.selected) {
          const isLegal = state.legalMoves.some(m => m.to.r === r && m.to.c === c);
          if (isLegal) {
            sq.classList.add('legal');
            if (state.board[r][c]) sq.classList.add('capture');
          }
        }
      }
    }

    renderStatus();
  }

  function renderStatus() {
    if (state.gameOver) {
      if (state.reason === 'draw') {
        statusEl.textContent = '和棋：三次重复局面';
      } else {
        const winner = XQ.colorName(state.winner);
        statusEl.textContent = `${winner}胜！${state.reason === 'checkmate' ? '将死' : '困毙'}`;
      }
      return;
    }

    const turnName = XQ.colorName(state.turn);
    let checkText = '';
    if (XQ.isInCheck(state.board, state.turn)) checkText = '（被将军！）';

    if (state.mode === 'aiai') {
      statusEl.textContent = state.paused
        ? `已暂停 · 轮到${turnName}`
        : `AI vs AI · 轮到${turnName}${checkText}`;
    } else {
      if (state.isAiThinking) {
        statusEl.textContent = `AI（${XQ.colorName(XQ.opposite(state.playerColor))}）思考中...`;
      } else if (state.turn === state.playerColor) {
        statusEl.textContent = `轮到你了（${turnName}）${checkText}`;
      } else {
        statusEl.textContent = `AI（${XQ.colorName(state.turn)}）思考中...${checkText}`;
      }
    }
  }

  // ---------- 走子与对局流程 ----------
  function currentKey() {
    return XQ.boardKey(state.board, state.turn);
  }

  function performMove(move) {
    if (state.gameOver) return;

    const moverColor = state.turn;
    const nextBoard = XQ.applyMove(state.board, move);
    const nextTurn = XQ.opposite(moverColor);
    const checkNow = XQ.isInCheck(nextBoard, nextTurn);

    state.board = nextBoard;
    state.turn = nextTurn;
    state.selected = null;
    state.legalMoves = [];

    state.history.push({ move, color: moverColor, check: checkNow });
    appendMoveLog({ move, color: moverColor, check: checkNow });

    // 重复局面检测
    const key = currentKey();
    state.positionCounts.set(key, (state.positionCounts.get(key) || 0) + 1);
    if (state.positionCounts.get(key) >= 3) {
      endGame(null, 'draw', '三次重复局面');
      render();
      return;
    }

    // 判断胜负
    const oppMoves = XQ.generateLegalMoves(state.board, state.turn);
    if (oppMoves.length === 0) {
      const isCheckMate = XQ.isInCheck(state.board, state.turn);
      endGame(moverColor, isCheckMate ? 'checkmate' : 'stalemate', isCheckMate ? '将死' : '困毙');
      render();
      return;
    }

    render();
    scheduleNextAi();
  }

  function endGame(winner, reason, text) {
    state.gameOver = true;
    state.winner = winner;
    state.reason = reason;
    state.selected = null;
    state.legalMoves = [];
    state.paused = true;
    clearTimeout(state.aiTimer);
    if (state.mode === 'aiai') {
      pauseBtn.textContent = '继续';
      pauseBtn.disabled = true;
    }
    statusEl.textContent = winner
      ? `${XQ.colorName(winner)}胜！${text}`
      : `和棋：${text}`;
  }

  function scheduleNextAi() {
    clearTimeout(state.aiTimer);
    if (state.gameOver || state.paused) return;
    if (!isAiTurn()) return;

    const baseDelay = state.mode === 'aiai' ? 450 : 250;
    const depthBonus = state.difficulty === 'hard' ? 150 : 0;
    const delay = baseDelay + depthBonus + Math.random() * 150;

    state.isAiThinking = true;
    renderStatus();
    state.aiTimer = setTimeout(() => {
      if (state.gameOver || state.paused) return;
      if (!isAiTurn()) return;
      const depth = AI.depthForDifficulty(state.difficulty);
      const result = AI.findBestMove(state.board, state.turn, depth);
      state.isAiThinking = false;
      if (!result) {
        // 正常流程不会走到这里，防御性处理
        if (XQ.generateLegalMoves(state.board, state.turn).length === 0) {
          endGame(XQ.opposite(state.turn), 'stalemate', '困毙');
        }
        render();
        return;
      }
      performMove(result.move);
    }, delay);
  }

  function isAiTurn() {
    if (state.mode === 'aiai') return true;
    return state.turn !== state.playerColor;
  }

  function newGame() {
    clearTimeout(state.aiTimer);
    state.board = XQ.initialBoard();
    state.turn = XQ.RED;
    state.selected = null;
    state.legalMoves = [];
    state.history = [];
    state.gameOver = false;
    state.winner = null;
    state.reason = '';
    state.isAiThinking = false;
    state.paused = false;
    state.positionCounts = new Map();
    state.positionCounts.set(currentKey(), 1);

    if (state.mode === 'pvai') {
      if (state.playerColor === null) {
        state.playerColor = Math.random() < 0.5 ? XQ.RED : XQ.BLACK;
      }
      // 执黑时默认把棋盘翻过来；执红不翻转
      state.flipped = state.playerColor === XQ.BLACK;
      playerColorSel.disabled = false;
    } else {
      state.playerColor = null;
      state.flipped = false;
      playerColorSel.disabled = true;
    }

    moveListEl.innerHTML = '<p class="empty-hint">还没有走子记录。</p>';
    pauseBtn.textContent = '暂停';
    pauseBtn.disabled = false;
    updateModeButtons();
    render();
    scheduleNextAi();
  }

  // ---------- 玩家点击 ----------
  function handleSquareClick(e) {
    const sq = e.target.closest('.square');
    if (!sq) return;
    if (state.gameOver || state.mode !== 'pvai' || state.isAiThinking) return;
    if (state.turn !== state.playerColor) return;

    // dataset 中记录的是棋盘物理位置；翻转时需映射回真实坐标
    const dr = parseInt(sq.dataset.r, 10);
    const dc = parseInt(sq.dataset.c, 10);
    const r = state.flipped ? 9 - dr : dr;
    const c = state.flipped ? 8 - dc : dc;
    const piece = state.board[r][c];

    // 已有选中棋子
    if (state.selected) {
      const targetMove = state.legalMoves.find(m => m.to.r === r && m.to.c === c);
      if (targetMove) {
        performMove(targetMove);
        return;
      }
      // 点击己方另一棋子则改选
      if (piece && piece.color === state.playerColor) {
        selectPiece(r, c);
        return;
      }
      // 否则取消选择
      state.selected = null;
      state.legalMoves = [];
      render();
      return;
    }

    // 没有选中，选择己方棋子
    if (piece && piece.color === state.playerColor) {
      selectPiece(r, c);
    }
  }

  function selectPiece(r, c) {
    const moves = XQ.generateLegalMoves(state.board, state.turn);
    state.selected = { r, c };
    state.legalMoves = moves.filter(m => m.from.r === r && m.from.c === c);
    render();
  }

  // ---------- 悔棋 ----------
  function undoMove() {
    if (state.mode !== 'pvai' || state.history.length === 0) return;

    clearTimeout(state.aiTimer);

    // 悔棋：回退到玩家走棋前
    // 若当前轮到玩家，说明 AI 刚走完，需要回退 AI 的一步和玩家的一步。
    let removeCount = 1;
    if (state.turn === state.playerColor && state.history.length >= 2) {
      removeCount = 2;
    } else if (state.turn === state.playerColor && state.history.length === 1) {
      removeCount = 1; // 只有玩家的一步，AI 还没走
    }

    state.history.splice(state.history.length - removeCount, removeCount);

    // 从初始局面重新推演
    state.board = XQ.initialBoard();
    state.turn = XQ.RED;
    state.positionCounts = new Map();
    state.positionCounts.set(currentKey(), 1);
    state.selected = null;
    state.legalMoves = [];
    state.gameOver = false;
    state.winner = null;
    state.reason = '';
    state.isAiThinking = false;
    state.paused = false;

    for (const entry of state.history) {
      state.board = XQ.applyMove(state.board, entry.move);
      state.turn = XQ.opposite(state.turn);
      const key = currentKey();
      state.positionCounts.set(key, (state.positionCounts.get(key) || 0) + 1);
    }

    pauseBtn.textContent = '暂停';
    pauseBtn.disabled = false;
    renderMoveList();
    render();
    scheduleNextAi();
  }

  // ---------- 对局记录 ----------
  function formatMove(entry, index) {
    const { move, color, check } = entry;
    const pieceName = XQ.pieceName(move.piece);
    const capture = move.captured ? ' 吃' + XQ.pieceName(move.captured) : '';
    const checkMark = check ? '！' : '';
    return `${index + 1}. ${XQ.colorName(color)} ${pieceName} (${move.from.r},${move.from.c})→(${move.to.r},${move.to.c})${capture}${checkMark}`;
  }

  function appendMoveLog(entry) {
    if (moveListEl.querySelector('.empty-hint')) {
      moveListEl.innerHTML = '';
    }
    const div = document.createElement('div');
    div.className = 'move-entry';
    div.textContent = formatMove(entry, state.history.length - 1);
    moveListEl.appendChild(div);
    moveListEl.scrollTop = moveListEl.scrollHeight;
  }

  function renderMoveList() {
    moveListEl.innerHTML = '';
    if (state.history.length === 0) {
      moveListEl.innerHTML = '<p class="empty-hint">还没有走子记录。</p>';
      return;
    }
    state.history.forEach((entry, index) => {
      const div = document.createElement('div');
      div.className = 'move-entry';
      div.textContent = formatMove(entry, index);
      moveListEl.appendChild(div);
    });
    moveListEl.scrollTop = moveListEl.scrollHeight;
  }

  // ---------- 模式/控件 ----------
  function updateModeButtons() {
    modePvaiBtn.classList.toggle('active', state.mode === 'pvai');
    modeAiaiBtn.classList.toggle('active', state.mode === 'aiai');
    playerColorSel.classList.toggle('hidden', state.mode === 'aiai');
    pauseBtn.classList.toggle('hidden', state.mode !== 'aiai');
    undoBtn.classList.toggle('hidden', state.mode !== 'pvai');
  }

  function setMode(mode) {
    if (mode === state.mode) return;
    clearTimeout(state.aiTimer);
    state.mode = mode;
    state.playerColor = mode === 'pvai' ? null : null;
    newGame();
  }

  function togglePause() {
    if (state.mode !== 'aiai' || state.gameOver) return;
    state.paused = !state.paused;
    if (state.paused) {
      clearTimeout(state.aiTimer);
      state.isAiThinking = false;
      pauseBtn.textContent = '继续';
    } else {
      pauseBtn.textContent = '暂停';
      scheduleNextAi();
    }
    renderStatus();
  }

  function toggleFlip() {
    state.flipped = !state.flipped;
    // 玩家执黑时自动翻转，手动切换不会改变自动状态
    render();
  }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    boardEl.addEventListener('click', handleSquareClick);

    modePvaiBtn.addEventListener('click', () => setMode('pvai'));
    modeAiaiBtn.addEventListener('click', () => setMode('aiai'));

    playerColorSel.addEventListener('change', () => {
      const val = playerColorSel.value;
      state.playerColor = val === 'random' ? null : val;
      newGame();
    });

    difficultySel.addEventListener('change', () => {
      state.difficulty = difficultySel.value;
      if (state.mode === 'aiai' && !state.gameOver && !state.paused) {
        renderStatus();
      }
      if (state.mode === 'pvai' && state.isAiThinking) {
        // 下一次 AI 走子会使用新难度
      }
    });

    newGameBtn.addEventListener('click', () => {
      if (state.mode === 'pvai' && playerColorSel.value === 'random') {
        state.playerColor = null; // 新对局重新随机
      }
      newGame();
    });

    undoBtn.addEventListener('click', undoMove);
    flipBtn.addEventListener('click', toggleFlip);
    pauseBtn.addEventListener('click', togglePause);
  }

  // ---------- 启动 ----------
  function init() {
    buildIntersections();
    state.difficulty = difficultySel.value;
    bindEvents();
    newGame();
  }

  init();
})();
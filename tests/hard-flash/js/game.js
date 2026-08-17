/* =====================================================================
 * 中国象棋 · 对局控制器 (game.js)
 * 负责：对局状态、着法执行、AI 调度（玩家 vs AI / AI vs AI）、
 * 悔棋、将军/将死/困毙/循环判和/自然限着判定
 * ===================================================================== */
(function (global) {
  'use strict';
  const XQ = (global.XQ = global.XQ || {});
  const R = XQ.rules;
  const AI = XQ.ai;

  const DIFF = {
    easy:   { label: '简单', maxDepth: 1, timeMs: 350,  randomness: 0.65 },
    medium: { label: '中等', maxDepth: 2, timeMs: 900,  randomness: 0.30 },
    hard:   { label: '困难', maxDepth: 3, timeMs: 2000, randomness: 0.12 },
    master: { label: '大师', maxDepth: 5, timeMs: 3800, randomness: 0.05 }
  };

  const SIDE_NAME = { r: '红方', b: '黑方' };
  const SIDE_CHAR = { r: '红', b: '黑' };

  function cloneBoard(b) { return b.slice(); }

  const game = {
    /* state */
    mode: 'pvp',
    settings: {},
    board: null,
    side: 'r',
    history: [],
    snapshots: [],
    captured: { r: [], b: [] },
    halfClock: 0,
    keys: [],
    status: 'playing',
    winner: null,
    reason: null,
    lastMove: null,
    checkSide: null,
    selected: -1,
    targets: [],
    aiThinking: false,
    thinkingSide: null,
    paused: false,
    lastStats: null,
    token: 0,
    onChange: null, // 外部回调：状态变化通知（重绘面板）

    /* ---------------- 初始化 ---------------- */
    newGame(opts) {
      this.mode = opts.mode;
      this.settings = {
        playerSide: opts.playerSide || 'r',
        diff: opts.diff || 'hard',
        diffR: opts.diffR || 'hard',
        diffB: opts.diffB || 'medium',
        speedMs: opts.speedMs || 900
      };
      this.board = R.initialBoard();
      this.side = 'r';
      this.history = [];
      this.snapshots = [cloneBoard(this.board)];
      this.captured = { r: [], b: [] };
      this.halfClock = 0;
      this.keys = [R.boardKey(this.board, 'r')];
      this.status = 'playing';
      this.winner = null;
      this.reason = null;
      this.lastMove = null;
      this.checkSide = null;
      this.selected = -1;
      this.targets = [];
      this.aiThinking = false;
      this.thinkingSide = null;
      this.paused = false;
      this.lastStats = null;
      this.token++;
      this.notify();
    },

    notify() {
      if (this.onChange) this.onChange(this.view());
    },

    view() {
      return {
        mode: this.mode,
        settings: this.settings,
        board: this.board,
        side: this.side,
        status: this.status,
        winner: this.winner,
        reason: this.reason,
        lastMove: this.lastMove,
        checkSide: this.checkSide,
        selected: this.selected,
        targets: this.targets,
        aiThinking: this.aiThinking,
        thinkingSide: this.thinkingSide,
        paused: this.paused,
        history: this.history,
        captured: this.captured,
        lastStats: this.lastStats,
        playerSide: this.settings.playerSide
      };
    },

    /* ---------------- 吃子/状态 ---------------- */
    perform(side, move) {
      const opp = R.other(side);
      const captured = move.captured || null;
      this.history.push({
        move,
        side,
        notation: R.moveNotation(this.board, move, side),
        captured
      });
      if (captured) this.captured[side].push(captured);
      this.halfClock = (captured || move.piece.type === 's') ? 0 : this.halfClock + 1;

      R.applyMove(this.board, move);
      this.snapshots.push(cloneBoard(this.board));
      this.side = opp;
      this.keys.push(R.boardKey(this.board, opp));
      this.lastMove = move;
      this.checkSide = R.inCheck(this.board, opp) ? opp : null;
      this.selected = -1;
      this.targets = [];

      // 音效
      if (captured) XQ.sound.capture();
      else XQ.sound.move();
      if (this.checkSide) XQ.sound.check();

      // 终局判定
      this.checkEnd(side);

      if (XQ.renderer && XQ.renderer.animateMove) XQ.renderer.animateMove(move);
      this.notify();
    },

    checkEnd(justMoved) {
      if (this.status !== 'playing') return;
      const opp = R.other(justMoved);
      if (R.legalMoves(this.board, opp).length === 0) {
        this.status = 'over';
        this.winner = justMoved;
        this.reason = R.inCheck(this.board, opp) ? '将死' : '困毙';
        if (this.mode === 'pvp') {
          XQ.sound[(this.winner === this.settings.playerSide) ? 'win' : 'lose']();
        } else {
          XQ.sound.win();
        }
        return;
      }
      // 循环判和：同一局面（含轮走方）第 3 次出现
      const counts = {};
      for (const k of this.keys) counts[k] = (counts[k] || 0) + 1;
      if (counts[this.keys[this.keys.length - 1]] >= 3) {
        this.status = 'over';
        this.winner = null;
        this.reason = '循环局面，判和';
        XQ.sound.lose();
        return;
      }
      // 自然限着：60 回合（120 手）未吃子且未走兵
      if (this.halfClock >= 120) {
        this.status = 'over';
        this.winner = null;
        this.reason = '自然限着 60 回合，判和';
        XQ.sound.lose();
        return;
      }
    },

    /* ---------------- 玩家交互（PVP） ---------------- */
    playerClick(idx) {
      if (this.mode !== 'pvp') return;
      if (this.status !== 'playing' || this.paused || this.aiThinking) return;
      if (this.side !== this.settings.playerSide) return;

      // 落子
      if (this.selected >= 0 && this.targets.indexOf(idx) >= 0) {
        const b = this.board;
        const move = R.legalMoves(b, this.settings.playerSide)
          .find((m) => m.from === this.selected && m.to === idx);
        if (move) {
          this.perform(this.settings.playerSide, move);
          this.scheduleAI(this.mode === 'pvp' ? 260 : 0);
        } else {
          this.selected = -1;
          this.targets = [];
        }
        this.notify();
        return;
      }
      // 选子
      const p = this.board[idx];
      if (p && p.side === this.settings.playerSide) {
        this.selected = idx;
        this.targets = R.legalMoves(this.board, this.settings.playerSide)
          .filter((m) => m.from === idx)
          .map((m) => m.to);
        XQ.sound.select();
      } else {
        this.selected = -1;
        this.targets = [];
      }
      this.notify();
    },

    /* ---------------- AI 调度 ---------------- */
    cfgFor(side) {
      if (this.mode === 'pvp') return DIFF[this.settings.diff];
      return DIFF[side === 'r' ? this.settings.diffR : this.settings.diffB];
    },

    scheduleAI(delay) {
      if (this.status !== 'playing') return;
      const myToken = ++this.token;
      const aiSide = this.side; // this.side 恒为“下一步轮走方”
      this.aiThinking = true;
      this.thinkingSide = aiSide;
      this.notify();
      setTimeout(() => {
        if (myToken !== this.token || this.status !== 'playing') return;
        if (this.paused) return; // 挂起：恢复时由 togglePause 重新调度
        this.runAIThink(aiSide);
      }, delay);
    },

    runAIThink(aiSide) {
      const res = AI.chooseMove(this.board, aiSide, this.cfgFor(aiSide));
      this.lastStats = res;
      if (res) this.perform(aiSide, res.move);
      this.aiThinking = false;
      this.thinkingSide = null;
      this.notify(); // 清除“思考中”后必须刷新面板（按钮禁用态等）

      if (this.mode === 'aiai' && this.status === 'playing' && !this.paused) {
        this.scheduleAIChain();
      }
    },

    scheduleAIChain() {
      // AI vs AI：每步之间等待 speedMs（暂停由 scheduleAI 内部等待循环处理）
      this.scheduleAI(this.settings.speedMs);
    },

    startAiai() {
      if (this.mode !== 'aiai') return;
      this.token++;
      this.scheduleAI(700);
    },

    /* ---------------- 悔棋 ---------------- */
    undo() {
      if (this.aiThinking) return;
      if (this.history.length === 0) return;
      const n = this.mode === 'pvp' ? Math.min(2, this.history.length) : Math.min(2, this.history.length);
      this.history.length -= n;

      // 从初始局面重放，重建完整状态
      const b = R.initialBoard();
      this.captured = { r: [], b: [] };
      this.halfClock = 0;
      let last = null;
      for (const entry of this.history) {
        if (entry.captured) this.captured[entry.side].push(entry.captured);
        if (entry.captured || entry.move.piece.type === 's') this.halfClock = 0;
        else this.halfClock++;
        R.applyMove(b, entry.move);
        last = entry;
      }
      this.board = b;
      this.side = last ? R.other(last.side) : 'r';
      this.lastMove = last ? last.move : null;
      this.status = 'playing';
      this.winner = null;
      this.reason = null;
      this.selected = -1;
      this.targets = [];
      this.aiThinking = false;
      this.thinkingSide = null;

      // 重建局面指纹（用重放后的 board 与 remaining history 计算）
      this.keys = [];
      let s = 'r';
      this.keys.push(R.boardKey(b, 'r')); // 初始局面由 history 决定——下面重放累计
      // 上面一行冗余，直接重放生成：
      this.keys = [];
      const tmp = R.initialBoard();
      s = 'r';
      this.keys.push(R.boardKey(tmp, s));
      for (const entry of this.history) {
        R.applyMove(tmp, entry.move);
        s = R.other(s);
        this.keys.push(R.boardKey(tmp, s));
      }
      this.checkSide = last ? (R.inCheck(this.board, R.other(last.side)) ? R.other(last.side) : null) : null;
      this.token++;
      this.notify();

      // 玩家执黑且悔到红方回合时，自动让 AI 继续
      if (this.mode === 'pvp' && this.status === 'playing' && this.side !== this.settings.playerSide) {
        this.scheduleAI(500);
      }
      // AI vs AI 悔棋后回合链已取消，续上观战
      if (this.mode === 'aiai' && this.status === 'playing') {
        this.scheduleAI(this.settings.speedMs);
      }
    },

    /* ---------------- 其它控制 ---------------- */
    resign() {
      if (this.mode !== 'pvp' || this.status !== 'playing') return;
      this.status = 'over';
      this.winner = R.other(this.settings.playerSide);
      this.reason = '认输';
      this.token++;
      XQ.sound.lose();
      this.notify();
    },

    togglePause() {
      this.paused = !this.paused;
      // 恢复时重新调度回合链（暂停期间被丢弃的定时器由此补上）
      if (!this.paused && this.status === 'playing' && !this.aiThinking) {
        if (this.mode === 'aiai') this.scheduleAIChain();
        else if (this.side !== this.settings.playerSide) this.scheduleAI(500);
      }
      this.notify();
    }
  };

  XQ.game = game;
  XQ.game.DIFF = DIFF;
  XQ.game.SIDE_NAME = SIDE_NAME;
  XQ.game.SIDE_CHAR = SIDE_CHAR;
})(typeof window !== 'undefined' ? window : globalThis);
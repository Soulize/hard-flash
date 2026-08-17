/* =====================================================================
 * 中国象棋 · 渲染器 (renderer.js)
 * Canvas 绘制：木纹棋盘（在线纹理 + 程序化木纹降级）、立体棋子、
 * 选中/落点/将军/上一步高亮、走子动画
 * ===================================================================== */
(function (global) {
  'use strict';
  const XQ = (global.XQ = global.XQ || {});
  const R = XQ.rules;

  const CELL = 64;
  const PAD_X = 44, PAD_T = 44, PAD_B = 44;
  const W = PAD_X * 2 + 8 * CELL;          // 600
  const H = PAD_T + 9 * CELL + PAD_B;      // 664
  const px = (x) => PAD_X + x * CELL;
  const py = (y) => PAD_T + y * CELL;
  const PIECE_R = 27;

  /* 确定性随机数（程序化木纹用，保证每次观感稳定） */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const renderer = {
    canvas: null, ctx: null,
    staticCv: null,
    hover: -1,
    anim: null,       // {fx,fy,tx,ty,side,type,start,dur}
    dpr: 1,

    init(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = W * this.dpr;
      canvas.height = H * this.dpr;
      this.renderStatic();
      XQ.texture.init().then(() => this.renderStatic());
    },

    /* ---------------- 静态层：棋盘底纹 + 网格 ---------------- */
    renderStatic() {
      const cv = document.createElement('canvas');
      cv.width = W * this.dpr;
      cv.height = H * this.dpr;
      const c = cv.getContext('2d');
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.drawWood(c);
      this.drawGrid(c);
      this.staticCv = cv;
    },

    drawWood(c) {
      const img = XQ.texture.boardImg;
      if (img) {
        const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
        c.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      }
      // 程序化木纹（总是叠加一层，统一色调）
      const rng = mulberry32(0x5EED2024);
      const base = c.createLinearGradient(0, 0, W, H);
      base.addColorStop(0, 'rgba(178,124,66,0.92)');
      base.addColorStop(0.5, 'rgba(170,116,58,0.92)');
      base.addColorStop(1, 'rgba(150,96,44,0.95)');
      c.fillStyle = base;
      c.fillRect(0, 0, W, H);

      // 竖向木纹
      c.lineCap = 'round';
      for (let i = 0; i < 52; i++) {
        const x0 = rng() * W;
        const sway = (rng() - 0.5) * 70;
        c.strokeStyle = `rgba(${104 + (rng() * 48) | 0},${70 + (rng() * 34) | 0},${30},${0.04 + rng() * 0.10})`;
        c.lineWidth = 0.6 + rng() * 2.4;
        c.beginPath();
        c.moveTo(x0, -20);
        c.bezierCurveTo(x0 + sway, H * 0.33, x0 - sway, H * 0.67, x0 + (rng() - 0.5) * 44, H + 20);
        c.stroke();
      }
      // 横向细纹
      for (let i = 0; i < 90; i++) {
        const y0 = rng() * H;
        const x0 = rng() * W;
        c.strokeStyle = `rgba(120,82,40,${0.03 + rng() * 0.06})`;
        c.lineWidth = 0.5 + rng() * 1.2;
        c.beginPath();
        c.moveTo(x0, y0);
        c.quadraticCurveTo(x0 + 30, y0 - 8 + rng() * 16, x0 + 90 + rng() * 80, y0);
        c.stroke();
      }
      // 树节
      for (let i = 0; i < 3; i++) {
        const kx = 60 + rng() * (W - 120), ky = 60 + rng() * (H - 120);
        for (let s = 6; s >= 1; s--) {
          c.strokeStyle = `rgba(96,60,26,${0.10 + s * 0.03})`;
          c.lineWidth = 1.2;
          c.beginPath();
          c.ellipse(kx, ky, s * 3.2, s * 2.2, rng() * 1.2, 0, Math.PI * 2);
          c.stroke();
        }
      }
      // 柔和渐晕，聚焦棋盘
      const vig = c.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.72);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(40,20,5,0.30)');
      c.fillStyle = vig;
      c.fillRect(0, 0, W, H);

      // 外框阴影
      c.shadowColor = 'rgba(0,0,0,0.4)';
      c.shadowBlur = 14;
      c.strokeStyle = 'rgba(64,36,14,0.9)';
      c.lineWidth = 4;
      c.strokeRect(PAD_X - 10, PAD_T - 10, 8 * CELL + 20, 9 * CELL + 20);
      c.shadowColor = 'transparent';
    },

    drawGrid(c) {
      const line = 'rgba(58,34,14,0.95)';
      c.strokeStyle = line;
      c.lineWidth = 1.4;

      // 竖线：边路被“楚河汉界”断开
      for (let x = 0; x < 9; x++) {
        c.beginPath();
        if (x === 0 || x === 8) {
          c.moveTo(px(x), py(0)); c.lineTo(px(x), py(4));
          c.moveTo(px(x), py(5)); c.lineTo(px(x), py(9));
        } else {
          c.moveTo(px(x), py(0)); c.lineTo(px(x), py(9));
        }
        c.stroke();
      }
      // 横线
      for (let y = 0; y < 10; y++) {
        c.beginPath();
        c.moveTo(px(0), py(y)); c.lineTo(px(8), py(y));
        c.stroke();
      }
      // 外边框加粗
      c.lineWidth = 3.2;
      c.strokeRect(px(0), py(0), 8 * CELL, 9 * CELL);

      // 九宫斜线
      c.lineWidth = 1.4;
      const diag = (x1, y1, x2, y2) => {
        c.beginPath(); c.moveTo(px(x1), py(y1)); c.lineTo(px(x2), py(y2)); c.stroke();
      };
      diag(3, 7, 5, 9); diag(5, 7, 3, 9);
      diag(3, 0, 5, 2); diag(5, 0, 3, 2);

      // 兵/炮位标记
      const markDiamond = (x, y) => {
        c.beginPath();
        c.moveTo(px(x), py(y) - 8); c.lineTo(px(x) + 8, py(y));
        c.lineTo(px(x), py(y) + 8); c.lineTo(px(x) - 8, py(y));
        c.closePath(); c.stroke();
      };
      const markSquare = (x, y) => {
        c.strokeRect(px(x) - 6.5, py(y) - 6.5, 13, 13);
        c.beginPath();
        c.moveTo(px(x) - 6.5, py(y) - 6.5); c.lineTo(px(x) + 6.5, py(y) + 6.5);
        c.moveTo(px(x) + 6.5, py(y) - 6.5); c.lineTo(px(x) - 6.5, py(y) + 6.5);
        c.stroke();
      };
      for (const x of [0, 2, 4, 6, 8]) { markDiamond(x, 3); markDiamond(x, 6); }
      for (const [x, y] of [[1, 2], [7, 2], [1, 7], [7, 7]]) markSquare(x, y);

      // 楚河 · 汉界
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const riverY = py(4) + CELL / 2;
      c.font = 'bold 40px "KaiTi","STKaiti","Noto Serif CJK SC","SimSun",serif';
      c.fillStyle = 'rgba(92,56,24,0.85)';
      c.shadowColor = 'rgba(255,235,200,0.35)';
      c.shadowBlur = 4;
      c.fillText('楚 河', px(2) - 2, riverY + 2);
      c.fillText('漢 界', px(6) + 2, riverY + 2);
      c.shadowColor = 'transparent';
      c.font = '10px sans-serif';
      c.fillStyle = 'rgba(92,56,24,0.5)';
    },

    /* ---------------- 动态层 ---------------- */
    drawPiece(c, cx, cy, side, type, opts) {
      const o = opts || {};
      const r = PIECE_R * (o.scale || 1);
      c.save();
      // 落影
      c.shadowColor = 'rgba(20,10,2,0.45)';
      c.shadowBlur = 7;
      c.shadowOffsetY = 3;
      const g = c.createRadialGradient(cx - 7, cy - 8, 3, cx, cy, r);
      if (side === 'r') {
        g.addColorStop(0, '#f6dfac');
        g.addColorStop(0.55, '#e2b46e');
        g.addColorStop(1, '#b67e3d');
      } else {
        g.addColorStop(0, '#f1ecdf');
        g.addColorStop(0.55, '#d9d0be');
        g.addColorStop(1, '#a2957c');
      }
      c.fillStyle = g;
      c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
      c.shadowColor = 'transparent';

      // 外圈
      c.lineWidth = 2;
      c.strokeStyle = 'rgba(62,36,14,0.9)';
      c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
      // 内嵌圈
      c.lineWidth = 1.2;
      c.strokeStyle = 'rgba(62,36,14,0.42)';
      c.beginPath(); c.arc(cx, cy, r - 5, 0, Math.PI * 2); c.stroke();
      // 釉面高光
      c.lineWidth = 2.6;
      c.strokeStyle = 'rgba(255,255,255,0.4)';
      c.beginPath();
      c.arc(cx, cy, r - 2.5, -Math.PI * 0.88, -Math.PI * 0.18);
      c.stroke();

      // 棋子文字
      const ch = R.PIECE_CHAR[side][type];
      c.fillStyle = side === 'r' ? '#b22318' : '#231b10';
      c.font = 'bold 33px "KaiTi","STKaiti","Noto Serif CJK SC","Noto Serif SC","SimSun",serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(ch, cx, cy + 1);

      // 选中高亮
      if (o.selected) {
        c.strokeStyle = 'rgba(255,220,110,0.95)';
        c.lineWidth = 3;
        c.beginPath(); c.arc(cx, cy, r + 3.5, 0, Math.PI * 2); c.stroke();
      }
      if (o.dimmed) {
        c.fillStyle = 'rgba(40,24,8,0.35)';
        c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
      }
      c.restore();
    },

    draw(state, now) {
      const c = this.ctx;
      if (!c) return;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      if (this.staticCv) c.drawImage(this.staticCv, 0, 0, W, H);

      const board = state.board;
      const t = now || performance.now();

      // 上一步高亮
      if (state.lastMove) {
        c.fillStyle = 'rgba(255,196,87,0.30)';
        this.cellFill(c, state.lastMove.from);
        this.cellFill(c, state.lastMove.to);
        c.fillStyle = 'rgba(255,196,87,0.55)';
        c.strokeStyle = 'rgba(255,180,60,0.6)';
        c.lineWidth = 1.2;
        this.cellStroke(c, state.lastMove.to);
      }

      // 将军：将帅脉冲红圈
      if (state.checkSide) {
        const g = R.findGeneral(board, state.checkSide);
        if (g >= 0) {
          const pulse = 3 + Math.sin(t / 130) * 2;
          c.strokeStyle = 'rgba(220,40,30,0.85)';
          c.lineWidth = 3;
          c.beginPath();
          c.arc(px(R.xOf(g)), py(R.yOf(g)), PIECE_R + 4 + pulse, 0, Math.PI * 2);
          c.stroke();
        }
      }

      // 合法落点标记
      const tgtSet = new Set(state.targets || []);
      for (const ti of tgtSet) {
        const isCap = !!board[ti];
        if (isCap) {
          c.strokeStyle = 'rgba(226,60,44,0.92)';
          c.lineWidth = 2.6;
          c.beginPath();
          c.arc(px(R.xOf(ti)), py(R.yOf(ti)), PIECE_R + 3, 0, Math.PI * 2);
          c.stroke();
          c.fillStyle = 'rgba(226,60,44,0.28)';
          this.cellFill(c, ti);
        } else {
          c.fillStyle = 'rgba(64,180,90,0.9)';
          c.beginPath();
          c.arc(px(R.xOf(ti)), py(R.yOf(ti)), 7, 0, Math.PI * 2);
          c.fill();
        }
      }

      // 棋子
      let animFromTo = -1;
      if (this.anim && this.anim.active) {
        animFromTo = this.anim.to;
      }
      for (let i = 0; i < 90; i++) {
        if (i === animFromTo && this.anim && this.anim.active) continue; // 动画中的棋子稍后画
        const p = board[i];
        if (!p) continue;
        const selected = state.selected === i;
        this.drawPiece(c, px(R.xOf(i)), py(R.yOf(i)), p.side, p.type, {
          selected,
          scale: selected ? 1.05 : 1
        });
      }

      // 走子动画
      if (this.anim && this.anim.active) {
        const a = this.anim;
        const k = Math.min(1, (t - a.start) / a.dur);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // easeInOutQuad
        const ax = px(a.fx) + (px(a.tx) - px(a.fx)) * e;
        const ay = py(a.fy) + (py(a.ty) - py(a.fy)) * e;
        c.fillStyle = 'rgba(255,255,255,0.5)';
        this.drawPiece(c, ax, ay, a.side, a.type, { scale: 1 });
        if (k >= 1) this.anim = { active: false };
      }

      // 悬停提示
      if (this.hover >= 0 && state.hoverable && this.hover !== state.selected) {
        c.strokeStyle = 'rgba(255,255,255,0.55)';
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(px(R.xOf(this.hover)), py(R.yOf(this.hover)), PIECE_R + 2.5, 0, Math.PI * 2);
        c.stroke();
      }
    },

    cellFill(c, i) {
      const x = R.xOf(i), y = R.yOf(i);
      c.fillRect(px(x) - CELL / 2 + 4, py(y) - CELL / 2 + 4, CELL - 8, CELL - 8);
    },
    cellStroke(c, i) {
      const x = R.xOf(i), y = R.yOf(i);
      c.strokeRect(px(x) - CELL / 2 + 4, py(y) - CELL / 2 + 4, CELL - 8, CELL - 8);
    },

    /** 触发走子动画（fx,fy -> tx,ty） */
    animateMove(move) {
      const p = move.piece;
      this.anim = {
        active: true,
        fx: R.xOf(move.from), fy: R.yOf(move.from),
        tx: R.xOf(move.to), ty: R.yOf(move.to),
        side: p.side, type: p.type,
        start: performance.now(),
        dur: 170
      };
    },

    /** 事件坐标 -> 落点索引 */
    pointAt(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      const mx = ((clientX - rect.left) / rect.width) * W;
      const my = ((clientY - rect.top) / rect.height) * H;
      const ix = Math.round((mx - PAD_X) / CELL);
      const iy = Math.round((my - PAD_T) / CELL);
      if (ix < 0 || ix > 8 || iy < 0 || iy > 9) return -1;
      const d = Math.hypot(mx - px(ix), my - py(iy));
      return d <= 32 ? R.idx(ix, iy) : -1;
    },

    setHover(clientX, clientY) {
      this.hover = this.pointAt(clientX, clientY);
    }
  };

  renderer.W = W;
  renderer.H = H;
  XQ.renderer = renderer;
})(typeof window !== 'undefined' ? window : globalThis);
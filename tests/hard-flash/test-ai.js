/* AI 引擎测试 (Node) */
const path = require('path');
require(path.join(__dirname, 'js', 'rules.js'));
require(path.join(__dirname, 'js', 'ai.js'));
const XQ = globalThis.XQ;
const R = XQ.rules;
const AI = XQ.ai;

let failed = 0;
function assert(cond, msg) {
  if (!cond) { failed++; console.error('  ✗ FAIL:', msg); }
  else console.log('  ✓', msg);
}
function boardFromSpec(spec) {
  const b = new Array(90).fill(null);
  for (const [s, t, x, y] of spec) b[R.idx(x, y)] = { side: s, type: t };
  return b;
}

// 1) 一步杀：红车(3,5)(5,5)封住逃路，红车(0,3)可平 4 路一步将死；黑将未被将军，局面合法
{
  const b = boardFromSpec([
    ['b', 'g', 4, 0], ['r', 'r', 3, 5], ['r', 'r', 5, 5], ['r', 'r', 0, 3],
    ['r', 'g', 4, 9], ['r', 's', 4, 5]
  ]);
  assert(!R.inCheck(b, 'b'), '测试前提：黑方不应处于将军');
  const res = AI.chooseMove(b, 'r', { maxDepth: 2, timeMs: 0, randomness: 0 });
  assert(res && res.move.from === R.idx(0, 3) && res.move.to === R.idx(4, 3),
    'AI 应找到一步杀 (0,3)->(4,3)，实际 ' + (res && res.move ? `(${R.xOf(res.move.from)},${R.yOf(res.move.from)})->(${R.xOf(res.move.to)},${R.yOf(res.move.to)})` : 'null'));
  assert(res.score > 999000, '一步杀评分应接近 MATE，实际 ' + res.score);
}

// 2) 不求胜不送子：黑车 (0,2) 威胁红车 (0,4)。红先的最优解是直接吃黑车或逃到安全处
{
  // 黑车 (0,2) 可吃红车 (0,4)；红先，红车应吃黑车或离开黑车攻击范围
  const b = boardFromSpec([
    ['r', 'r', 0, 4], ['b', 'r', 0, 2], ['r', 'g', 4, 9], ['b', 'g', 4, 0], ['r', 's', 4, 5]
  ]);
  const res = AI.chooseMove(b, 'r', { maxDepth: 3, timeMs: 0, randomness: 0 });
  const fx = R.xOf(res.move.from), fy = R.yOf(res.move.from);
  const tx = R.xOf(res.move.to), ty = R.yOf(res.move.to);
  console.log(`  AI 红车走法: (${fx},${fy})->(${tx},${ty})`);
  assert(res.move.from === R.idx(0, 4), '红应先动车');
  const capturedBlackRook = res.move.to === R.idx(0, 2);
  const safeOffFile = tx !== 0 && ty !== 2; // 不在黑车攻击线上
  assert(capturedBlackRook || safeOffFile, `红车应吃黑车或逃到安全处，实际走到 (${tx},${ty})`);
}

// 3) 对弈冒烟：AI vs AI 快速自对弈 60 步不崩溃、有限步内分胜负或和
{
  const b = R.initialBoard();
  let side = 'r', moves = 0;
  const seen = new Map();
  let outcome = 'playing';
  while (moves < 120) {
    const key = R.boardKey(b, side);
    seen.set(key, (seen.get(key) || 0) + 1);
    if (seen.get(key) >= 3) { outcome = 'repetition draw'; break; }
    const res = AI.chooseMove(b, side, { maxDepth: 1, timeMs: 0, randomness: 0.3 });
    if (!res) { outcome = R.inCheck(b, side) ? 'mate' : 'stalemate'; break; }
    R.applyMove(b, res.move);
    moves++;
    side = R.other(side);
  }
  console.log(`  AI 自对弈 ${moves} 手后结局: ${outcome}`);
  assert(outcome !== 'playing' || moves === 120, '自对弈应能推进（不限时限）');
  // 校验终局局面合法性：双方将军均不存在
  const gR = R.findGeneral(b, 'r'), gB = R.findGeneral(b, 'b');
  assert(gR >= 0 && gB >= 0, '双方将军都应存活');
}

// 4) 性能：初始局面 hard 深度 3 一次走棋耗时
{
  const b = R.initialBoard();
  const t0 = Date.now();
  const res = AI.chooseMove(b, 'r', { maxDepth: 3, timeMs: 2000, randomness: 0.1 });
  const dt = Date.now() - t0;
  console.log(`  hard(深度3,限2s) 首步耗时 ${dt}ms，深度 ${res ? res.depth : '-'}，节点 ${res ? res.nodes : '-'}`);
  assert(res && res.move, 'AI 应能走出首步');
  assert(dt < 2500, '首步搜索应在时限内完成，实际 ' + dt + 'ms');
  // 首步应有人马动静而非自送将
  const mv = res.move;
  const legal = R.legalMoves(b, 'r').some(m => m.from === mv.from && m.to === mv.to);
  assert(legal, 'AI 首步应为合法着法');
}

// 5) 深度 4 性能抽查（master 级别，限 4s）
{
  const b = R.initialBoard();
  const t0 = Date.now();
  const res = AI.chooseMove(b, 'r', { maxDepth: 4, timeMs: 4000, randomness: 0.05 });
  const dt = Date.now() - t0;
  console.log(`  master(深度4,限4s) 首步耗时 ${dt}ms，深度 ${res ? res.depth : '-'}，节点 ${res ? res.nodes : '-'}`);
  assert(res && res.move, 'master 应能走出首步');
}

console.log(failed === 0 ? '\n全部 AI 测试通过 ✔' : `\n${failed} 项测试失败 ✘`);
process.exit(failed === 0 ? 0 : 1);
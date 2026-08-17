/* 规则引擎单元测试 (Node) */
const path = require('path');
require(path.join(__dirname, 'js', 'rules.js'));
const XQ = globalThis.XQ;
const R = XQ.rules;

let failed = 0;
function assert(cond, msg) {
  if (!cond) { failed++; console.error('  ✗ FAIL:', msg); }
  else console.log('  ✓', msg);
}
function boardFromSpec(spec) {
  // spec: 数组，每项 [side,type,x,y]
  const b = new Array(90).fill(null);
  for (const [s, t, x, y] of spec) b[R.idx(x, y)] = { side: s, type: t };
  return b;
}

// 初始局势红方第1手着法数（权威值 44）
{
  const b = R.initialBoard();
  const mv = R.legalMoves(b, 'r');
  const byType = {};
  for (const m of mv) byType[m.piece.type] = (byType[m.piece.type] || 0) + 1;
  console.log('  red first moves total =', mv.length, JSON.stringify(byType));
  assert(mv.length === 44, '红方首步应有 44 种着法，实际 ' + mv.length);
  // 黑方对称
  const mvB = R.legalMoves(b, 'b');
  assert(mvB.length === 44, '黑方首步应有 44 种着法，实际 ' + mvB.length);
}

// 马腿
{
  const b = R.initialBoard();
  // 红马 (7,9) 被象(6,9)挡住向左 => 不可到 (5,8)；可到 (6,7)/(8,7)
  const mvs = R.legalMoves(b, 'r').filter(m => m.from === R.idx(7, 9));
  const tos = mvs.map(m => m.to).sort();
  assert(tos.includes(R.idx(6, 7)) && tos.includes(R.idx(8, 7)), '红马(7,9)应可至(6,7)(8,7)，实际 ' + tos.map(t => `(${R.xOf(t)},${R.yOf(t)})`));
  assert(!tos.includes(R.idx(5, 8)), '红马(7,9)不能跳到(5,8)（被象塞腿）');
}

// 象眼 & 不过河
{
  const b = R.initialBoard();
  const mvs = R.legalMoves(b, 'r').filter(m => m.piece.type === 'e');
  const tos = mvs.map(m => m.to).sort();
  assert(tos.includes(R.idx(4, 7)) && tos.includes(R.idx(0, 7)), '红相可至(4,7)(0,7)');
  for (const t of tos) assert(R.yOf(t) >= 5, '红相不能过河');
}

// 炮的隔子打与空走
{
  // 红炮 (3,5)，黑马 (3,1)，中间 (3,3) 黑卒为炮架；(4,5) 红卒用于隔断番将
  const b = boardFromSpec([
    ['r', 'c', 3, 5], ['b', 's', 3, 3], ['b', 'h', 3, 1],
    ['r', 'g', 4, 9], ['b', 'g', 4, 0], ['r', 's', 4, 5]
  ]);
  const mvs = R.legalMoves(b, 'r').filter(m => m.from === R.idx(3, 5));
  const cap = mvs.find(m => R.xOf(m.to) === 3 && R.yOf(m.to) === 1);
  assert(!!cap && cap.captured.type === 'h', '炮应能隔卒吃马');
  const passthrough = mvs.some(m => R.yOf(m.to) === 2);
  assert(!passthrough, '炮不能越过炮架空走');
  const emptyAdj = mvs.some(m => R.yOf(m.to) === 4);
  assert(emptyAdj, '炮可空走一步');
}

// 番将：将帅对视时，车走离4路即非法（帅/将自身离开4路是合法逃生）
{
  const b = boardFromSpec([
    ['r', 'g', 4, 9], ['b', 'g', 4, 0], ['r', 'r', 4, 5]
  ]);
  const mvs = R.legalMoves(b, 'r');
  const rookMoves = mvs.filter(m => m.piece.type === 'r');
  for (const m of rookMoves) {
    assert(R.xOf(m.to) === 4, `红车离开4路(→${R.xOf(m.to)},${R.yOf(m.to)})应非法`);
  }
  assert(rookMoves.some(m => R.xOf(m.to) === 4), '红车在4路上移动应合法');
  assert(mvs.some(m => m.piece.type === 'g' && R.xOf(m.to) !== 4), '红帅离开4路逃生应合法');
}

// 杀局判定：黑将 (4,0)，红车 (4,2) 与 (0,0) => 黑无合法着法
{
  const b = boardFromSpec([
    ['b', 'g', 4, 0], ['r', 'r', 4, 2], ['r', 'r', 0, 0]
  ]);
  const mvB = R.legalMoves(b, 'b');
  assert(R.inCheck(b, 'b'), '黑将应处于将军');
  assert(mvB.length === 0, '黑方应无着法（绝杀），实际 ' + mvB.length);
}

// 简单局面：红车(4,2)与(0,0)绝杀黑将(4,0)，(4,2)同时阻断番将
{
  const b = boardFromSpec([
    ['b', 'g', 4, 0], ['r', 'r', 4, 2], ['r', 'r', 0, 0], ['r', 'g', 4, 9]
  ]);
  const mvB = R.legalMoves(b, 'b');
  assert(R.inCheck(b, 'b'), '黑将应处于将军');
  assert(mvB.length === 0, '黑方应被绝杀，实际 ' + mvB.length);
}

// 记谱
{
  const b = R.initialBoard();
  // 红炮八平五：(1,7)->(4,7)
  const mv = { from: R.idx(1, 7), to: R.idx(4, 7), piece: { side: 'r', type: 'c' } };
  assert(R.moveNotation(b, mv, 'r') === '炮八平五', '记谱应为 炮八平五，实际 ' + R.moveNotation(b, mv, 'r'));
  // 黑马8进7：(7,0)->(6,2)
  const mv2 = { from: R.idx(7, 0), to: R.idx(6, 2), piece: { side: 'b', type: 'h' } };
  assert(R.moveNotation(b, mv2, 'b') === '馬8进7', '记谱应为 馬8进7，实际 ' + R.moveNotation(b, mv2, 'b'));
  // 红马二进三：(7,9)->(6,7)
  const mv3 = { from: R.idx(7, 9), to: R.idx(6, 7), piece: { side: 'r', type: 'h' } };
  assert(R.moveNotation(b, mv3, 'r') === '傌二进三', '记谱应为 傌二进三，实际 ' + R.moveNotation(b, mv3, 'r'));
  // 红兵三进一：(6,6)->(6,5)
  const mv4 = { from: R.idx(6, 6), to: R.idx(6, 5), piece: { side: 'r', type: 's' } };
  assert(R.moveNotation(b, mv4, 'r') === '兵三进一', '记谱应为 兵三进一，实际 ' + R.moveNotation(b, mv4, 'r'));
  // 红兵七进一：(2,6)->(2,5)
  const mv5 = { from: R.idx(2, 6), to: R.idx(2, 5), piece: { side: 'r', type: 's' } };
  assert(R.moveNotation(b, mv5, 'r') === '兵七进一', '记谱应为 兵七进一，实际 ' + R.moveNotation(b, mv5, 'r'));
  // 红车二进六：(7,9)->(7,3) 过河车
  const mv6 = { from: R.idx(7, 9), to: R.idx(7, 3), piece: { side: 'r', type: 'r' } };
  assert(R.moveNotation(b, mv6, 'r') === '俥二进六', '记谱应为 俥二进六，实际 ' + R.moveNotation(b, mv6, 'r'));
}

// boardKey 稳定性
{
  const b = R.initialBoard();
  const k1 = R.boardKey(b, 'r');
  const k2 = R.boardKey(b, 'r');
  assert(k1 === k2, 'boardKey 应稳定');
}

console.log(failed === 0 ? '\n全部规则测试通过 ✔' : `\n${failed} 项测试失败 ✘`);
process.exit(failed === 0 ? 0 : 1);
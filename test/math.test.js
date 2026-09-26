/**
 * math.test.js —— CRT / BigInt 核心算法的零依赖断言测试
 * 运行：npm test
 */

import assert from 'node:assert/strict';
import {
  bigMod,
  bigGcd,
  bigLcm,
  isCompatible,
  mergeCongruence,
  solve,
  positionsWithinCloth,
  suggestOffsetFixes,
  mergeForbiddenRanges,
  countPointsInRange,
  positionsAvoidingRanges,
  locateNthUsablePosition,
} from '../lib/crt.js';
import { locateBody } from '../lib/solver.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const r = (perimeter, offset) => ({ perimeter: BigInt(perimeter), offset: BigInt(offset) });

test('bigMod 非负取模', () => {
  assert.equal(bigMod(-10n, 6n), 2n);
  assert.equal(bigMod(10n, 6n), 4n);
  assert.equal(bigMod(0n, 7n), 0n);
});

test('gcd / lcm', () => {
  assert.equal(bigGcd(640n, 800n), 160n);
  assert.equal(bigLcm(640n, 800n), 3200n);
  assert.equal(bigLcm(6n, 10n), 30n);
});

test('相容性判定：偏移差必须被 gcd 整除', () => {
  assert.equal(isCompatible(2n, 6n, 4n, 8n), true);   // gcd=2, diff=-2
  assert.equal(isCompatible(0n, 6n, 3n, 4n), false);  // gcd(6,4)=2 不整除 -3
});

test('合并同余 x≡2(mod 6), x≡4(mod 8) => x≡20(mod 24)', () => {
  const m = mergeCongruence(2n, 6n, 4n, 8n);
  assert.equal(m.a, 20n);
  assert.equal(m.m, 24n);
  // 20 同时满足两式：20%6=2，20%8=4
  assert.equal(20n % 6n, 2n);
  assert.equal(20n % 8n, 4n);
});

test('经典 CRT：互质模数', () => {
  const out = solve([r(3, 2), r(5, 3), r(7, 2)]);
  assert.equal(out.solvable, true);
  assert.equal(out.firstPosition, 23n);
  assert.equal(out.period, 105n);
});

test('偏移全 0：首次位置 0，周期为 LCM', () => {
  const out = solve([r(640, 0), r(800, 0), r(900, 0)]);
  assert.equal(out.solvable, true);
  assert.equal(out.firstPosition, 0n);
  assert.equal(out.period, bigLcm(bigLcm(640n, 800n), 900n));
  assert.equal(out.period, 28800n);
});

test('无解：返回一对互不相容色筒及证据', () => {
  const out = solve([r(6, 0), r(4, 3), r(9, 5)]);
  assert.equal(out.solvable, false);
  assert.equal(out.conflict.i, 0);
  assert.equal(out.conflict.j, 1);
  assert.equal(out.conflict.gcd, 2n);
});

test('三个色筒的相容解：x≡1(mod 6), x≡4(mod 9), x≡7(mod 15)', () => {
  const out = solve([r(6, 1), r(9, 4), r(15, 7)]);
  assert.equal(out.solvable, true);
  // 解 x≡? (mod 90)，校验 x=22: 22%6=4 ≠1；实际最小解需满足：
  // x≡1 mod6, x≡4 mod9 -> gcd3 |3，合并得 x≡13 mod18；
  // 与 x≡7 mod15：gcd(18,15)=3，13-7=6 可整除 => x≡67 mod90
  assert.equal(out.firstPosition, 67n);
  assert.equal(out.period, 90n);
});

test('超大整数：超过 Number.MAX_SAFE_INTEGER', () => {
  // 两个 ~30 位的“近似质数级”周长，偏移全 0，周期 = 乘积
  const p1 = 123456789012345678901234567891n;
  const p2 = 987654321098765432109876543211n;
  const out = solve([r(p1, 0n), r(p2, 0n)]);
  assert.equal(out.solvable, true);
  assert.equal(out.firstPosition, 0n);
  assert.equal(out.period, p1 * p2);
  // 结果远超 2^53，仍精确
  assert.ok(out.period > BigInt(Number.MAX_SAFE_INTEGER));
});

test('超大整数：非零偏移的广义 CRT', () => {
  // 构造解 X，令 p1=大质数A，p2=大质数B，偏移 = X mod p
  const p1 = 1000000007n; // 质数
  const p2 = 1000000009n; // 质数
  const X = 9007199254740993n; // 2^53+1，超出安全整数
  const a1 = X % p1;
  const a2 = X % p2;
  const out = solve([r(p1, a1), r(p2, a2)]);
  assert.equal(out.solvable, true);
  assert.equal(out.firstPosition, X);
  assert.equal(out.period, p1 * p2);
});

test('positionsWithinCloth：分页与总数', () => {
  // first=10, period=24，布长 100：10,34,58,82 -> 4 个
  const out = positionsWithinCloth(10n, 24n, 100n, 20);
  assert.deepEqual(out.positions, [10n, 34n, 58n, 82n]);
  assert.equal(out.total, 4n);

  // limit=2 时只取前两个，但 total 不变
  const out2 = positionsWithinCloth(10n, 24n, 100n, 2);
  assert.deepEqual(out2.positions, [10n, 34n]);
  assert.equal(out2.total, 4n);

  // 首次对花已超过布长
  const out3 = positionsWithinCloth(200n, 24n, 100n, 20);
  assert.deepEqual(out3.positions, []);
  assert.equal(out3.total, 0n);

  // 布长恰好等于某个对花点（端点包含）
  const out4 = positionsWithinCloth(0n, 100n, 250n, 20);
  assert.deepEqual(out4.positions, [0n, 100n, 200n]);
  assert.equal(out4.total, 3n);
});

test('修正建议：两色筒互不相容时双方都可单独修复', () => {
  // x≡0(mod6) 与 x≡3(mod4)：gcd=2 不整除 -3，无解
  const out = suggestOffsetFixes([r(6, 0), r(4, 3)]);
  assert.equal(out.length, 2);
  // 色筒1：其余解集 x≡3(mod4)，g=gcd(6,4)=2，d≡3(mod2) → d=+1，新偏移 1
  assert.deepEqual(out[0], { index: 0, fixable: true, newOffset: 1n, adjustment: 1n });
  // 色筒2：其余解集 x≡0(mod6)，g=gcd(4,6)=2，d≡-3≡1(mod2) → d=+1，新偏移 0（3+1 折回）
  assert.deepEqual(out[1], { index: 1, fixable: true, newOffset: 0n, adjustment: 1n });
});

test('修正建议：等距时优先偏移增大（正向）', () => {
  // 修色筒1：其余 x≡2(mod4)，g=gcd(8,4)=4，d≡2(mod4)，|d|=2=g/2 等距 → 取 +2
  const out = suggestOffsetFixes([r(8, 0), r(4, 2)]);
  const fix1 = out.find((s) => s.index === 0);
  assert.equal(fix1.fixable, true);
  assert.equal(fix1.adjustment, 2n);
  assert.equal(fix1.newOffset, 2n);
});

test('修正建议：负向更近时取负调整', () => {
  // 修色筒1：其余 x≡0(mod4)，g=gcd(8,4)=4，d≡-1(mod4) → d=-1，新偏移 0
  const out = suggestOffsetFixes([r(8, 1), r(4, 0)]);
  const fix1 = out.find((s) => s.index === 0);
  assert.equal(fix1.adjustment, -1n);
  assert.equal(fix1.newOffset, 0n);
});

test('修正建议：其余同余式自身无解时标为不可单独修复', () => {
  const rollers = [r(6, 0), r(4, 3), r(9, 5)];
  const out = suggestOffsetFixes(rollers);
  const fixable = out.filter((s) => s.fixable);
  const unfixable = out.filter((s) => !s.fixable);
  // 只有色筒1 可修复：其余 x≡3(mod4)、x≡5(mod9) 相容（解集 x≡23(mod36)），
  // g=gcd(6,36)=6，d≡23≡5(mod6) → d=-1，新偏移 5（共同解 x=23 验证：23%6=5）
  assert.equal(fixable.length, 1);
  assert.equal(fixable[0].index, 0);
  assert.equal(fixable[0].adjustment, -1n);
  assert.equal(fixable[0].newOffset, 5n);
  // 色筒2、3 的其余组（含互不相容的一对）自身无解 → 不可单独修复
  assert.deepEqual(unfixable.map((s) => s.index), [1, 2]);
  // 不可修复项列于可修复项之后
  assert.deepEqual(out.map((s) => s.index), [0, 1, 2]);
});

test('修正建议：按 |调整量| 升序、再按色筒序号排序', () => {
  // 色筒1：g=gcd(24,lcm(36,8))=24，d≡40(mod24) → d=-8；色筒2：g=gcd(36,24)=12，d≡-4(mod12) → d=-4
  const out = suggestOffsetFixes([r(24, 0), r(36, 4), r(8, 0)]);
  const fixable = out.filter((s) => s.fixable);
  assert.equal(fixable.length, 2);
  assert.equal(fixable[0].index, 1); // |d|=4 排前
  assert.equal(fixable[0].adjustment, -4n);
  assert.equal(fixable[0].newOffset, 0n);
  assert.equal(fixable[1].index, 0); // |d|=8 排后
  assert.equal(fixable[1].adjustment, -8n);
  assert.equal(fixable[1].newOffset, 16n);

  // |调整量| 相同（±2）时按色筒序号升序
  const tie = suggestOffsetFixes([r(12, 0), r(18, 2)]);
  assert.equal(tie[0].index, 0);
  assert.equal(tie[0].adjustment, 2n);
  assert.equal(tie[1].index, 1);
  assert.equal(tie[1].adjustment, -2n);
});

test('修正建议：超大整数场景，且每条建议都能使全组有解', () => {
  const p1 = 123456789012345678901234567890n; // 偶
  const p2 = 987654321098765432109876543210n; // 偶
  const rollers = [r(p1, 0), r(p2, 1)]; // gcd≥2 不整除偏移差 -1 → 无解
  assert.equal(solve(rollers).solvable, false);

  const out = suggestOffsetFixes(rollers);
  assert.equal(out.length, 2);
  for (const s of out) {
    assert.equal(s.fixable, true);
    // 新偏移合法且在周长环内
    assert.ok(s.newOffset >= 0n && s.newOffset < rollers[s.index].perimeter);
    // newOffset ≡ 原偏移 + 调整量 (mod 周长)
    assert.equal(
      bigMod(rollers[s.index].offset + s.adjustment, rollers[s.index].perimeter),
      s.newOffset
    );
    // 采用建议后全组有解
    const next = rollers.map((x, i) =>
      i === s.index ? { perimeter: x.perimeter, offset: s.newOffset } : x
    );
    assert.equal(solve(next).solvable, true);
  }
});

/* ---------------- 布面瑕疵避让（禁印区间） ---------------- */

const rr = (start, end) => ({ start: BigInt(start), end: BigInt(end) });

test('mergeForbiddenRanges：合并重叠与首尾相邻区间并排序', () => {
  // [58,60] 与 [61,90] 之间没有整数空隙，视为相邻并合并
  assert.deepEqual(
    mergeForbiddenRanges([rr(58, 60), rr(61, 90), rr(10, 34), rr(12, 50)]),
    [rr(10, 50), rr(58, 90)]
  );
  // 仅相接但间隔 1 个整数位置时不合并：[1,3]、[5,6] 间空出位置 4
  assert.deepEqual(mergeForbiddenRanges([rr(1, 3), rr(5, 6)]), [rr(1, 3), rr(5, 6)]);
  // 完全包含
  assert.deepEqual(mergeForbiddenRanges([rr(0, 100), rr(10, 20)]), [rr(0, 100)]);
});

test('countPointsInRange：按周期与区间边界计数，含端点', () => {
  // 序列 10,34,58,82,106,...（first=10, period=24）
  assert.equal(countPointsInRange(10n, 24n, 10n, 34n), 2n);   // 10、34，端点计入
  assert.equal(countPointsInRange(10n, 24n, 11n, 33n), 0n);   // 开区间内侧无点
  assert.equal(countPointsInRange(10n, 24n, 0n, 9n), 0n);     // 首次点之前
  assert.equal(countPointsInRange(10n, 24n, 82n, 106n), 2n);  // 82、106
  assert.equal(countPointsInRange(10n, 24n, 11n, 34n), 1n);   // 仅 34
});

test('避让：无禁印区间时与原枚举一致', () => {
  const out = positionsAvoidingRanges(10n, 24n, 100n, []);
  assert.deepEqual(out.positions, [10n, 34n, 58n, 82n]);
  assert.equal(out.total, 4n);
  assert.equal(out.excluded, 0n);
  assert.equal(out.originalTotal, 4n);
});

test('避让：扣除区间端点上的点', () => {
  // [10,34] 端点 10、34 均不可使用；剩 58、82
  const out = positionsAvoidingRanges(10n, 24n, 100n, [rr(10, 34)]);
  assert.deepEqual(out.positions, [58n, 82n]);
  assert.equal(out.excluded, 2n);
  assert.equal(out.total, 2n);
});

test('避让：相邻区间先合并，跨区间的点只扣除一次', () => {
  // [58,60] 与 [61,90] 合并为 [58,90]，覆盖 58、82；[10,34] 覆盖 10、34
  const out = positionsAvoidingRanges(
    10n, 24n, 100n,
    [rr(58, 60), rr(61, 90), rr(10, 34)]
  );
  assert.deepEqual(out.mergedRanges, [rr(10, 34), rr(58, 90)]);
  assert.equal(out.excluded, 4n);
  assert.equal(out.total, 0n);
  assert.deepEqual(out.positions, []);
});

test('避让：区间覆盖整段布匹时可用点为 0', () => {
  const out = positionsAvoidingRanges(0n, 10n, 250n, [rr(0, 250)]);
  assert.equal(out.originalTotal, 26n); // 0,10,...,250
  assert.equal(out.excluded, 26n);
  assert.equal(out.total, 0n);
});

test('避让：只返回最早 20 个可用位置，但 total 为全量', () => {
  // first=0, period=1，0..99 共 100 个点；禁掉偶数位置 0,2,...,98（50 个）
  const ranges = [];
  for (let x = 0; x <= 98; x += 2) ranges.push(rr(x, x));
  const out = positionsAvoidingRanges(0n, 1n, 99n, ranges, 20);
  assert.equal(out.originalTotal, 100n);
  assert.equal(out.excluded, 50n);
  assert.equal(out.total, 50n);
  assert.equal(out.positions.length, 20);
  assert.deepEqual(out.positions, [1n, 3n, 5n, 7n, 9n, 11n, 13n, 15n, 17n, 19n,
                                   21n, 23n, 25n, 27n, 29n, 31n, 33n, 35n, 37n, 39n]);
});

test('避让：超大布长下按周期边界计数，不逐点扫描', () => {
  // first=0, period=10^30，布长 10^120-1，点数约 10^90（无法枚举）
  const period = 10n ** 30n;
  const cloth = 10n ** 120n - 1n;
  // 禁掉前三个周期点 0、10^30、2·10^30
  const out = positionsAvoidingRanges(0n, period, cloth, [rr(0n, 2n * period)]);
  assert.equal(out.excluded, 3n);
  assert.equal(out.originalTotal, cloth / period + 1n);
  assert.equal(out.total, out.originalTotal - 3n);
  // 最早可用点为 3·10^30；只步进返回至多 20 个位置，不枚举天文数量的点
  assert.equal(out.positions[0], 3n * period);
  assert.equal(out.positions.length, 20);
  assert.equal(out.positions[19], 22n * period);
});

test('避让：首次对花位置超过布长时统计为 0', () => {
  const out = positionsAvoidingRanges(200n, 24n, 100n, [rr(0, 50)]);
  assert.equal(out.originalTotal, 0n);
  assert.equal(out.excluded, 0n);
  assert.equal(out.total, 0n);
  assert.deepEqual(out.positions, []);
});

/* ---------------- 按序号定位可用对花点 ---------------- */

test('定位：无禁印区间时第 n 个点即原序列第 n−1 项', () => {
  // 序列 10,34,58,82（first=10, period=24, 布长 100）
  const at = (n) => locateNthUsablePosition(10n, 24n, 100n, [], n);
  assert.deepEqual(at(1n), { found: true, total: 4n, position: 10n, k: 0n, remaining: 90n });
  assert.deepEqual(at(4n), { found: true, total: 4n, position: 82n, k: 3n, remaining: 18n });
  // 越界：found=false 且给出可用点总数
  assert.deepEqual(at(5n), { found: false, total: 4n });
  // 布长端点恰好是对花点时距布尾余量为 0
  assert.deepEqual(
    locateNthUsablePosition(0n, 100n, 200n, [], 3n),
    { found: true, total: 3n, position: 200n, k: 2n, remaining: 0n }
  );
});

test('定位：扣除区间端点上的点后按可用顺序编号', () => {
  // [10,34] 端点 10、34 均不可用；可用点为 58、82
  const at = (n) => locateNthUsablePosition(10n, 24n, 100n, [rr(10, 34)], n);
  assert.deepEqual(at(1n), { found: true, total: 2n, position: 58n, k: 2n, remaining: 42n });
  assert.deepEqual(at(2n), { found: true, total: 2n, position: 82n, k: 3n, remaining: 18n });
  assert.deepEqual(at(3n), { found: false, total: 2n });
});

test('定位：相邻区间先合并，可用点为 0 时任何序号均无解', () => {
  // [58,60] 与 [61,90] 合并为 [58,90]，连同 [10,34] 覆盖全部 4 个点
  const out = locateNthUsablePosition(
    10n, 24n, 100n,
    [rr(58, 60), rr(61, 90), rr(10, 34)],
    1n
  );
  assert.deepEqual(out, { found: false, total: 0n });
  // 首次对花位置超过布长时同样为 0
  assert.deepEqual(locateNthUsablePosition(200n, 24n, 100n, [], 1n), { found: false, total: 0n });
});

test('定位：跨多个禁印区间按可用前缀计数跳转', () => {
  // first=0, period=1，0..99 共 100 点；禁掉偶数位置后可用点为奇数 1,3,…,99
  const ranges = [];
  for (let x = 0; x <= 98; x += 2) ranges.push(rr(x, x));
  const at = (n) => locateNthUsablePosition(0n, 1n, 99n, ranges, n);
  assert.deepEqual(at(1n), { found: true, total: 50n, position: 1n, k: 1n, remaining: 98n });
  assert.deepEqual(at(25n), { found: true, total: 50n, position: 49n, k: 49n, remaining: 50n });
  assert.deepEqual(at(50n), { found: true, total: 50n, position: 99n, k: 99n, remaining: 0n });
  assert.deepEqual(at(51n), { found: false, total: 50n });
});

test('定位：超大布长与超大序号按边界定位，不逐一枚举', () => {
  // first=0, period=10^30，布长 10^120−1，对花点共 10^90 个；禁掉前 3 个
  const period = 10n ** 30n;
  const cloth = 10n ** 120n - 1n;
  const total = 10n ** 90n - 3n;
  const at = (n) => locateNthUsablePosition(0n, period, cloth, [rr(0n, 2n * period)], n);
  // 第 1 个可用点 = 3·10^30
  assert.deepEqual(at(1n), {
    found: true, total, position: 3n * period, k: 3n,
    remaining: cloth - 3n * period,
  });
  // 最后一个可用点 = (10^90 − 1)·10^30，距布尾余量 10^30 − 1
  assert.deepEqual(at(total), {
    found: true, total, position: cloth - (period - 1n), k: 10n ** 90n - 1n,
    remaining: period - 1n,
  });
  assert.deepEqual(at(total + 1n), { found: false, total });
});

test('定位接口 locateBody：复用求解与禁印规则，输入校验与越界提示', () => {
  const base = {
    clothLength: '100',
    rollers: [
      { perimeter: '8', offset: '2' },
      { perimeter: '24', offset: '10' },
    ],
    forbiddenRanges: [{ start: '10', end: '34' }],
  };
  // 命中：可用点为 58、82
  const hit = locateBody({ ...base, index: '1' });
  assert.equal(hit.ok, true);
  assert.deepEqual(hit.result, {
    solvable: true, found: true, index: '1', total: '2',
    position: '58', k: '2', remaining: '42',
  });
  // 前导零规范化
  assert.equal(locateBody({ ...base, index: '002' }).result.position, '82');
  // 越界：found=false，附可用点总数与有效范围提示
  const oob = locateBody({ ...base, index: '3' });
  assert.equal(oob.result.found, false);
  assert.equal(oob.result.total, '2');
  assert.match(oob.result.message, /超出范围/);
  // 序号非法：0、非数字、缺字段均为 400
  assert.equal(locateBody({ ...base, index: '0' }).status, 400);
  assert.equal(locateBody({ ...base, index: 'abc' }).status, 400);
  assert.equal(locateBody(base).status, 400);
  // 方案字段非法同样 400
  assert.equal(locateBody({ ...base, index: '1', clothLength: '-5' }).status, 400);
  // 无解方案：返回冲突证据，不定位
  const nope = locateBody({
    clothLength: '1000', index: '1',
    rollers: [{ perimeter: '6', offset: '0' }, { perimeter: '4', offset: '3' }],
  });
  assert.equal(nope.result.solvable, false);
  assert.equal(nope.result.conflict.rollerA, 1);
  // 可用点为 0：明确提示无法定位
  const zero = locateBody({ ...base, index: '1', forbiddenRanges: [{ start: '0', end: '100' }] });
  assert.equal(zero.result.found, false);
  assert.equal(zero.result.total, '0');
  assert.match(zero.result.message, /可用对花点数为 0/);
});

console.log(`\n全部 ${passed} 项测试通过 ✔\n`);
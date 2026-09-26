/**
 * crt.js —— 多色滚筒套准（广义中国剩余定理 / 同余合并）
 *
 * 模型：色筒 i 的重复周长为 p_i，标记偏移为 a_i（0 ≤ a_i < p_i）。
 * 标记在布面上出现的位置 x 满足：
 *
 *     x ≡ a_i (mod p_i)
 *
 * 全部色筒同时对花 ⇔ 该同余方程组有解。
 *
 * 有解时：
 *   - firstPosition 为布头 0 mm 起的最小非负解；
 *   - period 为共同重复周期，即所有周长的最小公倍数 LCM(p_1,…,p_n)；
 *   - 之后所有对花位置为 firstPosition + k·period（k 为非负整数）。
 *
 * 无解时，至少存在一对色筒 i,j 互不相容：
 *   gcd(p_i, p_j) 不能整除 (a_i − a_j)，接口返回这样的一对作为证据。
 *
 * 全部计算使用 BigInt，整数位数不受 JavaScript Number 安全整数范围限制。
 */

/** 非负取模（BigInt）。 */
export function bigMod(a, m) {
  return ((a % m) + m) % m;
}

/** 最大公约数（BigInt，结果非负）。 */
export function bigGcd(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
}

/** 最小公倍数（BigInt，入参均为正）。 */
export function bigLcm(a, b) {
  return (a / bigGcd(a, b)) * b;
}

/**
 * 扩展欧几里得：求 (g, x, y) 使 a·x + b·y = g = gcd(a,b)。
 */
function extendedGcd(a, b) {
  if (b === 0n) {
    return { g: a < 0n ? -a : a, x: a < 0n ? -1n : 1n, y: 0n };
  }
  const { g, x, y } = extendedGcd(b, a % b);
  return { g, x: y, y: x - (a / b) * y };
}

/**
 * 判定同余组 a（模 m）与 b（模 n）是否相容。
 * 相容条件：gcd(m, n) 整除 (a − b)。
 */
export function isCompatible(a, m, b, n) {
  const g = bigGcd(m, n);
  return bigMod(a - b, g) === 0n;
}

/**
 * 合并两条同余：x ≡ a1 (mod m1) 与 x ≡ a2 (mod m2)。
 * 调用前必须保证二者相容（isCompatible）。
 *
 * 合并结果：x ≡ r (mod lcm(m1,m2))，r 取最小非负代表元。
 */
export function mergeCongruence(a1, m1, a2, m2) {
  const g = bigGcd(m1, m2);
  const m = bigLcm(m1, m2);

  // 解 k：m1·k ≡ (a2 − a1) (mod m2)
  // 令 M1 = m1/g，M2 = m2/g，diff = (a2-a1)/g
  // M1·k ≡ diff (mod M2)，gcd(M1, M2) = 1，可求逆元。
  const M1 = m1 / g;
  const M2 = m2 / g;
  const diff = ((a2 - a1) / g) % (M2 === 0n ? 1n : M2);

  let k;
  if (M2 === 1n) {
    k = 0n;
  } else {
    const { x } = extendedGcd(M1 % M2, M2);
    k = bigMod(diff * x, M2);
  }

  const r = bigMod(a1 + m1 * k, m);
  return { a: r, m };
}

/**
 * 求解一个套准方案。
 *
 * @param {Array<{perimeter: bigint, offset: bigint}>} rollers 2～8 个色筒
 * @returns 结果对象（字段均为 bigint / 索引 / 数组）：
 *   {
 *     solvable: true,
 *     firstPosition: bigint,         // 布头起首次对花位置（mm）
 *     period: bigint,                // 共同重复周期（mm）
 *   }
 *   或
 *   {
 *     solvable: false,
 *     conflict: { i, j, gcd, diff }  // 一对互不相容的色筒（0 基索引）
 *   }
 */
export function solve(rollers) {
  // 第一步：两两扫描，找出一对互不相容的色筒（天然满足“指出一对”）。
  for (let i = 0; i < rollers.length; i++) {
    for (let j = i + 1; j < rollers.length; j++) {
      const ri = rollers[i];
      const rj = rollers[j];
      if (!isCompatible(ri.offset, ri.perimeter, rj.offset, rj.perimeter)) {
        return {
          solvable: false,
          conflict: {
            i,
            j,
            gcd: bigGcd(ri.perimeter, rj.perimeter),
            diff: ri.offset - rj.offset,
          },
        };
      }
    }
  }

  // 第二步：依次合并全部同余。
  let acc = { a: rollers[0].offset, m: rollers[0].perimeter };
  for (let k = 1; k < rollers.length; k++) {
    acc = mergeCongruence(
      acc.a,
      acc.m,
      rollers[k].offset,
      rollers[k].perimeter
    );
  }

  return { solvable: true, firstPosition: acc.a, period: acc.m };
}

/**
 * 为无解方案生成“单色筒偏移修正”建议。
 *
 * 依次尝试只修改色筒 k 的偏移（其余色筒保持不动）：
 *
 *   1. 若其余 n−1 个色筒的同余组自身无解，则色筒 k 记为“不可单独修复”；
 *   2. 否则其余色筒的解集为 x ≡ A (mod M)（M 为其余周长的 LCM），
 *      新偏移 a′ 只需满足 a′ ≡ A (mod g)，g = gcd(p_k, M)，
 *      即可与合并式相容，从而全组有解（g 整除每个 gcd(p_k, p_j)，
 *      故与合并式相容 ⟹ 与每个色筒两两相容）。
 *
 * 调整量 d = a′ − a_k 满足 d ≡ A − a_k (mod g)，候选 d 构成公差为 g
 * 的等差类。该类在 (−g/2, g/2] 内的代表元即环形最短位移：任意候选 w
 * 折回环上后的位移绝对值 |fold(w)| = dist(w, p_k·Z) ≥ dist(w, g·Z)，
 * 下界正好由该代表元取得；等距（2·|d| = g）时取正值，即“偏移增大”方向。
 * 该代表元直接由取模得到，无需枚举候选（候选数量 p_k/g 可能是天文数字）。
 *
 * @param {Array<{perimeter: bigint, offset: bigint}>} rollers 2～8 个色筒
 * @returns {Array<object>} 每项形如：
 *   { index, fixable: true,  newOffset: bigint, adjustment: bigint }  // 可单独修复
 *   { index, fixable: false }                                          // 不可单独修复
 *   可修复项在前，按 |adjustment| 升序、再按色筒序号升序；
 *   不可修复项列于其后，按色筒序号升序。
 */
export function suggestOffsetFixes(rollers) {
  const fixable = [];
  const unfixable = [];

  for (let k = 0; k < rollers.length; k++) {
    const others = rollers.filter((_, idx) => idx !== k);
    const rest = solve(others);
    if (!rest.solvable) {
      unfixable.push({ index: k, fixable: false });
      continue;
    }

    const p = rollers[k].perimeter;
    const a = rollers[k].offset;
    const g = bigGcd(p, rest.period);
    // um ∈ [0, g) 为 d 模 g 的最小非负代表；折到 (−g/2, g/2]（等距取正）。
    const um = bigMod(rest.firstPosition - a, g);
    const d = um * 2n <= g ? um : um - g;

    fixable.push({
      index: k,
      fixable: true,
      newOffset: bigMod(a + d, p),
      adjustment: d,
    });
  }

  fixable.sort((x, y) => {
    const ax = x.adjustment < 0n ? -x.adjustment : x.adjustment;
    const ay = y.adjustment < 0n ? -y.adjustment : y.adjustment;
    if (ax !== ay) return ax < ay ? -1 : 1;
    return x.index - y.index;
  });

  return [...fixable, ...unfixable];
}

/**
 * 列出不超过布长的最早若干个对花位置（含 0 mm 与布长端点）。
 *
 * @param {bigint} firstPosition 首次对花位置
 * @param {bigint} period        共同重复周期
 * @param {bigint} clothLength   布长（mm，非负）
 * @param {number} limit         最多返回个数（默认 20）
 * @returns {{ positions: bigint[], total: bigint }}
 *   positions 为最早的 limit 个（不足则全部）；total 为布长内总个数。
 */
export function positionsWithinCloth(firstPosition, period, clothLength, limit = 20) {
  const positions = [];
  if (firstPosition <= clothLength) {
    // x_k = first + k·period ≤ clothLength
    // total = floor((clothLength − first)/period) + 1
    const total = (clothLength - firstPosition) / period + 1n;
    let x = firstPosition;
    for (let k = 0; k < limit && x <= clothLength; k++) {
      positions.push(x);
      x += period;
    }
    return { positions, total };
  }
  return { positions, total: 0n };
}

/* ------------------------------------------------------------------ *
 * 布面瑕疵避让（禁印区间）
 *
 * 原对花序列为 x_k = firstPosition + k·period（k ≥ 0），布长内取
 * 0 ≤ x_k ≤ clothLength。禁印区间为整数闭区间 [lo, hi]（端点同样
 * 不可使用），落在任一区间内的对花点必须扣除。
 *
 * 所有计数只依赖“周期除法”与区间边界（floor/ceil 除法），
 * 既不按布长逐点扫描，也不按对花点总数枚举；首个/最后一个可用点
 * 同样由区间边界直接跳到，再按 period 步进至多 limit 个返回值。
 * 按序号定位第 n 个可用点（locateNthUsablePosition）复用同一套
 * 区间合并与边界除法，用可用前缀计数直接算出下标，不枚举前 n 个点。
 * ------------------------------------------------------------------ */

/** floor(a/b)，b > 0（BigInt，a 可为负）。 */
function floorDiv(a, b) {
  const q = a / b;
  return a % b < 0n ? q - 1n : q;
}

/** ceil(a/b)，b > 0（BigInt，a 可为负）。 */
function ceilDiv(a, b) {
  const q = a / b;
  return a % b > 0n ? q + 1n : q;
}

/**
 * 合并互相重叠或首尾相邻（前一终点 + 1 ≥ 后一终点起点）的整数闭区间。
 * 端点按整数位置比较，[1,3] 与 [4,5] 之间没有任何整数空隙，视为相邻。
 * 入参会被排序，不修改原数组。
 *
 * @param {Array<{start: bigint, end: bigint}>} ranges
 * @returns {Array<{start: bigint, end: bigint}>} 按起点升序、互不相交
 */
export function mergeForbiddenRanges(ranges) {
  const sorted = ranges
    .map((r) => ({ start: r.start, end: r.end }))
    .sort((u, v) => (u.start < v.start ? -1 : u.start > v.start ? 1 : 0));
  const merged = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end + 1n) {
      if (r.end > last.end) last.end = r.end;
    } else {
      merged.push({ start: r.start, end: r.end });
    }
  }
  return merged;
}

/**
 * 统计等差数列 x_k = firstPosition + k·period（k ≥ 0）落在闭区间
 * [lo, hi] 内的点数。只做周期边界除法，不逐点扫描。
 */
export function countPointsInRange(firstPosition, period, lo, hi) {
  if (hi < lo) return 0n;
  // firstPosition + k·period ≥ lo ⟺ k ≥ ceil((lo − firstPosition)/period)
  const kLoRaw = ceilDiv(lo - firstPosition, period);
  const kLo = kLoRaw < 0n ? 0n : kLoRaw;
  // firstPosition + k·period ≤ hi ⟺ k ≤ floor((hi − firstPosition)/period)
  const kHi = floorDiv(hi - firstPosition, period);
  return kHi >= kLo ? kHi - kLo + 1n : 0n;
}

/**
 * 布长内对花点扣除禁印区间后的可用点统计。
 *
 * 处理顺序：先把禁印区间合并（重叠/相邻），再按周期与各区间边界
 * 计数、跳过，全程不按布长或对花点总数逐点扫描。
 *
 * @param {bigint} firstPosition 首次对花位置
 * @param {bigint} period        共同重复周期（正）
 * @param {bigint} clothLength   布长（非负）
 * @param {Array<{start: bigint, end: bigint}>} forbiddenRanges
 *   已校验的整数闭区间，满足 0 ≤ start ≤ end ≤ clothLength
 * @param {number} limit         最多返回的可用位置数（默认 20）
 * @returns {{
 *   positions: bigint[],   // 最早的 limit 个可用位置（保持原对花序列顺序）
 *   total: bigint,         // 可用点总数
 *   excluded: bigint,      // 被排除点数
 *   originalTotal: bigint, // 扣除前布长内对花点总数
 *   mergedRanges: Array<{start: bigint, end: bigint}>,
 * }}
 */
export function positionsAvoidingRanges(
  firstPosition,
  period,
  clothLength,
  forbiddenRanges,
  limit = 20
) {
  const mergedRanges = mergeForbiddenRanges(forbiddenRanges);

  if (firstPosition > clothLength) {
    return { positions: [], total: 0n, excluded: 0n, originalTotal: 0n, mergedRanges };
  }

  // 扣除前的对花点总数：floor((clothLength − first)/period) + 1
  const originalTotal = (clothLength - firstPosition) / period + 1n;

  // 被排除点数：各合并区间覆盖的对花点数之和。
  // 合并后区间互不相邻（至少间隔 1 个整数位置），同一点不可能被计两次。
  let excluded = 0n;
  for (const r of mergedRanges) {
    excluded += countPointsInRange(firstPosition, period, r.start, r.end);
  }

  // 最早的 limit 个可用位置：利用区间边界把当前点直接跳到区间之后，
  // 每个禁印区间至多跳转一次，可用点每输出一个才步进一个周期。
  const positions = [];
  let x = firstPosition;
  let ri = 0;
  while (positions.length < limit && x <= clothLength) {
    // 跳过所有已落在身后的区间（其覆盖的点已计入 excluded）。
    while (ri < mergedRanges.length && mergedRanges[ri].end < x) ri++;
    if (ri < mergedRanges.length && mergedRanges[ri].start <= x) {
      // x 落入禁印区间 [lo, hi]：第一个可能回到可用侧的点为 hi 之后
      // 首个同周期点 firstPosition + ceil((hi+1 − firstPosition)/period)·period。
      x = firstPosition + ceilDiv(mergedRanges[ri].end + 1n - firstPosition, period) * period;
      ri++;
      continue;
    }
    positions.push(x);
    x += period;
  }

  return { positions, total: originalTotal - excluded, excluded, originalTotal, mergedRanges };
}

/**
 * 按序号定位可用对花点（序号为 1 基）。
 *
 * 在“布长内、扣除禁印区间后的可用对花点序列”中定位第 n 个可用点。
 * 做法：先把每个合并后的禁印区间 [s, e] 换算成原对花序列的下标区间
 * ceil((s − first)/period) ≤ k ≤ floor((e − first)/period)；合并后的区间
 * 互不相邻，这些下标区间也互不相交且按序排列。随后按下标区间顺序做
 * “可用前缀计数”：第 n 个可用点落在某段可用下标区间内时，其下标
 * k = 段首下标 + (n − 之前被禁用的下标总数 − 1)，位置与距布尾余量
 * 直接算出。全程只做周期边界的 floor/ceil 除法与 BigInt 加减，
 * 既不按布长逐点扫描，也不枚举前 n 个可用点。
 *
 * @param {bigint} firstPosition 首次对花位置
 * @param {bigint} period        共同重复周期（正）
 * @param {bigint} clothLength   布长（非负）
 * @param {Array<{start: bigint, end: bigint}>} forbiddenRanges
 *   已校验的整数闭区间，满足 0 ≤ start ≤ end ≤ clothLength
 * @param {bigint} n             1 基序号（n ≥ 1）
 * @returns 命中时：
 *   { found: true, total, position, k, remaining }
 *     total     可用点总数（bigint）
 *     position  第 n 个可用点距布头的位置（bigint）
 *     k         该点在原对花序列中的下标（bigint，x = firstPosition + k·period）
 *     remaining 距布尾余量（clothLength − position，bigint）
 *   序号越界或无可用点时：{ found: false, total }
 */
export function locateNthUsablePosition(
  firstPosition,
  period,
  clothLength,
  forbiddenRanges,
  n
) {
  const mergedRanges = mergeForbiddenRanges(forbiddenRanges);

  if (firstPosition > clothLength) {
    return { found: false, total: 0n };
  }

  // 扣除前的对花点总数：floor((clothLength − first)/period) + 1
  const originalTotal = (clothLength - firstPosition) / period + 1n;

  // 合并区间 → 原序列下标区间 [kLo, kHi]（互不相交、按 kLo 升序）。
  const kRanges = [];
  let excluded = 0n;
  for (const r of mergedRanges) {
    const kLoRaw = ceilDiv(r.start - firstPosition, period);
    const kLo = kLoRaw < 0n ? 0n : kLoRaw;
    const kHi = floorDiv(r.end - firstPosition, period);
    if (kHi < kLo) continue; // 该区间内没有对花点
    kRanges.push({ kLo, kHi });
    excluded += kHi - kLo + 1n;
  }
  const total = originalTotal - excluded;

  if (n < 1n || n > total) {
    return { found: false, total };
  }

  // 可用前缀计数定位：跳过完整落在第 n 个可用点之前的禁用下标区间，
  // 每个区间至多跳过一次，不逐一枚举可用点。
  // 记 skipped 为当前可用段之前被禁用的下标总数，则 [0, kLo) 内的可用
  // 下标数为 kLo − skipped；第 n 个可用点落在该段内时，其下标恰好为
  // k = n + skipped − 1（0 基序号 n−1 加上被跳过的禁用下标数）。
  let skipped = 0n;
  let k = null;
  for (const { kLo, kHi } of kRanges) {
    if (n <= kLo - skipped) {
      k = n + skipped - 1n;
      break;
    }
    skipped += kHi - kLo + 1n;
  }
  if (k === null) {
    k = n + skipped - 1n;
  }

  const position = firstPosition + k * period;
  return { found: true, total, position, k, remaining: clothLength - position };
}

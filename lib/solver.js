/**
 * solver.js —— 方案求解服务（校验 + CRT + 结果序列化）
 *
 * 对外返回的所有整数均为十进制字符串，天然支持超出
 * Number.MAX_SAFE_INTEGER 的输入与结果。
 */

import { validateScheme, validateLocateIndex } from './validation.js';
import {
  solve,
  positionsAvoidingRanges,
  suggestOffsetFixes,
  locateNthUsablePosition,
} from './crt.js';

const POSITION_LIMIT = 20;

/**
 * 把 solve() 的冲突证据序列化为十进制字符串（/api/solve 与
 * /api/solve/locate 共用同一形状）。
 */
function serializeConflict(conflict, body, rollers) {
  const { i, j, gcd, diff } = conflict;
  return {
    rollerA: i + 1,
    rollerB: j + 1,
    perimeterA: body.rollers[i].perimeter.toString().trim(),
    perimeterB: body.rollers[j].perimeter.toString().trim(),
    offsetA: body.rollers[i].offset.toString().trim(),
    offsetB: body.rollers[j].offset.toString().trim(),
    gcd: gcd.toString(),
    offsetDifference: diff.toString(),
    message:
      `色筒 ${i + 1} 与色筒 ${j + 1} 互不相容：` +
      `gcd(${rollers[i].perimeter}, ${rollers[j].perimeter}) = ${gcd} ` +
      `不能整除偏移差（${rollers[i].offset} − ${rollers[j].offset} = ${diff}），` +
      `两者的标记永远无法对齐。`,
  };
}

/**
 * 把 suggestOffsetFixes 的 BigInt 结果序列化为十进制字符串。
 * adjustment 为带显式符号的十进制字符串（如 "+30" / "-15"）。
 */
function serializeSuggestions(suggestions, rollers) {
  return suggestions.map((s) => {
    if (!s.fixable) {
      return { roller: s.index + 1, fixable: false };
    }
    return {
      roller: s.index + 1,
      fixable: true,
      perimeter: rollers[s.index].perimeter.toString(),
      currentOffset: rollers[s.index].offset.toString(),
      suggestedOffset: s.newOffset.toString(),
      adjustment: (s.adjustment >= 0n ? '+' : '') + s.adjustment.toString(),
    };
  });
}

/**
 * 求解方案。
 * @returns {{ ok: true, result: object } | { ok: false, status: number, error: string }}
 */
export function solveBody(body) {
  const checked = validateScheme(body);
  if (!checked.ok) {
    return { ok: false, status: 400, error: checked.error };
  }

  const { rollers, clothLength, forbiddenRanges } = checked.bigints;
  const solved = solve(rollers);

  if (!solved.solvable) {
    return {
      ok: true,
      result: {
        solvable: false,
        conflict: serializeConflict(solved.conflict, body, rollers),
        suggestions: serializeSuggestions(suggestOffsetFixes(rollers), rollers),
      },
    };
  }

  // 布面瑕疵避让：先合并重叠/相邻禁印区间，再从原对花序列中扣除区间内的点。
  // 计数与跳转只按周期和区间边界进行，不逐点扫描布长或对花点。
  const { positions, total, excluded, originalTotal, mergedRanges } =
    positionsAvoidingRanges(
      solved.firstPosition,
      solved.period,
      clothLength,
      forbiddenRanges,
      POSITION_LIMIT
    );

  return {
    ok: true,
    result: {
      solvable: true,
      firstPosition: solved.firstPosition.toString(),
      period: solved.period.toString(),
      clothLength: clothLength.toString(),
      forbiddenRanges: checked.data.forbiddenRanges,
      withinCloth: {
        total: total.toString(),
        positions: positions.map((p) => p.toString()),
        limit: POSITION_LIMIT,
        excluded: excluded.toString(),
        originalTotal: originalTotal.toString(),
        mergedRanges: mergedRanges.map((r) => ({
          start: r.start.toString(),
          end: r.end.toString(),
        })),
      },
    },
  };
}

/**
 * 按序号定位可用对花点（只读查询，不保存、不改变方案数据）。
 * body 在 /api/solve 的方案字段之外多一个 index（从 1 开始的十进制
 * 序号字符串）；求解与禁印区间规则与 solveBody 完全一致。
 * @returns {{ ok: true, result: object } | { ok: false, status: number, error: string }}
 */
export function locateBody(body) {
  const checked = validateScheme(body);
  if (!checked.ok) {
    return { ok: false, status: 400, error: checked.error };
  }
  const idx = validateLocateIndex(body.index);
  if (idx.error) {
    return { ok: false, status: 400, error: idx.error };
  }

  const { rollers, clothLength, forbiddenRanges } = checked.bigints;
  const solved = solve(rollers);

  if (!solved.solvable) {
    return {
      ok: true,
      result: {
        solvable: false,
        conflict: serializeConflict(solved.conflict, body, rollers),
      },
    };
  }

  const located = locateNthUsablePosition(
    solved.firstPosition,
    solved.period,
    clothLength,
    forbiddenRanges,
    idx.big
  );

  if (!located.found) {
    return {
      ok: true,
      result: {
        solvable: true,
        found: false,
        index: idx.value,
        total: located.total.toString(),
        message: located.total === 0n
          ? '避让禁印区间后可用对花点数为 0，无法按序号定位。'
          : `可用对花点共 ${located.total} 个，序号 ${idx.value} 超出范围（有效序号 1～${located.total}）。`,
      },
    };
  }

  return {
    ok: true,
    result: {
      solvable: true,
      found: true,
      index: idx.value,
      total: located.total.toString(),
      position: located.position.toString(),
      k: located.k.toString(),
      remaining: located.remaining.toString(),
    },
  };
}

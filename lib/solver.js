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
  locateAvailablePosition,
} from './crt.js';

const POSITION_LIMIT = 20;

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
    const { i, j, gcd, diff } = solved.conflict;
    return {
      ok: true,
      result: {
        solvable: false,
        conflict: {
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
        },
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
 *
 * 请求体在试算参数（clothLength / rollers / forbiddenRanges）之外附带
 * 字段 index：从 1 开始的十进制序号字符串。求解与禁印区间规则与
 * solveBody 完全一致，定位由 locateAvailablePosition 按可用前缀计数
 * 边界完成，不逐一枚举。
 *
 * @returns {{ ok: true, result: object } | { ok: false, status: number, error: string }}
 */
export function locateBody(body) {
  const checked = validateScheme(body);
  if (!checked.ok) {
    return { ok: false, status: 400, error: checked.error };
  }
  const index = validateLocateIndex(body.index);
  if (index.error) {
    return { ok: false, status: 400, error: index.error };
  }

  const { rollers, clothLength, forbiddenRanges } = checked.bigints;
  const solved = solve(rollers);
  if (!solved.solvable) {
    return {
      ok: false,
      status: 422,
      error: '方案无解：色筒标记无法对齐，没有可定位的对花点',
    };
  }

  const located = locateAvailablePosition(
    solved.firstPosition,
    solved.period,
    clothLength,
    forbiddenRanges,
    index.value
  );
  if (!located.found) {
    if (located.reason === 'empty') {
      return {
        ok: false,
        status: 422,
        error: '避让禁印区间后没有可用对花点，无法按序号定位',
      };
    }
    return {
      ok: false,
      status: 422,
      error:
        `序号 ${index.text} 超出范围：避让后可用对花点共 ${located.total} 个，` +
        `有效序号为 1～${located.total}`,
    };
  }

  return {
    ok: true,
    result: {
      index: index.text,
      position: located.position.toString(),
      sequenceIndex: located.sequenceIndex.toString(),
      remaining: located.remaining.toString(),
      total: located.total.toString(),
      clothLength: clothLength.toString(),
      firstPosition: solved.firstPosition.toString(),
      period: solved.period.toString(),
    },
  };
}

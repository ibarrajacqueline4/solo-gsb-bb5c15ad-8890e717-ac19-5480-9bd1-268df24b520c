/**
 * store.js —— 方案本地 JSON 持久化
 *
 * 数据文件路径由环境变量 DATA_FILE 指定（默认 ./data/schemes.json）。
 * 所有数值以十进制字符串保存，保留任意精度。
 * 写入采用“写临时文件 + rename”的原子方式，避免进程中断时损坏数据。
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function resolveDataFile() {
  return process.env.DATA_FILE || path.join(process.cwd(), 'data', 'schemes.json');
}

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

/**
 * 规范化单条方案：旧版本数据缺少 forbiddenRanges 字段时视为空（无禁印区间）。
 */
export function loadSchemes() {
  const file = resolveDataFile();
  if (!fs.existsSync(file)) return [];
  try {
    const text = fs.readFileSync(file, 'utf8').trim();
    if (!text) return [];
    const data = JSON.parse(text);
    if (!Array.isArray(data)) return [];
    // 旧方案缺少禁印区间字段时视为空。
    return data.map((s) => (s && !Array.isArray(s.forbiddenRanges)
      ? { ...s, forbiddenRanges: [] }
      : s));
  } catch (err) {
    throw new Error(`读取方案数据文件失败：${err.message}`);
  }
}

export function saveSchemes(schemes) {
  const file = resolveDataFile();
  ensureDir(file);
  const tmp = path.join(
    path.dirname(file),
    `.schemes.${process.pid}.${Date.now()}.tmp`
  );
  fs.writeFileSync(tmp, JSON.stringify(schemes, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

export function createScheme(data) {
  const schemes = loadSchemes();
  const now = new Date().toISOString();
  const scheme = {
    id: randomUUID(),
    name: data.name,
    clothLength: data.clothLength,
    rollers: data.rollers,
    forbiddenRanges: data.forbiddenRanges,
    createdAt: now,
    updatedAt: now,
  };
  schemes.push(scheme);
  saveSchemes(schemes);
  return scheme;
}

export function updateScheme(id, data) {
  const schemes = loadSchemes();
  const idx = schemes.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  schemes[idx] = {
    ...schemes[idx],
    name: data.name,
    clothLength: data.clothLength,
    rollers: data.rollers,
    forbiddenRanges: data.forbiddenRanges,
    updatedAt: new Date().toISOString(),
  };
  saveSchemes(schemes);
  return schemes[idx];
}

export function deleteScheme(id) {
  const schemes = loadSchemes();
  const next = schemes.filter((s) => s.id !== id);
  if (next.length === schemes.length) return false;
  saveSchemes(next);
  return true;
}

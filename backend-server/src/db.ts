import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  DEFAULT_WATCHLIST_CODES,
  stockName,
  type BrowseEntry,
  type Drawing,
  type DrawingSource,
  type FormulaRecord,
  type IndicatorShape,
  type KlinePeriod,
  type WatchlistItem,
} from '@mp/shared'

type Db = Database.Database

const BROWSE_LIMIT = 30

/** 打开(必要时创建)数据库:建表 + 自选首次种子(三大指数) */
export function openDb(dbPath: string): Db {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      seq INTEGER NOT NULL,
      added_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS browse_history (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      seq INTEGER NOT NULL,
      viewed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS formulas (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      shape TEXT NOT NULL,
      formula TEXT NOT NULL,
      formula2 TEXT,
      base_value REAL,
      color TEXT,
      output_specs TEXT,
      rev INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS drawings (
      stock TEXT NOT NULL,
      period TEXT NOT NULL,
      items TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (stock, period)
    );
  `)
  seedWatchlist(db)
  return db
}

/** 首次使用(自选表空)种子写入默认三大指数 */
function seedWatchlist(db: Db): void {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM watchlist').get() as { c: number }
  if (c > 0) return
  const ins = db.prepare('INSERT INTO watchlist (code, name, seq, added_at) VALUES (?, ?, ?, ?)')
  const now = new Date().toISOString()
  DEFAULT_WATCHLIST_CODES.forEach((code, i) => ins.run(code, stockName(code), i, now))
}

// ===== 自选 =====
export function listWatchlist(db: Db): WatchlistItem[] {
  return (db.prepare('SELECT code, name, added_at FROM watchlist ORDER BY seq').all() as Array<{ code: string; name: string; added_at: string }>).map(
    (r) => ({ code: r.code, name: r.name, addedAt: r.added_at }),
  )
}

/** 加入自选(幂等:已存在原样返回) */
export function addWatchlist(db: Db, code: string, name: string): WatchlistItem {
  const now = new Date().toISOString()
  const existing = db.prepare('SELECT code, name, added_at FROM watchlist WHERE code = ?').get(code) as
    | { code: string; name: string; added_at: string }
    | undefined
  if (existing) return { code: existing.code, name: existing.name, addedAt: existing.added_at }
  const { maxSeq } = db.prepare('SELECT COALESCE(MAX(seq), -1) AS maxSeq FROM watchlist').get() as { maxSeq: number }
  db.prepare('INSERT INTO watchlist (code, name, seq, added_at) VALUES (?, ?, ?, ?)').run(code, name, maxSeq + 1, now)
  return { code, name, addedAt: now }
}

/** 移除自选 + 级联删除该股全部周期画线(事务) */
export function removeWatchlist(db: Db, code: string): boolean {
  const tx = db.transaction((c: string) => {
    const info = db.prepare('DELETE FROM watchlist WHERE code = ?').run(c)
    db.prepare('DELETE FROM drawings WHERE stock = ?').run(c)
    return info.changes > 0
  })
  return tx(code)
}

// ===== 浏览记录 =====
export function listBrowseHistory(db: Db, limit = 30): BrowseEntry[] {
  const l = Math.max(1, Math.min(100, limit))
  return (
    db.prepare('SELECT code, name, viewed_at FROM browse_history ORDER BY seq DESC LIMIT ?').all(l) as Array<{
      code: string
      name: string
      viewed_at: string
    }>
  ).map((r) => ({ code: r.code, name: r.name, viewedAt: r.viewed_at }))
}

/** 记录浏览:去重置顶,超上限丢弃最旧 */
export function recordBrowse(db: Db, code: string, name: string): BrowseEntry {
  const now = new Date().toISOString()
  const tx = db.transaction((c: string, n: string) => {
    db.prepare('DELETE FROM browse_history WHERE code = ?').run(c)
    const { maxSeq } = db.prepare('SELECT COALESCE(MAX(seq), -1) AS maxSeq FROM browse_history').get() as { maxSeq: number }
    db.prepare('INSERT INTO browse_history (code, name, seq, viewed_at) VALUES (?, ?, ?, ?)').run(c, n, maxSeq + 1, now)
    const rows = db.prepare('SELECT code FROM browse_history ORDER BY seq DESC').all() as Array<{ code: string }>
    if (rows.length > BROWSE_LIMIT) {
      const drop = rows.slice(BROWSE_LIMIT).map((r) => r.code)
      db.prepare(`DELETE FROM browse_history WHERE code IN (${drop.map(() => '?').join(',')})`).run(...drop)
    }
  })
  tx(code, name)
  return { code, name, viewedAt: now }
}

// ===== 公式 =====
interface FormulaRow {
  id: string
  title: string
  shape: string
  formula: string
  formula2: string | null
  base_value: number | null
  color: string | null
  output_specs: string | null
  rev: number
  created_at: string
  updated_at: string
}

function rowToRecord(r: FormulaRow): FormulaRecord {
  return {
    id: r.id,
    title: r.title,
    shape: r.shape as IndicatorShape,
    formula: r.formula,
    ...(r.formula2 ? { formula2: r.formula2 } : {}),
    ...(r.base_value !== null && r.base_value !== undefined ? { baseValue: r.base_value } : {}),
    ...(r.color ? { color: r.color } : {}),
    ...(r.output_specs ? { outputSpecs: JSON.parse(r.output_specs) as FormulaRecord['outputSpecs'] } : {}),
    rev: r.rev,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function listFormulas(db: Db): FormulaRecord[] {
  return (db.prepare('SELECT * FROM formulas ORDER BY created_at').all() as FormulaRow[]).map(rowToRecord)
}

export function getFormula(db: Db, id: string): FormulaRecord | undefined {
  const r = db.prepare('SELECT * FROM formulas WHERE id = ?').get(id) as FormulaRow | undefined
  return r ? rowToRecord(r) : undefined
}

export function insertFormula(db: Db, rec: Omit<FormulaRecord, 'rev' | 'createdAt' | 'updatedAt'> & { id: string }): FormulaRecord {
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO formulas (id, title, shape, formula, formula2, base_value, color, output_specs, rev, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
  ).run(
    rec.id,
    rec.title,
    rec.shape,
    rec.formula,
    rec.formula2 ?? null,
    rec.baseValue ?? null,
    rec.color ?? null,
    rec.outputSpecs ? JSON.stringify(rec.outputSpecs) : null,
    now,
    now,
  )
  return getFormula(db, rec.id) as FormulaRecord
}

export function updateFormula(db: Db, id: string, patch: Partial<FormulaRecord>): FormulaRecord {
  const now = new Date().toISOString()
  db.prepare(
    `UPDATE formulas SET
       title = COALESCE(?, title),
       shape = COALESCE(?, shape),
       formula = COALESCE(?, formula),
       formula2 = ?,
       base_value = ?,
       color = ?,
       output_specs = ?,
       rev = rev + 1,
       updated_at = ?
     WHERE id = ?`,
  ).run(
    patch.title ?? null,
    patch.shape ?? null,
    patch.formula ?? null,
    patch.formula2 ?? null,
    patch.baseValue ?? null,
    patch.color ?? null,
    patch.outputSpecs ? JSON.stringify(patch.outputSpecs) : null,
    now,
    id,
  )
  const rec = getFormula(db, id)
  if (!rec) throw new Error(`公式不存在:${id}`)
  return rec
}

export function deleteFormula(db: Db, id: string): boolean {
  return db.prepare('DELETE FROM formulas WHERE id = ?').run(id).changes > 0
}

// ===== 键值(settings / indicator-config) =====
export function getKv<T>(db: Db, key: string, fallback: T): T {
  const r = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined
  if (!r) return fallback
  try {
    return JSON.parse(r.value) as T
  } catch {
    return fallback
  }
}

export function setKv(db: Db, key: string, value: unknown): void {
  db.prepare('INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').run(
    key,
    JSON.stringify(value),
    new Date().toISOString(),
  )
}

// ===== 画线 =====
export function getDrawings(db: Db, stock: string, period: KlinePeriod): Drawing[] {
  const r = db.prepare('SELECT items FROM drawings WHERE stock = ? AND period = ?').get(stock, period) as { items: string } | undefined
  if (!r) return []
  try {
    return JSON.parse(r.items) as Drawing[]
  } catch {
    return []
  }
}

export function saveDrawings(db: Db, stock: string, period: KlinePeriod, items: Drawing[]): Drawing[] {
  db.prepare(
    'INSERT INTO drawings (stock, period, items, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(stock, period) DO UPDATE SET items = excluded.items, updated_at = excluded.updated_at',
  ).run(stock, period, JSON.stringify(items), new Date().toISOString())
  return items
}

/** 按条件删除画线:stock 必填,period/source 可选;返回删除行数 */
export function deleteDrawings(db: Db, stock: string, period?: KlinePeriod, source?: DrawingSource): number {
  const rows = getDrawings(db, stock, period ?? 'day')
  if (period) {
    const kept = source ? rows.filter((d) => d.source !== source) : []
    if (kept.length !== rows.length) saveDrawings(db, stock, period, kept)
    return rows.length - kept.length
  }
  // 全部周期
  const periods = ['day', 'week', 'month'] as const
  let removed = 0
  for (const p of periods) {
    const list = getDrawings(db, stock, p)
    const kept = source ? list.filter((d) => d.source !== source) : []
    if (kept.length !== list.length) saveDrawings(db, stock, p, kept)
    removed += list.length - kept.length
  }
  return removed
}

export function deleteDrawingById(db: Db, stock: string, period: KlinePeriod, id: number): boolean {
  const rows = getDrawings(db, stock, period)
  const kept = rows.filter((d) => d.id !== id)
  if (kept.length === rows.length) return false
  saveDrawings(db, stock, period, kept)
  return true
}

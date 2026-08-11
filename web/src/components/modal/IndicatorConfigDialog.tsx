import { useState } from 'react'
import { LineStyle } from 'lightweight-charts'
import type { IndicatorConfig, IndicatorId } from '../../indicators/IndicatorController'
import { INDICATOR_META } from '../../indicators/editorMeta'
import { mergeLineStyle, type IndicatorLineStyle } from '../../indicators/SubChartIndicator'
import { IndicatorLineEditor, clampLineWidth, type LineDraft } from './IndicatorLineEditor'
import { PeriodLineRows } from './IndicatorPeriodEditor'

interface IndicatorConfigDialogProps {
  indicator: IndicatorId
  config: IndicatorConfig
  onChange: (config: IndicatorConfig) => void
  /** 关闭当前弹窗(由弹窗系统注入) */
  onDone: () => void
}

/** 数字参数草稿(原始文本,确定时解析) */
type NumDraft = Record<string, string>
/** 数组参数(周期列表)草稿:每个元素为一行原始文本 */
type ArrayDraft = Record<string, string[]>

function parseNum(s: string): number | null {
  const n = Number.parseFloat(s)
  return Number.isFinite(n) && n > 0 ? n : null
}

function lineDraftFromStyle(s: IndicatorLineStyle): LineDraft {
  return { color: s.color, width: String(s.width), style: s.style }
}

/** 指标配置弹窗:编辑该指标的全部可调参数 + 每条输出线的 线色/线宽/线型,确定后一次性写回 config */
export function IndicatorConfigDialog({ indicator, config, onChange, onDone }: IndicatorConfigDialogProps) {
  const meta = INDICATOR_META[indicator]
  const numParams = meta.params.filter((p) => p.kind === 'number')
  const arrParams = meta.params.filter((p) => p.kind === 'array')
  // inline:周期与输出线一一对应(周期+样式同行编辑,MA/EMA/WR);非 inline(如 BBI)编号行不内嵌样式,样式在下方单独编辑
  const inlineArrParams = arrParams.filter((p) => p.inlineLines)

  // 数字参数草稿(原始文本)
  const [numDraft, setNumDraft] = useState<NumDraft>(() =>
    Object.fromEntries(numParams.map((p) => [p.key, String(config[p.key])])),
  )
  // 数组参数(周期列表)草稿:每行一个输入
  const [arrDraft, setArrDraft] = useState<ArrayDraft>(() =>
    Object.fromEntries(arrParams.map((p) => [p.key, String(config[p.key]).split(',')])),
  )
  // 输出线样式草稿:config 覆盖优先,否则该线默认色
  const [lineDrafts, setLineDrafts] = useState<Record<string, LineDraft>>(() =>
    Object.fromEntries(
      meta.lines(config).map((l) => [
        l.key,
        lineDraftFromStyle(
          mergeLineStyle(config.lineStyles[indicator]?.[l.key], { color: l.defaultColor, width: 1, style: LineStyle.Solid }),
        ),
      ]),
    ),
  )

  /** 解析数组草稿为数字(供 lines 生成与提交) */
  function parseArr(key: string): number[] {
    return (arrDraft[key] ?? [])
      .map((s) => parseNum(s))
      .filter((n): n is number => n !== null)
  }

  /** 数组行数/值变化:更新草稿,并按新周期为新增输出线补默认样式 */
  function updateArr(key: string, values: string[]) {
    setArrDraft((d) => ({ ...d, [key]: values }))
    const parsed = values.map((s) => parseNum(s)).filter((n): n is number => n !== null)
    const eff = { ...config, [key]: parsed } as IndicatorConfig
    setLineDrafts((d) => {
      const next = { ...d }
      for (const l of meta.lines(eff)) if (!next[l.key]) next[l.key] = { color: l.defaultColor, width: '1', style: LineStyle.Solid }
      return next
    })
  }

  /** 提交:解析参数 → 组合输出线样式(线宽 clamp 到 1-4)→ 写回 config */
  function commit() {
    let next: IndicatorConfig = config
    for (const p of numParams) {
      const v = parseNum(numDraft[p.key] ?? '')
      if (v !== null) next = { ...next, [p.key]: v } as IndicatorConfig
    }
    for (const p of arrParams) next = { ...next, [p.key]: parseArr(p.key) } as IndicatorConfig
    const styles: Record<string, IndicatorLineStyle> = Object.fromEntries(
      Object.entries(lineDrafts).map(([k, d]) => [k, { color: d.color, width: clampLineWidth(d.width), style: d.style }]),
    )
    onChange({ ...next, lineStyles: { ...config.lineStyles, [indicator]: styles } })
    onDone()
  }

  // 输出线列表:MA/EMA 随周期草稿动态生成(新增周期即出现对应线)
  const lines = meta.lines(
    arrParams.reduce((acc, p) => ({ ...acc, [p.key]: parseArr(p.key) }) as IndicatorConfig, config),
  )

  return (
    <div className="flex flex-col gap-2.5">
      {numParams.length > 0 && (
        <div className="flex flex-col gap-2">
          {numParams.map((p) => (
            <label key={p.key} className="flex items-center justify-between gap-2">
              <span className="whitespace-nowrap text-muted">{p.label}</span>
              <input
                className="w-36 rounded-md border-none bg-input px-2.5 py-1.5 text-right text-sm tabular-nums text-ink outline-none focus:ring-1 focus:ring-accent"
                value={numDraft[p.key] ?? ''}
                onChange={(e) => setNumDraft((d) => ({ ...d, [p.key]: e.target.value }))}
                inputMode="decimal"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit()
                }}
              />
            </label>
          ))}
        </div>
      )}

      {arrParams.map((p) => {
        const eff = { ...config, [p.key]: parseArr(p.key) } as IndicatorConfig
        return (
          <PeriodLineRows
            key={p.key}
            label={p.label}
            periods={arrDraft[p.key] ?? ['']}
            lines={meta.lines(eff)}
            drafts={lineDrafts}
            withStyle={!!p.inlineLines}
            onPeriods={(v) => updateArr(p.key, v)}
            onStyle={(lineKey, d) => setLineDrafts((prev) => ({ ...prev, [lineKey]: d }))}
          />
        )
      })}

      {inlineArrParams.length === 0 && lines.length > 0 && (
        <div className="flex flex-col gap-1">
          {lines.map((l) => (
            <IndicatorLineEditor
              key={l.key}
              label={l.label}
              draft={lineDrafts[l.key] ?? { color: l.defaultColor, width: '1', style: LineStyle.Solid }}
              onChange={(d) => setLineDrafts((prev) => ({ ...prev, [l.key]: d }))}
            />
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          className="cursor-pointer rounded-[4px] border border-border bg-transparent px-3.5 py-1.5 text-sm text-ink hover:bg-white/5"
          onClick={onDone}
        >
          取消
        </button>
        <button
          className="cursor-pointer rounded-[4px] border border-accent bg-accent px-3.5 py-1.5 text-sm text-white hover:bg-accent-hover"
          onClick={commit}
        >
          确定
        </button>
      </div>
    </div>
  )
}

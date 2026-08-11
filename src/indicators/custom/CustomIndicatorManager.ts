import type { IChartApi, MouseEventParams, Time } from 'lightweight-charts'
import type { KlineBar } from '../../types'
import { CustomIndicatorInstance } from './CustomIndicatorInstance'
import { CUSTOM_INDICATORS } from './registry'
import type { CustomIndicatorConfigEntry, CustomIndicatorDef } from './types'

/** 图例条目(与 IndicatorController.IndicatorLegendEntry 同构) */
export interface CustomLegendEntry {
  label: string
  value: string | null
  color: string
}

/** 当前配置签名(挂载位置/参数/样式/scale 任一变化都触发重建) */
function configSig(entries: Record<string, CustomIndicatorConfigEntry>): string {
  return JSON.stringify(entries)
}

/**
 * 自定义指标管理器(非 React):维护注册表(CUSTOM_INDICATORS)与实例生命周期。
 * - 挂载位置为实例级选择:config.custom[id].pane = 'overlay' | 'sub'
 * - overlay → 主图 pane 0 叠加;sub → 独立副图 pane(base 由 IndicatorController 传入,
 *   即 1 + 内置副图数;内置副图增减时经 setPaneBase 一并重建)
 * - 配置/基数变化时销毁重建;update/crosshair/legend 分发到各实例
 */
export class CustomIndicatorManager {
  private _chart: IChartApi
  private _config: Record<string, CustomIndicatorConfigEntry> = {}
  private _paneBase = 1
  private _lastSig: string | null = null
  private _instances = new Map<string, CustomIndicatorInstance>()
  /** 最近一次数据(实例重建后回填;否则配置/激活变化触发重建时新实例无数据不显示) */
  private _bars: KlineBar[] = []

  constructor(chart: IChartApi) {
    this._chart = chart
  }

  /** 自定义指标定义注册(供 defineIndicator 使用) */
  register(def: CustomIndicatorDef): void {
    CUSTOM_INDICATORS.set(def.id, def)
  }

  getDef(id: string): CustomIndicatorDef | undefined {
    return CUSTOM_INDICATORS.get(id)
  }

  listDefs(): CustomIndicatorDef[] {
    return [...CUSTOM_INDICATORS.values()]
  }

  /** 设置自定义指标配置(来自 IndicatorController.setConfig) */
  setConfig(custom: Record<string, CustomIndicatorConfigEntry>): void {
    this._config = custom
    this._rebuildIfNeeded()
  }

  /** 副图 pane 基数(内置副图数 + 1);内置副图变化时调用,自定义副图整体重建 */
  setPaneBase(base: number): void {
    if (base === this._paneBase) return
    this._paneBase = base
    this._rebuildIfNeeded()
  }

  /** 数据更新:缓存后分发到各实例(重建回填用) */
  update(bars: KlineBar[]): void {
    this._bars = bars
    for (const inst of this._instances.values()) inst.update(bars)
  }

  /** 十字光标移动:分发到各实例(更新角标与图例值) */
  applyCrosshair(param: MouseEventParams<Time>): void {
    for (const inst of this._instances.values()) inst.applyCrosshair(param)
  }

  /** 全部实例的图例条目(供 IndicatorController 合并进左上图例) */
  legendEntries(): CustomLegendEntry[] {
    const out: CustomLegendEntry[] = []
    for (const inst of this._instances.values()) out.push(...inst.legendEntries())
    return out
  }

  dispose(): void {
    for (const inst of this._instances.values()) inst.dispose()
    this._instances.clear()
    this._lastSig = null
  }

  /** 配置或 pane 基数变化时重建全部实例(轻量:series 较少,重建成本可接受) */
  private _rebuildIfNeeded(): void {
    const sig = configSig(this._config) + '|' + this._paneBase
    if (sig === this._lastSig) return
    this._lastSig = sig

    for (const inst of this._instances.values()) inst.dispose()
    this._instances.clear()

    // 按注册顺序创建已启用的实例;sub 依次占用 paneBase 起的 pane
    let subIdx = 0
    for (const def of CUSTOM_INDICATORS.values()) {
      const entry = this._config[def.id]
      if (!entry || !entry.enabled) continue
      const paneIndex = entry.pane === 'sub' ? this._paneBase + subIdx++ : null
      this._instances.set(def.id, new CustomIndicatorInstance(this._chart, def, entry, paneIndex))
    }

    // 重建后回填当前数据:实例构造只建 series,数据靠 update 注入;
    // 否则激活/配置变化触发重建后新实例无数据,需刷新或等下一次 bars 更新才显示
    if (this._bars.length > 0) {
      for (const inst of this._instances.values()) inst.update(this._bars)
    }
  }
}

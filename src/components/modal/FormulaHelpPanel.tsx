import type { ReactNode } from 'react'
import { BaseModal } from './BaseModal'

/** 悬浮说明面板宽度(px);位于对话框左侧、通高悬浮 */
const PANEL_WIDTH = 320

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h4 className="m-0 text-[11px] font-semibold text-ink">{title}</h4>
      {children}
    </section>
  )
}

/** 行内代码/关键字高亮 */
function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-panel px-1 py-px font-mono text-[11px] text-accent">{children}</code>
}

function Bullet({ children }: { children: ReactNode }) {
  return <li className="leading-relaxed">{children}</li>
}

/**
 * 自定义指标公式特性说明(悬浮面板):在自定义指标弹窗"公式"标签旁的问号图标触发,
 * 经 BaseModal placement="float" 在弹窗左侧通高悬浮,滚动展示公式 DSL 全部能力与综合示例。
 * 纯内容组件,不自建面板外壳(见 src/components/CLAUDE.md 规则 1)。
 */
export function FormulaHelpPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <BaseModal
      placement="float"
      x={-(PANEL_WIDTH + 12)}
      y={0}
      width={PANEL_WIDTH}
      className="h-full"
      title="公式特性说明"
      onClose={onClose}
    >
      <div className="flex flex-col gap-3 text-xs leading-relaxed text-muted">
        <Section title="数据字段">
          <p className="m-0">
            <Code>CLOSE(C) / OPEN(O) / HIGH(H) / LOW(L) / VOLUME(V)</Code>
            :收盘 / 开盘 / 最高 / 最低 / 成交量,序列长度与 K 线数一致;大小写不敏感,支持单字母简写。
          </p>
        </Section>

        <Section title="指标成员引用">
          <ul className="m-0 flex flex-col gap-1 pl-4">
            <Bullet>
              多输出:<Code>KDJ().K/.D/.J</Code>、<Code>MACD().DIF/.DEA/.MACD</Code>、<Code>BOLL().MID/.UPPER/.LOWER</Code>、<Code>DMI().PDI/.MDI/.ADX/.ADXR</Code>
            </Bullet>
            <Bullet>
              单输出直接返回:<Code>RSI()</Code> / <Code>CCI()</Code> / <Code>ATR()</Code> / <Code>OBV()</Code> / <Code>BBI()</Code>
            </Bullet>
            <Bullet>
              参数缺省按默认补齐(如 <Code>KDJ(9)</Code>、<Code>MACD(5)</Code>);<Code>BBI(5,10,20)</Code> 传周期列表;也可省略括号写 <Code>KDJ.J</Code>
            </Bullet>
          </ul>
        </Section>

        <Section title="值级函数">
          <ul className="m-0 flex flex-col gap-1 pl-4">
            <Bullet>
              <Code>SMA(v,n)</Code> / <Code>MA(v,n)</Code>:简单均线;<Code>EMA(v,n)</Code>:指数均线
            </Bullet>
            <Bullet>
              <Code>STDDEV(v,n)</Code>:标准差;<Code>SUM(v,n)</Code>:滚动求和
            </Bullet>
            <Bullet>
              <Code>HHV(v,n)</Code> / <Code>LLV(v,n)</Code>:n 周期最高 / 最低
            </Bullet>
            <Bullet>
              <Code>WILDER(v,n)</Code>:Wilder 平滑(RSI/ATR 用);<Code>REF(v,n)</Code>:前移 n 根
            </Bullet>
            <Bullet>
              <Code>ABS(v)</Code>:绝对值;<Code>MAX(a,b)</Code> / <Code>MIN(a,b)</Code>:逐元素最大 / 最小(可传数字常量)
            </Bullet>
            <Bullet>
              <Code>CROSSOVER(a,b)</Code> / <Code>CROSSUNDER(a,b)</Code>:上穿 / 下穿(1/0)
            </Bullet>
          </ul>
        </Section>

        <Section title="运算符与语法">
          <p className="m-0">
            支持 <Code>+ - * / ( )</Code> 与函数嵌套;数字常量自动广播为等长序列;除零 / 无效点输出空(渲染跳过);
            公式保存前实时校验,错误会标出位置。
          </p>
        </Section>

        <Section title="输出形态">
          <ul className="m-0 flex flex-col gap-1 pl-4">
            <Bullet>
              折线 <Code>line</Code> / 面积 <Code>area</Code> / 柱状 <Code>histogram</Code>
            </Bullet>
            <Bullet>
              基线 <Code>baseline</Code>:以基准值(默认 0)为界上下分色
            </Bullet>
            <Bullet>
              区间 <Code>band</Code>:上下轨之间半透明填充,需单独填写下轨公式
            </Bullet>
          </ul>
        </Section>

        <Section title="多输出脚本">
          <ul className="m-0 flex flex-col gap-1 pl-4">
            <Bullet>
              每行 <Code>NAME = EXPR</Code>(换行或 <Code>;</Code> 分隔),EXPR 可引用前面行的 NAME
            </Bullet>
            <Bullet>
              每条输出可独立选形态、调色 / 线宽 / 线型;band 需填下轨公式,baseline 可设基准值
            </Bullet>
            <Bullet>
              每条输出还可独立设 <strong>显示名</strong>、<strong>Y 轴</strong>(主轴 / 独立轴)、<strong>显示开关</strong>(隐藏的线仍参与计算、可被引用,只是不渲染)
            </Bullet>
            <Bullet>
              输出名不能用保留字(字段 / 函数名)、不能重复、不能前向引用
            </Bullet>
            <Bullet>
              用 <Code>NAME := EXPR</Code> 定义<strong>私有中间变量</strong>:只参与计算、可被后续行引用,不单独渲染(如 <Code>MID := SMA(C,20)</Code>);<Code>NAME = EXPR</Code> 则是输出线
            </Bullet>
          </ul>
        </Section>

        <Section title="挂载位置与 Y 轴">
          <ul className="m-0 flex flex-col gap-1 pl-4">
            <Bullet>
              挂载:主图叠加(数值需与价格同量级)或副图(独立 pane,自动适配)
            </Bullet>
            <Bullet>
              Y 轴:主轴(与所在 pane 共用)或独立轴(自适配;振荡类指标建议独立轴或副图)
            </Bullet>
          </ul>
        </Section>

        <Section title="综合示例">
          <pre className="m-0 overflow-x-auto rounded-md bg-panel px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink">
{`DIF  = EMA(CLOSE,12) - EMA(CLOSE,26)
DEA  = EMA(DIF,9)
MACD = (DIF - DEA) * 2
MID := SMA(CLOSE,20)
UP   = MID + STDDEV(C,20)*2
DEV  = C - MID`}
          </pre>
          <ul className="m-0 flex flex-col gap-1 pl-4">
            <Bullet>
              <Code>DIF</Code> / <Code>DEA</Code> 设为折线,<Code>MACD</Code> 设为柱状
            </Bullet>
            <Bullet>
              <Code>UP</Code> 设为区间,下轨公式填 <Code>MID - STDDEV(C,20)*2</Code>
            </Bullet>
            <Bullet>
              <Code>DEV</Code> 设为基线,基准值 0;挂载选副图
            </Bullet>
            <Bullet>
              <Code>MID := ...</Code> 是私有中间变量:参与计算、被上面引用,不单独渲染
            </Bullet>
          </ul>
        </Section>
      </div>
    </BaseModal>
  )
}
import type { CustomIndicatorDef } from './types'

/**
 * 自定义指标注册表:defineIndicator/defineFormulaIndicator 产出后经 manager.register()
 * 或 userFormulas.registerUserFormula() 登记。
 * 注册顺序 = 启用顺序(副图 pane 排列);顶栏展示的「用户公式指标」取自 USER_FORMULA_RECORDS。
 */
export const CUSTOM_INDICATORS = new Map<string, CustomIndicatorDef>()

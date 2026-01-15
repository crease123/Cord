import { cloneDeep, orderBy } from 'lodash-es'
import { getLogger } from '@fe/utils'
import type { Action, ActionHandler, BuildInActionName } from '@fe/types'
import { triggerHook } from './hook'
import * as ioc from './ioc'

const logger = getLogger('action')

export type HookType = 'before-run' | 'after-run'

const actions: { [id: string]: Action<string> } = {}

/**
 * Get all actions
 * @returns all actions
 */
export function getRawActions (): Action[] {
  return orderBy(cloneDeep(Object.values(actions)), 'name')
}

/**
 * Register a action tapper.
 * @param tapper
 */
export function tapAction (tapper: (action: Action) => void) {
  ioc.register('ACTION_TAPPERS', tapper)
}

/**
 * Remove a action tapper.
 * @param tapper
 */
export function removeActionTapper (tapper: (action: Action) => void) {
  ioc.remove('ACTION_TAPPERS', tapper)
}

/**
 * Register an action.
 * @param action
 * @returns action
 */
export function registerAction<T extends string> (action: Action<T>) {
  logger.debug('registerAction', action.name)
  actions[action.name] = action
  return action
}

/**
 * 获取 Action 的执行器（Handler）
 *
 * 这是 Action 系统最核心的函数，返回一个"包装后的执行函数"
 * 包装函数在执行时会：
 * 1. 触发 ACTION_BEFORE_RUN 钩子（可被拦截）
 * 2. 检查 when 条件
 * 3. 执行原始 handler
 * 4. 触发 ACTION_AFTER_RUN 钩子
 *
 * @param name - Action 的名称，如 'doc.save', 'view.render'
 * @returns 包装后的执行函数
 *
 * @example
 * // 获取并执行
 * const handler = getActionHandler('doc.save')
 * handler()  // 执行保存操作
 *
 * // 也可以一步完成
 * getActionHandler('view.render')()
 */
// 函数重载声明 1：当 name 是内置 Action 名称时，返回对应类型的 Handler
export function getActionHandler <T extends BuildInActionName> (name: T): ActionHandler<T>
// 函数重载声明 2：当 name 是任意字符串时，返回通用 Handler
export function getActionHandler <T extends string> (name: T): ActionHandler<T>
// 函数实现（处理所有重载情况）
export function getActionHandler <T extends string> (name: T): ActionHandler<T> {
  // 调试日志：记录正在获取哪个 action 的 handler
  logger.debug('getActionHandler', name)

  // 返回一个包装函数（代理模式）
  // 这个函数在被调用时才会真正执行 action
  return ((...args: any[]) => {
    // ========== 第1步：触发"执行前"钩子 ==========
    // breakable: true 表示如果某个钩子返回 true，可以阻止后续执行
    // 使用场景：在执行前做验证、拦截、确认等
    triggerHook('ACTION_BEFORE_RUN', { name }, { breakable: true })

    // 用于存储 handler 的执行结果
    let result: any

    // ========== 第2步：获取 action 对象 ==========
    const action = getAction(name)

    // 如果 action 存在
    if (action) {
      // ========== 第3步：检查 when 条件 ==========
      // 条件解析：!(action.when && !action.when())
      //
      // 情况1: action.when 不存在（undefined）
      //        → action.when && !action.when() = false
      //        → !false = true → 执行 ✓
      //
      // 情况2: action.when 存在且返回 true
      //        → action.when && !true = false
      //        → !false = true → 执行 ✓
      //
      // 情况3: action.when 存在且返回 false
      //        → action.when && !false = true
      //        → !true = false → 不执行 ✗
      //
      // 简化理解：只有 when() 返回 false 时才不执行
      if (!(action.when && !action.when())) {
        // ========== 第4步：执行原始 handler ==========
        // apply(null, args) 相当于 handler(...args)
        // 使用 apply 可以传递任意数量的参数
        // ?. 是可选链，防止 handler 为 undefined
        result = (action.handler)?.apply(null, args)
      }
    }

    // ========== 第5步：触发"执行后"钩子 ==========
    // 无论是否真正执行了 handler，都会触发此钩子
    // 使用场景：记录日志、更新状态、触发副作用等
    triggerHook('ACTION_AFTER_RUN', { name }, { breakable: true })

    // 返回 handler 的执行结果
    return result
  }) as ActionHandler<T>  // 类型断言，确保返回类型正确
}

/**
 * 获取 Action 对象（带 Tapper 处理）
 *
 * 获取流程：
 * 1. 从 actions 对象中取出 action
 * 2. 深拷贝（防止修改原对象）
 * 3. 应用所有已注册的 tappers（允许修改 action 属性）
 * 4. 返回处理后的 action
 *
 * @param name - Action 名称
 * @returns Action 对象或 undefined（如果不存在）
 *
 * @example
 * const action = getAction('doc.save')
 * if (action) {
 *   console.log(action.keys)  // 快捷键
 *   console.log(action.description)  // 描述
 * }
 */
// 函数重载声明 1：内置 Action 名称 → 返回对应类型
export function getAction <T extends BuildInActionName> (name: T): Action<T> | undefined
// 函数重载声明 2：任意字符串 → 返回通用类型
export function getAction <T extends string>(name: T): Action<T> | undefined
// 函数实现
export function getAction (name: string) {
  // ========== 第1步：深拷贝 action ==========
  // 使用 lodash 的 cloneDeep 进行深拷贝
  // 目的：防止调用者修改原始 action 对象
  // 如果 actions[name] 不存在，cloneDeep(undefined) 返回 undefined
  const action = cloneDeep(actions[name])

  // 如果 action 存在
  if (action) {
    // ========== 第2步：应用所有 Tappers ==========
    // Tapper 是一种修改器，可以在获取 action 时动态修改其属性
    // 使用场景：
    // - 动态修改快捷键
    // - 翻译 description
    // - 根据上下文修改 when 条件
    const tappers = ioc.getRaw('ACTION_TAPPERS')

    // 依次调用每个 tapper，传入 action 对象
    // tapper 可以直接修改 action 的属性（因为是拷贝，不影响原对象）
    tappers?.forEach(tap => tap(action))
  }

  // 返回处理后的 action（如果不存在则返回 undefined）
  return action
}

/**
 * Remove an action.
 * @param name
 */
export function removeAction (name: BuildInActionName): void
export function removeAction (name: string): void
export function removeAction (name: string) {
  logger.debug('removeAction', name)
  const action = getAction(name)
  if (action) {
    delete actions[name]
  }
}

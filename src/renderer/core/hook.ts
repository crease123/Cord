/**
 * 钩子系统模块
 * 提供事件驱动的钩子机制，允许插件和其他模块在特定事件发生时执行自定义逻辑
 */

// 导入钩子类型定义
import type { BuildInHookTypes } from '@fe/types'
// 导入日志记录工具
import { getLogger } from '@fe/utils/pure'
// 导入依赖注入容器
import * as ioc from './ioc'

/**
 * 钩子类型：所有内置钩子类型的键名
 */
export type HookType = keyof BuildInHookTypes

/**
 * 钩子函数类型定义
 * @param T 钩子接收的参数类型
 * @returns 返回值可以是布尔值、void 或相应的Promise
 *         当返回 true 时，如果钩子是可中断的，则停止执行后续钩子
 */
export type HookFun<T> = (arg: T) => (boolean | void | Promise<boolean | void>)

/**
 * 钩子对象结构
 * @template T 钩子参数类型
 */
export type Hook<T> = {
  /** 钩子执行函数 */
  fun: HookFun<T>,
  /** 是否只执行一次 */
  once: boolean,
}

/**
 * 无载荷的钩子类型
 * 提取 BuildInHookTypes 中值为 never 的键名，即不需要参数的钩子类型
 */
export type HookTypeWithoutPayload = { [K in keyof BuildInHookTypes]: BuildInHookTypes[K] extends never ? K : never }[keyof BuildInHookTypes]

/**
 * 有载荷的钩子类型
 * 除了无载荷钩子外的所有钩子类型
 */
export type HookTypeWithPayload = keyof Omit<BuildInHookTypes, HookTypeWithoutPayload>

// 钩子系统日志记录器
const logger = getLogger('hook')

/**
 * 注册一个钩子
 * 将指定的函数注册到指定类型的钩子列表中
 * 
 * @template T 钩子类型，必须是 HookType 的子类型
 * @param type 钩子类型
 * @param fun 钩子执行函数
 * @param once 是否只执行一次，默认为 false
 */
export function registerHook<T extends HookType> (type: T, fun: HookFun<BuildInHookTypes[T]>, once = false) {
  // 将钩子函数和执行次数配置注册到 IOC 容器中
  ioc.register(type, { fun, once })
}

/**
 * 移除一个钩子
 * 从指定类型的钩子列表中移除指定的函数
 * 
 * @template T 钩子类型，必须是 HookType 的子类型
 * @param type 钩子类型
 * @param fun 要移除的钩子执行函数
 */
export function removeHook<T extends HookType> (type: T, fun: HookFun<BuildInHookTypes[T]>) {
  // 从 IOC 容器中移除匹配的钩子函数
  ioc.removeWhen(type, item => item.fun === fun)
}

/**
 * 触发一个钩子
 * 执行指定类型的所有已注册钩子函数
 * 
 * 函数重载定义：
 * 1. 无载荷无选项的钩子触发
 * 2. 无载荷但可中断的钩子触发
 * 3. 有载荷无选项的钩子触发
 * 4. 有载荷且可中断的钩子触发
 * 5. 有载荷但不可中断的钩子触发
 * 6. 通用钩子触发函数
 * 
 * @template T 钩子类型
 * @param type 钩子类型
 * @param arg 钩子参数（可选）
 * @param options 钩子执行选项
 * @param options.breakable 是否可中断，如果为 true，当某个钩子返回 true 时停止执行后续钩子
 * @param options.ignoreError 是否忽略错误，如果为 true，捕获异常但不抛出
 * @returns 当 breakable 为 true 时返回 boolean，否则返回 void
 */
export async function triggerHook<T extends HookTypeWithoutPayload> (type: T): Promise<void>
export async function triggerHook<T extends HookTypeWithoutPayload> (type: T, arg: undefined, options: { breakable: true }): Promise<void>
export async function triggerHook<T extends HookTypeWithPayload> (type: T, arg: BuildInHookTypes[T]): Promise<void>
export async function triggerHook<T extends HookTypeWithPayload> (type: T, arg: BuildInHookTypes[T], options: { breakable: true, ignoreError?: boolean }): Promise<boolean>
export async function triggerHook<T extends HookTypeWithPayload> (type: T, arg: BuildInHookTypes[T], options?: { breakable?: false, ignoreError?: boolean }): Promise<void>
export async function triggerHook<T extends HookType> (type: T, arg?: BuildInHookTypes[T], options?: { breakable?: boolean, ignoreError?: boolean }): Promise<boolean | void> {
  // 记录钩子触发日志
  logger.debug('triggerHook', type, arg)
  
  // 从 IOC 容器中获取指定类型的所有钩子
  const items: Hook<any>[] = ioc.get(type)
  
  // 遍历执行所有钩子
  for (const { fun, once } of items) {
    // 如果是只执行一次的钩子，则在执行前将其从容器中移除
    once && removeHook<any>(type, fun)
    
    try {
      // 如果设置了可中断选项
      if (options?.breakable) {
        // 异步执行钩子函数并检查返回值
        if (await fun(arg)) {
          // 如果钩子返回 true，记录中断日志并返回 true
          logger.debug('triggerHook', 'break', fun)
          return true
        }
      } else {
        // 不可中断的情况下直接执行钩子函数
        fun(arg)
      }
    } catch (error) {
      // 如果设置了忽略错误选项
      if (options?.ignoreError) {
        // 输出警告日志但不抛出错误
        console.warn('triggerHook', error)
      } else {
        // 否则重新抛出错误
        throw error
      }
    }
  }

  // 如果设置了可中断选项但没有钩子返回 true，则返回 false
  if (options?.breakable) {
    return false
  }
}

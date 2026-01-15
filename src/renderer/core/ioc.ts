/**
 * IoC (Inversion of Control) 容器模块
 *
 * 这是 Yank Note 的核心依赖注入容器，实现了服务定位器模式。
 * 所有插件、钩子、渲染器等组件都通过此容器进行注册和获取。
 *
 * 核心特点：
 * 1. 多值存储：同一类型可注册多个组件（数组存储）
 * 2. 类型安全：通过 TypeScript 泛型约束键值对应关系
 * 3. 版本追踪：每次修改都会更新 _version，支持响应式检测
 */

import type { BuildInIOCTypes } from '@fe/types'

/**
 * IoC 容器核心数据结构
 *
 * 结构示例：
 * {
 *   'VIEW_PREVIEWER': [previewer1, previewer2],     // 预览器列表
 *   'CODE_RUNNER': [runner1, runner2, runner3],    // 代码运行器列表
 *   'RENDERERS': [renderer1],                       // 渲染器列表
 *   'DOC_SWITCHED': [hook1, hook2],                // 钩子列表
 * }
 *
 * 类型说明：
 * - Record<string, any[]>：键是字符串，值是数组
 * - 虽然值类型是 any[]，但通过泛型函数保证类型安全
 */
const container: Record<string, any[]> = {}

/**
 * 更新数组的版本号
 *
 * 每次容器内容发生变化时调用，用于：
 * 1. 检测容器是否被修改
 * 2. 配合 Vue 响应式系统触发更新
 *
 * @param items - 要更新版本的数组
 *
 * @example
 * // 数组会有一个隐藏的 _version 属性
 * container['VIEW_PREVIEWER']._version // 3（表示修改了3次）
 */
function updateVersion (items: any) {
  items._version = (items._version || 0) + 1
}

/**
 * 获取指定类型的所有组件（返回副本）
 *
 * @template T - 组件类型的键名，必须是 BuildInIOCTypes 的键
 * @param type - 要获取的组件类型
 * @returns 该类型所有组件的数组副本（浅拷贝）
 *
 * @example
 * // 获取所有预览器
 * const previewers = ioc.get('VIEW_PREVIEWER')
 * // previewers: Previewer[]
 *
 * // 获取所有代码运行器
 * const runners = ioc.get('CODE_RUNNER')
 * // runners: CodeRunner[]
 *
 * @note 返回副本的原因：
 * 1. 防止调用者意外修改容器内容
 * 2. 遍历时容器被修改不会出问题
 */
export function get<T extends keyof BuildInIOCTypes> (type: T): BuildInIOCTypes[T][] {
  // [...array] 创建浅拷贝，|| [] 处理类型不存在的情况
  return [...(container[type] || [])]
}

/**
 * 获取指定类型的原始数组引用（不是副本）
 *
 * @template T - 组件类型的键名
 * @param type - 要获取的组件类型
 * @returns 原始数组引用（带 _version 属性），如果类型不存在则返回 undefined
 *
 * @example
 * // 获取原始数组并排序（会修改原数组）
 * const renderers = ioc.getRaw('RENDERERS')
 * renderers?.sort((a, b) => a.order - b.order)
 *
 * // 检查版本号
 * const version = ioc.getRaw('VIEW_PREVIEWER')?._version
 *
 * @warning 直接操作原数组可能影响其他使用者，谨慎使用
 */
export function getRaw<T extends keyof BuildInIOCTypes> (type: T): (BuildInIOCTypes[T][] & { _version: number }) | undefined {
  return container[type] as (BuildInIOCTypes[T][] & { _version: number })
}

/**
 * 注册一个组件到容器
 *
 * @template T - 组件类型的键名，限制为 BuildInIOCTypes 的键
 * @param type - 组件类型（如 'VIEW_PREVIEWER', 'CODE_RUNNER' 等）
 * @param item - 要注册的组件实例，类型由 T 自动推断
 *
 * @example
 * // 注册预览器（item 类型自动推断为 Previewer）
 * ioc.register('VIEW_PREVIEWER', {
 *   name: 'my-previewer',
 *   component: MyPreviewerComponent
 * })
 *
 * // 注册代码运行器（item 类型自动推断为 CodeRunner）
 * ioc.register('CODE_RUNNER', {
 *   name: 'python',
 *   match: (lang) => lang === 'python',
 *   run: async (code) => { ... }
 * })
 *
 * 类型安全示例：
 * // ✅ 正确
 * ioc.register('VIEW_PREVIEWER', validPreviewer)
 *
 * // ❌ 编译错误：类型不匹配
 * ioc.register('VIEW_PREVIEWER', { wrong: 'data' })
 *
 * // ❌ 编译错误：无效的类型键
 * ioc.register('INVALID_TYPE', anything)
 */
export function register<T extends keyof BuildInIOCTypes> (type: T, item: BuildInIOCTypes[T]) {
  // 如果该类型还没有数组，先创建空数组
  if (!container[type]) {
    container[type] = []
  }

  // 更新版本号，标记容器已修改
  updateVersion(container[type])

  // 将组件添加到数组末尾
  container[type].push(item)
}

/**
 * 从容器中移除指定的组件
 *
 * @template T - 组件类型的键名
 * @param type - 组件类型
 * @param item - 要移除的组件实例（必须是同一个引用）
 *
 * @example
 * const myPreviewer = { name: 'my', component: MyComp }
 * ioc.register('VIEW_PREVIEWER', myPreviewer)
 *
 * // 移除时必须传入同一个对象引用
 * ioc.remove('VIEW_PREVIEWER', myPreviewer) // ✅ 成功移除
 *
 * // 传入新对象无法移除（引用不同）
 * ioc.remove('VIEW_PREVIEWER', { name: 'my', component: MyComp }) // ❌ 无法移除
 *
 * @note 使用 indexOf 进行引用比较，必须是同一个对象才能匹配
 */
export function remove<T extends keyof BuildInIOCTypes> (type: T, item: BuildInIOCTypes[T]) {
  if (container[type]) {
    // indexOf 使用引用比较（===）
    const idx = container[type].indexOf(item)
    if (idx > -1) {
      // splice(idx, 1) 删除索引位置的1个元素
      container[type].splice(idx, 1)
    }
    updateVersion(container[type])
  }
}

/**
 * 按条件移除组件
 *
 * @template T - 组件类型的键名
 * @param type - 组件类型
 * @param when - 判断函数，返回 true 时移除该组件
 *
 * @example
 * // 移除所有 name 为 'temp' 的预览器
 * ioc.removeWhen('VIEW_PREVIEWER', (item) => item.name === 'temp')
 *
 * // 移除所有 order 小于 0 的渲染器
 * ioc.removeWhen('RENDERERS', (item) => (item.order || 0) < 0)
 *
 * 实际使用场景（hook.ts 中）：
 * // 移除特定的钩子函数
 * ioc.removeWhen(type, item => item.fun === targetFun)
 *
 * @note 使用倒序遍历，避免删除元素时索引错乱
 */
export function removeWhen <T extends keyof BuildInIOCTypes> (type: T, when: (item: BuildInIOCTypes[T]) => boolean) {
  if (container[type]) {
    const items = container[type]
    // 倒序遍历：从后往前删除，避免索引错乱
    // 正序删除 [A,B,C] 中的 A 后，B 会变成索引 0，导致跳过
    for (let i = items.length - 1; i >= 0; i--) {
      if (when(items[i])) {
        items.splice(i, 1)
        updateVersion(container[type])
      }
    }
  }
}

/**
 * 清空指定类型的所有组件
 *
 * @template T - 组件类型的键名
 * @param type - 要清空的组件类型
 *
 * @example
 * // 清空所有预览器
 * ioc.removeAll('VIEW_PREVIEWER')
 *
 * @note array.length = 0 是清空数组的高效方式
 * 优点：保持原数组引用不变，已持有引用的地方会同步更新
 */
export function removeAll<T extends keyof BuildInIOCTypes> (type: T) {
  if (container[type]) {
    // 设置 length = 0 清空数组，比 container[type] = [] 更高效
    // 且保持原数组引用不变
    container[type].length = 0
    updateVersion(container[type])
  }
}

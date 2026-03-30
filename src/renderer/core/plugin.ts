import { getLogger } from '@fe/utils'

const logger = getLogger('plugin')


export interface Plugin<Ctx = any> {
  //插件的唯一标识符
  name: string;
  //插件的注册函数，当插件被加载时会调用此函数，返回值会作为插件的 API
  register?: (ctx: Ctx) => any;
}

const plugins: {[name: string]: Plugin} = {}
const apis: {[name: string]: any} = {}

/**
 * Register a plugin.
 * @param plugin
 * @param ctx
 */
export function register <Ctx> (plugin: Plugin<Ctx>, ctx: Ctx) {
  logger.debug('register', plugin)

  if (plugins[plugin.name]) {
    logger.error(`Plugin [${plugin.name}] already registered.`)
    return
  }

  plugins[plugin.name] = plugin
  // 如果 plugin 有 register 方法，调用它并返回结果
  // 如果没有，返回 undefined
  // 这样可以确保 getApi 只返回有 register 方法的插件
  apis[plugin.name] = plugin.register && plugin.register(ctx)
}

/**
 * Get a plugin exported api.
 * @param name
 * @returns
 */
export function getApi <T = any> (name: string): T {
  return apis[name]
}

/**
 * Initialization plugin system and register build-in plugins
 * @param plugins
 * @param ctx
 */
export function init <Ctx> (plugins: Plugin[], ctx: Ctx) {
  logger.debug('init')
  //  1. 遍历并注册所有内置插件
  plugins.forEach((plugin) => {
    register(plugin, ctx)
  })
  // 2. 暴露 registerPlugin 函数，允许外部脚本动态注册插件
  window.registerPlugin = (plugin: Plugin) => register(plugin, ctx)

  // 3. 加载外部插件脚本
  // 这将触发外部插件的注册
  const script = window.document.createElement('script')
  script.src = '/api/plugins'
  window.document.body.appendChild(script)
}

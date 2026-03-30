import { app, session } from 'electron'
import { registerAction } from './action'
import config from './config'

// 配置项的键名常量定义
const keyEnabled = 'proxy.enabled'      // 代理启用状态的配置键
const keyServer = 'proxy.server'        // 代理服务器地址的配置键
const keyPacUrl = 'proxy.pac-url'       // PAC脚本URL的配置键
const keyBypassList = 'proxy.bypass-list' // 代理绕过列表的配置键

/**
 * 初始化代理设置
 * 在应用启动时读取配置并设置命令行代理参数
 * 注意：此方法只在应用启动时生效，运行时需要使用 reloadProxy 方法
 */
export function initProxy () {
  // 从配置中读取代理是否启用，默认为 false
  const proxyEnabled = config.get(keyEnabled, false)
  console.log('use proxy:', proxyEnabled)

  // 从配置中读取代理服务器地址，默认为空字符串
  const proxyServer = config.get(keyServer, '')
  // 只有当代理启用、服务器地址存在且包含端口号（有冒号）时才配置代理
  if (proxyEnabled && proxyServer && proxyServer.includes(':')) {
    // 读取PAC脚本URL配置
    const proxyPacUrl = config.get(keyPacUrl, '')
    // 读取代理绕过列表配置，默认为 '<local>'（本地地址不经过代理）
    const proxyBypassList = config.get(keyBypassList, '<local>')

    // 输出代理配置信息到控制台
    console.log('proxy server:', proxyServer)
    console.log('proxy pac-url:', proxyPacUrl)
    console.log('proxy bypass-list:', proxyBypassList)

    // 将代理配置添加到 Electron 命令行开关
    // 这些参数会在 Chromium 网络层生效
    app.commandLine.appendSwitch('proxy-server', proxyServer)
    // 如果配置了PAC URL，则添加PAC脚本参数
    proxyPacUrl && app.commandLine.appendSwitch('proxy-pac-url', proxyPacUrl)
    // 如果配置了绕过列表，则添加绕过参数
    proxyBypassList && app.commandLine.appendSwitch('proxy-bypass-list', proxyBypassList)
  }
}

/**
 * 重新加载代理配置
 * 用于应用运行时动态更新代理设置，无需重启应用
 * @param config - 包含代理配置的对象
 */
function reloadProxy (config: any) {
  console.log('reload proxy', config[keyEnabled])

  // 如果代理已启用，设置具体的代理规则
  if (config[keyEnabled]) {
    session.defaultSession.setProxy({
      proxyRules: config[keyServer],      // 代理服务器规则
      proxyBypassRules: config[keyBypassList], // 绕过代理的规则
      pacScript: config[keyPacUrl]        // PAC脚本内容或URL
    })
  } else {
    // 如果代理未启用，恢复为系统代理设置
    session.defaultSession.setProxy({ mode: 'system' })
  }
}

// 注册 'proxy.reload' 动作，允许其他模块调用以重新加载代理配置
registerAction('proxy.reload', reloadProxy)

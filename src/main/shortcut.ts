/**
 * @file shortcut.ts - 全局快捷键管理模块
 * @description 负责管理 Electron 应用的全局快捷键注册、自定义键位绑定和快捷键重载
 */
import * as os from 'os'
import { dialog, globalShortcut } from 'electron'
import { FLAG_DISABLE_SERVER } from './constant'
import { getAction, registerAction } from './action'
import config from './config'
import { getDefaultApplicationAccelerators } from '../share/misc'

// 获取当前操作系统平台
const platform = os.platform()

// 获取当前平台的默认应用快捷键列表
const accelerators = getDefaultApplicationAccelerators(platform)
// 定义快捷键命令的类型，从默认快捷键列表中提取
type AcceleratorCommand = (typeof accelerators)[0]['command']

// 存储当前已注册的快捷键命令及其回调函数
let currentCommands: {[key in AcceleratorCommand]?: () => void}

/**
 * 获取指定命令的快捷键字符串
 * 优先使用用户自定义的键位绑定，如果没有则返回默认快捷键
 * 
 * @param command - 快捷键命令名称
 * @returns 快捷键字符串（如 "CmdOrCtrl+Shift+S"）或 undefined
 */
export const getAccelerator = (command: AcceleratorCommand): string | undefined => {
  // 从配置中获取用户自定义的键位绑定
  const customKeybinding = config.get('keybindings', [])
    .find((item: any) => item.type === 'application' && item.command === command)

  if (customKeybinding) {
    const keys = customKeybinding.keys

    if (keys) {
      // 将键盘事件代码转换为人类可读的快捷键格式
      // 移除 Arrow、Key、Digit 等前缀
      return keys.replace(/(Arrow|Key|Digit)/ig, '')
        // 数字键盘特殊键位转换
        .replace(/NumpadAdd/ig, 'numadd')
        .replace(/NumpadSubtract/ig, 'numsub')
        .replace(/NumpadMultiply/ig, 'nummult')
        .replace(/NumpadDivide/ig, 'numdiv')
        .replace(/NumpadDecimal/ig, 'numdec')
        .replace(/Numpad/ig, 'num')
    } else {
      // 如果自定义键位为空，返回 undefined
      return undefined
    }
  }

  // 没有自定义绑定时，返回默认快捷键
  return accelerators.find(a => a.command === command)?.accelerator || undefined
}

/**
 * 注册全局快捷键
 * 注销所有旧快捷键并注册新的快捷键命令
 * 
 * @param commands - 快捷键命令对象，键为命令名，值为回调函数
 * @param showAlert - 是否显示注册失败的错误提示框
 */
export const registerShortcut = (commands: typeof currentCommands, showAlert = false) => {
  // 保存当前命令列表的副本
  currentCommands = { ...commands }

  // 如果禁用了服务器功能，则移除 "在浏览器中打开" 的快捷键
  if (FLAG_DISABLE_SERVER) {
    delete commands['open-in-browser']
  }

  // 注销所有已注册的全局快捷键
  globalShortcut.unregisterAll()

  // 遍历所有命令并注册对应的快捷键
  ;(Object.keys(commands) as AcceleratorCommand[]).forEach(key => {
    // 获取该命令对应的快捷键字符串
    const accelerator = getAccelerator(key)
    // 如果快捷键或回调函数不存在，则跳过
    if (!accelerator || !commands[key]) {
      return
    }

    try {
      // 记录快捷键注册日志
      console.log('register shortcut', accelerator, key)
      // 注册全局快捷键
      globalShortcut.register(accelerator, commands[key]!)
      // 验证快捷键是否注册成功
      if (!globalShortcut.isRegistered(accelerator)) {
        throw new Error('Failed to register shortcut')
      }
    } catch (error) {
      // 记录错误日志
      console.error(error)
      // 如果需要提示用户，则显示错误对话框
      if (showAlert) {
        dialog.showErrorBox('Error', `Failed to register shortcut: ${accelerator}`)
      }
    }
  })

  // 刷新菜单以反映最新的快捷键状态
  getAction('refresh-menus')()
}

/**
 * 快捷键配置变更时的重载函数
 * 监听配置变化，当键位绑定发生变化时重新注册快捷键
 * 
 * @param changedKeys - 发生变更的配置项键名列表
 */
function reload (changedKeys: string[]) {
  // 如果 keybindings 配置项发生变更
  if (changedKeys.includes('keybindings')) {
    // 记录重载日志
    console.log('reload keybindings')
    // 使用当前保存的命令列表重新注册快捷键，并显示错误提示
    registerShortcut(currentCommands, true)
  }
}

// 注册 'shortcuts.reload' 动作，用于响应配置变更事件
registerAction('shortcuts.reload', reload)

/* eslint-disable @typescript-eslint/no-var-requires */

/**
 * Yank Note 主进程入口文件
 * 负责 Electron 应用的初始化、窗口管理、系统托盘、协议注册等核心功能
 */

import { protocol, app, Menu, Tray, powerMonitor, dialog, OpenDialogOptions, screen, shell, BrowserWindow, Display, Rectangle } from 'electron'
import type TBrowserWindow from 'electron'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs-extra'
import * as yargs from 'yargs'      //一个流行的 Node.js 命令行参数解析库，用于帮助构建命令行工具（CLI）
import httpServer, { killPtyProcesses } from './server'
import store from './storage'
import { APP_NAME } from './constant'
import { getTrayMenus, getMainMenus } from './menus'
import { transformProtocolRequest } from './protocol'
import startup from './startup'
import { registerAction } from './action'
import { registerShortcut } from './shortcut'
import { initJSONRPCClient, jsonRPCClient } from './jsonrpc'
import { $t } from './i18n'
import { getProxyDispatcher, newProxyDispatcher } from './proxy-dispatcher'
import config from './config'
import { initProxy } from './proxy'
import { initEnvs } from './envs'

/**
 * 启用 SharedArrayBuffer 功能
 * 用于支持多线程操作
 */
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer')

/**
 * 窗口状态类型定义
 * 包含窗口位置和大小信息，以及是否最大化的状态
 */
type WindowState = { maximized: boolean } & Rectangle

/**
 * 初始化代理和环境变量
 * 必须在应用启动早期调用
 */
initProxy()
initEnvs()

/**
 * 引入 electron-context-menu 模块
 * 用于自定义右键菜单
 */
const electronContextMenu = require('electron-context-menu')

/**
 * 引入 @electron/remote 模块
 * 用于在主进程和渲染进程之间进行通信
 */
const electronRemote = require('@electron/remote/main')

/**
 * 平台检测标志
 * 用于区分 macOS 和 Linux 平台以应用不同的行为
 */
const isMacos = os.platform() === 'darwin'
const isLinux = os.platform() === 'linux'

/**
 * URL 模式变量
 * - 'scheme': 使用自定义协议模式
 * - 'dev': 开发模式
 * - 'prod': 生产模式
 */
let urlMode: 'scheme' | 'dev' | 'prod' = 'scheme'

/**
 * 跳过 beforeunload 检查标志
 * 用于在特定情况下（如刷新页面）跳过保存确认
 */
let skipBeforeUnloadCheck = false

/**
 * macOS 打开文件路径
 * 用于在应用启动时通过 open-file 事件接收到的文件路径
 */
let macOpenFilePath = ''

/**
 * 系统托盘启用标志
 * 可以通过命令行参数 --disable-tray 禁用
 */
const trayEnabled = !(yargs.argv['disable-tray'])

/**
 * 后端服务端口号
 * 从命令行参数或配置文件获取，默认为 3044
 */
const backendPort = Number(yargs.argv.port) || config.get('server.port', 3044)

/**
 * 开发前端端口号
 * 用于开发模式下的前端服务
 */
const devFrontendPort = 8066

/**
 * 初始化 electron-remote 模块
 */
electronRemote.initialize()

/**
 * 配置右键菜单
 * 设置各种菜单项的显示/隐藏
 */
electronContextMenu({
  showLookUpSelection: true,      // 显示"查找"选项
  showSearchWithGoogle: false,    // 隐藏"使用 Google 搜索"
  showCopyImage: true,            // 显示"复制图片"
  showCopyImageAddress: false,    // 隐藏"复制图片地址"
  showSaveImage: false,           // 隐藏"保存图片"
  showSaveImageAs: true,          // 显示"图片另存为"
  showSaveLinkAs: false,          // 隐藏"链接另存为"
  showInspectElement: false,      // 隐藏"检查元素"
  showServices: true,             // 显示服务选项（macOS）
})

/**
 * 设置应用菜单
 */
Menu.setApplicationMenu(getMainMenus())

/**
 * 全屏状态标志
 */
let fullscreen = false

/**
 * 主窗口实例
 */
let win: TBrowserWindow.BrowserWindow | null = null

/**
 * 系统托盘实例
 */
let tray: Tray | null = null

/**
 * 从命令行参数中获取要打开的文件路径
 * @param argv - 命令行参数数组
 * @returns 文件路径或 null
 */
const getOpenFilePathFromArgv = (argv: string[]) => {
  const filePath = [...argv].reverse().find(x =>
    x !== process.argv[0] &&
    !x.startsWith('-') &&
    !x.endsWith('app.js')
  )

  return filePath ? path.resolve(process.cwd(), filePath) : null
}

/**
 * 从命令行参数中获取深度链接
 * @param argv - 命令行参数数组
 * @returns 深度链接 URL 或 null
 */
const getDeepLinkFromArgv = (argv: string[]) => {
  const lastArgv = argv[argv.length - 1]
  if (lastArgv && lastArgv.startsWith(APP_NAME + '://')) {
    return lastArgv
  }

  return null
}

/**
 * 获取应用 URL
 * @param mode - URL 模式，默认为当前 urlMode
 * @returns 完整的应用 URL
 */
const getUrl = (mode?: typeof urlMode) => {
  mode = mode ?? urlMode

  // 从命令行参数中提取特定选项
  const args = Object.entries(yargs.argv).filter(x => [
    'readonly',
    'show-status-bar',
    'init-repo',
    'init-file',
  ].includes(x[0]))

  const searchParams = new URLSearchParams(args as any)

  // 在 scheme 模式下添加后端端口参数
  if (mode === 'scheme') {
    searchParams.set('port', backendPort.toString())
  }

  const query = searchParams.toString()

  // 根据模式确定协议和端口
  const proto = mode === 'scheme' ? APP_NAME : 'http'
  const port = proto === 'http' ? (mode === 'dev' ? devFrontendPort : backendPort) : ''

  return `${proto}://localhost:${port}` + (query ? `?${query}` : '')
}

/**
 * 隐藏主窗口
 * 同时将窗口从任务栏移除，macOS 下隐藏 Dock 图标
 */
const hideWindow = () => {
  if (win) {
    win.hide()
    win.setSkipTaskbar(true)
    isMacos && app.dock?.hide()
  }
}

/**
 * 恢复窗口位置和大小
 * 从存储中读取上次保存的窗口状态并应用
 * 包含多显示器支持和边界验证
 */
const restoreWindowBounds = () => {
  const state: WindowState | null = store.get('window.state', null) as any
  if (state) {
    if (state.maximized) {
      win!.maximize()
    } else {
      /**
       * 验证窗口状态是否有效
       * 确保窗口不会超出屏幕边界
       * @param state - 窗口状态
       * @param displays - 显示器列表
       * @returns 验证后的窗口状态或 undefined
       */
      const validateWindowState = (state: WindowState, displays: Display[]): WindowState | undefined => {
        if (state.width <= 0 || state.height <= 0) {
          return undefined
        }

        /**
         * 获取显示器的工作区域
         * @param display - 显示器信息
         * @returns 工作区域矩形或 undefined
         */
        const getWorkingArea = (display: Display): Rectangle | undefined => {
          if (display.workArea.width > 0 && display.workArea.height > 0) {
            return display.workArea
          }

          if (display.bounds.width > 0 && display.bounds.height > 0) {
            return display.bounds
          }

          return undefined
        }

        // 单显示器情况
        if (displays.length === 1) {
          const displayWorkingArea = getWorkingArea(displays[0])
          if (displayWorkingArea) {
            /**
             * 确保窗口不会超出工作区域（顶部和左侧）
             */
            const ensureStateInDisplayWorkingArea = (): void => {
              if (!state || typeof state.x !== 'number' || typeof state.y !== 'number' || !displayWorkingArea) {
                return
              }

              if (state.x < displayWorkingArea.x) {
                // 防止窗口超出屏幕左侧
                state.x = displayWorkingArea.x
              }

              if (state.y < displayWorkingArea.y) {
                // 防止窗口超出屏幕顶部
                state.y = displayWorkingArea.y
              }
            }

            // 确保窗口不会超出工作区域（顶部、左侧）
            ensureStateInDisplayWorkingArea()

            if (state.width > displayWorkingArea.width) {
              // 防止窗口宽度超出显示器边界
              state.width = displayWorkingArea.width
            }

            if (state.height > displayWorkingArea.height) {
              // 防止窗口高度超出显示器边界
              state.height = displayWorkingArea.height
            }

            if (state.x > (displayWorkingArea.x + displayWorkingArea.width - 128)) {
              // 防止窗口超出屏幕右侧（保留 128px 边距）
              state.x = displayWorkingArea.x + displayWorkingArea.width - state.width
            }

            if (state.y > (displayWorkingArea.y + displayWorkingArea.height - 128)) {
              // 防止窗口超出屏幕底部（保留 128px 边距）
              state.y = displayWorkingArea.y + displayWorkingArea.height - state.height
            }

            // 再次确保窗口不会超出工作区域
            //（可能在上一步验证中发生了变化）
            ensureStateInDisplayWorkingArea()
          }

          return state
        }

        // 多显示器情况（非全屏）：确保窗口在显示器边界内
        let display: Display | undefined
        let displayWorkingArea: Rectangle | undefined
        try {
          display = screen.getDisplayMatching({ x: state.x, y: state.y, width: state.width, height: state.height })
          displayWorkingArea = getWorkingArea(display)
        } catch (error) {
          // Electron 在某些情况下会抛出错误
          // 例如传递大数字时 https://github.com/microsoft/vscode/issues/100334
        }

        if (
          display && // 找到匹配的显示器
          displayWorkingArea && // 有有效的工作区域
          state.x + state.width > displayWorkingArea.x && // 防止窗口超出屏幕左侧
          state.y + state.height > displayWorkingArea.y && // 防止窗口超出屏幕顶部
          state.x < displayWorkingArea.x + displayWorkingArea.width && // 防止窗口超出屏幕右侧
          state.y < displayWorkingArea.y + displayWorkingArea.height // 防止窗口超出屏幕底部
        ) {
          return state
        }

        return undefined
      }

      const displays = screen.getAllDisplays()
      const validatedState = validateWindowState(state, displays)
      if (validatedState) {
        win!.setBounds(validatedState)
      }
    }
  }
}

/**
 * 保存窗口位置和大小
 * 在全屏模式下不保存
 */
const saveWindowBounds = () => {
  if (win) {
    const fullscreen = win.isFullScreen()
    const maximized = win.isMaximized()

    // 仅在非全屏模式下保存边界
    if (!fullscreen) {
      const state: WindowState = { ...win.getBounds(), maximized }
      store.set('window.state', state)
    }
  }
}

/**
 * 创建主窗口
 * 配置窗口属性、加载 URL、设置事件监听
 */
const createWindow = () => {
  win = new BrowserWindow({
    maximizable: true,
    show: false,                    // 初始不显示，等待 ready-to-show 事件
    minWidth: 940,                  // 最小宽度
    minHeight: 500,                 // 最小高度
    frame: false,                   // 无边框窗口
    backgroundColor: '#282a2b',     // 背景颜色
    titleBarStyle: isMacos ? 'hidden' : undefined,  // macOS 隐藏标题栏
    fullscreenable: true,           // 允许全屏
    webPreferences: {
      webSecurity: false,           // 禁用 Web 安全策略（允许跨域）
      nodeIntegration: true,        // 启用 Node.js 集成
      contextIsolation: false,      // 禁用上下文隔离
    },
    // Linux 平台设置图标
    ...(isLinux ? { icon: path.join(__dirname, './assets/icon.png') } : undefined)
  })

  win.setMenu(null)
  win && win.loadURL(getUrl())
  restoreWindowBounds()

  /**
   * 窗口准备就绪后显示
   * 处理启动时打开文件、隐藏窗口等逻辑
   */
  // win.once: 窗口准备就绪后显示，仅执行一次
  win.once('ready-to-show', () => {
    // 从命令行参数打开文件
    const filePath = macOpenFilePath || getOpenFilePathFromArgv(process.argv)
    if (filePath) {
      win?.show()
      tryOpenFile(filePath)
      return
    }

    // 重置 macOpenFilePath
    macOpenFilePath = ''

    // 根据配置决定启动时是否隐藏窗口
    if (config.get('hide-main-window-on-startup', false)) {
      hideWindow()
    } else {
      win?.show()
    }
  })

  win.on('ready-to-show', () => {
    skipBeforeUnloadCheck = false
  })

  /**
   * 窗口关闭事件处理
   * 阻止默认关闭行为，根据配置决定是隐藏到托盘还是退出应用
   */
  win.on('close', e => {
    e.preventDefault()

    saveWindowBounds()

    // 如果启用了托盘且配置为关闭窗口后保持运行
    if (trayEnabled && config.get('keep-running-after-closing-window', !isMacos)) {
      hideWindow()
    } else {
      // 退出应用
      quit()
    }
  })

  win.on('closed', () => {
    win = null
  })

  win.on('enter-full-screen', () => {
    fullscreen = true
  })

  win.on('leave-full-screen', () => {
    fullscreen = false
  })

  // 初始化 JSON-RPC 客户端
  initJSONRPCClient(win.webContents)

  /**
   * 阻止页面导航
   * 防止意外跳转到其他页面
   */
  win.webContents.on('will-navigate', (e) => {
    e.preventDefault()
  })

  /**
   * 处理 beforeunload 事件
   * 根据 skipBeforeUnloadCheck 决定是否阻止
   */
  win.webContents.on('will-prevent-unload', (e) => {
    if (skipBeforeUnloadCheck) {
      e.preventDefault()
    }
  })
}

/**
 * 显示主窗口
 * @param showInCurrentWindow - 是否在当前工作区/桌面显示
 */
const showWindow = (showInCurrentWindow = true) => {
  if (win) {
    const show = () => {
      if (win) {
        // macOS 需要在 Dock 中显示
        isMacos && app.dock?.show()
        //控制窗口是否在任务栏/Dock 中显示   false ： 在任务栏显示 （默认行为）
        win.setSkipTaskbar(false)
        // 显示窗口（使窗口可见）
        win.show()
        //  将输入焦点设置到窗口，使其成为 活动窗口
        win.focus()
      }
    }

    if (showInCurrentWindow && !fullscreen) {
      if (isMacos) {
        // 在当前工作区显示
        win.setVisibleOnAllWorkspaces(true)
        show()
        win.setVisibleOnAllWorkspaces(false)
      } else {
        // Windows 10：先隐藏再显示到当前桌面
        hideWindow()
        setTimeout(show, 100)
      }
    } else {
      show()
    }
  } else {
    createWindow()
  }
}

/**
 * 确保文档已保存
 * 如果文档未保存，显示确认对话框
 * @returns Promise，用户选择丢弃更改时 resolve，取消时 reject
 */
const ensureDocumentSaved = () => {
  return new Promise((resolve, reject) => {
    if (!win) {
      reject(new Error('window is not ready'))
      return
    }

    const contents = win!.webContents
    contents.executeJavaScript('window.documentSaved', true).then(val => {
      if (!win) {
        reject(new Error('window is not ready'))
        return
      }

      if (val) {
        resolve(undefined)
        return
      }

      dialog.showMessageBox(win!, {
        type: 'question',
        title: $t('quit-check-dialog.title'),
        message: $t('quit-check-dialog.desc'),
        buttons: [
          $t('quit-check-dialog.buttons.cancel'),
          $t('quit-check-dialog.buttons.discard')
        ],
      }).then(choice => {
        if (choice.response === 1) {
          resolve(undefined)
        } else {
          reject(new Error('document not saved'))
        }
      }, reject)
    })
  })
}

/**
 * 重新加载主窗口
 * 先保存文档，然后重新加载 URL
 */
const reload = async () => {
  if (win) {
    skipBeforeUnloadCheck = true
    await ensureDocumentSaved()
    win.loadURL(getUrl())
  }
}

/**
 * 退出应用
 * 保存窗口状态、确保文档已保存、终止 PTY 进程，然后退出
 */
const quit = async () => {
  saveWindowBounds()

  if (!win) {
    app.exit(0)
    return
  }

  await ensureDocumentSaved()
  await killPtyProcesses()

  win.destroy()
  app.quit()
}

/**
 * 显示设置面板
 * @param key - 设置项的键名，可选
 */
const showSetting = (key?: string) => {
  if (!win || !win.webContents) {
    return
  }

  showWindow()
  // 延迟显示设置面板，确保窗口已准备好
  setTimeout(() => {
    jsonRPCClient.call.ctx.setting.showSettingPanel(key)
  }, 200)
}

/**
 * 切换全屏状态
 */
const toggleFullscreen = () => {
  win && win.setFullScreen(!fullscreen)
}

/**
 * 启动 HTTP 服务
 * 注册自定义协议处理器
 */
// 启动后端服务的函数
const serve = () => {
  try {
    // 创建 HTTP 服务器，获取请求处理回调和服务器实例
    const { callback: handler, server } = httpServer(backendPort)

    // 如果服务器实例存在，则注册错误处理监听器
    if (server) {
      // 监听服务器错误事件
      server.on('error', (e: Error) => {
        // 在控制台输出错误信息
        console.error(e)

        // 检查错误类型：端口被占用 (EADDRINUSE) 或权限不足 (EACCES)
        if (e.message.includes('EADDRINUSE') || e.message.includes('EACCES')) {
          // 等待 Electron 应用就绪后显示错误对话框（延迟 4 秒）
          setTimeout(async () => {
            // 显示错误消息对话框
            await dialog.showMessageBox({
              type: 'error',           // 对话框类型为错误
              title: 'Error',          // 对话框标题
              message: $t('app.error.EADDRINUSE', String(backendPort))  // 国际化错误消息，包含端口号
            })

            // 延迟 500ms 后打开设置页面，定位到服务器端口配置项
            setTimeout(() => {
              showSetting('server.port')
            }, 500)
          }, 4000)
          // 返回，不再抛出错误
          return
        }

        // 其他错误直接抛出
        throw e
      })
    }

    /**
     * 注册自定义流协议处理器
     * 将协议请求转换为 Koa 请求并处理
     */
    // 注册名为 'yank-note' 的自定义协议处理器，使用流式协议
    protocol.registerStreamProtocol('yank-note', async (request, callback) => {
      // 将 Electron 协议请求转换为 Koa 请求对象
      // req: Koa 请求对象，res: Koa 响应对象，out: 响应数据输出流
      const { req, res, out } = await transformProtocolRequest(request)
      // 标记该请求来自协议处理器
      ;(req as any)._protocol = true

      // 调用 HTTP 服务器的请求处理函数
      await handler(req, res)
      // eslint-disable-next-line n/no-callback-literal
      // 通过回调函数将响应数据返回给 Electron
      callback({
        headers: res.getHeaders() as any,   // 响应头
        statusCode: res.statusCode,         // HTTP 状态码
        data: out,                          // 响应数据流
      })
    })
  } catch (error) {
    // 如果发生未捕获的错误，退出应用（退出码 -1）
    app.exit(-1)
  }
}

/**
 * 显示打开文件对话框
 * @param params - 对话框选项
 * @returns 选择的文件路径
 */
const showOpenDialog = (params: OpenDialogOptions) => {
  if (win) {
    const data = dialog.showOpenDialog(win, params)
    return data
  }
}

/**
 * 显示系统托盘
 * 根据平台使用不同的图标和交互方式
 */
const showTray = () => {
  const img = isMacos ? 'trayTemplate.png' : 'tray.png'
  tray = new Tray(path.join(__dirname, `./assets/${img}`))
  tray.setToolTip(`${$t('app-name')} - ${$t('slogan')}`)
  if (isMacos) {
    tray.on('click', function (this: Tray) { this.popUpContextMenu() })
  } else {
    tray.on('click', () => showWindow())
  }
  tray.setContextMenu(getTrayMenus())
}

/**
 * 在浏览器中打开应用
 */
const openInBrowser = () => shell.openExternal(getUrl('prod'))

/**
 * 刷新菜单
 * 更新应用菜单和托盘菜单
 */
function refreshMenus () {
  Menu.setApplicationMenu(getMainMenus())
  if (tray) {
    tray.setContextMenu(getTrayMenus())
  }
}

/**
 * 尝试打开文件
 * 如果是文件则打开，否则显示错误信息
 * @param path - 文件路径
 */
async function tryOpenFile (path: string) {
  console.log('tryOpenFile', path)
  const stat = await fs.stat(path)

  if (stat.isFile()) {
    jsonRPCClient.call.ctx.doc.switchDocByPath(path)
    showWindow()
  } else {
    win && dialog.showMessageBox(win, { message: 'Yank Note only support open file.' })
  }
}

/**
 * 尝试处理深度链接
 * @param url - 深度链接 URL
 */
async function tryHandleDeepLink (url: string) {
  if (url) {
    jsonRPCClient.call.ctx.base.triggerDeepLinkOpen(url)
  }
}

/**
 * 注册动作处理器
 * 这些动作可以在应用的其他部分被调用
 */
registerAction('show-main-window', showWindow)
registerAction('hide-main-window', hideWindow)
registerAction('toggle-fullscreen', toggleFullscreen)
registerAction('show-main-window-setting', showSetting)
registerAction('reload-main-window', reload)
registerAction('get-main-widow', () => win)
registerAction('get-url-mode', () => urlMode)
registerAction('set-url-mode', (val: typeof urlMode) => { urlMode = val })
registerAction('get-backend-port', () => backendPort)
registerAction('get-dev-frontend-port', () => devFrontendPort)
registerAction('open-in-browser', openInBrowser)
registerAction('quit', quit)
registerAction('show-open-dialog', showOpenDialog)
registerAction('refresh-menus', refreshMenus)
registerAction('get-proxy-dispatcher', getProxyDispatcher)
registerAction('new-proxy-dispatcher', newProxyDispatcher)

/**
 * 监听系统关机事件
 * 在系统关机时优雅地退出应用
 */
powerMonitor.on('shutdown', quit)

/**
 * 注册为默认协议客户端
 * 处理自定义协议链接（如 yank-note://）
 */
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(APP_NAME, process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient(APP_NAME)
}

/**
 * 请求单实例锁
 * 确保只有一个应用实例在运行
 */
const gotTheLock = app.requestSingleInstanceLock()    //- true ：成功获得锁，当前是 第一个实例 （主实例），可以继续运行  - false ：获取锁失败，系统中 已有一个实例在运行 ，当前应该退出
if (!gotTheLock) {
  app.exit()
} else {
  /**
   * 第二个实例启动时的处理
   * 显示主窗口并处理可能的文件打开或深度链接
   */
  app.on('second-instance', (e, argv) => {
    console.log('second-instance', argv)
    showWindow()

    const url = getDeepLinkFromArgv(argv)
    if (url) {
      tryHandleDeepLink(url)
      return
    }

    // 只检查 argv 的最后一个参数
    const path = getOpenFilePathFromArgv([argv[argv.length - 1]])
    if (path) {
      tryOpenFile(path)
    }
  })

  /**
   * macOS 打开文件事件
   * 通过 Finder 打开文件时触发
   */
  app.on('open-file', (e, path) => {
    e.preventDefault()

    if (!win || win.webContents.isLoading()) {
      macOpenFilePath = path
    } else {
      tryOpenFile(path)
    }
  })

  /**
   * 打开 URL 事件
   * 处理自定义协议链接
   */
  app.on('open-url', (e, url) => {
    e.preventDefault()
    tryHandleDeepLink(url)
  })

  /**
   * 应用就绪事件
   * 初始化启动流程、启动服务、显示窗口等
   */
  app.on('ready', () => {
    startup()
    serve()
    showWindow()

    // getLocale 在 ready 之前返回空字符串，所以在这里刷新菜单
    refreshMenus()

    if (trayEnabled) {
      showTray()
    }

    // 注册全局快捷键
    registerShortcut({
      'show-main-window': showWindow,
      'hide-main-window': hideWindow,
      'open-in-browser': openInBrowser,
      'toggle-fullscreen': toggleFullscreen
    })
  })

  /**
   * 应用激活事件（macOS）
   * 点击 Dock 图标时触发
   */
  app.on('activate', () => {
    showWindow(false)
  })

  /**
   * Web 内容创建事件
   * 配置新创建的 Web 内容的各种行为
   */
  app.on('web-contents-created', (_, webContents) => {
    electronRemote.enable(webContents)

    /**
     * 修复 Windows 上对话框显示后的焦点问题
     * 通过注入 JavaScript 覆盖原生 alert 和 confirm 函数
     */
    webContents.on('frame-created', (_, { frame }) => {
      if (!frame) {
        return
      }

      frame.on('dom-ready', () => {
        frame.executeJavaScript(`if ('ctx' in window && ctx?.env?.isWindows) {
          window._FIX_ELECTRON_DIALOG_FOCUS ??= function () {
            setTimeout(() => {
              ctx.env.getElectronRemote().getCurrentWindow().blur();
              ctx.env.getElectronRemote().getCurrentWindow().focus();
            }, 0);
          };

          if (!window._ORIGIN_ALERT) {
            window._ORIGIN_ALERT = window.alert;
            window.alert = function (...args) {
              window._ORIGIN_ALERT(...args);
              window._FIX_ELECTRON_DIALOG_FOCUS();
            };
          }

          if (!window._ORIGIN_CONFIRM) {
            window._ORIGIN_CONFIRM = window.confirm;
            window.confirm = function (...args) {
              const res = window._ORIGIN_CONFIRM(...args);
              window._FIX_ELECTRON_DIALOG_FOCUS();
              return res;
            };
          }
        }`)
      })
    })

    /**
     * 窗口打开处理器
     * 控制哪些 URL 可以在新窗口中打开
     */
    webContents.setWindowOpenHandler(({ url, features }) => {
      if (url.includes('__allow-open-window__')) {
        return { action: 'allow' }
      }

      // 允许的 URL 列表
      const allowList = [
        `${APP_NAME}://`,
        `http://localhost:${backendPort}`,
        `http://localhost:${devFrontendPort}`,
        `http://127.0.0.1:${backendPort}`,
        `http://127.0.0.1:${devFrontendPort}`,
      ]

      // 不在允许列表中的 URL 使用系统浏览器打开
      if (!allowList.find(x => url.startsWith(x))) {
        shell.openExternal(url)
        return { action: 'deny' }
      }

      const webPreferences: Record<string, boolean | string> = {}

      // Electron 不会自动解析以下特性 https://www.electronjs.org/docs/latest/api/window-open
      const extraFeatureKeys = [
        'experimentalFeatures',
        'nodeIntegrationInSubFrames',
        'webSecurity',
      ]

      extraFeatureKeys.forEach(key => {
        const match = features.match(new RegExp(`${key}=([^,]+)`))
        if (match) {
          webPreferences[key] = match[1] === 'true' ? true : match[1] === 'false' ? false : match[1]
        }
      })

      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          webPreferences: Object.keys(webPreferences).length > 0 ? webPreferences : undefined,
        }
      }
    })
  })
}

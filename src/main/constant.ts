//constant.ts 是整个应用的"路径和常量管理中心" ，它定义了应用运行所需的所有固定路径和配置常量


import * as path from 'path'   // Node.js 路径处理模块，用于拼接、解析文件路径
import * as os from 'os'       // Node.js 操作系统模块，获取系统信息如主目录、临时目录等
import * as yargs from 'yargs' // 命令行参数解析库，用于读取启动时的自定义参数
import { isWsl, toWslPath, getWinHomePath } from './wsl'  // WSL 环境检测和路径转换工具
import { convertAppPath } from './helper'  // 应用路径转换工具

// 确定用户主目录：如果是 WSL 环境，转换为 Windows 路径；否则使用系统默认主目录
const homedir = isWsl ? toWslPath(getWinHomePath()) : os.homedir()      // C:\Users\用户名\

// 应用名称常量，用于创建应用相关目录
export const APP_NAME = 'yank-note'

// 用户主目录路径
export const HOME_DIR = homedir

// 用户数据目录：优先使用命令行参数 --data-dir，否则使用 ~/yank-note
export const USER_DIR = path.resolve((yargs.argv['data-dir'] as any) || path.join(homedir, APP_NAME))       //所以我开发时使用的数据和我饿本地应用yanknote是同一处

// 配置文件完整路径：~/yank-note/config.json
export const CONFIG_FILE = path.join(USER_DIR, 'config.json')

// 静态资源目录（渲染进程文件所在目录）
export const STATIC_DIR = path.join(__dirname, '../renderer')       //__dirname c:\LW\code\creator\Cord\src\main 当前文件所在目录

// 帮助文档目录
export const HELP_DIR = path.join(__dirname, '../../help')      

// 应用内置资源目录
export const ASSETS_DIR = path.join(__dirname, 'assets')

// 历史记录存储目录
export const HISTORY_DIR = path.join(USER_DIR, './histories')

// 用户插件目录，存放第三方插件
export const USER_PLUGIN_DIR = path.join(USER_DIR, './plugins')

// 用户主题目录，存放自定义主题
export const USER_THEME_DIR = path.join(USER_DIR, './themes')

// 用户扩展目录
export const USER_EXTENSION_DIR = path.join(USER_DIR, './extensions')

// 用户数据存储目录
export const USER_DATA = path.join(USER_DIR, './data')

// 二进制工具目录（如 pandoc、git 等外部工具）
export const BIN_DIR = convertAppPath(path.join(__dirname, '../../bin'))

// 应用资源目录
export const RESOURCES_DIR = convertAppPath(path.join(__dirname, 'resources'))

// 临时缓存目录，使用系统临时目录下的 yank-note 文件夹
export const CACHE_DIR = path.join(os.tmpdir(), APP_NAME)           //Windows C:\Users\<用户名>\AppData\Local\Temp os.tmpdir()

// 内置样式文件列表
export const BUILD_IN_STYLES = ['github.css']

// Pandoc 导出 Word 时使用的参考文档模板文件名
export const PANDOC_REFERENCE_FILE = 'pandoc-reference.docx'

// GitHub 仓库地址
export const GITHUB_URL = 'https://github.com/purocean/yn'

// 功能开关：是否禁用内置服务器（false = 启用）
export const FLAG_DISABLE_SERVER = false

// 功能开关：是否禁用开发者工具（false = 启用，开发时可设为 true）
export const FLAG_DISABLE_DEVTOOL = false

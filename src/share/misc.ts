//这是一个工具模块文件，主要定义了应用程序的各种常量、配置和辅助函数。
import { Language, translate } from './i18n'

/**
 * Markdown 文件扩展名
 * 用于识别和过滤标准的 Markdown 文件
 */
export const MARKDOWN_FILE_EXT = '.md'

/**
 * 加密的 Markdown 文件扩展名
 * 用于识别经过加密处理的 Markdown 文件
 */
export const ENCRYPTED_MARKDOWN_FILE_EXT = '.c.md'

/**
 * 文档历史最大内容长度限制（字节）
 * 用于控制文档历史记录中保存的内容大小，避免占用过多存储空间
 * 当前限制为 100KB (102400 bytes)
 */
export const DOC_HISTORY_MAX_CONTENT_LENGTH = 102400

/**
 * 根仓库名称前缀
 * 用于标识系统级别的特殊仓库（如默认工作区）
 * 以 __ 开头的仓库名通常具有特殊用途
 */
export const ROOT_REPO_NAME_PREFIX = '__root__'

/**
 * 默认排除路径的正则表达式
 * 用于文件搜索和遍历时过滤不需要处理的路径
 * 匹配项包括：
 * - node_modules/ : npm 依赖包目录
 * - \.git/ : Git 版本控制目录
 * - \.DS_Store : macOS 系统文件
 * - \. : 其他隐藏文件
 */
export const DEFAULT_EXCLUDE_REGEX = '^node_modules/$|^\\.git/$|^\\.DS_Store$|^\\.'

/**
 * 高级版功能验证的 RSA 公钥
 * 用于验证和授权高级版功能的许可证
 * 采用 PEM 格式的 RSA 公钥，用于非对称加密验证
 */
export const PREMIUM_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqkiGs7j0xH+RJEHvqZ33
+7nt+tmj5eod4BYbwVWLfoIfAM9dTCUwZkEDEWI2V9W0cYV6eAu4JwKMJqn76jRn
0S87wtT9H6W2zbbvjK2aia/oCkRilNNOMgV9V6P+ZD0VyDVUSBHWJQk3tOSHf/nS
GW2hnKqao+loVyuHQQiYp6Iq3ti4Eu+t88LfpxvVZ5uuKmMLo6LbnOMuTFa9mGUE
R1VuHglANFSi45+45PRHkGlpwjwnlFCTmj137h/djQ//NinJ73CeI3xHD6+Spppy
259/Ksv+uI/zV39VZWsCrhJkc1pRSUXApKxqXbrMUD2z60Wqz3ps+arn9YeHPR/k
DQIDAQAB
-----END PUBLIC KEY-----`

/**
 * API 服务基础 URL
 * 所有后端 API 请求的根地址
 */
export const API_BASE_URL = 'https://yank-note.com'

/**
 * 官方网站 URL
 * 用于引导用户访问产品主页
 */
export const HOMEPAGE_URL = 'https://yank-note.com'

/**
 * 使用指南 URL
 * 用于引导用户访问帮助文档
 */
export const GUIDE_URL = 'https://help.yank-note.com'

/**
 * 判断文件路径是否为 Markdown 文件
 * @param path - 文件路径字符串
 * @returns 如果是以 .md 结尾的文件返回 true，否则返回 false
 */
export function isMarkdownFile (path: string) {
  return path.endsWith(MARKDOWN_FILE_EXT)
}

/**
 * 判断文件路径是否为加密的 Markdown 文件
 * @param path - 文件路径字符串
 * @returns 如果是以 .c.md 结尾的文件返回 true，否则返回 false
 */
export function isEncryptedMarkdownFile (path: string) {
  return path.endsWith(ENCRYPTED_MARKDOWN_FILE_EXT)
}

/**
 * 获取应用程序默认键盘快捷键配置
 * 根据操作系统平台和语言设置返回相应的快捷键组合
 * 
 * @param platform - 操作系统平台 (darwin, win32, linux 等)
 * @param lang - 语言设置，默认为 'en'（英语）
 * @returns 快捷键配置数组，包含命令、快捷键组合和描述
 * 
 * @example
 * // macOS 平台返回示例:
 * [
 *   { command: 'show-main-window', accelerator: 'Shift+Alt+M', description: '显示主窗口' },
 *   { command: 'hide-main-window', accelerator: null, description: '隐藏主窗口' },
 *   { command: 'open-in-browser', accelerator: 'Meta+Shift+B', description: '在浏览器中打开' },
 *   { command: 'toggle-fullscreen', accelerator: 'F11', description: '切换全屏' }
 * ]
 */
export function getDefaultApplicationAccelerators (platform: NodeJS.Platform, lang: Language = 'en') {
  return [
    {
      command: 'show-main-window', // 显示主窗口命令
      accelerator: platform === 'darwin' ? 'Shift+Alt+M' : 'Meta+Alt+N', // macOS 使用 Shift+Alt+M，其他平台使用 Meta+Alt+N
      description: translate(lang, 'app.tray.open-main-window') // 从国际化配置中获取描述文本
    },
    {
      command: 'hide-main-window', // 隐藏主窗口命令
      accelerator: null, // 不设置默认快捷键
      description: translate(lang, 'app.hide-main-window'),
    },
    {
      command: 'open-in-browser', // 在浏览器中打开命令
      accelerator: 'Meta+Shift+B', // 跨平台统一的快捷键
      description: translate(lang, 'app.tray.open-in-browser')
    },
    {
      command: 'toggle-fullscreen', // 切换全屏命令
      accelerator: 'F11', // 标准的全屏切换快捷键
      description: translate(lang, 'app.toggle-fullscreen')
    }
  ] as {command: 'show-main-window' | 'hide-main-window' | 'open-in-browser' | 'toggle-fullscreen', accelerator: string | null, description: string}[]
}

/**
 * 判断仓库名称是否为普通仓库（非系统特殊仓库）
 * 系统特殊仓库以双下划线 __ 开头，如 __root__
 * 
 * @param repoName - 仓库名称字符串
 * @returns 如果是不以 __ 开头的普通仓库返回 true，否则返回 false
 * 
 * @example
 * isNormalRepoName('my-notes') // true
 * isNormalRepoName('__root__') // false
 * isNormalRepoName('__system__') // false
 */
export function isNormalRepoName (repoName: string) {
  return !repoName.startsWith('__')
}

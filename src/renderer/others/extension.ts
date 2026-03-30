import parseAuthor from 'parse-author'
import semver from 'semver'
import pako from 'pako'
import untar from 'js-untar'
import { getLogger, path } from '@fe/utils'
import * as api from '@fe/support/api'
import { getActionHandler } from '@fe/core/action'
import type { Extension, ExtensionCompatible, ExtensionLoadStatus, RegistryHostname } from '@fe/types'
import * as i18n from '@fe/services/i18n'
import * as theme from '@fe/services/theme'
import * as view from '@fe/services/view'
import { registerHook, triggerHook } from '@fe/core/hook'
import { FLAG_DEMO } from '@fe/support/args'

/**
 * 扩展系统日志记录器
 */
const logger = getLogger('extension')

/**
 * 存储已加载扩展的状态信息
 * Key: 扩展 ID，Value: 扩展加载状态
 */
const loaded = new Map<string, ExtensionLoadStatus>()

/**
 * 支持的扩展注册表主机名列表
 * - registry.npmjs.org: 官方 npm 注册表
 * - registry.npmmirror.com: 国内镜像
 */
export const registries: RegistryHostname[] = [
  'registry.npmjs.org',
  'registry.npmmirror.com',
]

/**
 * 判断扩展是否应该被加载
 * @param extension - 扩展对象
 * @returns 是否应该加载（已启用且兼容）
 */
function shouldLoad (extension: Extension) {
  return extension.enabled && extension.compatible
}

/**
 * 切换注册表源（替换 URL 的主机名）
 * 用于在不同注册表之间切换下载源
 * @param hostname - 目标注册表主机名
 * @param url - 原始 URL
 * @returns 替换后的 URL
 */
function changeRegistryOrigin (hostname: RegistryHostname, url: string) {
  const _url = new URL(url)
  _url.hostname = hostname
  return _url.toString()
}

/**
 * 获取扩展的文件路径
 * 将扩展 ID 中的 `/` 替换为 `$` 以避免路径冲突
 * @param id - 扩展 ID（如：@org/package）
 * @param paths - 路径片段
 * @returns 扩展文件路径
 */
export function getExtensionPath (id: string, ...paths: string[]) {
  return path.join(id.replace(/\//g, '$'), ...paths)
}

/**
 * 获取已安装扩展文件的访问 URL
 * 如果文件名已经是 HTTP URL 则直接返回
 * @param id - 扩展 ID
 * @param filename - 文件名或路径
 * @returns 可访问的 URL
 */
export function getInstalledExtensionFileUrl (id: string, filename: string) {
  if (/https?:\/\//.test(filename)) {
    return filename
  }

  return path.join('/extensions', getExtensionPath(id, filename))
}

/**
 * 获取扩展的加载状态
 * @param id - 扩展 ID
 * @returns 扩展加载状态对象，如果未找到则返回默认状态
 */
export function getLoadStatus (id: string): ExtensionLoadStatus {
  return loaded.get(id) || { version: undefined, themes: false, plugin: false, style: false, activationTime: 0 }
}

/**
 * 检查扩展与当前应用版本的兼容性
 * @param engines - 扩展声明的引擎要求（如：{ 'yank-note': '^3.0.0' }）
 * @returns 兼容性检查结果
 */
export function getCompatible (engines?: { 'yank-note': string }): ExtensionCompatible {
  if (!engines || !engines['yank-note']) {
    return { value: false, reason: 'Not yank note extension.' }
  }

  const engineVersion = __APP_VERSION__

  const value = semver.satisfies(engineVersion, engines['yank-note'])

  return {
    value,
    reason: value ? 'Compatible' : `Need Yank Note [${engines['yank-note']}].`,
  }
}

/**
 * 从 package.json 解析扩展信息
 * 支持国际化显示（根据当前语言选择 displayName 和 description）
 * @param json - package.json 内容
 * @returns 扩展信息对象，如果解析失败则返回 null
 */
export function readInfoFromJson (json: any): Omit<Extension, 'installed'> | null {
  if (!json || !json.name || !json.version) {
    return null
  }

  const language = i18n.getCurrentLanguage().toUpperCase()

  return {
    id: json.name,
    version: json.version,
    license: typeof json.license === 'string' ? json.license : '',
    author: typeof json.author === 'string'
      ? parseAuthor(json.author) || { name: '' }
      : json.author || { name: '' },
    themes: json.themes || [],
    requirements: json.requirements || {},
    main: json.main || '',
    style: json.style || '',
    icon: json.icon || '',
    readmeUrl: json.readmeUrl || '',
    changelogUrl: json.changelogUrl || '',
    displayName: json[`displayName_${language}`] || json.displayName || json.name,
    description: json[`description_${language}`] || json.description || '',
    compatible: getCompatible(json.engines),
    origin: json.origin || 'unknown',
    dist: json.dist || { tarball: '', unpackedSize: 0 },
    homepage: json.homepage || '',
  }
}

/**
 * 获取单个已安装扩展的详细信息
 * 通过读取扩展目录下的 package.json 文件获取
 * @param id - 扩展 ID
 * @returns 扩展对象，如果获取失败则返回 null
 */
export async function getInstalledExtension (id: string): Promise<Extension | null> {
  let json

  try {
    json = await api.fetchHttp(getInstalledExtensionFileUrl(id, 'package.json'))
    if (!json.name || !json.version) {
      throw new Error('Invalid extension package.json')
    }
  } catch (error) {
    logger.error(error)
    return null
  }

  const info = readInfoFromJson(json)
  if (info) {
    return { ...info, installed: true, origin: FLAG_DEMO ? 'registry' : 'unknown' }
  }

  return null
}

/**
 * 获取所有已安装扩展的列表
 * 遍历本地扩展目录，读取每个扩展的信息
 * @returns 已安装扩展数组
 */
export async function getInstalledExtensions () {
  const extensions: Extension[] = []
  for (const item of await api.fetchInstalledExtensions()) {
    const info = await getInstalledExtension(item.id)
    if (info) {
      if (info.id !== item.id) {
        logger.warn(`Extension ${item.id} has been installed but package.json is not valid.`)
        continue
      }

      extensions.push({
        ...info,
        installed: true,
        enabled: item.enabled && info.compatible.value,
        icon: getInstalledExtensionFileUrl(info.id, info.icon),
        readmeUrl: getInstalledExtensionFileUrl(info.id, 'README.md'),
        changelogUrl: getInstalledExtensionFileUrl(info.id, 'CHANGELOG.md'),
        isDev: item.isDev,
      })
    }
  }

  return extensions
}

/**
 * 从远程注册表获取可用扩展列表
 * 下载注册表 tarball 并解压获取扩展索引
 * @param registry - 注册表主机名，默认为 registry.npmjs.org
 * @returns 注册表中的扩展数组
 */
export async function getRegistryExtensions (registry: RegistryHostname = 'registry.npmjs.org'): Promise<Extension[]> {
  logger.debug('getRegistryExtensions', registry)

  const registryUrl = `https://${registry}/yank-note-registry`
  const registryJson = await api.proxyFetch(registryUrl, { timeout: 5000 }).then(r => r.json())
  const latest = registryJson['dist-tags'].latest
  const tarballUrl = changeRegistryOrigin(registry, registryJson.versions[latest].dist.tarball)

  const extensions = await api.proxyFetch(tarballUrl, { timeout: 5000 })
    .then(r => r.arrayBuffer())
    .then(data => pako.inflate(new Uint8Array(data)))
    .then(arr => arr.buffer)
    .then(buffer => untar(buffer))
    .then(files => files.find((x: any) => x.name === 'package/index.json'))
    .then(file => new TextDecoder('utf-8').decode(file.buffer))
    .then(JSON.parse)

  return extensions.map(readInfoFromJson)
}

/**
 * 显示扩展管理器界面
 * @param id - 可选的扩展 ID，用于定位到特定扩展
 */
export function showManager (id?: string) {
  getActionHandler('extension.show-manager')(id)
}

/**
 * 启用扩展
 * 将扩展标记为已启用状态并加载，然后触发扩展就绪钩子
 * @param extension - 要启用的扩展对象
 */
export async function enable (extension: Extension) {
  await api.enableExtension(extension.id)
  extension.enabled = true
  await load(extension)
  triggerHook('EXTENSION_READY', { extensions: [extension] })
}

/**
 * 禁用扩展
 * 仅将扩展标记为禁用状态，不卸载文件
 * @param extension - 要禁用的扩展（只需 ID）
 */
export async function disable (extension: Pick<Extension, 'id'>) {
  await api.disableExtension(extension.id)
}

/**
 * 卸载扩展
 * 从文件系统中删除扩展
 * @param extension - 要卸载的扩展（只需 ID）
 */
export async function uninstall (extension: Pick<Extension, 'id'>) {
  await api.uninstallExtension(extension.id)
}

/**
 * 中止扩展安装过程
 */
export async function abortInstallation () {
  await api.abortExtensionInstallation()
}

/**
 * 安装扩展
 * 从注册表下载并安装扩展，安装完成后自动启用
 * @param extension - 要安装的扩展对象
 * @param registry - 注册表主机名，默认为 registry.npmjs.org
 */
export async function install (extension: Extension, registry: RegistryHostname = 'registry.npmjs.org') {
  const url = extension.dist.tarball
  if (!url) {
    throw new Error('No dist url')
  }

  await api.installExtension(extension.id, changeRegistryOrigin(registry, url))
  await enable(extension)
}

/**
 * 加载扩展的核心逻辑
 * 负责加载扩展的脚本、样式和主题
 * @param extension - 要加载的扩展对象
 */
async function load (extension: Extension) {
  if (shouldLoad(extension)) {
    logger.debug('load', extension.id)
    const loadStatus: ExtensionLoadStatus = loaded.get(extension.id) || { themes: false, plugin: false, style: false, activationTime: 0 }

    loadStatus.version = extension.version

    // 记录脚本加载时间
    let scriptStartTime = performance.now()
    let scriptEndTime = scriptStartTime
    let pluginPromise: Promise<void> | undefined

    // 1. 加载 JavaScript 插件脚本
    const main = extension?.main
    if (!loadStatus.plugin && main && (main.endsWith('.js') || main.endsWith('.mjs'))) {
      pluginPromise = new Promise((resolve, reject) => {
        const script = window.document.createElement('script')
        script.src = getInstalledExtensionFileUrl(extension.id, main)
        script.defer = true

        // support esm
        if (main.endsWith('.mjs')) {
          script.type = 'module'
        }

        script.onload = () => {
          resolve()
          scriptEndTime = performance.now()
          script.onload = null
        }

        script.onerror = (error) => {
          reject(error)
          scriptEndTime = performance.now()
          script.onerror = null
        }

        window.document.body.appendChild(script)
        setTimeout(() => {
          scriptStartTime = performance.now()
        }, 0)
      })
    }

    // 2. 加载 CSS 样式文件
    const style = extension?.style
    if (!loadStatus.style && style && style.endsWith('.css')) {
      const href = getInstalledExtensionFileUrl(extension.id, style)

      // add style to workbench
      theme.addStyleLink(href)

      // also add style to preview iframe
      view.addStyleLink(href)

      loadStatus.style = true
    }

    // 3. 注册主题样式
    if (!loadStatus.themes && extension?.themes && extension.themes.length) {
      extension.themes.forEach(style => {
        theme.registerThemeStyle({
          from: 'extension',
          name: `[${extension.id}]: ${style.name}`,
          css: `extension:${getExtensionPath(extension.id, style.css)}`,
        })
      })
      loadStatus.themes = true
    }

    // 等待插件脚本加载完成
    if (pluginPromise) {
      try {
        await pluginPromise
      } catch (error) {
        console.warn(`Load extension error [${extension.id}]`, error)
      } finally {
        loadStatus.plugin = true
        loadStatus.activationTime = scriptEndTime - scriptStartTime
      }
    }

    loaded.set(extension.id, loadStatus)
  }
}

/**
 * 扩展系统初始化标志
 */
let initialized = false

/**
 * 获取扩展系统是否已初始化
 * @returns 初始化状态
 */
export function getInitialized () {
  return initialized
}

/**
 * 等待扩展系统初始化完成
 * 如果已初始化则立即返回，否则注册钩子等待 EXTENSION_READY 事件
 * @returns Promise，在初始化完成后 resolve
 */
export function whenInitialized (): Promise<void> {
  return new Promise(resolve => {
    if (initialized) {
      resolve()
    } else {
      registerHook('EXTENSION_READY', () => {
        resolve()
      }, true)
    }
  })
}

/**
 * 初始化扩展系统
 * 加载所有已安装且应该加载的扩展，然后触发扩展就绪钩子
 */
export async function init () {
  logger.debug('init')

  const extensions = (await getInstalledExtensions()).filter(shouldLoad)

  for (const extension of extensions) {
    await load(extension)
  }

  initialized = true
  triggerHook('EXTENSION_READY', { extensions })
}

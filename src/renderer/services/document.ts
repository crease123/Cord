/**
 * 文档服务模块
 * 提供文档创建、删除、移动、保存等核心功能
 */

// Vue 相关导入
import { Fragment, h, shallowRef } from 'vue'
// 异步锁，用于防止并发操作冲突
import AsyncLock from 'async-lock'
// 深拷贝工具函数
import { cloneDeep } from 'lodash-es'
// TypeScript 工具类型
import { Optional } from 'utility-types'
// Monaco 编辑器的 URI 处理
import { URI } from 'monaco-editor/esm/vs/base/common/uri.js'
// 依赖注入容器
import * as ioc from '@fe/core/ioc'
// 共享的杂项工具函数
import * as misc from '@share/misc'
// 文件扩展名支持
import extensions from '@fe/others/file-extensions'
// 加密解密工具
import * as crypto from '@fe/utils/crypto'
// 模态框组件
import { useModal } from '@fe/support/ui/modal'
// 提示组件
import { useToast } from '@fe/support/ui/toast'
// 应用状态存储
import store from '@fe/support/store'
// 类型定义
import type { DocType, FileStat, Doc, DocCategory, PathItem, SwitchDocOpts, BaseDoc } from '@fe/types'
// 路径处理工具
import { basename, dirname, extname, isBelongTo, join, normalizeSep, relative, resolve } from '@fe/utils/path'
// 动作处理器
import { getActionHandler } from '@fe/core/action'
// 钩子触发器
import { triggerHook } from '@fe/core/hook'
// 标志和帮助仓库名称
import { FLAG_MAS, HELP_REPO_NAME } from '@fe/support/args'
// API 接口
import * as api from '@fe/support/api'
// 文件转 Base64 工具
import { fileToBase64URL, getLogger } from '@fe/utils'
// 环境检测
import { isWindows } from '@fe/support/env'
// 创建文件面板组件
import CreateFilePanel from '@fe/components/CreateFilePanel.vue'
// 基础服务
import { inputPassword, openPath, showItemInFolder } from './base'
// 仓库服务
import { getAllRepos, getRepo } from './repo'
// 国际化服务
import { $$t, t } from './i18n'
// 设置服务
import { getSetting, setSetting } from './setting'

// 文档服务日志记录器
const logger = getLogger('document')
// 异步操作锁，确保文档保存和切换操作不会并发执行
const lock = new AsyncLock()

// 支持的文件扩展名缓存
const supportedExtensionCache = {
  sortedExtensions: [] as string[], // 排序后的扩展名列表（按长度降序）
  types: new Map<string, { type: DocType, category: DocCategory }>() // 扩展名到文档类型的映射
}

// 文档 URI 方案
export const URI_SCHEME = 'yank-note'

// 带类型信息的路径项目类型
type PathItemWithType = Optional<Omit<BaseDoc, 'name'>, 'type'>

/**
 * 解密内容
 * @param content 待解密的内容
 * @param password 解密密码
 * @returns 解密后的内容
 */
function decrypt (content: any, password: string) {
  if (!password) {
    throw new Error(t('no-password'))
  }

  return crypto.decrypt(content, password)
}

/**
 * 加密内容
 * @param content 待加密的内容
 * @param password 加密密码
 * @returns 加密后的内容
 */
function encrypt (content: any, password: string) {
  if (!password) {
    throw new Error(t('no-password'))
  }

  return crypto.encrypt(content, password)
}

/**
 * 检查文件路径是否有效
 * @param path 文件路径
 */
function checkFilePath (path: string) {
  // 检查文件名是否有效
  const filename = basename(path)
  if (/[<>:"|?*#]/.test(filename)) {
    throw new Error(t('document.invalid-filename', '< > : " / \\ | ? * #'))
  }
}

/**
 * 获取文档的绝对路径
 * @param doc 文档对象
 * @returns 文档的绝对路径
 */
export function getAbsolutePath (doc: PathItem) {
  if (isOutOfRepo(doc)) {
    const repoPath = doc.repo.substring(misc.ROOT_REPO_NAME_PREFIX.length)
    return normalizeSep(join(repoPath, doc.path))
  }

  return normalizeSep(join(getRepo(doc.repo)?.path || '/', doc.path))
}

/**
 * 创建一个检查器来检查文档是否是当前激活的文档
 * @returns 包含检查方法的对象
 */
export function createCurrentDocChecker () {
  const currentFileUri = toUri(store.state.currentFile)

  const check = () => {
    return currentFileUri === toUri(store.state.currentFile)
  }

  return {
    check, // 检查当前文档是否未改变
    changed: () => !check(), // 检查当前文档是否已改变
    throwErrorIfChanged: () => {
      if (check()) {
        return
      }

      throw new Error('Current file changed')
    }
  }
}

/**
 * 克隆文档对象
 * @param doc 要克隆的文档对象
 * @param opts 克隆选项
 * @param opts.includeExtra 是否包含额外信息
 * @returns 克隆后的文档对象
 */
export function cloneDoc (doc?: Doc | null, opts?: { includeExtra?: boolean }): Doc | null {
  if (!doc) {
    return null
  }

  const newDoc: Doc = {
    type: doc.type,
    name: doc.name,
    repo: doc.repo,
    path: doc.path,
    absolutePath: doc.absolutePath,
    plain: doc.plain,
  }

  if (opts?.includeExtra) {
    newDoc.extra = doc.extra
  }

  return newDoc
}

/**
 * 检查文档是否为 Markdown 文件
 * @param doc 文档对象
 * @returns 如果是 Markdown 文件返回 true，否则返回 false
 */
export function isMarkdownFile (doc: PathItemWithType) {
  return !!(doc && doc.type === 'file' && misc.isMarkdownFile(doc.path))
}

/**
 * 检查文档是否被支持
 * @param doc 文档对象
 * @returns 如果文档被支持返回 true，否则返回 false
 */
export function supported (doc: PathItemWithType) {
  return !!(doc && doc.type === 'file' && supportedExtensionCache.sortedExtensions.some(x => doc.path.endsWith(x)))
}

/**
 * 检查文档是否在仓库之外
 * @param doc 文档对象
 * @returns 如果文档在仓库之外返回 true，否则返回 false
 */
export function isOutOfRepo (doc?: PathItem | null) {
  return !!(doc && doc.repo.startsWith(misc.ROOT_REPO_NAME_PREFIX))
}

/**
 * 判断文档是否已加密
 * @param doc 文档对象
 * @returns 如果文档已加密返回 true，否则返回 false
 */
export function isEncrypted (doc?: Pick<Doc, 'path' | 'type'> | null): boolean {
  return !!(doc && doc.type === 'file' && misc.isEncryptedMarkdownFile(doc.path))
}

/**
 * 检查文档是否为纯文本文件
 * @param doc 文档对象
 * @returns 如果是纯文本文件返回 true，否则返回 false
 */
export function isPlain (doc?: Omit<PathItemWithType, 'repo'>) {
  if (!doc) return false

  return doc.type === 'file' &&
    (!!(extensions.supported(doc.path) || resolveDocType(doc.path)?.type?.plain))
}

/**
 * 判断两个文档是否在同一仓库中
 * @param docA 第一个文档对象
 * @param docB 第二个文档对象
 * @returns 如果在同一仓库返回 true，否则返回 false
 */
export function isSameRepo (docA: PathItem | null | undefined, docB: PathItem | null | undefined) {
  return docA && docB && docA.repo === docB.repo
}

/**
 * 判断两个文档是否为同一文档
 * @param docA 第一个文档对象
 * @param docB 第二个文档对象
 * @returns 如果是同一文档返回 true，否则返回 false
 */
export function isSameFile (docA: PathItemWithType | null | undefined, docB: PathItemWithType | null | undefined) {
  return docA && docB && isSameRepo(docA, docB) && docA.type === docB.type && docA.path === docB.path
}

/**
 * 判断文档 B 是否与文档 A 相同或属于文档 A 的目录下
 * @param docA 参考文档对象
 * @param docB 待比较的文档对象
 * @returns 如果文档 B 与文档 A 相同或属于文档 A 的目录下返回 true，否则返回 false
 */
export function isSubOrSameFile (docA: PathItemWithType | null | undefined, docB?: PathItemWithType | null | undefined) {
  return docA && docB && isSameRepo(docA, docB) &&
  (
    isBelongTo(docA.path, docB.path) ||
    isSameFile(docA, docB)
  )
}

/**
 * 获取文档的 URI
 * @param doc 文档对象
 * @returns 文档的 URI 字符串
 */
export function toUri (doc?: PathItemWithType | null): string {
  if (doc?.type && doc.type !== 'file') {
    return URI.parse(`${URI_SCHEME}://${doc.type}/${doc.repo}/${doc.path.replace(/^\//, '')}`).toString()
  }

  if (doc && doc.type === 'file' && doc.repo && doc.path) {
    return URI.parse(`${URI_SCHEME}://${doc.repo}/${doc.path.replace(/^\//, '')}`).toString()
  } else {
    return `${URI_SCHEME}://system/blank.md`
  }
}

/**
 * 创建文档
 * @param doc 文档信息，包括仓库、路径和内容
 * @param baseDoc 基础文档对象，用于确定创建位置
 * @returns 创建的文档对象
 */
export async function createDoc (doc: Pick<Doc, 'repo' | 'path' | 'content'>, baseDoc: BaseDoc & { type: 'file' | 'dir' }): Promise<Doc>
export async function createDoc (doc: Optional<Pick<Doc, 'repo' | 'path' | 'content'>, 'path'>, baseDoc?: BaseDoc & { type: 'file' | 'dir' }): Promise<Doc>
export async function createDoc (doc: Optional<Pick<Doc, 'repo' | 'path' | 'content'>, 'path'>, baseDoc?: BaseDoc & { type: 'file' | 'dir' }) {
  // 文档类型引用
  const docType = shallowRef<DocType | null | undefined>(null)

  // 其他文档类别名称
  const othersDocCategoryName = '__others__'

  // 如果没有提供路径，则需要用户输入
  if (!doc.path) {
    if (baseDoc) {
      // 计算当前路径：如果是目录则使用目录路径，如果是文件则使用其父目录
      const currentPath = baseDoc.type === 'dir' ? baseDoc.path : dirname(baseDoc.path)

      // 获取所有文档类别并添加其他类别
      const categories = getAllDocCategories().concat({
        category: othersDocCategoryName,
        displayName: t('others'),
        types: [
          {
            id: 'custom',
            displayName: t('document.custom-extension'),
            extension: [''],
            plain: true,
            buildNewContent: () => ''
          }
        ]
      })
      // 查找 Markdown 类别
      const markdownCategory = categories.find(x => x.category === 'markdown')
      // 获取 Markdown 类型
      const mdType = markdownCategory?.types.find(x => x.extension.includes(misc.MARKDOWN_FILE_EXT))
      docType.value = mdType

      // 默认文件名
      const newFilename = 'new'
      // 显示创建文件对话框
      let filename = await useModal().input({
        title: t('document.create-dialog.title'),
        hint: t('document.create-dialog.hint'),
        modalWidth: '600px',
        component: () => h(CreateFilePanel, {
          currentPath,
          categories,
          docType: docType.value,
          onUpdateDocType: (value: DocType | null | undefined) => {
            docType.value = value
          }
        }),
        value: newFilename,
        maxlength: 255,
        select: true,
      })

      // 如果用户取消了操作
      if (!filename) {
        return
      }

      // 必须有文档类型
      if (!docType.value) {
        throw new Error('Need doc type')
      }

      // 获取支持的扩展名
      const supportedExts = docType.value.extension

      // 移除路径末尾的斜杠
      filename = filename.replace(/\/$/, '')
      const ext = extname(filename)
      // 如果扩展名不在支持列表中，则添加默认扩展名
      if (!supportedExts.includes(ext)) {
        filename += (docType.value.extension[0] || '')
      }

      // 构建完整路径
      doc.path = join(currentPath, normalizeSep(filename))
    }
  }

  // 必须有路径
  if (!doc.path) {
    throw new Error('Need path')
  }

  const filename = basename(doc.path)
  let asBase64 = false
  let content: string | undefined | null

  // 如果提供了内容，则直接使用
  if (typeof doc.content === 'string') {
    content = doc.content
  } else {
    // 否则根据文件名解析文档类型
    if (!docType.value) {
      const _docType = resolveDocType(filename)
      if (!_docType) {
        throw new Error('Could not resolve doc type: ' + filename)
      }

      docType.value = _docType.type
    }

    // 如果文档类型有构建新内容的方法
    if (docType.value.buildNewContent) {
      const _content = await docType.value.buildNewContent(filename)
      if (typeof _content === 'string') {
        content = _content
      } else if (_content) {
        asBase64 = true
        if ('base64Content' in _content) {
          content = _content.base64Content
        } else {
          content = await fileToBase64URL(_content)
        }
      } else {
        throw new Error('Could not build new content for doc type: ' + filename)
      }
    } else {
      throw new Error('Could not build new content for doc type: ' + filename)
    }
  }

  // 创建文档对象
  const file: Doc = { repo: doc.repo, path: doc.path, type: 'file', name: filename, contentHash: 'new' }

  try {
    // 如果是加密文档，需要先加密内容
    if (isEncrypted(file)) {
      const password = await inputPassword(t('document.password-create'), file.name)
      if (!password) {
        return
      }

      const encrypted = encrypt(content, password)
      content = encrypted.content
    }

    // 检查文件路径是否有效
    checkFilePath(file.path)

    if (typeof content !== 'string') {
      throw new Error('Could not get content')
    }

    // 写入文件
    await api.writeFile(file, content, asBase64)

    // 触发文档创建钩子
    triggerHook('DOC_CREATED', { doc: file })
  } catch (error: any) {
    useToast().show('warning', error.message)
    throw error
  }

  return file
}

/**
 * 创建目录
 * @param doc 文档信息，包括仓库和路径
 * @param baseDoc 基础文档对象，用于确定创建位置
 * @returns 创建的目录对象
 */
export async function createDir (doc: Pick<Doc, 'repo' | 'path' | 'content'>, baseDoc: BaseDoc & { type: 'file' | 'dir' }): Promise<Doc>
export async function createDir (doc: Optional<Pick<Doc, 'repo' | 'path' | 'content'>, 'path'>, baseDoc?: BaseDoc & { type: 'file' | 'dir' }): Promise<Doc>
export async function createDir (doc: Optional<Pick<Doc, 'repo' | 'path' | 'content'>, 'path'>, baseDoc?: BaseDoc & { type: 'file' | 'dir' }) {
  // 如果没有提供路径，则需要用户输入
  if (!doc.path) {
    if (baseDoc) {
      // 计算当前路径：如果是目录则使用目录路径，如果是文件则使用其父目录
      const currentPath = baseDoc.type === 'dir' ? baseDoc.path : dirname(baseDoc.path)

      // 显示创建目录对话框
      const name = await useModal().input({
        title: t('document.create-dir-dialog.title'),
        hint: t('document.create-dir-dialog.hint'),
        content: t('document.current-path', currentPath),
        value: 'new-folder',
        select: true
      })

      // 如果用户取消了操作
      if (!name) {
        return
      }

      // 构建完整路径
      doc.path = join(currentPath, normalizeSep(name), '/')
    }
  }

  // 必须有路径
  if (!doc.path) {
    throw new Error('Need path')
  }

  const name = basename(doc.path)

  // 创建目录对象
  const dir: Doc = { ...doc, path: doc.path, type: 'dir', name, contentHash: 'new' }

  try {
    // 检查文件路径是否有效
    checkFilePath(dir.path)
    // 创建目录
    await api.writeFile(dir)

    // 触发文档创建钩子
    triggerHook('DOC_CREATED', { doc: dir })
  } catch (error: any) {
    useToast().show('warning', error.message)
    throw error
  }

  return dir
}

/**
 * 复制文档
 * @param originDoc 原始文档对象
 * @param newPath 新的路径（可选），如果不提供则会提示用户输入
 * @returns void
 */
export async function duplicateDoc (originDoc: Doc, newPath?: string) {
  // 只能复制文件类型的文档
  if (originDoc.type !== 'file') throw new Error('Invalid document type')

  // 如果没有提供新路径，则提示用户输入
  newPath ??= await useModal().input({
    title: t('document.duplicate-dialog.title'),
    hint: t('document.duplicate-dialog.hint'),
    content: t('document.current-path', originDoc.path),
    value: originDoc.path,
    // 默认选择文件基础名称
    select: [
      originDoc.path.lastIndexOf('/') + 1,
      originDoc.name.lastIndexOf('.') > -1 ? originDoc.path.lastIndexOf('.') : originDoc.path.length,
      'forward'
    ]
  }) || ''

  if (!newPath) {
    throw new Error('Need supply new path')
  }

  // 移除路径末尾的斜杠
  newPath = newPath.replace(/\/$/, '')
  const originExt = extname(originDoc.path)
  const newExt = extname(newPath)

  // 检查扩展名
  if (originExt.toLowerCase() !== newExt.toLowerCase()) {
    newPath += extname(originDoc.path)
  }

  // 检查文件路径是否相同
  if (newPath === originDoc.path) {
    const ext = extname(newPath)
    newPath = join(dirname(newPath), `${basename(newPath, ext)}-copy${ext}`)
  }

  // 复制 Markdown 文件
  if (misc.isMarkdownFile(newPath)) {
    const { content } = await api.readFile(originDoc)
    await createDoc({ repo: originDoc.repo, path: newPath, content })
  } else {
    try {
      // 对于非 Markdown 文件，直接复制
      await api.copyFile(originDoc, newPath)
      triggerHook('DOC_CREATED', { doc: { ...originDoc, path: newPath } })
    } catch (error: any) {
      useToast().show('warning', error.message)
      throw error
    }
  }
}

/**
 * 删除文档
 * @param doc 要删除的文档对象
 * @param skipConfirm 是否跳过确认对话框，默认为 false
 */
export async function deleteDoc (doc: PathItem, skipConfirm = false) {
  // 不能删除根目录
  if (doc.path === '/') {
    throw new Error('Could\'t delete root dir.')
  }

  // 如果要删除当前文件或其父文件夹，需要先保存
  if (isSubOrSameFile(doc, store.state.currentFile)) {
    await ensureCurrentFileSaved()
  }

  // 显示删除确认对话框
  const confirm = skipConfirm ? true : await useModal().confirm({
    title: t('document.delete-dialog.title'),
    content: t('document.delete-dialog.content', doc.path),
  })

  if (!confirm) {
    throw new Error('User cancel')
  }

  try {
    // 触发删除前钩子
    await triggerHook('DOC_BEFORE_DELETE', { doc, force: false }, { breakable: true })
    // 删除文件
    await api.deleteFile(doc, true)
  } catch (error: any) {
    // 如果普通删除失败，询问是否强制删除
    const force = await useModal().confirm({
      title: t('document.force-delete-dialog.title'),
      content: t('document.force-delete-dialog.content', doc.path),
    })

    if (force) {
      try {
        // 触发强制删除前钩子
        await triggerHook('DOC_BEFORE_DELETE', { doc, force: true }, { breakable: true })
        // 强制删除文件
        await api.deleteFile(doc, false)
      } catch (err: any) {
        useToast().show('warning', err.message)
        throw error
      }
    } else {
      useToast().show('warning', error.message)
      throw error
    }
  }

  // 触发删除后钩子
  triggerHook('DOC_DELETED', { doc })
}

/**
 * 移动或重命名文档
 * @param doc 要移动或重命名的文档对象
 * @param newPath 新的路径（可选），如果不提供则会提示用户输入
 */
export async function moveDoc (doc: Doc, newPath?: string) {
  // 不能移动或重命名根目录
  if (doc.path === '/') {
    throw new Error('Could\'t move/rename root dir.')
  }

  // 如果要移动当前文件或其父文件夹，需要先保存
  if (isSubOrSameFile(doc, store.state.currentFile)) {
    await ensureCurrentFileSaved()
  }

  // 如果没有提供新路径，则提示用户输入
  newPath ??= await useModal().input({
    title: t('document.move-dialog.title'),
    hint: t('document.move-dialog.content'),
    content: t('document.current-path', doc.path),
    value: doc.path,
    // 默认选择文件基础名称
    select: [
      doc.path.lastIndexOf('/') + 1,
      doc.name.lastIndexOf('.') > -1 ? doc.path.lastIndexOf('.') : doc.path.length,
      'forward'
    ]
  }) || ''

  if (!newPath) {
    return
  }

  // 移除路径末尾的斜杠
  newPath = newPath.replace(/\/$/, '')
  const oldPath = doc.path.replace(/\/$/, '')

  // 如果新旧路径相同，则无需操作
  if (newPath === oldPath) {
    return
  }

  // 创建新的文档对象
  const newDoc: Doc = {
    name: basename(newPath),
    path: newPath,
    repo: doc.repo,
    type: doc.type
  }

  // 检查加密状态是否一致
  if (isEncrypted(doc) !== isEncrypted(newDoc)) {
    useToast().show('warning', t('document.file-transform-error'))
    return
  }

  try {
    // 触发移动前钩子
    await triggerHook('DOC_BEFORE_MOVE', { doc, newDoc }, { breakable: true })
    // 移动文件
    await api.moveFile(doc, newPath)
    // 触发移动后钩子
    triggerHook('DOC_MOVED', { oldDoc: doc, newDoc })
  } catch (error: any) {
    useToast().show('warning', error.message)
    throw error
  }
}

/**
 * 保存文档的核心实现函数
 * @param doc 要保存的文档对象
 * @param content 要保存的内容
 * @returns Promise<void>
 */
async function _saveDoc (doc: Doc, content: string): Promise<void> {
  logger.debug('saveDoc', doc)

  // 只能保存纯文本文档
  if (!doc.plain) {
    logger.warn('saveDoc', 'is not plain doc')
    return
  }

  // 准备保存数据
  const payload = { doc, content }

  // 触发保存前钩子
  // 目前在代码库中， 没有任何地方注册了 DOC_BEFORE_SAVE 钩子处理器 。这意味着当文档保存时，
  // 虽然会触发 DOC_BEFORE_SAVE 钩子，但不会有额外的处理器函数被执行。钩子系统会获取到一个空的
  // 处理器列表，因此直接继续执行后续的保存逻辑。
  await triggerHook('DOC_BEFORE_SAVE', payload, { breakable: true })

  // 更新文档和内容（可能被钩子修改）
  doc = payload.doc
  content = payload.content

  try {
    let sendContent = content
    let passwordHash = ''

    // 如果是加密文档，需要先加密内容
    if (isEncrypted(doc)) {
      const password = await inputPassword(t('document.password-save'), doc.name)
      if (!password) {
        return
      }

      const encrypted = encrypt(sendContent, password)
      // 如果密码哈希不匹配，需要确认是否继续保存
      if (doc.passwordHash !== encrypted.passwordHash) {
        if (!(await useModal().confirm({
          title: t('document.save-encrypted-file-dialog.title'),
          content: t('document.save-encrypted-file-dialog.content')
        }))) {
          return
        }
      }

      sendContent = encrypted.content
      passwordHash = encrypted.passwordHash
    }

    // 写入文件并获取哈希值和状态
    const { hash, stat } = await api.writeFile(doc, sendContent)
    //使用 Object.assign 批量更新文档对象的多个属性：
    // - stat : 文件状态信息（从写入操作返回）
    // - content : 文档内容（原始内容，未加密）
    // - passwordHash : 密码哈希（如果是加密文档）
    // - contentHash : 内容哈希值，用于后续变更检测
    // - status : 文档状态设为 'saved' ，表示已保存
    Object.assign(doc, {
      stat,
      content,
      passwordHash,
      contentHash: hash,
      status: 'saved'
    })
    // 触发保存后钩子
    triggerHook('DOC_SAVED', { doc: store.state.currentFile! })
  } catch (error: any) {
    // 保存失败时更新文档状态
    Object.assign(doc, { status: 'save-failed' })
    useToast().show('warning', error.message)
    throw error
  }
}

/**
 * 保存文档（带锁机制）
 * @param doc 要保存的文档对象
 * @param content 要保存的内容
 */
export async function saveDoc (doc: Doc, content: string): Promise<void> {
  // 使用异步锁确保同时只有一个保存操作在进行
  return lock.acquire('saveDoc', async (done) => {
    try {
      await _saveDoc(doc, content)
      done()
    } catch (e: any) {
      done(e)
    }
  })
}

/**
 * 确保当前文档已保存
 * 在执行某些操作（如关闭文档、切换文档）之前调用此函数以确保文档内容已保存
 */
export async function ensureCurrentFileSaved () {
  // 触发预保存检查钩子
  await triggerHook('DOC_PRE_ENSURE_CURRENT_FILE_SAVED', undefined, { breakable: true })

  const { currentFile, currentContent } = store.state

  // 如果当前文件不是纯文本文档，则不需要检查
  if (!currentFile || !currentFile.plain) {
    return
  }

  // 检查空白文件
  if (!currentFile && currentContent.trim()) {
    const confirm = await useModal().confirm({
      title: t('save-check-dialog.title'),
      content: t('save-check-dialog.desc'),
      action: h(Fragment, [
        h('button', {
          onClick: () => useModal().ok()
        }, t('discard')),
        h('button', {
          onClick: () => useModal().cancel()
        }, t('cancel')),
      ])
    })

    if (confirm) {
      return
    } else {
      throw new Error('Discard saving [blank] file')
    }
  }

  if (!currentFile || !currentFile.status) {
    return
  }

  // 检查是否有未保存的更改且不是帮助仓库中的文件
  const unsaved = !store.getters.isSaved.value && currentFile.repo !== HELP_REPO_NAME

  if (!unsaved) {
    return
  }

  // 创建文档检查器以检测文档是否在保存过程中发生变化
  const currentDocChecker = createCurrentDocChecker()

  // 检查文档是否在保存过程中发生变化
  const checkFile = () => {
    if (currentDocChecker.changed()) {
      throw new Error('Save Error')
    }
  }

  // 保存文档内容
  const saveContent = async () => {
    checkFile()
    await saveDoc(currentFile, currentContent)
  }

  try {
    // 尝试自动保存（仅对非加密文件）
    const autoSave = !isEncrypted(currentFile) && getSetting('auto-save', 2000)
    if (autoSave && currentFile.type === 'file') {
      try {
        await saveContent()
        return
      } catch (error: any) {
        useToast().show('warning', error.message)
      }
    }

    // 创建保存确认的 Promise 解析器
    const saveConfirmResolvers = Promise.withResolvers()
    const confirmPromise = useModal().confirm({
      title: t('save-check-dialog.title'),
      content: t('save-check-dialog.desc'),
      action: h(Fragment, [
        h('button', {
          onClick: async () => {
            try {
              await saveContent()
              saveConfirmResolvers.resolve(true)
            } catch (error: any) {
              logger.error('saveDoc', error)
              useToast().show('warning', error.message)
              saveConfirmResolvers.resolve(false)
            }
          }
        }, t('save')),
        h('button', {
          onClick: () => useModal().ok()
        }, t('discard')),
        h('button', {
          onClick: () => useModal().cancel()
        }, t('cancel')),
      ])
    })

    checkFile()

    // 等待确认结果或保存完成
    const confirm = await Promise.race([confirmPromise, saveConfirmResolvers.promise])

    if (confirm) {
      if (!store.getters.isSaved && currentFile.content) {
        store.state.currentContent = currentFile.content!
      }
    } else {
      throw new Error('Document not saved')
    }
  } catch (error: any) {
    useToast().show('warning', error.message)
    throw error
  }
}

/**
 * 切换文档的核心实现函数
 * @param doc 要切换到的文档对象，如果为 null 则表示切换到空白状态
 * @param opts 切换选项
 * @returns Promise<void>
 */
async function _switchDoc (doc: Doc | null, opts?: SwitchDocOpts): Promise<void> {
  // 深拷贝文档对象以避免意外修改
  doc = doc ? cloneDeep(doc) : null

  logger.debug('switchDoc', doc)

  // 不能切换到目录类型
  if (doc && doc.type === 'dir') {
    throw new Error('Invalid document type')
  }

  // 触发切换前预处理钩子
  await triggerHook('DOC_PRE_SWITCH', { doc, opts }, { breakable: true })

  const force = opts?.force

  // 如果不是强制切换且目标文档与当前文档相同，则跳过切换
  if (!force && store.state.currentFile !== undefined && isSameFile(doc, store.state.currentFile)) {
    logger.debug('skip switch', doc)
    triggerHook('DOC_SWITCH_SKIPPED', { doc, opts })
    return
  }

  // 确保当前文档已保存（强制切换时忽略错误）
  await ensureCurrentFileSaved().catch(error => {
    if (force) {
      console.error(error)
    } else {
      throw error
    }
  })

  // 设置文档属性
  if (doc) {
    doc.plain = isPlain(doc)
    doc.absolutePath = getAbsolutePath(doc)
  }

  // 触发切换前钩子（忽略错误）
  await triggerHook('DOC_BEFORE_SWITCH', { doc, opts }, { breakable: true, ignoreError: true })

  try {
    // 如果文档为空或不是文件类型，则设置为空白状态
    if (!doc || doc.type !== 'file') {
      store.state.currentFile = doc
      store.state.currentContent = ''
      triggerHook('DOC_SWITCHED', { doc: null, opts })
      return
    }

    let content = ''
    let hash = ''
    let stat: FileStat | undefined
    let writeable: boolean | undefined
    
    // 如果是纯文本文档，读取文件内容
    if (doc.plain) {
      // 设置超时定时器，在加载时间较长时显示临时状态
      const timer = setTimeout(() => {
        store.state.currentFile = { ...doc!, status: undefined }
        store.state.currentContent = doc?.content || ''
      }, 150)

      // 读取文件内容
      const res = await api.readFile(doc)
      clearTimeout(timer)

      content = res.content
      hash = res.hash
      stat = res.stat
      writeable = res.writeable
    }

    // 解密内容
    let passwordHash = ''
    if (isEncrypted(doc)) {
      const password = await inputPassword(t('document.password-open'), doc.name, true)
      const decrypted = decrypt(content, password)
      content = decrypted.content
      passwordHash = decrypted.passwordHash
    }

    // 更新当前文档状态
    store.state.currentFile = {
      ...doc,
      stat,
      writeable,
      content,
      passwordHash,
      contentHash: hash,
      status: 'loaded'
    }

    // 更新当前文档内容
    store.state.currentContent = content
    // 触发切换后钩子
    triggerHook('DOC_SWITCHED', { doc: store.state.currentFile || null, opts })
  } catch (error: any) {
    // 触发切换失败钩子
    triggerHook('DOC_SWITCH_FAILED', { doc, message: error.message, opts })
    // 显示错误消息（如果是密码错误则显示相应提示）
    useToast().show('warning', error.message.includes('Malformed') ? t('document.wrong-password') : error.message)
    throw error
  }
}

/**
 * 切换文档（带锁机制）
 * @param doc 要切换到的文档对象，如果为 null 则表示切换到空白状态
 * @param opts 切换选项
 */
export async function switchDoc (doc: Doc | null, opts?: SwitchDocOpts): Promise<void> {
  // 使用异步锁确保同时只有一个切换操作在进行
  return lock.acquire('switchDoc', async (done) => {
    try {
      await _switchDoc(doc, opts)
      done()
    } catch (e: any) {
      done(e)
    }
  })
}

/**
 * 根据路径切换文档
 * @param path 文档的完整路径
 * @returns Promise<void>
 */
export async function switchDocByPath (path: string): Promise<void> {
  logger.debug('switchDocByPath', path)

  // 查找路径所属的仓库
  const repo = getAllRepos().find(x => isBelongTo(normalizeSep(x.path), normalizeSep(path)))
  if (repo) {
    // 如果找到了对应的仓库，切换到该文档
    return switchDoc({
      type: 'file',
      repo: repo.name,
      name: basename(path),
      path: resolve(relative(repo.path, path))
    })
  } else {
    // 如果没找到对应仓库
    if (FLAG_MAS) {
      useModal().alert({ title: 'Error', content: `Could not find repo of path: ${path}` })
      return
    }

    let root = '/'
    // 在 Windows 系统上处理路径
    if (isWindows) {
      const regMatch = path.match(/^([a-zA-Z]:\\|\\\\)/)
      if (regMatch) {
        root = regMatch[1]
        path = path.replace(root, '/')
      }
    }

    // 切换到系统根目录下的文档
    return switchDoc({
      type: 'file',
      repo: misc.ROOT_REPO_NAME_PREFIX + root,
      name: basename(path),
      path: normalizeSep(path)
    })
  }
}

/**
 * 标记文档（添加到收藏）
 * @param doc 要标记的文档对象
 */
export async function markDoc (doc: BaseDoc) {
  // 过滤掉已存在的标记，然后添加新标记
  const list = getSetting('mark', []).filter(x => !(x.path === doc.path && x.repo === doc.repo))
  list.push({ type: 'file', repo: doc.repo, path: doc.path, name: basename(doc.path) })
  await setSetting('mark', list)
  triggerHook('DOC_CHANGED', { doc })
}

/**
 * 取消标记文档（从收藏中移除）
 * @param doc 要取消标记的文档对象
 */
export async function unmarkDoc (doc: BaseDoc) {
  // 过滤掉指定的标记
  const list = getSetting('mark', []).filter(x => !(x.path === doc.path && x.repo === doc.repo))
  await setSetting('mark', list)
  triggerHook('DOC_CHANGED', { doc })
}

/**
 * 获取已标记的文件列表
 * @returns 已标记的文件数组
 */
export function getMarkedFiles () {
  return getSetting('mark', []).map(item => ({
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    type: 'file',
    ...item
  }))
}

/**
 * 检查文档是否已被标记
 * @param doc 要检查的文档对象
 * @returns 如果文档已被标记返回 true，否则返回 false
 */
export function isMarked (doc: PathItemWithType) {
  if (doc.type !== 'file') {
    return false
  }

  return getMarkedFiles().findIndex(x => doc.repo === x.repo && doc.path === x.path) > -1
}

/**
 * 在操作系统中打开文档
 * @param doc 文档对象
 * @param reveal 是否在文件管理器中显示文件（默认为 false）
 */
export async function openInOS (doc: PathItem, reveal?: boolean) {
  const repo = getRepo(doc.repo)
  if (repo) {
    const path = join(repo.path, doc.path)
    if (reveal) {
      // 在文件管理器中显示文件
      showItemInFolder(path)
    } else {
      // 直接打开文件
      openPath(path)
    }
  }
}

/**
 * 显示帮助文件
 * @param docName 帮助文件名
 */
export async function showHelp (docName: string) {
  switchDoc({
    type: 'file',
    repo: HELP_REPO_NAME,
    name: docName,
    path: docName,
  })
}

/**
 * 显示文档的历史版本
 * @param doc 文档对象
 */
export function showHistory (doc: Doc) {
  getActionHandler('doc.show-history')(doc)
}

/**
 * 隐藏历史版本面板
 */
export function hideHistory () {
  getActionHandler('doc.hide-history')()
}

/**
 * 缓存支持的文件扩展名
 * 更新扩展名缓存并刷新当前文件（如果支持状态发生变化）
 */
function cacheSupportedExtension () {
  const currentFileSupported = !!(store.state.currentFile && supported(store.state.currentFile))

  // 清空现有缓存
  supportedExtensionCache.types.clear()
  supportedExtensionCache.sortedExtensions = []

  // 遍历所有文档类别并填充缓存
  for (const category of getAllDocCategories()) {
    for (const type of category.types) {
      for (const ext of type.extension) {
        supportedExtensionCache.types.set(ext, { type, category })
        supportedExtensionCache.sortedExtensions.push(ext)
      }
    }
  }

  // 按扩展名长度降序排序
  supportedExtensionCache.sortedExtensions.sort((a, b) => b.length - a.length)

  // 如果当前文件的支持状态发生了变化，则重新加载
  if (store.state.currentFile) {
    const currentFileSupportedNow = supported(store.state.currentFile)
    if (currentFileSupported !== currentFileSupportedNow) {
      switchDoc(store.state.currentFile || null, { force: true })
    }
  }
}

/**
 * 注册文档类别
 * @param docCategory 文档类别对象
 */
export function registerDocCategory (docCategory: DocCategory) {
  ioc.register('DOC_CATEGORIES', docCategory)
  cacheSupportedExtension()
}

/**
 * 移除文档类别
 * @param category 要移除的类别名称
 */
export function removeDocCategory (category: string) {
  ioc.removeWhen('DOC_CATEGORIES', item => item.category === category)
  cacheSupportedExtension()
}

/**
 * 获取所有文档类别
 * @returns 所有注册的文档类别数组
 */
export function getAllDocCategories () {
  return ioc.get('DOC_CATEGORIES')
}

/**
 * 解析文档类型
 * @param filename 文件名
 * @returns 解析出的文档类型信息，如果没有找到则返回 null
 */
export function resolveDocType (filename: string) {
  // 查找匹配的扩展名
  const ext = supportedExtensionCache.sortedExtensions.find(ext => filename.endsWith(ext))
  return ext ? supportedExtensionCache.types.get(ext) : null
}

// 注册默认的 Markdown 文档类别
registerDocCategory({
  category: 'markdown',
  displayName: 'Markdown',
  types: [
    {
      id: 'markdown-md',
      displayName: $$t('markdown-file'),
      extension: [misc.MARKDOWN_FILE_EXT],
      plain: true,
      buildNewContent: filename => {
        return `# ${filename.replace(/\.md$/i, '')}\n`
      }
    },
    {
      id: 'markdown-encrypted-md',
      displayName: $$t('encrypted-markdown-file'),
      extension: [misc.ENCRYPTED_MARKDOWN_FILE_EXT],
      plain: true,
      buildNewContent: filename => {
        return `# ${filename.replace(/\.md$/i, '')}\n`
      }
    },
  ]
})

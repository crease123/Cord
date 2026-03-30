import * as os from 'os'
import ip from 'ip'
import * as fs from 'fs-extra'
import uniq from 'lodash/uniq'
import type NodePty from 'node-pty'
import isEqual from 'lodash/isEqual'
import * as path from 'path'
import Koa from 'koa'
import bodyParser from 'koa-body'
import * as mime from 'mime'
import * as undici from 'undici'
import { promisify } from 'util'
import { STATIC_DIR, HOME_DIR, HELP_DIR, USER_PLUGIN_DIR, FLAG_DISABLE_SERVER, APP_NAME, USER_THEME_DIR, RESOURCES_DIR, BUILD_IN_STYLES, USER_EXTENSION_DIR, USER_DATA } from '../constant'
import * as file from './file'
import * as search from './search'
import run from './run'
import convert from './convert'
import plantuml from './plantuml'
import * as premium from './premium'
import shell from '../shell'
import config from '../config'
import * as jwt from '../jwt'
import { getAction } from '../action'
import * as extension from '../extension'
import type { FileReadResult } from '../../share/types'

const isLocalhost = (address: string) => {
  return ip.isEqual(address, '127.0.0.1') || ip.isEqual(address, '::1')
}

const result = (status: 'ok' | 'error' = 'ok', message = 'success', data: any = null) => {
  return { status, message, data }
}

const noCache = (ctx: any) => {
  ctx.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  ctx.set('Pragma', 'no-cache')
  ctx.set('Expires', 0)
}

const checkPermission = (ctx: any, next: any) => {
  const token = ctx.query._token || (ctx.headers['x-yn-authorization'] ?? (ctx.headers.authorization || '')).replace('Bearer', '').trim()

  if (ctx.req._protocol || (!token && isLocalhost(ctx.request.ip))) {
    ctx.req.jwt = { role: 'admin' }
    return next()
  }

  if (!ctx.path.startsWith('/api')) {
    return next()
  }

  const allowList = {
    public: [
      '/api/help',
      '/api/custom-css',
      '/api/custom-styles',
      '/api/plugins',
      '/api/attachment',
      '/api/plantuml',
      '/api/settings/js',
      '/api/extensions',
    ],
    guest: [
      '/api/file',
      '/api/settings',
      '/api/proxy-fetch'
    ]
  }

  if (ctx.method === 'GET' && allowList.public.some(x => ctx.path.startsWith(x))) {
    return next()
  }

  let payload
  try {
    payload = jwt.verify(token)
    ctx.req.jwt = payload
  } catch (error) {
    ctx.status = 401
    throw error
  }

  if (payload.role === 'admin') {
    return next()
  }

  if (payload.role === 'guest' && ctx.method === 'GET' && allowList.guest.some(x => ctx.path.startsWith(x))) {
    return next()
  }

  ctx.status = 403
  throw new Error('Forbidden')
}

const isAdmin = (ctx: any) => ctx.req.jwt && ctx.req.jwt.role === 'admin'

const checkIsAdmin = (ctx: any) => {
  if (!isAdmin(ctx)) {
    throw new Error('Forbidden')
  }
}

const checkPrivateRepo = (ctx: any, repo: string) => {
  if (repo.startsWith('__')) {
    checkIsAdmin(ctx)
  }
}

const fileContent = async (ctx: any, next: any) => {
  if (ctx.path === '/api/file') {
    if (ctx.method === 'GET') {
      const { repo, path, asBase64 } = ctx.query

      checkPrivateRepo(ctx, repo)

      const stat = await file.stat(repo, path)

      // limit 30mb
      if (stat.size > 30 * 1024 * 1024) {
        throw new Error('File is too large.')
      }

      const content = await file.read(repo, path)

      const data: FileReadResult = {
        content: content.toString(asBase64 ? 'base64' : undefined),
        hash: await file.hash(repo, path),
        stat: await file.stat(repo, path),
        writeable: await file.checkWriteable(repo, path),
      }

      ctx.body = result('ok', 'success', data)
    } else if (ctx.method === 'POST') {
      const { oldHash, content, asBase64, repo, path } = ctx.request.body

      if (!oldHash) {
        throw new Error('No hash.')
      } else if (oldHash === 'new' && (await file.exists(repo, path))) {
        throw new Error('File or directory already exists.')
      } else if (oldHash !== 'new' && !(await file.checkHash(repo, path, oldHash))) {
        throw new Error('File is stale. Please refresh.')
      }

      let saveContent = content
      if (asBase64) {
        saveContent = Buffer.from(
          content.startsWith('data:') ? content.substring(content.indexOf(',') + 1) : content,
          'base64'
        )
      }

      ctx.body = result('ok', 'success', {
        hash: await file.write(repo, path, saveContent),
        stat: await file.stat(repo, path),
      })
    } else if (ctx.method === 'DELETE') {
      const trash = ctx.query.trash !== 'false'
      await file.rm(ctx.query.repo, ctx.query.path, trash)
      ctx.body = result()
    } else if (ctx.method === 'PATCH') {
      const { repo, oldPath, newPath } = ctx.request.body
      if (oldPath === newPath) {
        throw new Error('No change.')
      }

      if ((await file.exists(repo, newPath)) && newPath.toLowerCase() !== oldPath.toLowerCase()) {
        throw new Error('File or directory already exists.')
      }

      await file.mv(repo, oldPath, newPath)
      ctx.body = result()
    } else if (ctx.method === 'PUT') {
      const { repo, oldPath, newPath } = ctx.request.body
      if ((await file.exists(repo, newPath))) {
        throw new Error('File or directory already exists.')
      }

      await file.cp(repo, oldPath, newPath)
      ctx.body = result()
    }
  } else if (ctx.path === '/api/tree') {
    const arr = (ctx.query.sort || '').split('-')
    const sort = { by: arr[0] || 'name', order: arr[1] || 'asc' }
    ctx.body = result('ok', 'success', (await file.tree(ctx.query.repo, sort, ctx.query.include, ctx.query.noEmptyDir === 'true')))
  } else if (ctx.path === '/api/history/list') {
    ctx.body = result('ok', 'success', (await file.historyList(ctx.query.repo, ctx.query.path)))
  } else if (ctx.path === '/api/history/content') {
    ctx.body = result('ok', 'success', (await file.historyContent(ctx.query.repo, ctx.query.path, ctx.query.version)))
  } else if (ctx.path === '/api/history/delete') {
    const { repo, path, version } = ctx.request.body
    ctx.body = result('ok', 'success', (await file.deleteHistoryVersion(repo, path, version)))
  } else if (ctx.path === '/api/history/comment') {
    const { repo, path, version, msg } = ctx.request.body
    ctx.body = result('ok', 'success', (await file.commentHistoryVersion(repo, path, version, msg)))
  } else if (ctx.path === '/api/watch-file') {
    const { repo, path, options } = ctx.request.body
    ctx.body = await file.watchFile(repo, path, options)
  } else {
    await next()
  }
}

const attachment = async (ctx: any, next: any) => {
  if (ctx.path.startsWith('/api/attachment')) {
    if (ctx.method === 'POST') {
      const path = ctx.request.body.path
      const repo = ctx.request.body.repo
      const attachment = ctx.request.body.attachment
      const exists = ctx.request.body.exists
      const buffer = Buffer.from(attachment.substring(attachment.indexOf(',') + 1), 'base64')
      const res = await file.upload(repo, buffer, path, exists)
      ctx.body = result('ok', 'success', res)
    } else if (ctx.method === 'GET') {
      let { repo, path } = ctx.query

      if (!repo || !path) {
        const filePath = ctx.path.replace('/api/attachment', '')
        const arr = filePath.split('/')
        repo = decodeURIComponent(arr[1] || '')
        path = decodeURI(arr.slice(2).join('/'))
      }

      if (!repo || !path) {
        throw new Error('Invalid path.')
      }

      checkPrivateRepo(ctx, repo)

      noCache(ctx)

      try {
        // support range
        const range = ctx.headers.range
        if (range) {
          const { size } = await file.stat(repo, path)
          const requestRange = range.replace('bytes=', '').split('-').map((x: string) => parseInt(x || '-1'))
          const start = requestRange[0] < 0 ? 0 : requestRange[0]
          const end = requestRange[1] < 0
            ? size - 1
            : requestRange[1]

          const chunkSize = end - start + 1

          ctx.status = 206
          ctx.set('Content-Range', `bytes ${start}-${end}/${size}`)
          ctx.set('Accept-Ranges', 'bytes')
          ctx.set('Content-Length', chunkSize)
          ctx.body = await file.createReadStream(repo, path, { start, end })
        } else {
          ctx.body = await file.read(repo, path)
        }
        ctx.type = mime.getType(path)
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          ctx.status = 404
          ctx.body = result('error', 'Not found')
        } else {
          throw error
        }
      }
    }
  } else {
    await next()
  }
}

const searchFile = async (ctx: any, next: any) => {
  if (ctx.path.startsWith('/api/search') && ctx.method === 'POST') {
    const query = ctx.request.body.query
    ctx.body = await search.search(query)
  } else {
    await next()
  }
}

const plantumlGen = async (ctx: any, next: any) => {
  if (ctx.path.startsWith('/api/plantuml')) {
    try {
      const { type, content } = await plantuml(ctx.query.data)
      ctx.type = type
      ctx.body = content
      ctx.set('cache-control', 'max-age=86400') // 1 day.
    } catch (error) {
      ctx.body = error
    }
  } else {
    await next()
  }
}

const runCode = async (ctx: any, next: any) => {
  if (ctx.path.startsWith('/api/run')) {
    ctx.body = await run.runCode(ctx.request.body.cmd, ctx.request.body.code)
  } else {
    await next()
  }
}

const convertFile = async (ctx: any, next: any) => {
  if (ctx.path.startsWith('/api/convert/')) {
    const source = ctx.request.body.source
    const fromType = ctx.request.body.fromType
    const toType = ctx.request.body.toType
    const resourcePath = ctx.request.body.resourcePath

    ctx.set('content-type', 'application/octet-stream')
    ctx.body = await convert(source, fromType, toType, resourcePath)
  } else {
    await next()
  }
}

const tmpFile = async (ctx: any, next: any) => {
  if (ctx.path.startsWith('/api/tmp-file')) {
    const absPath = path.join(os.tmpdir(), APP_NAME + '-' + ctx.query.name.replace(/\//g, '_'))
    if (ctx.method === 'GET') {
      ctx.body = await fs.readFile(absPath)
    } else if (ctx.method === 'POST') {
      let body: any = ctx.request.body.toString()

      if (ctx.query.asBase64) {
        body = Buffer.from(
          body.startsWith('data:') ? body.substring(body.indexOf(',') + 1) : body,
          'base64'
        )
      }

      await fs.writeFile(absPath, body)
      ctx.body = result('ok', 'success', { path: absPath })
    } else if (ctx.method === 'DELETE') {
      await fs.unlink(absPath)
      ctx.body = result('ok', 'success')
    }
  } else {
    await next()
  }
}

const userFile = async (ctx: any, next: any) => {
  if (ctx.path.startsWith('/api/user-file')) {
    const filePath = ctx.query.name.replace(/\.+/g, '.') // replace multiple dots with one dot

    if (!filePath) {
      throw new Error('Invalid path')
    }

    const absPath = path.join(USER_DATA, filePath)

    if (ctx.method === 'GET') {
      ctx.body = await fs.readFile(absPath)
    } else if (ctx.method === 'POST') {
      let body: any = ctx.request.body.toString()

      if (ctx.query.asBase64) {
        body = Buffer.from(
          body.startsWith('data:') ? body.substring(body.indexOf(',') + 1) : body,
          'base64'
        )
      }

      await fs.ensureFile(absPath)
      await fs.writeFile(absPath, body)
      ctx.body = result('ok', 'success', { path: absPath })
    } else if (ctx.method === 'DELETE') {
      await fs.unlink(absPath)
      ctx.body = result('ok', 'success')
    }
  } else if (ctx.path.startsWith('/api/user-dir')) {
    const dirPath = ctx.query.name.replace(/\.+/g, '.') // replace multiple dots with one dot

    if (!dirPath) {
      throw new Error('Invalid path')
    }

    const absPath = path.join(USER_DATA, dirPath)

    if (ctx.method === 'GET') {
      const recursive = ctx.query.recursive === 'true'

      const data: ({ name: string, absolutePath: string, path: string, isFile: boolean, isDir: boolean })[] = []

      const readDirRecursive = async (dir: string) => {
        const items = await fs.readdir(dir, { withFileTypes: true })

        for (const item of items) {
          const absolutePath = path.resolve(dir, item.name)
          data.push({
            name: item.name,
            absolutePath,
            path: path.relative(absPath, absolutePath).replace(/\\/g, '/'),
            isFile: item.isFile(),
            isDir: item.isDirectory(),
          })

          if (recursive && item.isDirectory()) {
            await readDirRecursive(absolutePath)
          }
        }
      }

      await readDirRecursive(absPath)

      ctx.body = result('ok', 'success', data)
    }
  } else {
    await next()
  }
}

const proxy = async (ctx: any, next: any) => {
  if (ctx.path.startsWith('/api/proxy-fetch/')) {
    const url = ctx.originalUrl.replace(/^.*\/api\/proxy-fetch\//, '')

    // TODO ssrf
    // const _url = new URL(url)
    // if (
    //   _url.hostname === 'localhost' ||
    //   (
    //     (ip.isV4Format(_url.hostname) || ip.isV6Format(_url.hostname)) &&
    //     ip.isPrivate(_url.hostname)
    //   )
    // ) {
    //   throw new Error('Invalid URL')
    // }

    let signal: AbortSignal | undefined
    let timeoutTimer: NodeJS.Timeout | undefined

    try {
      const {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        host,
        'x-proxy-url': proxyUrl,
        'x-proxy-timeout': proxyTimeout,
        'x-proxy-max-redirections': maxRedirections = '3',
        ...headers
      } = ctx.headers

      const dispatcher = proxyUrl
        ? getAction('new-proxy-dispatcher')(proxyUrl)
        : await getAction('get-proxy-dispatcher')(url)

      if (proxyTimeout) {
        const controller = new AbortController()
        signal = controller.signal
        timeoutTimer = setTimeout(() => {
          controller.abort()
          timeoutTimer = undefined
        }, Number(proxyTimeout))
      }

      const response = await undici.request(url, {
        dispatcher,
        method: ctx.method,
        headers,
        body: ctx.req,
        signal,
        maxRedirections: Number(maxRedirections)
      })

      // Set the response status, headers, and body
      ctx.status = response.statusCode
      ctx.set(response.headers)
      ctx.body = response.body

      response.body.once('close', () => {
        timeoutTimer && clearTimeout(timeoutTimer)
      })
    } catch (error: any) {
      ctx.status = 500
      timeoutTimer && clearTimeout(timeoutTimer)
      throw error
    }
  } else {
    await next()
  }
}

const readme = async (ctx: any, next: any) => {
  if (ctx.path.startsWith('/api/help')) {
    if (ctx.query.path) {
      ctx.type = mime.getType(ctx.query.path)
      ctx.body = await fs.readFile(path.join(HELP_DIR, ctx.query.path.replace('../', '')))
    } else {
      ctx.body = result('ok', 'success', {
        content: await fs.readFile(path.join(HELP_DIR, ctx.query.doc.replace('../', '')), 'utf-8')
      })
    }
  } else {
    await next()
  }
}

const userPlugin = async (ctx: any, next: any) => {
  if (ctx.path.startsWith('/api/plugins')) {
    ctx.type = 'application/javascript; charset=utf-8'

    let code = ''
    for (const x of await fs.readdir(USER_PLUGIN_DIR, { withFileTypes: true })) {
      if (x.isFile() && x.name.endsWith('.js')) {
        code += `;(async function () {; // ===== ${x.name} =====\n` +
          (await fs.readFile(path.join(USER_PLUGIN_DIR, x.name))) +
          '\n;})(); // ===== end =====\n\n'
      }
    }

    ctx.body = code
  } else {
    await next()
  }
}

const customCss = async (ctx: any, next: any) => {
  if (ctx.path.startsWith('/api/custom-styles')) {
    const files: string[] = [...BUILD_IN_STYLES]
    for (const x of await fs.readdir(USER_THEME_DIR, { withFileTypes: true })) {
      if (x.isFile() && x.name.endsWith('.css')) {
        files.push(x.name)
      }
    }

    ctx.body = result('ok', 'success', Array.from(new Set(files)))
  } else if (ctx.path.startsWith('/custom-css')) {
    const configKey = 'custom-css'
    const defaultCss = BUILD_IN_STYLES[0]

    ctx.type = 'text/css'
    noCache(ctx)

    try {
      const filename = config.get(configKey, defaultCss)

      if (filename.startsWith('extension:')) {
        const extensions = await extension.list()
        const extensionName = filename.substring('extension:'.length, filename.indexOf('/'))
        if (extensions.some(x => x.enabled && x.id === extension.dirnameToId(extensionName))) {
          ctx.redirect(`/extensions/${filename.replace('extension:', '')}`)
        } else {
          throw new Error(`extension not found [${extensionName}]`)
        }
      } else {
        ctx.body = await fs.readFile(path.join(USER_THEME_DIR, filename))
      }
    } catch (error) {
      console.error(error)

      await fs.writeFile(
        path.join(USER_THEME_DIR, defaultCss),
        await fs.readFile(path.join(RESOURCES_DIR, defaultCss))
      )

      config.set(configKey, defaultCss)
      ctx.body = await fs.readFile(path.join(USER_THEME_DIR, defaultCss))
    }
  } else {
    await next()
  }
}

const setting = async (ctx: any, next: any) => {
  if (ctx.path.startsWith('/api/settings')) {
    if (ctx.method === 'GET') {
      const getSettings = () => {
        if (isAdmin(ctx)) {
          return config.getAll()
        } else {
          const data = { ...config.getAll() }
          data.repositories = {}
          data.mark = []

          // remove sensitive data
          Object.keys(data).forEach((key) => {
            if (key.endsWith('-token') || key.endsWith('-secret')) {
              delete data[key]
            }
          })

          delete data.license
          delete data.extensions
          return data
        }
      }

      if (ctx.path.endsWith('js')) {
        ctx.type = 'application/javascript; charset=utf-8'
        noCache(ctx)
        ctx.body = '_INIT_SETTINGS = ' + JSON.stringify(getSettings())
      } else {
        ctx.body = result('ok', 'success', getSettings())
      }
    } else if (ctx.method === 'POST') {
      const oldConfig = config.getAll()
      const data = { ...oldConfig, ...ctx.request.body }
      config.setAll(data)

      const changedKeys = uniq([...Object.keys(oldConfig), ...Object.keys(data)])
        .filter((key) => !isEqual(data[key], oldConfig[key]))

      if (oldConfig.language !== data.language) {
        getAction('i18n.change-language')(data.language)
      }

      if (oldConfig['updater.source'] !== data['updater.source'] && data['updater.source']) {
        getAction('updater.change-source')(data['updater.source'])
      }

      getAction('proxy.reload')(data)
      getAction('envs.reload')(data)
      getAction('shortcuts.reload')(changedKeys)

      ctx.body = result('ok', 'success')
    }
  } else {
    await next()
  }
}

let chooseLock = false
const choose = async (ctx: any, next: any) => {
  if (ctx.path.startsWith('/api/choose')) {
    if (ctx.method === 'POST') {
      const { from } = ctx.query
      const body = ctx.request.body

      if (chooseLock) {
        throw new Error('Busy')
      }

      chooseLock = true
      from === 'browser' && getAction('show-main-window')()
      const data = await getAction('show-open-dialog')(body)
      from === 'browser' && getAction('hide-main-window')()
      chooseLock = false
      ctx.body = result('ok', 'success', data)
    }
  } else {
    await next()
  }
}

const rpc = async (ctx: any, next: any) => {
  if (ctx.path.startsWith('/api/rpc') && ctx.method === 'POST') {
    const { code } = ctx.request.body
    const AsyncFunction = Object.getPrototypeOf(async () => 0).constructor
    const fn = new AsyncFunction('require', code)
    const nodeRequire = (id: string) => id.startsWith('.')
      ? require(path.resolve(__dirname, '..', id))
      : require(id)
    ctx.body = result('ok', 'success', await fn(nodeRequire))
  } else {
    await next()
  }
}

const sendFile = async (ctx: any, next: any, filePath: string, fullback = true) => {
  if (!fs.existsSync(filePath)) {
    if (fullback) {
      await sendFile(ctx, next, path.resolve(STATIC_DIR, 'index.html'), false)
    } else {
      next()
    }

    return false
  }

  const fileStat = fs.statSync(filePath)
  if (fileStat.isDirectory()) {
    await sendFile(ctx, next, path.resolve(filePath, 'index.html'))
    return true
  }

  ctx.body = await promisify(fs.readFile)(filePath)
  ctx.set('Content-Length', fileStat.size)
  ctx.set('Last-Modified', fileStat.mtime.toUTCString())
  ctx.set('Cache-Control', 'max-age=0')
  ctx.set('X-XSS-Protection', '0')
  ctx.type = path.extname(filePath)

  return true
}

const userExtension = async (ctx: any, next: any) => {
  if (ctx.method === 'GET') {
    if (ctx.path.startsWith('/api/extensions')) {
      ctx.body = result('ok', 'success', await extension.list())
    } else if (ctx.path.startsWith('/extensions/') && ctx.method === 'GET') {
      const filePath = path.join(USER_EXTENSION_DIR, ctx.path.replace('/extensions', ''))
      await sendFile(ctx, next, filePath, false)
    } else {
      await next()
    }
  } else {
    const id = ctx.query.id
    if (ctx.path.startsWith('/api/extensions/install')) {
      ctx.body = result('ok', 'success', await extension.install(id, ctx.query.url))
    } else if (ctx.path.startsWith('/api/extensions/uninstall')) {
      ctx.body = result('ok', 'success', await extension.uninstall(id))
    } else if (ctx.path.startsWith('/api/extensions/enable')) {
      ctx.body = result('ok', 'success', await extension.enable(id))
    } else if (ctx.path.startsWith('/api/extensions/disable')) {
      ctx.body = result('ok', 'success', await extension.disable(id))
    } else if (ctx.path.startsWith('/api/extensions/abort-installation')) {
      ctx.body = result('ok', 'success', await extension.abortInstallation())
    } else {
      await next()
    }
  }
}

const premiumManage = async (ctx: any, next: any) => {
  if (ctx.method === 'POST' && ctx.path.startsWith('/api/premium')) {
    const { method, payload } = ctx.request.body
    const data = await (premium as any)[method](payload)
    ctx.body = result('ok', 'success', data)
  } else {
    await next()
  }
}

const wrapper = async (ctx: any, next: any, fun: any) => {
  try {
    await fun(ctx, next)
  } catch (error: any) {
    console.error(error)
    ctx.set('x-yank-note-api-status', 'error')
    ctx.set('x-yank-note-api-message', encodeURIComponent(error.message))
    ctx.body = result('error', error.message)
  }
}

const ptyProcesses: NodePty.IPty[] = []

export async function killPtyProcesses (pty?: NodePty.IPty) {
  const kill = async (ptyProcess: NodePty.IPty) => {
    const index = ptyProcesses.indexOf(ptyProcess)
    if (index >= 0) {
      ptyProcesses.splice(index, 1)
    } else {
      // already killed
      return
    }

    const promise = Promise.race([
      new Promise<void>((resolve) => {
        ptyProcess.onExit(() => resolve())
      }),
      new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 500)
      })
    ])

    ptyProcess.kill()

    await promise
  }

  if (pty) {
    await kill(pty)
  } else {
    for (const ptyProcess of [...ptyProcesses]) {
      await kill(ptyProcess)
    }
    ptyProcesses.length = 0
  }
}

/**
 * 创建并配置 HTTP 服务器
 * @param port - 服务器监听端口，默认 3000
 * @returns 返回包含 callback 和 server 实例的对象
 */
const server = (port = 3000) => {
  // 创建 Koa 应用实例
  const app = new Koa()

  // 注册权限检查中间件（第一道防线，验证请求合法性）
  app.use(async (ctx: any, next: any) => await wrapper(ctx, next, checkPermission))
  // 注册代理转发中间件（处理 /api/proxy-fetch/* 请求）
  app.use(async (ctx: any, next: any) => await wrapper(ctx, next, proxy))

  // 注册请求体解析中间件，支持多种格式
  app.use(bodyParser({
    multipart: true,              // 支持 multipart/form-data（文件上传）
    formLimit: '50mb',            // 表单数据大小限制
    jsonLimit: '50mb',            // JSON 数据大小限制
    textLimit: '50mb',            // 纯文本数据大小限制
    formidable: {
      maxFieldsSize: 268435456    // 表单字段最大大小（256MB）
    }
  }))

  // 注册业务中间件（按顺序匹配处理）
  app.use(async (ctx: any, next: any) => await wrapper(ctx, next, fileContent))        // 文件读写 API (/api/file, /api/tree 等)
  app.use(async (ctx: any, next: any) => await wrapper(ctx, next, attachment))         // 附件上传下载 API (/api/attachment)
  app.use(async (ctx: any, next: any) => await wrapper(ctx, next, plantumlGen))        // PlantUML 图表生成 API (/api/plantuml)
  app.use(async (ctx: any, next: any) => await wrapper(ctx, next, runCode))            // 代码运行 API (/api/run)
  app.use(async (ctx: any, next: any) => await wrapper(ctx, next, convertFile))        // 文件转换 API (/api/convert/*)
  app.use(async (ctx: any, next: any) => await wrapper(ctx, next, searchFile))         // 文件搜索 API (/api/search)
  app.use(async (ctx: any, next: any) => await wrapper(ctx, next, readme))             // 帮助文档 API (/api/help)
  app.use(async (ctx: any, next: any) => await wrapper(ctx, next, userPlugin))         // 用户插件 API (/api/plugins)
  app.use(async (ctx: any, next: any) => await wrapper(ctx, next, customCss))          // 自定义样式 API (/api/custom-styles, /custom-css)
  app.use(async (ctx: any, next: any) => await wrapper(ctx, next, userExtension))      // 扩展管理 API (/api/extensions, /extensions/*)
  app.use(async (ctx: any, next: any) => await wrapper(ctx, next, premiumManage))      // 高级功能管理 API (/api/premium)
  app.use(async (ctx: any, next: any) => await wrapper(ctx, next, setting))            // 设置管理 API (/api/settings)
  app.use(async (ctx: any, next: any) => await wrapper(ctx, next, choose))             // 文件选择对话框 API (/api/choose)
  app.use(async (ctx: any, next: any) => await wrapper(ctx, next, tmpFile))            // 临时文件 API (/api/tmp-file)
  app.use(async (ctx: any, next: any) => await wrapper(ctx, next, userFile))           // 用户文件 API (/api/user-file, /api/user-dir)
  app.use(async (ctx: any, next: any) => await wrapper(ctx, next, rpc))                // RPC 调用 API (/api/rpc)

  // 静态文件服务中间件（处理最后的路径匹配）
  app.use(async (ctx: any, next: any) => {
    // 解码 URL 路径并移除 /static/ 前缀或开头的 /
    const urlPath = decodeURIComponent(ctx.path).replace(/^(\/static\/|\/)/, '')

    // 优先从 STATIC_DIR（内置静态资源目录）查找文件
    // 如果找不到且 fullback=true，则返回 index.html
    if (!(await sendFile(ctx, next, path.resolve(STATIC_DIR, urlPath), false))) {
      // 如果内置目录没有，则从用户主题目录查找
      await sendFile(ctx, next, path.resolve(USER_THEME_DIR, urlPath), true)
    }
  })

  // 获取 Koa 应用的回调函数（用于创建 HTTP 服务器）
  const callback = app.callback()

  // 如果服务器功能被禁用，只返回 callback（不启动 HTTP 监听）
  if (FLAG_DISABLE_SERVER) {
    return { callback }
  }

  // 创建原生 HTTP 服务器，使用 Koa 的 callback 作为请求处理器
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const server = require('http').createServer(callback)
  // 创建 Socket.IO 服务器，绑定到 HTTP 服务器，设置 WebSocket 路径为 /ws
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const io = require('socket.io')(server, { path: '/ws' })
  // eslint-disable-next-line @typescript-eslint/no-var-requires

  // node-pty 模块引用（用于创建伪终端）
  let pty: typeof NodePty | null = null

  // 尝试加载 node-pty 模块（某些平台可能不支持）
  try {
    pty = require('node-pty')
  } catch (error) {
    console.error(error)
  }

  // 监听 WebSocket 连接事件
  io.on('connection', (socket: any) => {
    // 安全检查：只允许 localhost 连接（防止远程访问终端）
    if (!isLocalhost(socket.client.conn.remoteAddress)) {
      socket.disconnect()
      return
    }

    // 如果 node-pty 可用，则创建伪终端
    if (pty) {
      // 解析环境变量配置（从 WebSocket 握手参数中获取）
      const env = JSON.parse(socket.handshake.query.env || '{}')

      // 创建伪终端进程
      const ptyProcess = pty.spawn(shell.getShell(), [], {
        name: 'xterm-color',                    // 终端类型名称
        cols: 80,                               // 初始列数
        rows: 24,                               // 初始行数
        cwd: socket.handshake.query.cwd || HOME_DIR,  // 工作目录
        env: { ...process.env, ...env },        // 合并环境变量
      })

      // 将 PTY 进程加入管理列表（用于退出时清理）
      ptyProcesses.push(ptyProcess)

      // 定义进程清理函数
      const kill = () => {
        killPtyProcesses(ptyProcess)
      }

      // 监听 PTY 进程的输出数据，通过 WebSocket 发送给客户端
      ptyProcess.onData((data: any) => socket.emit('output', data))
      // 监听 PTY 进程退出事件
      ptyProcess.onExit(() => {
        console.log('ptyProcess exit')
        socket.disconnect()           // 断开 WebSocket 连接
        process.off('exit', kill)     // 移除进程退出监听
      })

      // 监听客户端输入事件（用户在终端中输入的命令）
      socket.on('input', (data: any) => {
        // 如果是 cd 命令前缀，需要转换命令格式
        if (data.startsWith(shell.CD_COMMAND_PREFIX)) {
          ptyProcess.write(shell.transformCdCommand(data.toString()))
        } else {
          ptyProcess.write(data)
        }
      })
      // 监听终端大小调整事件
      socket.on('resize', (size: any) => ptyProcess.resize(size[0], size[1]))
      // 监听客户端断开连接事件，清理 PTY 进程
      socket.on('disconnect', kill)

      // 监听主进程退出事件，确保 PTY 进程被清理
      process.on('exit', kill)
    } else {
      // node-pty 不可用时，发送错误提示
      socket.emit('output', 'node-pty is not compatible with this platform. Please install another version from GitHub https://github.com/purocean/yn/releases')
    }
  })

  // 从配置中获取服务器监听地址，默认 127.0.0.1（仅本地访问）
  const host = config.get('server.host', '127.0.0.1')
  // 启动 HTTP 服务器监听
  server.listen(port, host)

  // 输出服务器地址到控制台
  console.log(`Address: http://${host}:${port}`)

  // 返回 callback 和 server 实例
  return { callback, server }
}

export default server

import Markdown from 'markdown-it'
import { h } from 'vue'
import { Plugin } from '@fe/context'
import { t } from '@fe/services/i18n'
import { getInitialized, getLoadStatus } from '@fe/others/extension'

const MarkdownItPlugin = (md: Markdown) => {
  const extensionId = '@yank-note/extension-drawio'
  //1. Draw.io 扩展检查
  const checkExtensionLoaded = () => !!getLoadStatus(extensionId).version
  //2. 渲染提示函数
    //- 当 Draw.io 扩展未加载时，渲染一个提示链接
  // - 使用 Vue 的 h 函数创建虚拟 DOM 节点
  // - 点击链接会打开扩展管理器，引导用户安装 Draw.io 扩展
  const render = () => {
    if (!getInitialized()) {
      return null
    }

    return h('p', h(
      'a',
      { href: `javascript:ctx.showExtensionManager('${extensionId}')` },
      h('i', t('install-extension-tips', 'Drawio'))
    ))
  }
  //3. 链接渲染函数 - 拦截并处理 Draw.io 链接
  /**
   * 保存原始的 link_open 渲染规则
   * md.renderer.rules.link_open 负责渲染 Markdown 中的链接 opening 标签，如 [文本](url) 中的 <a> 标签
   * 使用 .bind() 保存原始函数的引用，确保后续可以调用原始渲染逻辑
   */
  const linkTemp = md.renderer.rules.link_open!.bind(md.renderer.rules)
  
  /**
   * 替换 link_open 渲染规则，实现拦截逻辑
   * @param tokens - Markdown 解析后生成的 token 数组
   * @param idx - 当前处理的 token 索引
   * @param options - Markdown 渲染选项
   * @param env - 渲染环境信息（包含文件路径等）
   * @param slf - 渲染器实例本身
   */
  md.renderer.rules.link_open = (tokens, idx, options, env, slf) => {
    // 如果 Draw.io 扩展已加载，直接调用原始渲染规则，不拦截
    if (checkExtensionLoaded()) {
      return linkTemp(tokens, idx, options, env, slf)
    }

    // 获取当前 token（链接的 opening 标签）
    const token = tokens[idx]

    // 检查 token 是否有 link-type="drawio" 属性
    // 只有带有此属性的链接才需要特殊处理，如：[图表](./file.drawio){link-type="drawio"}
    if (token.attrGet('link-type') !== 'drawio') {
      // 不是 Draw.io 链接，调用原始渲染规则
      return linkTemp(tokens, idx, options, env, slf)
    }

    // 获取下一个 token（通常是链接的文本内容）
    const nextToken = tokens[idx + 1]
    // 如果下一个 token 是文本类型，清空其内容
    // 这样做的目的是：不显示原始的链接文本，只显示安装提示
    if (nextToken && nextToken.type === 'text') {
      nextToken.content = ''
    }

    // 返回自定义渲染结果：显示"安装 Draw.io 扩展"的提示链接
    return render() as any
  }
  //4. 围栏渲染函数
  const fenceTemp = md.renderer.rules.fence!.bind(md.renderer.rules)
  md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
    if (checkExtensionLoaded()) {
      return fenceTemp(tokens, idx, options, env, slf)
    }

    const token = tokens[idx]

    const code = token.content.trim()
    const firstLine = code.split(/\n/)[0].trim()
    if (token.info !== 'xml' || !firstLine.includes('--drawio--')) {
      return fenceTemp(tokens, idx, options, env, slf)
    }

    return render() as any
  }
}

export default {
  name: 'markdown-drawio',
  register: ctx => {
    ctx.markdown.registerPlugin(MarkdownItPlugin)

    ctx.editor.tapSimpleCompletionItems(items => {
      /* eslint-disable no-template-curly-in-string */

      items.push(
        { language: 'markdown', label: '/ []() Drawio Link', insertText: '[${2:Drawio}]($1){link-type="drawio"}', block: true },
      )
    })
  }
} as Plugin

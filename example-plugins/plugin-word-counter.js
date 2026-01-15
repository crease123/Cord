/**
 * 外部插件示例：实时字数统计
 * 
 * 使用方法：
 * 1. 将此文件复制到 Yank Note 主目录的 plugins/ 文件夹
 * 2. 右键托盘图标 → 开发 → 重新加载
 * 
 * 功能：
 * - 显示中文字符数、英文单词数、总字符数
 * - 估算阅读时间
 */

window.registerPlugin({
  name: 'plugin-word-counter',
  register: ctx => {
    // 统计函数
    const countWords = (text) => {
      if (!text) return { chinese: 0, english: 0, total: 0, readingTime: 0 }
      
      // 统计中文字符
      const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
      
      // 统计英文单词
      const englishWords = (text.match(/[a-zA-Z]+/g) || []).length
      
      // 总字符数（不含空白）
      const totalChars = text.replace(/\s/g, '').length
      
      // 估算阅读时间（中文 400 字/分钟，英文 200 词/分钟）
      const readingMinutes = Math.ceil((chineseChars / 400) + (englishWords / 200))
      
      return {
        chinese: chineseChars,
        english: englishWords,
        total: totalChars,
        readingTime: readingMinutes
      }
    }

    // 注册 Action：显示详细统计
    ctx.action.registerAction({
      name: 'plugin.word-counter.show',
      description: '显示文档字数统计',
      keys: [ctx.keybinding.Ctrl, ctx.keybinding.Shift, 'w'],
      forUser: true,
      handler: () => {
        const content = ctx.editor.getValue()
        const stats = countWords(content)
        
        ctx.ui.useModal().alert({
          title: '📊 文档统计',
          content: `
中文字符：${stats.chinese} 个
英文单词：${stats.english} 个
总字符数：${stats.total} 个
预计阅读：${stats.readingTime} 分钟
          `.trim()
        })
      }
    })

    // 注册状态栏
    ctx.statusBar.tapMenus(menus => {
      menus['word-counter'] = {
        id: 'word-counter',
        position: 'right',
        title: '📝 字数统计',
        order: -500,
        onClick: () => ctx.action.getActionHandler('plugin.word-counter.show')()
      }
    })
  }
})


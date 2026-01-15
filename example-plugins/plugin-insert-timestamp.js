/**
 * 外部插件示例：快速插入时间戳
 * 
 * 使用方法：
 * 1. 将此文件复制到 Yank Note 主目录的 plugins/ 文件夹
 * 2. 右键托盘图标 → 开发 → 重新加载
 * 3. 使用 Ctrl+Shift+T 插入当前时间
 * 
 * 功能：
 * - 状态栏显示时钟图标
 * - 点击或快捷键插入当前时间戳
 * - 支持多种时间格式
 */

window.registerPlugin({
  name: 'plugin-insert-timestamp',
  register: ctx => {
    // 时间格式选项
    const formats = [
      { label: '完整格式', format: 'YYYY-MM-DD HH:mm:ss' },
      { label: '日期', format: 'YYYY-MM-DD' },
      { label: '时间', format: 'HH:mm:ss' },
      { label: '中文格式', format: 'YYYY年MM月DD日 HH:mm' },
      { label: 'ISO格式', format: 'YYYY-MM-DDTHH:mm:ssZ' },
    ]

    // 当前选择的格式索引
    let currentFormatIndex = 0

    // 插入时间戳
    const insertTimestamp = (formatIndex) => {
      const idx = formatIndex ?? currentFormatIndex
      const timestamp = ctx.lib.dayjs().format(formats[idx].format)
      ctx.editor.insert(timestamp)
      ctx.ui.useToast().show('info', `已插入: ${timestamp}`)
    }

    // 注册 Action
    ctx.action.registerAction({
      name: 'plugin.insert-timestamp.now',
      description: '插入当前时间戳',
      keys: [ctx.keybinding.Ctrl, ctx.keybinding.Shift, 't'],
      forUser: true,
      handler: () => insertTimestamp()
    })

    // 注册状态栏菜单
    ctx.statusBar.tapMenus(menus => {
      menus['insert-timestamp'] = {
        id: 'insert-timestamp',
        position: 'left',
        title: '⏰',
        order: 9999,
        list: formats.map((f, idx) => ({
          id: `format-${idx}`,
          type: 'normal',
          title: `${f.label} (${ctx.lib.dayjs().format(f.format)})`,
          onClick: () => {
            currentFormatIndex = idx
            insertTimestamp(idx)
          }
        }))
      }
    })

    // 添加样式
    ctx.theme.addStyles(`
      .status-bar-menu [data-id="insert-timestamp"] {
        font-size: 14px;
      }
    `)
  }
})


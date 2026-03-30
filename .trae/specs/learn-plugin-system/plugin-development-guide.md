# Cord (Yank Note) 插件开发指南

## 📚 目录

1. [插件系统概述](#1-插件系统概述)
2. [插件基础结构](#2-插件基础结构)
3. [开发环境准备](#3-开发环境准备)
4. [Context API 详解](#4-context-api-详解)
5. [插件开发实战](#5-插件开发实战)
6. [调试与测试](#6-调试与测试)
7. [最佳实践](#7-最佳实践)
8. [常见问题](#8-常见问题)

---

## 1. 插件系统概述

### 1.1 什么是 Cord 插件？

Cord 插件是一个 JavaScript 对象，包含：
- **name**: 插件的唯一标识符
- **register**: 注册函数，接收 Context 对象，返回可选的 API 对象

### 1.2 插件类型

#### 内置插件
- 位置：`src/renderer/plugins/`
- 通过 `plugins.ts` 统一导入
- 在应用启动时自动加载

#### 外部插件
- 位置：用户插件目录（`USER_PLUGIN_DIR`）
- 通过 `/api/plugins` 接口动态加载
- 调用 `window.registerPlugin()` 注册

### 1.3 插件加载流程

```
应用启动
  ↓
startup.ts → 导入所有内置插件
  ↓
调用 plugin.init(plugins, ctx)
  ↓
遍历注册内置插件
  ↓
暴露 window.registerPlugin 全局函数
  ↓
加载外部插件脚本 (/api/plugins)
  ↓
外部插件调用 window.registerPlugin()
  ↓
所有插件注册完成
```

---

## 2. 插件基础结构

### 2.1 最小插件示例

```javascript
// 最简单的插件
window.registerPlugin({
  name: 'my-plugin',
  register: ctx => {
    console.log('插件已注册')
  }
})
```

### 2.2 完整插件结构

```javascript
window.registerPlugin({
  name: 'plugin-name',
  register: ctx => {
    // 1. 定义插件功能函数
    const doSomething = () => {
      // 功能实现
    }

    // 2. 注册到状态栏
    ctx.statusBar.tapMenus(menus => {
      menus['plugin-name'] = {
        id: 'plugin-name',
        position: 'left',
        title: '🔌 我的插件',
        onClick: doSomething
      }
    })

    // 3. 注册快捷键 Action
    ctx.action.registerAction({
      name: 'plugin-name.action',
      description: '执行操作',
      keys: [ctx.keybinding.Ctrl, 'K'],
      forUser: true,
      handler: doSomething
    })

    // 4. 添加样式
    ctx.theme.addStyles(`
      .my-plugin-class {
        color: red;
      }
    `)

    // 5. 返回插件 API（可选）
    return {
      doSomething,
      // 其他插件可以调用这些方法
    }
  }
})
```

### 2.3 TypeScript 插件结构（推荐）

```typescript
import type { Plugin, Ctx } from '@fe/context'

export default {
  name: 'my-plugin',
  register: (ctx: Ctx) => {
    // 插件逻辑
    return {
      // 公开的 API
    }
  }
} as Plugin
```

---

## 3. 开发环境准备

### 3.1 开发外部插件（推荐初学者）

#### 步骤 1：创建插件文件

在 `example-plugins/` 目录下创建你的插件文件：

```bash
# 示例结构
example-plugins/
  ├── my-first-plugin.js
  └── plugin-advanced.js
```

#### 步骤 2：编写插件代码

```javascript
// example-plugins/my-first-plugin.js
window.registerPlugin({
  name: 'my-first-plugin',
  register: ctx => {
    ctx.statusBar.tapMenus(menus => {
      menus['my-first-plugin'] = {
        id: 'my-first-plugin',
        position: 'left',
        title: '👋 你好',
        onClick: () => {
          ctx.ui.useToast().show('success', '我的第一个插件运行成功！')
        }
      }
    })
  }
})
```

#### 步骤 3：重启应用

外部插件会自动从 `USER_PLUGIN_DIR` 加载。

### 3.2 开发内置插件

#### 步骤 1：创建插件文件

在 `src/renderer/plugins/` 目录创建文件：

```typescript
// src/renderer/plugins/my-plugin.ts
import type { Plugin } from '@fe/context'

export default {
  name: 'my-plugin',
  register: (ctx) => {
    // 插件逻辑
  }
} as Plugin
```

#### 步骤 2：在 plugins.ts 中导出

```typescript
// src/renderer/plugins.ts
// ... 其他导入
import myPlugin from './plugins/my-plugin'

export default [
  // ... 其他插件
  myPlugin
]
```

#### 步骤 3：重新编译运行

```bash
yarn dev
```

---

## 4. Context API 详解

### 4.1 Context 对象结构

`ctx` 是插件与主应用交互的核心对象，包含以下模块：

### 4.2 常用 API 分类

#### A. UI 组件

```typescript
// Toast 提示
ctx.ui.useToast().show('info', '消息内容')
ctx.ui.useToast().show('success', '成功')
ctx.ui.useToast().show('warning', '警告')
ctx.ui.useToast().show('error', '错误')

// 对话框
ctx.ui.useModal().alert({ title: '标题', content: '内容' })
ctx.ui.useModal().confirm({ title: '确认', content: '确定吗？' })

// 右键菜单
ctx.ui.useContextMenu().show({
  x: 100,
  y: 200,
  menus: [
    { label: '菜单 1', onClick: () => {} },
    { label: '菜单 2', onClick: () => {} }
  ]
})

// 快速过滤
ctx.ui.useQuickFilter({
  items: [...],
  onSelect: (item) => {}
})
```

#### B. 状态栏

```typescript
// 添加简单菜单
ctx.statusBar.tapMenus(menus => {
  menus['my-plugin'] = {
    id: 'my-plugin',
    position: 'left',  // 'left' | 'right'
    title: '🔌 插件',
    onClick: () => {
      console.log('点击了')
    }
  }
})

// 添加下拉菜单
ctx.statusBar.tapMenus(menus => {
  menus['my-plugin'] = {
    id: 'my-plugin',
    position: 'left',
    title: '📝 操作',
    list: [
      {
        label: '操作 1',
        onClick: () => {}
      },
      {
        label: '操作 2',
        onClick: () => {}
      }
    ]
  }
})

// 添加 Vue 组件
import { defineComponent } from 'vue'

const MyComponent = defineComponent({
  setup() {
    return () => h('div', '我的组件')
  }
})

ctx.statusBar.tapMenus(menus => {
  menus['my-plugin'] = {
    id: 'my-plugin',
    position: 'right',
    component: MyComponent,
    onClick: () => {}
  }
})
```

#### C. Action 系统

```typescript
// 注册 Action
ctx.action.registerAction({
  name: 'plugin.my-plugin.do-something',
  description: '做点什么',
  keys: [ctx.keybinding.Ctrl, ctx.keybinding.Shift, 'K'],  // 快捷键
  forUser: true,  // 是否显示在快捷键设置中
  handler: () => {
    // 处理逻辑
  }
})

// 触发 Action
ctx.action.getActionHandler('plugin.my-plugin.do-something')()

// 移除 Action
ctx.action.removeAction('plugin.my-plugin.do-something')
```

#### D. 编辑器操作

```typescript
// 获取/插入内容
ctx.editor.getValue()  // 获取全文
ctx.editor.insert('文本')  // 在光标处插入
ctx.editor.insertAt({ line: 0, column: 0 }, '文本')  // 指定位置插入
ctx.editor.replace(range, '文本')  // 替换内容
ctx.editor.getSelection()  // 获取选中文本
ctx.editor.hasSelection()  // 是否有选中

// 光标操作
ctx.editor.setCursor({ line: 0, column: 0 })
ctx.editor.getCursor()

// 文档信息
ctx.editor.getDocPath()  // 获取文档路径
ctx.editor.isDefault()  // 是否是默认编辑器
```

#### E. Hook 系统

```typescript
// 注册钩子
ctx.registerHook('HOOK_NAME', (payload) => {
  // 处理逻辑
  return result  // 某些钩子需要返回值
})

// 常用钩子
ctx.registerHook('STARTUP', () => {
  // 应用启动时
})

ctx.registerHook('DOC_CREATED', ({ doc }) => {
  // 文档创建后
})

ctx.registerHook('DOC_BEFORE_SAVE', ({ doc }) => {
  // 文档保存前，可以修改 doc.content
})

ctx.registerHook('VIEW_RENDERED', ({ doc, el }) => {
  // 视图渲染后
})

// 移除钩子
ctx.removeHook('HOOK_NAME', callback)
```

#### F. 主题和样式

```typescript
// 添加样式
ctx.theme.addStyles(`
  .my-class {
    color: red;
  }
`)

// 获取当前主题
const isDark = ctx.theme.isDark()

// 监听主题变化
ctx.theme.onThemeChange(theme => {
  console.log('主题切换为:', theme)
})
```

#### G. 设置管理

```typescript
// 获取设置
const value = ctx.setting.getSetting('plugin.my-plugin.key', defaultValue)

// 保存设置
ctx.setting.saveSetting('plugin.my-plugin.key', value)

// 监听设置变化
ctx.setting.onSettingChange(({ key, value }) => {
  if (key === 'plugin.my-plugin.key') {
    // 处理变化
  }
})
```

#### H. 存储

```typescript
// 本地存储
ctx.storage.set('my-plugin-key', value)
const value = ctx.storage.get('my-plugin-key')
ctx.storage.remove('my-plugin-key')

// 带命名空间的存储（推荐）
const store = ctx.storage.createStore('my-plugin')
store.set('key', value)
store.get('key')
```

#### I. 获取其他插件 API

```typescript
// 获取其他插件的 API
const otherApi = ctx.getPluginApi('plugin-name')

// 示例：获取番茄钟插件 API
const pomodoro = ctx.getPluginApi('pomodoro-timer')
if (pomodoro) {
  pomodoro.start()
}
```

#### J. 工具库

```typescript
// dayjs 时间处理
ctx.lib.dayjs().format('YYYY-MM-DD HH:mm:ss')

// 其他工具
ctx.utils.xxx  // 各种工具函数
```

---

## 5. 插件开发实战

### 5.1 实战 1：插入时间戳插件

```javascript
// plugin-insert-timestamp.js
window.registerPlugin({
  name: 'plugin-insert-timestamp',
  register: ctx => {
    // 时间格式配置
    const formats = [
      { label: 'YYYY-MM-DD HH:mm:ss', format: 'YYYY-MM-DD HH:mm:ss' },
      { label: 'YYYY/MM/DD', format: 'YYYY/MM/DD' },
      { label: 'DD/MM/YYYY', format: 'DD/MM/YYYY' }
    ]

    // 插入时间戳函数
    const insertTimestamp = (formatIndex = 0) => {
      const timestamp = ctx.lib.dayjs().format(formats[formatIndex].format)
      ctx.editor.insert(timestamp)
      ctx.ui.useToast().show('success', `已插入时间戳：${timestamp}`)
    }

    // 注册 Action
    ctx.action.registerAction({
      name: 'plugin.insert-timestamp.now',
      description: '插入当前时间戳',
      keys: [ctx.keybinding.Ctrl, ctx.keybinding.Shift, 'T'],
      forUser: true,
      handler: () => insertTimestamp()
    })

    // 添加状态栏菜单
    ctx.statusBar.tapMenus(menus => {
      menus['insert-timestamp'] = {
        id: 'insert-timestamp',
        position: 'left',
        title: '⏰',
        list: formats.map((f, index) => ({
          label: f.label,
          onClick: () => insertTimestamp(index)
        }))
      }
    })

    // 添加样式
    ctx.theme.addStyles(`
      .status-bar-item[title="⏰"] {
        cursor: pointer;
      }
    `)
  }
})
```

### 5.2 实战 2：字数统计插件

```javascript
// plugin-word-counter.js
window.registerPlugin({
  name: 'plugin-word-counter',
  register: ctx => {
    // 统计函数
    const countWords = (text) => {
      const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length
      const english = (text.match(/[a-zA-Z]+/g) || []).length
      const numbers = (text.match(/\d+/g) || []).length
      const spaces = (text.match(/\s+/g) || []).length
      const total = text.replace(/\s/g, '').length
      
      return {
        chinese,
        english,
        numbers,
        spaces,
        total,
        all: text.length
      }
    }

    // 显示统计
    const showStats = () => {
      const content = ctx.editor.getValue()
      const stats = countWords(content)
      
      const message = `
        📊 字数统计
        ────────────
        总字符数：${stats.all}
        不含空格：${stats.total}
        ────────────
        中文：${stats.chinese}
        英文：${stats.english}
        数字：${stats.numbers}
      `.trim()
      
      ctx.ui.useToast().show('info', message)
    }

    // 实时更新状态栏
    const updateStatusBar = () => {
      const content = ctx.editor.getValue()
      const stats = countWords(content)
      
      ctx.statusBar.tapMenus(menus => {
        if (menus['word-counter']) {
          menus['word-counter'].title = `📝 ${stats.total} 字`
        }
      })
    }

    // 注册 Action
    ctx.action.registerAction({
      name: 'plugin.word-counter.show',
      description: '显示详细字数统计',
      keys: [ctx.keybinding.Ctrl, ctx.keybinding.Shift, 'W'],
      forUser: true,
      handler: showStats
    })

    // 添加状态栏
    ctx.statusBar.tapMenus(menus => {
      menus['word-counter'] = {
        id: 'word-counter',
        position: 'right',
        title: '📝 字数统计',
        onClick: showStats
      }
    })

    // 监听文档变化
    ctx.registerHook('DOC_CREATED', updateStatusBar)
    ctx.registerHook('VIEW_RENDERED', updateStatusBar)
  }
})
```

### 5.3 实战 3：Vue 组件插件（番茄钟简化版）

```typescript
// my-timer-plugin.ts
import { defineComponent, ref, onUnmounted } from 'vue'
import type { Plugin, Ctx } from '@fe/context'

// 创建 Vue 组件
const TimerDisplay = defineComponent({
  setup() {
    const time = ref('00:00')
    const isRunning = ref(false)
    let interval: any = null

    const startTimer = () => {
      if (isRunning.value) return
      
      isRunning.value = true
      const startTime = Date.now()
      
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0')
        const seconds = (elapsed % 60).toString().padStart(2, '0')
        time.value = `${minutes}:${seconds}`
      }, 1000)
    }

    const stopTimer = () => {
      isRunning.value = false
      if (interval) {
        clearInterval(interval)
        interval = null
      }
    }

    const toggleTimer = () => {
      if (isRunning.value) {
        stopTimer()
      } else {
        startTimer()
      }
    }

    onUnmounted(() => {
      stopTimer()
    })

    return () => {
      return h('div', {
        style: {
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        },
        onClick: toggleTimer
      }, [
        h('span', isRunning.value ? '⏱️' : '⏹️'),
        h('span', time.value)
      ])
    }
  }
})

// 导出插件
export default {
  name: 'my-timer-plugin',
  register: (ctx: Ctx) => {
    // 注册状态栏组件
    ctx.statusBar.tapMenus(menus => {
      menus['my-timer'] = {
        id: 'my-timer',
        position: 'right',
        component: TimerDisplay,
        onClick: () => {
          ctx.ui.useToast().show('info', '点击组件上的按钮来启停计时器')
        }
      }
    })

    // 注册 Action
    ctx.action.registerAction({
      name: 'my-timer.toggle',
      description: '切换计时器状态',
      keys: [ctx.keybinding.Ctrl, ctx.keybinding.Shift, 'R'],
      forUser: true,
      handler: () => {
        ctx.ui.useToast().show('info', '请点击状态栏上的计时器组件')
      }
    })

    // 返回 API
    return {
      // 这里可以暴露 API 给其他插件
    }
  }
} as Plugin
```

---

## 6. 调试与测试

### 6.1 开发环境调试

#### 使用开发者工具

1. 打开应用后，按 `F12` 或 `Ctrl+Shift+I` 打开开发者工具
2. 在 Console 中查看日志和错误
3. 在 Sources 中设置断点调试

#### 添加日志

```javascript
window.registerPlugin({
  name: 'my-plugin',
  register: ctx => {
    console.log('[MyPlugin] 插件已注册')
    
    try {
      // 你的代码
    } catch (error) {
      console.error('[MyPlugin] 发生错误:', error)
      ctx.ui.useToast().show('error', '插件出错，请查看控制台')
    }
  }
})
```

### 6.2 测试插件功能

#### 手动测试清单

```markdown
## 插件测试清单

### 基本功能
- [ ] 插件能否正常注册
- [ ] 状态栏菜单是否正常显示
- [ ] 点击事件是否触发
- [ ] Action 是否正常工作
- [ ] 快捷键是否生效

### 边界情况
- [ ] 空文档时的表现
- [ ] 大文件时的性能
- [ ] 多次点击的表现
- [ ] 快速切换文档时的表现

### 兼容性
- [ ] 亮色主题下的显示
- [ ] 暗色主题下的显示
- [ ] 与其他插件的兼容性
```

### 6.3 错误处理

```javascript
window.registerPlugin({
  name: 'my-plugin',
  register: ctx => {
    // 错误处理示例
    const safeExecute = (fn, fallback) => {
      try {
        return fn()
      } catch (error) {
        console.error('[MyPlugin] 错误:', error)
        ctx.ui.useToast().show('error', error.message)
        return fallback
      }
    }

    // 使用
    safeExecute(() => {
      // 可能出错的代码
    }, null)
  }
})
```

---

## 7. 最佳实践

### 7.1 命名规范

```javascript
// ✅ 好的命名
{
  name: 'plugin-word-counter',  // 使用连字符，描述性名称
  register: ctx => {
    ctx.action.registerAction({
      name: 'plugin.word-counter.show',  // 使用点分隔的层级命名
      // ...
    })
  }
}

// ❌ 不好的命名
{
  name: 'myPlugin',  // 驼式命名不统一
  name: 'wc',  // 缩写不明确
}
```

### 7.2 代码组织

```javascript
// ✅ 推荐结构
window.registerPlugin({
  name: 'my-plugin',
  register: ctx => {
    // 1. 常量和配置
    const CONFIG = { ... }
    
    // 2. 工具函数
    const helperFunction = () => { ... }
    
    // 3. 核心功能
    const mainFeature = () => { ... }
    
    // 4. 注册 UI 组件
    ctx.statusBar.tapMenus(...)
    
    // 5. 注册 Action
    ctx.action.registerAction(...)
    
    // 6. 注册 Hook
    ctx.registerHook(...)
    
    // 7. 返回 API
    return {
      publicMethod: mainFeature
    }
  }
})
```

### 7.3 资源清理

```javascript
// ✅ 清理资源
window.registerPlugin({
  name: 'my-plugin',
  register: ctx => {
    let interval = null
    let listener = null

    // 设置定时器
    interval = setInterval(() => { ... }, 1000)

    // 添加事件监听
    listener = () => { ... }
    window.addEventListener('resize', listener)

    // 页面卸载时清理
    window.addEventListener('beforeunload', () => {
      if (interval) clearInterval(interval)
      if (listener) window.removeEventListener('resize', listener)
    })
  }
})
```

### 7.4 性能优化

```javascript
// ✅ 防抖处理
const debounce = (fn, delay) => {
  let timer = null
  return (...args) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

ctx.registerHook('VIEW_RENDERED', debounce(({ doc }) => {
  // 频繁触发的钩子处理
}, 300))

// ✅ 缓存计算结果
const cache = new Map()
const getResult = (key) => {
  if (cache.has(key)) return cache.get(key)
  const result = expensiveCalculation()
  cache.set(key, result)
  return result
}
```

### 7.5 用户设置

```javascript
// ✅ 提供用户可配置项
window.registerPlugin({
  name: 'my-plugin',
  register: ctx => {
    // 默认配置
    const defaultConfig = {
      enableFeature: true,
      maxItems: 100,
      theme: 'auto'
    }

    // 获取用户配置
    const getConfig = (key) => {
      return ctx.setting.getSetting(
        `plugin.my-plugin.${key}`,
        defaultConfig[key]
      )
    }

    // 保存配置
    const saveConfig = (key, value) => {
      ctx.setting.saveSetting(`plugin.my-plugin.${key}`, value)
    }

    // 使用配置
    if (getConfig('enableFeature')) {
      // 执行功能
    }
  }
})
```

---

## 8. 常见问题

### Q1: 插件不加载怎么办？

**检查清单：**
1. 插件文件是否在正确的目录
2. 插件名称是否唯一
3. Console 是否有错误信息
4. 是否调用了 `window.registerPlugin()`

### Q2: 如何访问 DOM 元素？

```javascript
// 获取预览区域
const previewEl = document.querySelector('.preview')

// 获取编辑器元素
const editorEl = document.querySelector('.editor')

// 使用 Hook 在渲染后操作
ctx.registerHook('VIEW_RENDERED', ({ el }) => {
  // el 就是预览区域的 DOM 元素
  el.querySelector('...')
})
```

### Q3: 如何与用户交互？

```javascript
// 显示提示
ctx.ui.useToast().show('info', '消息')

// 确认对话框
const confirmed = await ctx.ui.useModal().confirm({
  title: '确认',
  content: '确定要执行吗？'
})

// 输入框
const value = await ctx.ui.useModal().prompt({
  title: '输入',
  content: '请输入内容'
})
```

### Q4: 插件之间如何通信？

```javascript
// 插件 A
window.registerPlugin({
  name: 'plugin-a',
  register: ctx => {
    return {
      getData: () => { return 'some data' }
    }
  }
})

// 插件 B
window.registerPlugin({
  name: 'plugin-b',
  register: ctx => {
    const pluginA = ctx.getPluginApi('plugin-a')
    if (pluginA) {
      const data = pluginA.getData()
      // 使用数据
    }
  }
})
```

### Q5: 如何发布插件？

目前 Cord 的插件系统主要通过：
1. 内置到源代码中
2. 放置在用户插件目录

未来可能会支持插件市场。

---

## 附录

### A. 内置 Hook 列表

完整 Hook 列表请查看 [`src/renderer/types.ts`](file:///c:/LW/code/creator/Cord/src/renderer/types.ts#L519-L602)

常用 Hook：
- `STARTUP` - 应用启动
- `DOC_CREATED` - 文档创建后
- `DOC_BEFORE_SAVE` - 文档保存前
- `DOC_DID_SAVE` - 文档保存后
- `VIEW_RENDERED` - 视图渲染后
- `MARKDOWN_BEFORE_RENDER` - Markdown 渲染前
- `MARKDOWN_AFTER_RENDER` - Markdown 渲染后

### B. 学习资源

1. **示例插件**: [`example-plugins/`](file:///c:/LW/code/creator/Cord/example-plugins/)
2. **内置插件**: [`src/renderer/plugins/`](file:///c:/LW/code/creator/Cord/src/renderer/plugins/)
3. **官方文档**: [`help/PLUGIN_ZH-CN.md`](file:///c:/LW/code/creator/Cord/help/PLUGIN_ZH-CN.md)
4. **API 文档**: https://yn-api-doc.vercel.app/modules/renderer_context.html

### C. 推荐学习路径

1. ✅ 阅读本指南
2. ✅ 运行示例插件（`example-plugins/`）
3. ✅ 修改示例插件，观察变化
4. ✅ 开发自己的第一个简单插件
5. ✅ 研究复杂插件（如 `pomodoro-timer.tsx`）
6. ✅ 贡献内置插件

---

**祝你插件开发愉快！** 🎉

如有问题，请查看代码注释或参考现有插件实现。

# Cord 项目结构思维导图

## 项目概述
- **项目名称**: Yank Note (yank.note)
- **版本**: 3.86.1
- **描述**: 一款高度可扩展的Markdown编辑器，专为提高生产力而设计
- **技术栈**: Electron + Vue 3 + TypeScript + Vite

## 根目录文件

### 配置文件
- `.browserslistrc`: 浏览器目标配置
- `.editorconfig`: 编辑器配置
- `.eslintignore`: ESLint忽略配置
- `.eslintrc.js`: ESLint配置
- `.gitignore`: Git忽略配置
- `.gitmodules`: Git子模块配置
- `.node-version`: Node版本
- `.typedoc.json`: TypeDoc配置
- `.yarnrc`: Yarn配置
- `commitlint.config.js`: Commitlint配置
- `electron-builder.json`: Electron打包配置
- `jest.config.js`: Jest测试配置
- `package.json`: 项目依赖配置
- `postcss.config.js`: PostCSS配置
- `tsconfig.json`: TypeScript配置
- `vite.config.mts`: Vite配置

### 文档文件
- `LICENSE`: 许可证
- `README.md`: 英文说明文档
- `README_RU.md`: 俄语说明文档
- `README_ZH-CN.md`: 中文说明文档
- `app-flow.md`: 应用流程文档
- `architecture-diagram.md`: 架构图
- `hook-analysis.md`: 钩子分析文档
- `ioc-container-diagram.md`: IOC容器图
- `plugin-architecture.md`: 插件架构文档
- `plugin-system-guide.md`: 插件系统指南
- `保存文档插件全链路实现详解.md`: 保存文档实现详解
- `阶段1_项目架构梳理_intro.md`: 阶段1架构梳理
- `阶段2.1_TypeScript基础学习.md`: TypeScript学习
- `阶段2.2_Electron主进程与渲染进程.md`: Electron学习
- `阶段2.2_Vue3组件化开发学习.md`: Vue3学习
- `阶段2_类函数分析_intro.md`: 类函数分析
- `阶段3_调用与算法流程_intro.md`: 调用与算法流程
- `阶段6_插件开发学习总结.md`: 插件开发总结

## .github 目录

### ISSUE_TEMPLATE
- `bug_report.md`: Bug报告模板
- `feature_request.md`: 功能请求模板

### workflows
- `release.yml`: 发布工作流

## .husky 目录
- `commit-msg`: Commit消息钩子
- `pre-push`: 推送前钩子

## .trae 目录

### specs/learn-plugin-system
- `architecture-diagrams.md`: 架构图
- `checklist.md`: 检查清单
- `plugin-development-guide.md`: 插件开发指南
- `spec.md`: 规范文档
- `tasks.md`: 任务列表

## build 目录

### appx (Windows应用包资源)
- `Square150x150Logo.png`: 150x150应用图标
- `Square44x44Logo.png`: 44x44应用图标
- `StoreLogo.png`: 应用商店图标
- `Wide310x150Logo.png`: 宽屏图标

### 其他构建资源
- `entitlements.mac.plist`: Mac权限配置
- `icon.icns`: Mac应用图标
- `icon.ico`: Windows应用图标
- `icon.png`: 应用图标
- `icon@2x.png`: 2倍分辨率图标

## example-plugins 目录 (示例插件)
- `plugin-insert-timestamp.js`: 插入时间戳插件
- `plugin-word-counter.js`: 字数统计插件

## help 目录 (帮助文档和资源)
- 图片资源 (多个语言的截图)
- `DEVELOP.md`: 开发指南
- `DEVELOP_ZH-CN.md`: 中文开发指南
- `FEATURES.md`: 功能说明
- `FEATURES_ZH-CN.md`: 中文功能说明
- `PLUGIN.md`: 插件说明
- `PLUGIN_ZH-CN.md`: 中文插件说明
- `_FRAGMENT.md`: 片段文档
- `test.drawio`: 测试图表
- `test.luckysheet`: 测试表格

## scripts 目录 (构建脚本)
- `copy-assets.js`: 复制资源脚本
- `download-pandoc.js`: 下载Pandoc脚本
- `download-plantuml.js`: 下载PlantUML脚本
- `download-ripgrep.sh`: 下载Ripgrep脚本
- `install-demo-extensions.js`: 安装示例扩展脚本
- `notarize.js`: Mac公证脚本

## src 目录

### main (Electron主进程)

#### assets (静态资源)
- `icon.png`: 应用图标
- `no-java-runtime.png`: 无Java运行时提示图
- `tray.png` / `tray@2x.png` / `tray@3x.png` / `tray@4x.png`: 托盘图标
- `trayTemplate.png` / `trayTemplate@*.png`: 托盘模板图标

#### resources (运行资源)
- `github.css`: GitHub样式
- `pandoc-filter.lua`: Pandoc过滤器
- `pandoc-reference.docx`: Pandoc参考文档

#### server (后端服务)
- `convert.ts`: 文档转换服务
- `file.ts`: 文件操作服务
- `index.ts`: 服务入口
- `plantuml.ts`: PlantUML渲染服务
- `premium.ts`: 高级功能服务
- `repository.ts`: 仓库管理服务
- `run.ts`: 代码运行服务
- `search.ts`: 搜索服务
- `watch-worker.ts`: 文件监视工作器

#### 核心模块
- `app.ts`: 应用主入口
- `action.ts`: 动作处理
- `config.ts`: 配置管理
- `constant.ts`: 常量定义
- `envs.ts`: 环境变量
- `extension.ts`: 扩展管理
- `helper.ts`: 辅助函数
- `i18n.ts`: 国际化
- `jsonrpc.ts`: JSON-RPC通信
- `jwt.ts`: JWT认证
- `menus.ts`: 菜单管理
- `protocol.ts`: 协议处理
- `proxy-dispatcher.ts`: 代理分发
- `proxy.ts`: 代理服务
- `shell.ts`: Shell命令
- `shortcut.ts`: 快捷键
- `startup.ts`: 启动逻辑
- `storage.ts`: 存储管理
- `updater.ts`: 更新器
- `wsl.ts`: WSL支持

### renderer (Vue渲染进程)

#### __tests__ (测试)
- `core/hook.ts`: 钩子测试
- `core/ioc.ts`: IOC测试
- `core/plugin.ts`: 插件测试
- `others/extension.ts`: 扩展测试
- `services/status-bar.ts`: 状态栏服务测试

#### assets (静态资源)
- 字体文件 (woff2)
- 图标文件 (ico, png, svg)
- `kityminder.core.css`: 思维导图样式
- `qrcode-wechat.jpg`: 微信二维码

#### components (Vue组件)
- `ActionBar.vue`: 动作栏
- `ContextMenu.vue`: 上下文菜单
- `ControlCenter.vue`: 控制中心
- `CreateFilePanel.vue`: 创建文件面板
- `DefaultEditor.vue`: 默认编辑器
- `DefaultPreviewer.vue`: 默认预览器
- `DefaultPreviewerRender.ce.vue`: 预览器渲染组件
- `DocHistory.vue`: 文档历史
- `Editor.vue`: 编辑器主组件
- `ExportPanel.vue`: 导出面板
- `ExtensionManager.vue`: 扩展管理器
- `FileTabs.vue`: 文件标签页
- `Filter.vue`: 过滤器
- `FindInPreview.vue`: 预览中查找
- `FixedFloat.vue`: 浮动固定
- `GroupTabs.vue`: 分组标签
- `IndexStatus.vue`: 索引状态
- `KeyboardShortcuts.vue`: 键盘快捷键
- `Layout.vue`: 布局组件
- `Mask.vue`: 遮罩
- `ModalUi.vue`: 模态框
- `MonacoEditor.vue`: Monaco编辑器封装
- `Outline.vue`: 大纲视图
- `Premium.vue`: 高级功能
- `Previewer.vue`: 预览器
- `QuickFilter.vue`: 快速过滤
- `QuickOpen.vue`: 快速打开
- `SearchPanel.vue`: 搜索面板
- `Setting.vue`: 设置
- `SettingPanel.vue`: 设置面板
- `StatusBar.vue`: 状态栏
- `StatusBarMenu.vue`: 状态栏菜单
- `SvgIcon.vue`: SVG图标
- `Tabs.vue`: 标签页
- `Terminal.vue`: 终端
- `TitleBar.vue`: 标题栏
- `Toast.vue`: 提示消息
- `Tree.vue`: 树形视图
- `TreeNode.vue`: 树节点
- `Xterm.vue`: Xterm终端封装

#### context (上下文)
- `ARCHITECTURE.md`: 架构文档
- `components.ts`: 组件上下文
- `index.ts`: 上下文入口
- `lib.ts`: 库上下文

#### core (核心框架)
- `action.ts`: 动作系统
- `hook.ts`: 钩子系统
- `ioc.ts`: IOC容器
- `keybinding.ts`: 键绑定系统
- `plugin.ts`: 插件系统

#### directives (Vue指令)
- `auto-focus.ts`: 自动聚焦
- `auto-resize.ts`: 自动调整大小
- `auto-z-index.ts`: 自动Z轴
- `fixed-float.ts`: 固定浮动
- `index.ts`: 指令入口
- `placeholder.ts`: 占位符
- `textarea-on-enter.ts`: 文本框回车
- `up-down-history.ts`: 上下历史导航

#### embed (嵌入式)
- `index.html`: 嵌入页面
- `index.ts`: 嵌入入口

#### others (其他模块)
- `db.ts`: 数据库 (Dexie)
- `demo.ts`: 演示模块
- `extension.ts`: 扩展支持
- `file-extensions.ts`: 文件扩展名
- `find-in-preview.ts`: 预览中查找
- `fuzzy-match.ts`: 模糊匹配
- `google-analytics.ts`: Google分析
- `indexer-worker.ts`: 索引工作器
- `monaco-indent-range-provider.js`: Monaco缩进
- `monaco-latex.ts`: Monaco LaTeX支持
- `premium.ts`: 高级功能
- `prism-languages-all.ts`: Prism语言支持
- `prism-style.scss`: Prism样式
- `semver.js`: 语义版本
- `setting-schema.ts`: 设置模式

#### plugins (插件系统)

##### 内置插件
- `build-in-renderers.ts`: 内置渲染器
- `code-runners.tsx`: 代码运行器
- `control-center.ts`: 控制中心
- `copy-content.tsx`: 复制内容
- `copy-text.ts`: 复制文本
- `custom-keybindings.ts`: 自定义快捷键
- `custom-styles.ts`: 自定义样式
- `drop-to-open-file.ts`: 拖放打开文件
- `editor-attachment.ts`: 编辑器附件
- `editor-folding.ts`: 编辑器折叠
- `editor-markdown.ts`: Markdown编辑器
- `editor-md-list.ts`: Markdown列表
- `editor-md-syntax.ts`: Markdown语法
- `editor-paste.ts`: 编辑器粘贴
- `editor-path-completion.ts`: 路径自动补全
- `editor-restore-state.ts`: 编辑器状态恢复
- `editor-words.ts`: 字数统计
- `electron-zoom.ts`: Electron缩放
- `emoji.ts`: Emoji支持
- `file-tree-functions.ts`: 文件树功能
- `history-stack.ts`: 历史栈
- `image-hosting-picgo.ts`: 图片托管 (PicGo)
- `image-localization.ts`: 图片本地化
- `image-viewer.tsx`: 图片查看器
- `markdown-applet.ts`: Markdown小程序
- `markdown-code-copy.ts`: 代码复制
- `markdown-code-highlight.ts`: 代码高亮
- `markdown-code-run.ts`: 代码运行
- `markdown-code-wrap.ts`: 代码换行
- `markdown-container.ts`: 容器
- `markdown-drawio.ts`: Drawio支持
- `markdown-echarts.ts`: ECharts图表
- `markdown-footnote.ts`: 脚注
- `markdown-github-alerts.ts`: GitHub警告
- `markdown-heading-number.ts`: 标题编号
- `markdown-html.ts`: HTML支持
- `markdown-imsize.ts`: 图片尺寸
- `markdown-katex.ts`: KaTeX数学公式
- `markdown-luckysheet.ts`: Luckysheet表格
- `markdown-macro.ts`: 宏支持
- `markdown-mermaid.ts`: Mermaid图表
- `markdown-mind-map.ts`: 思维导图
- `markdown-plantuml.ts`: PlantUML支持
- `markdown-render-vnode.ts`: VNode渲染
- `markdown-table.ts`: 表格支持
- `markdown-task-list.ts`: 任务列表
- `markdown-toc.ts`: 目录生成
- `media-player.ts`: 媒体播放器
- `misc.ts`: 杂项功能
- `pluglin-hello.js`: Hello插件示例
- `pomodoro-timer.tsx`: 番茄钟
- `preview-font.ts`: 预览字体
- `record-recent-document.ts`: 记录最近文档
- `share-preview.tsx`: 分享预览
- `status-bar-document-info.tsx`: 状态栏文档信息
- `status-bar-extension.ts`: 状态栏扩展
- `status-bar-get.ts`: 状态栏获取
- `status-bar-help.tsx`: 状态栏帮助
- `status-bar-history.ts`: 状态栏历史
- `status-bar-insert.ts`: 状态栏插入
- `status-bar-navigation.ts`: 状态栏导航
- `status-bar-premium.ts`: 状态栏高级功能
- `status-bar-presentation.ts`: 状态栏演示
- `status-bar-repository-switch.ts`: 状态栏仓库切换
- `status-bar-setting.ts`: 状态栏设置
- `status-bar-terminal.ts`: 状态栏终端
- `status-bar-theme.ts`: 状态栏主题
- `status-bar-tool.ts`: 状态栏工具
- `status-bar-view.ts`: 状态栏视图
- `switch-todo.ts`: 切换待办
- `sync-scroll.ts`: 同步滚动
- `text-autospace.ts`: 文本自动空格
- `text-comparator.ts`: 文本比较
- `view-image-context-menus.ts`: 图片右键菜单
- `watch-file-refresh.ts`: 文件监视刷新
- `ai-copilot.ts`: AI Copilot

##### 插件子目录
- `get-started/`: 入门插件 (GetStarted.vue, index.ts)
- `insert-table/`: 插入表格插件 (InsertTable.vue, index.ts)
- `markdown-front-matter/`: Front Matter插件
- `markdown-hashtags/`: 标签插件
- `markdown-link/`: 链接插件
- `markdown-wiki-links/`: Wiki链接插件
- `view-links/`: 查看链接插件

#### public (公共资源)
- `kity/`: Kityminder引擎 (kity.min.js, kityminder.core.min.js, kityminder.core.css)

#### services (服务层)
- `base.ts`: 基础服务
- `document.ts`: 文档服务
- `editor.ts`: 编辑器服务
- `export.ts`: 导出服务
- `i18n.ts`: 国际化服务
- `indexer.ts`: 索引服务
- `layout.ts`: 布局服务
- `markdown.ts`: Markdown服务
- `renderer.ts`: 渲染服务
- `repo.ts`: 仓库服务
- `routines.ts`: 例程服务
- `runner.ts`: 运行器服务
- `setting.ts`: 设置服务
- `status-bar.ts`: 状态栏服务
- `theme.ts`: 主题服务
- `tree.ts`: 树形服务
- `view.ts`: 视图服务
- `workbench.ts`: 工作台服务

#### styles (样式)
- `custom-components.scss`: 自定义组件样式
- `custom-theme.scss`: 自定义主题
- `dark.scss`: 暗色主题
- `index.scss`: 入口样式
- `light.scss`: 亮色主题
- `mixins.scss`: 混入样式

#### support (支持模块)
- `ui/context-menu.ts`: 上下文菜单UI
- `ui/fixed-float.tsx`: 浮动UI
- `ui/modal.ts`: 模态框UI
- `ui/quick-filter.tsx`: 快速过滤UI
- `ui/toast.ts`: 提示UI
- `api.ts`: API封装
- `args.ts`: 参数处理
- `embed.ts`: 嵌入支持
- `env.ts`: 环境变量
- `ga.ts`: Google分析
- `jsonrpc.ts`: JSON-RPC
- `store.ts`: 状态存储

#### utils (工具函数)
- `composable.ts`: 组合式函数
- `crypto.ts`: 加密工具
- `index.ts`: 工具入口
- `path.ts`: 路径工具
- `pure.ts`: 纯函数
- `storage.ts`: 存储工具

#### 根级文件
- `Main.vue`: 主组件
- `index.html`: 入口HTML
- `index.ts`: 渲染进程入口
- `plugins.ts`: 插件加载
- `startup.ts`: 启动逻辑
- `types.ts`: 类型定义

### share (共享代码)

#### i18n (国际化)
- `languages/en.ts`: 英语
- `languages/ru.ts`: 俄语
- `languages/zh-CN.ts`: 简体中文
- `languages/zh-TW.ts`: 繁体中文
- `index.ts`: 国际化入口

#### 其他共享
- `misc.ts`: 杂项
- `types.ts`: 共享类型

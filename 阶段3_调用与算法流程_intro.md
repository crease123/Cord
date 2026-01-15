# 阶段3：调用与算法流程

## 1. 应用启动流程

### 1.1 主进程启动流程

```mermaid
sequenceDiagram
    participant E as Electron
    participant A as app.ts
    participant P as Proxy/Env
    participant S as Server
    participant W as Window
    participant M as Menu/Tray

    E->>A: 启动应用
    A->>P: initProxy()
    A->>P: initEnvs()
    A->>E: app.on('ready')
    
    rect rgb(240, 248, 255)
        Note over A,S: 服务初始化
        A->>S: startup()
        A->>S: serve()<br>启动HTTP服务
        S->>S: protocol.registerStreamProtocol<br>注册yank-note://协议
    end
    
    rect rgb(255, 248, 240)
        Note over A,W: 窗口创建
        A->>W: showWindow()
        W->>W: createWindow()
        W->>W: new BrowserWindow()
        W->>W: loadURL(getUrl())
        W->>W: restoreWindowBounds()
    end
    
    rect rgb(240, 255, 240)
        Note over A,M: 菜单与托盘
        A->>M: refreshMenus()
        A->>M: showTray()
        A->>M: registerShortcut()
    end
```

### 1.2 渲染进程启动流程

```mermaid
sequenceDiagram
    participant I as index.ts
    participant V as Vue App
    participant S as startup.ts
    participant P as Plugin System
    participant H as Hook System
    participant E as Extension

    I->>V: createApp(Main)
    V->>V: 注册指令/UI组件
    V->>V: app.mount('#app')
    
    rect rgb(240, 248, 255)
        Note over S,P: 插件初始化
        S->>P: init(plugins, ctx)
        loop 遍历82+插件
            P->>P: register(plugin, ctx)
            P->>P: plugin.register(ctx)
        end
        P->>P: 加载用户插件<br>/api/plugins
    end
    
    rect rgb(255, 248, 240)
        Note over S,H: 钩子注册
        S->>H: registerHook('STARTUP', ...)
        S->>H: registerHook('DOC_CREATED', ...)
        S->>H: registerHook('DOC_DELETED', ...)
        S->>H: registerHook('SETTING_CHANGED', ...)
    end
    
    rect rgb(240, 255, 240)
        Note over S,E: 扩展加载
        S->>S: whenEditorReady()
        S->>E: extension.init()
        E->>E: 加载已安装扩展
        E->>H: triggerHook('EXTENSION_READY')
    end
    
    S->>H: triggerHook('STARTUP')
```

---

## 2. 文档操作核心流程

### 2.1 打开/切换文档流程

```mermaid
flowchart TB
    subgraph "switchDoc(doc, opts)"
        A["开始切换文档"] --> B{"doc.type === 'dir'?"}
        B -->|是| C["抛出错误"]
        B -->|否| D["triggerHook<br>DOC_PRE_SWITCH"]
        
        D --> E{"force || 不同文件?"}
        E -->|相同文件且非强制| F["triggerHook<br>DOC_SWITCH_SKIPPED"]
        E -->|需要切换| G["ensureCurrentFileSaved()"]
        
        G --> H{"保存成功?"}
        H -->|失败且非强制| I["抛出错误"]
        H -->|成功或强制| J["设置doc.plain<br>设置doc.absolutePath"]
        
        J --> K["triggerHook<br>DOC_BEFORE_SWITCH"]
        K --> L{"doc是有效文件?"}
        
        L -->|否| M["清空currentFile<br>清空currentContent"]
        L -->|是| N["api.readFile(doc)"]
        
        N --> O{"isEncrypted(doc)?"}
        O -->|是| P["inputPassword()<br>decrypt(content)"]
        O -->|否| Q["直接使用content"]
        
        P --> R["更新store状态"]
        Q --> R
        
        R --> S["triggerHook<br>DOC_SWITCHED"]
    end
```

### 2.2 保存文档流程

```mermaid
flowchart TB
    subgraph "saveDoc(doc, content)"
        A["获取AsyncLock锁"] --> B{"doc.plain?"}
        B -->|否| C["警告并返回"]
        B -->|是| D["triggerHook<br>DOC_BEFORE_SAVE"]
        
        D --> E{"isEncrypted(doc)?"}
        E -->|是| F["inputPassword()"]
        F --> G["encrypt(content, password)"]
        G --> H{"密码哈希匹配?"}
        H -->|否| I["确认对话框"]
        I -->|取消| J["返回"]
        I -->|确认| K["准备发送内容"]
        H -->|是| K
        E -->|否| K
        
        K --> L["api.writeFile(doc, content)"]
        L --> M{"写入成功?"}
        M -->|否| N["设置status='save-failed'<br>显示错误"]
        M -->|是| O["更新doc属性<br>contentHash/status"]
        
        O --> P["triggerHook<br>DOC_SAVED"]
        P --> Q["释放锁"]
    end
```

### 2.3 创建文档流程

```mermaid
flowchart TB
    subgraph "createDoc(doc, baseDoc)"
        A["开始创建"] --> B{"提供了path?"}
        B -->|否| C["显示创建对话框"]
        C --> D["选择文档类型"]
        D --> E["输入文件名"]
        E --> F["拼接完整路径"]
        B -->|是| F
        
        F --> G{"有content?"}
        G -->|是| H["使用提供的content"]
        G -->|否| I["调用docType.buildNewContent()"]
        
        H --> J["创建Doc对象"]
        I --> J
        
        J --> K{"isEncrypted(doc)?"}
        K -->|是| L["inputPassword()"]
        L --> M["encrypt(content)"]
        M --> N["发送加密内容"]
        K -->|否| N
        
        N --> O["checkFilePath()"]
        O --> P["api.writeFile(file, content)"]
        P --> Q["triggerHook<br>DOC_CREATED"]
        Q --> R["返回file"]
    end
```

---

## 3. Markdown 渲染流程

### 3.1 完整渲染流程

```mermaid
flowchart TB
    subgraph "Markdown 渲染管道"
        A["源文本 (Markdown)"] --> B["markdown.render(src, env)"]
        
        B --> C["triggerHook<br>MARKDOWN_BEFORE_RENDER"]
        
        C --> D["应用设置选项"]
        D --> D1["html: render.md-html"]
        D --> D2["breaks: render.md-breaks"]
        D --> D3["linkify: render.md-linkify"]
        D --> D4["typographer: render.md-typographer"]
        
        D --> E["启用/禁用规则"]
        E --> E1["sup/sub"]
        E --> E2["wiki-links"]
        E --> E3["hash-tags"]
        
        E --> F["block.tokenize()"]
        F --> G["生成 tokens"]
        G --> H["附加 bMarks/eMarks"]
        
        H --> I["core.ruler.after<br>'normalize'"]
        I --> J["附加 env.source<br>附加 env.tokens"]
        
        J --> K["渲染 HTML"]
        K --> L["renderer.render(src, env)"]
        L --> M["查找匹配的 Renderer"]
        M --> N["调用 renderer.render()"]
        N --> O["返回 VNode 或 HTML"]
    end
```

### 3.2 渲染器调度逻辑

```mermaid
flowchart LR
    subgraph "Renderer 匹配"
        A["源文本 + RenderEnv"] --> B["遍历已注册Renderers"]
        B --> C{"renderer.when(env)?"}
        C -->|true| D["使用该Renderer"]
        C -->|false| E["继续下一个"]
        E --> B
        D --> F["renderer.render(src, env)"]
    end
```

### 3.3 内置 Markdown 插件处理链

```mermaid
graph LR
    subgraph "Markdown-it 插件链"
        A["源文本"] --> B["markdown-it-sub<br>下标"]
        B --> C["markdown-it-sup<br>上标"]
        C --> D["markdown-it-mark<br>高亮"]
        D --> E["markdown-it-abbr<br>缩写"]
        E --> F["markdown-it-attributes<br>属性"]
        F --> G["markdown-it-multimd-table<br>表格"]
        G --> H["wiki-links<br>Wiki链接"]
        H --> I["hash-tags<br>标签"]
        I --> J["其他自定义插件..."]
    end
```

---

## 4. 文件树与索引流程

### 4.1 文件树构建流程

```mermaid
flowchart TB
    subgraph "tree(repo, order, include)"
        A["开始构建"] --> B{"是ROOT_REPO?"}
        B -->|是| C["返回空数组"]
        B -->|否| D["初始化根节点"]
        
        D --> E["withRepo(repo, travels)"]
        E --> F["fs.readdir(location)"]
        
        F --> G["遍历每个条目"]
        G --> H["fs.stat(path)"]
        
        H --> I{"是文件?"}
        I -->|是| J{"排除正则匹配?"}
        J -->|匹配| K["跳过"]
        J -->|不匹配| L["添加到files[]"]
        
        I -->|否| M{"是目录?"}
        M -->|是| N{"目录名排除?"}
        N -->|匹配| K
        N -->|不匹配| O["递归调用travels()"]
        O --> P{"noEmptyDir且为空?"}
        P -->|是| K
        P -->|否| Q["添加到dirs[]"]
        
        L --> R["排序(order)"]
        Q --> R
        R --> S["dirs.concat(files)"]
        S --> T["返回树结构"]
    end
```

### 4.2 文件索引 Worker 架构

```mermaid
flowchart TB
    subgraph "主线程 (indexer.ts)"
        A["triggerWatchCurrentRepo()"]
        A --> B["获取当前repo"]
        B --> C{"enableIndexing?"}
        C -->|否| D["stopWatch()"]
        C -->|是| E["client.call.main<br>.triggerWatchRepo(repo)"]
    end
    
    subgraph "Worker线程 (indexer-worker.ts)"
        E --> F["接收RPC调用"]
        F --> G["设置chokidar监听"]
        G --> H["文件变化事件"]
        H --> I["解析Markdown"]
        I --> J["提取links/tags/resources"]
        J --> K["存入IndexedDB"]
        K --> L["更新IndexStatus"]
        L --> M["通知主线程"]
    end
    
    M --> N["updateIndexStatus()"]
    N --> O["更新store状态"]
```

---

## 5. HTTP 服务端路由流程

### 5.1 请求处理管道

```mermaid
flowchart TB
    subgraph "Koa 中间件链"
        A["HTTP请求"] --> B["checkPermission"]
        B --> C{"有效token?"}
        C -->|否| D["401/403"]
        C -->|是| E["proxy中间件"]
        
        E --> F["bodyParser"]
        F --> G["fileContent<br>/api/file"]
        G --> H["attachment<br>/api/attachment"]
        H --> I["plantumlGen<br>/api/plantuml"]
        I --> J["runCode<br>/api/run"]
        J --> K["convertFile<br>/api/convert"]
        K --> L["searchFile<br>/api/search"]
        L --> M["readme<br>/api/help"]
        M --> N["userPlugin<br>/api/plugins"]
        N --> O["customCss<br>/custom-css"]
        O --> P["userExtension<br>/api/extensions"]
        P --> Q["setting<br>/api/settings"]
        Q --> R["静态文件服务"]
    end
```

### 5.2 文件操作 API 流程

```mermaid
flowchart LR
    subgraph "GET /api/file"
        A1["解析repo/path"] --> B1["checkPrivateRepo"]
        B1 --> C1["file.stat()"]
        C1 --> D1{"size > 30MB?"}
        D1 -->|是| E1["抛出错误"]
        D1 -->|否| F1["file.read()"]
        F1 --> G1["file.hash()"]
        G1 --> H1["返回content/hash/stat"]
    end
    
    subgraph "POST /api/file"
        A2["解析body"] --> B2{"oldHash有效?"}
        B2 -->|new| C2{"文件已存在?"}
        C2 -->|是| D2["抛出错误"]
        B2 -->|hash| E2{"hash匹配?"}
        E2 -->|否| F2["抛出stale错误"]
        E2 -->|是| G2["处理Base64"]
        C2 -->|否| G2
        G2 --> H2["file.write()"]
        H2 --> I2["返回hash/stat"]
    end
```

---

## 6. 插件系统调用流程

### 6.1 插件注册与初始化

```mermaid
sequenceDiagram
    participant M as Main
    participant P as Plugin System
    participant I as IOC
    participant H as Hook
    participant C as Context

    M->>P: init(plugins, ctx)
    P->>P: 设置 logger
    
    loop 遍历每个插件
        P->>P: register(plugin, ctx)
        P->>P: 检查重复注册
        P->>P: plugins[name] = plugin
        P->>P: apis[name] = plugin.register(ctx)
    end
    
    P->>P: window.registerPlugin = register
    P->>P: 加载 /api/plugins 脚本
    
    Note over P,C: 插件可通过ctx访问所有服务
```

### 6.2 典型插件结构

```mermaid
graph TB
    subgraph "插件示例 (markdown-katex)"
        A["导入依赖"] --> B["定义插件对象"]
        B --> C["name: 'markdown-katex'"]
        B --> D["register(ctx) {...}"]
        
        D --> E["ctx.markdown.registerPlugin<br>注册markdown-it插件"]
        D --> F["ctx.registerHook<br>注册钩子"]
        D --> G["ctx.action.registerAction<br>注册动作"]
        D --> H["ctx.view.tapContextMenus<br>注册右键菜单"]
        
        E --> I["返回插件API"]
    end
```

---

## 7. Hook 事件流程

### 7.1 Hook 触发机制

```mermaid
flowchart TB
    subgraph "triggerHook(type, arg, options)"
        A["获取该类型所有hooks"] --> B["遍历hooks"]
        B --> C{"hook.once?"}
        C -->|是| D["立即移除hook"]
        C -->|否| E["继续"]
        D --> E
        
        E --> F["执行 hook.fun(arg)"]
        F --> G{"options.breakable<br>&& 返回true?"}
        G -->|是| H["中断循环<br>返回true"]
        G -->|否| I{"有错误?"}
        I -->|是且ignoreError| J["console.warn"]
        I -->|是且不忽略| K["抛出错误"]
        I -->|否| L["继续下一个hook"]
        L --> B
        
        B --> M["所有hook执行完"]
        M --> N{"breakable?"}
        N -->|是| O["返回false"]
        N -->|否| P["返回void"]
    end
```

### 7.2 核心 Hook 事件流

```mermaid
sequenceDiagram
    participant U as 用户操作
    participant D as Document Service
    participant H as Hook System
    participant P as Plugins
    participant V as View Service

    U->>D: 打开文档
    D->>H: DOC_PRE_SWITCH
    H->>P: 通知所有监听者
    
    D->>D: 读取文件内容
    D->>H: DOC_BEFORE_SWITCH
    H->>P: 通知所有监听者
    
    D->>D: 更新store状态
    D->>H: DOC_SWITCHED
    H->>P: 通知所有监听者
    
    P->>V: 触发渲染
    V->>H: VIEW_BEFORE_REFRESH
    V->>V: markdown.render()
    V->>H: VIEW_RENDER
    V->>H: VIEW_RENDERED
```

---

## 8. 关键算法分析

### 8.1 文档历史版本管理

```mermaid
flowchart TB
    subgraph "writeHistory(filePath, content)"
        A["计算历史文件路径<br>MD5(filePath).zip"] --> B{"历史文件存在?"}
        B -->|是| C["读取历史ZIP"]
        B -->|否| D["创建新ZIP"]
        
        C --> E{"文件>5MB?"}
        E -->|是| F["标记tooLarge"]
        E -->|否| G["正常处理"]
        
        F --> H["限制版本数=2/3"]
        D --> I["添加新版本条目"]
        G --> I
        H --> I
        
        I --> J["获取所有条目"]
        J --> K["按名称降序排序"]
        K --> L["删除超限条目<br>(无comment的)"]
        L --> M["压缩写入文件"]
    end
```

**算法要点**：
- 使用 MD5 哈希文件路径作为历史文件名
- 双层 ZIP 压缩（外层压缩整个版本包）
- 版本数限制（默认500，最大10000）
- 大文件自动削减版本数
- 带 comment 的版本不会被自动删除

### 8.2 文件树排序算法

```mermaid
flowchart TB
    subgraph "sort(items, order)"
        A["输入: TreeItem[]<br>order: {by, order}"] --> B{"order.by?"}
        
        B -->|serial| C["解析数字前缀"]
        C --> D{"是有效数字?"}
        D -->|是| E["toFixed(12).padStart(20) + name"]
        D -->|否| F["使用name"]
        
        B -->|mtime| G["使用修改时间"]
        B -->|birthtime| H["使用创建时间"]
        B -->|name| I["使用名称"]
        
        E --> J["orderBy(items, key, order.order)"]
        F --> J
        G --> J
        H --> J
        I --> J
        
        J --> K["返回: dirs.concat(files)"]
    end
```

**算法要点**：
- 目录始终排在文件前面
- `serial` 模式支持数字前缀智能排序（如 "1. xxx", "2. xxx"）
- 数字格式化为12位小数 + 20位填充，确保正确排序

### 8.3 加密/解密算法

```mermaid
flowchart LR
    subgraph "加密流程 (encrypt)"
        A1["明文 + 密码"] --> B1["crypto.encrypt()"]
        B1 --> C1["返回 {content, passwordHash}"]
    end
    
    subgraph "解密流程 (decrypt)"
        A2["密文 + 密码"] --> B2["crypto.decrypt()"]
        B2 --> C2{"解密成功?"}
        C2 -->|否| D2["抛出 Malformed 错误"]
        C2 -->|是| E2["返回 {content, passwordHash}"]
    end
```

**算法要点**：
- 使用 `.c.md` 后缀标识加密文件
- 密码哈希用于验证密码是否变化
- 加密/解密在前端完成，后端只存储密文

### 8.4 同步滚动算法

```mermaid
flowchart TB
    subgraph "sync-scroll 插件"
        A["编辑器滚动事件"] --> B["获取可见行范围"]
        B --> C["计算中间行号"]
        C --> D["查找预览区对应元素<br>data-source-line"]
        D --> E["计算目标滚动位置"]
        E --> F["平滑滚动到位置"]
        
        G["预览区滚动事件"] --> H["查找可见元素"]
        H --> I["获取source-line属性"]
        I --> J["滚动编辑器到对应行"]
    end
```

---

## 9. 进程间通信流程

### 9.1 主进程与渲染进程通信

```mermaid
flowchart TB
    subgraph "通信方式"
        A["渲染进程"] --> B["HTTP API"]
        B --> C["主进程 Koa 服务"]
        
        A --> D["JSON-RPC"]
        D --> E["主进程 jsonrpc-bridge"]
        
        A --> F["Electron Remote"]
        F --> G["主进程模块直接调用"]
        
        A --> H["WebSocket"]
        H --> I["主进程 socket.io"]
        I --> J["终端 node-pty"]
    end
```

### 9.2 Worker 通信流程

```mermaid
sequenceDiagram
    participant H as 主线程
    participant W as Worker线程
    
    H->>W: postMessage({from:'host', message})
    Note over W: JSONRPCServer 接收
    W->>W: 处理请求
    W->>H: postMessage({from:'worker', message})
    Note over H: JSONRPCClient 接收响应
```

---

## 10. 关键参数定位

### 10.1 超参数/配置

| 参数 | 位置 | 默认值 | 说明 |
|------|------|--------|------|
| `server.port` | config | 3044 | HTTP 服务端口 |
| `server.host` | config | 127.0.0.1 | 服务监听地址 |
| `doc-history.number-limit` | config | 500 | 历史版本数限制 |
| `auto-save` | settings | 2000 | 自动保存间隔(ms) |
| `editor.font-size` | settings | 16 | 编辑器字体大小 |
| `editor.tab-size` | settings | 4 | Tab 宽度 |
| `tree.exclude` | settings | 正则 | 文件树排除规则 |

### 10.2 关键路径

| 路径类型 | 获取方式 | 说明 |
|----------|----------|------|
| 用户数据目录 | `USER_DATA` | 用户配置/插件目录 |
| 历史版本目录 | `HISTORY_DIR` | 文档历史存储 |
| 插件目录 | `USER_PLUGIN_DIR` | 用户插件 |
| 扩展目录 | `USER_EXTENSION_DIR` | 已安装扩展 |
| 主题目录 | `USER_THEME_DIR` | 自定义主题 |
| 静态资源 | `STATIC_DIR` | 前端构建输出 |

---

## 11. 总结

### 核心调用链路

1. **启动链路**：
   `app.ts` → `serve()` → `createWindow()` → `index.ts` → `startup.ts` → `init(plugins)`

2. **文档操作链路**：
   `UI事件` → `document.switchDoc()` → `api.readFile()` → `server/file.ts` → `fs-extra`

3. **渲染链路**：
   `DOC_SWITCHED` → `view.render()` → `markdown.render()` → `renderer.render()` → `Vue VNode`

4. **插件扩展链路**：
   `plugin.register(ctx)` → `ctx.registerHook()` / `ctx.markdown.registerPlugin()` → 功能集成

### 设计亮点

| 设计 | 优点 |
|------|------|
| **Hook 事件系统** | 模块解耦，易于扩展 |
| **AsyncLock** | 防止文档并发操作问题 |
| **Worker 索引** | 不阻塞主线程，性能优良 |
| **双层 ZIP 压缩** | 历史版本存储高效 |
| **渲染器管道** | 支持多种预览方式 |
| **HTTP + WebSocket** | 灵活的进程间通信 |


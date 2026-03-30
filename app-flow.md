# Cord 应用主进程逻辑流程图

## 整体架构流程

```mermaid
flowchart TD
    Start([应用启动]) --> InitProxy[初始化代理和环境变量<br/>initProxy<br/>initEnvs]
    InitProxy --> InitRemote[初始化 electron-remote<br/>electronRemote.initialize]
    InitRemote --> ConfigMenu[配置右键菜单<br/>electronContextMenu]
    ConfigMenu --> SetAppMenu[设置应用菜单<br/>Menu.setApplicationMenu]
    SetAppMenu --> ParseArgs[解析命令行参数<br/>yargs.argv]
    ParseArgs --> RequestLock[请求单实例锁<br/>app.requestSingleInstanceLock]
    
    RequestLock --> GotLock{是否获得锁？}
    GotLock -->|否 | Exit1([退出应用])
    GotLock -->|是 | RegisterEvents[注册事件处理器]
    
    RegisterEvents --> SecondInstance[second-instance 事件<br/>处理第二个实例启动]
    RegisterEvents --> OpenFile[open-file 事件<br/>macOS 打开文件]
    RegisterEvents --> OpenUrl[open-url 事件<br/>处理深度链接]
    RegisterEvents --> Ready[ready 事件<br/>应用就绪]
    RegisterEvents --> Activate[activate 事件<br/>macOS 激活]
    RegisterEvents --> WebContents[web-contents-created 事件<br/>配置 Web 内容]
    
    Ready --> Startup[startup]
    Ready --> Serve[serve<br/>启动 HTTP 服务<br/>注册协议处理器]
    Ready --> ShowWindow[showWindow<br/>显示主窗口]
    Ready --> RefreshMenus[刷新菜单]
    Ready --> CheckTray{是否启用托盘？}
    CheckTray -->|是 | ShowTrayAction[显示系统托盘]
    CheckTray -->|否 | SkipTray[跳过托盘]
    Ready --> RegisterShortcut[注册全局快捷键]
    
    ShowWindow --> CreateWindow{窗口是否存在？}
    CreateWindow -->|否 | CreateNewWindow[创建新窗口<br/>createWindow]
    CreateWindow -->|是 | ShowExisting[显示现有窗口]
    
    CreateNewWindow --> NewBrowserWindow[创建 BrowserWindow]
    NewBrowserWindow --> LoadURL[加载 URL<br/>getUrl]
    LoadURL --> RestoreBounds[恢复窗口位置<br/>restoreWindowBounds]
    LoadURL --> ReadyToShow[监听 ready-to-show 事件]
    
    ReadyToShow --> HasFile{有文件要打开？}
    HasFile -->|是 | ShowAndOpen[显示窗口并打开文件]
    HasFile -->|否 | CheckHideStartup{启动时隐藏？}
    CheckHideStartup -->|是 | HideWindow[隐藏窗口]
    CheckHideStartup -->|否 | ShowWindow2[显示窗口]
    
    ShowAndOpen --> TryOpenFile[tryOpenFile<br/>打开文件]
    
    WebContents --> EnableRemote[启用 remote 模块]
    WebContents --> FrameCreated[监听 frame-created<br/>注入对话框修复代码]
    WebContents --> SetWindowOpenHandler[设置窗口打开处理器<br/>控制外部链接]
    
    SecondInstance --> ShowWindow2nd[显示主窗口]
    SecondInstance --> HandleDeepLink{有深度链接？}
    HandleDeepLink -->|是 | TriggerDeepLink[触发深度链接处理]
    HandleDeepLink -->|否 | CheckPath{有文件路径？}
    CheckPath -->|是 | TryOpenFile2nd[尝试打开文件]
    
    OpenFile --> PreventDefault[阻止默认行为]
    OpenFile --> WindowLoading{窗口加载中？}
    WindowLoading -->|是 | CachePath[缓存文件路径]
    WindowLoading -->|否 | TryOpenFile3rd[尝试打开文件]
    
    OpenUrl --> PreventDefault2[阻止默认行为]
    OpenUrl --> TriggerDeepLink2[触发深度链接处理]
    
    Activate --> ShowWindowActivate[显示窗口]
    
    style Start fill:#4CAF50
    style Exit1 fill:#f44336
    style GotLock fill:#FFC107
    style HasFile fill:#2196F3
    style CheckHideStartup fill:#2196F3
    style HandleDeepLink fill:#2196F3
    style CheckPath fill:#2196F3
    style WindowLoading fill:#2196F3
    style CreateWindow fill:#2196F3
    style CheckTray fill:#2196F3
```

## 核心函数调用流程

### 1. createWindow 函数

```mermaid
flowchart TD
    CW[createWindow] --> CW1[创建 BrowserWindow 实例]
    CW1 --> CW2[设置窗口属性<br/>maximizable, show, frame,<br/>backgroundColor 等]
    CW2 --> CW3[设置菜单 null]
    CW3 --> CW4[加载 URL]
    CW4 --> CW5[恢复窗口位置]
    
    CW5 --> CW6[注册 ready-to-show once 监听器]
    CW6 --> CW7[检查是否要打开文件]
    CW7 --> CW8{有文件路径？}
    CW8 -->|是 | CW9[显示窗口<br/>tryOpenFile<br/>返回]
    CW8 -->|否 | CW10[重置 macOpenFilePath]
    CW10 --> CW11{启动时隐藏？}
    CW11 -->|是 | CW12[hideWindow]
    CW11 -->|否 | CW13[show 窗口]
    
    CW5 --> CW14[注册 ready-to-show 监听器<br/>设置 skipBeforeUnloadCheck = false]
    CW5 --> CW15[注册 close 监听器<br/>保存窗口状态<br/>决定隐藏或退出]
    CW5 --> CW16[注册 closed 监听器<br/>win = null]
    CW5 --> CW17[注册全屏事件监听器<br/>enter-full-screen<br/>leave-full-screen]
    CW5 --> CW18[初始化 JSON-RPC 客户端]
    CW5 --> CW19[注册 will-navigate<br/>阻止导航]
    CW5 --> CW20[注册 will-prevent-unload<br/>处理 beforeunload]
    
    style CW fill:#4CAF50
    style CW8 fill:#FFC107
    style CW11 fill:#FFC107
```

### 2. showWindow 函数

```mermaid
flowchart TD
    SW[showWindow<br/>showInCurrentWindow] --> SW1{窗口存在？}
    SW1 -->|否 | SW2[createWindow]
    SW1 -->|是 | SW3{showInCurrentWindow<br/>且非全屏？}
    
    SW3 -->|否 | SW4[直接显示]
    SW3 -->|是 | SW5{是 macOS?}
    
    SW5 -->|是 | SW6[setVisibleOnAllWorkspaces true]
    SW6 --> SW7[show 窗口]
    SW7 --> SW8[setVisibleOnAllWorkspaces false]
    
    SW5 -->|否 | SW9[hideWindow]
    SW9 --> SW10[setTimeout 100ms<br/>show 窗口]
    
    SW4 --> SW11[app.dock?.show<br/>setSkipTaskbar false<br/>show 窗口<br/>focus 窗口]
    
    style SW fill:#4CAF50
    style SW1 fill:#FFC107
    style SW3 fill:#FFC107
    style SW5 fill:#FFC107
```

### 3. quit 函数

```mermaid
flowchart TD
    Quit[quit] --> Quit1[saveWindowBounds]
    Quit1 --> Quit2{窗口存在？}
    Quit2 -->|否 | Quit3[app.exit 0]
    Quit2 -->|是 | Quit4[ensureDocumentSaved<br/>检查文档是否保存]
    Quit4 --> Quit5[killPtyProcesses<br/>终止 PTY 进程]
    Quit5 --> Quit6[win.destroy]
    Quit6 --> Quit7[app.quit]
    
    style Quit fill:#f44336
    style Quit2 fill:#FFC107
```

### 4. serve 函数（HTTP 服务）

```mermaid
flowchart TD
    Serve[serve] --> Serve1[启动 HTTP 服务器<br/>httpServer backendPort]
    Serve1 --> Serve2{服务器存在？}
    Serve2 -->|是 | Serve3[注册 error 事件监听器]
    Serve3 --> Serve4{端口占用错误？}
    Serve4 -->|是 | Serve5[显示错误对话框<br/>跳转到设置面板]
    Serve4 -->|否 | Serve6[抛出错误]
    Serve2 -->|否 | Serve7
    
    Serve7[注册 Stream 协议处理器<br/>yank-note://]
    Serve7 --> Serve8[transformProtocolRequest<br/>转换协议请求]
    Serve8 --> Serve9[handler 处理请求]
    Serve9 --> Serve10[callback 返回响应]
    
    Serve10 --> Serve11{发生错误？}
    Serve11 -->|是 | Serve12[app.exit -1]
    Serve11 -->|否 | Serve13[服务启动成功]
    
    style Serve fill:#4CAF50
    style Serve2 fill:#FFC107
    style Serve4 fill:#FFC107
    style Serve11 fill:#FFC107
```

### 5. ensureDocumentSaved 函数

```mermaid
flowchart TD
    EDS[ensureDocumentSaved] --> EDS1{窗口存在？}
    EDS1 -->|否 | EDS2[reject<br/>window is not ready]
    EDS1 -->|是 | EDS3[执行 JS<br/>获取 window.documentSaved]
    EDS3 --> EDS4{文档已保存？}
    EDS4 -->|是 | EDS5[resolve]
    EDS4 -->|否 | EDS6[显示确认对话框<br/>丢弃更改或取消]
    EDS6 --> EDS7{用户选择？}
    EDS7 -->|丢弃 | EDS8[resolve]
    EDS7 -->|取消 | EDS9[reject<br/>document not saved]
    
    style EDS fill:#4CAF50
    style EDS1 fill:#FFC107
    style EDS4 fill:#FFC107
    style EDS7 fill:#FFC107
```

### 6. restoreWindowBounds 函数

```mermaid
flowchart TD
    RWB[restoreWindowBounds] --> RWB1[从存储获取窗口状态]
    RWB1 --> RWB2{状态存在？}
    RWB2 -->|否 | RWB3[结束]
    RWB2 -->|是 | RWB4{最大化？}
    RWB4 -->|是 | RWB5[win.maximize]
    RWB4 -->|否 | RWB6[validateWindowState]
    
    RWB6 --> RWB7{宽高有效？}
    RWB7 -->|否 | RWB8[返回 undefined]
    RWB7 -->|是 | RWB9[获取工作区域]
    
    RWB9 --> RWB10{单显示器？}
    RWB10 -->|是 | RWB11[确保窗口在工作区域内<br/>调整位置和大小]
    RWB10 -->|否 | RWB12[获取匹配的显示器]
    RWB12 --> RWB13{窗口在显示器内？}
    RWB13 -->|是 | RWB14[返回状态]
    RWB13 -->|否 | RWB15[返回 undefined]
    
    RWB11 --> RWB16{验证通过？}
    RWB15 --> RWB16
    RWB16 -->|是 | RWB17[win.setBounds]
    RWB16 -->|否 | RWB3
    
    style RWB fill:#4CAF50
    style RWB2 fill:#FFC107
    style RWB4 fill:#FFC107
    style RWB7 fill:#FFC107
    style RWB10 fill:#FFC107
    style RWB13 fill:#FFC107
    style RWB16 fill:#FFC107
```

## 事件监听和响应

```mermaid
stateDiagram-v2
    [*] --> Initializing: 应用启动
    Initializing --> Ready: ready 事件
    Ready --> Active: 窗口显示
    Active --> Hidden: 窗口隐藏
    Hidden --> Active: 点击托盘/快捷键
    Active --> FullScreen: 全屏
    FullScreen --> Active: 退出全屏
    Active --> Closing: 点击关闭
    Closing --> Hidden: 启用了托盘
    Closing --> Exiting: 未启用托盘
    Exiting --> [*]: 应用退出
    
    state "第二实例启动" as SecondInstance
    state "打开文件/URL" as OpenFileUrl
    state "系统关机" as Shutdown
    
    SecondInstance --> Active: second-instance 事件
    OpenFileUrl --> Active: open-file/open-url 事件
    Shutdown --> Exiting: powerMonitor shutdown 事件
    
    note right of Initializing
        初始化代理、环境
        配置菜单
        注册事件处理器
    end note
    
    note right of Ready
        启动 HTTP 服务
        注册协议处理器
        显示主窗口
        显示托盘
        注册快捷键
    end note
    
    note right of Closing
        保存窗口状态
        检查文档保存
        决定隐藏或退出
    end note
```

## 关键数据结构

### WindowState 类型
```
WindowState = {
  maximized: boolean,
  x: number,
  y: number,
  width: number,
  height: number
}
```

### URL 模式
- `scheme`: 使用自定义协议模式 (yank-note://)
- `dev`: 开发模式 (http://localhost:8066)
- `prod`: 生产模式 (http://localhost:backendPort)

### 注册的动作 (Actions)
- `show-main-window`: 显示主窗口
- `hide-main-window`: 隐藏主窗口
- `toggle-fullscreen`: 切换全屏
- `show-main-window-setting`: 显示设置面板
- `reload-main-window`: 重新加载窗口
- `get-main-widow`: 获取窗口实例
- `get-url-mode`: 获取 URL 模式
- `set-url-mode`: 设置 URL 模式
- `get-backend-port`: 获取后端端口
- `get-dev-frontend-port`: 获取开发前端端口
- `open-in-browser`: 在浏览器中打开
- `quit`: 退出应用
- `show-open-dialog`: 显示打开文件对话框
- `refresh-menus`: 刷新菜单
- `get-proxy-dispatcher`: 获取代理分发器
- `new-proxy-dispatcher`: 创建新的代理分发器

# IoC 容器架构详解

## 1. 整体架构概览

```mermaid
graph TB
    subgraph "IoC 容器核心结构"
        Container[("IoC 容器<br/>Record<string, any[]>")]
        
        subgraph "已注册的组件类型"
            VP["VIEW_PREVIEWER<br/>预览器数组"]
            CR["CODE_RUNNER<br/>代码运行器数组"]
            RD["RENDERERS<br/>渲染器数组"]
            HS["DOC_SWITCHED<br/>钩子函数数组"]
        end
        
        Container --> VP
        Container --> CR
        Container --> RD
        Container --> HS
        
        VP --> V1["previewer1"]
        VP --> V2["previewer2"]
        CR --> R1["runner1"]
        CR --> R2["runner2"]
        CR --> R3["runner3"]
        RD --> D1["renderer1"]
        HS --> H1["hook1"]
        HS --> H2["hook2"]
    end
    
    subgraph "API 函数"
        GET["get<T>()<br/>获取副本"]
        GETRAW["getRaw<T>()<br/>获取原始引用"]
        REG["register<T>()<br/>注册组件"]
        REM["remove<T>()<br/>移除组件"]
        REMWHEN["removeWhen<T>()<br/>条件移除"]
        REMALL["removeAll<T>()<br/>清空类型"]
    end
    
    GET -.-> Container
    GETRAW -.-> Container
    REG -.-> Container
    REM -.-> Container
    REMWHEN -.-> Container
    REMALL -.-> Container
    
    style Container fill:#f9f,stroke:#333,stroke-width:3px
    style VP fill:#bbf,stroke:#333
    style CR fill:#bbf,stroke:#333
    style RD fill:#bbf,stroke:#333
    style HS fill:#bbf,stroke:#333
```

**详细讲解：**

这是 Yank Note 的**核心依赖注入容器**，采用**服务定位器模式**实现。

**核心特点：**
- **多值存储**：同一类型可注册多个组件（使用数组存储）
- **类型安全**：通过 TypeScript 泛型约束键值对应关系
- **版本追踪**：每次修改都更新 `_version`，支持响应式检测

**数据结构：**
- 容器本质是一个 `Record<string, any[]>` 对象
- 键是字符串（如 `'VIEW_PREVIEWER'`）
- 值是数组，存储该类型的所有组件实例
- 虽然类型是 `any[]`，但通过泛型函数保证类型安全

---

## 2. 容器数据结构示例

```mermaid
classDiagram
    class Container {
        -container: Record
        +get(type: string): Array
        +getRaw(type: string): ArrayWithVersion
        +register(type: string, item: any): void
        +remove(type: string, item: any): void
        +removeWhen(type: string, when: Function): void
        +removeAll(type: string): void
    }
    
    class BuildInIOCTypes {
        <<interface>>
        +VIEW_PREVIEWER: Previewer
        +CODE_RUNNER: CodeRunner
        +RENDERERS: Renderer
        +DOC_SWITCHED: Hook
    }
    
    class ArrayWithVersion {
        +_version: number
        +length: number
        +push(item): void
        +splice(index, count): void
    }
    
    Container --> BuildInIOCTypes : "类型约束"
    Container --> ArrayWithVersion : "使用带版本的数组"
```

**详细讲解：**

**容器内部结构示例：**
```typescript
container = {
  'VIEW_PREVIEWER': [previewer1, previewer2],     // 预览器列表
  'CODE_RUNNER': [runner1, runner2, runner3],    // 代码运行器列表
  'RENDERERS': [renderer1],                       // 渲染器列表
  'DOC_SWITCHED': [hook1, hook2],                // 钩子列表
}
```

**类型说明：**
- `Record<string, any[]>`：键是字符串，值是数组
- 每个数组都有一个隐藏的 `_version` 属性用于版本追踪
- 通过 `BuildInIOCTypes` 接口定义所有合法的组件类型

---

## 3. 版本追踪机制

```mermaid
sequenceDiagram
    participant App as "应用程序"
    participant Update as "updateVersion()"
    participant Array as "容器数组"
    participant Vue as "Vue 响应式系统"
    
    App->>Array: "初始状态"
    Note over Array: "_version = 0"
    
    App->>Array: "register('VIEW_PREVIEWER', item)"
    Array->>Update: "调用 updateVersion()"
    Update->>Array: "_version = (_version || 0) + 1"
    Note over Array: "_version = 1"
    
    App->>Array: "register('CODE_RUNNER', item)"
    Array->>Update: "调用 updateVersion()"
    Update->>Array: "_version = (_version || 0) + 1"
    Note over Array: "_version = 2"
    
    App->>Array: "remove('VIEW_PREVIEWER', item)"
    Array->>Update: "调用 updateVersion()"
    Update->>Array: "_version = (_version || 0) + 1"
    Note over Array: "_version = 3"
    
    App->>Array: "getRaw('VIEW_PREVIEWER')"
    Array-->>App: "返回数组（带_version 属性）"
    App->>Vue: "检测_version 变化触发更新"
```

**详细讲解：**

**版本号作用：**
1. **检测容器是否被修改**：通过比较版本号判断内容是否变化
2. **配合 Vue 响应式系统**：触发组件重新渲染

**实现细节：**
```typescript
function updateVersion(items: any) {
  items._version = (items._version || 0) + 1
}
```

- 每次容器变化（注册、移除、清空）都会调用
- 数组会有一个隐藏的 `_version` 属性
- 例如：`container['VIEW_PREVIEWER']._version = 3` 表示修改了 3 次

---

## 4. 获取组件的两种方式

```mermaid
graph LR
    subgraph "get() - 获取副本"
        G1["调用 get<T>()"] --> G2["创建数组浅拷贝"]
        G2 --> G3["返回副本"]
        G3 --> G4["原始容器受保护"]
        
        style G4 fill:#9f9,stroke:#333
    end
    
    subgraph "getRaw() - 获取原始引用"
        R1["调用 getRaw<T>()"] --> R2["返回原始数组"]
        R2 --> R3["可直接修改"]
        R3 --> R4["影响其他使用者"]
        
        style R4 fill:#f99,stroke:#333
    end
    
    G1 -.->|"安全"| G4
    R1 -.->|"危险"| R4
```

**详细讲解：**

### get() - 获取副本（推荐）

```typescript
export function get<T extends keyof BuildInIOCTypes>(type: T): BuildInIOCTypes[T][] {
  return [...(container[type] || [])]  // [...array] 创建浅拷贝
}
```

**特点：**
- 返回数组副本（浅拷贝）
- 防止调用者意外修改容器
- 遍历时容器被修改不会出问题

**使用示例：**
```typescript
const previewers = ioc.get('VIEW_PREVIEWER')
// previewers: Previewer[]
```

### getRaw() - 获取原始引用（谨慎使用）

```typescript
export function getRaw<T extends keyof BuildInIOCTypes>(type: T) {
  return container[type] as (BuildInIOCTypes[T][] & { _version: number })
}
```

**特点：**
- 返回原始数组引用（带 `_version` 属性）
- 可直接修改原数组
- 可能影响其他使用者

**使用示例：**
```typescript
const renderers = ioc.getRaw('RENDERERS')
renderers?.sort((a, b) => a.order - b.order)  // 直接修改原数组

const version = ioc.getRaw('VIEW_PREVIEWER')?._version  // 检查版本号
```

---

## 5. 注册组件流程

```mermaid
flowchart TD
    Start(["开始注册"]) --> Check{"容器中有<br/>该类型数组？"}
    Check -->|"否"| Create["创建空数组<br/>container[type] = []"]
    Check -->|"是"| Update["更新版本号<br/>updateVersion()"]
    Create --> Update
    Update --> Push["添加到数组末尾<br/>container[type].push(item)"]
    Push --> End(["注册完成"])
    
    style Start fill:#9f9,stroke:#333
    style End fill:#9f9,stroke:#333
    style Check fill:#ff9,stroke:#333
```

**详细讲解：**

**注册流程：**
1. **检查**：判断该类型是否已有数组
2. **创建**：如果没有，先创建空数组
3. **更新版本**：调用 `updateVersion()` 增加版本号
4. **添加**：将组件推入数组末尾

**类型安全保证：**
```typescript
export function register<T extends keyof BuildInIOCTypes>(
  type: T, 
  item: BuildInIOCTypes[T]
) {
  if (!container[type]) {
    container[type] = []
  }
  
  updateVersion(container[type])
  container[type].push(item)
}
```

**使用示例：**
```typescript
// 注册预览器（item 类型自动推断为 Previewer）
ioc.register('VIEW_PREVIEWER', {
  name: 'my-previewer',
  component: MyPreviewerComponent
})

// 注册代码运行器
ioc.register('CODE_RUNNER', {
  name: 'python',
  match: (lang) => lang === 'python',
  run: async (code) => { /* ... */ }
})
```

---

## 6. 移除组件的三种方式

```mermaid
graph TB
    subgraph "remove() - 按引用移除"
        R1["调用 remove(type, item)"] --> R2["indexOf 查找引用"]
        R2 --> R3{"找到？"}
        R3 -->|"是"| R4["splice 删除"]
        R3 -->|"否"| R5["无操作"]
        R4 --> R6["更新版本"]
    end
    
    subgraph "removeWhen() - 按条件移除"
        W1["调用 removeWhen(type, when)"] --> W2["倒序遍历数组"]
        W2 --> W3{"条件匹配？"}
        W3 -->|"是"| W4["splice 删除"]
        W3 -->|"否"| W5["继续遍历"]
        W4 --> W6["更新版本"]
        W5 --> W2
    end
    
    subgraph "removeAll() - 清空所有"
        A1["调用 removeAll(type)"] --> A2{"类型存在？"}
        A2 -->|"是"| A3["length = 0<br/>清空数组"]
        A2 -->|"否"| A4["无操作"]
        A3 --> A5["更新版本"]
    end
    
    style R1 fill:#bbf,stroke:#333
    style W1 fill:#bbf,stroke:#333
    style A1 fill:#bbf,stroke:#333
```

**详细讲解：**

### remove() - 按引用移除

```typescript
export function remove<T extends keyof BuildInIOCTypes>(type: T, item: BuildInIOCTypes[T]) {
  if (container[type]) {
    const idx = container[type].indexOf(item)  // 引用比较（===）
    if (idx > -1) {
      container[type].splice(idx, 1)  // 删除该位置元素
    }
    updateVersion(container[type])
  }
}
```

**特点：**
- 使用 `indexOf` 进行引用比较（必须是同一个对象）
- 适用于已知具体对象引用的场景

**示例：**
```typescript
const myPreviewer = { name: 'my', component: MyComp }
ioc.register('VIEW_PREVIEWER', myPreviewer)

ioc.remove('VIEW_PREVIEWER', myPreviewer)  // ✅ 成功移除
ioc.remove('VIEW_PREVIEWER', { name: 'my', component: MyComp })  // ❌ 无法移除（引用不同）
```

### removeWhen() - 按条件移除

```typescript
export function removeWhen<T extends keyof BuildInIOCTypes>(
  type: T, 
  when: (item: BuildInIOCTypes[T]) => boolean
) {
  if (container[type]) {
    const items = container[type]
    for (let i = items.length - 1; i >= 0; i--) {  // 倒序遍历
      if (when(items[i])) {
        items.splice(i, 1)
        updateVersion(container[type])
      }
    }
  }
}
```

**特点：**
- **倒序遍历**：从后往前删除，避免索引错乱
- 适用于批量移除符合条件的组件

**为什么倒序遍历？**
- 正序删除 `[A,B,C]` 中的 A 后，B 会变成索引 0，导致跳过 B
- 倒序删除不会影响未遍历的索引

**示例：**
```typescript
// 移除所有 name 为 'temp' 的预览器
ioc.removeWhen('VIEW_PREVIEWER', (item) => item.name === 'temp')

// 移除所有 order 小于 0 的渲染器
ioc.removeWhen('RENDERERS', (item) => (item.order || 0) < 0)
```

### removeAll() - 清空所有

```typescript
export function removeAll<T extends keyof BuildInIOCTypes>(type: T) {
  if (container[type]) {
    container[type].length = 0  // 清空数组
    updateVersion(container[type])
  }
}
```

**特点：**
- 使用 `length = 0` 是清空数组的高效方式
- 保持原数组引用不变，已持有引用的地方会同步更新

---

## 7. 完整使用流程示例

```mermaid
sequenceDiagram
    participant Plugin as "插件开发者"
    participant IoC as "IoC 容器"
    participant App as "应用程序"
    
    Plugin->>IoC: "register('VIEW_PREVIEWER', previewer1)"
    Note over IoC: "container['VIEW_PREVIEWER'] = [p1]<br/>_version = 1"
    
    Plugin->>IoC: "register('VIEW_PREVIEWER', previewer2)"
    Note over IoC: "container['VIEW_PREVIEWER'] = [p1, p2]<br/>_version = 2"
    
    Plugin->>IoC: "register('CODE_RUNNER', runner1)"
    Note over IoC: "container['CODE_RUNNER'] = [r1]<br/>_version = 1"
    
    App->>IoC: "get('VIEW_PREVIEWER')"
    IoC-->>App: "返回 [p1, p2] 副本"
    
    App->>IoC: "getRaw('CODE_RUNNER')"
    IoC-->>App: "返回原始数组引用"
    
    Plugin->>IoC: "remove('VIEW_PREVIEWER', previewer1)"
    Note over IoC: "container['VIEW_PREVIEWER'] = [p2]<br/>_version = 3"
    
    Plugin->>IoC: "removeWhen('CODE_RUNNER', r => r.name === 'python')"
    Note over IoC: "container['CODE_RUNNER'] = []<br/>_version = 2"
    
    Plugin->>IoC: "removeAll('VIEW_PREVIEWER')"
    Note over IoC: "container['VIEW_PREVIEWER'] = []<br/>_version = 4"
```

**详细讲解：**

这个序列图展示了 IoC 容器的完整生命周期：

1. **注册阶段**：插件开发者注册各种组件
2. **获取阶段**：应用程序获取并使用这些组件
3. **移除阶段**：根据需要移除特定组件或清空类型

**关键点：**
- 每次操作都会更新版本号
- `get()` 返回副本保护容器
- `getRaw()` 返回原始引用供高级操作
- 移除操作支持引用、条件、清空三种方式

---

## 8. 类型安全机制

```mermaid
graph TD
    subgraph "BuildInIOCTypes 接口定义"
        BIT["BuildInIOCTypes"]
        BIT --> VP["VIEW_PREVIEWER: Previewer"]
        BIT --> CR["CODE_RUNNER: CodeRunner"]
        BIT --> RD["RENDERERS: Renderer"]
        BIT --> HS["HOOK: HookFunction"]
    end
    
    subgraph "泛型约束"
        FUNC["register<T>()"]
        FUNC -->|"T extends<br/>keyof BuildInIOCTypes"| CONSTRAINT["类型约束"]
        CONSTRAINT -->|"自动推断"| ITEM["Item 类型"]
    end
    
    subgraph "编译时检查"
        VALID["✅ 正确类型<br/>ioc.register('VIEW_PREVIEWER', validPreviewer)"]
        INVALID1["❌ 类型不匹配<br/>ioc.register('VIEW_PREVIEWER', {wrong: 'data'})"]
        INVALID2["❌ 无效类型键<br/>ioc.register('INVALID_TYPE', anything)"]
    end
    
    BIT --> FUNC
    FUNC --> VALID
    FUNC --> INVALID1
    FUNC --> INVALID2
    
    style VALID fill:#9f9,stroke:#333
    style INVALID1 fill:#f99,stroke:#333
    style INVALID2 fill:#f99,stroke:#333
```

**详细讲解：**

**类型定义：**
```typescript
interface BuildInIOCTypes {
  VIEW_PREVIEWER: Previewer
  CODE_RUNNER: CodeRunner
  RENDERERS: Renderer
  DOC_SWITCHED: HookFunction
  // ... 更多类型
}
```

**泛型约束：**
```typescript
export function register<T extends keyof BuildInIOCTypes>(
  type: T, 
  item: BuildInIOCTypes[T]
)
```

- `T extends keyof BuildInIOCTypes`：T 必须是 BuildInIOCTypes 的键
- `item: BuildInIOCTypes[T]`：item 类型由 T 自动推断

**编译时检查示例：**
```typescript
// ✅ 正确 - 类型匹配
ioc.register('VIEW_PREVIEWER', { name: 'my', component: MyComp })

// ❌ 编译错误 - 类型不匹配
ioc.register('VIEW_PREVIEWER', { wrong: 'data' })

// ❌ 编译错误 - 无效的类型键
ioc.register('INVALID_TYPE', anything)
```

---

## 9. 设计模式总结

<!-- markmap: version=0.18.1 -->

# IoC 容器

## 设计模式
### 服务定位器
- 集中管理依赖
- 全局访问点
- 延迟注册
### 依赖注入
- 控制反转
- 解耦组件
- 便于测试

## 核心特性
### 类型安全
- TypeScript 泛型
- 编译时检查
- 自动类型推断
### 多值存储
- 数组存储
- 同类型多实例
- 灵活管理
### 版本追踪
- _version 属性
- 响应式支持
- 变更检测

## API 设计
### 获取
- get() 副本
- getRaw() 原始引用
### 修改
- register() 注册
- remove() 移除
- removeWhen() 条件移除
- removeAll() 清空

## 使用场景
- 插件系统
- 钩子管理
- 渲染器注册
- 预览器管理
- 代码运行器

**详细讲解：**

### 设计模式

**1. 服务定位器模式（Service Locator）**
- 提供集中管理依赖的机制
- 全局访问点获取服务
- 支持延迟注册和按需获取

**2. 依赖注入（Dependency Injection）**
- 控制反转（IoC）：组件不直接创建依赖
- 解耦组件：组件间通过容器通信
- 便于测试：可轻松替换 Mock 对象

### 核心特性

**类型安全：**
- 使用 TypeScript 泛型约束
- 编译时类型检查
- 自动类型推断减少显式标注

**多值存储：**
- 使用数组存储同类型多个实例
- 灵活的组件管理
- 支持插件系统的多实例需求

**版本追踪：**
- 每次修改更新 `_version` 属性
- 配合 Vue 响应式系统
- 高效的变更检测机制

### 实际应用场景

- **插件系统**：插件注册和卸载
- **钩子管理**：生命周期钩子的添加和移除
- **渲染器注册**：Markdown 渲染器的动态注册
- **预览器管理**：不同文件类型的预览组件
- **代码运行器**：多语言代码执行环境

---

## 10. 最佳实践建议

```mermaid
graph TB
    subgraph "✅ 推荐做法"
        R1["使用 get() 获取副本<br/>防止意外修改"]
        R2["使用泛型自动推断<br/>减少类型标注"]
        R3["使用 removeWhen() 批量移除<br/>代码更简洁"]
        R4["保存引用用于移除<br/>const ref = {}; register(type, ref)"]
    end
    
    subgraph "❌ 避免做法"
        W1["直接使用 getRaw() 修改<br/>除非确有必要"]
        W2["手动指定泛型类型<br/>让编译器推断"]
        W3["正序遍历删除<br/>会导致索引错乱"]
        W4["传入新对象移除<br/>引用不同无法匹配"]
    end
    
    R1 --> R5["安全使用容器"]
    R2 --> R5
    R3 --> R5
    R4 --> R5
    
    W1 --> W5["潜在问题"]
    W2 --> W5
    W3 --> W5
    W4 --> W5
    
    style R1 fill:#9f9,stroke:#333
    style R2 fill:#9f9,stroke:#333
    style R3 fill:#9f9,stroke:#333
    style R4 fill:#9f9,stroke:#333
    style W1 fill:#f99,stroke:#333
    style W2 fill:#f99,stroke:#333
    style W3 fill:#f99,stroke:#333
    style W4 fill:#f99,stroke:#333
```

**详细讲解：**

### ✅ 推荐做法

**1. 使用 get() 获取副本**
```typescript
// ✅ 推荐
const previewers = ioc.get('VIEW_PREVIEWER')
previewers.forEach(p => console.log(p.name))
```

**2. 使用泛型自动推断**
```typescript
// ✅ 推荐 - 类型自动推断
ioc.register('VIEW_PREVIEWER', {
  name: 'my',
  component: MyComp
})
```

**3. 使用 removeWhen() 批量移除**
```typescript
// ✅ 推荐 - 简洁清晰
ioc.removeWhen('VIEW_PREVIEWER', item => item.name === 'temp')
```

**4. 保存引用用于移除**
```typescript
// ✅ 推荐
const myHook = { fun: () => {} }
ioc.register('DOC_SWITCHED', myHook)
// ... 稍后
ioc.remove('DOC_SWITCHED', myHook)
```

### ❌ 避免做法

**1. 直接使用 getRaw() 修改**
```typescript
// ❌ 避免 - 除非确有必要
const raw = ioc.getRaw('RENDERERS')
raw?.push(something)  // 直接影响容器
```

**2. 手动指定泛型类型**
```typescript
// ❌ 避免 - 冗余且易错
ioc.register<BuildInIOCTypes['VIEW_PREVIEWER']>('VIEW_PREVIEWER', item)

// ✅ 推荐 - 自动推断
ioc.register('VIEW_PREVIEWER', item)
```

**3. 正序遍历删除**
```typescript
// ❌ 错误 - 会导致索引错乱
for (let i = 0; i < items.length; i++) {
  if (shouldRemove(items[i])) {
    items.splice(i, 1)  // 删除后索引变化，跳过下一个元素
  }
}

// ✅ 正确 - 倒序遍历
for (let i = items.length - 1; i >= 0; i--) {
  if (shouldRemove(items[i])) {
    items.splice(i, 1)
  }
}
```

**4. 传入新对象移除**
```typescript
// ❌ 错误 - 引用不同
ioc.remove('VIEW_PREVIEWER', { name: 'my', component: MyComp })

// ✅ 正确 - 保存引用
const ref = { name: 'my', component: MyComp }
ioc.register('VIEW_PREVIEWER', ref)
ioc.remove('VIEW_PREVIEWER', ref)
```

---

## 总结

这个 IoC 容器是 Yank Note 的核心基础设施，通过精心设计的 API 和类型系统，实现了：

1. **灵活的组件管理**：支持注册、获取、移除的完整生命周期
2. **类型安全**：TypeScript 泛型保证编译时检查
3. **响应式支持**：版本追踪机制配合 Vue 响应式系统
4. **易于使用**：简洁的 API 和自动类型推断
5. **高性能**：高效的数组操作和版本更新机制

理解这个容器的设计和使用方式，对于开发 Yank Note 插件和扩展功能至关重要。

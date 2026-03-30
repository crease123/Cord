# Cord 插件系统学习与开发指南

## Why
用户想要为 Cord 项目开发插件，但对本项目的插件系统一无所知。需要系统性地学习插件架构并提供实践指导。

## What Changes
- 创建完整的插件系统学习文档
- 提供从简单到复杂的插件示例
- 指导用户实际开发一个功能完整的插件

## Impact
- 影响能力：插件开发、系统理解
- 影响代码：示例插件代码、学习文档

## ADDED Requirements

### Requirement: 插件系统学习
用户应该能够理解：
1. 插件的基本结构和接口定义
2. 插件如何注册和加载
3. Context 对象提供的核心功能
4. Hook 和 Action 系统的使用
5. 插件与主应用的交互方式

### Requirement: 实践指导
用户应该能够：
1. 创建外部 JavaScript 插件
2. 创建内置 TypeScript 插件
3. 使用 Vue 组件扩展 UI
4. 使用第三方库和内置工具
5. 调试和测试插件

## 插件系统架构概览

### 核心概念

1. **Plugin 接口**: 
   ```typescript
   interface Plugin {
     name: string;           // 插件唯一标识
     register?: (ctx) => any; // 注册函数，返回插件 API
   }
   ```

2. **Context 对象**: 提供访问所有应用功能的能力
   - UI 组件（toast, modal, contextmenu）
   - 编辑器操作（insert, getValue, getEditor）
   - 文档管理（switchDoc, saveDoc）
   - Hook 系统（registerHook, triggerHook）
   - Action 系统（registerAction）
   - 设置管理（getSetting, changeSchema）
   - 第三方库（vue, lodash, dayjs）

3. **插件类型**:
   - 外部插件：`plugins/` 目录下的 `.js` 文件
   - 内置插件：`src/renderer/plugins/` 目录下的 `.ts` 文件

## 学习路径

### 阶段 1: 基础认知（30 分钟）
- 阅读插件接口定义
- 理解 Context 对象结构
- 查看简单示例插件

### 阶段 2: 实践入门（1 小时）
- 创建第一个外部插件（Hello World）
- 学习使用 Toast 和 Modal
- 添加状态栏菜单项

### 阶段 3: 进阶功能（2 小时）
- 使用 Action 系统注册命令
- 使用 Hook 系统监听事件
- 操作编辑器内容

### 阶段 4: 高级开发（3 小时）
- 使用 Vue 组件创建复杂 UI
- 使用定时器和服务
- 插件间通信
- 添加设置项

### 阶段 5: 实战项目（4 小时）
- 开发一个完整的功能插件
- 测试和调试
- 打包和分享

## 示例代码库

### 简单示例
- `example-plugins/plugin-word-counter.js` - 字数统计
- `example-plugins/plugin-insert-timestamp.js` - 时间戳插入

### 内置插件示例
- `src/renderer/plugins/pomodoro-timer.tsx` - 番茄钟（完整功能）
- `src/renderer/plugins/editor-words.ts` - 编辑器补全
- `src/renderer/plugins/status-bar-view.ts` - 状态栏视图

## 参考资源

### 核心文件
- 插件核心：`src/renderer/core/plugin.ts`
- Context 定义：`src/renderer/context/index.ts`
- Hook 定义：`src/renderer/core/hook.ts`
- Action 定义：`src/renderer/core/action.ts`
- 内置插件列表：`src/renderer/plugins.ts`

### 调试方法
1. 右键托盘 → 开发 → 开发者工具
2. 查看 Console 日志
3. 使用 `window.registerPlugin` 测试代码

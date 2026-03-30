<!-- Main.vue - 应用主布局组件 -->
<!-- 定义组件的模板结构，包含整体布局和各功能区域 -->
<template>
  <!-- Layout 布局容器，作为根组件提供多插槽布局系统 -->
  <!-- :class 动态绑定 CSS 类名，根据组件状态控制样式 -->
  <Layout :class="classes">
    <!-- header 插槽：定义布局顶部区域的内容 -->
    <template v-slot:header>
      <!-- TitleBar 标题栏组件，显示窗口标题和控制按钮 -->
      <TitleBar />
    </template>
    <!-- footer 插槽：定义布局底部区域的内容 -->
    <template v-slot:footer>
      <!-- StatusBar 状态栏组件，显示当前状态信息 -->
      <!-- <StatusBar /> -->
    </template>
    <!-- left 插槽：定义布局左侧边栏的内容 -->
    <template v-slot:left>
      <!-- ActionBar 操作栏组件，提供快捷操作按钮 -->
      <ActionBar />
      <Outline v-if="showOutline" show-filter enable-collapse />
      <Tree v-show="!showOutline" />
      <SearchPanel />
    </template>
    <!-- terminal 插槽：定义底部终端区域的内容 -->
    <template v-slot:terminal>
      <!-- <Terminal @hide="hideXterm" /> -->
    </template>
    <!-- editor 插槽：定义编辑器主区域的内容 -->
    <template v-slot:editor>
      <Editor />
    </template>
    <!-- preview 插槽：定义预览区域的内容 -->
    <template v-slot:preview>
      <!-- Previewer 预览器组件，实时预览 Markdown 渲染效果 -->
      <Previewer />
    </template>
    <!-- right-before 插槽：定义右侧区域前的内容 -->
    <template v-slot:right-before>
      <!-- FileTabs 文件标签组件，显示已打开文件的标签页 -->
      <FileTabs />
    </template>
  </Layout>
  <!-- XFilter 全局过滤器组件，独立于布局之外 -->
  <XFilter />
  <!-- <SettingPanel /> -->
  <ExportPanel />
  <!-- Premium 高级功能组件，显示高级特性相关界面 -->
  <Premium />
  <!-- ControlCenter 控制中心组件，提供快捷控制面板 -->
  <ControlCenter />
  <!-- DocHistory 文档历史组件，显示文档历史记录 -->
  <DocHistory />
  <!-- ExtensionManager 扩展管理器组件，管理插件扩展 -->
  <ExtensionManager />
  <!-- KeyboardShortcuts 快捷键组件，显示和管理快捷键 -->
  <KeyboardShortcuts />
  <!-- 演示模式退出按钮，仅在演示模式下显示 -->
  <!-- v-if 条件渲染：当 presentationExitVisible 为 true 时显示 -->
  <!-- class 设置样式类名 -->
  <!-- title 设置悬停提示文本 -->
  <!-- @click 点击事件：调用 exitPresent 方法退出演示模式 -->
  <div v-if="presentationExitVisible" class="presentation-exit" title="Exit" @click="exitPresent">
    <!-- svg-icon 图标组件，显示关闭图标 -->
    <!-- name 属性指定图标名称为 "times"（叉号） -->
    <svg-icon name="times" />
  </div>
</template>

<!-- 脚本部分：定义组件的逻辑行为 -->
<!-- lang="ts" 指定使用 TypeScript 语言 -->
<script lang="ts">
// 从 Vue 3 导入组合式 API 函数
// computed: 计算属性，用于创建响应式计算值
// defineComponent: 定义 Vue 组件的辅助函数
// onBeforeUnmount: 生命周期钩子，组件卸载前调用
// onMounted: 生命周期钩子，组件挂载后调用
// ref: 创建响应式引用
import { computed, defineComponent, onBeforeUnmount, onMounted, ref } from 'vue'
// 导入应用启动初始化模块
import startup from '@fe/startup'
// 导入动作处理器，用于获取和调用应用动作
import { getActionHandler } from '@fe/core/action'
// 导入钩子管理函数，用于注册和移除事件钩子
import { registerHook, removeHook } from '@fe/core/hook'
// 导入应用参数配置
// FLAG_DISABLE_XTERM: 禁用终端的标志
// MODE: 当前应用模式（如 'normal'）
import { FLAG_DISABLE_XTERM, MODE } from '@fe/support/args'
// 导入全局状态管理 store
import store from '@fe/support/store'
// 导入自定义编辑器类型定义
import type { CustomEditor } from '@fe/types'
// 导入布局服务，用于触发窗口大小调整事件
import { emitResize } from '@fe/services/layout'
// 导入视图服务，用于退出演示模式
import { exitPresent } from '@fe/services/view'
// 导入布局组件
import Layout from '@fe/components/Layout.vue'
// 导入 SVG 图标组件
import SvgIcon from '@fe/components/SvgIcon.vue'
// 导入标题栏组件
import TitleBar from '@fe/components/TitleBar.vue'
// 导入状态栏组件
import StatusBar from '@fe/components/StatusBar.vue'
// 导入文件树组件
import Tree from '@fe/components/Tree.vue'
// 导入终端组件
import Terminal from '@fe/components/Terminal.vue'
// 导入文件标签组件
import FileTabs from '@fe/components/FileTabs.vue'
// 导入编辑器组件
import Editor from '@fe/components/Editor.vue'
// 导入预览器组件
import Previewer from '@fe/components/Previewer.vue'

// 导入设置面板组件
import SettingPanel from '@fe/components/SettingPanel.vue'
// 导入导出面板组件
import ExportPanel from '@fe/components/ExportPanel.vue'
// 导入高级功能组件
import Premium from '@fe/components/Premium.vue'
// 导入过滤器组件（XFilter 是 Filter.vue 的导出名）
import XFilter from '@fe/components/Filter.vue'
// 导入控制中心组件
import ControlCenter from '@fe/components/ControlCenter.vue'
// 导入文档历史组件
import DocHistory from '@fe/components/DocHistory.vue'
// 导入操作栏组件
import ActionBar from '@fe/components/ActionBar.vue'
// 导入大纲组件
import Outline from '@fe/components/Outline.vue'
// 导入搜索面板组件
import SearchPanel from '@fe/components/SearchPanel.vue'
// 导入扩展管理器组件
import ExtensionManager from '@fe/components/ExtensionManager.vue'
// 导入快捷键组件
import KeyboardShortcuts from '@fe/components/KeyboardShortcuts.vue'

// 导出 Vue 组件定义
export default defineComponent({
  // 组件名称，用于调试和递归组件
  name: 'x-main',
  // 注册子组件，使其可在模板中使用
  components: {
    Layout,
    SvgIcon,
    TitleBar,
    StatusBar,
    Tree,
    Terminal,
    FileTabs,
    Editor,
    Previewer,
    XFilter,
    Premium,
    SettingPanel,
    ExportPanel,
    ControlCenter,
    DocHistory,
    ActionBar,
    Outline,
    SearchPanel,
    ExtensionManager,
    KeyboardShortcuts,
  },
  // setup 函数：Vue 3 组合式 API 的入口
  // 在组件创建时执行，用于设置响应式状态、计算属性、方法等
  setup () {
    // showOutline: 计算属性，返回是否显示大纲视图
    // 从全局 store 中读取 showOutline 状态，响应式更新
    const showOutline = computed(() => store.state.showOutline)
    // presentationExitVisible: 计算属性，控制演示模式退出按钮的显示
    // 仅当 MODE 为 'normal' 且 store.state.presentation 为 true 时显示
    const presentationExitVisible = computed(() => MODE === 'normal' && store.state.presentation)

    // onMounted: 组件挂载到 DOM 后执行 startup 初始化函数
    onMounted(startup)

    // forceHiddenPreview: 响应式引用，用于强制隐藏预览区域
    // 初始值为 false，表示不强制隐藏
    const forceHiddenPreview = ref(false)

    // classes: 计算属性，返回动态 CSS 类名对象
    // 根据条件返回不同的类名，用于控制布局样式
    const classes = computed(() => ({
      // 'flag-disable-xterm': 当禁用终端标志为 true 时添加此类名
      'flag-disable-xterm': FLAG_DISABLE_XTERM,
      // 'editor-force-only': 当 forceHiddenPreview 为 true 时添加此类名
      // 用于强制只显示编辑器，隐藏预览器
      'editor-force-only': forceHiddenPreview.value,
    }))

    // hideXterm: 隐藏终端的方法
    // 通过动作处理器调用 'layout.toggle-xterm' 动作，传入 false 参数来隐藏终端
    function hideXterm () {
      getActionHandler('layout.toggle-xterm')(false)
    }

    // onEditorChange: 编辑器变化时的回调函数
    // payload: 包含当前编辑器信息的对象，current 属性为当前编辑器实例或 null
    function onEditorChange (payload: { current?: CustomEditor | null }) {
      // 根据当前编辑器的 hiddenPreview 属性设置 forceHiddenPreview
      // !! 将值转换为布尔类型
      forceHiddenPreview.value = !!payload.current?.hiddenPreview
      // 触发布局重排事件，通知其他组件调整大小
      emitResize()
    }

    // registerHook: 注册编辑器当前编辑器变化事件的钩子
    // 当编辑器切换时，会触发 onEditorChange 回调
    registerHook('EDITOR_CURRENT_EDITOR_CHANGE', onEditorChange)

    // onBeforeUnmount: 组件卸载前的清理工作
    // 移除之前注册的事件钩子，防止内存泄漏
    onBeforeUnmount(() => {
      removeHook('EDITOR_CURRENT_EDITOR_CHANGE', onEditorChange)
    })

    // 返回值：将响应式数据和方法暴露给模板使用
    // 模板中可以访问这些属性：presentationExitVisible, classes, hideXterm, showOutline, onEditorChange, exitPresent
    return { presentationExitVisible, classes, hideXterm, showOutline, onEditorChange, exitPresent }
  }
})
</script>

<!-- 样式部分：定义组件的 CSS 样式 -->
<!-- scoped 属性表示样式只作用于当前组件，不会全局污染 -->
<style scoped>
/* 当存在 flag-disable-xterm 类时，隐藏所有 .run-in-xterm 元素 */
/* :deep 选择器用于穿透 scoped 样式，影响子组件中的元素 */
.flag-disable-xterm :deep(.run-in-xterm){
  display: none;
}

/* 当存在 editor-force-only 类时，隐藏预览区域 */
/* 强制只显示编辑器，不显示预览器 */
.editor-force-only :deep(.content > .preview) {
  display: none !important;
}

/* 当存在 editor-force-only 类时，设置编辑器区域样式 */
/* 使编辑器占据整个可用空间 */
.editor-force-only :deep(.content > .editor) {
  display: flex !important;
  width: revert !important;
  min-width: 0 !important;
  max-width: revert !important;
}

/* presentation-exit 演示模式退出按钮的样式 */
.presentation-exit {
  position: fixed; /* 固定定位，相对于视口定位 */
  z-index: 210000000; /* 设置极高的层级，确保在最上层 */
  bottom: -8px; /* 距离底部 -8px */
  right: 0px; /* 紧贴右侧 */
  padding: 10px; /* 内边距 10px */
  color: var(--g-color-50); /* 使用 CSS 变量设置颜色 */
  opacity: 0.4; /* 初始透明度 40% */
  cursor: pointer; /* 鼠标悬停时显示手型光标 */
  transition: opacity 0.2s; /* 透明度变化的过渡动画，持续 0.2 秒 */
}

/* 鼠标悬停时的样式 */
.presentation-exit:hover {
  opacity: 1; /* 完全不透明 */
}
</style>

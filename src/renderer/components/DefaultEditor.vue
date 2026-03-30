<template>
  <!-- 编辑器容器，包含 MonacoEditor 组件 -->
  <div class="editor-container">
    <!-- MonacoEditor 组件，使用 ref 引用以便在 setup 中访问 -->
    <!-- nls 属性用于设置 Monaco 编辑器的语言包 -->
    <MonacoEditor ref="refEditor" class="editor" :nls="nls" />
  </div>
</template>

<script lang="ts">
// 导入 Vue 3 Composition API 相关函数
import { defineComponent, nextTick, onBeforeMount, onMounted, ref, toRefs, watch } from 'vue'
// 导入 Hook 系统相关函数，用于注册和移除钩子
import { registerHook, removeHook } from '@fe/core/hook'
// 导入 Action 系统相关函数，用于注册和移除动作
import { registerAction, removeAction } from '@fe/core/action'
// 导入文档服务相关函数，用于文档操作
import { isEncrypted, isSameFile, saveDoc, toUri } from '@fe/services/document'
// 导入编辑器服务相关函数，用于编辑器操作
import { getEditor, isDefault, setValue, whenEditorReady } from '@fe/services/editor'
// 导入应用参数标志，用于只读模式等判断
import { FLAG_READONLY, HELP_REPO_NAME } from '@fe/support/args'
// 导入设置服务，用于获取自动保存间隔等配置
import { getSetting } from '@fe/services/setting'
// 导入国际化服务，用于获取当前语言
import { getCurrentLanguage } from '@fe/services/i18n'
// 导入全局状态管理 store
import store from '@fe/support/store'
// 导入文档类型定义
import type { Doc } from '@fe/types'
// 导入 MonacoEditor 组件
import MonacoEditor from './MonacoEditor.vue'

export default defineComponent({
  // 组件名称
  name: 'editor',
  // 注册子组件
  components: { MonacoEditor },
  // 组件逻辑
  setup () {
    // 标记编辑器是否已准备就绪
    let editorIsReady = false

    // 自动保存定时器引用
    let timer: number | null = null
    // MonacoEditor 组件的引用
    const refEditor = ref<any>(null)
    // 从全局 store 中解构当前文件和当前内容的响应式引用
    const { currentFile, currentContent } = toRefs(store.state)
    // 获取当前语言并转换为小写，用于 Monaco 编辑器的语言包
    const nls = getCurrentLanguage().toLowerCase()

    // 获取 MonacoEditor 组件实例的便捷方法
    const getMonacoEditor = () => refEditor.value

    /**
     * 设置编辑器当前值的回调函数
     * 当编辑器内容发生变化时，通过钩子系统触发此函数
     * @param uri - 文档的 URI
     * @param value - 新的内容值
     */
    function setCurrentValue ({ uri, value }: { uri: string; value: any}) {
      // 检查 URI 是否匹配当前文件，且当前编辑器是否为默认编辑器
      if (toUri(currentFile.value) === uri && isDefault()) {
        // 更新全局 store 中的当前内容
        store.state.currentContent = value
      }
    }

    /**
     * 清除自动保存定时器
     * 防止不必要的自动保存操作
     */
    function clearTimer () {
      if (timer) {
        window.clearTimeout(timer)
        timer = null
      }
    }

    /**
     * 保存文件的主要函数
     * @param f - 要保存的文档对象，如果未提供则使用当前文件
     */
    async function saveFile (f: Doc | null = null) {
      // 如果没有传入文档，则使用当前文件
      const file = f || currentFile.value

      // 检查文件是否有效（存在且有仓库、路径和状态）
      if (!(file && file.repo && file.path && file.status)) {
        return
      }

      // 如果文件内容与当前编辑器内容相同，则无需保存
      if (file.content === currentContent.value) {
        return
      }

      // 如果文件不是纯文本文件，则不能保存
      if (!file.plain) {
        return
      }

      // 如果是帮助文档仓库中的文件，则不允许保存
      if (file.repo === HELP_REPO_NAME) {
        return
      }

      // 清除自动保存定时器，避免重复保存
      clearTimer()

      // 调用文档服务的 saveDoc 函数执行实际保存操作
      await saveDoc(file, currentContent.value)
    }

    /**
     * 重启自动保存定时器
     * 当编辑器内容发生变化时被调用
     */
    function restartTimer () {
      // 首先清除现有的定时器
      clearTimer()

      // 检查当前文件是否有效
      if (!(currentFile.value && currentFile.value.repo && currentFile.value.path)) {
        return
      }

      // 从设置中获取自动保存间隔，默认为 2000ms (2秒)
      const autoSave = getSetting('auto-save', 2000)

      // 如果自动保存被禁用，则直接返回
      if (!autoSave) {
        return
      }

      // 设置新的自动保存定时器
      timer = window.setTimeout(() => {
        // 防止自动保存加密文件（加密文件需要密码）
        if (!currentFile.value || isEncrypted(currentFile.value)) {
          return
        }

        // 执行保存操作
        saveFile()
      }, autoSave)
    }

    /**
     * 切换文件时的处理函数
     * 当用户在文件树中选择不同文件时被调用
     * @param current - 当前文件
     * @param previous - 之前的文件
     */
    async function changeFile (current?: Doc | null, previous?: Doc | null) {
      // 切换文件时清除自动保存定时器
      clearTimer()

      // 如果编辑器尚未准备就绪，则直接返回
      if (!editorIsReady) {
        return
      }

      // 根据多种条件确定编辑器是否应处于只读模式
      const readOnly = FLAG_READONLY || !current || !current.plain || current.writeable === false
      const editor = getEditor()

      // 如果只是内容变化（同一文件），则只更新内容
      if (current && previous && isSameFile(current, previous)) {
        editor.updateOptions({ readOnly })
        setValue(current.content ?? '\n')
      } else {
        // 如果是切换到不同文件，则创建新的模型
        getMonacoEditor().createModel(toUri(current), current?.content ?? '\n')
      }

      // 等待下一个 tick 以确保 DOM 更新完成
      await nextTick()
      // 更新编辑器的只读选项
      editor.updateOptions({ readOnly })

      // 如果当前编辑器是默认编辑器
      if (isDefault()) {
        await nextTick()
        // 聚焦到编辑器
        getEditor().focus()
      }
    }

    /**
     * 调整编辑器大小的函数
     * 当窗口大小改变时被调用
     */
    function resize () {
      // 使用 nextTick 确保 DOM 更新后再调整大小
      nextTick(() => getMonacoEditor().resize())
    }

    // 监听当前文件的变化，当文件改变时调用 changeFile 函数
    watch(currentFile, changeFile)
    // 监听当前内容的变化，当内容改变时重启自动保存定时器
    watch(currentContent, restartTimer)

    // 组件挂载时的处理
    onMounted(() => {
      // 注册全局调整大小钩子，当窗口大小改变时调用 resize 函数
      registerHook('GLOBAL_RESIZE', resize)
      // 注册编辑器内容变化钩子，当编辑器内容变化时调用 setCurrentValue 函数
      registerHook('EDITOR_CONTENT_CHANGE', setCurrentValue)
      // 注册编辑器触发保存动作，可通过 Action 系统调用
      registerAction({ name: 'editor.trigger-save', handler: () => saveFile() })
      // 启动自动保存定时器
      restartTimer()
    })

    // 组件卸载前的清理工作
    onBeforeMount(() => {
      // 移除全局调整大小钩子
      removeHook('GLOBAL_RESIZE', resize)
      // 移除编辑器内容变化钩子
      removeHook('EDITOR_CONTENT_CHANGE', setCurrentValue)
      // 移除编辑器触发保存动作
      removeAction('editor.trigger-save')
    })

    // 当编辑器准备就绪时的处理
    whenEditorReady().then(({ editor, monaco }) => {
      // 标记编辑器已准备就绪
      editorIsReady = true
      // 如果当前有文件，则切换到该文件
      if (currentFile.value) {
        changeFile(currentFile.value)
      }

      // 为编辑器添加保存命令的快捷键 (Ctrl+S 或 Cmd+S)
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        // 执行保存文件操作
        saveFile()
      })
    })

    // 返回响应式数据和方法，供模板使用
    return { refEditor, nls }
  }
})
</script>

<style scoped>
/* 编辑器容器样式，占满父容器全部空间 */
.editor-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>

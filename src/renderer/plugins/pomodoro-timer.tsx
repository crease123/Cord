/**
 * Pomodoro Timer Plugin (番茄钟插件)
 *
 * 这是一个学习示例插件，展示了 Yank Note 插件系统的核心功能：
 * 1. 状态栏菜单和动态组件
 * 2. Action 注册和快捷键绑定
 * 3. 设置项配置
 * 4. UI 组件使用（toast, modal）
 * 5. 定时器和状态管理
 *
 * 功能：
 * - 在状态栏显示番茄钟计时器
 * - 支持 25 分钟工作 + 5 分钟休息的经典番茄工作法
 * - 可通过快捷键 Ctrl+Shift+P 开始/暂停
 * - 提供设置选项自定义时间
 */

import { defineComponent, ref, computed, onBeforeUnmount } from 'vue'
import type { Plugin } from '@fe/context'

// 计时器状态
type TimerStatus = 'idle' | 'working' | 'break' | 'paused'

// 响应式状态
const timerStatus = ref<TimerStatus>('idle')
const remainingSeconds = ref(0)
const completedPomodoros = ref(0)

let intervalId: ReturnType<typeof setInterval> | null = null

// 番茄钟显示组件
const PomodoroDisplay = defineComponent({
  name: 'pomodoro-display',
  setup () {
    // 格式化时间显示
    const formattedTime = computed(() => {
      const minutes = Math.floor(remainingSeconds.value / 60)
      const seconds = remainingSeconds.value % 60
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    })

    // 状态图标
    const statusIcon = computed(() => {
      switch (timerStatus.value) {
        case 'working': return '🍅'
        case 'break': return '☕'
        case 'paused': return '⏸️'
        default: return '🍅'
      }
    })

    // 状态文字
    const statusText = computed(() => {
      switch (timerStatus.value) {
        case 'idle': return '开始'
        case 'working': return formattedTime.value
        case 'break': return formattedTime.value
        case 'paused': return `暂停 ${formattedTime.value}`
        default: return '番茄钟'
      }
    })

    return () => (
      <div class="pomodoro-display">
        <span class="pomodoro-icon">{statusIcon.value}</span>
        <span class="pomodoro-time">{statusText.value}</span>
        {completedPomodoros.value > 0 && (
          <span class="pomodoro-count">×{completedPomodoros.value}</span>
        )}
      </div>
    )
  }
})

export default {
  name: 'pomodoro-timer',
  register: ctx => {
    // ============================================
    // 1. 核心功能函数
    // ============================================

    // 获取设置的工作时间（分钟）
    const getWorkDuration = () => (ctx.setting.getSetting('plugin.pomodoro.work-duration' as any, 25) as number) * 60

    // 获取设置的休息时间（分钟）
    const getBreakDuration = () => (ctx.setting.getSetting('plugin.pomodoro.break-duration' as any, 5) as number) * 60

    // 清除定时器
    const clearTimer = () => {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    }

    // 计时器逻辑
    const tick = () => {
      if (remainingSeconds.value > 0) {
        remainingSeconds.value--
      } else {
        // 时间结束
        clearTimer()

        if (timerStatus.value === 'working') {
          // 工作结束，进入休息
          completedPomodoros.value++
          ctx.ui.useToast().show('info', `🎉 完成第 ${completedPomodoros.value} 个番茄！休息一下吧`)

          // 自动开始休息时间
          if (ctx.setting.getSetting('plugin.pomodoro.auto-break' as any, true) as boolean) {
            startBreak()
          } else {
            timerStatus.value = 'idle'
          }
        } else if (timerStatus.value === 'break') {
          // 休息结束
          ctx.ui.useToast().show('info', '☕ 休息结束，准备开始新的番茄吧！')
          timerStatus.value = 'idle'
        }
      }
    }

    // 开始工作
    const startWork = () => {
      clearTimer()
      remainingSeconds.value = getWorkDuration()
      timerStatus.value = 'working'
      intervalId = setInterval(tick, 1000)
      ctx.ui.useToast().show('info', '🍅 番茄钟开始！专注工作吧')
    }

    // 开始休息
    const startBreak = () => {
      clearTimer()
      remainingSeconds.value = getBreakDuration()
      timerStatus.value = 'break'
      intervalId = setInterval(tick, 1000)
    }

    // 暂停/继续
    const togglePause = () => {
      if (timerStatus.value === 'idle') {
        startWork()
      } else if (timerStatus.value === 'paused') {
        // 继续
        timerStatus.value = remainingSeconds.value > getBreakDuration() ? 'working' : 'working'
        intervalId = setInterval(tick, 1000)
        ctx.ui.useToast().show('info', '▶️ 继续计时')
      } else if (timerStatus.value === 'working' || timerStatus.value === 'break') {
        // 暂停
        clearTimer()
        timerStatus.value = 'paused'
        ctx.ui.useToast().show('warning', '⏸️ 已暂停')
      }
    }

    // 重置
    const reset = () => {
      clearTimer()
      timerStatus.value = 'idle'
      remainingSeconds.value = 0
      ctx.ui.useToast().show('info', '🔄 番茄钟已重置')
    }

    // 重置所有（包括计数）
    const resetAll = () => {
      reset()
      completedPomodoros.value = 0
    }

    // ============================================
    // 2. 注册 Action（可通过快捷键或命令面板调用）
    // ============================================

    ctx.action.registerAction({
      name: 'plugin.pomodoro.toggle',
      description: '番茄钟: 开始/暂停',
      keys: [ctx.keybinding.Ctrl, ctx.keybinding.Shift, 'p'],
      forUser: true,
      handler: togglePause
    })

    ctx.action.registerAction({
      name: 'plugin.pomodoro.reset',
      description: '番茄钟: 重置当前',
      forUser: true,
      handler: reset
    })

    ctx.action.registerAction({
      name: 'plugin.pomodoro.reset-all',
      description: '番茄钟: 重置所有',
      forUser: true,
      handler: resetAll
    })

    // ============================================
    // 3. 注册状态栏菜单
    // ============================================

    ctx.statusBar.tapMenus(menus => {
      menus['pomodoro-timer'] = {
        id: 'pomodoro-timer',
        position: 'left',
        title: PomodoroDisplay,
        order: 10000,
        list: [
          {
            id: 'start-work',
            type: 'normal',
            title: '🍅 开始工作',
            onClick: startWork
          },
          {
            id: 'toggle-pause',
            type: 'normal',
            title: '⏯️ 开始/暂停 (Ctrl+Shift+P)',
            onClick: togglePause
          },
          {
            id: 'reset',
            type: 'normal',
            title: '🔄 重置当前',
            onClick: reset
          },
          { type: 'separator' },
          {
            id: 'reset-all',
            type: 'normal',
            title: '🗑️ 重置所有（清除计数）',
            onClick: resetAll
          },
          { type: 'separator' },
          {
            id: 'stats',
            type: 'normal',
            title: '📊 今日统计',
            onClick: () => {
              const totalMinutes = completedPomodoros.value * (ctx.setting.getSetting('plugin.pomodoro.work-duration' as any, 25) as number)
              ctx.ui.useModal().alert({
                title: '📊 番茄钟统计',
                component: (
                  <div style={{ textAlign: 'center', padding: '20px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>
                      {'🍅'.repeat(Math.min(completedPomodoros.value, 10))}
                      {completedPomodoros.value > 10 && '...'}
                    </div>
                    <p style={{ fontSize: '24px', fontWeight: 'bold', margin: '8px 0' }}>
                      {completedPomodoros.value} 个番茄
                    </p>
                    <p style={{ color: '#888', margin: '8px 0' }}>
                      专注时间: {Math.floor(totalMinutes / 60)} 小时 {totalMinutes % 60} 分钟
                    </p>
                    <p style={{ color: '#666', fontSize: '14px', marginTop: '16px' }}>
                      {completedPomodoros.value >= 8
                        ? '🎉 太棒了！今天效率超高！'
                        : completedPomodoros.value >= 4
                          ? '👍 不错，继续保持！'
                          : '💪 加油，开始你的番茄之旅吧！'}
                    </p>
                  </div>
                )
              })
            }
          }
        ]
      }
    })

    // ============================================
    // 4. 注册设置项
    // ============================================

    ctx.setting.changeSchema((schema: any) => {
      schema.properties['plugin.pomodoro.work-duration'] = {
        defaultValue: 25,
        title: '工作时间（分钟）',
        description: '每个番茄的工作时长，默认 25 分钟',
        type: 'number',
        minimum: 1,
        maximum: 120,
        group: 'other',
        required: true
      }

      schema.properties['plugin.pomodoro.break-duration'] = {
        defaultValue: 5,
        title: '休息时间（分钟）',
        description: '每个番茄后的休息时长，默认 5 分钟',
        type: 'number',
        minimum: 1,
        maximum: 60,
        group: 'other',
        required: true
      }

      schema.properties['plugin.pomodoro.auto-break'] = {
        defaultValue: true,
        title: '自动开始休息',
        description: '完成一个番茄后自动开始休息时间',
        type: 'boolean',
        format: 'checkbox',
        group: 'other',
        required: true
      }
    })

    // ============================================
    // 5. 添加样式
    // ============================================

    ctx.theme.addStyles(`
      .status-bar-menu .pomodoro-display {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 0 8px;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .status-bar-menu .pomodoro-display:hover {
        background: rgba(255, 99, 71, 0.1);
        border-radius: 4px;
      }

      .status-bar-menu .pomodoro-icon {
        font-size: 14px;
      }

      .status-bar-menu .pomodoro-time {
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 12px;
        min-width: 40px;
      }

      .status-bar-menu .pomodoro-count {
        font-size: 11px;
        color: #ff6347;
        font-weight: bold;
      }
    `)

    // ============================================
    // 6. 注册 Hook：在关闭文档时提醒
    // ============================================

    ctx.registerHook('DOC_BEFORE_SWITCH', async () => {
      // 如果番茄钟正在运行，不阻止切换，只是提醒
      if (timerStatus.value === 'working') {
        ctx.ui.useToast().show('warning', '🍅 番茄钟正在运行中，请保持专注！')
      }
      return false // 不阻止文档切换
    })

    // ============================================
    // 7. 清理：组件卸载时清除定时器
    // ============================================

    // 使用 Window 事件在页面卸载时清理
    const cleanup = () => {
      clearTimer()
    }

    window.addEventListener('beforeunload', cleanup)

    // 返回插件 API（供其他插件调用）
    return {
      getStatus: () => timerStatus.value,
      getCompletedCount: () => completedPomodoros.value,
      start: startWork,
      pause: togglePause,
      reset: resetAll
    }
  }
} as Plugin


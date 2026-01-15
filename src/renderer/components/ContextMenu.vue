<template>
  <XMask transparent :show="items && items.length > 0" @close="hide" layer="context-menu">
    <ul :class="{menu: true, 'item-focus': itemFocus}" ref="refMenu" @contextmenu.prevent tabindex="-1" v-auto-focus>
      <template v-for="(item, i) in items">
        <li v-if="item.type === 'separator'" v-show="!item.hidden" :key="i" :class="item.type" />
        <li
          v-else
          :key="item.id"
          v-show="!item.hidden"
          @click="handleClick(item)"
          @mouseenter="currentItemIdx = i"
          :class="{ [item.type || 'normal']: true, ellipsis: item.ellipsis, focus: i === currentItemIdx && itemFocus }"
        >
          <svg-icon class="checked-icon" v-if="item.checked" name="check-solid" />
          <span class="label" v-if="(typeof item.label === 'string')">{{item.label}}</span>
          <component v-else :is="item.label" />
        </li>
      </template>
    </ul>
  </XMask>
</template>

<script lang="ts">
import { defineComponent, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Components } from '@fe/types'
import XMask from './Mask.vue'
import SvgIcon from './SvgIcon.vue'

export default defineComponent({
  name: 'context-menu',
  components: { SvgIcon, XMask },
  setup () {
    const refMenu = ref<HTMLUListElement | null>(null)
    const items = ref<Components.ContextMenu.Item[]>([])
    const currentItemIdx = ref(-1)
    const itemFocus = ref(false)

    let mouseX = 0
    let mouseY = 0

    function hide () {
      items.value = []
    }

    function handleClick (item: Components.ContextMenu.NormalItem) {
      if (item && item.onClick) {
        item.onClick(item)
        hide()
      }
    }

    function recordMousePosition (e: MouseEvent) {
      mouseX = e.clientX
      mouseY = e.clientY
    }

    function setPosition (opts?: Components.ContextMenu.ShowOpts) {
      if (!refMenu.value) {
        return
      }

      const _mouseX = opts?.mouseX
        ? (typeof opts.mouseX === 'function' ? opts.mouseX(mouseX) : opts.mouseX)
        : mouseX
      const _mouseY = opts?.mouseY
        ? (typeof opts.mouseY === 'function' ? opts.mouseY(mouseY) : opts.mouseY)
        : mouseY

      const windowWidth = window.innerWidth
      const windowHeight = window.innerHeight

      const menuWidth = refMenu.value.offsetWidth
      const menuHeight = refMenu.value.offsetHeight

      const x = _mouseX + menuWidth > windowWidth ? _mouseX - menuWidth : _mouseX
      const y = _mouseY + menuHeight > windowHeight ? _mouseY - menuHeight : _mouseY

      refMenu.value.style.left = x + 'px'
      refMenu.value.style.height = y < 0 ? `${Math.min(Math.max(menuHeight + y, windowHeight - 30), menuHeight)}px` : 'unset'
      refMenu.value.style.top = y < 0 ? '0px' : y + 'px'
    }

    function show (menuItems: Components.ContextMenu.Item[], opts?: Components.ContextMenu.ShowOpts) {
      // Do not show context menu if all items are hidden
      if (menuItems.every(item => item.hidden)) {
        return
      }

      items.value = menuItems
      currentItemIdx.value = -1

      if (refMenu.value) {
        refMenu.value.style.height = 'unset'
      }

      nextTick(() => {
        setPosition(opts)
      })
    }

    function updateCurrentItemIdx (offset: 1 | -1) {
      itemFocus.value = true
      if (currentItemIdx.value === -1) {
        currentItemIdx.value = 0
      } else {
        currentItemIdx.value = (currentItemIdx.value + offset + items.value.length) % items.value.length
      }

      const currentItem = items.value[currentItemIdx.value]
      if (currentItem.type === 'separator' || currentItem.hidden) {
        updateCurrentItemIdx(offset)
      }
    }

    function handleKeyDown (e: KeyboardEvent) {
      if (!items.value.length) {
        return
      }

      if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
        updateCurrentItemIdx(1)
        e.stopPropagation()
        e.preventDefault()
      } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
        updateCurrentItemIdx(-1)
        e.stopPropagation()
        e.preventDefault()
      } else if (e.key === 'Enter') {
        if (currentItemIdx.value > -1 && itemFocus.value) {
          handleClick(items.value[currentItemIdx.value] as Components.ContextMenu.NormalItem)
          e.stopPropagation()
          e.preventDefault()
        }
      }
    }

    function handleMouseMove (e: MouseEvent) {
      itemFocus.value = false
      recordMousePosition(e)
    }

    onMounted(() => {
      window.addEventListener('blur', hide)
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('keydown', handleKeyDown, true)
    })

    onBeforeUnmount(() => {
      window.removeEventListener('blur', hide)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('keydown', handleKeyDown, true)
    })

    return {
      refMenu,
      items,
      hide,
      show,
      handleClick,
      currentItemIdx,
      itemFocus,
    }
  },
})
</script>

<style lang="scss" scoped>
@use '@fe/styles/mixins.scss' as *;

.menu {
  list-style: none;
  padding: 6px;
  margin: 0;
  position: fixed;
  left: -99999px;
  top: -99999px;
  overflow-y: auto;
  background: var(--yn-surface-2, rgba(26, 31, 42, 0.95));
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--yn-border-subtle, rgba(255, 255, 255, 0.06));
  z-index: 1000;
  color: var(--g-foreground-color);
  min-width: 10em;
  cursor: default;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3), 0 0 60px rgba(0, 0, 0, 0.1);
  border-radius: 12px;
  user-select: none;
  animation: menuFadeIn 0.2s ease;
}

@keyframes menuFadeIn {
  from {
    opacity: 0;
    transform: translateY(-8px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.menu:focus {
  outline: none;
}

.menu > li.separator {
  border-top: 1px solid var(--yn-border-subtle, rgba(255, 255, 255, 0.06));
  margin: 6px 12px;

  &:first-child,
  &:last-child,
  & + li.separator {
    display: none;
  }
}

.menu > li.focus {
  outline: 1px var(--yn-accent-primary, #2dd4bf) dashed;
  outline-offset: -2px;
}

.menu > li.normal {
  padding: 8px 16px;
  cursor: default;
  font-size: 13px;
  border-radius: 8px;
  transition: all 0.15s ease;
  margin: 2px 0;
  position: relative;

  .checked-icon {
    position: absolute;
    width: 12px;
    height: 12px;
    transform: translateX(-18px) translateY(1px);
    color: var(--yn-accent-primary, #2dd4bf);
  }
}

.menu:not(.item-focus) > li.normal:hover {
  background: linear-gradient(135deg, var(--yn-surface-active, rgba(45, 212, 191, 0.15)), var(--yn-surface-hover, rgba(45, 212, 191, 0.08)));
  color: var(--yn-accent-primary, #2dd4bf);
  transform: translateX(4px);
}

.menu > li.ellipsis > .label::after {
  content: '...';
}

@include dark-theme {
  .menu {
    background: var(--yn-surface-2, rgba(26, 31, 42, 0.95));
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4), 0 0 60px rgba(0, 0, 0, 0.2);
  }

  .menu > li.normal:hover {
    background: linear-gradient(135deg, var(--yn-surface-active, rgba(45, 212, 191, 0.15)), var(--yn-surface-hover, rgba(45, 212, 191, 0.08)));
  }

  .menu > li.separator {
    border-top: 1px solid var(--yn-border-subtle, rgba(255, 255, 255, 0.06));
    border-bottom: none;
  }
}
</style>

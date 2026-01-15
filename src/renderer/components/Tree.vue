<template>
  <aside
    v-if="hasRepo"
    class="side"
    @contextmenu.exact.prevent="showContextMenu"
    @dblclick="refresh"
    ref="asideRef"
    :title="$t('tree.db-click-refresh')">
    <div class="loading" v-if="loadingVisible"> {{$t('loading')}} </div>
    <template v-else>
      <TreeNode v-for="item in tree" :item="item" :key="item.path" />
    </template>
  </aside>
  <aside v-else class="side">
    <div class="add-repo-btn" @click="showSettingPanel()">
      {{$t('tree.add-repo')}}
      <div class="add-repo-desc">{{$t('tree.add-repo-hint')}}</div>
    </div>
  </aside>
</template>

<script lang="ts">
import { computed, defineComponent, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useLazyRef } from '@fe/utils/composable'
import { useContextMenu } from '@fe/support/ui/context-menu'
import { refreshTree } from '@fe/services/tree'
import { fetchSettings, showSettingPanel } from '@fe/services/setting'
import { registerAction, removeAction } from '@fe/core/action'
import { useI18n } from '@fe/services/i18n'
import { createDir, createDoc } from '@fe/services/document'
import store from '@fe/support/store'
import type { Components } from '@fe/types'
import TreeNode from './TreeNode.vue'

export default defineComponent({
  name: 'tree',
  components: { TreeNode },
  setup () {
    const { t } = useI18n()
    const contextMenu = useContextMenu()
    const asideRef = ref<HTMLElement>()

    const currentRepo = computed(() => store.state.currentRepo)
    const tree = useLazyRef(() => store.state.tree, val => val ? -1 : 200)
    const loadingVisible = useLazyRef(() => store.state.tree === null, val => val ? 200 : 100)
    const hasRepo = computed(() => !!currentRepo.value)

    async function refresh () {
      await fetchSettings()
      await refreshTree()
    }

    function showContextMenu () {
      const items: Components.ContextMenu.Item[] = [
        {
          id: 'refresh',
          label: t('tree.context-menu.refresh'),
          onClick: refresh
        },
      ]

      if (currentRepo.value && tree.value && tree.value.length) {
        items.push(
          {
            id: 'create-doc',
            label: t('tree.context-menu.create-doc'),
            ellipsis: true,
            onClick: () => createDoc({ repo: currentRepo.value!.name }, tree.value![0])
          },
          {
            id: 'create-dir',
            label: t('tree.context-menu.create-dir'),
            ellipsis: true,
            onClick: () => createDir({ repo: currentRepo.value!.name }, tree.value![0])
          }
        )
      }

      contextMenu.show(items)
    }

    function revealCurrentNode () {
      asideRef.value?.querySelectorAll('details[data-should-open="true"]').forEach((el: any) => {
        el.open = true
      })

      nextTick(() => {
        const currentNode = asideRef.value?.querySelector('.tree-node > .name.selected')
        currentNode?.scrollIntoView({ block: 'center' })
      })
    }

    watch(currentRepo, refreshTree, { immediate: true })

    registerAction({
      name: 'tree.reveal-current-node',
      description: t('command-desc.tree_reveal-current-node'),
      forUser: true,
      handler: revealCurrentNode
    })

    onBeforeUnmount(() => {
      removeAction('tree.reveal-current-node')
    })

    return {
      asideRef,
      tree,
      refresh,
      loadingVisible,
      showContextMenu,
      showSettingPanel,
      hasRepo,
    }
  },
})
</script>

<style lang="scss" scoped>
.side {
  color: var(--g-foreground-color);
  contain: strict;
  height: 100%;
  width: 100%;
  box-sizing: border-box;
  overflow: auto;
  padding-bottom: 20px;
  padding-top: 8px;
}

.loading {
  font-size: 20px;
  text-align: center;
  padding-top: 50%;
  color: var(--yn-accent-primary, #2dd4bf);
  opacity: 0.8;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 0.4; }
}

.add-repo-desc {
  color: var(--g-color-40);
  text-align: center;
  font-size: 12px;
  padding-top: 10px;
}

.add-repo-btn {
  cursor: pointer;
  font-size: 18px;
  text-align: center;
  color: var(--yn-accent-primary, #2dd4bf);
  margin-top: 20vh;
  padding: 16px 24px;
  border: 2px dashed var(--yn-border-default, rgba(255, 255, 255, 0.1));
  border-radius: 12px;
  margin-left: 20px;
  margin-right: 20px;
  transition: all 0.2s ease;

  &:hover {
    background: var(--yn-surface-hover, rgba(45, 212, 191, 0.08));
    border-color: var(--yn-accent-primary, #2dd4bf);
    transform: translateY(-2px);
    box-shadow: 0 0 20px var(--yn-accent-glow, rgba(45, 212, 191, 0.25));
  }
}

aside > ::v-deep(.tree-node) {
  & > details[data-count="0"] > summary .item-action,
  & > details[data-count="1"] > summary .item-action {
    display: flex;
  }

  details[data-count="0"][open] > summary::after {
    content: '(Empty)';
    font-style: italic;
    padding-left: 1em;
    line-height: 20px;
    display: block;
    height: 20px;
    color: var(--g-color-40);
    font-size: 14px;
  }

  .name {
    padding: 4px 8px;
    margin: 1px 4px;
    border-radius: 8px;
    transition: all 0.15s ease;
    font-size: 13px;

    &:hover {
      background: var(--yn-surface-hover, rgba(45, 212, 191, 0.08));
    }

    &.selected {
      background: linear-gradient(135deg, var(--yn-surface-active, rgba(45, 212, 191, 0.15)), rgba(45, 212, 191, 0.08)) !important;
      border-left: 2px solid var(--yn-accent-primary, #2dd4bf);
      font-weight: 500;
    }
  }
}
</style>

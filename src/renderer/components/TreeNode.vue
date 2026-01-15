<template>
  <div class="tree-node">
    <details
      v-if="itemNode.type === 'dir'"
      :class="{name: true, 'drag-over': dragOver}"
      :title="itemNode.path"
      :open="open"
      :data-count="itemNode.children?.length"
      :data-level="itemNode.level"
      :data-should-open="shouldOpen"
      @toggle="(e: any) => open = e.target.open"
      @dragenter="onDragEnter"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @dragexit="onDragExit"
      @drop="onDrop"
      @keydown.enter.prevent>
      <summary
        :class="{folder: true, 'folder-selected': selected}"
        :style="`padding-left: ${itemNode.level}em`"
        @contextmenu.exact.prevent.stop="showContextMenu(itemNode)">
        <div class="item" @mouseenter.self="onMouseEnter" @mouseleave.self="onMouseLeave">
          <div class="item-label" draggable="true" @dragstart="onDragStart">
            {{ itemNode.name }} <span class="count">({{itemNode.children ? itemNode.children.length : 0}})</span>
          </div>
          <div class="item-action">
            <svg-icon v-for="btn in actions" :key="btn.id" class="icon" :name="btn.icon" @click.exact.stop.prevent="btn.onClick" :title="btn.title" />
          </div>
        </div>
      </summary>
      <template v-if="open">
        <tree-node v-for="x in (itemNode.children || [])" :key="x.path" :item="x" />
      </template>
    </details>
    <div
      ref="refFile"
      v-else
      :class="{name: true, 'file-name': true, selected}"
      :style="`padding-left: ${itemNode.level}em`"
      :title="itemNode.path + '\n\n' + fileTitle"
      @click.exact.prevent="select(item)"
      @dblclick.prevent="onTreeNodeDblClick(item)"
      @contextmenu.exact.prevent.stop="showContextMenu(itemNode)">
      <div
        draggable="true"
        @dragstart="onDragStart"
        :class="{'item-label': true, marked, 'type-md': isMarkdownFile(itemNode)}">
        {{ itemNode.name }}
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, h, nextTick, PropType, ref, shallowRef, watch } from 'vue'
import { useContextMenu } from '@fe/support/ui/context-menu'
import { triggerHook } from '@fe/core/hook'
import { getContextMenuItems, getNodeActionButtons, refreshTree } from '@fe/services/tree'
import type { Components } from '@fe/types'
import { deleteDoc, duplicateDoc, isMarkdownFile, isMarked, moveDoc, switchDoc } from '@fe/services/document'
import { useI18n } from '@fe/services/i18n'
import { dirname, extname, isBelongTo, join } from '@fe/utils/path'
import { useToast } from '@fe/support/ui/toast'
import { FLAG_READONLY } from '@fe/support/args'
import { encodeMarkdownLink, escapeMd, fileToBase64URL } from '@fe/utils'
import store from '@fe/support/store'
import { upload } from '@fe/support/api'
import SvgIcon from './SvgIcon.vue'

export default defineComponent({
  name: 'tree-node',
  components: { SvgIcon },
  props: {
    item: {
      type: Object as PropType<Components.Tree.Node>,
      required: true,
    }
  },
  setup (props) {
    const { t } = useI18n()

    const toast = useToast()

    const refFile = ref<any>(null)
    const localMarked = ref<boolean | null>(null)
    const dragOver = ref<boolean>(false)
    const actions = shallowRef<Components.Tree.NodeActionBtn[]>([])

    const itemNode = computed(() => ({ ...props.item, marked: isMarked(props.item) }))
    const open = ref(itemNode.value.path === '/')

    watch(() => props.item, () => {
      localMarked.value = null
    })

    const currentFile = computed(() => store.state.currentFile)

    function onMouseEnter () {
      actions.value = getNodeActionButtons(props.item)
    }

    function onMouseLeave () {
      actions.value = []
    }

    function onTreeNodeDblClick (node: Components.Tree.Node) {
      if (node.type === 'file') {
        triggerHook('TREE_NODE_DBLCLICK', { node })
      }
    }

    async function select (node: Components.Tree.Node) {
      if (node.type === 'file') {
        if (!(await triggerHook('TREE_NODE_SELECT', { node }, { breakable: true, ignoreError: true }))) {
          switchDoc(node)
        }
      }
    }

    function showContextMenu (item: any) {
      useContextMenu().show([...getContextMenuItems(item, { localMarked })])
    }

    async function handleFileDrop (item: Components.Tree.Node, copy: boolean) {
      function showToast (type: 'moved' | 'copied', newPath: string) {
        const undo = () => {
          if (type === 'moved') {
            moveDoc({ ...item, path: newPath }, item.path)
          } else {
            deleteDoc({ ...item, path: newPath }, true)
          }

          toast.hide()
        }

        toast.show('info', h('div', {}, [
          h('span', {}, t(`tree.toast.${type}`, item.name, newPath)),
          h('a', {
            style: { color: '#fcfcfc', marginLeft: '10px' },
            href: 'javascript:;',
            onClick: undo
          }, t('undo'))
        ]), 4000)
      }

      let newPath: string | undefined = join(itemNode.value.path, item.name)

      if (copy) {
        // copy file only
        if (item.type === 'file') {
          if (item.path === newPath) {
            // markdown file need input new name
            if (isMarkdownFile(item)) {
              newPath = undefined
            } else {
              // other file can be copied with same name
              const dir = dirname(newPath)
              const ext = extname(newPath)
              const name = item.name.replace(ext, '')
              newPath = join(dir, `${name}-copy${ext}`)
            }
          }

          await duplicateDoc(item, newPath)

          if (newPath) {
            showToast('copied', newPath)
          }
        } else {
          toast.show('warning', 'Cannot copy folder')
        }
      } else {
        if (item.path === newPath) {
          return
        }

        // move file or folder
        if (isBelongTo(item.path, newPath)) {
          toast.show('warning', 'Cannot move to self or its children')
        } else {
          await moveDoc(item, newPath)
          showToast('moved', newPath)
        }
      }
    }

    async function handleFileUpload (files: FileList) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const base64 = await fileToBase64URL(file)
        const path = join(itemNode.value.path, file.name)

        await upload(props.item.repo, base64, path, 'rename').catch((e) => {
          toast.show('warning', e.message)
        })
      }

      refreshTree()
    }

    let dragOverTimer: number
    let dragEnterElement: HTMLElement | null = null

    const changeDragOver = (isOver: boolean) => {
      dragOver.value = isOver
      clearTimeout(dragOverTimer)

      if (isOver) {
        dragOverTimer = window.setTimeout(() => {
          open.value = true
        }, 800)
      } else {
        dragEnterElement = null
      }
    }

    function onDragEnter (e: DragEvent) {
      e.preventDefault()
      e.stopPropagation()
      dragEnterElement = e.target as HTMLElement

      function getTreeNodeSibling (): [any, any] {
        const currentTreeNode = (e.target as HTMLElement).closest('.tree-node')
        if (!currentTreeNode) {
          return [null, null]
        }

        // get all tree nodes
        const nodes = Array.from(document.querySelectorAll('aside.side .tree-node'))

        const idx = nodes.indexOf(currentTreeNode)
        if (idx === -1) {
          return [null, null]
        }

        // get around 4 nodes
        const aroundNodes = nodes.slice(Math.max(0, idx - 3), Math.min(nodes.length, idx + 4))

        return [
          aroundNodes[0].querySelector('.item-label'),
          aroundNodes[aroundNodes.length - 1].querySelector('.item-label')
        ]
      }

      setTimeout(() => {
        const [first, last] = getTreeNodeSibling()

        const container = document.querySelector('aside.side') as HTMLElement
        const scrollTop = container.scrollTop || 0

        first?.scrollIntoViewIfNeeded(false)

        if (scrollTop === container.scrollTop) {
          last?.scrollIntoViewIfNeeded(false)
        }
      }, 60)

      changeDragOver(true)
    }

    function onDragLeave (e: DragEvent) {
      e.preventDefault()
      e.stopPropagation()

      if (dragEnterElement === e.target) {
        changeDragOver(false)
      }
    }

    function onDragExit (e: DragEvent) {
      e.preventDefault()
      e.stopPropagation()

      changeDragOver(false)
    }

    function onDragOver (e: DragEvent) {
      e.preventDefault()
      e.stopPropagation()

      if (e.altKey) {
        e.dataTransfer!.dropEffect = 'copy'
      } else {
        e.dataTransfer!.dropEffect = 'move'
      }
    }

    function onDragStart (e: DragEvent) {
      e.stopPropagation()

      const node = itemNode.value
      if (isMarkdownFile(node)) {
        e.dataTransfer!.setData('text/plain', `[${escapeMd(node.name)}](${encodeMarkdownLink(node.path)})`)
      } else if (node.type === 'file' && /\.(png|jpe?g|gif|svg|webp)$/i.test(node.name)) {
        e.dataTransfer!.setData('text/plain', `![Img](${encodeMarkdownLink(node.path)})`)
      } else {
        e.dataTransfer!.setData('text/plain', node.path)
      }

      e.dataTransfer!.setData('node-info', JSON.stringify(node))
    }

    function onDrop (e: DragEvent) {
      e.preventDefault()
      e.stopPropagation()
      changeDragOver(false)

      const data = e.dataTransfer?.getData('node-info')
      if (data) {
        const item = JSON.parse(data) as Components.Tree.Node
        handleFileDrop(item, e.altKey)
      } else {
        const isDragFile = !!e.dataTransfer?.items &&
          e.dataTransfer.items.length > 0 &&
          e.dataTransfer.items[0].kind === 'file'

        if (isDragFile) {
          handleFileUpload(e.dataTransfer.files)
        }
      }
    }

    const selected = computed(() => {
      if (!currentFile.value) {
        return false
      }

      if (itemNode.value.type === 'dir') {
        return currentFile.value.repo === itemNode.value.repo && currentFile.value.path.startsWith(itemNode.value.path + '/')
      }

      return currentFile.value.repo === itemNode.value.repo && currentFile.value.path === itemNode.value.path
    })

    const shouldOpen = computed(() => {
      if (itemNode.value.type === 'dir' && currentFile.value) {
        // open the folder when the file is in the folder
        return itemNode.value.path === '/' || (currentFile.value.path.startsWith(itemNode.value.path + '/') && currentFile.value.repo === itemNode.value.repo)
      }

      return false
    })

    const marked = computed(() => localMarked.value ?? itemNode.value.marked)

    watch(selected, val => {
      if (val && itemNode.value.type === 'file') {
        nextTick(() => {
          refFile.value.scrollIntoViewIfNeeded()
        })
      }
    }, { immediate: true })

    watch(shouldOpen, val => {
      if (val) {
        nextTick(() => {
          open.value = true
        })
      }
    }, { immediate: true })

    const fileTitle = computed(() => [
      t('tree.created-at', itemNode.value.birthtime ? new Date(itemNode.value.birthtime).toLocaleString() : '-'),
      t('tree.updated-at', itemNode.value.mtime ? new Date(itemNode.value.mtime).toLocaleString() : '-'),
    ].join('\n'))

    return {
      open,
      itemNode,
      refFile,
      fileTitle,
      selected,
      actions,
      onTreeNodeDblClick,
      marked,
      showContextMenu,
      select,
      dragOver,
      onDragEnter,
      onDragOver,
      onDragLeave,
      onDragExit,
      onDrop,
      onDragStart,
      onMouseEnter,
      onMouseLeave,
      shouldOpen,
      isMarkdownFile,
      FLAG_READONLY,
    }
  },
})
</script>

<style scoped>
.tree-node {
  font-size: 14px;
  line-height: 28px;
  cursor: default;
  color: var(--g-color-2);
}

.tree-node * {
  user-select: none;
}

summary {
  outline: none;
  height: 28px;
  overflow: hidden;
  contain: strict;
  display: block;
}

summary.folder::-webkit-details-marker,
summary.folder::marker {
  content: '';
  display: none;
}

summary.folder::before {
  display: inline-block;
  width: 11px;
  height: 28px;
  content: url(data:image/svg+xml;base64,PHN2ZyBhcmlhLWhpZGRlbj0idHJ1ZSIgZm9jdXNhYmxlPSJmYWxzZSIgZGF0YS1wcmVmaXg9ImZhciIgZGF0YS1pY29uPSJjaGV2cm9uLWRvd24iIHJvbGU9ImltZyIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgNDQ4IDUxMiIgPjxwYXRoIGZpbGw9IiMyZGQ0YmYiIGQ9Ik00NDEuOSAxNjcuM2wtMTkuOC0xOS44Yy00LjctNC43LTEyLjMtNC43LTE3IDBMMjI0IDMyOC4yIDQyLjkgMTQ3LjVjLTQuNy00LjctMTIuMy00LjctMTcgMEw2LjEgMTY3LjNjLTQuNyA0LjctNC43IDEyLjMgMCAxN2wyMDkuNCAyMDkuNGM0LjcgNC43IDEyLjMgNC43IDE3IDBsMjA5LjQtMjA5LjRjNC43LTQuNyA0LjctMTIuMyAwLTE3eiIgY2xhc3M9IiI+PC9wYXRoPjwvc3ZnPg==);
  margin-right: 3px;
  transform: rotate(-90deg);
  transition: transform 0.2s ease;
  opacity: 0.6;
}

details.name[open] > summary.folder::before {
  transform: rotate(0);
  opacity: 1;
}

.folder {
  align-items: center;
  border-radius: 8px;
  margin: 2px 4px;
  transition: all 0.15s ease;
}

.folder:hover {
  background: var(--yn-surface-hover, rgba(45, 212, 191, 0.08));
}

.folder-selected {
  background: var(--yn-surface-active, rgba(45, 212, 191, 0.15));
}

.item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

summary > .item {
  display: inline-flex;
  width: calc(100% - 20px);
}

.item-label {
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-all;
  height: 28px;
  font-variant-numeric: tabular-nums;
  flex-grow: 1;
  transition: transform 0.1s ease;
}

.item-action {
  display: none;
  align-content: center;
  justify-content: space-around;
  flex: none;
}

.item-action .icon {
  padding: 4px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  height: 20px;
  width: 20px;
  border-radius: 50%;
  color: var(--g-color-30);
  transition: all 0.15s ease;
}

.item-action .icon:hover {
  background: var(--yn-surface-active, rgba(45, 212, 191, 0.15));
  color: var(--yn-accent-primary, #2dd4bf);
  transform: scale(1.1);
}

.item:hover .item-action {
  display: flex;
}

.item .count {
  color: var(--yn-accent-primary, #2dd4bf);
  font-size: 11px;
  vertical-align: bottom;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.item:hover .count {
  opacity: 0.6;
}

.name {
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.name.drag-over {
  opacity: 0.5;
  outline: 2px var(--yn-accent-primary, #2dd4bf) dashed;
  outline-offset: -4px;
  transition-delay: 0s;
  border-radius: 8px;

  summary {
    contain: none;
  }
}

.file-name {
  padding-left: 0.2em;
  transition: all 0.15s ease;
  border-left: 3px solid transparent;
  border-radius: 8px;
  margin: 2px 4px;
}

.file-name.selected {
  background: linear-gradient(135deg, var(--yn-surface-active, rgba(45, 212, 191, 0.15)), var(--yn-surface-hover, rgba(45, 212, 191, 0.08)));
  border-left-color: var(--yn-accent-primary, #2dd4bf);
  font-weight: 500;
}

.file-name:hover {
  background: var(--yn-surface-hover, rgba(45, 212, 191, 0.08));
}

.file-name .item-label::before {
  display: inline-block;
  width: 12px;
  height: 24px;
  margin-right: 6px;
  content: url(data:image/svg+xml;base64,PHN2ZyBhcmlhLWhpZGRlbj0idHJ1ZSIgZm9jdXNhYmxlPSJmYWxzZSIgZGF0YS1wcmVmaXg9ImZhbCIgZGF0YS1pY29uPSJmaWxlLWNoYXJ0LXBpZSIgcm9sZT0iaW1nIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzODQgNTEyIiBjbGFzcz0ic3ZnLWlubGluZS0tZmEgZmEtZmlsZS1jaGFydC1waWUgZmEtdy0xMiI+PHBhdGggZmlsbD0iIzk5OSIgZD0iTTM2OS45IDk3Ljk4TDI4Ni4wMiAxNC4xYy05LTktMjEuMi0xNC4xLTMzLjg5LTE0LjFINDcuOTlDMjEuNS4xIDAgMjEuNiAwIDQ4LjA5djQxNS45MkMwIDQ5MC41IDIxLjUgNTEyIDQ3Ljk5IDUxMmgyODguMDJjMjYuNDkgMCA0Ny45OS0yMS41IDQ3Ljk5LTQ3Ljk5VjEzMS45N2MwLTEyLjY5LTUuMS0yNC45OS0xNC4xLTMzLjk5ek0yNTYuMDMgMzIuNTljMi44LjcgNS4zIDIuMSA3LjQgNC4ybDgzLjg4IDgzLjg4YzIuMSAyLjEgMy41IDQuNiA0LjIgNy40aC05NS40OFYzMi41OXptOTUuOTggNDMxLjQyYzAgOC44LTcuMiAxNi0xNiAxNkg0Ny45OWMtOC44IDAtMTYtNy4yLTE2LTE2VjQ4LjA5YzAtOC44IDcuMi0xNi4wOSAxNi0xNi4wOWgxNzYuMDR2MTA0LjA3YzAgMTMuMyAxMC43IDIzLjkzIDI0IDIzLjkzaDEwMy45OHYzMDQuMDF6TTE5MiAxOTJ2MTI4aDEyNy45OWMuMDEgMCAwLS4wMSAwLS4wMi0uMDEtNzAuNjgtNTcuMjktMTI3Ljk3LTEyNy45Ny0xMjcuOThIMTkyem0zMiAzNy40OWMyNy4yMiA5LjY2IDQ4Ljg1IDMxLjI4IDU4LjUgNTguNTFIMjI0di01OC41MXpNMTc2IDQxNmMtNDQuMTIgMC04MC0zNS44OS04MC04MCAwLTM4LjYzIDI3LjUyLTcwLjk1IDY0LTc4LjM4di0zMmMtNTQuMTMgNy44NS05NiA1NC4xMS05NiAxMTAuMzggMCA2MS43NSA1MC4yNSAxMTIgMTEyIDExMiA1Ni4yNyAwIDEwMi41NC00MS44NyAxMTAuMzgtOTZoLTMyYy03LjQzIDM2LjQ3LTM5Ljc0IDY0LTc4LjM4IDY0eiIgY2xhc3M9IiI+PC9wYXRoPjwvc3ZnPg==);
  vertical-align: middle;
  opacity: 0.7;
  transition: opacity 0.15s ease;
}

.file-name:hover .item-label::before {
  opacity: 1;
}

.file-name .item-label.type-md::before {
  content: url(data:image/svg+xml;base64,PHN2ZyBhcmlhLWhpZGRlbj0idHJ1ZSIgZm9jdXNhYmxlPSJmYWxzZSIgZGF0YS1wcmVmaXg9ImZhbCIgZGF0YS1pY29uPSJmaWxlLWFsdCIgcm9sZT0iaW1nIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzODQgNTEyIiBjbGFzcz0ic3ZnLWlubGluZS0tZmEgZmEtZmlsZS1hbHQgZmEtdy0xMiI+PHBhdGggZmlsbD0iIzJkZDRiZiIgZD0iTTM2OS45IDk3LjlMMjg2IDE0QzI3NyA1IDI2NC44LS4xIDI1Mi4xLS4xSDQ4QzIxLjUgMCAwIDIxLjUgMCA0OHY0MTZjMCAyNi41IDIxLjUgNDggNDggNDhoMjg4YzI2LjUgMCA0OC0yMS41IDQ4LTQ4VjEzMS45YzAtMTIuNy01LjEtMjUtMTQuMS0zNHptLTIyLjYgMjIuN2MyLjEgMi4xIDMuNSA0LjYgNC4yIDcuNEgyNTZWMzIuNWMyLjguNyA1LjMgMi4xIDcuNCA0LjJsODMuOSA4My45ek0zMzYgNDgwSDQ4Yy04LjggMC0xNi03LjItMTYtMTZWNDhjMC04LjggNy4yLTE2IDE2LTE2aDE3NnYxMDRjMCAxMy4zIDEwLjcgMjQgMjQgMjRoMTA0djMwNGMwIDguOC03LjIgMTYtMTYgMTZ6bS00OC0yNDR2OGMwIDYuNi01LjQgMTItMTIgMTJIMTA4Yy02LjYgMC0xMi01LjQtMTItMTJ2LThjMC02LjYgNS40LTEyIDEyLTEyaDE2OGM2LjYgMCAxMiA1LjQgMTIgMTJ6bTAgNjR2OGMwIDYuNi01LjQgMTItMTIgMTJIMTA4Yy02LjYgMC0xMi01LjQtMTItMTJ2LThjMC02LjYgNS40LTEyIDEyLTEyaDE2OGM2LjYgMCAxMiA1LjQgMTIgMTJ6bTAgNjR2OGMwIDYuNi01LjQgMTItMTIgMTJIMTA4Yy02LjYgMC0xMi01LjQtMTItMTJ2LThjMC02LjYgNS40LTEyIDEyLTEyaDE2OGM2LjYgMCAxMiA1LjQgMTIgMTJ6IiBjbGFzcz0iIj48L3BhdGg+PC9zdmc+);
}

.file-name .item-label:active {
  transform: translateX(2px);
}

.marked {
  position: relative;
}

.marked::after {
  content: '';
  width: 8px;
  height: 8px;
  background: var(--yn-accent-primary, #2dd4bf);
  border-radius: 50%;
  position: absolute;
  left: -4px;
  top: 36%;
  box-shadow: 0 0 8px var(--yn-accent-glow, rgba(45, 212, 191, 0.25));
}

.name {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}
</style>

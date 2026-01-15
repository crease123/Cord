<template>
  <div class="status-bar">
    <StatusBarMenu class="left" position="left" />
    <StatusBarMenu class="right" position="right" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import StatusBarMenu from './StatusBarMenu.vue'

export default defineComponent({
  name: 'status-bar',
  components: { StatusBarMenu },
})
</script>

<style scoped>
.left {
  display: flex;
}

.right {
  display: flex;
}

.status-bar {
  box-sizing: border-box;
  padding: 0;
  color: var(--g-foreground-color, #eee);
  background: linear-gradient(90deg, var(--yn-surface-1, #12161d) 0%, var(--yn-surface-2, #1a1f2a) 50%, var(--yn-surface-1, #12161d) 100%);
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: 0.03em;
  line-height: 20px;
  height: 100%;
  display: flex;
  justify-content: space-between;
  overflow: hidden;
  border-top: 1px solid var(--yn-border-subtle, rgba(255, 255, 255, 0.06));
}

.action {
  padding: 0 .5em;
  cursor: pointer;
  user-select: none;
  flex: none;
  transition: all 0.15s ease;
  border-radius: 4px;
  margin: 2px;
}

.action-icon {
  width: 10px;
  height: 20px;
}

.action:hover {
  background: var(--yn-surface-hover, rgba(45, 212, 191, 0.08));
  color: var(--yn-accent-primary, #2dd4bf);
}
</style>

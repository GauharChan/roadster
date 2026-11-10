<script setup lang="ts">
import { provide, useTemplateRef } from 'vue'
import GameHud from './components/GameHud.vue'
import GameStage from './components/GameStage.vue'
import TouchControls from './components/TouchControls.vue'
import { useRoadsterGame } from './composables/useRoadsterGame'
import { gameKey } from './game/context'

const stage = useTemplateRef('stage')
const game = useRoadsterGame(stage)
provide(gameKey, game)
</script>

<template>
  <main class="game-root bg-asphalt font-sans text-dust">
    <GameStage ref="stage" />
    <GameHud />
    <TouchControls />
  </main>
</template>

<style scoped>
.game-root {
  position: relative;
  width: 100%;
  height: 100dvh;
  overflow: hidden;
  touch-action: none;
  user-select: none;
}
</style>

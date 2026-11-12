<script setup lang="ts">
import { computed, inject, shallowRef } from 'vue'
import { gameKey } from '../game/context'

const game = inject(gameKey)
if (!game) throw new Error('游戏控制未就绪')

const knobX = shallowRef(0)
const dragging = shallowRef(false)
const noseUp = computed(() => (game.hud.mode === 'air' ? '抬头' : '加速'))
const noseDown = computed(() => (game.hud.mode === 'air' ? '压头' : '刹车'))
const steerLabel = computed(() => (game.hud.mode === 'air' ? '横滚' : '转向'))

function hold(set: (down: boolean) => void) {
  return {
    pointerdown(event: PointerEvent) {
      event.preventDefault()
      const el = event.currentTarget
      if (el instanceof HTMLElement) el.setPointerCapture(event.pointerId)
      set(true)
    },
    pointerup() {
      set(false)
    },
    pointercancel() {
      set(false)
    },
    lostpointercapture() {
      set(false)
    },
  }
}

const accelHold = hold(game.setAccel)
const brakeHold = hold(game.setBrake)
const thrustHold = hold(game.setThrust)

function onStickDown(event: PointerEvent) {
  event.preventDefault()
  const el = event.currentTarget
  if (el instanceof HTMLElement) el.setPointerCapture(event.pointerId)
  dragging.value = true
  moveStick(event)
}

function moveStick(event: PointerEvent) {
  if (!dragging.value) return
  const el = event.currentTarget
  if (!(el instanceof HTMLElement)) return
  const rect = el.getBoundingClientRect()
  const max = rect.width * 0.34
  const dx = event.clientX - (rect.left + rect.width / 2)
  const clamped = Math.max(-max, Math.min(max, dx))
  knobX.value = clamped
  game?.setSteer(max === 0 ? 0 : clamped / max)
}

function endStick() {
  dragging.value = false
  knobX.value = 0
  game?.setSteer(0)
}

function onFlip(event: PointerEvent) {
  event.preventDefault()
  game?.requestFlip()
}
</script>

<template>
  <div class="controls">
    <div
      class="stick"
      @pointerdown="onStickDown"
      @pointermove="moveStick"
      @pointerup="endStick"
      @pointercancel="endStick"
      @lostpointercapture="endStick"
    >
      <span class="stick-label">{{ steerLabel }}</span>
      <span class="knob" :style="{ transform: `translate3d(${knobX}px, 0, 0)` }" />
    </div>
    <div class="pads">
      <button type="button" class="pad" v-on="accelHold">{{ noseUp }}</button>
      <button type="button" class="pad" v-on="brakeHold">{{ noseDown }}</button>
      <button type="button" class="pad thrust" v-on="thrustHold">推进</button>
      <button type="button" class="pad" @pointerdown="onFlip">翻转</button>
    </div>
  </div>
</template>

<style scoped>
.controls {
  display: none;
}

@media (pointer: coarse) {
  .controls {
    position: absolute;
    z-index: 3;
    right: 0;
    bottom: 0;
    left: 0;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    padding:
      12px
      calc(16px + env(safe-area-inset-right))
      calc(16px + env(safe-area-inset-bottom))
      calc(16px + env(safe-area-inset-left));
    touch-action: none;
    user-select: none;
  }
}

.stick {
  position: relative;
  width: 132px;
  height: 76px;
  border: 1px solid rgba(231, 225, 214, 0.35);
  border-radius: 999px;
  background: rgba(7, 8, 12, 0.45);
}

.stick-label {
  position: absolute;
  top: 8px;
  left: 0;
  width: 100%;
  color: #b7b1a8;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-align: center;
}

.knob {
  position: absolute;
  top: 28px;
  left: calc(50% - 18px);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #e7e1d6;
}

.pads {
  display: grid;
  grid-template-columns: 72px 72px;
  gap: 8px;
}

.pad {
  height: 64px;
  border: 1px solid rgba(231, 225, 214, 0.4);
  border-radius: 8px;
  background: rgba(7, 8, 12, 0.62);
  color: #e7e1d6;
  font: inherit;
  letter-spacing: 0.12em;
}

.thrust {
  border-color: #c5ccd4;
  color: #e7e1d6;
}

.pad:focus-visible {
  outline: 2px solid #c5ccd4;
  outline-offset: 3px;
}
</style>

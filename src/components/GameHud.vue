<script setup lang="ts">
import { computed, inject } from 'vue'
import { gameKey } from '../game/context'

const game = inject(gameKey)
if (!game) throw new Error('游戏控制未就绪')

const modeLabel = computed(() => {
  if (game.hud.mode === 'air') return '飞行'
  if (game.hud.mode === 'ramp') return '坡道'
  return '路面'
})

const objective = computed(() => {
  if (game.hud.stuntDone) return '这一轮完成'
  if (game.hud.mode === 'air') return '按住推进稳住，放平后落地'
  if (game.hud.mode === 'ramp') return '继续往上，冲出坡唇'
  return '加速对准坡道口'
})
</script>

<template>
  <header class="hud">
    <div class="title-block">
      <p class="eyebrow">试车坪</p>
      <h1 class="title">THE RAMP</h1>
      <p class="note">非官方场景复刻</p>
      <p class="credit">
        车模
        <a
          href="https://sketchfab.com/3d-models/tesla-roadster-2020-1fbf29e297bd4a17ac39a00a378441d8"
          target="_blank"
          rel="noreferrer"
        >Roadster 2020</a>
        · metarex.4d · CC BY 4.0
      </p>
      <p class="objective">{{ objective }}</p>
      <div class="readout">
        <p class="metric">
          <span class="value">{{ game.hud.speedKmh }}</span>
          <span class="unit">km/h</span>
        </p>
        <p class="metric">
          <span class="value" data-altitude>{{ game.hud.altitude }}</span>
          <span class="unit">m</span>
          <span
            class="climb"
            data-climb
            :class="{ down: game.hud.climb.startsWith('-') }"
          >{{ game.hud.climb }}</span>
        </p>
        <p class="mode" :class="{ flying: game.hud.mode === 'air' }">{{ modeLabel }}</p>
      </div>
      <p class="notice" role="status" aria-live="polite" :data-kind="game.hud.noticeKind">{{ game.hud.notice }}</p>
      <button
        v-if="game.hud.stuntDone"
        type="button"
        class="again"
        data-action="reset"
        @click="game.requestReset()"
      >
        再来一次
      </button>
    </div>

    <button type="button" class="reset" data-action="reset" @click="game.requestReset()">重置</button>
    <p class="hint">W/S 油门，空中改为俯仰<br>A/D 转向，空中改为横滚<br>空格推进 · F 翻转 · R 重置</p>
  </header>
</template>

<style scoped>
.hud {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  padding:
    calc(18px + env(safe-area-inset-top))
    calc(18px + env(safe-area-inset-right))
    calc(18px + env(safe-area-inset-bottom))
    calc(18px + env(safe-area-inset-left));
}

.title-block {
  max-width: 16rem;
}

.eyebrow {
  margin: 0;
  color: #ff2d2a;
  font-size: 12px;
  letter-spacing: 0.42em;
}

.title {
  margin: 2px 0 0;
  font-size: clamp(40px, 8vw, 68px);
  font-weight: 600;
  line-height: 0.84;
  letter-spacing: 0.12em;
  text-shadow: 0 10px 30px rgba(0, 0, 0, 0.72);
}

.note,
.objective,
.credit {
  margin: 6px 0 0;
  color: #b7b1a8;
  font-size: 14px;
  letter-spacing: 0.08em;
}

.credit {
  font-size: 11px;
  letter-spacing: 0.04em;
}

.credit a {
  color: #e7e1d6;
  pointer-events: auto;
}

.objective {
  color: #e7e1d6;
}

.notice {
  min-height: 1.4em;
  margin: 8px 0 0;
  color: #e7e1d6;
  font-size: 18px;
  letter-spacing: 0.12em;
}

.notice[data-kind='recover'] {
  color: #ff2d2a;
}

.climb {
  color: #b7b1a8;
  font-size: 13px;
  letter-spacing: 0.06em;
}

.climb.down {
  color: #9eb6d6;
}

.again,
.reset {
  pointer-events: auto;
  border: 1px solid #ff2d2a;
  background: rgba(7, 8, 12, 0.72);
  color: #e7e1d6;
  font: inherit;
  letter-spacing: 0.14em;
  cursor: pointer;
}

.again {
  margin-top: 12px;
  padding: 8px 14px;
}

.reset {
  position: absolute;
  top: calc(18px + env(safe-area-inset-top));
  right: calc(18px + env(safe-area-inset-right));
  padding: 8px 12px;
}

.again:focus-visible,
.reset:focus-visible {
  outline: 2px solid #ff2d2a;
  outline-offset: 3px;
}

.readout {
  display: flex;
  gap: 16px;
  align-items: baseline;
  margin-top: 14px;
  font-family: "IBM Plex Mono", "PingFang SC", ui-monospace, monospace;
  text-shadow: 0 6px 18px rgba(0, 0, 0, 0.8);
}

.metric {
  display: flex;
  gap: 6px;
  align-items: baseline;
  margin: 0;
}

.value {
  font-size: 28px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.unit,
.mode {
  color: #b7b1a8;
  font-size: 12px;
  letter-spacing: 0.12em;
}

.mode {
  margin: 0;
}

.flying {
  color: #ff2d2a;
}

.hint {
  position: absolute;
  bottom: calc(16px + env(safe-area-inset-bottom));
  left: 50%;
  margin: 0;
  color: #b7b1a8;
  font-size: 13px;
  letter-spacing: 0.08em;
  line-height: 1.55;
  text-align: center;
  transform: translateX(-50%);
}

@media (pointer: coarse) {
  .hint {
    display: none;
  }
}

@media (max-height: 520px) {
  .title {
    font-size: 32px;
  }

  .note {
    display: none;
  }
}

@media (max-width: 720px) {
  .title {
    letter-spacing: 0.08em;
  }

  .readout {
    gap: 12px;
  }

  .value {
    font-size: 22px;
  }
}
</style>

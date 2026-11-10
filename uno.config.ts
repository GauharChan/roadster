import { defineConfig, presetWind3 } from 'unocss'

export default defineConfig({
  presets: [
    presetWind3(),
  ],
  theme: {
    colors: {
      asphalt: '#07080c',
      dust: '#e7e1d6',
      signal: '#ff2d2a',
      mute: '#b7b1a8',
    },
    fontFamily: {
      sans: '"Barlow Condensed", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif',
      mono: '"IBM Plex Mono", "PingFang SC", ui-monospace, monospace',
    },
  },
})

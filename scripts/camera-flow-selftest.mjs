import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import http from 'node:http'

const require = createRequire(import.meta.url)
const typescript = require('typescript')

const repo = new URL('..', import.meta.url).pathname
const artifacts = '/opt/cursor/artifacts'
const previewURL = 'http://127.0.0.1:5174'

const shots = [
  { id: 'coast', file: 'camera-coast.png' },
  { id: 'turn', file: 'camera-turn.png' },
  { id: 'air-enter', file: 'camera-air-enter.png' },
  { id: 'thrust', file: 'camera-thrust.png' },
  { id: 'land', file: 'camera-land.png' },
]

const preview = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--port', '5174', '--host', '127.0.0.1', '--strictPort'],
  { cwd: repo, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
)
let previewLog = ''
preview.stdout.on('data', (chunk) => {
  previewLog += chunk
})
preview.stderr.on('data', (chunk) => {
  previewLog += chunk
})

const chrome = spawn('google-chrome', [
  '--headless=new',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--disable-frame-rate-limit',
  '--disable-gpu-vsync',
  '--window-size=1280,720',
  '--remote-debugging-port=9222',
  '--remote-allow-origins=*',
  `--user-data-dir=/tmp/roadster-chrome-${process.pid}`,
  'about:blank',
], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
let chromeLog = ''
chrome.stderr.on('data', (chunk) => {
  chromeLog += chunk
})

const stop = () => {
  killGroup(preview)
  killGroup(chrome)
}

function killGroup(child) {
  if (!child.pid) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    try {
      child.kill('SIGTERM')
    } catch {
      /* 进程已经退出 */
    }
  }
}

let browser = null
try {
  await waitForHttp(previewURL)
  const version = await waitForJson('http://127.0.0.1:9222/json/version')
  browser = await openSocket(version.webSocketDebuggerUrl)
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true })
  const page = (method, params = {}) => browser.send(method, params, sessionId)
  await page('Page.enable')
  await page('Runtime.enable')
  await page('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await page('Page.navigate', { url: previewURL })
  await waitFor(async () => {
    const result = await page('Runtime.evaluate', {
      expression: 'Boolean(document.querySelector("canvas")) && Boolean(window.__roadsterSample)',
      returnByValue: true,
    })
    if (!result.result?.value) throw new Error('游戏还没起来')
    return true
  })
  const source = pilotSource()
  const installed = await page('Runtime.evaluate', {
    expression: `${source}\nwindow.__roadsterFrameLog = []; window.__roadsterAutopilot = createPilot(); ({ hidden: document.hidden, ready: typeof window.__roadsterAutopilot === 'function' })`,
    returnByValue: true,
  })
  if (installed.result?.value?.ready !== true) {
    throw new Error(`自动驾驶没有装上: ${JSON.stringify(installed)}`)
  }
  const taken = new Set()
  const started = Date.now()
  let status = null
  while (Date.now() - started < 150000) {
    status = await readStatus(page)
    await Promise.all(shots.map(async (shot) => {
      if (taken.has(shot.id) || !status.shots?.[shot.id]) return
      taken.add(shot.id)
      await saveShot(page, `${artifacts}/${shot.file}`)
    }))
    if (status.landed) break
    const age = Date.now() - started
    const descending = status.mode === 'air' && status.y > 12 && status.y < 30 && status.vy < 0
    if (age > 90000 && !descending) break
    await sleep(120)
  }
  await sleep(400)
  if (!taken.has('land')) {
    await saveShot(page, `${artifacts}/camera-land.png`)
    taken.add('land')
  }
  const log = await readLog(page)
  await mkdir(artifacts, { recursive: true })
  const summary = summarize(log, status, taken)
  await writeFile(`${artifacts}/camera-flow-frames.json`, JSON.stringify(log))
  await writeFile(`${artifacts}/camera-flow-summary.json`, JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary, null, 2))
  if (!summary.pass) process.exitCode = 1
} catch (error) {
  console.error(error)
  console.error(previewLog.slice(-2000))
  console.error(chromeLog.slice(-2000))
  process.exitCode = 1
} finally {
  browser?.close()
  stop()
  await sleep(200)
  process.exit(process.exitCode ?? 0)
}

function pilotSource() {
  const file = `${repo}/scripts/flightPilot.ts`
  const transpiled = typescript.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.ESNext },
  }).outputText
  return transpiled.replace(/^export /gm, '')
}

function summarize(log, status, taken) {
  const yawDeltas = log.slice(1).map((frame, index) => yawGap(frame.yaw, log[index].yaw))
  const maxYawDelta = yawDeltas.reduce((max, gap) => Math.max(max, gap), 0)
  const insetFailures = log.filter((frame) => frame.bodyInInset === false).length
  const fastRamp = log.some((frame) => frame.mode === 'ramp' && Math.hypot(frame.vx, frame.vy, frame.vz) >= 39)
  const thrustTakeoff = log.some((frame) => frame.mode === 'air' && frame.thrust && frame.y > 8)
  const rampInset = log.filter((frame) => frame.mode === 'ramp' && Math.hypot(frame.vx, frame.vy, frame.vz) >= 39)
  const thrustInset = log.filter((frame) => frame.mode === 'air' && frame.thrust && frame.y > 8)
  const rampHolds = rampInset.length > 0 && rampInset.every((frame) => frame.bodyInInset)
  const thrustHolds = thrustInset.length > 0 && thrustInset.every((frame) => frame.bodyInInset)
  const landing = log.find((frame) => frame.event === 'land' || frame.event === 'recover')
  const sawTurn = log.some((frame) => frame.mode === 'ground' && frame.z > 30 && Math.abs(Math.atan2(frame.vx, -frame.vz)) > 0.35)
  const sawReverse = log.some((frame) => frame.mode === 'ground' && frame.vz > 2 && frame.z > 35)
  const pass = maxYawDelta < 30
    && insetFailures === 0
    && fastRamp
    && rampHolds
    && thrustTakeoff
    && thrustHolds
    && Boolean(landing)
    && sawTurn
    && sawReverse
    && taken.has('land')
  return {
    pass,
    frames: log.length,
    maxYawDelta,
    insetFailures,
    fastRamp,
    rampInsetFrames: rampInset.length,
    rampHolds,
    thrustTakeoff,
    thrustInsetFrames: thrustInset.length,
    thrustHolds,
    landingObserved: Boolean(landing),
    landingEvent: landing?.event ?? null,
    landingY: landing?.y ?? null,
    sawTurn,
    sawReverse,
    sawAir: log.some((frame) => frame.mode === 'air'),
    shots: [...taken],
    final: status,
  }
}

function yawGap(a, b) {
  const gap = Math.abs(a - b)
  return Math.min(gap, 360 - gap)
}

async function readStatus(page) {
  const result = await page('Runtime.evaluate', {
    expression: `(() => {
      const log = window.__roadsterFrameLog || []
      const last = log[log.length - 1] || null
      const landed = log.some((frame) => frame.event === 'land' || frame.event === 'recover')
      const shots = {
        turn: log.some((frame) => frame.mode === 'ground' && frame.z > 30 && Math.abs(Math.atan2(frame.vx, -frame.vz)) > 0.35),
        coast: log.some((frame) => frame.mode === 'ground' && frame.z > 42 && frame.vz < -8 && log.some((earlier) => earlier.vz > 2)),
        'air-enter': log.some((frame) => frame.mode === 'air'),
        thrust: log.some((frame) => frame.mode === 'air' && frame.thrust && frame.y > 28),
        land: landed,
      }
      return {
        frames: log.length,
        mode: last?.mode ?? null,
        y: last?.y ?? 0,
        vy: last?.vy ?? 0,
        event: last?.event ?? null,
        landed,
        shots,
        canvas: document.querySelector('canvas')?.width ?? 0,
        hidden: document.hidden,
      }
    })()`,
    returnByValue: true,
  })
  return result.result?.value ?? { frames: 0, y: 0, vy: 0, mode: null, shots: {}, landed: false }
}

async function readLog(page) {
  const count = await page('Runtime.evaluate', {
    expression: '(window.__roadsterFrameLog || []).length',
    returnByValue: true,
  })
  const total = count.result?.value ?? 0
  const chunks = await Promise.all(Array.from({ length: Math.ceil(total / 400) }, (_, index) => index).map(async (index) => {
    const result = await page('Runtime.evaluate', {
      expression: `JSON.stringify((window.__roadsterFrameLog || []).slice(${index * 400}, ${(index + 1) * 400}).map((frame) => ({
        perf: frame.perf, mode: frame.mode, event: frame.event, x: frame.x, y: frame.y, z: frame.z,
        vx: frame.vx, vy: frame.vy, vz: frame.vz, yaw: frame.yaw, screenX: frame.screenX, screenY: frame.screenY,
        bodyInInset: frame.bodyInInset, thrust: frame.thrust, camX: frame.camX, camY: frame.camY, camZ: frame.camZ,
        lookX: frame.lookX, lookY: frame.lookY, lookZ: frame.lookZ
      })))`,
      returnByValue: true,
    })
    return JSON.parse(result.result?.value || '[]')
  }))
  return chunks.flat()
}

async function saveShot(page, file) {
  const shot = await page('Page.captureScreenshot', { format: 'png' })
  await mkdir(artifacts, { recursive: true })
  await writeFile(file, Buffer.from(shot.data, 'base64'))
}

function openSocket(url) {
  const ws = new WebSocket(url)
  const pending = new Map()
  let seq = 0
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    const waiter = pending.get(message.id)
    if (!waiter) return
    pending.delete(message.id)
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)))
    else waiter.resolve(message.result)
  })
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => {
      resolve({
        send(method, params = {}, sessionId) {
          const id = ++seq
          const message = { id, method, params }
          if (sessionId) message.sessionId = sessionId
          ws.send(JSON.stringify(message))
          return new Promise((done, fail) => {
            const timer = setTimeout(() => {
              pending.delete(id)
              fail(new Error(`调试协议超时: ${method}`))
            }, 15000)
            pending.set(id, {
              resolve: (value) => {
                clearTimeout(timer)
                done(value)
              },
              reject: (error) => {
                clearTimeout(timer)
                fail(error)
              },
            })
          })
        },
        close() {
          ws.close()
        },
      })
    })
    ws.addEventListener('error', () => reject(new Error('调试连接失败')))
  })
}

function waitForHttp(url) {
  return waitFor(() => fetch(url).then((response) => {
    if (!response.ok) throw new Error(String(response.status))
    return true
  }))
}

function waitForJson(url) {
  return waitFor(() => getJson(url))
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      let body = ''
      response.on('data', (chunk) => {
        body += chunk
      })
      response.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch (error) {
          reject(error)
        }
      })
    }).on('error', reject)
  })
}

async function waitFor(read) {
  const started = Date.now()
  let reason = '超时'
  while (Date.now() - started < 20000) {
    try {
      return await read()
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error)
      await sleep(200)
    }
  }
  throw new Error(reason)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

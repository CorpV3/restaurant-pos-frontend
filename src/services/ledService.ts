/**
 * ledService — controls the Citaq H10-3 status indicator LEDs.
 *
 * Colors:
 *   Red         = error / internet offline
 *   Blue        = payment success (2 seconds then off)
 *   Red + Blue  = new order arrived (flashing)
 *   Off         = idle
 *
 * On non-Android platforms all calls are silent no-ops.
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import { appLog } from './appLogger'

interface LedPlugin {
  setLed(options: { red: boolean; blue: boolean }): Promise<void>
}

const LedNative = registerPlugin<LedPlugin>('Led')

function isAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

async function setLed(red: boolean, blue: boolean): Promise<void> {
  if (!isAndroid()) return
  try {
    await LedNative.setLed({ red, blue })
  } catch (e: any) {
    appLog.warn(`LED setLed(${red},${blue}) failed: ${e?.message ?? e}`)
  }
}

type LedState = 'idle' | 'new_order' | 'payment' | 'error'

let flashTimer: ReturnType<typeof setInterval> | null = null
let offTimer: ReturnType<typeof setTimeout> | null = null
let currentState: LedState = 'idle'
let flashOn = true

function clearTimers() {
  if (flashTimer) { clearInterval(flashTimer); flashTimer = null }
  if (offTimer)   { clearTimeout(offTimer);   offTimer   = null }
}

export const ledService = {
  /** New order arrived — flash red+blue until acknowledgeAlert() is called */
  async newOrderAlert(): Promise<void> {
    if (currentState === 'error') return // error takes priority
    if (currentState === 'new_order') return // already flashing, no-op
    clearTimers()
    currentState = 'new_order'
    flashOn = true
    await setLed(true, true)
    flashTimer = setInterval(async () => {
      flashOn = !flashOn
      await setLed(flashOn, flashOn)
    }, 400)
    appLog.info('LED: new order alert started (flash red+blue — call acknowledgeAlert() to stop)')
  },

  /** Staff tapped Acknowledge — stops the flash */
  acknowledgeAlert(): void {
    if (currentState !== 'new_order') return
    clearTimers()
    currentState = 'idle'
    setLed(false, false)
    appLog.info('LED: new order acknowledged')
  },

  /** Payment collected — blue for 2s then off */
  async paymentSuccess(): Promise<void> {
    if (currentState === 'error') return
    clearTimers()
    const prevState = currentState
    currentState = 'payment'
    await setLed(false, true)
    appLog.info('LED: payment success (blue)')
    offTimer = setTimeout(async () => {
      offTimer = null
      if (prevState === 'new_order') {
        currentState = 'idle'
        await ledService.newOrderAlert()
      } else {
        currentState = 'idle'
        await setLed(false, false)
      }
    }, 2000)
  },

  /** Internet offline/error → red steady; online → off */
  async setError(hasError: boolean): Promise<void> {
    if (hasError) {
      clearTimers()
      currentState = 'error'
      await setLed(true, false)
      appLog.info('LED: error (red)')
    } else {
      if (currentState === 'error') {
        currentState = 'idle'
        await setLed(false, false)
        appLog.info('LED: error cleared')
      }
    }
  },

  /** Turn off all LEDs */
  async off(): Promise<void> {
    clearTimers()
    currentState = 'idle'
    await setLed(false, false)
  },
}

import { registerPlugin } from '@capacitor/core'

interface SumUpPlugin {
  init(options: { apiKey: string }): Promise<void>
  checkout(options: { amount: number; currency: string; title: string }): Promise<{
    approved: boolean
    transactionCode: string
    resultCode: number
  }>
}

const SumUp = registerPlugin<SumUpPlugin>('SumUp')

export const isAndroid = () =>
  typeof window !== 'undefined' && !!(window as any).__ANDROID_CAPACITOR__

/** True when running inside the Capacitor Android app */
export const isSumUpAvailable = (): boolean => {
  try {
    // Capacitor native plugins are only available inside the APK
    return typeof (window as any).Capacitor !== 'undefined' &&
      (window as any).Capacitor?.getPlatform() === 'android'
  } catch {
    return false
  }
}

const SUMUP_API_KEY = 'sup_sk_JcHreNthZlzW54zw1MoPTChGU69Q1cEPQ' // sandbox

let initialised = false

export async function initSumUp(): Promise<void> {
  if (initialised) return
  await SumUp.init({ apiKey: SUMUP_API_KEY })
  initialised = true
}

export async function sumUpCheckout(
  amount: number,
  currency: string = 'GBP',
  title: string = 'Payment'
): Promise<{ approved: boolean; transactionCode: string }> {
  await initSumUp()
  const result = await SumUp.checkout({ amount, currency, title })
  return result
}

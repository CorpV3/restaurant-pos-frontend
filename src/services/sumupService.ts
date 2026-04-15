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

/** True when running inside the Capacitor Android app WITH the real SumUp SDK.
 *  Returns false when the stub plugin is active (SDK not bundled) so the
 *  hosted-checkout QR flow is used instead. */
export const isSumUpAvailable = (): boolean => false

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

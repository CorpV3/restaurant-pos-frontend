/**
 * Thermal Printer Service — ESC/POS over Bluetooth
 *
 * Android 6+ (API 23+): uses cordova-plugin-bluetooth-serial (Classic BT)
 * Android < 6 / Desktop: falls back to browser window.print()
 *
 * Runtime version check via @capacitor/device — no compile-time native dependency.
 * Compatible printers: any 58mm or 80mm ESC/POS Bluetooth thermal printer
 * (Sunmi, GOOJPRT, Rongta, Xprinter, Epson TM, and most generic brands)
 */

// ── ESC/POS byte constants ────────────────────────────────────────────────────
const ESC = 0x1b;
const GS  = 0x1d;
const LF  = 0x0a;

export const ESCPOS = {
  INIT:          [ESC, 0x40],           // 1B 40
  ALIGN_LEFT:    [ESC, 0x61, 0x00],     // 1B 61 00
  ALIGN_CENTER:  [ESC, 0x61, 0x01],     // 1B 61 01
  BOLD_ON:       [ESC, 0x45, 0x01],     // 1B 45 01
  BOLD_OFF:      [ESC, 0x45, 0x00],     // 1B 45 00
  DOUBLE_HEIGHT: [GS,  0x21, 0x01],     // 1D 21 01 — double height x2
  NORMAL_SIZE:   [GS,  0x21, 0x00],     // 1D 21 00 — normal size
  CUT_PAPER:     [GS,  0x56, 0x42, 0x00], // 1D 56 42 00 — Citaq partial cut (GS V B 0)
  FEED_LINE:     [LF],                  // 0A
  FEED_3:        [ESC, 0x64, 0x03],     // 1B 64 03 — feed 3 lines
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReceiptData {
  restaurantName: string;
  restaurantAddress?: string;
  orderRef: string;
  tableName: string;
  date: string;
  items: { name: string; qty: number; price: number }[];
  subtotal?: number;
  tax?: number;
  total: number;
  paymentMethod: 'cash' | 'card';
  cashReceived?: number;
  change?: number;
  currencySymbol?: string;
  footer?: string;
}

export interface BluetoothDevice {
  name: string;
  address: string;
}

// ── Receipt byte builder ──────────────────────────────────────────────────────

export function buildReceiptBytes(data: ReceiptData, paperWidth = 48): Uint8Array {
  const sym = data.currencySymbol ?? '£';
  const W = paperWidth;
  const PRICE_COL = 9; // fixed-width price column (e.g. "  £999.99")
  const rows: number[][] = [];

  const add = (...cmds: number[][]) => rows.push(...cmds);
  const charBytes = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));
  const row = (s: string) => [...charBytes(s), LF];

  /** Right-align `right` in a fixed column, pad `left` to fill remaining space */
  const padLine = (left: string, right: string) => {
    const priceStr = right.padStart(PRICE_COL);
    const nameWidth = W - PRICE_COL;
    const name = left.length > nameWidth ? left.slice(0, nameWidth - 1) + '.' : left.padEnd(nameWidth);
    return name + priceStr;
  };

  const divider = (char = '-') => row(char.repeat(W));

  const centered = (s: string) => {
    const trimmed = s.slice(0, W);
    const pad = Math.max(0, Math.floor((W - trimmed.length) / 2));
    return ' '.repeat(pad) + trimmed;
  };

  // Init
  add(ESCPOS.INIT, ESCPOS.ALIGN_CENTER);

  // Restaurant name — double height bold
  add(ESCPOS.DOUBLE_HEIGHT, ESCPOS.BOLD_ON);
  add(row(data.restaurantName.slice(0, W)));
  add(ESCPOS.NORMAL_SIZE, ESCPOS.BOLD_OFF);
  if (data.restaurantAddress) add(row(data.restaurantAddress.slice(0, W)));

  // Stars divider
  add(ESCPOS.FEED_LINE);
  add(ESCPOS.ALIGN_LEFT);
  add(divider('*'));

  // Order info — two columns
  const dateStr = data.date.slice(0, 20);
  add(row(padLine('Order: ' + data.orderRef, dateStr)));
  add(row('Table: ' + data.tableName));
  add(divider('-'));
  add(ESCPOS.FEED_LINE);

  // Column headers
  add(ESCPOS.BOLD_ON);
  add(row(padLine('ITEM', 'AMOUNT')));
  add(ESCPOS.BOLD_OFF);
  add(divider('-'));

  // Items — qty * name, right-aligned price
  for (const item of data.items) {
    const priceVal = sym + (item.qty * item.price).toFixed(2);
    const label = item.qty > 1 ? `${item.qty}x ${item.name}` : item.name;
    add(row(padLine(label, priceVal)));
  }
  add(divider('-'));

  // Totals
  if (data.tax !== undefined && data.subtotal !== undefined) {
    add(row(padLine('Subtotal', sym + data.subtotal.toFixed(2))));
    add(row(padLine('Tax (10%)', sym + data.tax.toFixed(2))));
    add(divider('-'));
  }

  add(ESCPOS.BOLD_ON);
  add(row(padLine('TOTAL', sym + data.total.toFixed(2))));
  add(ESCPOS.BOLD_OFF);
  add(row(padLine('Payment', data.paymentMethod.toUpperCase())));

  if (data.paymentMethod === 'cash' && data.cashReceived !== undefined) {
    add(row(padLine('Cash', sym + data.cashReceived.toFixed(2))));
    add(ESCPOS.BOLD_ON);
    add(row(padLine('Change', sym + (data.change ?? 0).toFixed(2))));
    add(ESCPOS.BOLD_OFF);
  }

  // Footer
  add(ESCPOS.FEED_LINE, ESCPOS.ALIGN_CENTER);
  add(row(centered(data.footer ?? 'Thank you for dining with us!')));
  add(row(centered('** CorpV3 POS **')));
  add(ESCPOS.FEED_LINE);

  // Feed + cut
  add(ESCPOS.FEED_3, ESCPOS.CUT_PAPER);

  return new Uint8Array(rows.flat());
}

import { appLog } from './appLogger'

// ── Platform helpers ──────────────────────────────────────────────────────────

function isAndroid(): boolean {
  return (
    typeof (window as any).Capacitor !== 'undefined' &&
    (window as any).Capacitor.getPlatform() === 'android'
  );
}

/** CitaqPrinter — direct @JavascriptInterface for Citaq H10-3 (Android 4.x+, bypasses Capacitor) */
function getCitaqPrinter(): any | null {
  return (window as any).CitaqPrinter ?? null;
}

/** SerialPrinterPlugin — injected native plugin for built-in serial printers (e.g. H10-3) */
function getSerialPlugin(): any | null {
  return (window as any).Capacitor?.Plugins?.SerialPrinter ?? null;
}

/** cordova-plugin-bluetooth-serial — for external Bluetooth printers */
function getBtSerial(): any | null {
  return (window as any).bluetoothSerial ?? null;
}

function promisify<T>(fn: (ok: (v: T) => void, err: (e: any) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => fn(resolve, reject));
}

// ── Printer service ───────────────────────────────────────────────────────────

class ThermalPrinterService {
  private connectedAddress: string | null = null;
  private _sdk: number | null = null;

  /** Configurable serial port path — set by PrinterSettings when user changes it */
  serialPath = '/dev/ttyS1';

  /** Android SDK level (0 on non-Android). Cached after first call. */
  async getAndroidSdk(): Promise<number> {
    if (this._sdk !== null) return this._sdk;
    if (!isAndroid()) { this._sdk = 0; return 0; }
    try {
      const mod = await (Function('m', 'return import(m)'))('@capacitor/device');
      const Device = mod.Device ?? mod.default;
      const info = await Device.getInfo();
      this._sdk = info.androidSDKVersion ?? 0;
    } catch {
      this._sdk = 0;
    }
    return this._sdk as number;
  }

  /** Returns true if the built-in SerialPrinterPlugin is available (H10-3 and similar POS) */
  hasSerialPlugin(): boolean {
    return isAndroid() && getSerialPlugin() !== null;
  }

  /** Detect available serial port paths on this device */
  async listSerialPaths(): Promise<string[]> {
    const plugin = getSerialPlugin();
    if (!plugin) return [];
    try {
      const result = await plugin.listPaths();
      return result.paths ?? [];
    } catch {
      return [];
    }
  }

  /** Whether Bluetooth printing is available (Android 6+) */
  async isBluetoothSupported(): Promise<boolean> {
    if (!isAndroid()) return true;
    const sdk = await this.getAndroidSdk();
    return sdk >= 23;
  }

  /** List paired Bluetooth devices (Android 6+ only) */
  async listDevices(): Promise<BluetoothDevice[]> {
    const bt = getBtSerial();
    if (!bt || !isAndroid()) return [];
    try {
      const devices = await promisify<any[]>((ok, err) => bt.list(ok, err));
      return (devices ?? []).map((d: any) => ({
        name: d.name ?? d.class ?? 'Unknown',
        address: d.address,
      }));
    } catch (e: any) {
      appLog.error(`listDevices error: ${e?.message ?? e}`);
      return [];
    }
  }

  /** Connect to a paired Bluetooth printer by MAC address */
  async connect(address: string): Promise<boolean> {
    const bt = getBtSerial();
    if (!bt) return false;
    try {
      await promisify<void>((ok, err) => bt.connect(address, ok, err));
      this.connectedAddress = address;
      return true;
    } catch (e: any) {
      appLog.error(`BT connect error for ${address}: ${e?.message ?? e}`);
      return false;
    }
  }

  /** Disconnect from current Bluetooth printer */
  async disconnect(): Promise<void> {
    const bt = getBtSerial();
    if (!bt || !this.connectedAddress) return;
    try {
      await promisify<void>((ok) => bt.disconnect(ok, ok));
      this.connectedAddress = null;
    } catch (e) {
      console.error('[Printer] disconnect error', e);
    }
  }

  get isConnected() {
    return this.connectedAddress !== null;
  }

  /**
   * Print a receipt.
   *
   * Routing is based on available plugins, NOT platform detection.
   * This ensures printing works even if Capacitor platform check is unreliable.
   *
   * @param printerType - 'serial' (H10-3 built-in) or 'bluetooth' (external BT)
   * @param savedAddress - Saved BT MAC address for auto-reconnect after app restart
   */
  async printReceipt(
    data: ReceiptData,
    paperWidth = 48,
    printerType: 'serial' | 'bluetooth' = 'serial',
    savedAddress: string | null = null,
  ): Promise<void> {
    const bytes = buildReceiptBytes(data, paperWidth);

    const citaq = getCitaqPrinter();
    const serialPlugin = printerType === 'serial' ? getSerialPlugin() : null;
    const bt = getBtSerial();
    const android = isAndroid();

    appLog.info(`printReceipt: type=${printerType} citaq=${!!citaq} serial=${!!serialPlugin} bt=${!!bt} android=${android} bytes=${bytes.length}`);

    // ── 0. CitaqPrinter JS interface — H10-3 direct serial (Android 4.x+) ─────
    // Works even if Capacitor is not initialized (old Android versions)
    if (citaq) {
      appLog.info('path=CitaqJSInterface → writing to serial port');
      const b64 = btoa(String.fromCharCode(...bytes));
      const ok = citaq.print(b64);
      appLog.info(`CitaqPrinter.print() returned: ${ok}`);
      if (!ok) throw new Error('CitaqPrinter.print() returned false — check /dev/ttyS1 permissions');
      appLog.info('CitaqPrinter: print success');
      return;
    }

    // ── 1. Serial: Capacitor SerialPrinterPlugin ───────────────────────────────
    if (serialPlugin) {
      appLog.info(`path=SerialPrinterPlugin → ${this.serialPath}`);
      await this.printSerial(bytes, serialPlugin);
      appLog.info('SerialPrinterPlugin: print success');
      return;
    }

    // ── 2. Bluetooth: external ESC/POS printer ────────────────────────────────
    if (bt) {
      appLog.info(`path=Bluetooth → connected=${this.connectedAddress ?? 'none'}`);
      // Auto-reconnect using saved address if not currently connected (e.g. after app restart)
      if (!this.connectedAddress && savedAddress) {
        appLog.info(`Bluetooth: reconnecting to ${savedAddress}`);
        const ok = await this.connect(savedAddress);
        if (!ok) {
          appLog.error(`Bluetooth: reconnect failed for ${savedAddress}`);
          throw new Error('Could not reconnect to Bluetooth printer — is it powered on and in range?');
        }
        appLog.info('Bluetooth: reconnect success');
      }
      if (!this.connectedAddress) {
        throw new Error('No Bluetooth printer connected. Go to Settings \u2192 Printer to connect.');
      }
      await this.printBluetooth(bytes, bt);
      appLog.info('Bluetooth: print success');
      return;
    }

    // ── 3. Desktop fallback (Windows / browser) ───────────────────────────────
    // Only use browser print dialog when no printer plugins are available at all
    if (!android) {
      appLog.warn('path=Desktop (browser print dialog) — no printer plugins found');
      this.printDesktop(data);
      return;
    }

    // Android with no printer configured — show actionable error
    appLog.error('No printer path found on Android — CitaqPrinter=null, SerialPlugin=null, BtSerial=null');
    throw new Error('No printer configured. Go to Settings \u2192 Printer to set up your printer.');
  }

  private async printSerial(bytes: Uint8Array, plugin: any): Promise<void> {
    // Convert bytes to base64 for the Java plugin
    const b64 = btoa(String.fromCharCode(...bytes));
    try {
      await plugin.print({ path: this.serialPath, data: b64 });
    } catch (e: any) {
      appLog.error(`SerialPlugin write error on ${this.serialPath}: ${e?.message ?? e}`);
      throw new Error(`Serial print failed on ${this.serialPath}: ${e?.message ?? e}`);
    }
  }

  private async printBluetooth(bytes: Uint8Array, bt: any): Promise<void> {
    if (!this.connectedAddress) {
      throw new Error('No Bluetooth printer connected. Go to Settings → Printer.');
    }
    try {
      await promisify<void>((ok, err) => bt.write(bytes.buffer, ok, err));
    } catch (e: any) {
      appLog.error(`Bluetooth write error: ${e?.message ?? e}`);
      throw new Error('Bluetooth print failed — is the printer on and connected?');
    }
  }

  private printDesktop(data: ReceiptData): void {
    const sym = data.currencySymbol ?? '£';
    const itemRows = data.items
      .map(
        (i) =>
          `<div class="row"><span>${i.qty}x ${i.name}</span><span>${sym}${(i.qty * i.price).toFixed(2)}</span></div>`
      )
      .join('');

    const html = `<html><head><style>
      body{font-family:monospace;width:280px;font-size:12px;margin:0 auto}
      .center{text-align:center} .bold{font-weight:bold}
      .row{display:flex;justify-content:space-between} hr{border:1px dashed #000}
      h2{margin:4px 0;font-size:16px}
    </style></head><body>
      <div class="center">
        <h2>${data.restaurantName}</h2>
        ${data.restaurantAddress ? `<p>${data.restaurantAddress}</p>` : ''}
      </div><hr/>
      <div class="row"><span>Order: ${data.orderRef}</span><span>${data.date}</span></div>
      <div>Table: ${data.tableName}</div><hr/>
      ${itemRows}<hr/>
      ${data.tax !== undefined ? `<div class="row"><span>Tax</span><span>${sym}${data.tax.toFixed(2)}</span></div>` : ''}
      <div class="row bold"><span>TOTAL</span><span>${sym}${data.total.toFixed(2)}</span></div>
      <div class="row"><span>Payment</span><span>${data.paymentMethod.toUpperCase()}</span></div>
      ${data.paymentMethod === 'cash' && data.cashReceived !== undefined
        ? `<div class="row"><span>Cash</span><span>${sym}${data.cashReceived.toFixed(2)}</span></div>
           <div class="row"><span>Change</span><span>${sym}${(data.change ?? 0).toFixed(2)}</span></div>`
        : ''}
      <hr/><div class="center">${data.footer ?? 'Thank you for dining with us!'}<br/>Powered by CorpV3 POS</div>
    </body></html>`;

    const win = window.open('', '_blank', 'width=320,height=600');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      win.print();
      win.close();
    }
  }
}

export const thermalPrinter = new ThermalPrinterService();

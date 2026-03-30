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
const DC2 = 0x12;
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

/**
 * Build ESC/POS print density command (DC2 # n).
 * Supported by most 58mm/80mm Bluetooth thermal printers (Rongta, GOOJPRT, Xprinter clones).
 * density: 0 = lightest, 7 = darkest. Default 3.
 * Maps to vendor byte: 0→0x00, 7→0x07 (some use 0-255; we send 0x00..0x07).
 */
export function buildDensityCmd(density: number): number[] {
  const n = Math.max(0, Math.min(7, Math.round(density)));
  // DC2 # n — print density for most cheap thermal printers
  return [DC2, 0x23, n];
}

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
  discount?: number;
  discountReason?: string;
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

export interface LabelData {
  itemName: string;
  quantity: number;
  tableRef: string;   // e.g. "Table 5" or "Takeaway"
  orderRef: string;   // short order ID
  preparedAt: string; // formatted time string
  restaurantName?: string;
}

export interface PrepLabelData {
  itemName: string;
  itemCode: string;      // e.g. "CHK-2803-001"
  preparedAt: string;    // "30/03/2026 14:25"
  useBy: string;         // "31/03/2026 14:25"
  allergens: string[];   // e.g. ["nuts", "dairy"]
  preparedBy?: string;   // staff name
  restaurantName?: string;
}

export function buildPrepLabelBytes(label: PrepLabelData, paperWidth = 32): Uint8Array {
  const W = paperWidth;
  const rows: number[][] = [];
  const add = (...cmds: number[][]) => rows.push(...cmds);
  const charBytes = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));
  const row = (s: string) => [...charBytes(s), LF];
  const centered = (s: string) => {
    const t = s.slice(0, W);
    const pad = Math.max(0, Math.floor((W - t.length) / 2));
    return ' '.repeat(pad) + t;
  };
  const leftRight = (left: string, right: string) => {
    const l = left.slice(0, W - right.length - 1);
    return l + ' '.repeat(W - l.length - right.length) + right;
  };

  add(ESCPOS.INIT, ESCPOS.ALIGN_CENTER);

  // Restaurant name
  if (label.restaurantName) {
    add(row(centered(label.restaurantName.slice(0, W))));
  }

  // Item name — bold double height
  add(ESCPOS.DOUBLE_HEIGHT, ESCPOS.BOLD_ON);
  add(row(centered(label.itemName.slice(0, W))));
  add(ESCPOS.NORMAL_SIZE, ESCPOS.BOLD_OFF);

  // Item code
  add(ESCPOS.BOLD_ON);
  add(row(centered(label.itemCode)));
  add(ESCPOS.BOLD_OFF);

  add(ESCPOS.ALIGN_LEFT);
  const divider = (c = '-') => row(c.repeat(W));
  add(divider());

  // Prepared at
  add(row(leftRight('Prep:', label.preparedAt)));
  // Use by — bold
  add(ESCPOS.BOLD_ON);
  add(row(leftRight('Use By:', label.useBy)));
  add(ESCPOS.BOLD_OFF);

  // Allergens
  if (label.allergens.length > 0) {
    add(divider());
    const allergenStr = ('Allergens: ' + label.allergens.join(', ')).slice(0, W);
    // Word wrap if too long
    if (allergenStr.length <= W) {
      add(row(allergenStr));
    } else {
      add(row('Allergens:'));
      const a = label.allergens.join(', ').slice(0, W * 2);
      for (let i = 0; i < a.length; i += W) {
        add(row(a.slice(i, i + W)));
      }
    }
  }

  // Prepared by
  if (label.preparedBy) {
    add(divider());
    add(row(`By: ${label.preparedBy}`.slice(0, W)));
  }

  add(ESCPOS.FEED_LINE);
  add(ESCPOS.FEED_3, ESCPOS.CUT_PAPER);

  return new Uint8Array(rows.flat());
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
    add(row(padLine('Tax (20%)', sym + data.tax.toFixed(2))));
    if (data.discount && data.discount > 0) {
      const label = data.discountReason ? `Discount (${data.discountReason.slice(0, 12)})` : 'Discount';
      add(row(padLine(label, '-' + sym + data.discount.toFixed(2))));
    }
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

/**
 * Build ESC/POS bytes for a compact food preparation label (one label per item).
 * Designed for 58mm (32-char) paper but works on 80mm too.
 */
export function buildLabelBytes(label: LabelData, paperWidth = 32): Uint8Array {
  const W = paperWidth;
  const rows: number[][] = [];
  const add = (...cmds: number[][]) => rows.push(...cmds);
  const charBytes = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));
  const row = (s: string) => [...charBytes(s), LF];
  const centered = (s: string) => {
    const trimmed = s.slice(0, W);
    const pad = Math.max(0, Math.floor((W - trimmed.length) / 2));
    return ' '.repeat(pad) + trimmed;
  };

  add(ESCPOS.INIT, ESCPOS.ALIGN_CENTER);

  // Restaurant name (small)
  if (label.restaurantName) {
    add(row(centered(label.restaurantName.slice(0, W))));
  }

  // Item name — double height bold, truncated to W chars
  add(ESCPOS.DOUBLE_HEIGHT, ESCPOS.BOLD_ON);
  const name = label.itemName.slice(0, W);
  add(row(centered(name)));
  add(ESCPOS.NORMAL_SIZE, ESCPOS.BOLD_OFF);

  // Qty line
  if (label.quantity > 1) {
    add(ESCPOS.BOLD_ON);
    add(row(centered(`Qty: ${label.quantity}`)));
    add(ESCPOS.BOLD_OFF);
  }

  // Table + order ref
  add(row(centered(`${label.tableRef}  #${label.orderRef}`)));
  // Prepared time
  add(row(centered(label.preparedAt)));

  add(ESCPOS.FEED_LINE);
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
    printDensity = 3,
  ): Promise<void> {
    const receiptBytes = buildReceiptBytes(data, paperWidth);
    // Prepend density command before ESC/POS INIT so it takes effect for this print job
    const densityCmd = new Uint8Array(buildDensityCmd(printDensity));
    const bytes = new Uint8Array(densityCmd.length + receiptBytes.length);
    bytes.set(densityCmd, 0);
    bytes.set(receiptBytes, densityCmd.length);

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
    if (bt && printerType === 'bluetooth') {
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

    // No printer path found
    appLog.error(`No printer path found — type=${printerType} citaq=${!!citaq} serial=${!!serialPlugin} bt=${!!bt} android=${android}`);
    if (printerType === 'serial') {
      throw new Error('Serial printer not available — CitaqPrinter bridge missing. Please reinstall the app.');
    }
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

  /**
   * Print a single food preparation label.
   * Uses the same printer path logic as printReceipt().
   */
  async printLabel(
    label: LabelData,
    paperWidth = 32,
    printerType: 'serial' | 'bluetooth' = 'serial',
    savedAddress: string | null = null,
    printDensity = 3,
  ): Promise<void> {
    const labelBytes = buildLabelBytes(label, paperWidth);
    const densityCmd = new Uint8Array(buildDensityCmd(printDensity));
    const bytes = new Uint8Array(densityCmd.length + labelBytes.length);
    bytes.set(densityCmd, 0);
    bytes.set(labelBytes, densityCmd.length);

    const citaq = getCitaqPrinter();
    const serialPlugin = printerType === 'serial' ? getSerialPlugin() : null;
    const bt = getBtSerial();
    const android = isAndroid();

    appLog.info(`printLabel: "${label.itemName}" qty=${label.quantity} type=${printerType}`);

    if (citaq) {
      const b64 = btoa(String.fromCharCode(...bytes));
      citaq.print(b64);
      return;
    }
    if (serialPlugin) {
      await this.printSerial(bytes, serialPlugin);
      return;
    }
    if (bt && printerType === 'bluetooth') {
      if (!this.connectedAddress && savedAddress) {
        await this.connect(savedAddress);
      }
      if (!this.connectedAddress) throw new Error('No Bluetooth printer connected.');
      await this.printBluetooth(bytes, bt);
      return;
    }
    if (!android) {
      // Desktop: just log — labels aren't useful in a browser print dialog
      appLog.warn('Label print skipped on desktop (no printer plugin)');
      return;
    }
    throw new Error('No printer available for label printing.');
  }

  /**
   * Print one label per unique item in an order.
   * Each unique item gets its own label cut.
   */
  async printLabels(
    items: { name: string; qty: number }[],
    tableRef: string,
    orderRef: string,
    restaurantName: string,
    paperWidth = 32,
    printerType: 'serial' | 'bluetooth' = 'serial',
    savedAddress: string | null = null,
    printDensity = 3,
  ): Promise<void> {
    const preparedAt = new Date().toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: '2-digit' });
    for (const item of items) {
      await this.printLabel(
        { itemName: item.name, quantity: item.qty, tableRef, orderRef, preparedAt, restaurantName },
        paperWidth, printerType, savedAddress, printDensity,
      );
    }
  }

  async printPrepLabel(
    label: PrepLabelData,
    copies = 1,
    paperWidth = 32,
    printerType: 'serial' | 'bluetooth' = 'serial',
    savedAddress: string | null = null,
    printDensity = 3,
  ): Promise<void> {
    const labelBytes = buildPrepLabelBytes(label, paperWidth);
    const densityCmd = new Uint8Array(buildDensityCmd(printDensity));
    const bytes = new Uint8Array(densityCmd.length + labelBytes.length);
    bytes.set(densityCmd, 0);
    bytes.set(labelBytes, densityCmd.length);

    const citaq = getCitaqPrinter();
    const serialPlugin = printerType === 'serial' ? getSerialPlugin() : null;
    const bt = getBtSerial();
    const android = isAndroid();

    appLog.info(`printPrepLabel: "${label.itemName}" code=${label.itemCode} copies=${copies}`);

    for (let i = 0; i < copies; i++) {
      if (citaq) {
        const b64 = btoa(String.fromCharCode(...bytes));
        citaq.print(b64);
      } else if (android && serialPlugin && savedAddress) {
        await serialPlugin.openSerial({ devicePath: savedAddress, baudRate: 9600 });
        await serialPlugin.writeSerial({ data: btoa(String.fromCharCode(...bytes)) });
      } else if (android && bt && savedAddress) {
        await bt.connect(savedAddress);
        await bt.write({ data: Array.from(bytes) });
      } else if (!android && printerType === 'serial' && serialPlugin && savedAddress) {
        await serialPlugin.openSerial({ devicePath: savedAddress, baudRate: 9600 });
        await serialPlugin.writeSerial({ data: btoa(String.fromCharCode(...bytes)) });
      } else {
        throw new Error('No printer configured');
      }
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
      ${data.discount && data.discount > 0 ? `<div class="row"><span>Discount${data.discountReason ? ` (${data.discountReason})` : ''}</span><span>-${sym}${data.discount.toFixed(2)}</span></div>` : ''}
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

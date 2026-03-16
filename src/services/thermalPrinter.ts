/**
 * Thermal Printer Service — ESC/POS over Bluetooth
 *
 * Android: uses @e-is/capacitor-bluetooth-serial (Classic Bluetooth, not BLE)
 * Desktop: falls back to browser window.print()
 *
 * Compatible printers: any 58mm or 80mm ESC/POS Bluetooth thermal printer
 * (Sunmi, GOOJPRT, Rongta, Xprinter, Epson TM, and most generic brands)
 */

// ── ESC/POS byte constants ────────────────────────────────────────────────────
const ESC = 0x1b;
const GS  = 0x1d;
const LF  = 0x0a;

export const ESCPOS = {
  INIT:          [ESC, 0x40],
  ALIGN_LEFT:    [ESC, 0x61, 0x00],
  ALIGN_CENTER:  [ESC, 0x61, 0x01],
  BOLD_ON:       [ESC, 0x45, 0x01],
  BOLD_OFF:      [ESC, 0x45, 0x00],
  DOUBLE_HEIGHT: [ESC, 0x21, 0x10],
  NORMAL_SIZE:   [ESC, 0x21, 0x00],
  CUT_PAPER:     [GS,  0x56, 0x41, 0x10],
  FEED_LINE:     [LF],
  FEED_3:        [ESC, 0x64, 0x03],
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

export function buildReceiptBytes(data: ReceiptData, paperWidth = 32): Uint8Array {
  const sym = data.currencySymbol ?? '£';
  const W = paperWidth;
  const rows: number[][] = [];

  const add = (...cmds: number[][]) => rows.push(...cmds);
  const charBytes = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));
  const row = (s: string) => [...charBytes(s), LF];

  const pad = (left: string, right: string) => {
    const gap = W - left.length - right.length;
    return left + ' '.repeat(Math.max(1, gap)) + right;
  };

  // Init + center
  add(ESCPOS.INIT, ESCPOS.ALIGN_CENTER);

  // Restaurant name
  add(ESCPOS.DOUBLE_HEIGHT, ESCPOS.BOLD_ON);
  add(row(data.restaurantName.slice(0, W)));
  add(ESCPOS.NORMAL_SIZE, ESCPOS.BOLD_OFF);
  if (data.restaurantAddress) add(row(data.restaurantAddress.slice(0, W)));
  add(ESCPOS.FEED_LINE);

  // Order header
  add(ESCPOS.ALIGN_LEFT);
  add(row('-'.repeat(W)));
  add(row(pad('Order: ' + data.orderRef, data.date)));
  add(row('Table: ' + data.tableName));
  add(row('-'.repeat(W)));
  add(ESCPOS.FEED_LINE);

  // Items
  for (const item of data.items) {
    const label = item.qty > 1 ? `${item.qty}x ${item.name}` : item.name;
    const truncated = label.length > W - 7 ? label.slice(0, W - 10) + '...' : label;
    add(row(pad(truncated, sym + (item.qty * item.price).toFixed(2))));
  }
  add(row('-'.repeat(W)));

  // Totals
  if (data.tax !== undefined && data.subtotal !== undefined) {
    add(row(pad('Subtotal', sym + data.subtotal.toFixed(2))));
    add(row(pad('Tax', sym + data.tax.toFixed(2))));
  }

  add(ESCPOS.BOLD_ON);
  add(row(pad('TOTAL', sym + data.total.toFixed(2))));
  add(ESCPOS.BOLD_OFF);
  add(row(pad('Payment', data.paymentMethod.toUpperCase())));

  if (data.paymentMethod === 'cash' && data.cashReceived !== undefined) {
    add(row(pad('Cash', sym + data.cashReceived.toFixed(2))));
    add(row(pad('Change', sym + (data.change ?? 0).toFixed(2))));
  }

  // Footer
  add(ESCPOS.FEED_LINE, ESCPOS.ALIGN_CENTER);
  add(row(data.footer ?? 'Thank you for dining with us!'));
  add(row('Powered by CorpV3 POS'));

  // Feed + cut
  add(ESCPOS.FEED_3, ESCPOS.CUT_PAPER);

  return new Uint8Array(rows.flat());
}

// ── Platform detection ────────────────────────────────────────────────────────

function isAndroid(): boolean {
  return (
    typeof (window as any).Capacitor !== 'undefined' &&
    (window as any).Capacitor.getPlatform() === 'android'
  );
}

// ── Printer service ───────────────────────────────────────────────────────────

class ThermalPrinterService {
  private plugin: any = null;
  private connectedAddress: string | null = null;

  private async getPlugin() {
    if (this.plugin) return this.plugin;
    if (!isAndroid()) return null;
    try {
      // @e-is/capacitor-bluetooth-serial — classic BT serial, supports write()
      const mod = await import('@e-is/capacitor-bluetooth-serial');
      this.plugin = mod.BluetoothSerial ?? mod.default;
      return this.plugin;
    } catch {
      console.warn('[Printer] @e-is/capacitor-bluetooth-serial not available');
      return null;
    }
  }

  /** List paired Bluetooth devices (Android only) */
  async listDevices(): Promise<BluetoothDevice[]> {
    const plugin = await this.getPlugin();
    if (!plugin) return [];
    try {
      const result = await plugin.scan();
      return (result.devices ?? []).map((d: any) => ({ name: d.name, address: d.address }));
    } catch (e) {
      console.error('[Printer] listDevices error', e);
      return [];
    }
  }

  /** Connect to a paired Bluetooth printer by MAC address */
  async connect(address: string): Promise<boolean> {
    const plugin = await this.getPlugin();
    if (!plugin) return false;
    try {
      await plugin.connect({ address });
      this.connectedAddress = address;
      return true;
    } catch (e) {
      console.error('[Printer] connect error', e);
      return false;
    }
  }

  /** Disconnect from current printer */
  async disconnect(): Promise<void> {
    const plugin = await this.getPlugin();
    if (!plugin || !this.connectedAddress) return;
    try {
      await plugin.disconnect({ address: this.connectedAddress });
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
   * Android: sends ESC/POS bytes over Bluetooth serial
   * Desktop: opens browser print dialog
   */
  async printReceipt(data: ReceiptData, paperWidth = 32): Promise<void> {
    if (isAndroid()) {
      await this.printAndroid(data, paperWidth);
    } else {
      this.printDesktop(data);
    }
  }

  private async printAndroid(data: ReceiptData, paperWidth: number): Promise<void> {
    const plugin = await this.getPlugin();
    if (!plugin || !this.connectedAddress) {
      throw new Error('No printer connected. Go to Settings → Printer to connect.');
    }

    const bytes = buildReceiptBytes(data, paperWidth);

    // @e-is/capacitor-bluetooth-serial write() expects base64 string in `value`
    const b64 = btoa(String.fromCharCode(...bytes));
    try {
      await plugin.write({ address: this.connectedAddress, value: b64 });
    } catch (e) {
      console.error('[Printer] write error', e);
      throw new Error('Print failed — is the printer on and connected?');
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

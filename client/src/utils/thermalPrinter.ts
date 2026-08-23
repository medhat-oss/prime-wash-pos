/**
 * Prime Wash POS - ESC/POS & High-Fidelity Thermal Receipt Printing Engine
 * Supports standard 80mm and 58mm roll layouts via isolated browser print iframe
 * and direct raw ESC/POS byte buffers for Web Bluetooth / Web Serial printers.
 */

import { Order } from '../types/index.js';
import { formatEGP, formatDateTime } from './formatters.js';

export interface ThermalPrintOptions {
  paperWidth?: '80mm' | '58mm';
  shopName?: string;
  shopSubtitle?: string;
  shopPhone?: string;
  taxNumber?: string;
  cashierName?: string;
  cutPaper?: boolean;
  openDrawer?: boolean;
  showQrCode?: boolean;
  thankYouNote?: string;
}

const DEFAULT_OPTIONS: ThermalPrintOptions = {
  paperWidth: '80mm',
  shopName: 'مغسلة برايم واش (PRIME WASH)',
  shopSubtitle: 'خدمات غسيل وتلميع وحماية المركبات الذكية',
  shopPhone: '01000000000',
  taxNumber: '100-234-567',
  cutPaper: true,
  openDrawer: false,
  showQrCode: true,
  thankYouNote: 'شكراً لزيارتكم ونسعد بخدمتكم دائماً — نسعى لتقديم أعلى معايير العناية بسيارتك',
};

/**
 * Builds printable HTML document for 80mm / 58mm thermal roll width
 */
export const buildThermalReceiptHtml = (
  order: Order,
  options: ThermalPrintOptions = {}
): string => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const is58mm = opts.paperWidth === '58mm';
  const widthMm = is58mm ? '58mm' : '80mm';
  const contentWidth = is58mm ? '48mm' : '72mm';

  const paymentLabels: Record<string, string> = {
    cash: 'نقدي (كاش)',
    card: 'بطاقة ائتمان / فيزا (Card)',
    transfer: 'محفظة إلكترونية / تحويل بنكي',
    split: 'دفع مجزأ',
  };

  const qrValue =
    order.eta_share_url ||
    (order.eta_uuid
      ? `https://invoicing.eta.gov.eg/receipts/search/${order.eta_uuid}`
      : `PRIME-WASH-POS-ORDER:${order.order_code}`);

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>إيصال حراري - ${order.order_code}</title>
  <style>
    @page {
      size: ${widthMm} auto;
      margin: 0mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: 'Courier New', Courier, monospace, 'Segoe UI', Tahoma, sans-serif;
      font-size: ${is58mm ? '10px' : '12px'};
      line-height: 1.35;
      color: #000;
      background: #FFF;
      width: ${contentWidth};
      margin: 0 auto;
      padding: 6px 2px 14px 2px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    .font-bold { font-weight: bold; }
    .font-black { font-weight: 900; }
    
    .divider {
      border-top: 1px dashed #000;
      margin: 5px 0;
    }
    .double-divider {
      border-top: 2px dashed #000;
      margin: 6px 0;
    }
    
    .row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin: 2px 0;
    }
    
    .header-title {
      font-size: ${is58mm ? '13px' : '15px'};
      font-weight: 900;
      letter-spacing: 0.5px;
    }
    .header-subtitle {
      font-size: ${is58mm ? '8px' : '10px'};
      color: #333;
      margin-top: 1px;
    }
    
    .badge {
      display: inline-block;
      padding: 2px 6px;
      background: #EEE;
      border: 1px solid #000;
      font-weight: bold;
      border-radius: 4px;
      font-size: ${is58mm ? '10px' : '12px'};
    }

    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 4px 0;
    }
    .items-table th {
      border-bottom: 1px solid #000;
      padding: 3px 0;
      font-size: ${is58mm ? '9px' : '11px'};
    }
    .items-table td {
      padding: 4px 0;
    }

    .total-banner {
      font-size: ${is58mm ? '13px' : '16px'};
      font-weight: 900;
      border: 1.5px solid #000;
      padding: 4px 6px;
      margin: 6px 0;
      text-align: center;
      background: #F9F9F9;
    }

    .qr-container {
      text-align: center;
      margin: 8px auto 4px auto;
    }
    
    .footer-note {
      font-size: ${is58mm ? '8px' : '10px'};
      text-align: center;
      color: #333;
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="text-center">
    <div class="header-title">${opts.shopName}</div>
    <div class="header-subtitle">${opts.shopSubtitle}</div>
    <div style="font-size: 9px; margin-top: 2px;">س.ت / ر.ض: ${opts.taxNumber}</div>
    ${opts.shopPhone ? `<div style="font-size: 9px;">هاتف: ${opts.shopPhone}</div>` : ''}
  </div>

  <div class="double-divider"></div>

  <!-- Order & Vehicle Details -->
  <div class="row">
    <span>رقم الإيصال:</span>
    <span class="font-bold">${order.order_code}</span>
  </div>
  <div class="row">
    <span>التاريخ والوقت:</span>
    <span>${formatDateTime(order.created_at)}</span>
  </div>
  ${order.car_plate ? `
  <div class="row" style="margin: 4px 0;">
    <span>رقم اللوحة:</span>
    <span class="badge">${order.car_plate}</span>
  </div>` : ''}
  ${order.car_type ? `
  <div class="row">
    <span>نوع المركبة:</span>
    <span>${order.car_type}</span>
  </div>` : ''}
  ${order.customer_name ? `
  <div class="row">
    <span>العميل:</span>
    <span>${order.customer_name}</span>
  </div>` : ''}
  ${order.assigned_employee_name ? `
  <div class="row">
    <span>الفني المسؤول:</span>
    <span>${order.assigned_employee_name}</span>
  </div>` : ''}

  <div class="divider"></div>

  <!-- Items Table -->
  <table class="items-table">
    <thead>
      <tr>
        <th class="text-right">الخدمة المطلوبة</th>
        <th class="text-left">المبلغ</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <div class="font-bold">${order.service_name || 'خدمة غسيل سيارة'}</div>
          ${order.service_egs_code ? `<div style="font-size: 8px; color: #555;">كود: ${order.service_egs_code}</div>` : ''}
        </td>
        <td class="text-left font-bold">${formatEGP(order.total_amount)}</td>
      </tr>
    </tbody>
  </table>

  <div class="divider"></div>

  <!-- Financial Breakdown -->
  <div class="row">
    <span>المبلغ قبل الضريبة:</span>
    <span>${formatEGP(order.subtotal)}</span>
  </div>
  <div class="row">
    <span>ضريبة القيمة المضافة T1 (14%):</span>
    <span>${formatEGP(order.tax_amount)}</span>
  </div>

  <div class="total-banner">
    الإجمالي: ${formatEGP(order.total_amount)}
  </div>

  <div class="row" style="font-size: 10px;">
    <span>طريقة السداد:</span>
    <span class="font-bold">${paymentLabels[order.payment_method] || order.payment_method}</span>
  </div>

  <!-- ETA Approval Badge if present -->
  ${order.eta_uuid ? `
  <div class="divider"></div>
  <div style="font-size: 8.5px; text-align: center; background: #F0FDF4; border: 1px solid #16A34A; padding: 3px; border-radius: 4px; margin: 4px 0;">
    <div class="font-bold" style="color: #15803D;">إيصال معتمد بمصلحة الضرائب المصرية (ETA)</div>
    <div style="font-family: monospace; word-break: break-all; margin-top: 1px;">UUID: ${order.eta_uuid}</div>
  </div>` : ''}

  <!-- QR Code Section -->
  ${opts.showQrCode ? `
  <div class="qr-container">
    <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(qrValue)}" alt="QR Code" width="80" height="80" style="display: block; margin: 0 auto;" />
    <div style="font-size: 8px; color: #555; margin-top: 2px;">امسح الرمز للتحقق من الفاتورة الإلكترونية</div>
  </div>` : ''}

  <div class="divider"></div>

  <!-- Footer -->
  <div class="footer-note">
    ${opts.thankYouNote}
  </div>
  <div class="text-center" style="font-size: 8px; color: #777; margin-top: 4px;">
    نظام برايم واش الذكي • POS LIVE
  </div>
</body>
</html>`;
};

/**
 * Print receipt using an isolated hidden print iframe
 */
export const printThermalTicket = (
  order: Order,
  options: ThermalPrintOptions = {}
): Promise<boolean> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      resolve(false);
      return;
    }

    const htmlContent = buildThermalReceiptHtml(order, options);

    // Remove existing print iframe if any
    const existingIframe = document.getElementById('thermal-print-iframe');
    if (existingIframe) {
      existingIframe.remove();
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'thermal-print-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';

    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) {
      resolve(false);
      return;
    }

    doc.open();
    doc.write(htmlContent);
    doc.close();

    iframe.onload = () => {
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          resolve(true);
        } catch {
          window.print();
          resolve(true);
        }
      }, 250);
    };
  });
};

/**
 * ESC/POS Binary Byte Sequence Command Generator
 * Used for direct Web Serial / Web Bluetooth ESC/POS raw thermal printers
 */
export const generateEscPosBuffer = (
  order: Order,
  options: ThermalPrintOptions = {}
): Uint8Array => {
  const bytes: number[] = [];

  const addBytes = (...b: number[]) => bytes.push(...b);
  const addString = (str: string) => {
    // UTF-8 encoding for thermal text
    const encoder = new TextEncoder();
    const encoded = encoder.encode(str);
    for (let i = 0; i < encoded.length; i++) {
      bytes.push(encoded[i]);
    }
  };

  // 1. Initialize Printer (ESC @)
  addBytes(0x1b, 0x40);

  // 2. Select Character Code Table: UTF-8 / Arabic Windows-1256 support
  addBytes(0x1b, 0x74, 0x16);

  // 3. Center Align (ESC a 1)
  addBytes(0x1b, 0x61, 0x01);

  // 4. Double Height & Width for Header (ESC ! 0x30)
  addBytes(0x1b, 0x21, 0x30);
  addString(`${options.shopName || 'PRIME WASH'}\n`);

  // Reset Font to Normal (ESC ! 0x00)
  addBytes(0x1b, 0x21, 0x00);
  addString(`${options.shopSubtitle || 'CAR WASH & DETAILING'}\n`);
  addString(`Tax: ${options.taxNumber || '100-234-567'}\n`);
  addString('--------------------------------\n');

  // 5. Left Align Order Details (ESC a 0)
  addBytes(0x1b, 0x61, 0x00);
  addString(`Receipt No : ${order.order_code}\n`);
  addString(`Date/Time  : ${formatDateTime(order.created_at)}\n`);
  if (order.car_plate) {
    addString(`Plate No   : ${order.car_plate}\n`);
  }
  if (order.car_type) {
    addString(`Car Type   : ${order.car_type}\n`);
  }
  if (order.assigned_employee_name) {
    addString(`Technician : ${order.assigned_employee_name}\n`);
  }
  addString('--------------------------------\n');

  // 6. Service Items & Financials
  addString(`Service    : ${order.service_name || 'Wash Package'}\n`);
  addString(`Subtotal   : ${formatEGP(order.subtotal)} EGP\n`);
  addString(`VAT (14%)  : ${formatEGP(order.tax_amount)} EGP\n`);

  // Bold Total (ESC E 1)
  addBytes(0x1b, 0x45, 0x01);
  addBytes(0x1b, 0x21, 0x10); // Double height
  addString(`TOTAL      : ${formatEGP(order.total_amount)} EGP\n`);
  addBytes(0x1b, 0x45, 0x00);
  addBytes(0x1b, 0x21, 0x00);

  addString(`Payment    : ${order.payment_method.toUpperCase()}\n`);
  addString('================================\n');

  // 7. Footer
  addBytes(0x1b, 0x61, 0x01); // Center
  addString('Thank You For Your Visit!\n');
  addString('Prime Wash POS System\n\n\n');

  // 8. Open Cash Drawer (ESC p 0 25 250) if requested
  if (options.openDrawer) {
    addBytes(0x1b, 0x70, 0x00, 0x19, 0xfa);
  }

  // 9. Cut Paper (GS V 66 0: Feed 3 lines & Partial Cut)
  if (options.cutPaper !== false) {
    addBytes(0x1d, 0x56, 0x42, 0x00);
  }

  return new Uint8Array(bytes);
};

/**
 * Feature detector for direct Web Serial / Web Bluetooth printer connectivity
 */
export const isDirectPrinterSupported = (): { serial: boolean; bluetooth: boolean } => {
  if (typeof navigator === 'undefined') {
    return { serial: false, bluetooth: false };
  }
  return {
    serial: 'serial' in navigator,
    bluetooth: 'bluetooth' in navigator,
  };
};

/**
 * Direct ESC/POS printing via Web Serial (USB/COM)
 */
export const printViaWebSerial = async (
  order: Order,
  options: ThermalPrintOptions = {}
): Promise<boolean> => {
  if (typeof navigator === 'undefined' || !('serial' in navigator)) {
    throw new Error('Web Serial API is not supported in this browser. Please use Chrome/Edge or standard print.');
  }

  try {
    const port = await (navigator as any).serial.requestPort();
    await port.open({ baudRate: 9600 });

    const writer = port.writable.getWriter();
    const buffer = generateEscPosBuffer(order, options);

    await writer.write(buffer);
    writer.releaseLock();
    await port.close();
    return true;
  } catch (err: any) {
    throw new Error(`Serial Printer Error: ${err.message}`);
  }
};

/**
 * Direct ESC/POS printing via Web Bluetooth
 */
export const printViaWebBluetooth = async (
  order: Order,
  options: ThermalPrintOptions = {}
): Promise<boolean> => {
  if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
    throw new Error('Web Bluetooth API is not supported in this browser. Please use standard print.');
  }

  try {
    const device = await (navigator as any).bluetooth.requestDevice({
      filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'],
    });

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
    const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');

    const buffer = generateEscPosBuffer(order, options);
    await characteristic.writeValue(buffer);
    await device.gatt.disconnect();
    return true;
  } catch (err: any) {
    throw new Error(`Bluetooth Printer Error: ${err.message}`);
  }
};

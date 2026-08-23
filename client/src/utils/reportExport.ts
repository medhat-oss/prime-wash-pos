import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { MonthlyVatReport, MaterialConsumptionReport } from '../types/index.js';
import { formatEGP } from './formatters.js';

/**
 * Helper to download Blob as a file in browser
 */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Helper to render an HTML template string to a high-res PDF via offscreen container
 */
async function renderHtmlToPdf(htmlString: string, filename: string) {
  // Create off-screen rendering container
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '800px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#0f172a';
  container.style.fontFamily = '"Cairo", "Tajawal", "Segoe UI", Tahoma, sans-serif';
  container.style.direction = 'rtl';
  container.style.padding = '24px';
  container.style.boxSizing = 'border-box';
  container.innerHTML = htmlString;
  document.body.appendChild(container);

  try {
    // Wait for all web fonts to load completely before capturing to avoid invisible text (FOIT)
    if (document.fonts) {
      await document.fonts.ready;
    }

    // Small delay to allow CSS sub-renders
    await new Promise((resolve) => setTimeout(resolve, 100));

    const canvas = await html2canvas(container, {
      scale: 2, // High resolution Retina/HiDPI
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = 210;
    const pageHeight = 297;
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    // First page
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // Multi-page slicing if table is long
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(filename);
  } finally {
    document.body.removeChild(container);
  }
}

// =============================================================================
// 1. Export Monthly VAT 14% Declaration Summary to Excel (.xlsx)
// =============================================================================
export async function exportVatReportToExcel(report: MonthlyVatReport) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Car Wash ERP & POS';
  workbook.created = new Date();

  // --- Sheet 1: الملخص الضريبي (VAT Summary) ---
  const sheet = workbook.addWorksheet('إقرار القيمة المضافة 14%', {
    views: [{ rightToLeft: true }],
  });

  // Header Title
  sheet.mergeCells('A1:G1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `ملخص إقرار ضريبة القيمة المضافة (14%) - الفترة الضريبية: ${report.period}`;
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 40;

  // Metadata block
  sheet.addRow([]);
  sheet.addRow([
    'الرقم الضريبي للمنشأة:',
    report.tax_registration_number || 'غير مسجل',
    '',
    'كود الفرع:',
    report.branch_code || '0',
    'تاريخ الاستخراج:',
    new Date(report.generated_at).toLocaleString('ar-EG'),
  ]);
  sheet.addRow([
    'نسبة الضريبة العامة:',
    '14% (شاملة الفاتورة)',
    '',
    'حالة الربط ETA:',
    report.eta_sync_enabled ? 'مفعل' : 'معطل',
    'إجمالي الفواتير:',
    report.summary.total_orders_count,
  ]);

  const metaRows = [3, 4];
  metaRows.forEach((r) => {
    sheet.getRow(r).font = { name: 'Arial', size: 11, bold: true };
    sheet.getRow(r).height = 24;
  });

  sheet.addRow([]);

  // KPI Summary Table
  sheet.addRow(['مؤشرات الإقرار المالي والضريبي (ملخص شامل)', '', '', '', '', '', '']);
  const kpiHeaderCell = sheet.getCell(`A6`);
  sheet.mergeCells('A6:G6');
  kpiHeaderCell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  kpiHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
  kpiHeaderCell.alignment = { horizontal: 'center' };
  sheet.getRow(6).height = 28;

  sheet.addRow(['البند الضريبي / المحاسبي', 'القيمة المالية (ج.م)', 'النسبة / الملاحظات', '', '', '', '']);
  sheet.getRow(7).font = { bold: true };
  sheet.getRow(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

  const summaryData = [
    ['إجمالي المبيعات الإجمالية (شاملة ضريبة 14%)', report.summary.total_sales_gross, 'المبيعات الكلية المحصلة'],
    ['صافي المبيعات الخاضعة للضريبة (Taxable Base - 100/114)', report.summary.total_taxable_base, 'وعاء احتساب ضريبة القيمة المضافة'],
    ['إجمالي ضريبة القيمة المضافة المستحقة (VAT 14% - 14/114)', report.summary.total_vat_14, 'الضريبة المستحقة للتوريد لمصلحة الضرائب'],
    ['الفواتير المعتمدة بـ منظومة الإيصال ETA Valid', report.summary.eta_valid_vat, `عدد ${report.summary.eta_valid_count} فاتورة موثقة بـ UUID`],
    ['الفواتير الملغاة / المسترجعة (Cancelled)', report.summary.cancelled_total_amount, `عدد ${report.summary.cancelled_orders_count} فاتورة ملغاة`],
  ];

  summaryData.forEach((row) => {
    const added = sheet.addRow([row[0], row[1], row[2]]);
    added.height = 22;
    sheet.getCell(`B${added.number}`).numFmt = '#,##0.00 "ج.م"';
  });

  sheet.addRow([]);

  // Section 2: Breakdown by Wash Service
  const srvStart = sheet.rowCount + 1;
  sheet.mergeCells(`A${srvStart}:F${srvStart}`);
  const srvHeader = sheet.getCell(`A${srvStart}`);
  srvHeader.value = 'تفصيل المبيعات والضريبة بحسب باقات وخدمات الغسيل';
  srvHeader.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  srvHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  sheet.getRow(srvStart).height = 26;

  const srvCols = sheet.addRow([
    'اسم خدمة الغسيل',
    'كود التصنيف EGS',
    'عدد الغسلات',
    'المبيعات الإجمالية (ج.م)',
    'صافي الأساس الخاضع (ج.م)',
    'ضريبة 14% (ج.م)',
  ]);
  srvCols.font = { bold: true };
  srvCols.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

  report.service_breakdown.forEach((srv) => {
    const row = sheet.addRow([
      srv.name,
      srv.egs_code || 'غير مكود',
      srv.orders_count,
      srv.total_gross,
      srv.total_net,
      srv.total_vat,
    ]);
    row.height = 20;
    sheet.getCell(`D${row.number}`).numFmt = '#,##0.00 "ج.م"';
    sheet.getCell(`E${row.number}`).numFmt = '#,##0.00 "ج.م"';
    sheet.getCell(`F${row.number}`).numFmt = '#,##0.00 "ج.م"';
  });

  sheet.addRow([]);

  // Section 3: Breakdown by Payment Method
  const payStart = sheet.rowCount + 1;
  sheet.mergeCells(`A${payStart}:E${payStart}`);
  const payHeader = sheet.getCell(`A${payStart}`);
  payHeader.value = 'تفصيل المبيعات بحسب طريقة الدفع والسداد';
  payHeader.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  payHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
  sheet.getRow(payStart).height = 26;

  const payCols = sheet.addRow([
    'طريقة الدفع',
    'عدد العمليات',
    'المبيعات الإجمالية (ج.م)',
    'صافي المبيعات (ج.م)',
    'ضريبة 14% (ج.م)',
  ]);
  payCols.font = { bold: true };
  payCols.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

  const getPayMethodLabel = (m: string) => {
    switch (m) {
      case 'cash':
        return 'نقدي (Cash)';
      case 'card':
        return 'بطاقة / فيزا (Card)';
      case 'transfer':
        return 'تحويل بنكي / محفظة';
      case 'split':
        return 'دفع مجزأ';
      default:
        return m;
    }
  };

  report.payment_breakdown.forEach((p) => {
    const row = sheet.addRow([
      getPayMethodLabel(p.payment_method),
      p.count,
      p.total_gross,
      p.total_net,
      p.total_vat,
    ]);
    row.height = 20;
    sheet.getCell(`C${row.number}`).numFmt = '#,##0.00 "ج.م"';
    sheet.getCell(`D${row.number}`).numFmt = '#,##0.00 "ج.م"';
    sheet.getCell(`E${row.number}`).numFmt = '#,##0.00 "ج.م"';
  });

  // --- Sheet 2: سجل الفواتير الضريبية التفصيلي (Invoices Log) ---
  const logSheet = workbook.addWorksheet('سجل الفواتير التفصيلي', {
    views: [{ rightToLeft: true }],
  });

  logSheet.mergeCells('A1:L1');
  const logTitle = logSheet.getCell('A1');
  logTitle.value = `سجل الفواتير الضريبية وإيصالات نقاط البيع - الفترة ${report.period}`;
  logTitle.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  logTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  logTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  logSheet.getRow(1).height = 32;

  const invHeaderRow = logSheet.addRow([
    'كود الفاتورة',
    'تاريخ ووقت الإصدار',
    'رقم اللوحة',
    'نوع السيارة',
    'اسم العميل',
    'الخدمة',
    'طريقة الدفع',
    'الصافي قبل الضريبة',
    'ضريبة 14%',
    'الإجمالي المطلوب',
    'حالة الفاتورة',
    'حالة ETA',
  ]);
  invHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  invHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
  invHeaderRow.height = 26;

  report.invoices.forEach((inv) => {
    const r = logSheet.addRow([
      inv.order_code,
      new Date(inv.created_at).toLocaleString('ar-EG'),
      inv.car_plate || '-',
      inv.car_type || 'سيدان',
      inv.customer_name || '-',
      inv.service_name || '-',
      getPayMethodLabel(inv.payment_method),
      inv.subtotal,
      inv.tax_amount,
      inv.total_amount,
      inv.status === 'completed' ? 'مكتمل' : inv.status === 'cancelled' ? 'ملغي' : inv.status,
      inv.eta_status === 'valid'
        ? 'معتمد بالضرائب'
        : inv.eta_status === 'pending'
        ? 'قيد الإرسال'
        : 'غير مرسل',
    ]);
    r.height = 20;
    logSheet.getCell(`H${r.number}`).numFmt = '#,##0.00';
    logSheet.getCell(`I${r.number}`).numFmt = '#,##0.00';
    logSheet.getCell(`J${r.number}`).numFmt = '#,##0.00';
  });

  // Auto-fit columns
  [sheet, logSheet].forEach((ws) => {
    ws.columns.forEach((column) => {
      let maxLen = 12;
      column.eachCell?.({ includeEmpty: false }, (cell) => {
        const len = cell.value ? cell.value.toString().length : 10;
        if (len > maxLen) maxLen = len;
      });
      column.width = Math.min(maxLen + 4, 35);
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(blob, `VAT_Declaration_14_${report.period}.xlsx`);
}

// =============================================================================
// 2. Export Monthly VAT 14% Declaration Summary to PDF (.pdf) - Arabic Compatible
// =============================================================================
export async function exportVatReportToPdf(report: MonthlyVatReport) {
  const getPayMethodLabel = (m: string) => {
    switch (m) {
      case 'cash':
        return 'نقدي (Cash)';
      case 'card':
        return 'بطاقة / فيزا (Card)';
      case 'transfer':
        return 'تحويل بنكي / محفظة';
      case 'split':
        return 'دفع مجزأ';
      default:
        return m;
    }
  };

  const html = `
    <div style="font-family: 'Cairo', 'Tajawal', sans-serif; color: #0f172a; direction: rtl; text-align: right; padding: 10px;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #0f172a, #1e293b); color: #ffffff; padding: 20px; border-radius: 12px; margin-bottom: 20px; text-align: center;">
        <h1 style="margin: 0 0 6px 0; font-size: 20px; font-weight: 900;">ملخص إقرار ضريبة القيمة المضافة (14%)</h1>
        <p style="margin: 0; font-size: 12px; color: #94a3b8;">
          الفترة الضريبية: ${report.period} | الرقم الضريبي: ${report.tax_registration_number || 'غير مسجل'} | كود الفرع: ${report.branch_code || '0'}
        </p>
      </div>

      <!-- Financial KPI Cards -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px;">
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 10px; text-align: center;">
          <div style="font-size: 11px; color: #64748b; font-weight: bold;">إجمالي المبيعات (شاملة الضريبة)</div>
          <div style="font-size: 16px; font-weight: 900; color: #0f172a; margin-top: 4px;">${formatEGP(report.summary.total_sales_gross)}</div>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 10px; text-align: center;">
          <div style="font-size: 11px; color: #64748b; font-weight: bold;">صافي الوعاء الخاضع (100/114)</div>
          <div style="font-size: 16px; font-weight: 900; color: #0f172a; margin-top: 4px;">${formatEGP(report.summary.total_taxable_base)}</div>
        </div>
        <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 12px; border-radius: 10px; text-align: center;">
          <div style="font-size: 11px; color: #059669; font-weight: bold;">ضريبة القيمة المضافة المستحقة (14%)</div>
          <div style="font-size: 18px; font-weight: 900; color: #059669; margin-top: 4px;">${formatEGP(report.summary.total_vat_14)}</div>
        </div>
      </div>

      <!-- Summary Info Table -->
      <div style="margin-bottom: 20px;">
        <div style="font-size: 13px; font-weight: bold; color: #1e293b; margin-bottom: 8px; border-right: 4px solid #059669; padding-right: 8px;">
          مؤشرات المنظومة والإيصالات
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <tr style="background: #f1f5f9;">
            <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold;">إجمالي الفواتير الصادرة</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; font-family: monospace;">${report.summary.total_orders_count} فاتورة (${report.summary.valid_orders_count} مكتملة، ${report.summary.cancelled_orders_count} ملغاة)</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold;">فواتير معتمدة بالضرائب ETA</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; font-family: monospace;">${report.summary.eta_valid_count} (${formatEGP(report.summary.eta_valid_vat)})</td>
          </tr>
        </table>
      </div>

      <!-- Section 1: Wash Services Breakdown -->
      <div style="margin-bottom: 20px;">
        <div style="font-size: 13px; font-weight: bold; color: #1e293b; margin-bottom: 8px; border-right: 4px solid #1e3a8a; padding-right: 8px;">
          1. تفصيل المبيعات حسب باقات وخدمات الغسيل
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background: #1e3a8a; color: #ffffff;">
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">الخدمة</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">كود EGS</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">العدد</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">المبيعات الإجمالية</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">الصافي الخاضع</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">ضريبة 14%</th>
            </tr>
          </thead>
          <tbody>
            ${report.service_breakdown
              .map(
                (s, i) => `
              <tr style="background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: bold;">${s.name}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-family: monospace; font-size: 10px;">${s.egs_code || '-'}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace;">${s.orders_count}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left; font-family: monospace;">${formatEGP(s.total_gross)}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left; font-family: monospace;">${formatEGP(s.total_net)}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left; font-family: monospace; font-weight: bold; color: #059669;">${formatEGP(s.total_vat)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <!-- Section 2: Payment Methods Breakdown -->
      <div style="margin-bottom: 20px;">
        <div style="font-size: 13px; font-weight: bold; color: #1e293b; margin-bottom: 8px; border-right: 4px solid #475569; padding-right: 8px;">
          2. تفصيل المبيعات حسب طريقة التحصيل والدفع
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background: #475569; color: #ffffff;">
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">طريقة الدفع</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">عدد العمليات</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">المبيعات الإجمالية</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">الصافي الخاضع</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">ضريبة 14%</th>
            </tr>
          </thead>
          <tbody>
            ${report.payment_breakdown
              .map(
                (p, i) => `
              <tr style="background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: bold;">${getPayMethodLabel(p.payment_method)}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace;">${p.count}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left; font-family: monospace;">${formatEGP(p.total_gross)}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left; font-family: monospace;">${formatEGP(p.total_net)}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left; font-family: monospace; font-weight: bold; color: #059669;">${formatEGP(p.total_vat)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <!-- Legal Disclaimer Footer -->
      <div style="margin-top: 30px; padding: 12px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; font-size: 10px; color: #92400e; line-height: 1.5;">
        <strong>إخلاء مسؤولية قانونية وضريبية:</strong> إن دقة الحسابات المحاسبية وتقديم الإقرارات وسداد الضرائب المستحقة تقع بالكامل على عاتق المنشأة والمالك القانوني. تم استخراج التقرير آلياً بتاريخ ${new Date().toLocaleString('ar-EG')}.
      </div>
    </div>
  `;

  await renderHtmlToPdf(html, `VAT_Declaration_14_${report.period}.pdf`);
}

// =============================================================================
// 3. Export Raw Material Consumption Logs to Excel (.xlsx)
// =============================================================================
export async function exportMaterialConsumptionToExcel(report: MaterialConsumptionReport) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Car Wash ERP & POS';
  workbook.created = new Date();

  // --- Sheet 1: ملخص استهلاك المواد الخام (Summary) ---
  const sheet = workbook.addWorksheet('استهلاك المواد الخام', {
    views: [{ rightToLeft: true }],
  });

  sheet.mergeCells('A1:H1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `سجل استهلاك المواد الخام والمخزون بالجرام - الفترة ${report.period}`;
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF047857' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 40;

  sheet.addRow([]);
  sheet.addRow([
    'إجمالي الغسلات المكتملة:',
    report.total_completed_washes,
    '',
    'إجمالي الجرامات المستهلكة:',
    `${report.total_grams_consumed.toLocaleString()} جرام (${(report.total_grams_consumed / 1000).toFixed(2)} كجم)`,
    '',
    'إجمالي تكلفة المواد الخام:',
    report.total_cost_egp,
  ]);
  sheet.getRow(3).font = { name: 'Arial', size: 11, bold: true };
  sheet.getCell('H3').numFmt = '#,##0.00 "ج.م"';

  sheet.addRow([]);

  // Materials Table Header
  const headerRow = sheet.addRow([
    'اسم المادة الخام',
    'وحدة القياس',
    'إجمالي المستهلك (جرام)',
    'المعادل (كجم / لتر)',
    'تكلفة الجرام (ج.م)',
    'إجمالي تكلفة الاستهلاك (ج.م)',
    'الرصيد المتبقي بالمخزن (جرام)',
    'حالة المخزون',
  ]);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  headerRow.height = 26;

  report.materials.forEach((m) => {
    const row = sheet.addRow([
      m.name,
      m.unit || 'جرام',
      m.total_consumed_grams,
      Number((m.total_consumed_grams / 1000).toFixed(2)),
      m.cost_per_gram,
      m.total_consumed_cost,
      m.current_stock_grams,
      m.is_low_stock ? 'منخفض (تحت حد الأمان)' : 'آمن',
    ]);
    row.height = 22;
    sheet.getCell(`C${row.number}`).numFmt = '#,##0';
    sheet.getCell(`D${row.number}`).numFmt = '#,##0.00';
    sheet.getCell(`E${row.number}`).numFmt = '0.0000 "ج.م"';
    sheet.getCell(`F${row.number}`).numFmt = '#,##0.00 "ج.م"';
    sheet.getCell(`G${row.number}`).numFmt = '#,##0';

    if (m.is_low_stock) {
      sheet.getCell(`H${row.number}`).font = { color: { argb: 'FFDC2626' }, bold: true };
    }
  });

  sheet.addRow([]);

  // Section 2: Consumption by Wash Service (BOM breakdown)
  const bomStart = sheet.rowCount + 1;
  sheet.mergeCells(`A${bomStart}:G${bomStart}`);
  const bomHeader = sheet.getCell(`A${bomStart}`);
  bomHeader.value = 'استهلاك المواد الخام موزعة بحسب باقات الغسيل (BOM Analysis)';
  bomHeader.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  bomHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
  sheet.getRow(bomStart).height = 26;

  const bomCols = sheet.addRow([
    'خدمة الغسيل',
    'المادة الخام',
    'حصة الغسلة الواحدة (جرام)',
    'عدد الغسلات المنفذة',
    'إجمالي الجرامات المستهلكة',
    'المعادل (كجم)',
    'إجمالي التكلفة (ج.م)',
  ]);
  bomCols.font = { bold: true };
  bomCols.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

  report.service_consumption.forEach((sc) => {
    const row = sheet.addRow([
      sc.service_name,
      sc.item_name,
      sc.recipe_grams_per_wash,
      sc.completed_washes_count,
      sc.total_grams_consumed,
      Number((sc.total_grams_consumed / 1000).toFixed(2)),
      sc.total_cost_egp,
    ]);
    row.height = 20;
    sheet.getCell(`C${row.number}`).numFmt = '#,##0.00';
    sheet.getCell(`E${row.number}`).numFmt = '#,##0';
    sheet.getCell(`F${row.number}`).numFmt = '#,##0.00';
    sheet.getCell(`G${row.number}`).numFmt = '#,##0.00 "ج.م"';
  });

  // --- Sheet 2: سجل الخصم التشغيلي التفصيلي (Operational Log) ---
  const logSheet = workbook.addWorksheet('سجل استهلاك الغسلات', {
    views: [{ rightToLeft: true }],
  });

  logSheet.mergeCells('A1:G1');
  const logTitle = logSheet.getCell('A1');
  logTitle.value = `سجل خصم المواد الخام لكل عملية غسيل - الفترة ${report.period}`;
  logTitle.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  logTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  logTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  logSheet.getRow(1).height = 32;

  const logCols = logSheet.addRow([
    'كود الفاتورة',
    'تاريخ الغسيل',
    'رقم اللوحة',
    'نوع السيارة',
    'الخدمة المنفذة',
    'المادة المخصومة',
    'الكمية المستهلكة (جرام)',
    'التكلفة (ج.م)',
  ]);
  logCols.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  logCols.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
  logCols.height = 26;

  report.detailed_logs.forEach((log) => {
    const r = logSheet.addRow([
      log.order_code,
      new Date(log.created_at).toLocaleString('ar-EG'),
      log.car_plate || '-',
      log.car_type || 'سيدان',
      log.service_name,
      log.item_name,
      log.quantity_grams,
      log.cost_egp,
    ]);
    r.height = 20;
    logSheet.getCell(`G${r.number}`).numFmt = '#,##0.00';
    logSheet.getCell(`H${r.number}`).numFmt = '#,##0.00 "ج.م"';
  });

  // Auto-fit widths
  [sheet, logSheet].forEach((ws) => {
    ws.columns.forEach((column) => {
      let maxLen = 12;
      column.eachCell?.({ includeEmpty: false }, (cell) => {
        const len = cell.value ? cell.value.toString().length : 10;
        if (len > maxLen) maxLen = len;
      });
      column.width = Math.min(maxLen + 4, 35);
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(blob, `Raw_Material_Consumption_${report.period}.xlsx`);
}

// =============================================================================
// 4. Export Raw Material Consumption Logs to PDF (.pdf) - Arabic Compatible
// =============================================================================
export async function exportMaterialConsumptionToPdf(report: MaterialConsumptionReport) {
  const html = `
    <div style="font-family: 'Cairo', 'Tajawal', sans-serif; color: #0f172a; direction: rtl; text-align: right; padding: 10px;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #065f46, #047857); color: #ffffff; padding: 20px; border-radius: 12px; margin-bottom: 20px; text-align: center;">
        <h1 style="margin: 0 0 6px 0; font-size: 20px; font-weight: 900;">سجل استهلاك المواد الخام والمخزون بالجرام</h1>
        <p style="margin: 0; font-size: 12px; color: #d1fae5;">
          الفترة: ${report.period} | إجمالي الغسلات المنجزة: ${report.total_completed_washes} | إجمالي التكلفة: ${formatEGP(report.total_cost_egp)}
        </p>
      </div>

      <!-- KPI Cards -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px;">
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 10px; text-align: center;">
          <div style="font-size: 11px; color: #64748b; font-weight: bold;">عدد الغسلات المكتملة</div>
          <div style="font-size: 16px; font-weight: 900; color: #0f172a; margin-top: 4px;">${report.total_completed_washes} سيارة</div>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 10px; text-align: center;">
          <div style="font-size: 11px; color: #64748b; font-weight: bold;">إجمالي الجرامات المستهلكة</div>
          <div style="font-size: 16px; font-weight: 900; color: #0f172a; margin-top: 4px;">${report.total_grams_consumed.toLocaleString()} ج (${(report.total_grams_consumed / 1000).toFixed(2)} كجم)</div>
        </div>
        <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 12px; border-radius: 10px; text-align: center;">
          <div style="font-size: 11px; color: #059669; font-weight: bold;">إجمالي تكلفة المواد الخام</div>
          <div style="font-size: 18px; font-weight: 900; color: #059669; margin-top: 4px;">${formatEGP(report.total_cost_egp)}</div>
        </div>
      </div>

      <!-- Section 1: Materials Summary Table -->
      <div style="margin-bottom: 20px;">
        <div style="font-size: 13px; font-weight: bold; color: #1e293b; margin-bottom: 8px; border-right: 4px solid #047857; padding-right: 8px;">
          1. استهلاك المواد الخام وحالة الأرصدة
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background: #047857; color: #ffffff;">
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">المادة الخام</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">المستهلك (جرام)</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">المعادل (كجم)</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">تكلفة الجرام</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">إجمالي التكلفة</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">المتبقي بالمخزن</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">الحالة</th>
            </tr>
          </thead>
          <tbody>
            ${report.materials
              .map(
                (m, i) => `
              <tr style="background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: bold;">${m.name}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace;">${m.total_consumed_grams.toLocaleString()}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace;">${(m.total_consumed_grams / 1000).toFixed(2)}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left; font-family: monospace;">${formatEGP(m.cost_per_gram)}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left; font-family: monospace; font-weight: bold; color: #059669;">${formatEGP(m.total_consumed_cost)}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace;">${m.current_stock_grams.toLocaleString()}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: ${m.is_low_stock ? '#dc2626' : '#059669'};">
                  ${m.is_low_stock ? 'منخفض' : 'آمن'}
                </td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <!-- Section 2: BOM Breakdown -->
      <div style="margin-bottom: 20px;">
        <div style="font-size: 13px; font-weight: bold; color: #1e293b; margin-bottom: 8px; border-right: 4px solid #1e3a8a; padding-right: 8px;">
          2. تفصيل الاستهلاك حسب باقات الغسيل (BOM)
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background: #1e3a8a; color: #ffffff;">
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">الخدمة</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">المادة الخام</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">جرامات/غسلة</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">العدد</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">المستهلك الكلي</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">التكلفة الإجمالية</th>
            </tr>
          </thead>
          <tbody>
            ${report.service_consumption
              .map(
                (sc, i) => `
              <tr style="background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: bold;">${sc.service_name}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1;">${sc.item_name}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace;">${sc.recipe_grams_per_wash} ج</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace;">${sc.completed_washes_count}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace;">${sc.total_grams_consumed.toLocaleString()} ج</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left; font-family: monospace; font-weight: bold; color: #059669;">${formatEGP(sc.total_cost_egp)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <!-- Footer -->
      <div style="margin-top: 30px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 10px; color: #64748b; text-align: center;">
        تم استخراج هذا التقرير آلياً من نظام إدارة مغسلة السيارات الذكية بتاريخ ${new Date().toLocaleString('ar-EG')}
      </div>
    </div>
  `;

  await renderHtmlToPdf(html, `Raw_Material_Consumption_${report.period}.pdf`);
}

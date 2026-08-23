import { TaxSettings } from '../tax.service.js';
import { AppError } from '../../../middleware/errorHandler.js';

export interface OrderForEta {
  id: string;
  order_code: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  payment_method: 'cash' | 'card' | 'transfer' | 'split';
  service_id: string;
  service_name?: string;
  service_egs_code?: string;
  customer_name?: string;
  customer_phone?: string;
  created_at: string;
}

export interface EtaReceiptDocument {
  header: {
    dateTimeIssued: string;
    receiptNumber: string;
    type: {
      typeVersion: string;
      type: string;
    };
    currency: string;
    exchangeRate: number;
    orderdeliveryMode: string;
  };
  seller: {
    rin: string;
    companyTradeName: string;
    branchCode: string;
    deviceSerialNumber: string;
    activityCode: string;
  };
  buyer: {
    type: 'P' | 'B' | 'F';
    id?: string;
    name?: string;
    mobileNumber?: string;
  };
  itemData: Array<{
    internalCode: string;
    description: string;
    itemType: 'EGS' | 'GS1';
    itemCode: string;
    unitType: string;
    quantity: number;
    unitPrice: number;
    netSale: number;
    totalSale: number;
    total: number;
    commercialDiscountData: any[];
    itemDiscountData: any[];
    valueDifference: number;
    taxableItems: Array<{
      taxType: string;
      amount: number;
      subType: string;
      rate: number;
    }>;
  }>;
  totalSales: number;
  totalCommercialDiscount: number;
  totalItemsDiscount: number;
  netAmount: number;
  feesAmount: number;
  taxTotals: Array<{
    taxType: string;
    amount: number;
  }>;
  totalAmount: number;
  paymentMethod: 'C' | 'V' | 'O';
}

export class ReceiptBuilderService {
  /**
   * Builds official Egyptian e-Receipt JSON document (Version 1.0, Type: SR)
   */
  static buildReceipt(order: OrderForEta, settings: TaxSettings): EtaReceiptDocument {
    const taxRegNumber = settings.tax_registration_number?.trim() || '100234567';
    const branchCode = settings.branch_code?.trim() || '0';
    const posSerial = settings.pos_serial?.trim() || 'POS-CWASH-01';

    // Format date to ISO UTC format required by ETA (e.g. 2026-08-18T17:30:00Z)
    const issuedDate = new Date(order.created_at || Date.now()).toISOString().replace(/\.\d{3}Z$/, 'Z');

    // EGS Code resolution (fallback to standardized EG-{TaxID}-WASH01 if not set)
    const egsCode =
      order.service_egs_code?.trim() ||
      `EG-${taxRegNumber.replace(/\D/g, '').padEnd(9, '0').slice(0, 9)}-WASH01`;

    const subtotal = Number(Number(order.subtotal || 0).toFixed(2));
    const taxAmount = Number(Number(order.tax_amount || 0).toFixed(2));
    const totalAmount = Number(Number(order.total_amount || 0).toFixed(2));

    // Map Payment method: 'C' = Cash, 'V' = Visa/Card, 'O' = Other (Transfer/Mobile Wallet)
    let paymentCode: 'C' | 'V' | 'O' = 'C';
    if (order.payment_method === 'card') {
      paymentCode = 'V';
    } else if (order.payment_method === 'transfer' || order.payment_method === 'split') {
      paymentCode = 'O';
    }

    const document: EtaReceiptDocument = {
      header: {
        dateTimeIssued: issuedDate,
        receiptNumber: order.order_code,
        type: {
          typeVersion: '1.0',
          type: 'SR', // Standard Receipt
        },
        currency: 'EGP',
        exchangeRate: 0,
        orderdeliveryMode: 'FC', // Face-to-face consumer receipt
      },
      seller: {
        rin: taxRegNumber,
        companyTradeName: 'مغسلة السيارات الذكية',
        branchCode: branchCode,
        deviceSerialNumber: posSerial,
        activityCode: '4520', // Car Maintenance and Washing activity code
      },
      buyer: {
        type: 'P', // Person / Consumer
        name: order.customer_name?.trim() || 'عميل نقدي',
        mobileNumber: order.customer_phone?.trim() || undefined,
      },
      itemData: [
        {
          internalCode: order.service_id || 'srv-01',
          description: order.service_name || 'خدمة غسيل سيارة',
          itemType: 'EGS',
          itemCode: egsCode,
          unitType: 'EA', // Each
          quantity: 1,
          unitPrice: subtotal,
          netSale: subtotal,
          totalSale: subtotal,
          total: totalAmount,
          commercialDiscountData: [],
          itemDiscountData: [],
          valueDifference: 0,
          taxableItems: [
            {
              taxType: 'T1', // General Value Added Tax (VAT)
              amount: taxAmount,
              subType: 'V009', // General Standard Rate VAT in Egypt
              rate: 14.0, // 14%
            },
          ],
        },
      ],
      totalSales: subtotal,
      totalCommercialDiscount: 0,
      totalItemsDiscount: 0,
      netAmount: subtotal,
      feesAmount: 0,
      taxTotals: [
        {
          taxType: 'T1',
          amount: taxAmount,
        },
      ],
      totalAmount: totalAmount,
      paymentMethod: paymentCode,
    };

    return document;
  }
}

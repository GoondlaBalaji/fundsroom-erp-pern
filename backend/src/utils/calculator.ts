export interface CalculationItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  gstPct: number;
}

export interface CalculatedItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  gstPct: number;
  baseAmount: number;
  discountAmount: number;
  netAmount: number;
  gstAmount: number;
  lineAmount: number;
}

export interface CalculationResult {
  items: CalculatedItem[];
  subtotal: number;
  totalDiscount: number;
  totalGst: number;
  grandTotal: number;
}

/**
 * Rounds a number to 2 decimal places with mathematical precision
 */
export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Authoritatively calculates quotation financial totals on backend.
 * Never trusts client totals.
 */
export function calculateQuotationTotals(items: CalculationItemInput[]): CalculationResult {
  let subtotal = 0;
  let totalDiscount = 0;
  let totalGst = 0;
  let grandTotal = 0;

  const calculatedItems: CalculatedItem[] = items.map((item) => {
    const quantity = Math.max(1, Math.floor(item.quantity));
    const unitPrice = round2(Math.max(0, item.unitPrice));
    const discountPct = Math.min(100, Math.max(0, item.discountPct));
    const gstPct = Math.max(0, item.gstPct);

    const baseAmount = round2(quantity * unitPrice);
    const discountAmount = round2(baseAmount * (discountPct / 100));
    const netAmount = round2(baseAmount - discountAmount);
    const gstAmount = round2(netAmount * (gstPct / 100));
    const lineAmount = round2(netAmount + gstAmount);

    subtotal = round2(subtotal + baseAmount);
    totalDiscount = round2(totalDiscount + discountAmount);
    totalGst = round2(totalGst + gstAmount);
    grandTotal = round2(grandTotal + lineAmount);

    return {
      productId: item.productId,
      quantity,
      unitPrice,
      discountPct,
      gstPct,
      baseAmount,
      discountAmount,
      netAmount,
      gstAmount,
      lineAmount,
    };
  });

  return {
    items: calculatedItems,
    subtotal,
    totalDiscount,
    totalGst,
    grandTotal,
  };
}

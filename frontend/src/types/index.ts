export type UserRole = 'ADMIN' | 'SALES_USER';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  createdAt?: string;
}

export interface Customer {
  id: string;
  companyName: string;
  contactPerson: string;
  mobile: string;
  email: string;
  city: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    enquiries: number;
    quotations: number;
    salesOrders: number;
  };
}

export interface Inventory {
  id: string;
  productId: string;
  physicalQuantity: number;
  reservedQuantity: number;
  damagedQuantity: number;
  updatedAt: string;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  basePrice: number | string;
  createdAt: string;
  updatedAt: string;
  inventory?: Inventory;
}

export interface InventoryViewItem {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  category: string;
  unit: string;
  basePrice: number | string;
  physicalQuantity: number;
  reservedQuantity: number;
  damagedQuantity: number;
  availableQuantity: number;
  updatedAt: string;
}

export type EnquiryStatus = 'NEW' | 'QUOTED' | 'WON' | 'LOST';

export interface EnquiryItem {
  id: string;
  enquiryId: string;
  productId: string;
  quantity: number;
  product?: Product;
}

export interface Enquiry {
  id: string;
  enquiryNumber: string;
  customerId: string;
  customer: Customer;
  enquiryDate: string;
  requiredDate: string;
  notes?: string | null;
  status: EnquiryStatus;
  createdById: string;
  createdBy: { id: string; fullName: string; email: string };
  items: EnquiryItem[];
  quotations?: Array<{
    id: string;
    quotationNumber: string;
    status: QuotationStatus;
    grandTotal: number | string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export type QuotationStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED';

export interface QuotationItem {
  id: string;
  quotationId: string;
  productId: string;
  quantity: number;
  unitPrice: number | string;
  discountPct: number | string;
  gstPct: number | string;
  baseAmount: number | string;
  discountAmount: number | string;
  netAmount: number | string;
  gstAmount: number | string;
  lineAmount: number | string;
  product?: Product;
}

export interface Quotation {
  id: string;
  quotationNumber: string;
  enquiryId: string;
  enquiry?: Enquiry;
  customerId: string;
  customer?: Customer;
  validUntil: string;
  subtotal: number | string;
  totalDiscount: number | string;
  totalGst: number | string;
  grandTotal: number | string;
  status: QuotationStatus;
  createdById: string;
  createdBy: { id: string; fullName: string; email: string };
  items: QuotationItem[];
  salesOrder?: {
    id: string;
    orderNumber: string;
    status: SalesOrderStatus;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export type SalesOrderStatus = 'PENDING' | 'CONFIRMED' | 'DISPATCHED' | 'CANCELLED';

export interface SalesOrderItem {
  id: string;
  salesOrderId: string;
  productId: string;
  productCode?: string;
  productName?: string;
  unit?: string;
  quantity: number;
  unitPrice: number | string;
  lineAmount: number | string;
  availableStock?: number;
  hasSufficientStock?: boolean;
  product?: Product & { inventory?: Inventory };
}

export interface SalesOrder {
  id: string;
  orderNumber: string;
  quotationId: string;
  quotation?: { id: string; quotationNumber: string; enquiryId: string };
  customerId: string;
  customer: Customer;
  orderDate: string;
  totalAmount: number | string;
  status: SalesOrderStatus;
  confirmedById?: string | null;
  confirmedBy?: { id: string; fullName: string; email: string } | null;
  confirmedAt?: string | null;
  items: SalesOrderItem[];
  dispatch?: Dispatch | null;
  createdAt: string;
  updatedAt: string;
}

export interface DispatchItem {
  id: string;
  dispatchId: string;
  productId: string;
  quantity: number;
  product?: Product;
}

export interface Dispatch {
  id: string;
  dispatchNumber: string;
  salesOrderId: string;
  salesOrder?: SalesOrder;
  dispatchDate: string;
  vehicleNumber: string;
  driverName: string;
  dispatchedById: string;
  dispatchedBy: { id: string; fullName: string; email: string };
  items: DispatchItem[];
  createdAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
  error?: {
    message: string;
    statusCode: number;
    details?: any;
  };
}

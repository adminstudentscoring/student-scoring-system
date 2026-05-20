/**
 * V.Chess invoice text → row fields. Used by CLI and tests; keep browser HTML in sync.
 * Schedule date expansion lives in @student-scoring/core (single source of truth for import apply).
 */
export {
  expandVchessScheduleDatesToYmd,
  extractDefaultYearFromInvoiceDate,
  utcYmdToEnglishDow
} from '@student-scoring/core';

export type { InvoiceRow, InvoiceXlsxExportRow, InvoiceMoneyTriplet } from './vchess-invoice-parse/types';
export {
  toInvoiceXlsxExportRow,
  invoiceRowToSalesEnrollmentExportRow,
  SALES_ENROLLMENT_EXPORT_HEADERS
} from './vchess-invoice-parse/exportRows';
export {
  pickBestInvoiceMoneyTriplet,
  pickBestPriceQtyTotalTriplet,
  findLastMoneyTripletSliceIndex
} from './vchess-invoice-parse/money';
export { extractInvoiceCustomer, parseDescriptionDetail } from './vchess-invoice-parse/description';
export {
  splitPageTextIntoInvoiceSegments,
  pageLooksLikeInvoice,
  parseInvoiceText,
  isCleanInvoiceRow,
  compareInvoiceRowsNeat,
  SALES_EXPORT_ISSUE_EXTRA_HEADERS
} from './vchess-invoice-parse/parseInvoice';

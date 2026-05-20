/**
 * V.Chess invoice row types.
 */
export type InvoiceRow = {
  source_file: string;
  invoice_no: string | null;
  invoice_date: string | null;
  student_display: string | null;
  customer_name: string | null;
  customer_id: string | null;
  course_name: string | null;
  schedule_time: string | null;
  schedule_dates: string | null;
  lesson_date_count: number | null;
  teacher: string | null;
  item_description: string | null;
  unit_price: string | null;
  quantity: string | null;
  line_total: string | null;
  subtotal: string | null;
  total: string | null;
  amount_paid: string | null;
  amount_due: string | null;
  fps_number: string | null;
  payee_name: string | null;
  quantity_vs_dates_note: string | null;
  parse_note: string | null;
};

export type InvoiceXlsxExportRow = {
  student_name: string | null;
  student_id: string | null;
  teacher: string | null;
  course_name: string | null;
  schedule_time: string | null;
  schedule_dates: string | null;
  unit_price: string | null;
  quantity: string | null;
  line_total: string | null;
  invoice_no: string | null;
  invoice_date: string | null;
};

export type InvoiceMoneyTriplet = {
  raw: string;
  index: number;
  unitPrice: string;
  quantity: string;
  lineTotal: string;
};

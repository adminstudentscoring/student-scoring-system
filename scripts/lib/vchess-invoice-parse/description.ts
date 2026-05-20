/** Extract customer name + id when `To:` is empty and name is on the line after `Date:`. */
export function extractInvoiceCustomer(full: string): {
  customerName: string | null;
  customerId: string | null;
} {
  let customerName: string | null = null;
  let customerId: string | null = null;

  const toLine = full.match(/(?:^|\n)\s*To:\s*([^\n]*)/im);
  if (toLine) {
    const rest = (toLine[1] || '').trim();
    if (rest.length > 0) {
      const paren = rest.match(/^(.+?)\s*\(\s*([^)]+?)\s*\)\s*$/);
      if (paren) {
        customerName = paren[1].replace(/\s+/g, ' ').trim();
        customerId = paren[2].trim();
      }
    }
  }

  if (!customerName || !customerId) {
    const afterDate = full.match(
      /\bDate\s*:\s*\d{1,2}\/\d{1,2}\/\d{4}\s*\r?\n\s*([^\n(]+?)\s*\(\s*([A-Za-z]?\d{3,})\s*\)/im
    );
    if (afterDate) {
      customerName = afterDate[1].replace(/\s+/g, ' ').trim();
      customerId = afterDate[2].trim();
    }
  }

  if (!customerName || !customerId) {
    const oneLine = full.replace(/[\r\n]+/g, ' ').replace(/[ \t]+/g, ' ');
    const inline = oneLine.match(
      /\bDate\s*:\s*\d{1,2}\/\d{1,2}\/\d{4}\s+(.{1,120}?)\s*\(\s*([A-Za-z]?\d{3,})\s*\)/i
    );
    if (inline) {
      customerName = inline[1].replace(/\s+/g, ' ').trim();
      customerId = inline[2].trim();
    }
  }

  if (!customerName || !customerId) {
    const legacy = full.match(/To:\s*([\s\S]*?)\s*\(\s*([^)]+?)\s*\)/i);
    if (legacy) {
      const candName = legacy[1]?.replace(/\s+/g, ' ').trim() ?? '';
      if (
        candName &&
        candName.length <= 120 &&
        !/\bTotal\s+Price\b/i.test(candName) &&
        !/\bItem\s+Description\b/i.test(candName) &&
        !/\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/.test(candName)
      ) {
        customerName = candName;
        customerId = legacy[2].trim();
      }
    }
  }

  if (customerName && /^(total|price|quantity)$/i.test(customerName)) {
    customerName = null;
    customerId = null;
  }
  if (customerName && (/\btotal\s+price\b/i.test(customerName) || /^price\b/i.test(customerName.trim()))) {
    customerName = null;
    customerId = null;
  }

  return { customerName, customerId };
}

export function cleanItemDescriptionRaw(raw: string): string {
  let s = raw.replace(/\s+/g, ' ').trim();
  s = s.replace(/^(?:.*?\bItem\s+Description\b\s*)+/i, '');
  s = s.replace(/^(?:.*?\bPrice\b\s+\bQuantity\b\s+\bTotal\b\s*)+/i, '');
  s = s.replace(/^(?:.*?\bTotal\s+Price\b\s*)+/i, '');
  s = s.replace(/^\s*Quantity\s+/i, '');
  s = s.replace(/^\s*Total\s+Price\s+/i, '');
  return s.trim();
}

export function parseDescriptionDetail(
  itemDescription: string | null,
  teacherFromDocument: string | null
): {
  course_name: string | null;
  schedule_time: string | null;
  schedule_dates: string | null;
  lesson_date_count: number | null;
  teacher: string | null;
} {
  const out = {
    course_name: null as string | null,
    schedule_time: null as string | null,
    schedule_dates: null as string | null,
    lesson_date_count: null as number | null,
    teacher: teacherFromDocument
  };
  if (!itemDescription) {
    if (
      teacherFromDocument &&
      teacherFromDocument.length > 40 &&
      /\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/.test(teacherFromDocument)
    ) {
      return parseDescriptionDetail(teacherFromDocument, null);
    }
    return out;
  }

  let work = itemDescription.replace(/\s+/g, ' ').trim();

  /**
   * PDFs often emit "Teacher: Duck Duck Sir Elite Class 19:00-20:30 (...)" on one line.
   * A trailing-only Teacher regex would put the entire string in teacher and clear work.
   */
  if (/^\s*Teacher\s*:?\s*/i.test(work)) {
    work = work.replace(/^\s*Teacher\s*:?\s*/i, '');
    const stopRe =
      /\b(?:Chess|Elite|Beginner|Advanced|Private|Primary|Intermediate|Group|December|lesson|class)\b|[\u4e00-\u9fff]{2,}|\d{1,2}:\d{1,2}|-\s*(?:Old\s+Student|Discount)/i;
    const stop = work.search(stopRe);
    if (stop > 0) {
      out.teacher = work.slice(0, stop).trim();
      work = work.slice(stop).trim();
    } else if (work.length > 0 && work.length <= 80) {
      out.teacher = work.trim();
      work = '';
    }
  } else {
    const teachEnd = work.match(/\bTeacher\s*:?\s*(.+)$/i);
    if (teachEnd && teachEnd.index !== undefined && teachEnd.index > 0) {
      out.teacher = teachEnd[1].trim();
      work = work.slice(0, teachEnd.index).trim();
    }
  }

  const timeM = work.match(/(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})/);
  if (timeM) {
    out.schedule_time = timeM[1].replace(/\s/g, '');
  }

  let bestInner: string | null = null;
  let bestN = 0;
  const parenRe = /\(([^)]+)\)/g;
  let pm: RegExpExecArray | null;
  while ((pm = parenRe.exec(work)) !== null) {
    const inner = pm[1];
    const dates = inner.match(/\d{1,2}\/\d{1,2}/g);
    const n = dates?.length ?? 0;
    if (n > bestN || (n === bestN && n > 0 && inner.length > (bestInner?.length ?? 0))) {
      bestN = n;
      bestInner = inner;
    }
  }
  if (bestInner && bestN > 0) {
    out.schedule_dates = bestInner;
    out.lesson_date_count = bestN;
  }

  let course_name: string | null = null;
  if (timeM && timeM.index !== undefined) {
    course_name = work.slice(0, timeM.index).replace(/\s+/g, ' ').trim();
  } else if (bestInner !== null) {
    const idx = work.indexOf('(');
    course_name = (idx >= 0 ? work.slice(0, idx) : work).replace(/\s+/g, ' ').trim();
  } else {
    course_name = work.trim();
  }

  course_name = course_name
    .replace(/^[\s\S]*?item\s+description\s*/i, '')
    .replace(/^\s*quantity\s+/i, '')
    .replace(/^\s*total\s+price\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  out.course_name = course_name || null;

  return out;
}

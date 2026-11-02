// Minimal, dependency-free PDF writer (A4) for receipts and reports.
const PAGE_W = 595.28;
const PAGE_H = 841.89;

const WIN_ANSI = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201c': '"',
  '\u201d': '"',
  '\u2013': '-',
  '\u2014': '-',
  '\u2022': '-',
  '\u00a0': ' ',
  '\u2026': '...',
  '\u012b': 'i',
  '\u0101': 'a',
  '\u016b': 'u',
};
function sanitize(s) {
  return String(s ?? '')
    .replace(/[\u2018\u2019\u201c\u201d\u2013\u2014\u2022\u00a0\u2026\u012b\u0101\u016b]/g, (m) => WIN_ANSI[m] || '')
    .replace(/[^\x09\x0a\x0d\x20-\xff]/g, '?');
}
function esc(s) {
  return sanitize(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
function num(v) {
  return Number(v.toFixed(2));
}
function charWidth(ch, bold) {
  if (ch === ' ') return bold ? 0.28 : 0.27;
  if (/[ilI.,:;'!|]/.test(ch)) return 0.24;
  if (/[A-Z0-9]/.test(ch)) return bold ? 0.62 : 0.58;
  return bold ? 0.56 : 0.52;
}
function textWidth(text, size, bold) {
  let w = 0;
  for (const ch of sanitize(text)) w += charWidth(ch, bold);
  return w * size;
}
function wrap(text, size, maxWidth, bold) {
  const words = sanitize(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (textWidth(test, size, bold) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

class PdfDoc {
  constructor(meta = {}) {
    this.meta = meta;
    this.pages = [];
    this.current = null;
    this.newPage();
  }

  newPage() {
    this.current = { ops: [], y: 48 };
    this.pages.push(this.current);
  }

  op(str) {
    this.current.ops.push(str);
  }

  setY(y) {
    this.current.y = y;
  }

  getY() {
    return this.current.y;
  }

  text(x, y, str, opts = {}) {
    const size = opts.size || 10;
    const bold = !!opts.bold;
    const color = opts.color || '#1f2937';
    const rgb = hexToRgb(color);
    this.op(
      `BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${num(rgb[0])} ${num(rgb[1])} ${num(rgb[2])} rg ${num(x)} ${num(PAGE_H - y)} Td (${esc(str)}) Tj ET`,
    );
    return y;
  }

  textRight(xRight, y, str, opts = {}) {
    const size = opts.size || 10;
    const w = textWidth(str, size, !!opts.bold);
    return this.text(xRight - w, y, str, opts);
  }

  textCenter(xCenter, y, str, opts = {}) {
    const size = opts.size || 10;
    const w = textWidth(str, size, !!opts.bold);
    return this.text(xCenter - w / 2, y, str, opts);
  }

  line(x1, y1, x2, y2, opts = {}) {
    const rgb = hexToRgb(opts.color || '#d1d5db');
    this.op(
      `${num(rgb[0])} ${num(rgb[1])} ${num(rgb[2])} RG ${num(opts.width || 0.7)} w ${num(x1)} ${num(PAGE_H - y1)} m ${num(x2)} ${num(PAGE_H - y2)} l S`,
    );
  }

  rect(x, y, w, h, opts = {}) {
    const fill = opts.fill ? hexToRgb(opts.fill) : null;
    const stroke = opts.stroke ? hexToRgb(opts.stroke) : null;
    if (fill) this.op(`${num(fill[0])} ${num(fill[1])} ${num(fill[2])} rg`);
    if (stroke) this.op(`${num(stroke[0])} ${num(stroke[1])} ${num(stroke[2])} RG ${num(opts.width || 0.7)} w`);
    this.op(`${num(x)} ${num(PAGE_H - y - h)} ${num(w)} ${num(h)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
  }

  paragraph(x, y, text, width, opts = {}) {
    const size = opts.size || 10;
    const lh = opts.lineHeight || size * 1.45;
    const lines = wrap(text, size, width, !!opts.bold);
    let cy = y;
    for (const l of lines) {
      this.text(x, cy, l, opts);
      cy += lh;
    }
    return cy;
  }

  table(x, y, columns, rows, opts = {}) {
    const size = opts.size || 8.5;
    const rowPad = opts.rowPad || 5;
    const headerFill = opts.headerFill || '#0f5132';
    const totalWidth = columns.reduce((s, c) => s + c.width, 0);
    let cy = y;
    const drawHeader = () => {
      this.rect(x, cy, totalWidth, 20, { fill: headerFill });
      let cx = x;
      for (const col of columns) {
        this.text(cx + 4, cy + 13.5, col.label, { size, bold: true, color: '#ffffff' });
        cx += col.width;
      }
      cy += 20;
    };
    drawHeader();
    for (const row of rows) {
      const cellLines = columns.map((col) =>
        wrap(col.value ? col.value(row) : row[col.key], size, col.width - 8, !!col.bold),
      );
      const maxLines = Math.max(...cellLines.map((l) => l.length), 1);
      const rh = maxLines * (size * 1.35) + rowPad * 2;
      if (cy + rh > PAGE_H - 55) {
        this.newPage();
        cy = 48;
        drawHeader();
      }
      if (rows.indexOf(row) % 2 === 1) this.rect(x, cy, totalWidth, rh, { fill: '#f6f7f5' });
      let cx = x;
      columns.forEach((col, i) => {
        let ty = cy + rowPad + size;
        for (const line of cellLines[i]) {
          this.text(cx + 4, ty, line, { size, bold: !!col.bold, color: col.color || '#1f2937' });
          ty += size * 1.35;
        }
        cx += col.width;
      });
      this.line(x, cy + rh, x + totalWidth, cy + rh, { color: '#e5e7eb' });
      cy += rh;
    }
    return cy;
  }

  finish() {
    const objects = [];
    const pageCount = this.pages.length;
    const firstPageObj = 5;
    objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
    objects[2] = `<< /Type /Pages /Kids [${this.pages.map((_, i) => `${firstPageObj + i * 2} 0 R`).join(' ')}] /Count ${pageCount} >>`;
    objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
    objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;
    this.pages.forEach((page, i) => {
      const pageObj = firstPageObj + i * 2;
      const contentObj = pageObj + 1;
      objects[pageObj] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObj} 0 R >>`;
      const stream = page.ops.join('\n');
      objects[contentObj] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    });
    const infoObj = firstPageObj + pageCount * 2;
    const title = this.meta.title || 'MDUIK Document';
    objects[infoObj] = `<< /Title (${esc(title)}) /Producer (MDUIK School Administration System) /CreationDate (D:${new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, '')
      .slice(0, 14)}) >>`;

    let pdf = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offsets = [];
    for (let i = 1; i < objects.length; i++) {
      if (!objects[i]) continue;
      offsets[i] = pdf.length;
      pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
    }
    const xrefStart = pdf.length;
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let i = 1; i < objects.length; i++) {
      pdf += `${String(offsets[i] || 0).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info ${infoObj} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
    const bytes = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
    return bytes;
  }
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

function money(cents) {
  return `RM ${(Number(cents || 0) / 100).toFixed(2)}`;
}

function fmtDate(d) {
  if (!d) return '-';
  return String(d).slice(0, 10);
}

export function buildReceiptPdf({ school, receipt, payment, student, parent, allocations, cancelled }) {
  const doc = new PdfDoc({ title: `Receipt ${receipt.number}` });
  const green = '#0f5132';
  const gold = '#b8860b';

  doc.rect(0, 0, PAGE_W, 108, { fill: green });
  doc.text(40, 42, school?.name || 'MDUIK', { size: 19, bold: true, color: '#ffffff' });
  doc.text(40, 62, `${school?.category === 'tahfiz' ? 'Tahfiz' : 'Pengajian Islam'} • ${school?.state || ''}`, {
    size: 9,
    color: '#d8f3e2',
  });
  doc.text(40, 80, school?.address || '', { size: 8, color: '#c7e6d5' });
  doc.textRight(PAGE_W - 40, 45, 'RESIT RASMI', { size: 17, bold: true, color: '#ffffff' });
  doc.textRight(PAGE_W - 40, 64, 'OFFICIAL RECEIPT', { size: 9, color: '#d8f3e2' });
  doc.textRight(PAGE_W - 40, 84, receipt.number, { size: 11, bold: true, color: '#f5d67b' });

  if (cancelled) {
    doc.textCenter(PAGE_W / 2, 150, 'DIBATALKAN / CANCELLED', { size: 26, bold: true, color: '#b91c1c' });
  }

  let y = 132;
  doc.text(40, y, 'No. Resit / Receipt No.', { size: 8, color: '#6b7280' });
  doc.text(40, y + 14, receipt.number, { size: 11, bold: true });
  doc.text(200, y, 'Tarikh / Date', { size: 8, color: '#6b7280' });
  doc.text(200, y + 14, fmtDate(receipt.issued_at), { size: 11, bold: true });
  doc.text(360, y, 'Kaedah / Method', { size: 8, color: '#6b7280' });
  doc.text(360, y + 14, payment?.method === 'cash' ? 'Tunai / Cash' : 'Pindahan Bank / Bank Transfer', {
    size: 11,
    bold: true,
  });

  y += 42;
  doc.line(40, y, PAGE_W - 40, y, { color: '#e5e7eb' });
  y += 22;
  doc.text(40, y, 'DITERIMA DARIPADA / RECEIVED FROM', { size: 8, color: '#6b7280' });
  doc.text(40, y + 16, parent?.full_name || student?.full_name || '-', { size: 11, bold: true });
  doc.text(40, y + 31, parent?.email || parent?.phone || '', { size: 9, color: '#4b5563' });

  doc.text(330, y, 'UNTUK / FOR', { size: 8, color: '#6b7280' });
  doc.text(330, y + 16, student?.full_name || '-', { size: 11, bold: true });
  doc.text(330, y + 31, `ID: ${student?.id?.slice(-8) || '-'}`, { size: 9, color: '#4b5563' });

  y += 58;
  const rows = (allocations || []).map((a) => ({
    invoice: a.number,
    period: a.type === 'registration' ? `Registration ${a.period}` : a.period,
    due: fmtDate(a.due_date),
    amount: money(a.amount_cents),
  }));
  if (!rows.length) rows.push({ invoice: '-', period: 'Credit / advance', due: '-', amount: money(payment?.amount_cents) });
  const afterTable = doc.table(
    40,
    y,
    [
      { label: 'Invois / Invoice', key: 'invoice', width: 170 },
      { label: 'Perkara / Description', key: 'period', width: 190 },
      { label: 'Tarikh Akhir', key: 'due', width: 90 },
      { label: 'Jumlah', key: 'amount', width: 65 },
    ],
    rows,
    { size: 9 },
  );

  y = afterTable + 24;
  doc.rect(330, y, PAGE_W - 370, 54, { fill: '#f0f7f2', stroke: '#cfe3d6' });
  doc.text(344, y + 20, 'JUMLAH DITERIMA / AMOUNT RECEIVED', { size: 8, color: '#4b5563' });
  doc.textRight(PAGE_W - 50, y + 42, money(payment?.amount_cents), { size: 16, bold: true, color: green });
  doc.text(40, y + 22, 'Nota / Notes', { size: 8, color: '#6b7280' });
  doc.paragraph(40, y + 36, payment?.notes || 'Bayaran diterima dengan terima kasih. / Payment received with thanks.', 260, {
    size: 8.5,
    color: '#4b5563',
  });

  y += 90;
  doc.line(40, y, PAGE_W - 40, y, { color: '#e5e7eb' });
  y += 18;
  doc.text(40, y, 'Ini adalah resit yang dijana oleh komputer. Tiada tandatangan diperlukan.', {
    size: 8,
    color: '#6b7280',
  });
  doc.text(40, y + 12, 'This is a computer-generated receipt. No signature is required.', { size: 8, color: '#6b7280' });
  doc.text(40, PAGE_H - 40, `${school?.name || 'MDUIK'} • ${school?.email || ''} • ${school?.phone || ''}`, {
    size: 7.5,
    color: '#9ca3af',
  });
  doc.textRight(PAGE_W - 40, PAGE_H - 40, 'MDUIK School Administration System', { size: 7.5, color: '#9ca3af' });
  return doc.finish();
}

export function buildReportPdf({ school, title, subtitle, columns, rows, meta = [], summary = [] }) {
  const doc = new PdfDoc({ title });
  const green = '#0f5132';
  doc.rect(0, 0, PAGE_W, 92, { fill: green });
  doc.text(40, 38, school?.name || 'MDUIK', { size: 17, bold: true, color: '#ffffff' });
  doc.text(40, 58, subtitle || '', { size: 9, color: '#d8f3e2' });
  doc.textRight(PAGE_W - 40, 38, title, { size: 13, bold: true, color: '#ffffff' });
  doc.textRight(PAGE_W - 40, 58, `Dijana / Generated: ${new Date().toISOString().slice(0, 10)}`, {
    size: 8,
    color: '#d8f3e2',
  });

  let y = 116;
  if (meta.length) {
    for (const m of meta) {
      doc.text(40, y, `${m.label}:`, { size: 8, color: '#6b7280' });
      doc.text(150, y, m.value, { size: 8.5, bold: true });
      y += 13;
    }
    y += 6;
  }
  if (summary.length) {
    const boxW = (PAGE_W - 80 - (summary.length - 1) * 8) / summary.length;
    summary.forEach((s, i) => {
      const x = 40 + i * (boxW + 8);
      doc.rect(x, y, boxW, 44, { fill: '#f0f7f2', stroke: '#cfe3d6' });
      doc.text(x + 8, y + 16, s.label, { size: 7.5, color: '#4b5563' });
      doc.text(x + 8, y + 34, s.value, { size: 12, bold: true, color: green });
    });
    y += 60;
  }

  const usable = PAGE_W - 80;
  const total = columns.reduce((s, c) => s + c.width, 0);
  const scaled = columns.map((c) => ({ ...c, width: (c.width / total) * usable }));
  const end = doc.table(40, y, scaled, rows, { size: 8 });
  doc.text(40, PAGE_H - 36, `${rows.length} rekod / records`, { size: 8, color: '#6b7280' });
  doc.textRight(PAGE_W - 40, PAGE_H - 36, school?.name || 'MDUIK', { size: 8, color: '#6b7280' });
  return doc.finish();
}

export function buildStatementPdf({ school, student, invoices, summary }) {
  return buildReportPdf({
    school,
    title: 'Penyata Akaun / Statement',
    subtitle: student?.full_name || '',
    columns: [
      { label: 'Invois', key: 'number', width: 110 },
      { label: 'Jenis', key: 'type', width: 90 },
      { label: 'Tempoh', key: 'period', width: 80 },
      { label: 'Akhir', key: 'due_date', width: 80 },
      { label: 'Jumlah', value: (r) => money(r.amount_cents), width: 80 },
      { label: 'Dibayar', value: (r) => money(r.paid_cents + r.credited_cents), width: 80 },
      { label: 'Baki', value: (r) => money(r.amount_cents - r.paid_cents - r.credited_cents - r.waived_cents), width: 80 },
      { label: 'Status', key: 'status', width: 70 },
    ],
    rows: invoices,
    summary,
  });
}

export { PAGE_W, PAGE_H, money as pdfMoney, textWidth };

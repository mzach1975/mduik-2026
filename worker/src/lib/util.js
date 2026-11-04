// Shared helpers for the MDUIK Worker.
const encoder = new TextEncoder();

export function id(prefix = '') {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const body = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return prefix ? `${prefix}_${body}` : body;
}

export function nowIso() {
  return new Date().toISOString();
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function yearOf(dateStr = today()) {
  return Number(String(dateStr).slice(0, 4));
}

export function monthOf(dateStr = today()) {
  return String(dateStr).slice(0, 7);
}

export function addMonths(monthStr, count) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + count, 1));
  return d.toISOString().slice(0, 7);
}

export function firstOfNextMonth(dateStr = today()) {
  const [y, m] = monthOf(dateStr).split('-').map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
}

export function daysBetween(a, b) {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  return Math.round((db - da) / 86400000);
}

export function money(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

export function parseMoney(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

export function bad(message, status = 400, extra = {}) {
  return json({ error: message, ...extra }, status);
}

export async function readJson(c) {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
}

export function normalizeIc(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

export function maskIc(value) {
  const digits = normalizeIc(value);
  if (!digits) return null;
  if (digits.length < 4) return '****';
  return `******-**-${digits.slice(-4)}`;
}

export function maskIcStored(masked, value) {
  return masked || maskIc(value);
}

export function pageParams(c) {
  const page = Math.max(1, Number(c.req.query('page') || 1));
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query('pageSize') || 25)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows, columns) {
  const head = columns.map((c) => csvEscape(c.label)).join(',');
  const body = rows
    .map((row) => columns.map((c) => csvEscape(typeof c.value === 'function' ? c.value(row) : row[c.key])).join(','))
    .join('\r\n');
  return `\uFEFF${head}\r\n${body}`;
}

function xmlEscape(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Excel-compatible SpreadsheetML (opens natively in Excel, no zip dependency).
export function toExcel(rows, columns, title = 'Export') {
  const header = columns
    .map((c) => `<Cell ss:StyleID="head"><Data ss:Type="String">${xmlEscape(c.label)}</Data></Cell>`)
    .join('');
  const body = rows
    .map((row) => {
      const cells = columns
        .map((c) => {
          const raw = typeof c.value === 'function' ? c.value(row) : row[c.key];
          const num = typeof raw === 'number' && Number.isFinite(raw);
          return `<Cell><Data ss:Type="${num ? 'Number' : 'String'}">${xmlEscape(raw)}</Data></Cell>`;
        })
        .join('');
      return `<Row>${cells}</Row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="head"><Font ss:Bold="1"/><Interior ss:Color="#0F5132" ss:Pattern="Solid"/><Font ss:Color="#FFFFFF" ss:Bold="1"/></Style>
 </Styles>
 <Worksheet ss:Name="${xmlEscape(title).slice(0, 28)}">
  <Table><Row>${header}</Row>${body}</Table>
 </Worksheet>
</Workbook>`;
}

export function downloadHeaders(filename, contentType) {
  return {
    'content-type': contentType,
    'content-disposition': `attachment; filename="${filename}"`,
    'cache-control': 'no-store',
  };
}

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

export function pagingMeta(total, page, pageSize) {
  return { total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((v) => v.trim() !== '')) rows.push(row);
  }
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

export function csvTemplate(columns) {
  return `\uFEFF${columns.join(',')}\r\n`;
}

export function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export { encoder };

/** Remove encrypted/hashed IC fields from a row before it is sent to the client. */
export function stripIc(row) {
  if (!row) return row;
  const { ic_enc, ic_hash, ...rest } = row;
  return rest;
}

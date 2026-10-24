// Excel export (FR-29, NFR-06) using write-excel-file (browser build).
import writeXlsxFile from 'write-excel-file/browser';

export type Col<T> = { header: string; get: (row: T) => string | number | Date | null | undefined };

export async function exportXlsx<T>(fileName: string, cols: Col<T>[], rows: T[]) {
  const header = cols.map((c) => ({ value: c.header, fontWeight: 'bold' as const, backgroundColor: '#DEEEF8' }));
  const body = rows.map((r) => cols.map((c) => {
    const v = c.get(r);
    if (v instanceof Date) return { type: Date, value: v, format: 'dd/mm/yyyy hh:mm' };
    if (typeof v === 'number') return { type: Number, value: v };
    return { type: String, value: v == null ? '' : String(v) };
  }));
  await writeXlsxFile([header, ...body] as any, { columns: cols.map(() => ({ width: 20 })) }).toFile(fileName);
}

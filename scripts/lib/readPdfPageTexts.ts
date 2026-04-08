/**
 * PDF page text extraction: pdf-parse first; on failure (e.g. bad XRef), optional Python pypdf fallback.
 * Install fallback: pip3 install --user pypdf
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PDFParse } from 'pdf-parse';

const PY_SCRIPT = path.join(__dirname, 'pdf_text_pypdf.py');

function readPdfPageTextsPypdf(filePath: string): string[] {
  if (!fs.existsSync(PY_SCRIPT)) {
    throw new Error(`Missing ${PY_SCRIPT}`);
  }
  const py = process.env.PYTHON || 'python3';
  const out = execFileSync(py, [PY_SCRIPT, filePath], {
    encoding: 'utf8',
    maxBuffer: 80 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const parsed = JSON.parse(out) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('pypdf script returned non-array');
  }
  return parsed.map((p) => String(p ?? ''));
}

export async function readPdfPageTexts(filePath: string): Promise<string[]> {
  const buf = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buf });
  try {
    const result = await parser.getText();
    const pages = result.pages;
    if (pages && pages.length > 0) {
      return pages.map((p) => String(p.text || ''));
    }
    return [String(result.text || '')];
  } catch (primaryErr) {
    try {
      return readPdfPageTextsPypdf(filePath);
    } catch {
      const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      throw new Error(
        `PDF text extract failed (${msg}). For damaged PDFs install: pip3 install --user pypdf`
      );
    }
  } finally {
    await parser.destroy().catch(() => {});
  }
}

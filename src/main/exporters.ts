import { strToU8, zipSync } from "fflate";
import type { ExportFormat, ScanResult } from "../shared/types";
import { formatBytes, formatDuration } from "../shared/format";

function rows(result: ScanResult): Array<Record<string, string | number | boolean | null>> {
  return result.nodes
    .slice()
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((node) => ({
      path: node.path,
      name: node.name,
      type: node.isDirectory ? "folder" : "file",
      extension: node.extension,
      sizeBytes: node.size,
      size: formatBytes(node.size),
      files: node.fileCount,
      folders: node.folderCount,
      modifiedAt: node.modifiedAt,
      createdAt: node.createdAt,
      depth: node.depth,
      symbolicLink: node.isSymbolicLink
    }));
}

function escapeCsv(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportCsv(result: ScanResult): string {
  const data = rows(result);
  const columns = Object.keys(data[0] ?? { path: "" });
  return [columns.join(","), ...data.map((row) => columns.map((column) => escapeCsv(row[column])).join(","))].join("\n");
}

export function exportJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

export function exportXlsx(result: ScanResult): Buffer {
  const data = rows(result);
  const columns = Object.keys(data[0] ?? { path: "" });
  const sheetRows = [
    columns,
    ...data.map((row) => columns.map((column) => row[column]))
  ];
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${sheetRows
      .map(
        (row, rowIndex) => `<row r="${rowIndex + 1}">${row
          .map((value, columnIndex) => {
            const cell = `${columnName(columnIndex)}${rowIndex + 1}`;
            if (typeof value === "number" && Number.isFinite(value)) {
              return `<c r="${cell}"><v>${value}</v></c>`;
            }
            return `<c r="${cell}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
          })
          .join("")}</row>`
      )
      .join("")}
  </sheetData>
</worksheet>`;

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Scan" sheetId="1" r:id="rId1"/></sheets>
</workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Segoe UI"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`),
    "xl/worksheets/sheet1.xml": strToU8(worksheet)
  };

  return Buffer.from(zipSync(files));
}

function columnName(index: number): string {
  let value = "";
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    value = String.fromCharCode(65 + remainder) + value;
    current = Math.floor((current - 1) / 26);
  }
  return value;
}

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function exportHtml(result: ScanResult): string {
  const data = rows(result).slice(0, 10_000);
  const tableRows = data
    .map(
      (row) => `<tr><td>${escapeHtml(row.path)}</td><td>${escapeHtml(row.type)}</td><td>${escapeHtml(
        row.size
      )}</td><td>${escapeHtml(row.files)}</td><td>${escapeHtml(row.modifiedAt)}</td></tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>OpenTree Folder Analysis</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, Segoe UI, Arial, sans-serif; background: #0b1016; color: #e7edf7; }
    body { margin: 32px; }
    h1 { margin: 0 0 6px; font-size: 28px; }
    .meta { color: #9ca9ba; margin-bottom: 24px; }
    .stats { display: flex; gap: 16px; margin-bottom: 24px; }
    .stat { border: 1px solid #233246; border-radius: 8px; padding: 14px 16px; background: #111923; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-bottom: 1px solid #223047; padding: 8px; text-align: left; vertical-align: top; }
    th { color: #8bd3ff; }
  </style>
</head>
<body>
  <h1>OpenTree Folder Analysis</h1>
  <div class="meta">Scanned ${escapeHtml(result.roots.join(", "))} at ${escapeHtml(result.scannedAt)}</div>
  <div class="stats">
    <div class="stat"><strong>${escapeHtml(formatBytes(result.totals.bytes))}</strong><br>Total size</div>
    <div class="stat"><strong>${escapeHtml(result.totals.files)}</strong><br>Files</div>
    <div class="stat"><strong>${escapeHtml(result.totals.folders)}</strong><br>Folders</div>
    <div class="stat"><strong>${escapeHtml(formatDuration(result.totals.durationMs))}</strong><br>Scan time</div>
  </div>
  <table>
    <thead><tr><th>Path</th><th>Type</th><th>Size</th><th>Files</th><th>Modified</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
</body>
</html>`;
}

export function exportScan(result: ScanResult, format: Exclude<ExportFormat, "pdf">): string | Buffer {
  if (format === "json") return exportJson(result);
  if (format === "csv") return exportCsv(result);
  if (format === "xlsx") return exportXlsx(result);
  return exportHtml(result);
}

/**
 * Minimal PDF generator (no Node-only deps — pure bytes, Workers-safe).
 * Escapes text for a simple multi-line Helvetica document.
 */

function escapePdfText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E\n\r\t]/g, "?");
}

function wrapLines(text: string, maxLen = 90): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    if (para.length === 0) {
      lines.push("");
      continue;
    }
    let rest = para;
    while (rest.length > maxLen) {
      let cut = rest.lastIndexOf(" ", maxLen);
      if (cut < 20) cut = maxLen;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut).trimStart();
    }
    if (rest.length) lines.push(rest);
  }
  return lines.length ? lines : [""];
}

/** Build a simple multi-page-capable single-page PDF from plain text. */
export function buildPdf(text: string, title = "Document"): Uint8Array {
  const header = escapePdfText(title).slice(0, 80);
  const bodyLines = wrapLines(text, 88).slice(0, 60);
  const contentParts: string[] = [];
  contentParts.push("BT");
  contentParts.push("/F1 14 Tf");
  contentParts.push("50 760 Td");
  contentParts.push(`(${header}) Tj`);
  contentParts.push("/F1 11 Tf");
  contentParts.push("0 -28 Td");
  for (let i = 0; i < bodyLines.length; i++) {
    if (i > 0) contentParts.push("0 -14 Td");
    contentParts.push(`(${escapePdfText(bodyLines[i]!)}) Tj`);
  }
  contentParts.push("ET");
  const stream = contentParts.join("\n");

  const objs: string[] = [];
  objs.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objs.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  objs.push(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
      "/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
  );
  objs.push(`4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`);
  objs.push("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const o of objs) {
    offsets.push(pdf.length);
    pdf += o;
  }
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objs.length; i++) {
    pdf += String(offsets[i]!).padStart(10, "0") + " 00000 n \n";
  }
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefPos}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}

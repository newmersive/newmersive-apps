type TextPdfInput = {
  title: string;
  lines: string[];
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 48;
const TOP_Y = 790;
const FONT_SIZE = 10;
const TITLE_FONT_SIZE = 15;
const LINE_HEIGHT = 14;
const MAX_CHARS_PER_LINE = 88;
const MAX_LINES_PER_PAGE = 50;

function normalizePdfText(value: string) {
  return value
    .replace(/\r/g, "\n")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/€/g, "EUR")
    .replace(/\u00a0/g, " ")
    .replace(/\t/g, "  ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
}

function wrapLine(line: string) {
  const cleanLine = normalizePdfText(line);
  if (!cleanLine.trim()) return [""];

  const out: string[] = [];
  let current = "";

  for (const word of cleanLine.split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= MAX_CHARS_PER_LINE) {
      current = next;
      continue;
    }

    if (current) out.push(current);

    if (word.length > MAX_CHARS_PER_LINE) {
      for (let index = 0; index < word.length; index += MAX_CHARS_PER_LINE) {
        const chunk = word.slice(index, index + MAX_CHARS_PER_LINE);
        if (chunk.length === MAX_CHARS_PER_LINE) out.push(chunk);
        else current = chunk;
      }
    } else {
      current = word;
    }
  }

  if (current) out.push(current);
  return out;
}

function paginate(lines: string[]) {
  const wrapped = lines.flatMap((line) => wrapLine(line));
  const pages: string[][] = [];

  for (let index = 0; index < wrapped.length; index += MAX_LINES_PER_PAGE) {
    pages.push(wrapped.slice(index, index + MAX_LINES_PER_PAGE));
  }

  return pages.length ? pages : [[""]];
}

function toPdfLiteral(value: string) {
  const clean = normalizePdfText(value);
  const bytes = Buffer.from(clean, "latin1");
  let escaped = "";

  for (const byte of bytes) {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) {
      escaped += `\\${String.fromCharCode(byte)}`;
    } else if (byte < 0x20 || byte > 0x7e) {
      escaped += `\\${byte.toString(8).padStart(3, "0")}`;
    } else {
      escaped += String.fromCharCode(byte);
    }
  }

  return `(${escaped})`;
}

function pageContent(title: string, lines: string[], pageNumber: number, totalPages: number) {
  const content = [
    "BT",
    `/F2 ${TITLE_FONT_SIZE} Tf`,
    `${MARGIN_X} ${TOP_Y} Td`,
    `${toPdfLiteral(title)} Tj`,
    "ET",
    "BT",
    `/F1 ${FONT_SIZE} Tf`,
    `${LINE_HEIGHT} TL`,
    `${MARGIN_X} ${TOP_Y - 28} Td`,
  ];

  for (const line of lines) {
    content.push(`${toPdfLiteral(line)} Tj`, "T*");
  }

  content.push("ET");
  content.push(
    "BT",
    "/F1 8 Tf",
    `${MARGIN_X} 32 Td`,
    `${toPdfLiteral(`Página ${pageNumber} de ${totalPages}`)} Tj`,
    "ET"
  );

  return content.join("\n");
}

export function buildTextPdf(input: TextPdfInput) {
  const pages = paginate(input.lines.map(normalizePdfText));
  const objects: string[] = [];

  const addObject = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const catalogId = addObject("");
  const pagesId = addObject("");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const boldFontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const pageIds: number[] = [];

  pages.forEach((pageLines, index) => {
    const content = pageContent(input.title, pageLines, index + 1, pages.length);
    const contentId = addObject(
      `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`
    );
    const pageId = addObject(
      [
        "<< /Type /Page",
        `/Parent ${pagesId} 0 R`,
        `/MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}]`,
        `/Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> >>`,
        `/Contents ${contentId} 0 R`,
        ">>",
      ].join(" ")
    );
    pageIds.push(pageId);
  });

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n%\xFF\xFF\xFF\xFF\n";
  const offsets = [0];

  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

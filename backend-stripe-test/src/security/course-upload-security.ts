import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { ENV } from "../config/env";

const execFileAsync = promisify(execFile);

export const COURSE_UPLOAD_EXTENSIONS = new Set([
  ".csv",
  ".json",
  ".mq5",
  ".mqh",
  ".md",
  ".txt",
  ".log",
  ".html",
  ".pdf",
  ".zip",
]);

const TEXT_EXTENSIONS = new Set([
  ".csv",
  ".json",
  ".mq5",
  ".mqh",
  ".md",
  ".txt",
  ".log",
  ".html",
]);

const DECLARED_MIME_TYPES: Record<string, Set<string>> = {
  ".csv": new Set(["text/csv", "text/plain", "application/vnd.ms-excel", "application/octet-stream"]),
  ".json": new Set(["application/json", "text/json", "text/plain", "application/octet-stream"]),
  ".mq5": new Set(["text/plain", "application/octet-stream"]),
  ".mqh": new Set(["text/plain", "application/octet-stream"]),
  ".md": new Set(["text/markdown", "text/plain", "application/octet-stream"]),
  ".txt": new Set(["text/plain", "application/octet-stream"]),
  ".log": new Set(["text/plain", "application/octet-stream"]),
  ".html": new Set(["text/html", "text/plain", "application/octet-stream"]),
  ".pdf": new Set(["application/pdf", "application/octet-stream"]),
  ".zip": new Set(["application/zip", "application/x-zip-compressed", "application/octet-stream"]),
};

const BLOCKED_ARCHIVE_EXTENSIONS = new Set([
  ".apk",
  ".app",
  ".bat",
  ".cmd",
  ".com",
  ".cpl",
  ".dll",
  ".dmg",
  ".exe",
  ".hta",
  ".img",
  ".iso",
  ".jar",
  ".js",
  ".jse",
  ".lnk",
  ".msi",
  ".msp",
  ".ps1",
  ".scr",
  ".vbe",
  ".vbs",
  ".wsf",
]);

const PDF_ACTIVE_CONTENT_MARKERS = [
  "/JavaScript",
  "/JS",
  "/Launch",
  "/OpenAction",
  "/RichMedia",
  "/EmbeddedFile",
];

export type CourseUploadInspection = {
  displayName: string;
  extension: string;
  detectedMimeType: string;
  textEncoding: "utf8" | "utf16le" | null;
};

export class CourseUploadSecurityError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "CourseUploadSecurityError";
  }
}

function extensionOf(fileName: string) {
  return path.extname(String(fileName || "")).toLowerCase();
}

export function sanitizeCourseUploadName(fileName: string) {
  const normalized = String(fileName || "")
    .normalize("NFKC")
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  const extension = extensionOf(normalized);
  const fallbackExtension = COURSE_UPLOAD_EXTENSIONS.has(extension) ? extension : ".txt";
  const base = normalized.slice(0, normalized.length - extension.length).trim() || "entrega";
  return `${base.slice(0, 110)}${fallbackExtension}`;
}

export function validateCourseUploadMetadata(fileName: string, declaredMimeType: string) {
  const extension = extensionOf(fileName);
  if (!COURSE_UPLOAD_EXTENSIONS.has(extension)) {
    throw new CourseUploadSecurityError("UNSUPPORTED_FILE_TYPE");
  }
  const mime = String(declaredMimeType || "application/octet-stream").toLowerCase().split(";")[0].trim();
  if (!DECLARED_MIME_TYPES[extension]?.has(mime)) {
    throw new CourseUploadSecurityError("FILE_TYPE_MISMATCH");
  }
  return extension;
}

function assertNotExecutable(buffer: Buffer) {
  const signatures = [
    Buffer.from([0x4d, 0x5a]),
    Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
    Buffer.from([0xca, 0xfe, 0xba, 0xbe]),
    Buffer.from([0xfe, 0xed, 0xfa, 0xce]),
    Buffer.from([0xfe, 0xed, 0xfa, 0xcf]),
    Buffer.from([0xcf, 0xfa, 0xed, 0xfe]),
  ];
  if (signatures.some((signature) => buffer.subarray(0, signature.length).equals(signature))) {
    throw new CourseUploadSecurityError("EXECUTABLE_CONTENT_BLOCKED");
  }
}

function inspectText(buffer: Buffer): "utf8" | "utf16le" {
  assertNotExecutable(buffer);
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    try {
      new TextDecoder("utf-16le", { fatal: true }).decode(buffer.subarray(2));
      return "utf16le";
    } catch {
      throw new CourseUploadSecurityError("INVALID_TEXT_ENCODING");
    }
  }
  if (buffer.includes(0)) {
    throw new CourseUploadSecurityError("BINARY_CONTENT_BLOCKED");
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return "utf8";
  } catch {
    throw new CourseUploadSecurityError("INVALID_TEXT_ENCODING");
  }
}

function inspectPdf(buffer: Buffer) {
  if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new CourseUploadSecurityError("FILE_TYPE_MISMATCH");
  }
  const tail = buffer.subarray(Math.max(0, buffer.length - 2_048)).toString("latin1");
  if (!tail.includes("%%EOF")) {
    throw new CourseUploadSecurityError("INVALID_PDF");
  }
  const source = buffer.toString("latin1");
  if (PDF_ACTIVE_CONTENT_MARKERS.some((marker) => source.includes(marker))) {
    throw new CourseUploadSecurityError("ACTIVE_PDF_CONTENT_BLOCKED");
  }
}

function findZipEnd(buffer: Buffer) {
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function unsafeArchivePath(fileName: string) {
  const normalized = fileName.replace(/\\/g, "/");
  return (
    normalized.includes("\u0000") ||
    normalized.startsWith("/") ||
    /^[a-z]:\//i.test(normalized) ||
    normalized.split("/").some((part) => part === "..")
  );
}

function inspectZip(buffer: Buffer) {
  if (
    buffer.length < 22 ||
    ![0x04034b50, 0x06054b50].includes(buffer.readUInt32LE(0))
  ) {
    throw new CourseUploadSecurityError("FILE_TYPE_MISMATCH");
  }
  const endOffset = findZipEnd(buffer);
  if (endOffset < 0) throw new CourseUploadSecurityError("INVALID_ZIP");
  const diskNumber = buffer.readUInt16LE(endOffset + 4);
  const centralDisk = buffer.readUInt16LE(endOffset + 6);
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const centralSize = buffer.readUInt32LE(endOffset + 12);
  const centralOffset = buffer.readUInt32LE(endOffset + 16);
  if (diskNumber !== 0 || centralDisk !== 0) {
    throw new CourseUploadSecurityError("MULTIPART_ZIP_BLOCKED");
  }
  if (entryCount > ENV.COURSE_ARCHIVE_MAX_FILES) {
    throw new CourseUploadSecurityError("ARCHIVE_TOO_MANY_FILES");
  }
  if (centralOffset + centralSize > endOffset) {
    throw new CourseUploadSecurityError("INVALID_ZIP");
  }

  let offset = centralOffset;
  let totalCompressed = 0;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new CourseUploadSecurityError("INVALID_ZIP");
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const externalAttributes = buffer.readUInt32LE(offset + 38);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if (nextOffset > buffer.length || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new CourseUploadSecurityError("ZIP64_ARCHIVE_BLOCKED");
    }
    if ((flags & 0x0001) !== 0) {
      throw new CourseUploadSecurityError("ENCRYPTED_ARCHIVE_BLOCKED");
    }
    const fileName = buffer
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString((flags & 0x0800) !== 0 ? "utf8" : "latin1");
    const unixMode = externalAttributes >>> 16;
    if ((unixMode & 0xf000) === 0xa000 || unsafeArchivePath(fileName)) {
      throw new CourseUploadSecurityError("UNSAFE_ARCHIVE_ENTRY");
    }
    if (!fileName.endsWith("/") && BLOCKED_ARCHIVE_EXTENSIONS.has(extensionOf(fileName))) {
      throw new CourseUploadSecurityError("ARCHIVE_EXECUTABLE_BLOCKED");
    }
    totalCompressed += compressedSize;
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > ENV.COURSE_ARCHIVE_MAX_UNCOMPRESSED_BYTES) {
      throw new CourseUploadSecurityError("ARCHIVE_EXPANSION_LIMIT");
    }
    offset = nextOffset;
  }
  const ratio = totalUncompressed / Math.max(1, totalCompressed);
  if (ratio > ENV.COURSE_ARCHIVE_MAX_RATIO) {
    throw new CourseUploadSecurityError("ARCHIVE_COMPRESSION_RATIO_LIMIT");
  }
}

async function scanForMalware(filePath: string) {
  if (ENV.COURSE_MALWARE_SCAN_MODE === "disabled") return;
  const scanner = ENV.COURSE_MALWARE_SCANNER_PATH;
  try {
    await fs.promises.access(scanner, fs.constants.X_OK);
  } catch {
    if (ENV.COURSE_MALWARE_SCAN_MODE === "required") {
      throw new CourseUploadSecurityError("MALWARE_SCANNER_UNAVAILABLE");
    }
    return;
  }
  try {
    const isDaemonScanner = path.basename(scanner).toLowerCase().startsWith("clamdscan");
    await execFileAsync(
      scanner,
      [...(isDaemonScanner ? ["--fdpass"] : []), "--no-summary", filePath],
      { timeout: ENV.COURSE_MALWARE_SCAN_TIMEOUT_MS, maxBuffer: 64 * 1_024 },
    );
  } catch (error: any) {
    if (error?.code === 1) throw new CourseUploadSecurityError("MALWARE_DETECTED");
    throw new CourseUploadSecurityError("MALWARE_SCAN_FAILED");
  }
}

export async function inspectCourseUpload(input: {
  filePath: string;
  originalName: string;
  declaredMimeType: string;
  reportedSize?: number;
}): Promise<CourseUploadInspection> {
  const extension = validateCourseUploadMetadata(input.originalName, input.declaredMimeType);
  const stat = await fs.promises.lstat(input.filePath);
  if (!stat.isFile()) throw new CourseUploadSecurityError("INVALID_UPLOAD_FILE");
  if (stat.size < 1) throw new CourseUploadSecurityError("EMPTY_UPLOAD");
  if (stat.size > ENV.COURSE_MAX_UPLOAD_BYTES || (input.reportedSize && input.reportedSize !== stat.size)) {
    throw new CourseUploadSecurityError("UPLOAD_SIZE_MISMATCH");
  }
  const buffer = await fs.promises.readFile(input.filePath);
  let detectedMimeType = "application/octet-stream";
  let textEncoding: CourseUploadInspection["textEncoding"] = null;
  if (TEXT_EXTENSIONS.has(extension)) {
    textEncoding = inspectText(buffer);
    detectedMimeType = "text/plain";
  } else if (extension === ".pdf") {
    inspectPdf(buffer);
    detectedMimeType = "application/pdf";
  } else if (extension === ".zip") {
    inspectZip(buffer);
    detectedMimeType = "application/zip";
  }
  await scanForMalware(input.filePath);
  await fs.promises.chmod(input.filePath, 0o640).catch(() => undefined);
  return {
    displayName: sanitizeCourseUploadName(input.originalName),
    extension,
    detectedMimeType,
    textEncoding,
  };
}

export async function readCourseTextPreview(
  filePath: string,
  encoding: CourseUploadInspection["textEncoding"],
) {
  const buffer = await fs.promises.readFile(filePath);
  if (encoding === "utf16le") {
    return new TextDecoder("utf-16le", { fatal: true })
      .decode(buffer.subarray(2))
      .slice(0, 24_000);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(buffer).slice(0, 24_000);
}

import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import {
  CourseUploadSecurityError,
  inspectCourseUpload,
  sanitizeCourseUploadName,
  validateCourseUploadMetadata,
} from "../src/security/course-upload-security";

function zipWithEntry(
  fileName: string,
  body = Buffer.from("hello"),
  sizes?: { compressed: number; uncompressed: number },
) {
  const name = Buffer.from(fileName, "utf8");
  const compressedSize = sizes?.compressed ?? body.length;
  const uncompressedSize = sizes?.uncompressed ?? body.length;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt32LE(compressedSize, 18);
  local.writeUInt32LE(uncompressedSize, 22);
  local.writeUInt16LE(name.length, 26);

  const centralOffset = local.length + name.length + body.length;
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(0x0314, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt32LE(compressedSize, 20);
  central.writeUInt32LE(uncompressedSize, 24);
  central.writeUInt16LE(name.length, 28);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, name, body, central, name, end]);
}

async function expectSecurityError(action: () => Promise<unknown>, code: string) {
  await assert.rejects(action, (error: unknown) => {
    return error instanceof CourseUploadSecurityError && error.code === code;
  });
}

describe("course upload security", () => {
  let directory = "";

  before(async () => {
    directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "newmersive-upload-security-"));
  });

  after(async () => {
    await fs.promises.rm(directory, { recursive: true, force: true });
  });

  it("normalizes display names and checks declared extension/MIME pairs", () => {
    assert.equal(sanitizeCourseUploadName("../../Informe\u202e.pdf"), "Informe.pdf");
    assert.equal(validateCourseUploadMetadata("strategy.mq5", "application/octet-stream"), ".mq5");
    assert.throws(
      () => validateCourseUploadMetadata("report.pdf", "text/html"),
      (error: unknown) => error instanceof CourseUploadSecurityError && error.code === "FILE_TYPE_MISMATCH",
    );
  });

  it("accepts UTF-8 source while rejecting disguised executable content", async () => {
    const valid = path.join(directory, "valid.txt");
    await fs.promises.writeFile(valid, "RiskPercent=1.0;\n");
    const result = await inspectCourseUpload({
      filePath: valid,
      originalName: "strategy.txt",
      declaredMimeType: "text/plain",
      reportedSize: (await fs.promises.stat(valid)).size,
    });
    assert.equal(result.textEncoding, "utf8");
    assert.equal(result.detectedMimeType, "text/plain");

    const executable = path.join(directory, "fake.txt");
    await fs.promises.writeFile(executable, Buffer.from([0x4d, 0x5a, 0, 0, 1, 2]));
    await expectSecurityError(
      () => inspectCourseUpload({
        filePath: executable,
        originalName: "notes.txt",
        declaredMimeType: "text/plain",
      }),
      "EXECUTABLE_CONTENT_BLOCKED",
    );
  });

  it("rejects malformed and active-content PDFs", async () => {
    const malformed = path.join(directory, "malformed.pdf");
    await fs.promises.writeFile(malformed, "not a pdf");
    await expectSecurityError(
      () => inspectCourseUpload({
        filePath: malformed,
        originalName: "report.pdf",
        declaredMimeType: "application/pdf",
      }),
      "FILE_TYPE_MISMATCH",
    );

    const active = path.join(directory, "active.pdf");
    await fs.promises.writeFile(active, "%PDF-1.4\n1 0 obj << /OpenAction 2 0 R >> endobj\n%%EOF");
    await expectSecurityError(
      () => inspectCourseUpload({
        filePath: active,
        originalName: "report.pdf",
        declaredMimeType: "application/pdf",
      }),
      "ACTIVE_PDF_CONTENT_BLOCKED",
    );
  });

  it("blocks traversal, executables and expansion attacks inside ZIP files", async () => {
    const valid = path.join(directory, "valid.zip");
    await fs.promises.writeFile(valid, zipWithEntry("src/strategy.mq5"));
    const accepted = await inspectCourseUpload({
      filePath: valid,
      originalName: "strategy.zip",
      declaredMimeType: "application/zip",
    });
    assert.equal(accepted.detectedMimeType, "application/zip");

    for (const [name, archive, expected] of [
      ["traversal", zipWithEntry("../secret.txt"), "UNSAFE_ARCHIVE_ENTRY"],
      ["executable", zipWithEntry("payload.exe"), "ARCHIVE_EXECUTABLE_BLOCKED"],
      ["bomb", zipWithEntry("large.txt", Buffer.from("x"), { compressed: 1, uncompressed: 1_000 }), "ARCHIVE_COMPRESSION_RATIO_LIMIT"],
    ] as const) {
      const filePath = path.join(directory, `${name}.zip`);
      await fs.promises.writeFile(filePath, archive);
      await expectSecurityError(
        () => inspectCourseUpload({
          filePath,
          originalName: `${name}.zip`,
          declaredMimeType: "application/zip",
        }),
        expected,
      );
    }
  });
});

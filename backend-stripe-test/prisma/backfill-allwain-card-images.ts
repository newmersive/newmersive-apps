import "dotenv/config";

import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import {
  ensureAllwainImageMeta,
  ensureAllwainRequestImageMeta,
} from "../src/services/allwain-card-images.service";
import type { AllwainScanExtractedFields } from "../src/shared/types";

const BATCH_SIZE = 20;

function createClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL_MISSING");
  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return { prisma, pool };
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function imageSignature(meta: Record<string, unknown>) {
  return JSON.stringify([
    meta.imageUrl,
    meta.imageKey,
    meta.imageSource,
    meta.imageIllustrative,
    meta.imageAlt,
    meta.imageAssignedAt,
  ]);
}

async function inBatches<T>(items: T[], action: (item: T) => Promise<void>) {
  for (let offset = 0; offset < items.length; offset += BATCH_SIZE) {
    await Promise.all(items.slice(offset, offset + BATCH_SIZE).map(action));
  }
}

async function main() {
  const { prisma, pool } = createClient();
  let offersUpdated = 0;
  let requestsUpdated = 0;

  try {
    const offers = await prisma.offer.findMany({
      where: { owner: "allwain" },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        subcategory: true,
        productKind: true,
        meta: true,
      },
    });

    await inBatches(offers, async (offer) => {
      const current = jsonObject(offer.meta);
      const next = ensureAllwainImageMeta(current, {
        title: offer.title,
        description: offer.description,
        category: offer.category || current.category,
        subcategory: offer.subcategory || current.subcategory,
        productKind: offer.productKind || current.productKind,
      });
      if (imageSignature(current) === imageSignature(next)) return;
      await prisma.offer.update({
        where: { id: offer.id },
        data: { meta: next as Prisma.InputJsonValue },
      });
      offersUpdated += 1;
    });

    const requests = await prisma.allwainScanRequest.findMany({
      select: {
        id: true,
        title: true,
        extracted: true,
        imageMeta: true,
      },
    });

    await inBatches(requests, async (request) => {
      const current = jsonObject(request.imageMeta);
      const extracted = jsonObject(
        request.extracted,
      ) as unknown as AllwainScanExtractedFields;
      const next = ensureAllwainRequestImageMeta(
        current,
        extracted,
        request.title,
      );
      if (JSON.stringify(current) === JSON.stringify(next)) return;
      await prisma.allwainScanRequest.update({
        where: { id: request.id },
        data: { imageMeta: next as unknown as Prisma.InputJsonValue },
      });
      requestsUpdated += 1;
    });

    process.stdout.write(
      `${JSON.stringify({ offersUpdated, requestsUpdated })}\n`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});

import { ENV } from "../config/env";
import { closePrisma, getPrisma } from "../db/prisma";
import { recordCourseAudit } from "../services/course-campus.service";
import { sendCourseHealthAlertEmail } from "../services/course-mailer.service";

const targets = [
  ["newmersive_api", "https://www.newmersive.es/api/health"],
  ["newmersive_access", "https://www.newmersive.es/access.html"],
  ["trueqia_api", "https://www.trueqia.es/api/health"],
  ["allwain_api", "https://www.allwain.es/api/health"],
] as const;

async function check(name: string, url: string) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: { "User-Agent": "NewmersiveHealthMonitor/1.0" } });
    return { name, ok: response.ok, status: response.status, durationMs: Date.now() - startedAt };
  } catch (error: unknown) {
    return { name, ok: false, status: 0, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message.slice(0, 200) : "REQUEST_FAILED" };
  }
}

async function run() {
  const results = await Promise.all(targets.map(([name, url]) => check(name, url)));
  const failed = results.filter((item) => !item.ok);
  if (!failed.length) {
    const latestFailure = ENV.STORAGE_DRIVER === "postgres"
      ? await (getPrisma() as any).courseAuditEvent.findFirst({ where: { action: "course.monitor.failed" }, orderBy: { createdAt: "desc" } })
      : null;
    const latestRecovery = ENV.STORAGE_DRIVER === "postgres"
      ? await (getPrisma() as any).courseAuditEvent.findFirst({ where: { action: "course.monitor.recovered" }, orderBy: { createdAt: "desc" } })
      : null;
    if (latestFailure && (!latestRecovery || latestRecovery.createdAt < latestFailure.createdAt)) {
      await recordCourseAudit({ action: "course.monitor.recovered", metadata: { results } });
      await sendCourseHealthAlertEmail({ recovered: true, details: results });
    }
    console.log("COURSE_HEALTH_OK", JSON.stringify(results));
    return;
  }

  const dedupeAfter = new Date(Date.now() - 30 * 60_000);
  const recent = ENV.STORAGE_DRIVER === "postgres"
    ? await (getPrisma() as any).courseAuditEvent.findFirst({ where: { action: "course.monitor.failed", createdAt: { gte: dedupeAfter } } })
    : null;
  if (!recent) {
    await recordCourseAudit({ action: "course.monitor.failed", metadata: { results } });
    await sendCourseHealthAlertEmail({ recovered: false, details: failed });
  }
  console.error("COURSE_HEALTH_FAILED", JSON.stringify(failed));
  process.exitCode = 1;
}

run()
  .catch((error) => {
    console.error("COURSE_HEALTH_MONITOR_ERROR", error);
    process.exitCode = 1;
  })
  .finally(() => closePrisma());

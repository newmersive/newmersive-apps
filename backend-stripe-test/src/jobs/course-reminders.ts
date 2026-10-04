import { ENV } from "../config/env";
import { closePrisma, getPrisma } from "../db/prisma";
import { courseEmailConfigured, sendCourseReminderEmail } from "../services/course-mailer.service";

async function run() {
  if (ENV.STORAGE_DRIVER !== "postgres" || !courseEmailConfigured()) {
    console.log("COURSE_REMINDERS_SKIPPED_EMAIL_NOT_CONFIGURED");
    return;
  }

  const prisma = getPrisma() as any;
  const now = new Date();
  const inactiveBefore = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const dedupeAfter = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  const entitlements = await prisma.courseEntitlement.findMany({
    where: {
      entitlement: { in: ["course_starter", "course_professional"] },
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });

  const userIds = Array.from(new Set(entitlements.map((item: any) => item.userId))) as string[];
  let sent = 0;
  for (const userId of userIds) {
    const [user, progress, recentReminder] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } }),
      prisma.courseProgress.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } }),
      prisma.courseEmailDelivery.findFirst({ where: { userId, template: "course_reminder", createdAt: { gte: dedupeAfter } } }),
    ]);
    if (!user || recentReminder) continue;
    if (progress && progress.updatedAt > inactiveBefore) continue;
    const result = await sendCourseReminderEmail(user);
    if (result.sent) sent += 1;
  }
  console.log(`COURSE_REMINDERS_SENT=${sent}`);
}

run()
  .catch((error) => {
    console.error("COURSE_REMINDERS_FAILED", error);
    process.exitCode = 1;
  })
  .finally(() => closePrisma());

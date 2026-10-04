import crypto from "crypto";
import { Request, Response } from "express";
import { ENV } from "../config/env";
import { AuthUser, CourseEntitlement } from "../shared/types";
import { changePassword, getUserProfile, requestPasswordReset } from "../services/auth.service";
import { recordCourseAudit } from "../services/course-campus.service";
import { grantCourseEntitlementByEmail, revokeCourseEntitlement } from "../services/course-entitlements.service";
import {
  sendCourseCertificateEmail,
  sendCoursePaymentEmail,
  sendCoursePasswordChangedEmail,
  sendCourseRefundEmail,
  sendCourseSupportAdminEmail,
  sendCourseSupportCreatedEmail,
  sendCourseSupportStatusEmail,
  sendPasswordResetEmail,
} from "../services/course-mailer.service";
import {
  claimCoursePaymentEvent,
  createCourseSupportTicket,
  finishCoursePaymentEvent,
  getCourseCertificateByCode,
  getCourseCertificateByUser,
  getCourseCertificateEligibility,
  getCourseOperationsDashboard,
  getCoursePaymentByIntent,
  getCoursePaymentBySession,
  issueCourseCertificate,
  listCourseSupportTickets,
  recordCourseAnalytics,
  triageCourseSupport,
  updateCoursePaymentStatus,
  updateCourseSupportTicket,
  upsertCoursePayment,
} from "../services/course-operations.service";
import { buildTextPdf } from "../services/pdf.service";

const PLAN_ENTITLEMENTS: Record<string, CourseEntitlement> = {
  starter: "course_starter",
  professional: "course_professional",
};
const SUPPORT_CATEGORIES = new Set(["access", "payment", "content", "submission", "technical", "mentoring", "other"]);
const SUPPORT_STATUSES = new Set(["open", "in_progress", "waiting_student", "resolved", "closed"]);

function user(req: Request) {
  return (req as any).user as AuthUser;
}

function rawBody(req: Request) {
  return (req as any).rawBody as Buffer | undefined;
}

function safeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const serialized = JSON.stringify(value);
  if (serialized.length > 4_000) throw new Error("METADATA_TOO_LARGE");
  return JSON.parse(serialized) as Record<string, unknown>;
}

function verifyStripeSignature(payload: Buffer, header: string, secret: string) {
  const parts = header.split(",").map((part) => part.trim().split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || !signatures.length || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1_000 - Number(timestamp)) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${payload.toString("utf8")}`).digest("hex");
  return signatures.some((signature) => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  });
}

export async function postCourseStripeWebhook(req: Request, res: Response) {
  if (!ENV.STRIPE_WEBHOOK_SECRET) return res.status(503).json({ error: "STRIPE_WEBHOOK_NOT_CONFIGURED" });
  const payload = rawBody(req);
  const signature = String(req.headers["stripe-signature"] || "");
  if (!payload || !verifyStripeSignature(payload, signature, ENV.STRIPE_WEBHOOK_SECRET)) {
    return res.status(400).json({ error: "INVALID_STRIPE_SIGNATURE" });
  }

  const event = req.body as any;
  if (!event?.id || !event?.type || !event?.data?.object) return res.status(400).json({ error: "INVALID_STRIPE_EVENT" });
  const claim = await claimCoursePaymentEvent({
    providerEventId: String(event.id),
    type: String(event.type),
    metadata: { livemode: Boolean(event.livemode), apiVersion: event.api_version || null },
  });
  if (!claim.claimed) return res.status(200).json({ received: true, duplicate: true });

  try {
    if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
      await processPaidCheckout(event.data.object);
      await finishCoursePaymentEvent(event.id, "processed");
    } else if (["charge.refunded", "charge.dispute.created"].includes(event.type)) {
      await processPaymentReversal(event.type, event.data.object);
      await finishCoursePaymentEvent(event.id, "processed");
    } else {
      await finishCoursePaymentEvent(event.id, "ignored");
    }
    return res.status(200).json({ received: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "STRIPE_EVENT_FAILED";
    await finishCoursePaymentEvent(event.id, "failed", message);
    console.error("COURSE_STRIPE_WEBHOOK_FAILED", event.id, message);
    return res.status(500).json({ error: "STRIPE_EVENT_FAILED" });
  }
}

async function processPaidCheckout(session: any) {
  if (session.payment_status && session.payment_status !== "paid") throw new Error("STRIPE_SESSION_NOT_PAID");
  const plan = String(session.metadata?.plan || "");
  const entitlement = String(session.metadata?.entitlement || "") as CourseEntitlement;
  if (session.metadata?.product !== "newmersive_robot_lab" || PLAN_ENTITLEMENTS[plan] !== entitlement) {
    throw new Error("STRIPE_METADATA_MISMATCH");
  }
  const email = String(session.customer_details?.email || session.customer_email || "").trim().toLowerCase();
  if (!email || !session.id) throw new Error("STRIPE_CUSTOMER_EMAIL_REQUIRED");

  const grant = await grantCourseEntitlementByEmail({
    email,
    name: session.customer_details?.name || undefined,
    entitlement,
    source: "stripe",
    metadata: { checkoutSessionId: session.id, paymentIntentId: session.payment_intent || null },
  });
  await upsertCoursePayment({
    checkoutSessionId: String(session.id),
    paymentIntentId: session.payment_intent ? String(session.payment_intent) : null,
    userId: grant.user.id,
    email,
    plan,
    entitlement,
    status: "paid",
    amountTotal: Number.isFinite(session.amount_total) ? Number(session.amount_total) : null,
    currency: session.currency ? String(session.currency) : null,
    metadata: { livemode: Boolean(session.livemode) },
  });
  await recordCourseAudit({ actorUserId: grant.user.id, targetUserId: grant.user.id, action: "course.payment.confirmed", metadata: { plan, entitlement, checkoutSessionId: session.id } });
  await sendCoursePaymentEmail({ userId: grant.user.id, email, plan });
  if (grant.createdUser) {
    const token = await requestPasswordReset(email);
    if (token) await sendPasswordResetEmail({ userId: grant.user.id, email, token });
  }
}

async function processPaymentReversal(eventType: string, charge: any) {
  const paymentIntentId = String(charge.payment_intent || "");
  if (!paymentIntentId) throw new Error("STRIPE_PAYMENT_INTENT_REQUIRED");
  const payment = await getCoursePaymentByIntent(paymentIntentId) as any;
  if (!payment) throw new Error("COURSE_PAYMENT_NOT_FOUND");
  const fullRefund = charge.refunded === true || (
    Number.isFinite(charge.amount) && Number.isFinite(charge.amount_refunded) && Number(charge.amount_refunded) >= Number(charge.amount)
  );
  const status = eventType === "charge.refunded" ? (fullRefund ? "refunded" : "partially_refunded") : "disputed";
  if (payment.status !== status) {
    await updateCoursePaymentStatus(payment.checkoutSessionId, status, { reversalEvent: eventType });
    if (payment.userId && status !== "partially_refunded") {
      await revokeCourseEntitlement(payment.userId, payment.entitlement as CourseEntitlement).catch(() => null);
      await recordCourseAudit({ actorUserId: null, targetUserId: payment.userId, action: `course.payment.${status}`, metadata: { checkoutSessionId: payment.checkoutSessionId } });
    }
    if (status !== "partially_refunded") await sendCourseRefundEmail({ userId: payment.userId, email: payment.email, status });
  }
}

export async function getCourseCheckoutStatus(req: Request, res: Response) {
  const sessionId = String(req.params.sessionId || "");
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return res.status(400).json({ error: "INVALID_SESSION_ID" });
  const payment = await getCoursePaymentBySession(sessionId) as any;
  if (!payment) return res.status(202).json({ status: "processing" });
  return res.status(200).json({ status: payment.status, plan: payment.plan, accessGranted: ["paid", "partially_refunded"].includes(payment.status) });
}

export async function postCourseAnalytics(req: Request, res: Response) {
  try {
    const current = user(req);
    const event = await recordCourseAnalytics({ userId: current.id, name: String(req.body?.name || ""), metadata: safeMetadata(req.body?.metadata) });
    return res.status(201).json({ ok: true, eventId: event.id });
  } catch (error: unknown) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "ANALYTICS_FAILED" });
  }
}

export async function postCourseSupport(req: Request, res: Response) {
  const current = user(req);
  const category = String(req.body?.category || "other");
  const subject = String(req.body?.subject || "").trim().slice(0, 160);
  const message = String(req.body?.message || "").trim().slice(0, 8_000);
  if (!SUPPORT_CATEGORIES.has(category) || subject.length < 4 || message.length < 10) {
    return res.status(400).json({ error: "INVALID_SUPPORT_REQUEST" });
  }
  const triage = await triageCourseSupport({ category, subject, message });
  const ticket = await createCourseSupportTicket({ userId: current.id, category, subject, message, priority: triage.priority, aiTriage: triage });
  const profile = await getUserProfile(current.id);
  if (profile?.email) {
    await Promise.all([
      sendCourseSupportCreatedEmail({ userId: current.id, email: profile.email, ticketId: ticket.id, subject, firstResponse: triage.first_response }),
      sendCourseSupportAdminEmail({ ticketId: ticket.id, subject, priority: triage.priority }),
    ]);
  }
  await recordCourseAnalytics({ userId: current.id, name: "support.created", metadata: { category, priority: triage.priority } });
  await recordCourseAudit({ actorUserId: current.id, targetUserId: current.id, action: "course.support.created", metadata: { ticketId: ticket.id, category, priority: triage.priority } });
  return res.status(201).json({ ticket });
}

export async function getCourseSupport(req: Request, res: Response) {
  return res.status(200).json({ tickets: await listCourseSupportTickets(user(req).id) });
}

export async function patchCourseAdminSupport(req: Request, res: Response) {
  const current = user(req);
  const status = String(req.body?.status || "");
  if (!SUPPORT_STATUSES.has(status)) return res.status(400).json({ error: "INVALID_SUPPORT_STATUS" });
  const ticket = await updateCourseSupportTicket(req.params.id, {
    status,
    adminNotes: String(req.body?.adminNotes || ""),
    assignedTo: current.id,
  }) as any;
  if (!ticket) return res.status(404).json({ error: "SUPPORT_TICKET_NOT_FOUND" });
  const profile = await getUserProfile(ticket.userId);
  if (profile?.email) await sendCourseSupportStatusEmail({ userId: ticket.userId, email: profile.email, ticketId: ticket.id, status, notes: ticket.adminNotes });
  await recordCourseAudit({ actorUserId: current.id, targetUserId: ticket.userId, action: "course.support.updated", metadata: { ticketId: ticket.id, status } });
  return res.status(200).json({ ticket });
}

export async function getCourseAdminOperations(_req: Request, res: Response) {
  return res.status(200).json({
    operations: await getCourseOperationsDashboard(),
    tickets: await listCourseSupportTickets(),
  });
}

export async function getCourseCertificate(req: Request, res: Response) {
  const current = user(req);
  return res.status(200).json({
    eligibility: await getCourseCertificateEligibility(current),
    certificate: await getCourseCertificateByUser(current.id),
  });
}

export async function postCourseCertificate(req: Request, res: Response) {
  const current = user(req);
  const eligibility = await getCourseCertificateEligibility(current);
  if (!eligibility.eligible) return res.status(409).json({ error: "CERTIFICATE_REQUIREMENTS_PENDING", eligibility });
  const profile = await getUserProfile(current.id);
  const certificate = await issueCourseCertificate({
    userId: current.id,
    studentName: profile?.name || current.name || current.email,
    metadata: { completedModules: eligibility.completedModules, approvedSubmissions: eligibility.approvedSubmissions },
  });
  if (profile?.email) await sendCourseCertificateEmail({ userId: current.id, email: profile.email, verificationCode: certificate.verificationCode });
  await recordCourseAnalytics({ userId: current.id, name: "certificate.issued", metadata: { verificationCode: certificate.verificationCode } });
  await recordCourseAudit({ actorUserId: current.id, targetUserId: current.id, action: "course.certificate.issued", metadata: { verificationCode: certificate.verificationCode } });
  return res.status(201).json({ certificate });
}

export async function getCourseCertificateVerification(req: Request, res: Response) {
  const code = String(req.params.code || "").toUpperCase();
  const certificate = await getCourseCertificateByCode(code) as any;
  if (!certificate) return res.status(404).json({ valid: false });
  return res.status(200).json({
    valid: !certificate.revokedAt,
    verificationCode: certificate.verificationCode,
    studentName: certificate.studentName,
    courseName: certificate.courseName,
    issuedAt: certificate.issuedAt,
  });
}

export async function downloadCourseCertificate(req: Request, res: Response) {
  const current = user(req);
  const certificate = await getCourseCertificateByUser(current.id) as any;
  if (!certificate || certificate.revokedAt) return res.status(404).json({ error: "CERTIFICATE_NOT_FOUND" });
  const verificationUrl = `${ENV.PUBLIC_APP_URL.replace(/\/$/, "")}/certificate.html?code=${encodeURIComponent(certificate.verificationCode)}`;
  const pdf = buildTextPdf({
    title: "Certificado Newmersive Robot Lab",
    lines: [
      "",
      `Se certifica que ${certificate.studentName}`,
      `ha completado satisfactoriamente ${certificate.courseName}.`,
      "",
      "Competencias: datos BID/ASK, backtesting, robustez, MQL5, paridad MT5, riesgo y auditoria operativa.",
      "",
      `Emitido: ${new Date(certificate.issuedAt).toLocaleDateString("es-ES")}`,
      `Codigo de verificacion: ${certificate.verificationCode}`,
      `Verificacion publica: ${verificationUrl}`,
      "",
      "La certificacion acredita la finalizacion de una formacion tecnica. No garantiza rentabilidad ni constituye asesoramiento financiero.",
    ],
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="newmersive-robot-lab-${certificate.verificationCode}.pdf"`);
  return res.status(200).send(pdf);
}

export async function postCoursePasswordChange(req: Request, res: Response) {
  const current = user(req);
  try {
    await changePassword(current.id, String(req.body?.currentPassword || ""), String(req.body?.newPassword || ""));
    await recordCourseAudit({ actorUserId: current.id, targetUserId: current.id, action: "course.account.password_changed" });
    const profile = await getUserProfile(current.id);
    if (profile?.email) await sendCoursePasswordChangedEmail({ userId: current.id, email: profile.email });
    return res.status(200).json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "PASSWORD_CHANGE_FAILED";
    return res.status(message === "INVALID_CREDENTIALS" ? 401 : 400).json({ error: message });
  }
}

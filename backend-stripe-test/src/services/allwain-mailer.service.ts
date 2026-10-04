import nodemailer from "nodemailer";

import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";

type NotificationSnapshot = {
  id: string;
  type: string;
  title: string;
  body: string;
};

type EmailRule = {
  template: string;
  subject: string;
  action: string;
};

let smtpTransport: ReturnType<typeof nodemailer.createTransport> | null = null;

export function allwainSmtpConfigured() {
  return Boolean(ENV.SMTP_HOST && ENV.SMTP_USER && ENV.SMTP_PASS);
}

export function allwainEmailDeliveryPolicy(
  email: string,
  createdAt: Date | string = new Date(),
) {
  const mode = ENV.ALLWAIN_EMAIL_DELIVERY_MODE;
  if (mode === "disabled") {
    return { allowed: false, mode, reason: "EMAIL_DELIVERY_DISABLED" } as const;
  }
  if (mode === "live") {
    return { allowed: true, mode, reason: null } as const;
  }

  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!ENV.ALLWAIN_EMAIL_TEST_RECIPIENTS.includes(normalizedEmail)) {
    return {
      allowed: false,
      mode,
      reason: "EMAIL_TEST_RECIPIENT_NOT_ALLOWED",
    } as const;
  }
  if (!ENV.ALLWAIN_EMAIL_TEST_STARTED_AT) {
    return {
      allowed: false,
      mode,
      reason: "EMAIL_TEST_START_REQUIRED",
    } as const;
  }
  const notificationTime = new Date(createdAt).getTime();
  const testStartedAt = new Date(ENV.ALLWAIN_EMAIL_TEST_STARTED_AT).getTime();
  if (!Number.isFinite(notificationTime) || notificationTime < testStartedAt) {
    return {
      allowed: false,
      mode,
      reason: "EMAIL_OUTSIDE_TEST_WINDOW",
    } as const;
  }
  return { allowed: true, mode, reason: null } as const;
}

export function getAllwainEmailDeliveryReadiness() {
  return {
    mode: ENV.ALLWAIN_EMAIL_DELIVERY_MODE,
    smtpConfigured: allwainSmtpConfigured(),
    testRecipientCount: ENV.ALLWAIN_EMAIL_TEST_RECIPIENTS.length,
    testStartedAt: ENV.ALLWAIN_EMAIL_TEST_STARTED_AT || null,
    ready:
      allwainSmtpConfigured() &&
      (ENV.ALLWAIN_EMAIL_DELIVERY_MODE === "live" ||
        (ENV.ALLWAIN_EMAIL_DELIVERY_MODE === "test" &&
          ENV.ALLWAIN_EMAIL_TEST_RECIPIENTS.length > 0 &&
          Boolean(ENV.ALLWAIN_EMAIL_TEST_STARTED_AT))),
  };
}

function transport() {
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: ENV.SMTP_HOST,
      port: ENV.SMTP_PORT,
      secure: ENV.SMTP_SECURE,
      auth: { user: ENV.SMTP_USER, pass: ENV.SMTP_PASS },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return smtpTransport;
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

function cleanHeader(value: unknown) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, 180);
}

export async function verifyAllwainSmtpConnection() {
  if (!allwainSmtpConfigured()) {
    return { ok: false, error: "SMTP_NOT_CONFIGURED" } as const;
  }
  try {
    await transport().verify();
    return { ok: true, error: null } as const;
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? cleanHeader(error.message).slice(0, 200)
          : "SMTP_VERIFY_FAILED",
    } as const;
  }
}

export async function sendAllwainSupportEmail(input: {
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string | null;
  references?: string[];
}) {
  if (!allwainSmtpConfigured()) throw new Error("SMTP_NOT_CONFIGURED");
  const to = cleanHeader(input.to).toLowerCase();
  const policy = allwainEmailDeliveryPolicy(to, new Date());
  if (!policy.allowed) throw new Error(policy.reason || "EMAIL_NOT_ALLOWED");
  const plainSubject = cleanHeader(input.subject) || "Respuesta de soporte Allwain";
  const subject =
    policy.mode === "test" ? `[PRUEBA] ${plainSubject}` : plainSubject;
  const safeText = String(input.text || "").replace(/\0/g, "").trim().slice(0, 20_000);
  if (!safeText) throw new Error("SUPPORT_MESSAGE_REQUIRED");
  const htmlBody = safeText
    .split(/\n{2,}/)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:23px;color:#525254;">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
  const info = await transport().sendMail({
    from: ENV.ALLWAIN_EMAIL_FROM,
    to,
    replyTo: ENV.ALLWAIN_SUPPORT_EMAIL,
    subject,
    text: safeText,
    html: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:#F6F6F4;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#FFFFFF;border:1px solid #E2E2DF;border-radius:8px;overflow:hidden;"><tr><td style="padding:22px 28px;border-bottom:4px solid #FF795A;font-size:26px;font-weight:800;color:#FF795A;">allwain</td></tr><tr><td style="padding:28px;">${htmlBody}</td></tr><tr><td style="padding:16px 28px;background:#404041;color:#F3F3F1;font-size:12px;line-height:18px;">Soporte Allwain · ${escapeHtml(ENV.ALLWAIN_SUPPORT_EMAIL)}</td></tr></table></td></tr></table></body></html>`,
    inReplyTo: input.inReplyTo || undefined,
    references: input.references?.length ? input.references : undefined,
    headers: {
      "X-Allwain-Environment": policy.mode,
      "X-Auto-Response-Suppress": "OOF, AutoReply",
    },
  });
  return {
    messageId: cleanHeader(info.messageId) || null,
    accepted: Array.isArray(info.accepted) ? info.accepted.map(String) : [],
    mode: policy.mode,
    subject,
  };
}

function ruleFor(notification: NotificationSnapshot): EmailRule {
  const type = notification.type;
  if (type === "chat.message") {
    return {
      template: "chat_message",
      subject: "Tienes un mensaje nuevo en Allwain",
      action: "Abrir mensaje",
    };
  }
  if (type === "reservation.created") {
    return {
      template: "reservation_created",
      subject: "Tu reserva está registrada",
      action: "Ver reserva",
    };
  }
  if (type === "order.created") {
    return {
      template: "order_created",
      subject: "Has recibido un pedido en Allwain",
      action: "Ver pedido",
    };
  }
  if (type.startsWith("agreement.")) {
    return {
      template: type === "agreement.accepted" ? "agreement_accepted" : "agreement_updated",
      subject: type === "agreement.accepted" ? "Tu acuerdo está confirmado" : "Tu acuerdo se ha actualizado",
      action: "Ver acuerdo",
    };
  }
  if (type === "payment.succeeded") {
    return {
      template: "payment_succeeded",
      subject: "Pago confirmado en Allwain",
      action: "Ver pago",
    };
  }
  if (type.startsWith("payment.")) {
    return {
      template: "payment_update",
      subject: cleanHeader(notification.title) || "Actualización de pago en Allwain",
      action: "Revisar operación",
    };
  }
  if (type === "fulfillment.dispatched") {
    return {
      template: "order_dispatched",
      subject: "Tu pedido está en camino",
      action: "Seguir pedido",
    };
  }
  if (type === "fulfillment.ready") {
    return {
      template: "order_ready",
      subject: "Tu pedido está listo",
      action: "Ver pedido",
    };
  }
  if (type.startsWith("fulfillment.")) {
    return {
      template: "order_status",
      subject: cleanHeader(notification.title) || "Tu pedido se ha actualizado",
      action: "Ver pedido",
    };
  }
  if (type === "review_received") {
    return {
      template: "review_received",
      subject: "Has recibido una opinión en Allwain",
      action: "Ver opinión",
    };
  }
  return {
    template: "notification",
    subject: cleanHeader(notification.title) || "Tienes una novedad en Allwain",
    action: "Abrir Allwain",
  };
}

export function renderAllwainNotificationEmail(notification: NotificationSnapshot) {
  const rule = ruleFor(notification);
  const baseUrl = new URL(ENV.ALLWAIN_APP_URL);
  const appPath = baseUrl.pathname.replace(/\/$/, "").replace(/\/web$/, "/app");
  const appUrl = `${baseUrl.origin}${appPath.endsWith("/app") ? appPath : `${appPath}/app`}`;
  const actionUrl = `${appUrl}/avisos`;
  const logoUrl = `${baseUrl.origin}/email/allwain-logo.png`;
  const title = escapeHtml(notification.title);
  const body = escapeHtml(notification.body);
  const subject = cleanHeader(rule.subject);
  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;background:#F6F6F4;color:#404041;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F6F6F4;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E2E2DF;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px 18px;border-bottom:4px solid #FF795A;">
                <img src="${escapeHtml(logoUrl)}" width="166" alt="Allwain" style="display:block;width:166px;height:auto;border:0;">
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <div style="font-size:12px;line-height:16px;font-weight:700;color:#FF795A;text-transform:uppercase;">Aviso de tu cuenta</div>
                <h1 style="margin:8px 0 12px;font-size:24px;line-height:30px;color:#404041;">${title}</h1>
                <p style="margin:0 0 24px;font-size:16px;line-height:24px;color:#626263;">${body}</p>
                <a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#FF795A;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:700;line-height:20px;padding:14px 20px;border-radius:8px;">${escapeHtml(rule.action)}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;background:#404041;color:#F3F3F1;font-size:12px;line-height:18px;">
                Este correo informa de una acción realizada en tu cuenta Allwain.<br>
                Ayuda: <a href="mailto:${escapeHtml(ENV.ALLWAIN_SUPPORT_EMAIL)}" style="color:#FFFFFF;">${escapeHtml(ENV.ALLWAIN_SUPPORT_EMAIL)}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  return {
    template: rule.template,
    subject,
    text: `${notification.title}\n\n${notification.body}\n\n${rule.action}: ${actionUrl}\n\nAyuda: ${ENV.ALLWAIN_SUPPORT_EMAIL}`,
    html,
  };
}

async function deliverAllwainEmail(deliveryId: string) {
  if (!allwainSmtpConfigured() || ENV.STORAGE_DRIVER !== "postgres") return false;
  const prisma = getPrisma() as any;
  const stale = new Date(Date.now() - 15 * 60_000);
  const claimed = await prisma.allwainEmailDelivery.updateMany({
    where: {
      id: deliveryId,
      attempts: { lt: 5 },
      OR: [
        { status: { in: ["queued", "failed"] } },
        { status: "processing", lastAttemptAt: { lt: stale } },
      ],
    },
    data: {
      status: "processing",
      provider: "smtp",
      attempts: { increment: 1 },
      lastAttemptAt: new Date(),
      error: null,
    },
  });
  if (!claimed.count) return false;

  const delivery = await prisma.allwainEmailDelivery.findUnique({
    where: { id: deliveryId },
  });
  const notification = delivery
    ? await prisma.allwainNotification.findUnique({
        where: { id: delivery.notificationId },
      })
    : null;
  const user = delivery
    ? await prisma.user.findUnique({
        where: { id: delivery.userId },
        select: { id: true, email: true, deletedAt: true },
      })
    : null;

  if (!delivery || !notification || !user || user.deletedAt) {
    if (delivery) {
      await prisma.allwainEmailDelivery.update({
        where: { id: delivery.id },
        data: { status: "skipped", error: "RECIPIENT_NOT_AVAILABLE" },
      });
    }
    return false;
  }

  const policy = allwainEmailDeliveryPolicy(user.email, notification.createdAt);
  if (!policy.allowed) {
    await prisma.allwainEmailDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "skipped",
        provider: `smtp_${policy.mode}`,
        error: policy.reason,
      },
    });
    return false;
  }

  const content = renderAllwainNotificationEmail(notification);
  const subject = policy.mode === "test" ? `[PRUEBA] ${content.subject}` : content.subject;
  try {
    await transport().sendMail({
      from: ENV.ALLWAIN_EMAIL_FROM,
      to: user.email,
      replyTo: ENV.ALLWAIN_SUPPORT_EMAIL,
      subject,
      text: content.text,
      html: content.html,
      headers: { "X-Allwain-Environment": policy.mode },
    });
    await prisma.allwainEmailDelivery.update({
      where: { id: delivery.id },
      data: {
        email: user.email,
        template: content.template,
        subject,
        status: "sent",
        provider: "smtp",
        error: null,
        sentAt: new Date(),
      },
    });
    return true;
  } catch (error) {
    await prisma.allwainEmailDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "failed",
        provider: "smtp",
        error: error instanceof Error ? error.message.slice(0, 500) : "SMTP_FAILED",
      },
    });
    return false;
  }
}

export async function queueAllwainNotificationEmail(notificationId: string) {
  if (ENV.STORAGE_DRIVER !== "postgres") return null;
  const prisma = getPrisma() as any;
  const notification = await prisma.allwainNotification.findUnique({
    where: { id: notificationId },
  });
  if (!notification) return null;
  const user = await prisma.user.findUnique({
    where: { id: notification.userId },
    select: { id: true, email: true, deletedAt: true },
  });
  if (!user || user.deletedAt || !user.email) return null;
  const content = renderAllwainNotificationEmail(notification);
  const policy = allwainEmailDeliveryPolicy(user.email, notification.createdAt);
  let delivery: any;
  try {
    delivery = await prisma.allwainEmailDelivery.upsert({
      where: { notificationId },
      update: {},
      create: {
        notificationId,
        userId: user.id,
        email: user.email,
        template: content.template,
        subject:
          policy.mode === "test" ? `[PRUEBA] ${content.subject}` : content.subject,
        status: policy.allowed ? "queued" : "skipped",
        provider: policy.allowed
          ? allwainSmtpConfigured()
            ? "smtp"
            : "smtp_pending_configuration"
          : `smtp_${policy.mode}`,
        error: policy.allowed ? null : policy.reason,
      },
    });
  } catch (error: any) {
    if (error?.code !== "P2002") throw error;
    delivery = await prisma.allwainEmailDelivery.findUnique({
      where: { notificationId },
    });
    if (!delivery) throw error;
  }
  if (delivery.status !== "sent" && policy.allowed && allwainSmtpConfigured()) {
    setImmediate(() => {
      void deliverAllwainEmail(delivery.id).catch((error) =>
        console.error("ALLWAIN_EMAIL_DELIVERY_ERROR", error),
      );
    });
  }
  return delivery;
}

export async function flushQueuedAllwainEmails(limit = 25) {
  if (
    ENV.STORAGE_DRIVER !== "postgres" ||
    !allwainSmtpConfigured() ||
    ENV.ALLWAIN_EMAIL_DELIVERY_MODE === "disabled"
  ) {
    return {
      configured: allwainSmtpConfigured(),
      mode: ENV.ALLWAIN_EMAIL_DELIVERY_MODE,
      processed: 0,
      sent: 0,
    };
  }
  const prisma = getPrisma() as any;
  const stale = new Date(Date.now() - 15 * 60_000);
  const rows = await prisma.allwainEmailDelivery.findMany({
    where: {
      attempts: { lt: 5 },
      OR: [
        { status: { in: ["queued", "failed"] } },
        { status: "processing", lastAttemptAt: { lt: stale } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(limit, 1), 100),
    select: { id: true },
  });
  let sent = 0;
  for (const row of rows) {
    if (await deliverAllwainEmail(row.id)) sent += 1;
  }
  return {
    configured: true,
    mode: ENV.ALLWAIN_EMAIL_DELIVERY_MODE,
    processed: rows.length,
    sent,
  };
}

export async function retryAllwainEmailDelivery(id: string) {
  if (ENV.STORAGE_DRIVER !== "postgres") {
    throw new Error("EMAIL_DELIVERY_NOT_FOUND");
  }
  const prisma = getPrisma() as any;
  const delivery = await prisma.allwainEmailDelivery.findUnique({ where: { id } });
  if (!delivery) throw new Error("EMAIL_DELIVERY_NOT_FOUND");
  if (delivery.status === "sent") return delivery;
  await prisma.allwainEmailDelivery.update({
    where: { id },
    data: {
      status: "queued",
      attempts: 0,
      error: null,
      lastAttemptAt: null,
    },
  });
  await deliverAllwainEmail(id);
  return prisma.allwainEmailDelivery.findUnique({ where: { id } });
}

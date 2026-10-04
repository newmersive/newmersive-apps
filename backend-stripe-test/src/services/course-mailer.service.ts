import nodemailer from "nodemailer";
import { ENV } from "../config/env";
import { recordCourseEmail } from "./course-campus.service";

type CourseEmail = {
  userId?: string | null;
  email: string;
  template: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
  replyTo?: string;
};

function configured() {
  return Boolean(ENV.SMTP_HOST && ENV.SMTP_USER && ENV.SMTP_PASS);
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

export function courseEmailConfigured() {
  return configured();
}

export async function sendCourseEmail(message: CourseEmail) {
  if (!configured()) {
    await recordCourseEmail({
      userId: message.userId,
      email: message.email,
      template: message.template,
      status: "queued",
      provider: "smtp_pending_configuration",
    });
    return { sent: false, queued: true };
  }

  try {
    const transport = nodemailer.createTransport({
      host: ENV.SMTP_HOST,
      port: ENV.SMTP_PORT,
      secure: ENV.SMTP_SECURE,
      auth: { user: ENV.SMTP_USER, pass: ENV.SMTP_PASS },
    });
    const result = await transport.sendMail({
      from: message.from || ENV.COURSE_EMAIL_FROM,
      to: message.email,
      replyTo: message.replyTo,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    await recordCourseEmail({
      userId: message.userId,
      email: message.email,
      template: message.template,
      status: "sent",
      provider: "smtp",
      sentAt: new Date(),
    });
    return { sent: true, messageId: result.messageId };
  } catch (error: unknown) {
    await recordCourseEmail({
      userId: message.userId,
      email: message.email,
      template: message.template,
      status: "failed",
      provider: "smtp",
      error: error instanceof Error ? error.message.slice(0, 500) : "SMTP_FAILED",
    });
    return { sent: false, queued: false };
  }
}

export async function sendCourseWelcomeEmail(input: { userId: string; email: string; entitlement: string }) {
  const professional = ["course_professional", "mentoring_premium", "admin_course"].includes(input.entitlement);
  const route = professional
    ? "Tu ruta completa incluye 14 modulos, proyecto final, certificado y revisiones IA. Empieza por el diagnostico de onboarding."
    : "Tu ruta Starter abre los fundamentos, el primer EA didactico y el modulo de riesgo. Empieza por el diagnostico de onboarding.";
  return sendCourseEmail({
    userId: input.userId,
    email: input.email,
    template: "course_welcome",
    subject: "Tu acceso a Newmersive Robot Lab",
    text: `Tu acceso ${input.entitlement} esta activo. ${route} Entra en ${ENV.PUBLIC_APP_URL}/access.html con tu Newmersive ID.`,
    html: `<p>Tu acceso <strong>${escapeHtml(input.entitlement)}</strong> esta activo.</p><p>${escapeHtml(route)}</p><p><a href="${ENV.PUBLIC_APP_URL}/access.html">Entrar en Newmersive Robot Lab</a></p>`,
  });
}

export async function sendPasswordResetEmail(input: { userId?: string; email: string; token: string; sourceApp?: string }) {
  const isAllwain = input.sourceApp === "allwain";
  const url = isAllwain
    ? `${ENV.ALLWAIN_APP_URL.replace(/\/$/, "")}/?resetToken=${encodeURIComponent(input.token)}`
    : `${ENV.PUBLIC_APP_URL.replace(/\/$/, "")}/reset-password.html?token=${encodeURIComponent(input.token)}`;
  return sendCourseEmail({
    userId: input.userId,
    email: input.email,
    template: "password_reset",
    subject: isAllwain ? "Restablece tu acceso a Allwain" : "Restablece tu Newmersive ID",
    text: `Abre este enlace durante la proxima hora: ${url}`,
    html: isAllwain
      ? `<div style="margin:0;background:#F6F6F4;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#404041"><div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E2DF;border-top:4px solid #FF795A;padding:28px"><div style="font-size:30px;font-weight:700;color:#FF795A">allwain</div><h1 style="font-size:24px;line-height:30px">Crea una nueva contraseña</h1><p style="font-size:16px;line-height:24px;color:#626263">Has solicitado restablecer tu acceso a Allwain.</p><p><a href="${url}" style="display:inline-block;background:#FF795A;color:#FFFFFF;text-decoration:none;font-weight:700;padding:14px 20px;border-radius:8px">Continuar</a></p><p style="font-size:13px;line-height:20px;color:#757575">El enlace caduca en una hora. Si no lo has solicitado, puedes ignorar este correo.</p></div></div>`
      : `<p>Has solicitado restablecer tu acceso Newmersive ID.</p><p><a href="${url}">Crear una nueva contrasena</a></p><p>El enlace caduca en una hora.</p>`,
    from: isAllwain ? ENV.ALLWAIN_EMAIL_FROM : undefined,
    replyTo: isAllwain ? ENV.ALLWAIN_SUPPORT_EMAIL : undefined,
  });
}

export async function sendCourseSubmissionStatusEmail(input: { userId: string; email: string; status: string; notes?: string }) {
  return sendCourseEmail({
    userId: input.userId,
    email: input.email,
    template: "submission_status",
    subject: "Tu entrega de Robot Lab ha sido revisada",
    text: `Estado: ${input.status}. ${input.notes || "Entra al campus para consultar el expediente."} ${ENV.PUBLIC_APP_URL}/access.html`,
    html: `<p>Tu entrega tiene ahora el estado <strong>${escapeHtml(input.status)}</strong>.</p><p>${escapeHtml(input.notes || "Entra al campus para consultar el expediente.")}</p><p><a href="${ENV.PUBLIC_APP_URL}/access.html">Abrir Robot Lab</a></p>`,
  });
}

export async function sendCourseReminderEmail(input: { userId: string; email: string; name?: string | null }) {
  return sendCourseEmail({
    userId: input.userId,
    email: input.email,
    template: "course_reminder",
    subject: "Tu siguiente paso en Newmersive Robot Lab",
    text: `${input.name || "Hola"}, tu progreso sigue guardado. Retoma tu siguiente leccion en ${ENV.PUBLIC_APP_URL}/access.html`,
    html: `<p>${escapeHtml(input.name || "Hola")}, tu progreso sigue guardado.</p><p><a href="${ENV.PUBLIC_APP_URL}/access.html">Continuar el curso</a></p>`,
  });
}

export async function sendCoursePaymentEmail(input: { userId: string; email: string; plan: string }) {
  return sendCourseEmail({
    userId: input.userId,
    email: input.email,
    template: "payment_confirmed",
    subject: "Pago confirmado - Newmersive Robot Lab",
    text: `Tu pago del plan ${input.plan} se ha confirmado. Acceso: ${ENV.PUBLIC_APP_URL}/access.html`,
    html: `<p>Tu pago del plan <strong>${escapeHtml(input.plan)}</strong> se ha confirmado.</p><p><a href="${ENV.PUBLIC_APP_URL}/access.html">Entrar al campus</a></p>`,
  });
}

export async function sendCourseSupportCreatedEmail(input: { userId: string; email: string; ticketId: string; subject: string; firstResponse: string }) {
  return sendCourseEmail({
    userId: input.userId,
    email: input.email,
    template: "support_created",
    subject: `Soporte Robot Lab: ${input.subject}`,
    text: `Caso ${input.ticketId}: ${input.firstResponse} Seguimiento: ${ENV.PUBLIC_APP_URL}/access.html`,
    html: `<p>Hemos abierto el caso <strong>${escapeHtml(input.ticketId)}</strong>.</p><p>${escapeHtml(input.firstResponse)}</p><p><a href="${ENV.PUBLIC_APP_URL}/access.html">Ver seguimiento</a></p>`,
  });
}

export async function sendCourseSupportAdminEmail(input: { ticketId: string; subject: string; priority: string }) {
  return sendCourseEmail({
    email: ENV.COURSE_ADMIN_EMAIL,
    template: "support_admin_alert",
    subject: `[${input.priority.toUpperCase()}] Nuevo caso Robot Lab`,
    text: `Caso ${input.ticketId}: ${input.subject}. Revisar en ${ENV.PUBLIC_APP_URL}/access.html`,
    html: `<p>Nuevo caso <strong>${escapeHtml(input.ticketId)}</strong> con prioridad ${escapeHtml(input.priority)}.</p><p>${escapeHtml(input.subject)}</p><p><a href="${ENV.PUBLIC_APP_URL}/access.html">Abrir administracion</a></p>`,
  });
}

export async function sendCourseSupportStatusEmail(input: { userId: string; email: string; ticketId: string; status: string; notes?: string }) {
  return sendCourseEmail({
    userId: input.userId,
    email: input.email,
    template: "support_status",
    subject: "Actualizacion de tu caso Robot Lab",
    text: `Caso ${input.ticketId}. Estado: ${input.status}. ${input.notes || "Consulta el campus para ver el seguimiento."}`,
    html: `<p>El caso <strong>${escapeHtml(input.ticketId)}</strong> esta ahora en estado <strong>${escapeHtml(input.status)}</strong>.</p><p>${escapeHtml(input.notes || "Consulta el campus para ver el seguimiento.")}</p>`,
  });
}

export async function sendCourseCertificateEmail(input: { userId: string; email: string; verificationCode: string }) {
  const url = `${ENV.PUBLIC_APP_URL.replace(/\/$/, "")}/certificate.html?code=${encodeURIComponent(input.verificationCode)}`;
  return sendCourseEmail({
    userId: input.userId,
    email: input.email,
    template: "certificate_issued",
    subject: "Tu certificado Newmersive Robot Lab",
    text: `Certificado emitido. Codigo ${input.verificationCode}. Verificacion: ${url}`,
    html: `<p>Has completado la ruta profesional.</p><p>Codigo verificable: <strong>${escapeHtml(input.verificationCode)}</strong></p><p><a href="${url}">Abrir certificado</a></p>`,
  });
}

export async function sendCourseRefundEmail(input: { userId?: string | null; email: string; status: string }) {
  return sendCourseEmail({
    userId: input.userId,
    email: input.email,
    template: "payment_reversed",
    subject: "Actualizacion de pago - Newmersive Robot Lab",
    text: `El pago figura como ${input.status} y el acceso asociado se ha suspendido. Contacta con ${ENV.COURSE_ADMIN_EMAIL} si necesitas revisar el caso.`,
    html: `<p>El pago figura como <strong>${escapeHtml(input.status)}</strong> y el acceso asociado se ha suspendido.</p><p>Contacta con <a href="mailto:${escapeHtml(ENV.COURSE_ADMIN_EMAIL)}">${escapeHtml(ENV.COURSE_ADMIN_EMAIL)}</a> si necesitas revisar el caso.</p>`,
  });
}

export async function sendCoursePasswordChangedEmail(input: { userId: string; email: string }) {
  return sendCourseEmail({
    userId: input.userId,
    email: input.email,
    template: "password_changed",
    subject: "Contrasena de Newmersive ID actualizada",
    text: `Tu contrasena ha cambiado. Si no has sido tu, contacta inmediatamente con ${ENV.COURSE_ADMIN_EMAIL}.`,
    html: `<p>Tu contrasena de Newmersive ID ha cambiado.</p><p>Si no has sido tu, contacta inmediatamente con <a href="mailto:${escapeHtml(ENV.COURSE_ADMIN_EMAIL)}">${escapeHtml(ENV.COURSE_ADMIN_EMAIL)}</a>.</p>`,
  });
}

export async function sendCourseHealthAlertEmail(input: { recovered: boolean; details: unknown }) {
  const state = input.recovered ? "RECUPERADO" : "INCIDENCIA";
  const details = JSON.stringify(input.details).slice(0, 4_000);
  return sendCourseEmail({
    email: ENV.COURSE_ADMIN_EMAIL,
    template: input.recovered ? "health_recovered" : "health_failed",
    subject: `[${state}] Plataforma Newmersive`,
    text: `${state}. Detalle tecnico: ${details}`,
    html: `<p><strong>${state}</strong> en la monitorizacion de la plataforma.</p><pre>${escapeHtml(details)}</pre>`,
  });
}

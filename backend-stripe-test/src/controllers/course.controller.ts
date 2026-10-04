import crypto from "crypto";
import { Request, Response } from "express";
import { ENV } from "../config/env";
import { fetchBoundedJson } from "../security/external-http";
import { AuthUser, CourseEntitlement } from "../shared/types";
import {
  ALLOWED_COURSE_ENTITLEMENTS,
  getUserCourseEntitlements,
} from "../services/course-entitlements.service";
import { resolveCourseUser } from "../middleware/course-auth.middleware";
import {
  appendCourseAiMessage,
  attachCourseSubmissionReview,
  countCourseAiRequestsToday,
  getCourseSnapshot,
  getCourseSubmission,
  hasRequiredCourseConsent,
  listCourseAiMessages,
  recordCourseAudit,
} from "../services/course-campus.service";

const PLAN_CONFIG: Record<
  "starter" | "professional",
  { entitlement: CourseEntitlement; envKey: "STRIPE_PRICE_STARTER" | "STRIPE_PRICE_PROFESSIONAL" }
> = {
  starter: { entitlement: "course_starter", envKey: "STRIPE_PRICE_STARTER" },
  professional: { entitlement: "course_professional", envKey: "STRIPE_PRICE_PROFESSIONAL" },
};

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    } | null;
  }>;
  error?: {
    message?: string;
  };
};

function userEntitlements(user?: AuthUser): CourseEntitlement[] {
  return (user?.entitlements || []).filter((item): item is CourseEntitlement =>
    ALLOWED_COURSE_ENTITLEMENTS.includes(item as CourseEntitlement)
  );
}

function hasCourseAccess(user?: AuthUser) {
  return userEntitlements(user).length > 0;
}

async function currentUser(req: Request) {
  const user = (req as any).user as AuthUser | undefined;
  if (!user?.id) return user;

  const entitlements = await getUserCourseEntitlements(user.id);
  return {
    ...user,
    entitlements,
  };
}

function normalizePlan(value: unknown) {
  return value === "starter" || value === "professional" ? value : null;
}

function safeUrl(path: string) {
  const base = ENV.PUBLIC_APP_URL.replace(/\/+$/, "");
  return `${base}/${path.replace(/^\/+/, "")}`;
}

export async function getRobotLabAccess(req: Request, res: Response) {
  const user = await currentUser(req);
  const entitlements = userEntitlements(user);

  return res.json({
    allowed: entitlements.length > 0,
    entitlements,
    user,
  });
}

export async function getRobotLabNginxAuth(req: Request, res: Response) {
  try {
    const user = await resolveCourseUser(req);
    if (!user) return res.status(401).end();
    if (!hasCourseAccess(user)) return res.status(403).end();
    return res.status(204).end();
  } catch {
    return res.status(401).end();
  }
}

export async function getRobotLabNginxProfessionalAuth(req: Request, res: Response) {
  try {
    const user = await resolveCourseUser(req);
    if (!user) return res.status(401).end();
    const full = user.role === "admin" || user.entitlements?.some((item) => ["course_professional", "mentoring_premium", "admin_course"].includes(item));
    if (!full) return res.status(403).end();
    return res.status(204).end();
  } catch {
    return res.status(401).end();
  }
}

export async function postRobotLabCheckout(req: Request, res: Response) {
  const plan = normalizePlan(req.body?.plan);
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";

  if (!plan) return res.status(400).json({ error: "INVALID_PLAN" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "VALID_EMAIL_REQUIRED" });

  const stripeKey = ENV.STRIPE_SECRET_KEY;
  const priceId = ENV[PLAN_CONFIG[plan].envKey];

  if (!stripeKey || !priceId) {
    return res.status(503).json({
      error: "STRIPE_NOT_CONFIGURED",
      message: "Stripe necesita STRIPE_SECRET_KEY y Price IDs para activar pagos reales.",
    });
  }

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("line_items[0][price]", priceId);
  form.set("line_items[0][quantity]", "1");
  form.set("success_url", safeUrl(`success.html?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`));
  form.set("cancel_url", safeUrl(`cancel.html?plan=${plan}`));
  form.set("metadata[product]", "newmersive_robot_lab");
  form.set("metadata[plan]", plan);
  form.set("metadata[entitlement]", PLAN_CONFIG[plan].entitlement);
  form.set("metadata[legal_version]", ENV.COURSE_REQUIRED_LEGAL_VERSION);
  form.set("customer_email", email);
  form.set("consent_collection[terms_of_service]", "required");
  form.set("custom_text[submit][message]", "Acceso inmediato a contenido digital. La formacion no garantiza resultados financieros.");
  const checkoutWindow = Math.floor(Date.now() / (5 * 60_000));
  const idempotencyKey = `course-checkout-${crypto
    .createHash("sha256")
    .update(`${email}:${plan}:${checkoutWindow}`)
    .digest("hex")}`;

  try {
    const { response, data } = await fetchBoundedJson<{
      id?: string;
      url?: string;
      error?: { message?: string };
    }>(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": idempotencyKey,
        },
        body: form.toString(),
      },
      {
        service: "STRIPE_COURSE_CHECKOUT",
        timeoutMs: 20_000,
        maxResponseBytes: 1_000_000,
      },
    );
    if (!response.ok || !data?.url) {
      return res.status(502).json({
        error: "STRIPE_CHECKOUT_FAILED",
        message: data?.error?.message || `Stripe respondio ${response.status}`,
      });
    }

    return res.status(200).json({ id: data.id, url: data.url });
  } catch (err: unknown) {
    return res.status(502).json({
      error: "STRIPE_CHECKOUT_FAILED",
      message: err instanceof Error ? err.message : "Stripe request failed",
    });
  }
}

export async function postRobotLabAssistant(req: Request, res: Response) {
  const user = await currentUser(req);
  const entitlements = userEntitlements(user);

  if (!hasCourseAccess(user)) {
    return res.status(403).json({ error: "COURSE_ENTITLEMENT_REQUIRED" });
  }

  if (!(await hasRequiredCourseConsent(user!.id))) {
    return res.status(428).json({ error: "COURSE_CONSENT_REQUIRED" });
  }

  const requestsToday = await countCourseAiRequestsToday(user!.id);
  if (requestsToday >= ENV.COURSE_AI_DAILY_LIMIT) {
    return res.status(429).json({ error: "COURSE_AI_DAILY_LIMIT", limit: ENV.COURSE_AI_DAILY_LIMIT });
  }

  const agent = typeof req.body?.agent === "string" ? req.body.agent.trim().slice(0, 80) : "Tutor principal";
  const artifact = typeof req.body?.artifact === "string" ? req.body.artifact.trim() : "";
  const studentState = req.body?.student_state && typeof req.body.student_state === "object" ? req.body.student_state : {};
  const submissionId = typeof req.body?.submission_id === "string" ? req.body.submission_id : "";

  if (!artifact) return res.status(400).json({ error: "MISSING_ARTIFACT" });
  if (artifact.length > 24_000) return res.status(413).json({ error: "ARTIFACT_TOO_LARGE" });

  try {
    if (submissionId) {
      const submission = await getCourseSubmission(submissionId);
      if (!submission || submission.userId !== user!.id) return res.status(404).json({ error: "SUBMISSION_NOT_FOUND" });
    }

    await appendCourseAiMessage({ userId: user!.id, agent, role: "user", content: artifact, metadata: { studentState, submissionId: submissionId || null } });
    const history = await listCourseAiMessages(user!.id, 12);
    const snapshot = await getCourseSnapshot(user!);
    let review;
    try {
      review = await generateRobotLabReview({
      agent,
      artifact,
      studentState: { ...studentState, progress: snapshot.progress, submissions: snapshot.submissions.slice(0, 8) },
      entitlements,
      user,
      history,
      });
    } catch (error: unknown) {
      review = {
        ...fallbackRobotLabReview({ agent, artifact, studentState, entitlements }),
        fallback: true,
        service_notice: "La revision se ha completado con el evaluador local porque el proveedor IA no estaba disponible.",
      };
      console.error("COURSE_AI_PROVIDER_FALLBACK", error instanceof Error ? error.message : error);
    }

    await appendCourseAiMessage({ userId: user!.id, agent, role: "assistant", content: JSON.stringify(review), metadata: { verdict: review.verdict, fallback: Boolean((review as any).fallback) } });
    if (submissionId) await attachCourseSubmissionReview(submissionId, review as Record<string, unknown>);
    await recordCourseAudit({ actorUserId: user!.id, targetUserId: user!.id, action: "course.ai.reviewed", metadata: { agent, verdict: review.verdict, submissionId: submissionId || null, fallback: Boolean((review as any).fallback) } });

    return res.status(200).json(review);
  } catch (err: unknown) {
    return res.status(502).json({
      error: "COURSE_AI_FAILED",
      message: err instanceof Error ? err.message : "AI request failed",
    });
  }
}

async function generateRobotLabReview(input: {
  agent: string;
  artifact: string;
  studentState: Record<string, unknown>;
  entitlements: CourseEntitlement[];
  user?: AuthUser;
  history?: Array<Record<string, unknown>>;
}) {
  if (!ENV.OPENAI_API_KEY) return fallbackRobotLabReview(input);

  const { response, data } = await fetchBoundedJson<OpenAIChatResponse>(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
      model: ENV.COURSE_OPENAI_MODEL,
      temperature: 0.25,
      max_tokens: 700,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "Eres parte de Newmersive Robot Lab, un campus tecnico para crear robots de trading auditables.",
            `Actuas como ${input.agent}.`,
            "Corrige con criterio tecnico y pedagogico.",
            "No prometas rentabilidad, aprobacion de fondeadas ni resultados futuros.",
            "No des asesoramiento financiero personalizado.",
            "Exige evidencia: datos, manifests, candidate locked, logs, MQL5, paridad y riesgo.",
            "Si falta evidencia critica, bloquea avance y explica la reparacion concreta.",
            "Devuelve solo JSON valido con: verdict, feedback, missing_evidence, next_step, risk_warning.",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            student: {
              id: input.user?.id,
              email: input.user?.email,
              entitlements: input.entitlements,
            },
            student_state: input.studentState,
            recent_history: input.history,
            artifact: input.artifact,
          }),
        },
      ],
      user: crypto
        .createHash("sha256")
        .update(String(input.user?.id || input.user?.email || "anonymous"))
        .digest("hex"),
      }),
    },
    {
      service: "OPENAI_COURSE_REVIEW",
      timeoutMs: ENV.AI_REQUEST_TIMEOUT_MS,
      maxResponseBytes: ENV.AI_RESPONSE_MAX_BYTES,
    },
  );
  if (!response.ok) {
    throw new Error(data?.error?.message || `OPENAI_COURSE_ERROR_${response.status}`);
  }

  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) return fallbackRobotLabReview(input);

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return normalizeRobotLabReview(input.agent, parsed);
  } catch {
    return {
      agent: input.agent,
      verdict: "REVIEW_READY",
      feedback: text,
      missing_evidence: [],
      next_step: "Revisar feedback y preparar la siguiente entrega.",
      risk_warning: "Formacion tecnica; no garantiza resultados financieros.",
    };
  }
}

function normalizeRobotLabReview(agent: string, parsed: Record<string, unknown>) {
  return {
    agent,
    verdict: typeof parsed.verdict === "string" ? parsed.verdict : "REVIEW_READY",
    feedback: typeof parsed.feedback === "string" ? parsed.feedback : "",
    missing_evidence: Array.isArray(parsed.missing_evidence) ? parsed.missing_evidence : [],
    next_step: typeof parsed.next_step === "string" ? parsed.next_step : "",
    risk_warning:
      typeof parsed.risk_warning === "string"
        ? parsed.risk_warning
        : "Formacion tecnica; no garantiza resultados financieros.",
  };
}

function fallbackRobotLabReview(input: {
  agent: string;
  artifact: string;
  studentState: Record<string, unknown>;
  entitlements: CourseEntitlement[];
}) {
  const required = ["manifest", "datos", "spread", "mql5", "riesgo", "walk-forward"];
  const lowered = input.artifact.toLowerCase();
  const missing = required.filter((item) => !lowered.includes(item));

  return {
    agent: input.agent,
    verdict: missing.length ? "EVIDENCE_REQUIRED" : "REVIEW_READY",
    feedback: missing.length
      ? `He recibido la entrega, pero faltan evidencias clave antes de aprobar el avance: ${missing.join(", ")}.`
      : "La entrega tiene una base revisable. Ahora toca comprobar paridad, riesgo y trazabilidad antes de pasar a operativa.",
    missing_evidence: missing,
    next_step: missing.length
      ? "Completa la evidencia faltante y vuelve a enviar el paquete de revision."
      : "Prepara el candidate_locked y una prueba fuera de muestra con logs exportables.",
    risk_warning: "Formacion tecnica; no garantiza resultados financieros ni aprobacion de cuentas fondeadas.",
    entitlements: input.entitlements,
  };
}

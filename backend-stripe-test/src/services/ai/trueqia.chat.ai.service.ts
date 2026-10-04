import type { TrueqiaChatMessage } from "../../shared/types";
import { ENV } from "../../config/env";
import { fetchBoundedJson } from "../../security/external-http";

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

type TrueqiaChatContext = {
  userName?: string | null;
  tradeTitle?: string | null;
  tradeStatus?: string | null;
  offerDescription?: string | null;
  tokens?: number | null;
};

function buildFallbackReply(text: string, context: TrueqiaChatContext = {}) {
  const scope = context.tradeTitle ? ` sobre "${context.tradeTitle}"` : "";
  return [
    `He guardado tu mensaje${scope}.`,
    "Puedo ayudarte a convertirlo en condiciones claras: alcance, entrega, tokens, revision y aceptacion.",
    `Resumen rapido: ${text.slice(0, 220)}`,
  ].join("\n\n");
}

function buildPrompt(
  messages: TrueqiaChatMessage[],
  latestText: string,
  context: TrueqiaChatContext = {}
) {
  const recent = messages
    .slice(-8)
    .map((message) => `${message.senderName}: ${message.text}`)
    .join("\n");

  return [
    "Actua como asistente IA de TrueQIA.",
    "TrueQIA ayuda a usuarios a preparar trueques, servicios, acuerdos y contratos internos con tokens.",
    "Responde en espanol, con tono claro, util y breve.",
    "Ayuda a concretar condiciones negociables: alcance, entregables, tiempos, tokens, revision, aceptacion y riesgos practicos.",
    "No des asesoramiento legal definitivo. Si el usuario pide contrato, sugiere generar un borrador revisable en TrueQIA.",
    "",
    `Usuario: ${context.userName || "Usuario"}`,
    `Trueque/oferta: ${context.tradeTitle || "Chat general"}`,
    `Estado: ${context.tradeStatus || "No indicado"}`,
    `Tokens: ${context.tokens ?? "No indicados"}`,
    `Descripcion oferta: ${context.offerDescription || "No indicada"}`,
    "",
    "Historial reciente:",
    recent || "Sin historial previo.",
    "",
    `Ultimo mensaje del usuario: ${latestText}`,
  ].join("\n");
}

export async function generateTrueqiaChatReply(
  messages: TrueqiaChatMessage[],
  latestText: string,
  context: TrueqiaChatContext = {}
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return buildFallbackReply(latestText, context);

  const model = process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const { response, data } = await fetchBoundedJson<OpenAIChatResponse>(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        max_tokens: 450,
        messages: [
          {
            role: "system",
            content:
              "Eres el asistente de TrueQIA. Ayudas a cerrar acuerdos de trueque de forma clara, accionable y prudente.",
          },
          {
            role: "user",
            content: buildPrompt(messages, latestText, context),
          },
        ],
      }),
    },
    {
      service: "OPENAI_TRUEQIA_CHAT",
      timeoutMs: ENV.AI_REQUEST_TIMEOUT_MS,
      maxResponseBytes: ENV.AI_RESPONSE_MAX_BYTES,
    },
  );
  if (!response.ok) {
    throw new Error(data?.error?.message || `OPENAI_CHAT_ERROR_${response.status}`);
  }

  return data?.choices?.[0]?.message?.content?.trim() || buildFallbackReply(latestText, context);
}

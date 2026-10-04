import type { TrueqiaContractTemplateId } from "../../shared/types";
import { ENV } from "../../config/env";
import { fetchBoundedJson } from "../../security/external-http";

type ContractTextPayload = {
  templateId?: string | null;
  title?: string | null;
  requesterName?: string | null;
  providerName?: string | null;
  tokens?: number | null;
  notes?: string | null;
  description?: string | null;
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

export type TrueqiaContractTemplate = {
  id: TrueqiaContractTemplateId;
  version: string;
  label: string;
  title: string;
  summary: string;
  keywords: string[];
  clauses: string[];
};

export const TRUEQIA_CONTRACT_TEMPLATES: Record<
  TrueqiaContractTemplateId,
  TrueqiaContractTemplate
> = {
  "trueqia-trade-standard": {
    id: "trueqia-trade-standard",
    version: "1.0.0",
    label: "Intercambio",
    title: "TrueQIA intercambio estandar",
    summary: "Intercambio general de bienes o servicios sin cesion especifica de derechos.",
    keywords: [
      "intercambio",
      "trueque",
      "servicio",
      "producto",
      "entrega",
      "sesion",
    ],
    clauses: [
      "Las partes acuerdan ejecutar el intercambio descrito de buena fe.",
      "Los tokens indicados representan la compensacion acordada dentro de TrueQIA.",
      "Cualquier ajuste posterior debe quedar reflejado por escrito antes de aceptar el contrato.",
      "La aceptacion del solicitante y del proveedor queda registrada por separado en TrueQIA.",
    ],
  },
  "trueqia-professional-services": {
    id: "trueqia-professional-services",
    version: "1.0.0",
    label: "Servicios",
    title: "TrueQIA servicios profesionales",
    summary: "Prestacion de servicios con entregables, revision y alcance definidos.",
    keywords: [
      "consultoria",
      "mentoria",
      "revision",
      "asesoria",
      "auditoria",
      "desarrollo",
      "soporte",
      "clases",
      "formacion",
    ],
    clauses: [
      "El proveedor se compromete a prestar el servicio descrito con diligencia profesional.",
      "El alcance del trabajo queda limitado a la descripcion, notas y entregables pactados.",
      "Las revisiones incluidas deben acordarse antes de la aceptacion del contrato.",
      "La entrega se considerara realizada cuando el solicitante reciba el servicio o material acordado.",
      "Los tokens se liberan conforme a la aceptacion registrada por las partes en TrueQIA.",
    ],
  },
  "trueqia-content-rights": {
    id: "trueqia-content-rights",
    version: "1.0.0",
    label: "Derechos",
    title: "TrueQIA contenido y derechos de uso",
    summary: "Intercambio con piezas creativas, imagen, audio, video, fotografia o uso de marca.",
    keywords: [
      "foto",
      "fotografia",
      "fotografias",
      "video",
      "reel",
      "reels",
      "contenido",
      "imagen",
      "audio",
      "marca",
      "branding",
      "copy",
      "assets",
      "guion",
      "storyboard",
    ],
    clauses: [
      "El proveedor conserva la autoria del contenido salvo pacto expreso en contrario.",
      "El solicitante recibe un derecho de uso no exclusivo para los fines descritos en el acuerdo.",
      "Cualquier uso comercial, sublicencia, modificacion sustancial o cesion a terceros debe constar por escrito.",
      "Las partes deben respetar derechos de imagen, marca, musica, licencias y materiales de terceros.",
      "La entrega debe incluir los formatos o piezas indicadas en la descripcion o notas del contrato.",
    ],
  },
  "trueqia-creative-collaboration": {
    id: "trueqia-creative-collaboration",
    version: "1.0.1",
    label: "Colaboracion",
    title: "TrueQIA colaboracion creativa",
    summary: "Proyecto creativo compartido con hitos, creditos y coordinacion entre partes.",
    keywords: [
      "colaboracion",
      "co-creacion",
      "cocreacion",
      "produccion",
      "campana",
      "evento",
      "rodaje",
      "backstage",
      "proyecto",
      "equipo",
    ],
    clauses: [
      "Las partes colaboran en el proyecto descrito y coordinan los hitos necesarios para completarlo.",
      "Las responsabilidades de cada parte se interpretan segun la descripcion, notas y mensajes asociados al trueque.",
      "Los creditos, menciones publicas y materiales promocionales deben respetar lo pactado entre las partes.",
      "Cualquier cambio de calendario, alcance o entregables debe confirmarse por escrito antes de continuar.",
      "La aceptacion en TrueQIA confirma las condiciones e inicia el intercambio. El cumplimiento se confirma por separado, cuando ambas partes han completado sus obligaciones.",
    ],
  },
};

export const TRUEQIA_TRADE_TEMPLATE = TRUEQIA_CONTRACT_TEMPLATES["trueqia-trade-standard"];

const TRUEQIA_TEMPLATE_LIST = Object.values(TRUEQIA_CONTRACT_TEMPLATES);

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function getContractTemplate(templateId?: string | null) {
  if (!templateId) return null;
  return TRUEQIA_CONTRACT_TEMPLATES[templateId as TrueqiaContractTemplateId] || null;
}

export function listContractTemplates() {
  return TRUEQIA_TEMPLATE_LIST.map(({ id, version, label, title, summary }) => ({
    id,
    version,
    label,
    title,
    summary,
  }));
}

export function selectContractTemplate(payload: ContractTextPayload = {}) {
  const requested = getContractTemplate(payload.templateId);
  if (requested) return requested;

  const haystack = normalizeText([
    payload.title,
    payload.description,
    payload.notes,
  ].filter(Boolean).join(" "));

  let selected = TRUEQIA_TRADE_TEMPLATE;
  let bestScore = 0;

  for (const template of TRUEQIA_TEMPLATE_LIST) {
    const score = template.keywords.reduce(
      (total, keyword) => total + (haystack.includes(normalizeText(keyword)) ? 1 : 0),
      0
    );

    if (score > bestScore) {
      selected = template;
      bestScore = score;
    }
  }

  return selected;
}

function buildFallbackContractText(
  template: TrueqiaContractTemplate,
  payload: ContractTextPayload
) {
  const lines = [
    `${template.title} v${template.version}`,
    `Plantilla: ${template.id}`,
    `Contrato generado para: ${payload.title || "Sin titulo"}.`,
    "",
    `Solicitante: ${payload.requesterName || "Solicitante"}`,
    `Proveedor: ${payload.providerName || "Proveedor"}`,
    `Tokens: ${payload.tokens || 0}`,
  ];

  if (payload.description) {
    lines.push("", `Descripcion del acuerdo: ${payload.description}`);
  }

  if (payload.notes) {
    lines.push("", `Notas adicionales: ${payload.notes}`);
  }

  lines.push("", "Resumen de plantilla:", template.summary, "", "Clausulas especificas:");
  template.clauses.forEach((clause, index) => {
    lines.push(`${index + 1}. ${clause}`);
  });

  lines.push(
    "",
    "NOTA: Este documento es un borrador revisable y no sustituye asesoramiento legal.",
  );

  return lines.join("\n");
}

function buildOpenAIPrompt(template: TrueqiaContractTemplate, payload: ContractTextPayload) {
  return [
    "Redacta un borrador claro de contrato para TrueQIA en espanol.",
    "TrueQIA es una app de intercambios, servicios y colaboraciones donde la compensacion puede expresarse en tokens internos.",
    "El texto debe ser practico, ordenado y comprensible para usuarios no juristas.",
    "No afirmes que sustituye asesoramiento legal. Incluye una nota final indicando que es un borrador revisable.",
    "",
    `Tipo de plantilla: ${template.title}`,
    `Resumen de plantilla: ${template.summary}`,
    `Clausulas base: ${template.clauses.join(" | ")}`,
    "",
    `Titulo/oferta: ${payload.title || "Sin titulo"}`,
    `Solicitante: ${payload.requesterName || "Solicitante"}`,
    `Proveedor: ${payload.providerName || "Proveedor"}`,
    `Tokens: ${payload.tokens || 0}`,
    `Descripcion: ${payload.description || "No indicada"}`,
    `Notas: ${payload.notes || "Sin notas adicionales"}`,
    "",
    "Estructura la respuesta con estos apartados:",
    "1. Identificacion del acuerdo",
    "2. Objeto",
    "3. Obligaciones de las partes",
    "4. Entrega, revision y aceptacion",
    "5. Tokens o compensacion",
    "6. Uso de materiales o derechos si aplica",
    "7. Cambios, incidencias y cancelacion",
    "8. Aceptacion en TrueQIA",
    "9. Nota final",
  ].join("\n");
}

async function generateOpenAIContractText(
  template: TrueqiaContractTemplate,
  payload: ContractTextPayload
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_CONTRACT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
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
        temperature: 0.25,
        max_tokens: 1200,
        messages: [
          {
            role: "system",
            content:
              "Eres un asistente de redaccion contractual para una plataforma digital. Escribes borradores sobrios, claros y en espanol.",
          },
          {
            role: "user",
            content: buildOpenAIPrompt(template, payload),
          },
        ],
      }),
    },
    {
      service: "OPENAI_TRUEQIA_CONTRACT",
      timeoutMs: ENV.AI_REQUEST_TIMEOUT_MS,
      maxResponseBytes: ENV.AI_RESPONSE_MAX_BYTES,
    },
  );
  if (!response.ok) {
    throw new Error(data?.error?.message || `OPENAI_ERROR_${response.status}`);
  }

  const text = data?.choices?.[0]?.message?.content?.trim();
  return text || null;
}

export async function generateContractText(payload: ContractTextPayload): Promise<string> {
  const template = selectContractTemplate(payload);
  const aiText = await generateOpenAIContractText(template, payload);
  return aiText || buildFallbackContractText(template, payload);
}

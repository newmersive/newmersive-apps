import { ENV } from "../../config/env";
import { fetchBoundedJson } from "../../security/external-http";

export type DemoAgentApp = "trueqia" | "allwain";

export type DemoAgent = {
  id: string;
  name: string;
  role: string;
  description: string;
  welcome: string;
  suggestions: string[];
};

type InternalDemoAgent = DemoAgent & {
  instructions: string;
};

type DemoHistoryMessage = {
  role: "user" | "assistant";
  text: string;
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

const APP_FLOWS: Record<DemoAgentApp, string> = {
  trueqia: [
    "Flujo de TrueQIA:",
    "1. Publicar o localizar una oferta de producto, servicio o colaboración.",
    "2. Proponer un trueque y negociar alcance, entregables, fechas y tokens.",
    "3. Revisar el acuerdo y generar un borrador de contrato con IA.",
    "4. Ambas partes aceptan el contrato; entonces se activa el trueque y se transfieren los tokens acordados.",
    "5. Cada participante confirma su cumplimiento y el trueque pasa a finalizado cuando ambos lo han hecho.",
  ].join("\n"),
  allwain: [
    "Flujo de Allwain:",
    "1. Buscar una oferta, escanear un producto o crear una petición manual.",
    "2. Revisar producto, cantidad, dirección y forma de entrega antes de publicar o comprar.",
    "3. El vendedor publica una oferta o responde a una petición con precio, stock y condiciones.",
    "4. Comprador y vendedor confirman el pedido; el comprador paga con Stripe cuando los cobros están activos.",
    "5. El vendedor prepara y entrega, con apoyo logístico de un conector cuando se haya asignado.",
    "6. El comprador confirma la recepción y Allwain conserva la trazabilidad verificable.",
  ].join("\n"),
};

const AGENTS: Record<DemoAgentApp, InternalDemoAgent[]> = {
  trueqia: [
    {
      id: "trueqia-guide",
      name: "Guía TrueQIA",
      role: "Acompañamiento",
      description: "Explica cada pantalla y recomienda el siguiente paso.",
      welcome:
        "Soy la guía de TrueQIA. Dime qué quieres intercambiar o en qué pantalla estás y recorreremos el proceso juntos.",
      suggestions: [
        "Quiero crear mi primera oferta",
        "Explícame cómo funciona un trueque",
        "¿Cuál es el siguiente paso?",
      ],
      instructions:
        "Guía al usuario paso a paso. Haz una sola pregunta cada vez y señala la acción o pantalla concreta que debe usar.",
    },
    {
      id: "trueqia-counterparty",
      name: "Ensayo de contraparte",
      role: "Simulación de negociación",
      description: "Interpreta a la otra parte para ensayar una negociación.",
      welcome:
        "Puedo simular la otra parte de un trueque. Cuéntame qué ofreces y qué esperas recibir.",
      suggestions: [
        "Simula una negociación de servicios",
        "Hazme una contraoferta",
        "Ayúdame a cerrar condiciones",
      ],
      instructions:
        "Interpreta una contraparte razonable. Negocia de forma realista, identifica ambigüedades y deja claro que es un ensayo, no una persona real.",
    },
    {
      id: "trueqia-agreement",
      name: "Revisor de acuerdos",
      role: "Condiciones y contrato",
      description: "Comprueba que el acuerdo tenga datos suficientes.",
      welcome:
        "Revisaré tu acuerdo: entregables, fechas, tokens, revisiones, aceptación y riesgos prácticos. No sustituyo asesoramiento legal.",
      suggestions: [
        "Revisa las condiciones de mi acuerdo",
        "¿Qué falta antes del contrato?",
        "Prepara una lista de entregables",
      ],
      instructions:
        "Actúa como revisor operativo, no como abogado. Detecta campos ausentes y propone condiciones claras antes de generar el borrador.",
    },
  ],
  allwain: [
    {
      id: "allwain-guide",
      name: "Guía Allwain",
      role: "Asistente único",
      description: "Responde, prepara peticiones y crea borradores de ofertas.",
      welcome:
        "Dime qué necesitas comprar o vender. Prepararé la acción y tú revisarás los datos antes de publicarla.",
      suggestions: [
        "Quiero comprar algo",
        "Quiero vender algo",
        "Tengo una foto",
      ],
      instructions:
        "Actúa como una única guía, sin pedir al usuario que elija comprador o vendedor. Haz una sola pregunta cada vez y no inventes datos.",
    },
  ],
};

function publicAgent(agent: InternalDemoAgent): DemoAgent {
  const { instructions: _instructions, ...profile } = agent;
  return profile;
}

export function isDemoAgentApp(value: string): value is DemoAgentApp {
  return value === "trueqia" || value === "allwain";
}

export function listDemoAgents(app: DemoAgentApp) {
  return AGENTS[app].map(publicAgent);
}

function getAgent(app: DemoAgentApp, agentId?: string) {
  return AGENTS[app].find((agent) => agent.id === agentId) || AGENTS[app][0];
}

function sanitizeHistory(history: unknown): DemoHistoryMessage[] {
  if (!Array.isArray(history)) return [];

  return history
    .filter(
      (item): item is DemoHistoryMessage =>
        Boolean(item) &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.text === "string" &&
        item.text.trim().length > 0
    )
    .slice(-10)
    .map((item) => ({ role: item.role, text: item.text.trim().slice(0, 1200) }));
}

function fallbackReply(agent: InternalDemoAgent, app: DemoAgentApp, message: string) {
  const firstStep = app === "trueqia" ? "crear o elegir una oferta" : "hacer un escaneo o introducir los datos";
  return [
    `Soy ${agent.name}, tu asistente en ${app === "trueqia" ? "TrueQIA" : "Allwain"}.`,
    `Para avanzar, empezaría por ${firstStep}. Sobre tu mensaje: “${message.slice(0, 220)}”.`,
    "Dime qué datos tienes ya y te indicaré el siguiente paso concreto.",
  ].join("\n\n");
}

export async function generateDemoAgentReply(input: {
  app: DemoAgentApp;
  agentId?: string;
  message: string;
  history?: unknown;
  userName?: string | null;
}) {
  const agent = getAgent(input.app, input.agentId);
  const history = sanitizeHistory(input.history);
  const apiKey = process.env.OPENAI_API_KEY;

  let text = fallbackReply(agent, input.app, input.message);
  let provider: "openai" | "fallback" = "fallback";

  if (apiKey) {
    const model =
      process.env.OPENAI_DEMO_AGENT_MODEL ||
      process.env.OPENAI_CHAT_MODEL ||
      process.env.OPENAI_MODEL ||
      "gpt-4o-mini";
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
          temperature: 0.45,
          max_tokens: 500,
          messages: [
            {
              role: "system",
              content: [
                `Eres ${agent.name}, asistente de ${input.app === "trueqia" ? "TrueQIA" : "Allwain"}.`,
                agent.instructions,
                APP_FLOWS[input.app],
                "Responde en español claro, breve y práctico.",
                "Nunca afirmes que has pulsado botones, creado registros, enviado ofertas o ejecutado acciones reales.",
                "No inventes datos de cuenta, precios ni resultados. Si haces una simulación, identifícala claramente como ensayo.",
                "Termina con una pregunta o un siguiente paso concreto cuando sea útil.",
              ].join("\n\n"),
            },
            ...history.map((item) => ({
              role: item.role,
              content: item.text,
            })),
            {
              role: "user",
              content: `Usuario: ${input.userName || "Usuario demo"}\n\nMensaje: ${input.message}`,
            },
          ],
        }),
      },
      {
        service: "OPENAI_DEMO_AGENT",
        timeoutMs: ENV.AI_REQUEST_TIMEOUT_MS,
        maxResponseBytes: ENV.AI_RESPONSE_MAX_BYTES,
      },
    );
    if (!response.ok) {
      throw new Error(data?.error?.message || `OPENAI_DEMO_AGENT_ERROR_${response.status}`);
    }

    text = data?.choices?.[0]?.message?.content?.trim() || text;
    provider = "openai";
  }

  return {
    agent: publicAgent(agent),
    message: {
      id: `demo-agent-${Date.now()}`,
      role: "assistant" as const,
      text,
      createdAt: new Date().toISOString(),
    },
    suggestions: agent.suggestions,
    provider,
  };
}

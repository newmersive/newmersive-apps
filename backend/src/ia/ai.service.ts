/**
 * Servicio centralizado de IA para todas las llamadas a modelos (mock por ahora).
 *
 * En producción, cada función debería invocar al modelo correspondiente (LLM, modelo de precios, etc.)
 * y devolver su respuesta estructurada. De momento usamos reglas deterministas para demo.
 */

interface TrueqiaContractInput {
  offerTitle: string;
  requesterName: string;
  providerName: string;
  tokens: number;
  contextNotes?: string;
}

interface TrueqiaConflictInput {
  conflictId: string;
  requesterVersion: string;
  providerVersion: string;
  severity?: "low" | "medium" | "high";
}

interface TrueqiaReputationInput {
  userId: string;
  completedTrades: number;
  conflictsResolved: number;
  cancellations: number;
  reviews?: number[];
}

interface AllwainRecommendationInput {
  userId: string;
  interests: string[];
  preferredPriceRange?: [number, number];
}

interface AllwainRecommendation {
  id: string;
  title: string;
  matchScore: number;
  reason: string;
}

interface AllwainDemandInput {
  productId: string;
  historicalSales: number[];
  seasonality?: "peak" | "regular" | "low";
}

interface AllwainDemandPrediction {
  productId: string;
  projectedDemand: number;
  confidence: number;
  notes: string;
}

interface AllwainPriceInput {
  productId: string;
  basePrice: number;
  elasticity?: number;
  competitorPrice?: number;
}

interface AllwainPriceSuggestion {
  productId: string;
  recommendedPrice: number;
  expectedMargin: number;
  rationale: string;
}

export function generateTrueqiaContract(data: TrueqiaContractInput): string {
  // TODO: Reemplazar por llamada a modelo generador de contratos (LLM + plantillas legales).
  const today = new Date().toISOString().slice(0, 10);
  const base = [
    `CONTRATO TRUEQIA (DEMO)`,
    `Fecha: ${today}`,
    `Oferta: ${data.offerTitle}`,
    `Solicitante: ${data.requesterName}`,
    `Proveedor: ${data.providerName}`,
    `Tokens: ${data.tokens}`,
    `Contexto: ${data.contextNotes || "sin notas adicionales"}`,
    "1) Alcance: entrega de valor según la oferta.",
    "2) Compromiso: ambas partes cumplen plazos y calidad acordada.",
    "3) Resolución: cualquier disputa se resolverá mediante mediación amistosa.",
  ];

  return base.join("\n");
}

export function mediateTrueqiaConflict(data: TrueqiaConflictInput) {
  // TODO: Sustituir por modelo de resolución asistida que combine reglas y RAG sobre historial de contratos.
  const severityLabel = data.severity || "medium";
  const alignmentScore = 0.5 + (data.requesterVersion.length % 5) * 0.1;
  const providerWeight = data.providerVersion.length % 3;
  const requesterWeight = data.requesterVersion.length % 4;
  const recommendation = requesterWeight >= providerWeight ? "favor-requester" : "favor-provider";

  return {
    conflictId: data.conflictId,
    severity: severityLabel,
    recommendation,
    alignmentScore: Number(alignmentScore.toFixed(2)),
    summary: `Se sugiere acuerdo equilibrado con ligera inclinación ${
      recommendation === "favor-requester" ? "al solicitante" : "al proveedor"
    }`,
  };
}

export function scoreTrueqiaUserReputation(data: TrueqiaReputationInput) {
  // TODO: Integrar modelo de scoring reputacional basado en eventos y señales de comportamiento.
  const baseScore = Math.max(0, data.completedTrades * 10 - data.cancellations * 15);
  const reviewBoost = (data.reviews || []).reduce((acc, score) => acc + score, 0);
  const conflictPenalty = Math.max(0, 20 - data.conflictsResolved * 5);
  const normalized = Math.min(100, baseScore + reviewBoost - conflictPenalty);

  return {
    userId: data.userId,
    reputationScore: Number(normalized.toFixed(1)),
    summary: `Reputación calculada a partir de ${data.completedTrades} trades, ${
      data.cancellations
    } cancelaciones y ${data.conflictsResolved} conflictos resueltos.`,
  };
}

export function recommendAllwainOffers(
  data: AllwainRecommendationInput
): AllwainRecommendation[] {
  // TODO: Llamar a motor de recomendaciones (embedding + filtrado colaborativo) con contexto del usuario.
  const [minPrice, maxPrice] = data.preferredPriceRange || [0, 9999];

  return data.interests.slice(0, 3).map((interest, index) => ({
    id: `mock-offer-${index + 1}`,
    title: `Oferta destacada: ${interest}`,
    matchScore: Number((0.7 + index * 0.08).toFixed(2)),
    reason: `Coincidencia por interés en ${interest} dentro de rango ${minPrice}-${maxPrice}`,
  }));
}

export function predictAllwainDemand(
  data: AllwainDemandInput
): AllwainDemandPrediction {
  // TODO: Sustituir por modelo de forecasting (p. ej. Prophet/ARIMA) alimentado con series históricas.
  const average = data.historicalSales.reduce((acc, value) => acc + value, 0) /
    Math.max(1, data.historicalSales.length);
  const seasonalBoost = data.seasonality === "peak" ? 1.3 : data.seasonality === "low" ? 0.7 : 1;
  const projected = Number((average * seasonalBoost).toFixed(0));

  return {
    productId: data.productId,
    projectedDemand: projected,
    confidence: Number((0.6 + average / 1000).toFixed(2)),
    notes: `Demanda estimada con factor estacional ${seasonalBoost}.`,
  };
}

export function optimizeAllwainPrices(
  data: AllwainPriceInput
): AllwainPriceSuggestion {
  // TODO: Integrar modelo de elasticidad de precios con benchmarking competitivo en tiempo real.
  const elasticity = data.elasticity ?? 1.1;
  const competitorAdjustment = data.competitorPrice
    ? (data.competitorPrice - data.basePrice) * 0.2
    : 0;
  const newPrice = Number((data.basePrice * elasticity + competitorAdjustment).toFixed(2));
  const expectedMargin = Number((newPrice * 0.35).toFixed(2));

  return {
    productId: data.productId,
    recommendedPrice: newPrice,
    expectedMargin,
    rationale: `Precio ajustado con elasticidad ${elasticity} y referencia competitiva ${
      data.competitorPrice ?? "n/a"
    }.`,
  };
}

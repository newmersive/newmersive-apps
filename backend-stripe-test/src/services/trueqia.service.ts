import { randomUUID } from "crypto";
import { createTrueqiaTradeSafe, acceptTrueqiaTradeSafe, rejectTrueqiaTradeSafe, safeOffer, assertTrueqiaSigningAllowed, trueqiaTradeDetails, withTrueqiaMemoryLock } from "./trueqia.workspace.service";
import { Trade, Contract, DemoContractInput, TrueqiaChatMessage } from "../shared/types";
import { ENV } from "../config/env";
import { getPrisma } from "../db/prisma";
import { buildTextPdf } from "./pdf.service";
import {
  listChatMessages,
  openChatContext,
  sendChatMessage,
} from "./chat.service";

const DEFAULT_CONTRACT_TEMPLATE = {
  id: "trueqia-trade-standard",
  version: "1.0.0",
  title: "TrueQIA intercambio estandar",
};

// JSON driver (sync)
import {
  getOfferById,
  getTrades,
  getTradeById,
  updateTradeLifecycle,
  getUserById,
  upsertUser,
  createContract,
  getContracts,
  getContractById,
  updateContractAcceptance,
  getTrueqiaChatMessages,
  getTrueqiaChatThreadMessages,
  addTrueqiaChatMessage,
} from "./data.store";

// Postgres driver (async)
import {
  getOfferByIdPg,
  getTradesPg,
  getTradeByIdPg,
  acceptTrueqiaContractAndActivateTradePg,
  completeTradePg,
  getUserByIdPg,
  createContractPg,
  getContractsPg,
  getContractByIdPg,
  getTrueqiaChatMessagesPg,
  getTrueqiaChatThreadMessagesPg,
  addTrueqiaChatMessagePg,
} from "./data.store.pg";

const usePostgres = () => ENV.STORAGE_DRIVER === "postgres";
const trueqiaMainThreadId = (userId: string) => `trueqia:${userId}:main`;
const trueqiaTradeThreadId = (tradeId: string) => `trueqia:trade:${tradeId}`;

function cleanChatText(text: unknown) {
  if (typeof text !== "string") return "";
  return text.trim().replace(/\s+/g, " ").slice(0, 1000);
}

function cleanOptionalText(text: unknown, maxLength = 2000) {
  if (typeof text !== "string") return null;
  const clean = text.trim();
  return clean ? clean.slice(0, maxLength) : null;
}

function normalizeContractInput(input: DemoContractInput): DemoContractInput {
  return {
    ...input,
    offerTitle: cleanOptionalText(input.offerTitle, 180) || "Contrato TrueQIA",
    requesterName: cleanOptionalText(input.requesterName, 120) || "Solicitante",
    providerName: cleanOptionalText(input.providerName, 120) || "Proveedor",
    tokens: Math.max(0, Math.floor(Number(input.tokens) || 0)),
    offerId: cleanOptionalText(input.offerId, 120),
    tradeId: cleanOptionalText(input.tradeId, 120),
    requesterUserId: cleanOptionalText(input.requesterUserId, 120),
    providerUserId: cleanOptionalText(input.providerUserId, 120),
    notes: cleanOptionalText(input.notes, 2000),
    description: cleanOptionalText(input.description, 2000),
    templateId: cleanOptionalText(input.templateId, 120),
  };
}

async function getUserForStorage(userId: string) {
  return usePostgres() ? getUserByIdPg(userId) : getUserById(userId);
}

async function saveTrueqiaChatMessage(message: TrueqiaChatMessage) {
  return usePostgres()
    ? addTrueqiaChatMessagePg(message)
    : addTrueqiaChatMessage(message);
}

async function createTrueqiaAssistantMessage(
  threadId: string,
  userId: string,
  text: string,
  tradeId?: string | null
) {
  const message: TrueqiaChatMessage = {
    id: randomUUID(),
    threadId,
    userId,
    tradeId: tradeId || null,
    senderId: null,
    senderName: "TrueQIA IA",
    senderRole: "system",
    text,
    createdAt: new Date().toISOString(),
  };

  return saveTrueqiaChatMessage(message);
}

async function getStoredTrueqiaChatMessages(userId: string, threadId: string) {
  return usePostgres()
    ? getTrueqiaChatMessagesPg(userId, threadId)
    : getTrueqiaChatMessages(userId, threadId);
}

async function getStoredTrueqiaChatThreadMessages(threadId: string) {
  return usePostgres()
    ? getTrueqiaChatThreadMessagesPg(threadId)
    : getTrueqiaChatThreadMessages(threadId);
}

async function getTradeForStorage(tradeId: string) {
  return usePostgres() ? getTradeByIdPg(tradeId) : getTradeById(tradeId);
}

async function getOfferForStorage(offerId: string) {
  return usePostgres() ? getOfferByIdPg(offerId) : getOfferById(offerId);
}

async function getTradeForParticipant(userId: string, tradeId: string) {
  const trade = await getTradeForStorage(tradeId);
  if (!trade) throw new Error("TRADE_NOT_FOUND");

  const isParticipant =
    (trade as any).fromUserId === userId || (trade as any).toUserId === userId;
  if (!isParticipant) throw new Error("TRADE_NOT_FOUND");

  return trade;
}

async function getContractsForStorage() {
  return usePostgres() ? getContractsPg() : getContracts();
}

async function getContractByIdForStorage(contractId: string) {
  return usePostgres() ? getContractByIdPg(contractId) : getContractById(contractId);
}

function isContractParticipant(contract: Contract, userId: string) {
  return contract.requesterUserId === userId || contract.providerUserId === userId;
}

function getNextContractAcceptance(contract: Contract, userId: string) {
  const isRequester = contract.requesterUserId === userId;
  const isProvider = contract.providerUserId === userId;

  if (!isRequester && !isProvider) throw new Error("CONTRACT_NOT_FOUND");

  const acceptedAt = new Date().toISOString();
  const requesterAcceptedAt =
    contract.requesterAcceptedAt || (isRequester ? acceptedAt : null);
  const providerAcceptedAt =
    contract.providerAcceptedAt || (isProvider ? acceptedAt : null);
  const requesterDone = !contract.requesterUserId || Boolean(requesterAcceptedAt);
  const providerDone = !contract.providerUserId || Boolean(providerAcceptedAt);

  return {
    requesterAcceptedAt,
    providerAcceptedAt,
    status: requesterDone && providerDone ? "accepted" : "partially_accepted",
  };
}

export async function listTrueqiaChatMessages(userId: string) {
  const threadId = trueqiaMainThreadId(userId);
  const items = await getStoredTrueqiaChatMessages(userId, threadId);

  if (items.length > 0) {
    return items;
  }

  const user = await getUserForStorage(userId);
  if (!user) throw new Error("USER_NOT_FOUND");

  const firstName = String((user as any).name || "usuario").split(" ")[0];
  const welcome: TrueqiaChatMessage = {
    id: randomUUID(),
    threadId,
    userId,
    senderId: null,
    senderName: "TrueQIA",
    senderRole: "system",
    text: `Hola ${firstName}. Este canal queda guardado para preparar trueques, acuerdos y contratos IA.`,
    createdAt: new Date().toISOString(),
  };

  return [await saveTrueqiaChatMessage(welcome)];
}

export async function createTrueqiaChatMessage(userId: string, text: unknown) {
  const cleanText = cleanChatText(text);
  if (!cleanText) throw new Error("INVALID_CHAT_MESSAGE");

  const user = await getUserForStorage(userId);
  if (!user) throw new Error("USER_NOT_FOUND");
  const threadId = trueqiaMainThreadId(userId);

  const message: TrueqiaChatMessage = {
    id: randomUUID(),
    threadId,
    userId,
    senderId: userId,
    senderName: (user as any).name || "Usuario",
    senderRole: "user",
    text: cleanText,
    createdAt: new Date().toISOString(),
  };

  const saved = await saveTrueqiaChatMessage(message);

  try {
    const history = await getStoredTrueqiaChatThreadMessages(threadId);
    const { generateTrueqiaChatReply } = await import("./ai/trueqia.chat.ai.service");
    const reply = await generateTrueqiaChatReply(history, cleanText, {
      userName: (user as any).name,
    });
    await createTrueqiaAssistantMessage(threadId, userId, reply);
  } catch (err) {
    console.error("TRUEQIA_CHAT_AI_ERROR:", err);
  }

  return saved;
}

export async function listTrueqiaTradeChatMessages(userId: string, tradeId: string) {
  try {
    const conversation = await openChatContext(userId, "trueqia", "trade", tradeId);
    const result = await listChatMessages(userId, "trueqia", conversation.id);
    return result.items;
  } catch (error) {
    if (error instanceof Error && error.message === "CHAT_NOT_FOUND") {
      throw new Error("TRADE_NOT_FOUND");
    }
    throw error;
  }
}

export async function createTrueqiaTradeChatMessage(
  userId: string,
  tradeId: string,
  text: unknown
) {
  try {
    const conversation = await openChatContext(userId, "trueqia", "trade", tradeId);
    return sendChatMessage(userId, "trueqia", conversation.id, text);
  } catch (error) {
    if (error instanceof Error && error.message === "CHAT_NOT_FOUND") {
      throw new Error("TRADE_NOT_FOUND");
    }
    throw error;
  }
}

export async function listTrueqiaContractsForUser(userId: string) {
  const contracts = await getContractsForStorage();

  const visible = (contracts as Contract[])
    .filter((contract) => {
      if (contract.app !== "trueqia") return false;
      if (
        contract.requesterUserId &&
        contract.providerUserId &&
        contract.requesterUserId === contract.providerUserId
      ) {
        return false;
      }
      return (
        contract.requesterUserId === userId ||
        contract.providerUserId === userId
      );
    });

  const grouped = new Map<string, Contract>();
  for (const contract of visible) {
    const key = contract.tradeId
      ? `trade:${contract.tradeId}`
      : contract.offerId && contract.requesterUserId && contract.providerUserId
        ? `offer:${contract.offerId}:${contract.requesterUserId}:${contract.providerUserId}`
        : `contract:${contract.id}`;
    const current = grouped.get(key);
    const rank = (item: Contract) =>
      item.status === "accepted" ? 3 : item.status === "partially_accepted" ? 2 : 1;
    if (
      !current ||
      rank(contract) > rank(current) ||
      (rank(contract) === rank(current) && contract.createdAt > current.createdAt)
    ) {
      grouped.set(key, contract);
    }
  }

  return [...grouped.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getTrueqiaContract(userId: string, id: string) {
  const contract = await getContractByIdForStorage(id);
  if (!contract || contract.app !== "trueqia" || !isContractParticipant(contract, userId)) throw new Error("CONTRACT_NOT_FOUND");
  return contract;
}

export async function getTrueqiaContractVersions(userId: string, id: string) {
  const contract = await getTrueqiaContract(userId, id);
  if (!contract.tradeId) return { items: [contract] };
  return { items: (await getContractsForStorage()).filter(c => c.app === "trueqia" && c.tradeId === contract.tradeId && isContractParticipant(c, userId)).sort((a, b) => (b.version || 1) - (a.version || 1)) };
}

export async function listTrueqiaContractTemplates() {
  const { listContractTemplates } = await import("./ai/contracts.ai.service");
  return listContractTemplates();
}

export async function acceptTrueqiaContract(userId: string, contractId: string) {
  if (usePostgres()) return acceptTrueqiaContractAndActivateTradePg(contractId, userId);
  const contract = getContractById(contractId);
  return withTrueqiaMemoryLock(`trade:${contract?.tradeId || contractId}`, () => acceptTrueqiaContractMemory(userId, contractId));
}

async function acceptTrueqiaContractMemory(userId: string, contractId: string) {
  if (usePostgres()) {
    return acceptTrueqiaContractAndActivateTradePg(contractId, userId);
  }

  const contract = await getContractByIdForStorage(contractId);

  if (!contract || contract.app !== "trueqia" || !isContractParticipant(contract as Contract, userId)) {
    throw new Error("CONTRACT_NOT_FOUND");
  }

  if (contract.status === "accepted") {
    if (contract.tradeId) activateTradeMemory(contract.tradeId);
    return contract;
  }
  if (contract.status !== "draft" && contract.status !== "partially_accepted") {
    throw new Error("INVALID_CONTRACT_STATUS");
  }

  if (contract.tradeId) assertTrueqiaSigningAllowed(getTradeById(contract.tradeId));
  const nextAcceptance = getNextContractAcceptance(contract as Contract, userId);
  if (nextAcceptance.status === "accepted" && contract.tradeId) {
    assertTradeCanActivateMemory(contract.tradeId);
  }

  const updated = updateContractAcceptance(contractId, nextAcceptance);
  if (!updated) throw new Error("CONTRACT_NOT_FOUND");
  if (updated.status === "accepted" && updated.tradeId) {
    activateTradeMemory(updated.tradeId);
  }
  return updated;
}

function assertTradeCanActivateMemory(tradeId: string) {
  const trade = getTradeById(tradeId);
  if (!trade) throw new Error("TRADE_NOT_FOUND");
  if (trade.status === "active" || trade.status === "completed") return trade;
  if (trade.status !== "accepted") throw new Error("INVALID_TRADE_STATUS");
  if (trade.tokensTransferredAt) return trade;

  const fromUser = getUserById(trade.fromUserId);
  const toUser = getUserById(trade.toUserId);
  if (!fromUser || !toUser) throw new Error("USER_NOT_FOUND");
  if ((fromUser.tokens || 0) < trade.tokens) throw new Error("INSUFFICIENT_TOKENS");
  return trade;
}

function activateTradeMemory(tradeId: string) {
  const trade = assertTradeCanActivateMemory(tradeId);
  if (trade.status === "active" || trade.status === "completed") return trade;

  const now = new Date().toISOString();
  if (!trade.tokensTransferredAt) {
    const fromUser = getUserById(trade.fromUserId)!;
    const toUser = getUserById(trade.toUserId)!;
    fromUser.tokens = (fromUser.tokens || 0) - trade.tokens;
    toUser.tokens = (toUser.tokens || 0) + trade.tokens;
    upsertUser(fromUser);
    upsertUser(toUser);
  }

  return updateTradeLifecycle(tradeId, {
    status: "active",
    startedAt: trade.startedAt || now,
    tokensTransferredAt: trade.tokensTransferredAt || now,
  });
}

function formatContractTextForPdf(text?: string | null) {
  if (!text?.trim()) return ["Contrato sin texto generado."];

  const normalized = text
    .replace(/\r/g, "\n")
    .replace(/\*\*/g, "")
    .replace(/\s+(\d+\.\s+)/g, "\n$1")
    .replace(/\n{3,}/g, "\n\n");

  const lines: string[] = [];
  for (const rawLine of normalized.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      if (lines[lines.length - 1] !== "") lines.push("");
      continue;
    }

    if (/^\d+\.\s+/.test(line) && lines.length && lines[lines.length - 1] !== "") {
      lines.push("");
    }
    lines.push(line);
  }

  return lines.length ? lines : ["Contrato sin texto generado."];
}

export async function exportTrueqiaContractPdf(userId: string, contractId: string) {
  const contract = await getContractByIdForStorage(contractId);

  if (!contract || contract.app !== "trueqia" || !isContractParticipant(contract as Contract, userId)) {
    throw new Error("CONTRACT_NOT_FOUND");
  }

  const typedContract = contract as Contract;
  const title = typedContract.offerTitle || "Contrato TrueQIA";
  const templateLabel = [
    typedContract.templateId || "plantilla",
    typedContract.templateVersion ? `v${typedContract.templateVersion}` : null,
  ].filter(Boolean).join(" ");

  const lines = [
    `Contrato: ${title}`,
    `ID: ${typedContract.id}`,
    `Estado: ${typedContract.status}`,
    `Plantilla: ${templateLabel}`,
    `Solicitante: ${typedContract.requesterName || "-"}`,
    `Proveedor: ${typedContract.providerName || "-"}`,
    `Tokens: ${typedContract.tokens ?? 0}`,
    typedContract.offerId ? `Oferta: ${typedContract.offerId}` : null,
    typedContract.tradeId ? `Trueque: ${typedContract.tradeId}` : null,
    `Creado: ${typedContract.createdAt}`,
    "",
    ...formatContractTextForPdf(typedContract.generatedText),
  ].filter((line): line is string => line !== null);

  return {
    filename: `trueqia-contract-${typedContract.id}.pdf`,
    buffer: buildTextPdf({ title: "Contrato TrueQIA", lines }),
  };
}

export async function createTrade(fromUserId: string, toUserId: string, offerId: string, tokens?: number): Promise<Trade> {
  return createTrueqiaTradeSafe(fromUserId, toUserId, offerId, tokens);
}

export async function acceptTrade(tradeId: string, actorUserId: string) {
  return acceptTrueqiaTradeSafe(tradeId, actorUserId);
}

export async function completeTrade(tradeId: string, actorUserId: string) {
  if (usePostgres()) return completeTradePg(tradeId, actorUserId);

  const trade = getTradeById(tradeId);
  if (!trade) throw new Error("TRADE_NOT_FOUND");
  if (trade.fromUserId !== actorUserId && trade.toUserId !== actorUserId) {
    throw new Error("TRADE_ACTION_FORBIDDEN");
  }
  if (trade.status === "completed") return trade;
  if (trade.status !== "active") throw new Error("INVALID_TRADE_STATUS");

  const now = new Date().toISOString();
  const fromCompletedAt =
    trade.fromCompletedAt || (trade.fromUserId === actorUserId ? now : null);
  const toCompletedAt =
    trade.toCompletedAt || (trade.toUserId === actorUserId ? now : null);
  const completed = Boolean(fromCompletedAt && toCompletedAt);

  return updateTradeLifecycle(tradeId, {
    fromCompletedAt,
    toCompletedAt,
    status: completed ? "completed" : "active",
    completedAt: completed ? trade.completedAt || now : null,
  });
}

export async function rejectTrade(tradeId: string, actorUserId: string) {
  const trade =
    ENV.STORAGE_DRIVER === "postgres"
      ? await getTradeByIdPg(tradeId)
      : getTradeById(tradeId);
  if (!trade) throw new Error("TRADE_NOT_FOUND");
  if (
    (trade as any).fromUserId !== actorUserId &&
    (trade as any).toUserId !== actorUserId
  ) {
    throw new Error("TRADE_ACTION_FORBIDDEN");
  }
  if ((trade as any).status === "rejected") return trade;
  if ((trade as any).status !== "pending") {
    throw new Error("INVALID_TRADE_STATUS");
  }

  return rejectTrueqiaTradeSafe(actorUserId, tradeId);
}

export async function listTradesForUser(userId?: string) {
  const trades = ENV.STORAGE_DRIVER === "postgres" ? await getTradesPg() : getTrades();
  const contracts = await getContractsForStorage();

  const filtered = (trades as any[]).filter((trade: any) =>
    userId ? trade.fromUserId === userId || trade.toUserId === userId : true
  );

  const out: any[] = [];
  for (const trade of filtered) {
    const offer =
      ENV.STORAGE_DRIVER === "postgres"
        ? await getOfferByIdPg(trade.offerId)
        : getOfferById(trade.offerId);
    const fromUser =
      ENV.STORAGE_DRIVER === "postgres"
        ? await getUserByIdPg(trade.fromUserId)
        : getUserById(trade.fromUserId);
    const toUser =
      ENV.STORAGE_DRIVER === "postgres"
        ? await getUserByIdPg(trade.toUserId)
        : getUserById(trade.toUserId);
    const contract = contracts
      .filter((item) => item.app === "trueqia" && item.tradeId === trade.id && !["superseded", "cancelled"].includes(item.status))
      .sort((a, b) => {
        const rank = (item: Contract) =>
          item.status === "accepted" ? 3 : item.status === "partially_accepted" ? 2 : 1;
        return rank(b) - rank(a) || b.createdAt.localeCompare(a.createdAt);
      })[0];

    out.push({
      ...trueqiaTradeDetails(trade),
      title: trade.trueqiaDetails?.offerSnapshot?.title || offer?.title || "Trueque",
      description: trade.trueqiaDetails?.offerSnapshot?.description || offer?.description,
      participants: [fromUser?.name || trade.fromUserId, toUser?.name || trade.toUserId].filter(Boolean),
      offerOwnerId: (offer as any)?.ownerUserId,
      contractId: contract?.id,
      contractStatus: contract?.status,
      offer: offer
        ? {
            ...(trade.trueqiaDetails?.offerSnapshot || safeOffer(offer)),
            owner: {
              id: toUser?.id || trade.toUserId,
              name: toUser?.name,
            },
          }
        : undefined,
    });
  }
  return out;
}

function fallbackContractText(input: DemoContractInput, template = DEFAULT_CONTRACT_TEMPLATE) {
  return [
    "BORRADOR DE CONTRATO TRUEQIA",
    "",
    `Plantilla: ${template.id} v${template.version}`,
    `Tipo: ${template.title}`,
    `Oferta: ${input.offerTitle}`,
    `Solicitante: ${input.requesterName}`,
    `Proveedor: ${input.providerName}`,
    `Tokens: ${input.tokens}`,
    "",
    "Este borrador se ha generado con la plantilla operativa de TrueQIA y debe revisarse antes de aceptarlo.",
  ].join("\n");
}

export async function generateContractPreview(userId: string, input: DemoContractInput): Promise<Contract> {
  if (usePostgres()) return generateContractPreviewInternal(userId, input);
  return withTrueqiaMemoryLock(`trade:${input.tradeId || input.offerId || userId}`, () => generateContractPreviewInternal(userId, input));
}

async function generateContractPreviewInternal(
  userId: string,
  input: DemoContractInput
): Promise<Contract> {
  let expectedNegotiationVersion = 0;
  let previousVersions: Contract[] = [];
  const normalized = normalizeContractInput({
    ...input,
    requesterUserId: input.requesterUserId || userId,
  });

  if (normalized.tradeId) {
    const trade = await getTradeForParticipant(userId, normalized.tradeId);
    assertTrueqiaSigningAllowed(trade);
    expectedNegotiationVersion = (trade as any).trueqiaDetails?.negotiation?.version || 0;
    previousVersions = (await getContractsForStorage()).filter(c => c.app === "trueqia" && c.tradeId === input.tradeId);
    const offer = (trade as any).trueqiaDetails?.offerSnapshot || await getOfferForStorage((trade as any).offerId);
    const existing = (await getContractsForStorage()).find(
      (contract) =>
        contract.app === "trueqia" && contract.tradeId === normalized.tradeId && !["superseded", "cancelled"].includes(contract.status)
    );
    if (existing) return existing;
    if ((trade as any).status !== "accepted") {
      throw new Error("TRADE_NOT_ACCEPTED");
    }

    const requester = await getUserForStorage((trade as any).fromUserId);
    const provider = await getUserForStorage((trade as any).toUserId);
    normalized.offerId = (trade as any).offerId;
    normalized.requesterUserId = (trade as any).fromUserId;
    normalized.providerUserId = (trade as any).toUserId;
    normalized.requesterName = requester?.name || normalized.requesterName;
    normalized.providerName = provider?.name || normalized.providerName;
    normalized.tokens = (trade as any).tokens || 0;
    normalized.offerTitle = offer?.title || normalized.offerTitle || "Contrato TrueQIA";
    normalized.description = normalized.description || offer?.description || null;
    const negotiation = (trade as any).trueqiaDetails?.negotiation;
    if (negotiation?.status === "accepted") {
      const value = negotiation.terms;
      normalized.notes = [normalized.notes, `Versión negociada ${negotiation.version}. Entregable: ${value.deliverable}. Sesiones: ${value.sessions ?? "por concretar"}. Fecha: ${value.dueDate || "por concretar"}. Revisiones: ${value.revisions ?? "por concretar"}. No incluye: ${value.excluded || "sin exclusiones adicionales"}.`].filter(Boolean).join("\n");
    }
  } else if (normalized.offerId) {
    const offer = await getOfferForStorage(normalized.offerId);
    if (!offer) throw new Error("OFFER_NOT_FOUND");
    if ((offer as any).ownerUserId === userId) {
      throw new Error("CANNOT_CONTRACT_OWN_OFFER");
    }
    normalized.requesterUserId = userId;
    normalized.providerUserId = (offer as any).ownerUserId || null;
    normalized.description = normalized.description || offer.description || null;

    const existing = (await getContractsForStorage())
      .filter(
        (contract) =>
          contract.app === "trueqia" &&
          contract.offerId === normalized.offerId &&
          contract.requesterUserId === normalized.requesterUserId &&
          contract.providerUserId === normalized.providerUserId &&
          contract.status !== "rejected"
      )
      .sort((a, b) => {
        const rank = (item: Contract) =>
          item.status === "accepted" ? 3 : item.status === "partially_accepted" ? 2 : 1;
        return rank(b) - rank(a) || b.createdAt.localeCompare(a.createdAt);
      })[0];
    if (existing) return existing;
  }

  let generatedText: string;
  let templateId = DEFAULT_CONTRACT_TEMPLATE.id;
  let templateVersion = DEFAULT_CONTRACT_TEMPLATE.version;
  let templateTitle = DEFAULT_CONTRACT_TEMPLATE.title;

  try {
    const { generateContractText, selectContractTemplate } = await import("./ai/contracts.ai.service");
    const template = selectContractTemplate({
      templateId: normalized.templateId,
      title: normalized.offerTitle,
      description: normalized.description,
      notes: normalized.notes,
    });
    templateId = template.id;
    templateVersion = template.version;
    templateTitle = template.title;
    generatedText = await generateContractText({
      templateId,
      title: normalized.offerTitle,
      requesterName: normalized.requesterName,
      providerName: normalized.providerName,
      tokens: normalized.tokens,
      notes: normalized.notes,
      description: normalized.description,
    });
  } catch (err) {
    console.error("CONTRACT_AI_ERROR:", err);
    generatedText = fallbackContractText(normalized, {
      id: templateId,
      version: templateVersion,
      title: templateTitle,
    });
  }

  const contract: Contract = {
    id: randomUUID(),
    app: "trueqia",
    type: "trade",
    status: "draft",
    version: Math.max(0, ...previousVersions.map(c => c.version || 1)) + 1,
    replacesId: previousVersions.sort((a, b) => (b.version || 1) - (a.version || 1))[0]?.id || null,
    offerId: normalized.offerId,
    tradeId: normalized.tradeId,
    requesterUserId: normalized.requesterUserId,
    providerUserId: normalized.providerUserId,
    offerTitle: normalized.offerTitle,
    requesterName: normalized.requesterName,
    providerName: normalized.providerName,
    tokens: normalized.tokens,
    notes: normalized.notes,
    description: normalized.description,
    templateId,
    templateVersion,
    requesterAcceptedAt: null,
    providerAcceptedAt: null,
    generatedText,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (usePostgres() && contract.tradeId) {
    return (getPrisma() as any).$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "Trade" WHERE "id" = $1 FOR UPDATE', contract.tradeId);
      const current = await tx.trade.findUnique({ where: { id: contract.tradeId } });
      if (!current) throw new Error("TRADE_NOT_FOUND");
      assertTrueqiaSigningAllowed(current);
      if ((current.trueqiaDetails?.negotiation?.version || 0) !== expectedNegotiationVersion) throw new Error("NEGOTIATION_VERSION_CONFLICT");
      const existing = await tx.contract.findFirst({ where: { app: "trueqia", tradeId: contract.tradeId, status: { in: ["draft", "partially_accepted", "accepted"] } } });
      if (existing) return existing;
      return tx.contract.create({ data: contract });
    });
  }
  return usePostgres() ? (createContractPg(contract) as any) : createContract(contract);
}

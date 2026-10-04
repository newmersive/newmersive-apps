import bcrypt from "bcryptjs";
import { getPrisma } from "../db/prisma";

const DEFAULT_DEMO_PASSWORD = "NewmersiveDemo2026!";

const DEMO_ACCOUNTS = [
  {
    key: "trueqia-requester",
    app: "trueqia",
    persona: "Solicitante",
    name: "Clara Creativa",
    email: "demo.trueqia.creator@newmersive.local",
    role: "user",
    sponsorCode: "DEMO-TQ-CLARA",
    referredByCode: null,
    tokens: 320,
    allwainBalance: 0,
  },
  {
    key: "trueqia-provider",
    app: "trueqia",
    persona: "Proveedor",
    name: "Bruno Estudio",
    email: "demo.trueqia.provider@newmersive.local",
    role: "company",
    sponsorCode: "DEMO-TQ-BRUNO",
    referredByCode: "DEMO-TQ-CLARA",
    tokens: 240,
    allwainBalance: 0,
  },
  {
    key: "allwain-buyer",
    app: "allwain",
    persona: "Comprador",
    name: "Inés Compras",
    email: "demo.allwain.buyer@newmersive.local",
    role: "buyer",
    sponsorCode: "DEMO-AW-INES",
    referredByCode: null,
    tokens: 0,
    allwainBalance: 58.5,
  },
  {
    key: "allwain-buyer-partner",
    app: "allwain",
    persona: "Comprador agrupado",
    name: "Nora Tienda",
    email: "demo.allwain.partner@newmersive.local",
    role: "buyer",
    sponsorCode: "DEMO-AW-NORA",
    referredByCode: "DEMO-AW-INES",
    tokens: 0,
    allwainBalance: 21,
  },
  {
    key: "allwain-provider-eco",
    app: "allwain",
    persona: "Proveedor económico",
    name: "EcoPack Supply",
    email: "demo.allwain.provider@newmersive.local",
    role: "company",
    sponsorCode: "DEMO-AW-ECO",
    referredByCode: null,
    tokens: 0,
    allwainBalance: 0,
  },
  {
    key: "allwain-provider-fast",
    app: "allwain",
    persona: "Proveedor rápido",
    name: "RapidBox Logística",
    email: "demo.allwain.provider2@newmersive.local",
    role: "company",
    sponsorCode: "DEMO-AW-FAST",
    referredByCode: null,
    tokens: 0,
    allwainBalance: 0,
  },
] as const;

const DEMO_IDS = {
  trueqiaPhotoOffer: "demo-ecosystem-tq-offer-photo",
  trueqiaDesignOffer: "demo-ecosystem-tq-offer-design",
  trueqiaPendingTrade: "demo-ecosystem-tq-trade-negotiation",
  trueqiaAcceptedTrade: "demo-ecosystem-tq-trade-completed",
  trueqiaPendingContract: "demo-ecosystem-tq-contract-negotiation",
  trueqiaAcceptedContract: "demo-ecosystem-tq-contract-completed",
  allwainProduct: "demo-ecosystem-aw-packaging",
  allwainEcoOffer: "demo-ecosystem-aw-offer-eco",
  allwainFastOffer: "demo-ecosystem-aw-offer-fast",
  allwainScan: "demo-ecosystem-aw-scan-packaging",
  allwainGroup: "demo-ecosystem-aw-group-packaging",
  allwainSaving: "demo-ecosystem-aw-saving-buyer",
  allwainReferral: "demo-ecosystem-aw-referral-partner",
} as const;

function demoPassword() {
  return process.env.DEMO_USER_PASSWORD || DEFAULT_DEMO_PASSWORD;
}

function accountSummary(account: (typeof DEMO_ACCOUNTS)[number]) {
  return {
    key: account.key,
    app: account.app,
    persona: account.persona,
    name: account.name,
    email: account.email,
  };
}

export async function seedDemoEcosystem() {
  const prisma = getPrisma() as any;
  const now = new Date();
  const passwordHash = await bcrypt.hash(demoPassword(), 10);
  const users: Record<string, any> = {};

  for (const account of DEMO_ACCOUNTS) {
    users[account.key] = await prisma.user.upsert({
      where: { email: account.email },
      create: {
        name: account.name,
        email: account.email,
        passwordHash,
        role: account.role,
        sponsorCode: account.sponsorCode,
        referredByCode: account.referredByCode,
        tokens: account.tokens,
        allwainBalance: account.allwainBalance,
      },
      update: {
        name: account.name,
        passwordHash,
        role: account.role,
        sponsorCode: account.sponsorCode,
        referredByCode: account.referredByCode,
        tokens: account.tokens,
        allwainBalance: account.allwainBalance,
      },
    });
  }

  const clara = users["trueqia-requester"];
  const bruno = users["trueqia-provider"];
  const buyer = users["allwain-buyer"];
  const partner = users["allwain-buyer-partner"];
  const ecoProvider = users["allwain-provider-eco"];
  const fastProvider = users["allwain-provider-fast"];

  const photoOffer = {
    id: DEMO_IDS.trueqiaPhotoOffer,
    title: "Fotografía de producto para catálogo",
    description: "Sesión de 25 productos, edición y entrega en formatos web y redes.",
    owner: "trueqia",
    ownerUserId: bruno.id,
    tokens: 90,
    price: null,
    productId: null,
    meta: { demo: true, category: "fotografía", deliveryDays: 12 },
    isUnique: false,
  };
  const designOffer = {
    id: DEMO_IDS.trueqiaDesignOffer,
    title: "Diseño de landing de lanzamiento",
    description: "Diseño responsive, prototipo y guía visual para una campaña.",
    owner: "trueqia",
    ownerUserId: clara.id,
    tokens: 70,
    price: null,
    productId: null,
    meta: { demo: true, category: "diseño", deliveryDays: 10 },
    isUnique: false,
  };

  for (const offer of [photoOffer, designOffer]) {
    await prisma.offer.upsert({
      where: { id: offer.id },
      create: { ...offer, createdAt: now },
      update: offer,
    });
  }

  await prisma.trade.upsert({
    where: { id: DEMO_IDS.trueqiaPendingTrade },
    create: {
      id: DEMO_IDS.trueqiaPendingTrade,
      offerId: photoOffer.id,
      fromUserId: clara.id,
      toUserId: bruno.id,
      tokens: 85,
      status: "pending",
      createdAt: now,
    },
    update: {
      offerId: photoOffer.id,
      fromUserId: clara.id,
      toUserId: bruno.id,
      tokens: 85,
      status: "pending",
      resolvedAt: null,
    },
  });

  await prisma.trade.upsert({
    where: { id: DEMO_IDS.trueqiaAcceptedTrade },
    create: {
      id: DEMO_IDS.trueqiaAcceptedTrade,
      offerId: designOffer.id,
      fromUserId: bruno.id,
      toUserId: clara.id,
      tokens: 65,
      status: "accepted",
      createdAt: now,
      resolvedAt: now,
    },
    update: {
      offerId: designOffer.id,
      fromUserId: bruno.id,
      toUserId: clara.id,
      tokens: 65,
      status: "accepted",
      resolvedAt: now,
    },
  });

  const pendingContractText = [
    "ACUERDO DEMO TRUEQIA",
    "Objeto: sesión fotográfica de 25 productos.",
    "Intercambio: 85 tokens TrueQIA.",
    "Entrega: fotografías editadas en un máximo de 12 días.",
    "Revisión: una ronda incluida antes de la aceptación final.",
    "Este documento es una simulación para pruebas y no constituye asesoramiento legal.",
  ].join("\n\n");
  const acceptedContractText = [
    "ACUERDO DEMO TRUEQIA COMPLETADO",
    "Objeto: diseño responsive de una landing de lanzamiento.",
    "Intercambio: 65 tokens TrueQIA.",
    "Estado: aceptado por ambas partes para demostrar el recorrido completo.",
  ].join("\n\n");

  await prisma.contract.upsert({
    where: { id: DEMO_IDS.trueqiaPendingContract },
    create: {
      id: DEMO_IDS.trueqiaPendingContract,
      app: "trueqia",
      type: "trade_contract",
      status: "partially_accepted",
      offerId: photoOffer.id,
      tradeId: DEMO_IDS.trueqiaPendingTrade,
      requesterUserId: clara.id,
      providerUserId: bruno.id,
      offerTitle: photoOffer.title,
      requesterName: clara.name,
      providerName: bruno.name,
      tokens: 85,
      notes: "Escenario demo preparado para que el proveedor complete la aceptación.",
      description: photoOffer.description,
      templateId: "trueqia-content-rights",
      templateVersion: "1.0.0",
      requesterAcceptedAt: now,
      providerAcceptedAt: null,
      generatedText: pendingContractText,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      status: "partially_accepted",
      requesterAcceptedAt: now,
      providerAcceptedAt: null,
      generatedText: pendingContractText,
      updatedAt: now,
    },
  });

  await prisma.contract.upsert({
    where: { id: DEMO_IDS.trueqiaAcceptedContract },
    create: {
      id: DEMO_IDS.trueqiaAcceptedContract,
      app: "trueqia",
      type: "trade_contract",
      status: "accepted",
      offerId: designOffer.id,
      tradeId: DEMO_IDS.trueqiaAcceptedTrade,
      requesterUserId: bruno.id,
      providerUserId: clara.id,
      offerTitle: designOffer.title,
      requesterName: bruno.name,
      providerName: clara.name,
      tokens: 65,
      notes: "Escenario demo ya completado.",
      description: designOffer.description,
      templateId: "trueqia-professional-services",
      templateVersion: "1.0.0",
      requesterAcceptedAt: now,
      providerAcceptedAt: now,
      generatedText: acceptedContractText,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      status: "accepted",
      requesterAcceptedAt: now,
      providerAcceptedAt: now,
      generatedText: acceptedContractText,
      updatedAt: now,
    },
  });

  const threadId = `trueqia:trade:${DEMO_IDS.trueqiaPendingTrade}`;
  const chatMessages = [
    {
      id: "demo-ecosystem-tq-chat-system",
      threadId,
      userId: clara.id,
      tradeId: DEMO_IDS.trueqiaPendingTrade,
      senderId: null,
      senderName: "TrueQIA",
      senderRole: "system",
      text: "Canal demo para acordar entregables, fechas y aceptación antes del contrato.",
    },
    {
      id: "demo-ecosystem-tq-chat-clara",
      threadId,
      userId: clara.id,
      tradeId: DEMO_IDS.trueqiaPendingTrade,
      senderId: clara.id,
      senderName: clara.name,
      senderRole: "user",
      text: "Necesito 25 fotografías editadas para web y redes antes de dos semanas.",
    },
    {
      id: "demo-ecosystem-tq-chat-bruno",
      threadId,
      userId: clara.id,
      tradeId: DEMO_IDS.trueqiaPendingTrade,
      senderId: bruno.id,
      senderName: bruno.name,
      senderRole: "user",
      text: "De acuerdo. Incluyo una ronda de revisión y propongo 85 tokens.",
    },
  ];

  for (const [index, message] of chatMessages.entries()) {
    await prisma.trueqiaChatMessage.upsert({
      where: { id: message.id },
      create: { ...message, createdAt: new Date(now.getTime() + index * 1000) },
      update: message,
    });
  }

  const product = {
    id: DEMO_IDS.allwainProduct,
    name: "Caja de embalaje reciclado 40x30x30 cm",
    ean: "8437000002026",
    category: "embalaje",
    brand: "Demo Packaging",
    description: "Caja de cartón reciclado de doble canal para envíos.",
    imageUrl: null,
    priceTokens: null,
  };
  await prisma.product.upsert({ where: { id: product.id }, create: product, update: product });

  const allwainOffers = [
    {
      id: DEMO_IDS.allwainEcoOffer,
      title: "100 cajas recicladas · EcoPack",
      description: "Entrega estándar en 10 días, transporte incluido y certificación FSC.",
      owner: "allwain",
      ownerUserId: ecoProvider.id,
      tokens: null,
      price: 134,
      productId: product.id,
      meta: { demo: true, supplier: ecoProvider.name, deliveryDays: 10, units: 100 },
      isUnique: false,
    },
    {
      id: DEMO_IDS.allwainFastOffer,
      title: "100 cajas recicladas · RapidBox",
      description: "Entrega urgente en 4 días, transporte incluido.",
      owner: "allwain",
      ownerUserId: fastProvider.id,
      tokens: null,
      price: 149,
      productId: product.id,
      meta: { demo: true, supplier: fastProvider.name, deliveryDays: 4, units: 100 },
      isUnique: false,
    },
  ];

  for (const offer of allwainOffers) {
    await prisma.offer.upsert({
      where: { id: offer.id },
      create: { ...offer, createdAt: now },
      update: offer,
    });
  }

  const extracted = {
    productName: product.name,
    brand: product.brand,
    category: product.category,
    ean: product.ean,
    sku: "BOX-403030-R",
    supplier: null,
    quantity: 100,
    unit: "unidades",
    targetPrice: 140,
    currency: "EUR",
    rawText: "CAJA RECICLADA 40X30X30 DOBLE CANAL · 100 UNIDADES · ENTREGA 15 DÍAS",
    confidence: 0.97,
    notes: ["Escenario demo generado para comparar precio y plazo."],
  };
  const scanRequest = {
    id: DEMO_IDS.allwainScan,
    userId: buyer.id,
    sourceType: "demo",
    status: "ready",
    title: "Petición demo: 100 cajas recicladas",
    description: "Compra de 100 cajas de doble canal con entrega máxima de 15 días.",
    extracted,
    product,
    offers: allwainOffers,
    imageMeta: { hasImage: false, bytesApprox: null, mimeType: null },
    ai: {
      provider: "openai",
      model: "demo-seed",
      confidence: 0.97,
      summary: "Petición completa. Hay dos ofertas comparables: menor precio o entrega más rápida.",
      warnings: [],
      rawData: { demo: true, recommendedOfferId: DEMO_IDS.allwainEcoOffer },
    },
  };
  await prisma.allwainScanRequest.upsert({
    where: { id: scanRequest.id },
    create: { ...scanRequest, createdAt: now, updatedAt: now },
    update: { ...scanRequest, updatedAt: now },
  });

  await prisma.orderGroup.upsert({
    where: { id: DEMO_IDS.allwainGroup },
    create: {
      id: DEMO_IDS.allwainGroup,
      productId: product.id,
      totalUnits: 100,
      minUnitsPerClient: 20,
      status: "open",
      participants: [
        { userId: buyer.id, units: 60 },
        { userId: partner.id, units: 40 },
      ],
    },
    update: {
      productId: product.id,
      totalUnits: 100,
      minUnitsPerClient: 20,
      status: "open",
      participants: [
        { userId: buyer.id, units: 60 },
        { userId: partner.id, units: 40 },
      ],
    },
  });

  await prisma.allwainSavingTransaction.upsert({
    where: { id: DEMO_IDS.allwainSaving },
    create: { id: DEMO_IDS.allwainSaving, userId: buyer.id, amount: 18.5, createdAt: now },
    update: { userId: buyer.id, amount: 18.5 },
  });

  await prisma.referralStat.upsert({
    where: { id: DEMO_IDS.allwainReferral },
    create: {
      id: DEMO_IDS.allwainReferral,
      userId: buyer.id,
      invitedUserId: partner.id,
      totalSavedByInvited: 21,
      commissionEarned: 2.1,
      monthlyHistory: [{ month: "demo", saved: 21, commission: 2.1 }],
    },
    update: {
      userId: buyer.id,
      invitedUserId: partner.id,
      totalSavedByInvited: 21,
      commissionEarned: 2.1,
      monthlyHistory: [{ month: "demo", saved: 21, commission: 2.1 }],
    },
  });

  return getDemoEcosystemStatus();
}

export async function getDemoEcosystemStatus() {
  const prisma = getPrisma() as any;
  const emails = DEMO_ACCOUNTS.map((account) => account.email);
  const existingUsers = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { email: true },
  });
  const existingEmails = new Set(existingUsers.map((user: any) => user.email));

  const [offers, trades, contracts, scans, groups] = await Promise.all([
    prisma.offer.count({
      where: { id: { in: [DEMO_IDS.trueqiaPhotoOffer, DEMO_IDS.trueqiaDesignOffer, DEMO_IDS.allwainEcoOffer, DEMO_IDS.allwainFastOffer] } },
    }),
    prisma.trade.count({ where: { id: { in: [DEMO_IDS.trueqiaPendingTrade, DEMO_IDS.trueqiaAcceptedTrade] } } }),
    prisma.contract.count({
      where: { id: { in: [DEMO_IDS.trueqiaPendingContract, DEMO_IDS.trueqiaAcceptedContract] } },
    }),
    prisma.allwainScanRequest.count({ where: { id: DEMO_IDS.allwainScan } }),
    prisma.orderGroup.count({ where: { id: DEMO_IDS.allwainGroup } }),
  ]);

  const counts = {
    users: existingEmails.size,
    offers,
    trades,
    contracts,
    scanRequests: scans,
    orderGroups: groups,
  };

  return {
    ready:
      counts.users === DEMO_ACCOUNTS.length &&
      counts.offers === 4 &&
      counts.trades === 2 &&
      counts.contracts === 2 &&
      counts.scanRequests === 1 &&
      counts.orderGroups === 1,
    accounts: DEMO_ACCOUNTS.map((account) => ({
      ...accountSummary(account),
      seeded: existingEmails.has(account.email),
    })),
    counts,
    scenarios: {
      trueqia: ["negotiation_pending", "trade_and_contract_completed"],
      allwain: ["ocr_request_with_competing_offers", "grouped_purchase_and_savings"],
    },
  };
}

import { ENV } from "../config/env";
import { Offer, Product } from "../shared/types";
import { getOffersByOwner, getProductById } from "./data.store";

interface DemoScenario {
  product: Product;
  offers: Offer[];
}

interface ScanDemoPayload {
  product: Product;
  offers: Offer[];
  message: string;
}

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    product: {
      id: "demo-allwain-coffee-1",
      name: "Café de origen Chiapas 250g",
      description:
        "Tostado medio con notas a cacao y panela. Etiqueta con trazabilidad y QR nutricional.",
      brand: "Allwain", 
      ean: "7501234567890",
      category: "café",
      imageUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93",
    },
    offers: [
      {
        id: "offer-allwain-demo-1",
        title: "Pack degustación Allwain",
        description:
          "3 orígenes con envío 24h y puntos Allwain para tu siguiente compra.",
        owner: "allwain",
        ownerUserId: "3",
        price: 32,
        productId: "demo-allwain-coffee-1",
        meta: { format: "grano" },
      },
      {
        id: "offer-allwain-demo-2",
        title: "Suscripción Allwain Trace",
        description:
          "Entrega mensual con seguimiento de finca, certificaciones y alertas de stock.",
        owner: "allwain",
        ownerUserId: "3",
        tokens: 90,
        price: 38,
        productId: "demo-allwain-coffee-1",
        meta: { term: "mensual" },
      },
    ],
  },
  {
    product: {
      id: "demo-allwain-labels-1",
      name: "Kit de etiquetas inteligentes (50u)",
      description:
        "Lote demo de etiquetas NFC/QR para trazabilidad y activaciones con recompensas.",
      brand: "Allwain",
      category: "packaging",
      imageUrl: "https://images.unsplash.com/photo-1497534446932-c925b458314e",
    },
    offers: [
      {
        id: "offer-allwain-demo-3",
        title: "Integración Allwain Rewards",
        description:
          "Configuramos la experiencia de escaneo con landing y wallet de puntos en 72h.",
        owner: "allwain",
        ownerUserId: "3",
        price: 55,
        productId: "demo-allwain-labels-1",
        meta: { service: "onboarding" },
      },
      {
        id: "offer-allwain-demo-4",
        title: "Analytics de escaneos en vivo",
        description:
          "Dashboard de calor, ubicaciones y conversiones para tu piloto de etiquetas.",
        owner: "allwain",
        ownerUserId: "3",
        tokens: 120,
        productId: "demo-allwain-labels-1",
        meta: { service: "analytics" },
      },
    ],
  },
  {
    product: {
      id: "demo-allwain-coldbrew-1",
      name: "Cold Brew listo para beber 330ml",
      description:
        "Botella RTD con trazabilidad blockchain, código nutricional y recomendación de pairing.",
      brand: "Allwain",
      category: "bebidas",
      imageUrl: "https://images.unsplash.com/photo-1510626176961-4b37d0f0b35c",
    },
    offers: [
      {
        id: "offer-allwain-demo-5",
        title: "Bundle cafeterías Aliadas",
        description:
          "Caja de 12 con materiales de punto de venta y programa de referidos Allwain.",
        owner: "allwain",
        ownerUserId: "3",
        price: 45,
        productId: "demo-allwain-coldbrew-1",
        meta: { channel: "horeca" },
      },
      {
        id: "offer-allwain-demo-6",
        title: "Recarga de tokens sabor edición limitada",
        description:
          "Créditos para canjear recetas de temporada y acceso anticipado a lotes especiales.",
        owner: "allwain",
        ownerUserId: "3",
        tokens: 70,
        productId: "demo-allwain-coldbrew-1",
        meta: { benefit: "edición limitada" },
      },
    ],
  },
];

function pickRandomScenario(): DemoScenario {
  const randomIndex = Math.floor(Math.random() * DEMO_SCENARIOS.length);
  return DEMO_SCENARIOS[randomIndex];
}

function buildLiveLikeScenario(): DemoScenario {
  const allwainOffers = getOffersByOwner("allwain");
  const defaultScenario = DEMO_SCENARIOS[0];

  const offerWithProduct = allwainOffers.find((offer) => Boolean(offer.productId));
  const productFromDb = offerWithProduct?.productId
    ? getProductById(offerWithProduct.productId)
    : undefined;

  const product = productFromDb ?? defaultScenario.product;

  const relatedOffers = allwainOffers.filter((offer) => {
    if (!offer.productId) return true;
    return offer.productId === product.id;
  });

  return {
    product,
    offers: relatedOffers.length > 0 ? relatedOffers : defaultScenario.offers,
  };
}

export function buildAllwainScanDemo(): ScanDemoPayload {
  const scenario = ENV.DEMO_MODE ? pickRandomScenario() : buildLiveLikeScenario();

  return {
    product: scenario.product,
    offers: scenario.offers,
    message: `Producto detectado: ${scenario.product.name} en tu zona`,
  };
}

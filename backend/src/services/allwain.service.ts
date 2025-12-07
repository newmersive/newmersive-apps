import {
  addLead,
  addOffer,
  addOrderGroup,
  getOfferById,
  getOffersByOwner,
  getOrderGroupById,
  getOrderGroups,
  getProductByEan,
  getProductById,
  updateOrderGroup,
} from "./data.store";
import {
  Lead,
  Offer,
  OrderGroup,
  OrderGroupParticipant,
  Product,
  User,
} from "../shared/types";

interface LocationInput {
  lat: number;
  lng: number;
}

interface CreateAllwainOfferInput {
  title: string;
  description: string;
  price?: number;
  tokens?: number;
  productId?: string;
  meta?: Record<string, unknown>;
  ownerUserId: string;
}

interface CreateOrderGroupInput {
  productId: string;
  totalUnits: number;
  minUnitsPerClient: number;
}

export function getAllwainProductById(id: string): Product | undefined {
  return getProductById(id);
}

export function getAllwainProductByEan(ean: string): Product | undefined {
  return getProductByEan(ean);
}

export function listAllwainOffers(location?: LocationInput): Offer[] {
  const offers = getOffersByOwner("allwain");

  if (!location) return offers;

  const withDistance = offers.map((offer, index) => {
    const distanceKm = ((offer.id.length + index * 7) % 80) + 5; // deterministic mock
    return {
      ...offer,
      meta: { ...offer.meta, distanceKm },
    } as Offer;
  });

  return withDistance.filter((offer) => (offer.meta?.distanceKm as number) <= 60);
}

export function createAllwainOffer(input: CreateAllwainOfferInput): Offer {
  const id = `offer-allwain-${Date.now()}`;
  const offer: Offer = {
    id,
    title: input.title,
    description: input.description,
    owner: "allwain",
    ownerUserId: input.ownerUserId,
    price: input.price,
    tokens: input.tokens,
    productId: input.productId,
    meta: input.meta,
  };

  return addOffer(offer);
}

export function createOfferInterest(
  offerId: string,
  user: User,
  message?: string
): Lead {
  const offer = getOfferById(offerId);
  if (!offer) {
    throw new Error("OFFER_NOT_FOUND");
  }

  const lead: Lead = {
    id: `lead-${Date.now()}`,
    name: user.name,
    email: user.email,
    source: "allwain-offer-interest",
    message,
    offerId: offer.id,
    userId: user.id,
    status: "new",
    createdAt: new Date().toISOString(),
  };

  return addLead(lead);
}

export function listOrderGroups(): OrderGroup[] {
  return getOrderGroups();
}

export function createOrderGroup(input: CreateOrderGroupInput): OrderGroup {
  const product = getProductById(input.productId);
  if (!product) {
    throw new Error("PRODUCT_NOT_FOUND");
  }

  const orderGroup: OrderGroup = {
    id: `order-group-${Date.now()}`,
    productId: input.productId,
    totalUnits: input.totalUnits,
    minUnitsPerClient: input.minUnitsPerClient,
    status: "open",
    participants: [],
  };

  return addOrderGroup(orderGroup);
}

export function joinOrderGroup(
  id: string,
  participant: OrderGroupParticipant
): OrderGroup {
  const orderGroup = getOrderGroupById(id);
  if (!orderGroup) {
    throw new Error("ORDER_GROUP_NOT_FOUND");
  }

  if (orderGroup.status === "closed") {
    throw new Error("ORDER_GROUP_CLOSED");
  }

  if (participant.units < orderGroup.minUnitsPerClient) {
    throw new Error("MIN_UNITS_NOT_MET");
  }

  const currentUnits = orderGroup.participants.reduce(
    (sum, p) => sum + p.units,
    0
  );
  if (currentUnits + participant.units > orderGroup.totalUnits) {
    throw new Error("ORDER_GROUP_FULL");
  }

  const existing = orderGroup.participants.find(
    (p) => p.userId === participant.userId
  );
  if (existing) {
    existing.units += participant.units;
  } else {
    orderGroup.participants.push(participant);
  }

  const updatedUnits = orderGroup.participants.reduce(
    (sum, p) => sum + p.units,
    0
  );

  if (updatedUnits >= orderGroup.totalUnits) {
    orderGroup.status = "closing";
  }

  return updateOrderGroup(orderGroup);
}

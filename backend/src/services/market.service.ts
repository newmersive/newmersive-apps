import { getOffersByOwner, getTrades } from "./data.store";
import { Offer, Trade } from "../shared/types";

export function listOffers(owner: "trueqia" | "allwain"): Offer[] {
  return getOffersByOwner(owner);
}

export function listTrades(): Trade[] {
  return getTrades();
}

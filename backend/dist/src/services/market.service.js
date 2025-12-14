"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listOffers = listOffers;
exports.listTrades = listTrades;
const data_store_1 = require("./data.store");
function listOffers(owner) {
    return (0, data_store_1.getOffersByOwner)(owner);
}
function listTrades() {
    return (0, data_store_1.getTrades)();
}

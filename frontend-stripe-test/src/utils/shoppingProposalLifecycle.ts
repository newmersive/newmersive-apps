import type { AllwainContract, AllwainOffer, AllwainShoppingList, AllwainShoppingListProposal } from "../config/api";

type Proposal = Pick<AllwainShoppingListProposal, "id" | "status" | "isSelected" | "isSelectable" | "expired" | "validUntil" | "meta">;
type List = Pick<AllwainShoppingList, "status" | "selectedOfferId">;

export function shoppingProposalWithdrawalConfirmed(proposal: AllwainShoppingListProposal, updated: AllwainOffer) {
  const owner = proposal.ownerUserId || proposal.provider?.id;
  return Boolean(owner) && updated?.id === proposal.id && (updated.ownerUserId || updated.provider?.id) === owner &&
    updated.allwainType === "proposal" && updated.allwainStatus === "withdrawn";
}

export function shoppingProposalDetailMatches(original: AllwainShoppingList, updated: AllwainShoppingList, proposal: AllwainShoppingListProposal) {
  return updated?.id === original.id && updated.buyerUserId === original.buyerUserId && (
    !updated.myProposal || (updated.myProposal.id === proposal.id && updated.myProposal.shoppingListId === original.id &&
      (updated.myProposal.ownerUserId || updated.myProposal.provider?.id) === (proposal.ownerUserId || proposal.provider?.id))
  );
}

/** Retiring a proposal never cancels the order created from an earlier award. */
export function shoppingProposalLifecycle(list: List, proposal?: Proposal | null, now = Date.now()) {
  const selected = Boolean(proposal && (
    proposal.isSelected || proposal.status === "selected" ||
    list.selectedOfferId === proposal.id ||
    typeof proposal.meta?.orderId === "string" || typeof proposal.meta?.contractId === "string"
  ));
  const withdrawn = proposal?.status === "withdrawn";
  const retired = Boolean(proposal && ["withdrawn", "closed", "rejected", "abandoned"].includes(proposal.status));
  const open = ["published", "partially_awarded"].includes(list.status);
  const active = proposal?.status === "active";
  const expired = Boolean(proposal && (proposal.expired || (
    proposal.validUntil && Number.isFinite(Date.parse(proposal.validUntil)) && Date.parse(proposal.validUntil) <= now
  )));
  return {
    selected,
    withdrawn,
    retired,
    open,
    expired,
    canEdit: open && !selected && !retired,
    canWithdraw: Boolean(proposal && !selected && !retired && ["active", "paused"].includes(proposal.status)),
    canAccept: Boolean(proposal && open && active && !selected && !retired && !expired && proposal.isSelectable === true),
  };
}

/** A response for an old account, role, detail or request cannot replace a newer view. */
export function createShoppingListRequestGuard(initialScope = "") {
  let scope = initialScope;
  let generation = 0;
  const revisions = new Map<string, number>();
  return {
    setScope(next: string) {
      if (next !== scope) { scope = next; generation += 1; revisions.clear(); }
    },
    start(channel: string) {
      const revision = (revisions.get(channel) || 0) + 1;
      revisions.set(channel, revision);
      return { scope, generation, channel, revision };
    },
    invalidate(channel?: string) {
      if (channel) revisions.set(channel, (revisions.get(channel) || 0) + 1);
      else for (const [key, revision] of revisions) revisions.set(key, revision + 1);
    },
    isCurrent(ticket: { scope: string; generation: number; channel: string; revision: number }, currentScope = scope) {
      return ticket.scope === scope && ticket.generation === generation && scope === currentScope && revisions.get(ticket.channel) === ticket.revision;
    },
  };
}

export function shoppingProposalOrderTarget(
  contracts: AllwainContract[], hasNextPage: boolean, proposalId: string, accountId: string, scope: "buyer" | "seller",
): { section: "orders"; contractId?: string } | null {
  const matches = contracts.filter((contract) => contract.app === "allwain" && contract.offerId === proposalId &&
    (scope === "seller" ? contract.providerUserId === accountId : contract.requesterUserId === accountId));
  if (!matches.length) return null;
  return !hasNextPage && contracts.length === 1 && matches.length === 1
    ? { section: "orders", contractId: matches[0].id }
    : { section: "orders" };
}

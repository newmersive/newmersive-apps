import { Router, type Request, type Response } from "express";

import { authRequired } from "../middleware/auth.middleware";
import {
  cancelAllwainShoppingList,
  createAllwainShoppingList,
  duplicateAllwainShoppingList,
  getAllwainShoppingListForUser,
  listAllwainShoppingListMarket,
  listMyAllwainShoppingLists,
  parseAllwainShoppingListText,
  publishAllwainShoppingList,
  reviewAllwainOcrShoppingList,
  updateAllwainShoppingList,
  upsertAllwainShoppingListProposal,
} from "../services/allwain-shopping-lists.service";

const router = Router();

function userId(req: Request) {
  return (req as any).user?.id as string | undefined;
}

function sendShoppingListError(error: unknown, res: Response) {
  if (!(error instanceof Error)) return false;
  if (error.message === "SHOPPING_LIST_NOT_FOUND") {
    res.status(404).json({ error: error.message });
    return true;
  }
  if (error.message === "SELLER_ROLE_REQUIRED") {
    res.status(403).json({ error: error.message });
    return true;
  }
  if (
    [
      "SHOPPING_LIST_LOCKED",
      "SHOPPING_LIST_NOT_OPEN",
      "SHOPPING_LIST_CHANGED",
      "SHOPPING_LIST_PROPOSAL_ALREADY_SELECTED",
      "SHOPPING_LIST_ITEMS_ALREADY_AWARDED",
      "SHOPPING_LIST_SUBSTITUTION_NOT_ALLOWED",
      "SHOPPING_LIST_PROPOSAL_QUANTITY_MISMATCH",
      "PROPOSAL_NOT_EDITABLE",
      "PROPOSAL_NOT_IMPROVED",
      "PROPOSAL_EXPIRED",
      "OCR_LIST_REVIEW_ONLY",
    ].includes(error.message)
  ) {
    res.status(409).json({ error: error.message });
    return true;
  }
  if (
    ["SHOPPING_LIST_IMPORT_TOO_LARGE", "TOO_MANY_SHOPPING_LIST_ITEMS"].includes(
      error.message,
    )
  ) {
    res.status(413).json({ error: error.message });
    return true;
  }
  if (error.message === "PUBLICATION_BLOCKED") {
    res.status(422).json({
      error: error.message,
      review: (error as any).review || null,
    });
    return true;
  }
  if (
    [
      "EMPTY_SHOPPING_LIST_IMPORT",
      "INVALID_SHOPPING_LIST_ITEMS",
      "INVALID_SHOPPING_LIST_ITEM_NAME",
      "INVALID_SHOPPING_LIST_ITEM_QUANTITY",
      "INVALID_SHOPPING_LIST_ITEM_UNIT",
      "INVALID_SHOPPING_LIST_TARGET_PRICE",
      "INVALID_SHOPPING_LIST_PROPOSAL_ITEM",
      "INVALID_SHOPPING_LIST_PROPOSAL_ITEMS",
      "SHOPPING_LIST_REQUIRES_MULTIPLE_ITEMS",
      "INVALID_CURRENCY",
      "INVALID_LOCATION",
      "INVALID_RECURRENCE",
      "INVALID_DELIVERY_CHANNEL",
      "INVALID_PROPOSAL_DEADLINE",
      "PROPOSAL_DEADLINE_TOO_FAR",
      "INVALID_PROPOSAL_WINDOW",
      "INVALID_PROPOSAL_VALID_UNTIL",
      "INVALID_PROPOSAL_DURATION",
      "PROPOSAL_WINDOW_TOO_SHORT",
      "INVALID_SHOPPING_LIST_SHIPPING_WEIGHT",
      "INVALID_SHOPPING_LIST_STATUS",
      "INVALID_SHOPPING_LIST_CURSOR",
      "MISSING_OFFER_FIELDS",
      "INVALID_OFFER_PRICE",
      "OFFER_ABOVE_REFERENCE_PRICE",
      "INVALID_OCR_LIST_SELECTION",
    ].includes(error.message)
  ) {
    res.status(400).json({ error: error.message });
    return true;
  }
  return false;
}

router.post("/parse", authRequired, async (req: Request, res: Response) => {
  try {
    if (!userId(req))
      return void res.status(401).json({ error: "UNAUTHORIZED" });
    res.json(parseAllwainShoppingListText(req.body?.rawText));
  } catch (error) {
    if (sendShoppingListError(error, res)) return;
    console.error("Error in POST /allwain/shopping-lists/parse:", error);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/mine", authRequired, async (req: Request, res: Response) => {
  try {
    const id = userId(req);
    if (!id) return void res.status(401).json({ error: "UNAUTHORIZED" });
    res.json(
      await listMyAllwainShoppingLists(id, {
        limit: req.query.limit,
        cursor: req.query.cursor,
        query: req.query.q,
        status: req.query.status,
      }),
    );
  } catch (error) {
    if (sendShoppingListError(error, res)) return;
    console.error("Error in GET /allwain/shopping-lists/mine:", error);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/market", authRequired, async (req: Request, res: Response) => {
  try {
    const id = userId(req);
    if (!id) return void res.status(401).json({ error: "UNAUTHORIZED" });
    res.json(
      await listAllwainShoppingListMarket(id, {
        limit: req.query.limit,
        cursor: req.query.cursor,
        query: req.query.q,
      }),
    );
  } catch (error) {
    if (sendShoppingListError(error, res)) return;
    console.error("Error in GET /allwain/shopping-lists/market:", error);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/", authRequired, async (req: Request, res: Response) => {
  try {
    const id = userId(req);
    if (!id) return void res.status(401).json({ error: "UNAUTHORIZED" });
    res.status(201).json(await createAllwainShoppingList(id, req.body || {}));
  } catch (error) {
    if (sendShoppingListError(error, res)) return;
    console.error("Error in POST /allwain/shopping-lists:", error);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/:id", authRequired, async (req: Request, res: Response) => {
  try {
    const id = userId(req);
    if (!id) return void res.status(401).json({ error: "UNAUTHORIZED" });
    res.json(await getAllwainShoppingListForUser(id, req.params.id));
  } catch (error) {
    if (sendShoppingListError(error, res)) return;
    console.error("Error in GET /allwain/shopping-lists/:id:", error);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.patch("/:id", authRequired, async (req: Request, res: Response) => {
  try {
    const id = userId(req);
    if (!id) return void res.status(401).json({ error: "UNAUTHORIZED" });
    res.json(
      await updateAllwainShoppingList(id, req.params.id, req.body || {}),
    );
  } catch (error) {
    if (sendShoppingListError(error, res)) return;
    console.error("Error in PATCH /allwain/shopping-lists/:id:", error);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.patch(
  "/:id/ocr-review",
  authRequired,
  async (req: Request, res: Response) => {
    try {
      const id = userId(req);
      if (!id) return void res.status(401).json({ error: "UNAUTHORIZED" });
      res.json(
        await reviewAllwainOcrShoppingList(id, req.params.id, {
          selectedItemIds: req.body?.selectedItemIds,
        }),
      );
    } catch (error) {
      if (sendShoppingListError(error, res)) return;
      console.error(
        "Error in PATCH /allwain/shopping-lists/:id/ocr-review:",
        error,
      );
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.post(
  "/:id/publish",
  authRequired,
  async (req: Request, res: Response) => {
    try {
      const id = userId(req);
      if (!id) return void res.status(401).json({ error: "UNAUTHORIZED" });
      res.json(await publishAllwainShoppingList(id, req.params.id));
    } catch (error) {
      if (sendShoppingListError(error, res)) return;
      console.error(
        "Error in POST /allwain/shopping-lists/:id/publish:",
        error,
      );
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.post(
  "/:id/duplicate",
  authRequired,
  async (req: Request, res: Response) => {
    try {
      const id = userId(req);
      if (!id) return void res.status(401).json({ error: "UNAUTHORIZED" });
      res
        .status(201)
        .json(
          await duplicateAllwainShoppingList(id, req.params.id, req.body || {}),
        );
    } catch (error) {
      if (sendShoppingListError(error, res)) return;
      console.error(
        "Error in POST /allwain/shopping-lists/:id/duplicate:",
        error,
      );
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.post(
  "/:id/proposals",
  authRequired,
  async (req: Request, res: Response) => {
    try {
      const id = userId(req);
      if (!id) return void res.status(401).json({ error: "UNAUTHORIZED" });
      const result = await upsertAllwainShoppingListProposal(
        id,
        req.params.id,
        req.body || {},
      );
      res.status(result.created ? 201 : 200).json(result.shoppingList);
    } catch (error) {
      if (sendShoppingListError(error, res)) return;
      console.error(
        "Error in POST /allwain/shopping-lists/:id/proposals:",
        error,
      );
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

router.post(
  "/:id/cancel",
  authRequired,
  async (req: Request, res: Response) => {
    try {
      const id = userId(req);
      if (!id) return void res.status(401).json({ error: "UNAUTHORIZED" });
      res.json(await cancelAllwainShoppingList(id, req.params.id));
    } catch (error) {
      if (sendShoppingListError(error, res)) return;
      console.error("Error in POST /allwain/shopping-lists/:id/cancel:", error);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  },
);

export default router;

import { Router, Request, Response } from "express";
import { authRequired, adminOnly } from "../middleware/auth.middleware";
import { getDatabase, getLeadsGlobal } from "../services/data.store";
import { getPublicUsers } from "../services/auth.service";
import { LeadGlobal } from "../shared/types";

const router = Router();

/* =========================
   GET /admin/dashboard
========================= */

router.get(
  "/dashboard",
  authRequired,
  adminOnly,
  (req: Request, res: Response): void => {
    try {
      const db = getDatabase();

      const totals = {
        users: db.users.length,
        offers: db.offers.length,
        trades: db.trades.length,
        products: db.products.length,
        leadsLocal: db.leads.length,
        leadsGlobal: db.leadsGlobal.length,
        contracts: db.contracts.length,
        orderGroups: db.orderGroups.length,
        referralStats: db.referralStats.length,
        allwainSavings: db.allwainSavings.length,
      };

      res.json({
        admin: true,
        totals,
      });
    } catch (err) {
      console.error("Error in GET /admin/dashboard:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

/* =========================
   GET /admin/users
========================= */

router.get(
  "/users",
  authRequired,
  adminOnly,
  (req: Request, res: Response): void => {
    try {
      const users = getPublicUsers();
      res.json({ users });
    } catch (err) {
      console.error("Error in GET /admin/users:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

/* =========================
   GET /admin/leads
========================= */

router.get(
  "/leads",
  authRequired,
  adminOnly,
  (req: Request, res: Response): void => {
    try {
      const items: LeadGlobal[] = getLeadsGlobal();
      res.json({ items });
    } catch (err) {
      console.error("Error in GET /admin/leads:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

/* =========================
   GET /admin/ai/activity
   (stub demo)
========================= */

router.get(
  "/ai/activity",
  authRequired,
  adminOnly,
  (req: Request, res: Response): void => {
    try {
      const events = [
        {
          id: "demo-1",
          userEmail: "demo-user@newmersive.local",
          reason: "content_scan",
          severity: "low",
          createdAt: new Date().toISOString(),
        },
      ];

      res.json({ events });
    } catch (err) {
      console.error("Error in GET /admin/ai/activity:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

export default router;

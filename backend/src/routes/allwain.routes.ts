import { Router } from "express";
import { authRequired, AuthRequest } from "../middleware/auth.middleware";

const router=Router();

router.get("/scan-demo", authRequired, (req:AuthRequest,res)=>{
  res.json({
    result:"Etiqueta leída",
    productName:"Café molido",
    suggestions:["Tienda A","Tienda B"],
    user:req.user?.email
  });
});

export default router;
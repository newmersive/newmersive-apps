import { Router } from "express";
import { authRequired, AuthRequest } from "../middleware/auth.middleware";
import { generateDemoContract } from "../ia/contracts.service";

const router=Router();

router.get("/offers", authRequired, (req:AuthRequest,res)=>{
  res.json({ items:[
    {id:"1",title:"Clases IA"},
    {id:"2",title:"Diseño logo"}
  ], user:req.user });
});

router.post("/contracts/preview", authRequired,(req:AuthRequest,res)=>{
  const text = generateDemoContract(req.body);
  res.json({ contractText:text });
});

export default router;
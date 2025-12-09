# Newmersive Backend

API en Node.js + TypeScript para **TRUEQIA** y **ALLWAIN**.  
Toda la plataforma funciona en **modo DEMO con persistencia en JSON**, preparada para escalar posteriormente a base de datos real.

---

## 📦 Stack

- Node.js 20 (LTS)
- Express
- TypeScript
- JWT Auth
- Persistencia en archivo JSON (`data/database.json`)
- IA simulada (contratos + moderación)
- Arquitectura compartida para:
  - TrueQIA (trueques + tokens)
  - Allwain (compras + ahorro + comisiones)

---

## ⚙️ Requisitos

- Node.js 20+
- npm 10+
- Permisos de escritura en:
  ```
  backend/data/database.json
  ```

---

## 🔐 Variables de entorno (`.env`)

```env
PORT=4000
JWT_SECRET=dev-secret-change-me
NODE_ENV=development
DEMO_MODE=false
DATA_FILE=./data/database.json
```

---

## 🚀 Instalación

```bash
cd backend
npm install
npm run dev
```

Producción:

```bash
npm run build
npm start
```

Con pm2:

```bash
pm2 start dist/server.js --name newmersive-backend
```

---

## ✅ Healthcheck

```
GET /api/health
```

---

# 🔐 AUTH

| Método | Ruta |
|--------|------|
| POST | /api/auth/register |
| POST | /api/auth/login |
| GET  | /api/auth/me |
| POST | /api/auth/forgot-password |
| POST | /api/auth/reset-password |

- Soporta `sponsorCode`
- Genera uno propio automático
- Devuelve `AuthTokenResponse`

---

# 🔁 TRUEQIA

| Método | Ruta |
|--------|------|
| GET  | /api/trueqia/offers |
| POST | /api/trueqia/offers |
| POST | /api/trueqia/trades |
| POST | /api/trueqia/trades/:id/accept |
| POST | /api/trueqia/trades/:id/reject |
| POST | /api/trueqia/contracts/preview |

- Usa **tokens internos**
- Genera contratos por IA (demo)
- Control total desde `data.store.ts`

---

# 🛒 ALLWAIN

| Método | Ruta |
|--------|------|
| GET  | /api/allwain/scan-demo |
| GET  | /api/allwain/offers |
| POST | /api/allwain/offers |
| POST | /api/allwain/offers/:id/interest |
| GET  | /api/allwain/order-groups |
| POST | /api/allwain/order-groups |
| POST | /api/allwain/order-groups/:id/join |
| POST | /api/allwain/savings |
| GET  | /api/allwain/sponsors/summary |

- Calcula **ahorro real**
- Aplica **comisión de por vida**
- Guarda balances en el usuario

---

# 🤝 LEADS (WEB + APP + WHATSAPP)

```
POST /api/leads/whatsapp
```

```json
{
  "message": "Estoy interesado",
  "sourceApp": "trueqia",
  "phone": "+34...",
  "name": "Carlos"
}
```

- Canal: `whatsapp | web | app`
- Fuente: `trueqia | allwain`
- Visible desde panel admin

---

# 🛠️ ADMIN

| Método | Ruta |
|--------|------|
| GET | /api/admin/dashboard |
| GET | /api/admin/users |
| GET | /api/admin/leads |
| GET | /api/admin/ai/activity |

Protegido con:
- `authRequired`
- `adminOnly`

---

# 🧠 IA (DEMO)

- `contracts.service.ts` → genera texto de contratos
- `moderation.service.ts` → filtra contenido futuro

---

# 📁 Estructura clave

```
src/
 ├─ routes/
 ├─ services/
 ├─ ia/
 ├─ shared/
 ├─ middleware/
data/
 └─ database.json
```

---

# ⚠️ Notas importantes

- NO usa base de datos real
- NO hay pagos reales
- NO WhatsApp real (solo endpoint preparado)
- TODO es reproducible con JSON

---

# ✅ Estado actual

- Auth ✅
- TrueQIA ✅
- Allwain ✅
- Leads ✅
- Sponsors ✅
- Contracts ✅
- IA Demo ✅
- Admin ✅

---

# ⛔ Producción real

Cuando pases a producción real:
- Cambiar `DATA_FILE` a ruta persistente
- Cambiar `JWT_SECRET`
- Migrar a PostgreSQL/Mongo

---


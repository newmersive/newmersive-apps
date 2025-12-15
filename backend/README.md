# Newmersive Backend

API en Node.js + TypeScript para **TrueQIA** y **Allwain**.

---

## Stack

- Node.js 20 (LTS)
- Express
- TypeScript
- Prisma
- PostgreSQL (local)
- JWT Auth

---

## Requisitos

- Node.js 20+
- npm 10+
- PostgreSQL accesible (por defecto: `localhost:5432`)

---

## Variables de entorno (.env)

Ejemplo mínimo:

```env
PORT=4000
NODE_ENV=development
JWT_SECRET=dev-secret-change-me
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/newmersive?schema=public
STORAGE_DRIVER=postgres
DEMO_MODE=false
ALLOWED_ORIGINS=http://localhost:19006,http://localhost:19000,http://localhost:3000

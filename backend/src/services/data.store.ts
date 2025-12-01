import fs from "fs";
import path from "path";
import { Offer, Trade, User } from "../shared/types";

interface Database {
  users: User[];
  offers: Offer[];
  trades: Trade[];
}

const DATA_FILE =
  process.env.DATA_FILE || path.join(__dirname, "../../data/database.json");

let cache: Database | null = null;

const defaultData: Database = {
  users: [],
  offers: [
    {
      id: "offer-trueqia-1",
      title: "Edición de video para evento",
      description: "Montaje completo con ajustes de color y audio.",
      tokens: 80,
      owner: "trueqia",
      category: "creativos",
    },
    {
      id: "offer-trueqia-2",
      title: "Mentoría en IA aplicada",
      description: "Sesión 1 a 1 para integrar IA en flujos de trabajo.",
      tokens: 120,
      owner: "trueqia",
      category: "formación",
    },
    {
      id: "offer-allwain-1",
      title: "Descuento en café de especialidad",
      description: "Pack degustación 3 orígenes con envío 24h",
      tokens: 30,
      owner: "allwain",
      category: "gourmet",
    },
    {
      id: "offer-allwain-2",
      title: "Revisión de etiquetas nutricionales",
      description: "Analizamos tu código QR y devolvemos sugerencias",
      tokens: 45,
      owner: "allwain",
      category: "análisis",
    },
  ],
  trades: [
    {
      id: "trade-1",
      title: "Trueque de horas de diseño",
      status: "activo",
      participants: ["trueqia-demo@newmersive.app", "company@trueqia.app"],
      tokens: 150,
    },
    {
      id: "trade-2",
      title: "Alianza para campaña social",
      status: "negociando",
      participants: ["marca@allwain.com", "creador@trueqia.app"],
      tokens: 90,
    },
  ],
};

function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadFromDisk(): Database {
  ensureDataDir();
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
    return { ...defaultData };
  }

  const raw = fs.readFileSync(DATA_FILE, "utf8");
  if (!raw) return { ...defaultData };

  const parsed = JSON.parse(raw) as Database;
  return {
    users: parsed.users || [],
    offers: parsed.offers || defaultData.offers,
    trades: parsed.trades || defaultData.trades,
  };
}

function saveToDisk(data: Database) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export function getDatabase(): Database {
  if (!cache) {
    cache = loadFromDisk();
  }
  return cache;
}

export function persistDatabase() {
  if (!cache) return;
  saveToDisk(cache);
}

export function resetDatabase(data: Partial<Database>) {
  cache = {
    users: data.users ?? [],
    offers: data.offers ?? defaultData.offers,
    trades: data.trades ?? defaultData.trades,
  };
  persistDatabase();
}

export function upsertUser(user: User) {
  const db = getDatabase();
  const existingIndex = db.users.findIndex((u) => u.id === user.id);
  if (existingIndex >= 0) {
    db.users[existingIndex] = user;
  } else {
    db.users.push(user);
  }
  persistDatabase();
}

export function setUsers(users: User[]) {
  const db = getDatabase();
  db.users = users;
  persistDatabase();
}

export function getOffersForOwner(owner: "trueqia" | "allwain") {
  return getDatabase().offers.filter((offer) => offer.owner === owner);
}

export function getTrades() {
  return getDatabase().trades;
}

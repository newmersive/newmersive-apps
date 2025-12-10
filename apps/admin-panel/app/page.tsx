"use client";

import { useEffect, useMemo, useState } from "react";
import {
  API_BASE_URL,
  AllwainSponsorStat,
  AuthUser,
  ModerationEvent,
  Offer,
  Trade,
  fetchAdminUsers,
  fetchModerationEvents,
  fetchOffers,
  fetchProfile,
  fetchSponsorStats,
  fetchTrades,
  login,
} from "../lib/api";

const MODULES = [
  "Overview",
  "Usuarios",
  "Patrocinadores",
  "IA",
  "Escaneo",
  "Contratos",
];

type AiModule = {
  key: string;
  label: string;
  description: string;
};

const AI_MODULES: AiModule[] = [
  { key: "contracts", label: "Contratos", description: "Generación y revisión de contratos" },
  { key: "moderation", label: "Moderación", description: "Alertas de contenido y fraude" },
  { key: "leads", label: "Leads", description: "Captura y priorización de oportunidades" },
];

const SCAN_PROVIDERS = ["google", "mock", "internal"] as const;

type ScanProvider = (typeof SCAN_PROVIDERS)[number];

type ContractView = {
  id: string;
  title: string;
  app: "trueqia" | "allwain" | "unknown";
  status: Trade["status"];
  tokens: number;
  createdAt: string;
  resolvedAt?: string;
};

export default function AdminPage() {
  const [selectedModule, setSelectedModule] = useState<string>(MODULES[0]);
  const [email, setEmail] = useState("admin@newmersive.local");
  const [password, setPassword] = useState("admin123");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [users, setUsers] = useState<AuthUser[]>([]);
  const [aiEvents, setAiEvents] = useState<ModerationEvent[]>([]);
  const [sponsorStats, setSponsorStats] = useState<AllwainSponsorStat[]>([]);
  const [trueqiaOffers, setTrueqiaOffers] = useState<Offer[]>([]);
  const [allwainOffers, setAllwainOffers] = useState<Offer[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [blockedUsers, setBlockedUsers] = useState<Record<string, boolean>>({});
  const [aiMode, setAiMode] = useState<"demo" | "real">("demo");
  const [aiConfig, setAiConfig] = useState<Record<string, boolean>>({
    contracts: true,
    moderation: true,
    leads: true,
  });
  const [scanProvider, setScanProvider] = useState<ScanProvider>("google");
  const [scanLimit, setScanLimit] = useState(120);
  const [scanUsed, setScanUsed] = useState(32);

  useEffect(() => {
    const savedToken = window.localStorage.getItem("admin-token");
    if (savedToken) {
      setToken(savedToken);
      hydrateFromToken(savedToken);
    }

    const savedBlocks = window.localStorage.getItem("admin-blocks");
    if (savedBlocks) {
      setBlockedUsers(JSON.parse(savedBlocks));
    }

    const savedAiConfig = window.localStorage.getItem("admin-ai-config");
    if (savedAiConfig) {
      const parsed = JSON.parse(savedAiConfig);
      setAiConfig(parsed.config || aiConfig);
      setAiMode(parsed.mode || "demo");
    }

    const savedScan = window.localStorage.getItem("admin-scan-config");
    if (savedScan) {
      const parsed = JSON.parse(savedScan);
      setScanProvider(parsed.provider || "google");
      setScanLimit(parsed.limit || 120);
      setScanUsed(parsed.used || 32);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!token) return;

    setLoadingData(true);
    setFetchError(null);

    Promise.all([
      fetchAdminUsers(token),
      fetchModerationEvents(token),
      fetchSponsorStats(token),
      fetchOffers("trueqia", token),
      fetchOffers("allwain", token),
      fetchTrades(token),
    ])
      .then(([usersRes, aiRes, sponsorsRes, trueqiaRes, allwainRes, tradesRes]) => {
        setUsers(usersRes.users || []);
        setAiEvents(aiRes.events || []);
        setSponsorStats(sponsorsRes.stats || []);
        setTrueqiaOffers(trueqiaRes.items || []);
        setAllwainOffers(allwainRes.items || []);
        setTrades(tradesRes.items || []);
      })
      .catch((err) => setFetchError(err.message))
      .finally(() => setLoadingData(false));
  }, [token]);

  async function hydrateFromToken(savedToken: string) {
    try {
      const profile = await fetchProfile(savedToken);
      if (profile.role !== "admin") {
        setError("El usuario debe tener rol admin");
        return;
      }
      setUser(profile);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFetchError(null);
    try {
      const res = await login(email, password);
      if (res.user.role !== "admin") {
        throw new Error("Solo admins pueden acceder al panel");
      }
      setToken(res.token);
      window.localStorage.setItem("admin-token", res.token);
      setUser(res.user);
    } catch (err: any) {
      setError(err.message);
    }
  }

  function toggleBlock(userId: string) {
    setBlockedUsers((prev) => {
      const updated = { ...prev, [userId]: !prev[userId] };
      window.localStorage.setItem("admin-blocks", JSON.stringify(updated));
      return updated;
    });
  }

  function saveAiConfig() {
    window.localStorage.setItem(
      "admin-ai-config",
      JSON.stringify({ config: aiConfig, mode: aiMode })
    );
  }

  function saveScanConfig() {
    window.localStorage.setItem(
      "admin-scan-config",
      JSON.stringify({ provider: scanProvider, limit: scanLimit, used: scanUsed })
    );
  }

  const contracts: ContractView[] = useMemo(() => {
    const offersIndex: Record<string, Offer> = {};
    [...trueqiaOffers, ...allwainOffers].forEach((offer) => {
      offersIndex[offer.id] = offer;
    });

    return trades.map((trade) => {
      const offer = offersIndex[trade.offerId];
      return {
        id: trade.id,
        title: offer?.title || "Contrato demo",
        app: offer?.owner || "unknown",
        status: trade.status,
        tokens: trade.tokens,
        createdAt: trade.createdAt,
        resolvedAt: trade.resolvedAt,
      };
    });
  }, [allwainOffers, trades, trueqiaOffers]);

  const totalTrueqiaTokens = useMemo(
    () => users.reduce((sum, u) => sum + (u.tokens || 0), 0),
    [users]
  );

  const totalAllwainEuros = useMemo(
    () => sponsorStats.reduce((sum, stat) => sum + (stat.commissionEarned || 0), 0),
    [sponsorStats]
  );

  if (!token || !user) {
    return (
      <div className="container" style={{ gridTemplateColumns: "1fr" }}>
        <div className="main-area">
          <header>
            <div>
              <div className="small">Admin panel</div>
              <h2>Acceso administradores</h2>
            </div>
            <div className="small">API base: {API_BASE_URL}</div>
          </header>
          <section className="content">
            <div className="card" style={{ maxWidth: 480, margin: "0 auto" }}>
              <h3>Inicia sesión</h3>
              <p className="small">
                Usa las credenciales semilla (admin@newmersive.local / admin123) o cualquier usuario con rol admin.
              </p>
              <form onSubmit={handleLogin} className="grid" style={{ gridTemplateColumns: "1fr" }}>
                <label>
                  <div className="small">Email</div>
                  <input
                    className="input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label>
                  <div className="small">Contraseña</div>
                  <input
                    className="input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                {error && <div className="small" style={{ color: "#f87171" }}>{error}</div>}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button className="primary" type="submit">
                    Entrar
                  </button>
                  <span className="small">Solo perfiles con rol admin</span>
                </div>
              </form>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <aside>
        <div className="badge">Newmersive Admin</div>
        <div style={{ marginTop: 12 }} className="small">
          {user.email}
        </div>
        <nav>
          <ul>
            {MODULES.map((mod) => (
              <li key={mod}>
                <button
                  className={selectedModule === mod ? "active" : ""}
                  onClick={() => setSelectedModule(mod)}
                >
                  {mod}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="main-area">
        <header>
          <div>
            <div className="small">Panel de control</div>
            <h2>{selectedModule}</h2>
          </div>
          <div className="small">Conectado a {API_BASE_URL}</div>
        </header>
        <section className="content">
          {loadingData && <div className="alert">Cargando datos del backend...</div>}
          {fetchError && <div className="alert error">{fetchError}</div>}
          {selectedModule === "Overview" && (
            <div className="grid">
              <div className="card">
                <h3>Usuarios</h3>
                <p className="small">{users.length} cuentas visibles</p>
                <div className="chip-row">
                  <span className="tag">Admins: {users.filter((u) => u.role === "admin").length}</span>
                  <span className="tag">Bloqueados: {Object.values(blockedUsers).filter(Boolean).length}</span>
                </div>
              </div>
              <div className="card">
                <h3>Patrocinadores</h3>
                <p className="small">Allwain: €{totalAllwainEuros.toFixed(2)}</p>
                <p className="small">TrueQIA tokens: {totalTrueqiaTokens}</p>
              </div>
              <div className="card">
                <h3>IA</h3>
                <p className="small">
                  Modo {aiMode === "demo" ? "Demo" : "Real"} · Módulos activos: {Object.values(aiConfig).filter(Boolean).length}
                </p>
                <div className="chip-row">
                  {AI_MODULES.filter((m) => aiConfig[m.key]).map((m) => (
                    <span key={m.key} className="badge">
                      {m.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="card">
                <h3>Escaneo</h3>
                <p className="small">Proveedor: {scanProvider}</p>
                <p className="small">
                  Uso simulado: {scanUsed}/{scanLimit} scans
                </p>
              </div>
            </div>
          )}

          {selectedModule === "Usuarios" && (
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3>Usuarios</h3>
                <div className="small">Se alimenta de /api/admin/users</div>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Email</th>
                    <th>Rol</th>
                    <th>Tokens</th>
                    <th>Patrocinador</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && !loadingData ? (
                    <tr>
                      <td colSpan={7} className="empty-state">
                        No hay usuarios cargados desde el backend.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.name}</td>
                        <td className="small">{u.email}</td>
                        <td>
                          <span className="badge">{u.role}</span>
                        </td>
                        <td>{u.tokens ?? 0}</td>
                        <td>{u.sponsorCode || "-"}</td>
                        <td>
                          {blockedUsers[u.id] ? (
                            <span className="status rejected">Bloqueado</span>
                          ) : (
                            <span className="status accepted">Activo</span>
                          )}
                        </td>
                        <td>
                          <button className="secondary" onClick={() => toggleBlock(u.id)}>
                            {blockedUsers[u.id] ? "Desbloquear" : "Bloquear"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <p className="small">El flag de bloqueo se simula en local para no modificar el backend demo.</p>
            </div>
          )}

          {selectedModule === "Patrocinadores" && (
            <div className="grid">
              <div className="card trueqia-card">
                <h3>TrueQIA</h3>
                <p className="small">Tokens acumulados por invitaciones: {totalTrueqiaTokens}</p>
                <p className="small">Fuente: saldo tokens de usuarios registrados.</p>
              </div>
              <div className="card allwain-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3>Allwain</h3>
                  <span className="small">/api/admin/allwain/sponsors</span>
                </div>
                <div className="allwain-surface">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Sponsor</th>
                        <th>Invitado</th>
                        <th>Ahorro €</th>
                        <th>Comisión €</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sponsorStats.length === 0 && !loadingData ? (
                        <tr>
                          <td colSpan={4} className="empty-state">
                            No hay datos de patrocinadores para mostrar.
                          </td>
                        </tr>
                      ) : (
                        sponsorStats.map((stat) => (
                          <tr key={stat.id}>
                            <td>{stat.sponsorName || stat.userId}</td>
                            <td>{stat.invitedName || stat.invitedUserId}</td>
                            <td>{stat.totalSavedByInvited.toFixed(2)}</td>
                            <td>{stat.commissionEarned.toFixed(2)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {selectedModule === "IA" && (
            <div className="grid">
              <div className="card">
                <div className="flex" style={{ justifyContent: "space-between" }}>
                  <h3>Modo</h3>
                  <span className="small">Demo/Real</span>
                </div>
                <div className="flex">
                  <button
                    className={aiMode === "demo" ? "primary" : "secondary"}
                    onClick={() => setAiMode("demo")}
                  >
                    Demo
                  </button>
                  <button
                    className={aiMode === "real" ? "primary" : "secondary"}
                    onClick={() => setAiMode("real")}
                  >
                    Real
                  </button>
                </div>
                <p className="small">Se guarda en localStorage para persistir la preferencia.</p>
              </div>

              <div className="card">
                <h3>Módulos activos</h3>
                <div className="module-grid">
                  {AI_MODULES.map((module) => (
                    <div key={module.key} className="module-card">
                      <header>
                        <h4>{module.label}</h4>
                        <input
                          type="checkbox"
                          checked={aiConfig[module.key]}
                          onChange={(e) =>
                            setAiConfig((prev) => ({ ...prev, [module.key]: e.target.checked }))
                          }
                        />
                      </header>
                      <p className="small">{module.description}</p>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12 }}>
                  <button className="primary" onClick={saveAiConfig}>
                    Guardar configuración
                  </button>
                  <span className="small" style={{ marginLeft: 12 }}>
                    Cambios solo locales (demo)
                  </span>
                </div>
              </div>

              <div className="card">
                <h3>Actividad de moderación (backend)</h3>
                <p className="small">Lectura en /api/admin/ai/activity</p>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Usuario</th>
                      <th>Severidad</th>
                      <th>Razón</th>
                      <th>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiEvents.length === 0 && !loadingData ? (
                      <tr>
                        <td colSpan={4} className="empty-state">
                          No hay eventos de moderación disponibles.
                        </td>
                      </tr>
                    ) : (
                      aiEvents.map((event) => (
                        <tr key={event.id}>
                          <td>{event.userEmail}</td>
                          <td>
                            <span className={`status ${event.severity === "low" ? "pending" : "rejected"}`}>
                              {event.severity}
                            </span>
                          </td>
                          <td>{event.reason}</td>
                          <td className="small">{new Date(event.createdAt).toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {selectedModule === "Escaneo" && (
            <div className="grid">
              <div className="card">
                <h3>Proveedor de escaneo</h3>
                <p className="small">Opciones: google / mock / internal</p>
                <select value={scanProvider} onChange={(e) => setScanProvider(e.target.value as ScanProvider)}>
                  {SCAN_PROVIDERS.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider}
                    </option>
                  ))}
                </select>
              </div>
              <div className="card">
                <h3>Límites simulados</h3>
                <label>
                  <div className="small">Límite mensual</div>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={scanLimit}
                    onChange={(e) => setScanLimit(Number(e.target.value))}
                  />
                </label>
                <label>
                  <div className="small">Uso actual</div>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={scanUsed}
                    onChange={(e) => setScanUsed(Number(e.target.value))}
                  />
                </label>
                <div style={{ marginTop: 12 }}>
                  <button className="primary" onClick={saveScanConfig}>
                    Guardar
                  </button>
                  <span className="small" style={{ marginLeft: 12 }}>
                    Persistencia local
                  </span>
                </div>
              </div>
            </div>
          )}

          {selectedModule === "Contratos" && (
            <ContractsSection contracts={contracts} loading={loadingData} />
          )}
        </section>
      </div>
    </div>
  );
}

function ContractsSection({ contracts, loading }: { contracts: ContractView[]; loading: boolean }) {
  const [appFilter, setAppFilter] = useState<"all" | "trueqia" | "allwain">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ContractView["status"]>("all");

  const filtered = contracts.filter((contract) => {
    const matchesApp = appFilter === "all" || contract.app === appFilter;
    const matchesStatus = statusFilter === "all" || contract.status === statusFilter;
    return matchesApp && matchesStatus;
  });

  return (
    <div className="card">
      <div className="flex" style={{ justifyContent: "space-between" }}>
        <h3>Contratos</h3>
        <div className="small">Trades desde /api/trueqia/trades</div>
      </div>
      <div className="flex" style={{ marginBottom: 12 }}>
        <label>
          <div className="small">App</div>
          <select value={appFilter} onChange={(e) => setAppFilter(e.target.value as any)}>
            <option value="all">Todas</option>
            <option value="trueqia">TrueQIA</option>
            <option value="allwain">Allwain</option>
          </select>
        </label>
        <label>
          <div className="small">Estado</div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
            <option value="all">Todos</option>
            <option value="pending">Pendiente</option>
            <option value="accepted">Aceptado</option>
            <option value="rejected">Rechazado</option>
            <option value="cancelled">Cancelado</option>
          </select>
        </label>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Título</th>
            <th>App</th>
            <th>Tokens</th>
            <th>Estado</th>
            <th>Creado</th>
            <th>Resuelto</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && !loading ? (
            <tr>
              <td colSpan={7} className="empty-state">
                No hay contratos que coincidan con los filtros seleccionados.
              </td>
            </tr>
          ) : (
            filtered.map((contract) => (
              <tr key={contract.id}>
                <td className="small">{contract.id}</td>
                <td>{contract.title}</td>
                <td>{contract.app}</td>
                <td>{contract.tokens}</td>
                <td>
                  <span className={`status ${contract.status}`}>{contract.status}</span>
                </td>
                <td className="small">{formatDate(contract.createdAt)}</td>
                <td className="small">{contract.resolvedAt ? formatDate(contract.resolvedAt) : "-"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <p className="small">La tabla combina ofertas TrueQIA/Allwain con trades para simular contratos.</p>
    </div>
  );
}

function formatDate(date: string) {
  return new Date(date).toLocaleString();
}

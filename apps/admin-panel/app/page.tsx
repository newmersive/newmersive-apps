"use client";

import { useEffect, useMemo, useState } from "react";
import {
  API_BASE_URL,
  AdminSummary,
  AuthUser,
  Lead,
  ModerationEvent,
  SponsorSummary,
  fetchAdminLeads,
  fetchAdminSummary,
  fetchModerationEvents,
  fetchProfile,
  fetchAllwainSponsorSummary,
  login,
} from "../lib/api";

const IA_PLACEHOLDER: ModerationEvent[] = [
  {
    id: "local-1",
    userEmail: "demo@newmersive.local",
    severity: "low",
    reason: "detección de abuso (simulada)",
    createdAt: new Date().toISOString(),
  },
  {
    id: "local-2",
    userEmail: "invited@example.com",
    severity: "medium",
    reason: "anomalía en patrón de compras",
    createdAt: new Date().toISOString(),
  },
];

export default function AdminPage() {
  const [email, setEmail] = useState("admin@newmersive.local");
  const [password, setPassword] = useState("admin123");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [aiEvents, setAiEvents] = useState<ModerationEvent[]>([]);
  const [allwainSummary, setAllwainSummary] = useState<SponsorSummary | null>(null);

  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    const savedToken = window.localStorage.getItem("admin-token");
    if (savedToken) {
      setToken(savedToken);
      hydrateFromToken(savedToken);
      loadData(savedToken);
    }
  }, []);

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
      loadData(res.token);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function loadData(authToken: string) {
    setLoading(true);
    setFetchError(null);

    try {
      const [summaryRes, leadsRes, aiRes, allwainRes] = await Promise.all([
        fetchAdminSummary(authToken),
        fetchAdminLeads(authToken),
        fetchModerationEvents(authToken).catch(() => ({ events: IA_PLACEHOLDER })),
        fetchAllwainSponsorSummary(authToken).catch(() => null),
      ]);

      setSummary(summaryRes);
      setLeads(leadsRes.items || []);
      setAiEvents(aiRes.events && aiRes.events.length > 0 ? aiRes.events : IA_PLACEHOLDER);
      setAllwainSummary(allwainRes);
    } catch (err: any) {
      setFetchError(err.message || "No se pudieron cargar los datos");
    } finally {
      setLoading(false);
    }
  }

  const leadCount = useMemo(() => summary?.leads ?? leads.length, [leads.length, summary]);
  const userCount = summary?.users ?? 0;
  const sponsorTotal = allwainSummary?.totalInvited ?? 0;

  if (!token || !user) {
    return (
      <div className="container" style={{ gridTemplateColumns: "1fr" }}>
        <div className="main-area">
          <header>
            <div>
              <div className="small">Admin panel</div>
              <h2>Acceso administradores</h2>
            </div>
            <div className="small">API base: {API_BASE_URL || "local"}</div>
          </header>
          <section className="content">
            <div className="card" style={{ maxWidth: 520, margin: "0 auto" }}>
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

  const iaList = aiEvents.length > 0 ? aiEvents : IA_PLACEHOLDER;

  return (
    <div className="container">
      <aside>
        <div className="badge">Newmersive Admin</div>
        <div style={{ marginTop: 12 }} className="small">
          {user.email}
        </div>
        <nav>
          <ul>
            <li><button className="active">Dashboard</button></li>
            <li><button className="active">Leads</button></li>
            <li><button className="active">IA y Supervisión</button></li>
            <li><button className="active">Sponsors</button></li>
          </ul>
        </nav>
      </aside>
      <div className="main-area">
        <header>
          <div>
            <div className="small">Panel de control</div>
            <h2>Resumen operativo</h2>
          </div>
          <div className="small">Conectado a {API_BASE_URL || "API local"}</div>
        </header>
        <section className="content">
          {loading && <div className="alert">Cargando datos del backend...</div>}
          {fetchError && <div className="alert error">{fetchError}</div>}

          <div className="grid">
            <div className="card">
              <h3>Usuarios</h3>
              <p className="big-number">{userCount || "—"}</p>
              <p className="small">Cuentas registradas (dato demo si no hay endpoint).</p>
            </div>
            <div className="card">
              <h3>Leads</h3>
              <p className="big-number">{leadCount}</p>
              <p className="small">Fuente: /api/admin/leads</p>
            </div>
            <div className="card">
              <h3>Patrocinadores</h3>
              <p className="big-number">{sponsorTotal}</p>
              <p className="small">Invitados registrados en Allwain (lectura)</p>
            </div>
            <div className="card">
              <h3>IA</h3>
              <p className="big-number">{iaList.length}</p>
              <p className="small">Eventos de moderación/abuso (demo)</p>
            </div>
          </div>

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3>Leads</h3>
              <span className="small">/api/admin/leads</span>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Contacto</th>
                  <th>Origen</th>
                  <th>Fecha</th>
                  <th>Mensaje</th>
                </tr>
              </thead>
              <tbody>
                {leads.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={5} className="empty-state">
                      No hay leads todavía. Se mostrarán los capturados por web o WhatsApp.
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => (
                    <tr key={lead.id}>
                      <td>{lead.name || "(sin nombre)"}</td>
                      <td className="small">{lead.phone || lead.email || "—"}</td>
                      <td>{lead.channel} / {lead.sourceApp}</td>
                      <td className="small">{formatDate(lead.createdAt)}</td>
                      <td className="small">{lead.message}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="grid">
            <div className="card">
              <h3>IA y Supervisión</h3>
              <p className="small">
                Vista preliminar de eventos de IA. En el futuro listará detección de abuso, anomalías de uso y patrones raros en trueques/compras.
              </p>
              <ul className="ia-list">
                {iaList.map((event) => (
                  <li key={event.id}>
                    <div className="small">{event.userEmail}</div>
                    <div className="status-chip">{event.severity}</div>
                    <div className="small">{event.reason}</div>
                    <div className="small">{formatDate(event.createdAt)}</div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card">
              <h3>Notas sobre IA</h3>
              <p className="small">
                El motor de contratos IA se ha dejado como stub. La generación de texto pasa por <code>services/ai/contracts.ai.service.ts</code> y se invoca desde <code>/trueqia/contracts/preview</code>.
              </p>
              <p className="small">
                No hay integración con proveedores externos todavía. Esta capa permite sustituir la lógica por un modelo real sin tocar las rutas.
              </p>
            </div>
          </div>

          <div className="grid">
            <div className="card trueqia-card">
              <h3>Sponsors / Recompensas</h3>
              <p className="small">Datos de lectura para revisar invitaciones y recompensas.</p>
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <div>
                  <div className="muted">Allwain</div>
                  <p className="big-number">{allwainSummary?.totalInvited ?? 0}</p>
                  <p className="small">Invitados</p>
                  <p className="small">Comisiones € {allwainSummary?.totalCommission?.toFixed(2) ?? "0.00"}</p>
                </div>
                <div>
                  <div className="muted">TrueQIA</div>
                  <p className="big-number">—</p>
                  <p className="small">Tokens acumulados (placeholder)</p>
                </div>
              </div>
              <p className="small">Fuentes: /api/allwain/sponsors/summary y, cuando exista, /api/trueqia/sponsors/summary.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function formatDate(date: string) {
  return new Date(date).toLocaleString();
}

(function () {
  "use strict";

  const apiBase = "https://api.allwain.es/api";
  const programId = "allwain-app-pilot-v1";
  const academy = window.AllwainTesterAcademy;
  if (!academy) throw new Error("TESTER_ACADEMY_DATA_MISSING");
  const stepIds = academy.stepIds;
  const routeOrders = academy.routeOrders;
  const roleLabels = {
    buyer: "comprador",
    seller: "vendedor",
    connector: "Conector",
    observer: "observador"
  };
  const incidentScreenByStep = {
    access: "app_access",
    profile: "app_profile",
    capture: "app_capture",
    buy: "app_buy",
    compare: "app_compare",
    sell: "app_sell",
    connector: "app_connector",
    notifications: "app_notifications",
    delivery: "app_delivery",
    assistant: "app_assistant",
    accessibility: "app_accessibility",
    support: "app_support"
  };

  const one = (selector, root = document) => root.querySelector(selector);
  const many = (selector, root = document) => [...root.querySelectorAll(selector)];
  const tr = (source, replacements = {}) => {
    const translated = window.AllwainI18n?.translate?.(source, replacements) || source;
    return Object.entries(replacements).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), translated);
  };

  let identity = null;
  let testerState = null;
  let busy = false;
  let pendingIncidentReference = null;
  let gateState = { mode: "login", message: "" };
  let completedSteps = new Set();
  let missionState = new Set();
  const pendingMissionKeys = new Set();
  let currentRole = "observer";
  let googleAccess = null;

  function setText(element, source, replacements = {}) {
    if (element) element.textContent = tr(source, replacements);
  }

  function setStatus(element, source, state = "", replacements = {}) {
    setText(element, source, replacements);
    if (!element) return;
    if (state) element.dataset.state = state;
    else delete element.dataset.state;
  }

  function reference(prefix) {
    return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }

  function firstName(user) {
    const value = String(user?.name || "").trim().split(/\s+/)[0];
    return value ? value.slice(0, 32) : tr("tester");
  }

  function activeLocale() {
    return window.AllwainI18n?.locale || document.documentElement.lang || "es";
  }

  function webReleaseValue() {
    return String(one('meta[name="allwain-release"]')?.content || "").trim().slice(0, 80) || null;
  }

  function academyLabels() {
    return academy.labels(activeLocale());
  }

  function academyLabel(key, replacements = {}) {
    const source = academyLabels()[key] || key;
    return Object.entries(replacements).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), source);
  }

  function createElement(tagName, className = "", text = "") {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function missionKey(stepId, actionIndex) {
    return `${stepId}:${actionIndex}`;
  }

  function validMissionKeys() {
    return new Set(academy.routes("es").flatMap((route) => route.actions.map((_action, index) => missionKey(route.id, index))));
  }

  function missionStorageKey() {
    const userId = String(identity?.user?.id || "active-session").replace(/[^a-z0-9_-]/gi, "").slice(0, 96) || "active-session";
    return `allwain.tester.missions.v2.${programId}.${userId}`;
  }

  function loadMissionState(state = testerState) {
    const allowed = validMissionKeys();
    const items = Array.isArray(state?.progress?.items) ? state.progress.items : [];
    const serverSupportsActions = items.some((item) => Array.isArray(item?.actions));
    if (serverSupportsActions) {
      missionState = new Set(items.flatMap((item) => (
        Array.isArray(item?.actions)
          ? item.actions
            .filter((action) => action?.status === "completed")
            .map((action) => `${item.stepId}:${action.actionId === "a2" ? 1 : 0}`)
          : []
      )).filter((key) => allowed.has(key)));
      saveMissionState();
      return;
    }
    try {
      const stored = JSON.parse(window.localStorage.getItem(missionStorageKey()) || "[]");
      missionState = new Set(Array.isArray(stored) ? stored.filter((key) => allowed.has(key)) : []);
    } catch (_error) {
      missionState = new Set();
    }
  }

  function saveMissionState() {
    try {
      window.localStorage.setItem(missionStorageKey(), JSON.stringify([...missionState].sort()));
    } catch (_error) {
      // Route-level progress remains safely stored by the backend.
    }
  }

  function synchronizeCompletedMissions() {
    academy.routes("es").forEach((route) => {
      if (!completedSteps.has(route.id)) return;
      route.actions.forEach((_action, index) => missionState.add(missionKey(route.id, index)));
    });
    saveMissionState();
  }

  function routeState(route) {
    const done = route.actions.reduce((total, _action, index) => total + (missionState.has(missionKey(route.id, index)) ? 1 : 0), 0);
    const complete = completedSteps.has(route.id);
    return {
      done,
      total: route.actions.length,
      complete,
      ready: !complete && done === route.actions.length,
      underway: !complete && done > 0 && done < route.actions.length
    };
  }

  function updateActionProgress() {
    const routes = academy.routes(activeLocale());
    const total = routes.reduce((sum, route) => sum + route.actions.length, 0);
    const done = routes.reduce((sum, route) => sum + route.actions.reduce((count, _action, index) => (
      count + (missionState.has(missionKey(route.id, index)) ? 1 : 0)
    ), 0), 0);
    setText(one("#tester-action-progress-output"), "{done} / {total}", { done, total });
    const bar = one("#tester-action-progress-bar");
    if (bar) bar.style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
    const track = bar?.parentElement;
    if (track) {
      track.setAttribute("aria-valuemax", String(total));
      track.setAttribute("aria-valuenow", String(done));
    }
  }

  function updateRouteCard(route) {
    const card = one(`[data-step-card="${route.id}"]`);
    if (!card) return;
    const state = routeState(route);
    const statusKey = state.complete ? "complete" : state.ready ? "ready" : state.underway ? "underway" : "pending";
    card.dataset.routeState = statusKey;
    setText(one("[data-route-status]", card), academyLabel(statusKey));
    setText(one("[data-route-action-count]", card), academyLabel("checked", { done: state.done, total: state.total }));
    many("[data-route-action]", card).forEach((input, index) => {
      const key = missionKey(route.id, index);
      input.checked = missionState.has(missionKey(route.id, index));
      input.disabled = state.complete || pendingMissionKeys.has(key);
      input.setAttribute("aria-busy", pendingMissionKeys.has(key) ? "true" : "false");
    });
    const confirm = one("[data-app-test-step]", card);
    if (confirm) {
      const routeIsSaving = route.actions.some((_action, index) => pendingMissionKeys.has(missionKey(route.id, index)));
      confirm.setAttribute("aria-pressed", state.complete ? "true" : "false");
      confirm.disabled = state.complete || !state.ready || routeIsSaving || busy;
      confirm.textContent = state.complete ? academyLabel("marked") : academyLabel("mark");
      confirm.title = !state.complete && !state.ready ? academyLabel("completeFirst") : "";
    }
  }

  async function toggleMission(route, actionIndex, checked) {
    const key = missionKey(route.id, actionIndex);
    if (!identity?.token || pendingMissionKeys.has(key) || completedSteps.has(route.id)) {
      updateRouteCard(route);
      return;
    }
    if (checked) missionState.add(key);
    else missionState.delete(key);
    saveMissionState();
    pendingMissionKeys.add(key);
    updateRouteCard(route);
    updateActionProgress();
    track("tester_app_action_toggled", {
      step: route.id,
      action: actionIndex + 1,
      completed: checked,
      platform: platformValue()
    });
    setStatus(one("#tester-progress-status"), academyLabel("savingAction"));
    try {
      const { response, payload } = await api(`/allwain/tester/progress/${route.id}/actions/a${actionIndex + 1}`, {
        method: "PATCH",
        body: {
          status: checked ? "completed" : "pending",
          platform: platformValue(),
          appVersion: appVersionValue() || null,
          clientReference: reference("app-action")
        }
      });
      if (response.status === 401) return;
      if (response.status === 403) {
        showGate("survey");
        return;
      }
      if (!response.ok) throw new Error(payload?.error || "ACTION_PROGRESS_FAILED");
      setStatus(one("#tester-progress-status"), academyLabel("actionSaved"), "success");
      track("tester_app_action_saved", {
        step: route.id,
        action: actionIndex + 1,
        completed: checked,
        platform: platformValue()
      });
    } catch (_error) {
      if (checked) missionState.delete(key);
      else missionState.add(key);
      saveMissionState();
      setStatus(one("#tester-progress-status"), academyLabel("actionSaveError"), "error");
    } finally {
      pendingMissionKeys.delete(key);
      updateRouteCard(route);
      updateActionProgress();
    }
  }

  function selectIncidentRoute(route) {
    const select = one("#tester-incident-step");
    if (select) select.value = route.id;
    const screen = one("#tester-incident-screen");
    if (screen && incidentScreenByStep[route.id]) screen.value = incidentScreenByStep[route.id];
    setStatus(one("#tester-incident-status"), academyLabel("routeSelected", { route: route.title }));
    one("#tester-report-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => one("#tester-incident-description")?.focus({ preventScroll: true }), 450);
    track("tester_incident_route_selected", { step: route.id });
  }

  function buildRouteCard(route, index) {
    const card = createElement("li", "tester-route-card");
    card.dataset.stepCard = route.id;

    const heading = createElement("header", "tester-route-head");
    heading.append(createElement("span", "tester-route-number", String(index + 1).padStart(2, "0")));
    const headingCopy = createElement("div", "tester-route-heading-copy");
    const status = createElement("span", "tester-route-status");
    status.dataset.routeStatus = "";
    const title = createElement("h3", "tester-route-title", route.title);
    title.id = `tester-route-${route.id}`;
    headingCopy.append(status, title, createElement("p", "tester-route-summary", route.summary));
    heading.append(headingCopy);
    card.setAttribute("aria-labelledby", title.id);

    const missionPanel = createElement("fieldset", "tester-route-missions");
    missionPanel.append(createElement("legend", "tester-route-label", academyLabel("checks")));
    route.actions.forEach((action, actionIndex) => {
      const label = createElement("label", "tester-route-action");
      const input = createElement("input");
      input.type = "checkbox";
      input.dataset.routeAction = "";
      input.checked = missionState.has(missionKey(route.id, actionIndex));
      input.addEventListener("change", () => void toggleMission(route, actionIndex, input.checked));
      const marker = createElement("span", "tester-route-action-marker", String(actionIndex + 1).padStart(2, "0"));
      marker.setAttribute("aria-hidden", "true");
      label.append(input, marker, createElement("span", "tester-route-action-copy", action));
      missionPanel.append(label);
    });
    const actionCount = createElement("p", "tester-route-action-count");
    actionCount.dataset.routeActionCount = "";
    actionCount.id = `tester-route-count-${route.id}`;
    missionPanel.append(actionCount);

    const expected = createElement("div", "tester-route-expected");
    expected.append(createElement("span", "tester-route-label", academyLabel("expected")), createElement("p", "", route.result));

    const links = createElement("div", "tester-step-links");
    const installedApp = createElement("details", "tester-native-options");
    installedApp.append(createElement("summary", "", tr("App instalada")));
    route.links.forEach((destination) => {
      const link = createElement("a", "", destination.text);
      link.href = destination.href;
      if (destination.web) {
        link.target = "_blank";
        link.rel = "noopener";
      }
      link.addEventListener("click", () => track("tester_app_link_opened", { destination: destination.href, step: route.id }));
      if (destination.web) links.append(link);
      else installedApp.append(link);
    });
    if (installedApp.childElementCount > 1) links.append(installedApp);

    const actions = createElement("footer", "tester-route-footer");
    const report = createElement("button", "tester-route-report", academyLabel("report"));
    report.type = "button";
    report.addEventListener("click", () => selectIncidentRoute(route));
    const confirm = createElement("button", "tester-route-confirm", academyLabel("mark"));
    confirm.type = "button";
    confirm.dataset.appTestStep = route.id;
    confirm.setAttribute("aria-pressed", "false");
    confirm.setAttribute("aria-describedby", actionCount.id);
    confirm.addEventListener("click", () => void markStep(confirm));
    actions.append(report, confirm);

    card.append(heading, missionPanel, expected, links, actions);
    updateRouteCard(route);
    return card;
  }

  function renderIncidentRoutes(routes) {
    const select = one("#tester-incident-step");
    if (!select) return;
    const selected = select.value;
    const empty = createElement("option", "", academyLabel("noRoute"));
    empty.value = "";
    const options = routes.map((route, index) => {
      const option = createElement("option", "", `${String(index + 1).padStart(2, "0")} · ${route.title}`);
      option.value = route.id;
      return option;
    });
    select.replaceChildren(empty, ...options);
    if (stepIds.includes(selected)) select.value = selected;
  }

  function renderRoutes() {
    const list = one(".tester-step-list");
    if (!list) return;
    const routeMap = new Map(academy.routes(activeLocale()).map((route) => [route.id, route]));
    const order = routeOrders[currentRole] || routeOrders.observer;
    const routes = order.map((id) => routeMap.get(id)).filter(Boolean);
    list.replaceChildren(...routes.map(buildRouteCard));
    routes.forEach(updateRouteCard);
    renderIncidentRoutes(routes);
    setText(one("#tester-mission-storage-note"), academyLabel("localNote"));
    updateActionProgress();
  }

  function track(name, parameters = {}) {
    window.AllwainAnalytics?.track?.(name, {
      program: programId,
      release: webReleaseValue(),
      locale: activeLocale(),
      ...parameters
    });
  }

  async function api(path, options = {}) {
    const headers = { Accept: "application/json", ...(options.headers || {}) };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (identity?.token) headers.Authorization = `Bearer ${identity.token}`;
    const response = await fetch(`${apiBase}${path}`, {
      method: options.method || "GET",
      mode: "cors",
      credentials: "include",
      cache: "no-store",
      referrerPolicy: "strict-origin-when-cross-origin",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const payload = await response.json().catch(() => null);
    if (response.status === 401) {
      identity = null;
      testerState = null;
      completedSteps = new Set();
      missionState = new Set();
      pendingMissionKeys.clear();
      renderIdentity();
      showGate("login", "La sesión ha caducado. Identifícate de nuevo para continuar.");
    }
    return { response, payload };
  }

  function renderIdentity() {
    const account = one("#tester-account");
    const name = identity ? firstName(identity.user) : "";
    if (account) {
      account.dataset.authenticated = identity ? "true" : "false";
      setText(account, identity ? "Hola, {name}" : "Identificarme", { name });
      account.setAttribute("aria-label", identity ? tr("Sesión activa de {name}", { name }) : tr("Identificarme"));
    }
    setText(one("#tester-session-name"), identity ? "Sesión activa: {name}" : "Sesión no iniciada", { name });
  }

  function showGate(mode, message) {
    gateState = { mode, message: message || "" };
    const gate = one("#tester-gate");
    const room = one("#tester-room");
    if (gate) gate.hidden = false;
    if (room) room.hidden = true;
    const login = one("#tester-login");
    if (login) login.hidden = mode === "survey";
    setText(one("#tester-gate-status"), mode === "survey" ? "ENCUESTA PENDIENTE" : mode === "error" ? "NO SE PUDO COMPROBAR" : "ACCESO PROTEGIDO");
    setText(one("#tester-gate-title"), mode === "survey" ? "Primero completa la encuesta." : mode === "error" ? "No hemos podido abrir la sala." : "Identifícate para recuperar tu sala.");
    setText(one("#tester-gate-copy"), message || (mode === "survey"
      ? "La encuesta es la antesala de esta academia. Después de enviarla con tu cuenta, volverás aquí automáticamente."
      : "Usa la misma cuenta con la que respondiste la encuesta."));
  }

  function personalizeRoute(role) {
    currentRole = routeOrders[role] ? role : "observer";
    const copy = currentRole === "observer"
      ? academyLabel("routeGeneral")
      : academyLabel("routePersonalized", { role: tr(roleLabels[currentRole]) });
    setText(one("#tester-route-personalization"), copy);
    renderRoutes();
  }

  function renderProgress(state = testerState) {
    const items = Array.isArray(state?.progress?.items) ? state.progress.items : [];
    completedSteps = new Set(items
      .filter((item) => item?.status === "completed" && stepIds.includes(item.stepId))
      .map((item) => item.stepId));
    synchronizeCompletedMissions();
    const count = completedSteps.size;
    const total = stepIds.length;
    setText(one("#tester-progress-output"), "{count} / {total}", { count, total });
    const bar = one("#tester-progress-bar");
    if (bar) bar.style.width = `${total ? Math.round((count / total) * 100) : 0}%`;
    const track = bar?.parentElement;
    if (track) {
      track.setAttribute("aria-valuemax", String(total));
      track.setAttribute("aria-valuenow", String(count));
    }
    setText(one("#tester-progress-status"), count === total ? academyLabel("allCompleted") : academyLabel("progressHelp"));
    personalizeRoute(state?.profile?.preferredRole || "observer");
  }

  function showRoom(state) {
    testerState = state;
    one("#tester-gate").hidden = true;
    one("#tester-room").hidden = false;
    renderIdentity();
    loadMissionState(state);
    renderProgress(state);
    track("tester_academy_opened", { preferred_role: state?.profile?.preferredRole || "observer" });
  }

  async function loadState() {
    if (!identity?.token) {
      showGate("login");
      return;
    }
    setText(one("#tester-gate-status"), "COMPROBANDO ACCESO");
    const { response, payload } = await api("/allwain/tester/state");
    if (response.status === 401) return;
    if (response.status === 403 || (response.ok && payload?.qualified === false)) {
      showGate("survey");
      return;
    }
    if (!response.ok || payload?.qualified !== true) {
      showGate("error", "Inténtalo de nuevo en unos minutos o vuelve a la encuesta. No se ha perdido ningún dato.");
      return;
    }
    showRoom(payload);
    await loadRecentIncidents();
  }

  async function refreshIdentity() {
    const response = await fetch(`${apiBase}/auth/refresh`, {
      method: "POST",
      mode: "cors",
      credentials: "include",
      cache: "no-store",
      referrerPolicy: "strict-origin-when-cross-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ sourceApp: "allwain" })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || typeof payload?.token !== "string") return null;
    identity = { token: payload.token, user: payload.user };
    await window.AllwainI18n?.acceptIdentity?.(payload.user, payload.token);
    renderIdentity();
    return identity;
  }

  function openLogin() {
    const dialog = one("#tester-login-dialog");
    if (typeof dialog?.showModal === "function") dialog.showModal();
    else dialog?.setAttribute("open", "");
    googleAccess?.prepare();
    window.setTimeout(() => (one("#tester-google-auth input") || one("#tester-login-email"))?.focus(), 0);
  }

  function closeLogin() {
    googleAccess?.cancel();
    const dialog = one("#tester-login-dialog");
    if (typeof dialog?.close === "function") dialog.close();
    else dialog?.removeAttribute("open");
  }

  function platformValue() {
    return one("#tester-platform")?.value || "unknown";
  }

  function appVersionValue() {
    return String(one("#tester-app-version")?.value || "").trim().slice(0, 80);
  }

  async function markStep(button) {
    if (busy || !identity?.token) return;
    const stepId = button.dataset.appTestStep;
    if (!stepIds.includes(stepId)) return;
    busy = true;
    button.disabled = true;
    setText(button, academyLabel("saving"));
    setStatus(one("#tester-progress-status"), "Guardando tu confirmación…");
    try {
      const { response, payload } = await api(`/allwain/tester/progress/${stepId}`, {
        method: "PATCH",
        body: {
          status: "completed",
          platform: platformValue(),
          appVersion: appVersionValue() || null,
          clientReference: reference("app-step")
        }
      });
      if (response.status === 401) return;
      if (response.status === 403) {
        showGate("survey");
        return;
      }
      if (!response.ok) throw new Error(payload?.error || "PROGRESS_FAILED");
      const stateResult = await api("/allwain/tester/state");
      if (!stateResult.response.ok || stateResult.payload?.qualified !== true) {
        throw new Error(stateResult.payload?.error || "STATE_REFRESH_FAILED");
      }
      testerState = stateResult.payload;
      // Re-enable any other route that was already ready before repainting.
      busy = false;
      renderProgress(testerState);
      track("tester_app_step_confirmed", { step: stepId, platform: platformValue() });
    } catch (_error) {
      button.disabled = false;
      setText(button, academyLabel("retry"));
      setStatus(one("#tester-progress-status"), academyLabel("saveError"), "error");
    } finally {
      busy = false;
    }
  }

  function containsPrivateData(value) {
    const text = String(value || "");
    return /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text)
      || /\b(?:\d{8}[a-z]|[xyz]\d{7}[a-z])\b/i.test(text)
      || /\b(?:calle|avenida|avda\.?|plaza|paseo|camino|carretera|street|road|avenue|rue|via)\s+[^,\n]{1,50}\d/iu.test(text)
      || /(?:\+?34[\s.-]?)?(?:\d[\s.-]?){9}\b/.test(text);
  }

  async function loadRecentIncidents() {
    if (!identity?.token) return;
    const { response, payload } = await api("/allwain/tester/incidents?limit=5");
    if (!response.ok) return;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const region = one("#tester-recent");
    const list = one("#tester-recent-list");
    if (!region || !list || !items.length) {
      if (region) region.hidden = true;
      return;
    }
    list.replaceChildren(...items.map((incident) => {
      const item = document.createElement("li");
      const date = incident.createdAt
        ? new Intl.DateTimeFormat(activeLocale(), { day: "2-digit", month: "short" }).format(new Date(incident.createdAt))
        : "";
      item.textContent = `${incident.subject || tr("Incidencia de la app")} · ${incident.status || tr("recibida")}${date ? ` · ${date}` : ""}`;
      return item;
    }));
    region.hidden = false;
  }

  async function submitIncident(event) {
    event.preventDefault();
    if (busy || !identity?.token) return;
    const description = String(one("#tester-incident-description")?.value || "").trim();
    const steps = String(one("#tester-incident-steps")?.value || "").trim();
    const status = one("#tester-incident-status");
    if (description.length < 10) {
      setStatus(status, "Añade al menos diez caracteres para que podamos entender la incidencia.", "error");
      return;
    }
    if (containsPrivateData(`${description}\n${steps}`)) {
      setStatus(status, "Quita emails, teléfonos, direcciones o documentos antes de enviar.", "error");
      return;
    }
    busy = true;
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    submit.disabled = true;
    setStatus(status, "Enviando la incidencia de forma segura…");
    const stepId = one("#tester-incident-step")?.value || null;
    try {
      const { response, payload } = await api("/allwain/tester/incidents", {
        method: "POST",
        body: {
          target: "app",
          category: one("#tester-incident-category")?.value || "other",
          severity: one("#tester-incident-severity")?.value || "normal",
          subject: tr("Incidencia en la app de prueba"),
          description,
          steps: steps || null,
          screen: one("#tester-incident-screen")?.value || "app_other",
          stepId,
          platform: platformValue(),
          appVersion: appVersionValue() || null,
          release: webReleaseValue(),
          locale: activeLocale(),
          clientReference: pendingIncidentReference || (pendingIncidentReference = reference("app-incident"))
        }
      });
      if (response.status === 401) return;
      if (!response.ok) throw new Error(payload?.error || "INCIDENT_FAILED");
      pendingIncidentReference = null;
      one("#tester-incident-description").value = "";
      one("#tester-incident-steps").value = "";
      setStatus(status, "Incidencia enviada. Ya está disponible para el equipo de soporte.", "success");
      track("tester_app_incident_submitted", { category: payload?.incident?.category || "unknown", platform: platformValue() });
      await loadRecentIncidents();
    } catch (_error) {
      setStatus(status, "No hemos podido enviar la incidencia. Revisa los campos e inténtalo de nuevo.", "error");
    } finally {
      busy = false;
      submit.disabled = false;
    }
  }

  many('.tester-safe-mode a').forEach((link) => link.addEventListener("click", () => {
    track("tester_app_link_opened", { destination: link.getAttribute("href") || "unknown" });
  }));
  one("#tester-incident-form")?.addEventListener("submit", submitIncident);
  one("#tester-incident-form")?.addEventListener("input", () => {
    if (!busy) pendingIncidentReference = null;
  });
  one("#tester-login")?.addEventListener("click", openLogin);
  one("#tester-account")?.addEventListener("click", () => identity ? one("#tester-session-name")?.scrollIntoView({ behavior: "smooth", block: "center" }) : openLogin());
  one("#tester-login-close")?.addEventListener("click", closeLogin);
  one("#tester-login-dialog")?.addEventListener("cancel", closeLogin);
  googleAccess = window.AllwainGoogleAuth?.mount(one("#tester-google-auth"), {
    canStart: () => !busy,
    onBusy(value) {
      busy = value;
      const submit = one('#tester-login-form button[type="submit"]');
      if (submit) submit.disabled = value;
    },
    async onIdentity(nextIdentity) {
      identity = nextIdentity;
      await window.AllwainI18n?.acceptIdentity?.(identity.user, identity.token);
      one("#tester-login-password").value = "";
      renderIdentity();
      closeLogin();
      track("tester_google_login_completed");
      try {
        await loadState();
      } catch (_error) {
        showGate("error", "Tu identidad está confirmada, pero no hemos podido abrir la sala. Inténtalo de nuevo en unos minutos.");
      }
    }
  });
  one("#tester-login-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    submit.disabled = true;
    setStatus(one("#tester-login-status"), "Comprobando tu identidad…");
    try {
      const response = await fetch(`${apiBase}/auth/login`, {
        method: "POST",
        mode: "cors",
        credentials: "include",
        cache: "no-store",
        referrerPolicy: "strict-origin-when-cross-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          email: String(one("#tester-login-email")?.value || "").trim().toLowerCase(),
          password: one("#tester-login-password")?.value || "",
          sourceApp: "allwain",
          locale: activeLocale()
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || typeof payload?.token !== "string") {
        throw new Error(payload?.error || "LOGIN_FAILED");
      }
      identity = { token: payload.token, user: payload.user };
      await window.AllwainI18n?.acceptIdentity?.(payload.user, payload.token);
      one("#tester-login-password").value = "";
      setStatus(one("#tester-login-status"), "Identidad confirmada.", "success");
      renderIdentity();
      closeLogin();
      try {
        await loadState();
      } catch (_stateError) {
        showGate("error", "Tu identidad está confirmada, pero no hemos podido abrir la sala. Inténtalo de nuevo en unos minutos.");
      }
    } catch (_error) {
      setStatus(one("#tester-login-status"), "Email o contraseña incorrectos, o acceso temporalmente no disponible.", "error");
    } finally {
      busy = false;
      submit.disabled = false;
    }
  });
  one("#tester-logout")?.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    try {
      if (identity?.token) {
        const { response } = await api("/auth/logout", { method: "POST", body: { sourceApp: "allwain" } });
        if (!response.ok && response.status !== 401) throw new Error("LOGOUT_FAILED");
      }
      identity = null;
      testerState = null;
      completedSteps = new Set();
      missionState = new Set();
      pendingMissionKeys.clear();
      renderIdentity();
      showGate("login");
    } catch (_error) {
      setStatus(one("#tester-progress-status"), "No hemos podido cerrar la sesión. Inténtalo de nuevo.", "error");
    } finally {
      busy = false;
    }
  });
  one("#tester-platform")?.addEventListener("change", () => track("tester_platform_selected", { platform: platformValue() }));
  window.addEventListener("allwain:localechange", () => {
    renderIdentity();
    if (testerState) renderProgress(testerState);
    else showGate(gateState.mode, gateState.message);
  });

  const userAgent = navigator.userAgent || "";
  const platform = /android/i.test(userAgent) ? "android" : /iphone|ipad|ipod/i.test(userAgent) ? "ios" : "web";
  if (one("#tester-platform")) one("#tester-platform").value = platform;
  renderIdentity();
  showGate("login", "Estamos comprobando de forma segura si ya completaste la antesala.");
  window.setTimeout(async () => {
    try {
      await refreshIdentity();
      await loadState();
    } catch (_error) {
      showGate("error", "Inténtalo de nuevo en unos minutos. No se ha perdido ningún progreso.");
    }
  }, 0);
})();

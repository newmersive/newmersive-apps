(function () {
  "use strict";

  // This is the public OAuth client already used by the deployed allwain app.
  // Google validates the registered redirect; the API verifies the ID token.
  const clientId = "20121163354-d7014u32hlq2u5h30q6ul7g5vfa17heh.apps.googleusercontent.com";
  const apiBase = "https://api.allwain.es/api";
  const productionOrigin = "https://allwain.es";
  const instances = new Set();
  const copy = {
    es: {
      button: "Continuar con Google", consent: "Tengo al menos 18 años y acepto las", terms: "Condiciones", and: "y la", privacy: "Privacidad", explanation: "Google confirma tu identidad. Usaremos la misma cuenta para la encuesta, el aula y la app.", separator: "o con tu email", consentNeeded: "Confirma la edad y las condiciones para continuar con Google.", waiting: "Completa el acceso en Google. Si se abre otra pestaña, vuelve aquí al terminar.", verifying: "Confirmando tu identidad…", success: "Identidad confirmada.", cancelled: "Acceso cancelado. Puedes volver a intentarlo cuando quieras.", cancel: "Cancelar acceso", blocked: "El navegador no ha abierto Google. Permite la ventana e inténtalo de nuevo, o entra con tu email.", unavailable: "No hemos podido completar el acceso con Google. Inténtalo de nuevo o usa tu email.", timeout: "El acceso ha caducado. Pulsa Google de nuevo para continuar.", rejected: "No hemos podido validar este acceso. Vuelve a intentarlo desde esta página.", rate: "Demasiados intentos. Espera unos minutos antes de volver a entrar.", development: "El acceso con Google está disponible en allwain.es. En esta vista puedes probar el resto del formulario.", emailVerified: "Elige una cuenta con el email verificado en Google."
    },
    en: {
      button: "Continue with Google", consent: "I am at least 18 and accept the", terms: "Terms", and: "and", privacy: "Privacy policy", explanation: "Google confirms your identity. The survey, classroom and app will use the same account.", separator: "or with your email", consentNeeded: "Confirm your age and accept the terms to continue with Google.", waiting: "Complete sign-in with Google. If another tab opens, return here when you finish.", verifying: "Confirming your identity…", success: "Identity confirmed.", cancelled: "Sign-in cancelled. You can try again whenever you like.", cancel: "Cancel sign-in", blocked: "Your browser could not open Google. Allow the window and try again, or use your email.", unavailable: "We could not complete Google sign-in. Try again or use your email.", timeout: "Sign-in expired. Press Google again to continue.", rejected: "We could not validate this sign-in. Please try again from this page.", rate: "Too many attempts. Wait a few minutes before trying again.", development: "Google sign-in is available at allwain.es. You can try the rest of the form in this preview.", emailVerified: "Choose an account with an email verified by Google."
    },
    fr: {
      button: "Continuer avec Google", consent: "J’ai au moins 18 ans et j’accepte les", terms: "Conditions", and: "et la", privacy: "Politique de confidentialité", explanation: "Google confirme votre identité. Le questionnaire, l’espace de test et l’app utiliseront le même compte.", separator: "ou avec votre email", consentNeeded: "Confirmez votre âge et acceptez les conditions pour continuer avec Google.", waiting: "Terminez la connexion avec Google. Si un autre onglet s’ouvre, revenez ici ensuite.", verifying: "Confirmation de votre identité…", success: "Identité confirmée.", cancelled: "Connexion annulée. Vous pourrez réessayer quand vous le souhaitez.", cancel: "Annuler la connexion", blocked: "Le navigateur n’a pas ouvert Google. Autorisez la fenêtre et réessayez, ou utilisez votre email.", unavailable: "La connexion avec Google n’a pas abouti. Réessayez ou utilisez votre email.", timeout: "La connexion a expiré. Appuyez à nouveau sur Google pour continuer.", rejected: "Cette connexion n’a pas pu être validée. Réessayez depuis cette page.", rate: "Trop de tentatives. Attendez quelques minutes avant de réessayer.", development: "La connexion avec Google est disponible sur allwain.es. Vous pouvez essayer le reste du formulaire ici.", emailVerified: "Choisissez un compte avec une adresse email vérifiée par Google."
    },
    it: {
      button: "Continua con Google", consent: "Ho almeno 18 anni e accetto le", terms: "Condizioni", and: "e l’", privacy: "Informativa sulla privacy", explanation: "Google conferma la tua identità. Il questionario, l’aula e l’app useranno lo stesso account.", separator: "oppure con la tua email", consentNeeded: "Conferma l’età e accetta le condizioni per continuare con Google.", waiting: "Completa l’accesso con Google. Se si apre un’altra scheda, torna qui quando hai finito.", verifying: "Conferma della tua identità…", success: "Identità confermata.", cancelled: "Accesso annullato. Puoi riprovare quando vuoi.", cancel: "Annulla l’accesso", blocked: "Il browser non ha aperto Google. Consenti la finestra e riprova, oppure usa la tua email.", unavailable: "Non è stato possibile completare l’accesso con Google. Riprova o usa la tua email.", timeout: "L’accesso è scaduto. Premi di nuovo Google per continuare.", rejected: "Non è stato possibile convalidare questo accesso. Riprova da questa pagina.", rate: "Troppi tentativi. Attendi qualche minuto prima di riprovare.", development: "L’accesso con Google è disponibile su allwain.es. Qui puoi provare il resto del modulo.", emailVerified: "Scegli un account con un’email verificata da Google."
    },
    zh: {
      button: "使用 Google 继续", consent: "我已年满18岁，并同意", terms: "使用条款", and: "及", privacy: "隐私政策", explanation: "Google 将确认你的身份。问卷、测试课堂和应用将使用同一个账号。", separator: "或使用邮箱", consentNeeded: "请确认年龄并接受条款，然后使用 Google 继续。", waiting: "请在 Google 中完成登录。如果打开了新标签页，完成后请返回这里。", verifying: "正在确认你的身份…", success: "身份已确认。", cancelled: "登录已取消。你可以随时重试。", cancel: "取消登录", blocked: "浏览器未能打开 Google。请允许弹出窗口后重试，或使用邮箱。", unavailable: "无法完成 Google 登录。请重试或使用邮箱。", timeout: "登录已过期。请再次点击 Google 继续。", rejected: "无法验证此次登录。请从此页面重试。", rate: "尝试次数过多。请稍等几分钟后重试。", development: "请在 allwain.es 使用 Google 登录。此预览中可以体验表单的其他部分。", emailVerified: "请选择邮箱已通过 Google 验证的账号。"
    },
    ar: {
      button: "المتابعة باستخدام Google", consent: "أبلغ 18 عامًا على الأقل وأوافق على", terms: "الشروط", and: "و", privacy: "سياسة الخصوصية", explanation: "تؤكد Google هويتك. سيُستخدم الحساب نفسه للاستبيان وقاعة الاختبار والتطبيق.", separator: "أو باستخدام بريدك الإلكتروني", consentNeeded: "أكد عمرك ووافق على الشروط للمتابعة باستخدام Google.", waiting: "أكمل تسجيل الدخول لدى Google. إذا فُتحت علامة تبويب أخرى، فعد إلى هنا عند الانتهاء.", verifying: "جارٍ تأكيد هويتك…", success: "تم تأكيد الهوية.", cancelled: "أُلغي تسجيل الدخول. يمكنك المحاولة مرة أخرى متى شئت.", cancel: "إلغاء تسجيل الدخول", blocked: "لم يتمكن المتصفح من فتح Google. اسمح بالنافذة وأعد المحاولة، أو استخدم بريدك الإلكتروني.", unavailable: "تعذر إكمال تسجيل الدخول باستخدام Google. أعد المحاولة أو استخدم بريدك الإلكتروني.", timeout: "انتهت صلاحية تسجيل الدخول. اضغط على Google مجددًا للمتابعة.", rejected: "تعذر التحقق من تسجيل الدخول. أعد المحاولة من هذه الصفحة.", rate: "محاولات كثيرة جدًا. انتظر بضع دقائق قبل إعادة المحاولة.", development: "تسجيل الدخول باستخدام Google متاح على allwain.es. يمكنك تجربة بقية النموذج في هذه المعاينة.", emailVerified: "اختر حسابًا ببريد إلكتروني تم التحقق منه لدى Google."
    }
  };

  function locale() {
    const value = window.AllwainI18n?.locale || document.documentElement.lang || "es";
    return Object.hasOwn(copy, value) ? value : "es";
  }

  function text(key) { return copy[locale()][key] || copy.es[key] || key; }

  function randomValue() {
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  }

  function element(tag, className, content = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content) node.textContent = content;
    return node;
  }

  function mount(host, options = {}) {
    if (!host) return null;
    if (host.allwainGoogleAuth) return host.allwainGoogleAuth;
    host.classList.add("web-google-auth");
    host.setAttribute("data-i18n-dynamic", "");
    const label = element("label", "web-google-consent");
    const consent = element("input", "");
    consent.type = "checkbox";
    const consentCopy = element("span", "web-google-consent-copy");
    label.append(consent, consentCopy);
    const button = element("button", "web-google-button");
    button.type = "button";
    const mark = element("img", "web-google-mark");
    mark.src = "/assets/brand/google-g.png";
    mark.alt = "";
    mark.width = 22;
    mark.height = 22;
    mark.setAttribute("aria-hidden", "true");
    const buttonLabel = element("span", "");
    button.append(mark, buttonLabel);
    const explanation = element("p", "web-google-explanation");
    const status = element("p", "web-google-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const cancelButton = element("button", "web-google-cancel");
    cancelButton.type = "button";
    cancelButton.hidden = true;
    const separator = element("div", "web-google-separator");
    host.replaceChildren(label, button, explanation, status, cancelButton, separator);

    let attempt = null;
    let busy = false;
    let statusKey = "";
    let statusState = "";

    function render() {
      const terms = element("a", "", text("terms"));
      terms.href = "/terminos/";
      terms.target = "_blank";
      terms.rel = "noopener noreferrer";
      const privacy = element("a", "", text("privacy"));
      privacy.href = "/privacidad/";
      privacy.target = "_blank";
      privacy.rel = "noopener noreferrer";
      consentCopy.replaceChildren(`${text("consent")} `, terms, ` ${text("and")} `, privacy, ".");
      buttonLabel.textContent = text("button");
      explanation.textContent = text("explanation");
      status.textContent = statusKey ? text(statusKey) : "";
      status.hidden = !statusKey;
      status.dataset.state = statusState;
      cancelButton.textContent = text("cancel");
      separator.textContent = text("separator");
    }

    function setStatus(key, state = "") {
      statusKey = key;
      statusState = state;
      render();
    }

    function setBusy(value) {
      busy = value;
      button.disabled = value;
      button.setAttribute("aria-busy", String(value));
      consent.disabled = value;
      options.onBusy?.(value);
    }

    function clearAttempt(expected = attempt) {
      if (!expected) return;
      window.clearInterval(expected.interval);
      window.clearTimeout(expected.timeout);
      window.removeEventListener("focus", expected.inspect);
      document.removeEventListener("visibilitychange", expected.inspect);
      window.removeEventListener("message", expected.message);
      try { if (!expected.popup?.closed) expected.popup?.close(); } catch (_error) { /* Browser owns the popup. */ }
      if (attempt === expected) attempt = null;
      cancelButton.hidden = true;
    }

    function cancel() {
      if (!attempt || attempt.exchanging) return;
      clearAttempt();
      setBusy(false);
      setStatus("cancelled");
    }

    function fail(key, current = attempt) {
      clearAttempt(current);
      setBusy(false);
      setStatus(key, "error");
      options.onError?.(text(key));
    }

    async function complete(returnUrl, current) {
      if (attempt !== current || current.exchanging) return;
      let token;
      try {
        const returned = new URL(returnUrl);
        if (returned.origin !== productionOrigin || returned.pathname.replace(/\/$/, "") !== "/oauth/google") return;
        const parameters = new URLSearchParams(returned.hash.replace(/^#/, "") || returned.search);
        if (!parameters.has("state") && !parameters.has("error")) return;
        if (parameters.get("state") !== current.state) throw new Error("rejected");
        if (parameters.get("error")) throw new Error(parameters.get("error") === "access_denied" ? "cancelled" : "unavailable");
        token = parameters.get("id_token") || "";
        if (!token || token.length > 16384 || token.split(".").length !== 3) throw new Error("rejected");
        const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const claims = JSON.parse(window.atob(encoded));
        // These checks bind the response to this popup. Only the server may
        // establish identity after verifying Google's signature and audience.
        if (claims.nonce !== current.nonce || claims.aud !== clientId || !["accounts.google.com", "https://accounts.google.com"].includes(claims.iss) || !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000) {
          throw new Error("rejected");
        }
        if (!consent.checked) throw new Error("consentNeeded");
      } catch (error) {
        const key = Object.hasOwn(copy.es, error.message) ? error.message : "rejected";
        if (key === "cancelled") cancel();
        else fail(key, current);
        return;
      }

      current.exchanging = true;
      clearAttempt(current);
      setStatus("verifying");
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(`${apiBase}/auth/google`, {
          method: "POST",
          mode: "cors",
          credentials: "include",
          cache: "no-store",
          referrerPolicy: "strict-origin-when-cross-origin",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ idToken: token, sourceApp: "allwain", locale: locale() }),
          signal: controller.signal
        });
        token = null;
        const payload = await response.json().catch(() => null);
        if (!response.ok || typeof payload?.token !== "string" || !payload?.user?.id || !payload?.user?.email) {
          const key = response.status === 429 ? "rate" : payload?.error === "UNVERIFIED_GOOGLE_EMAIL" ? "emailVerified" : response.status === 401 ? "rejected" : "unavailable";
          throw new Error(key);
        }
        // Tokens remain in page memory. The API stores refresh credentials in
        // its HttpOnly cookie, shared by the app, public web and tester room.
        setStatus("success", "success");
        await options.onIdentity?.({ token: payload.token, user: payload.user });
      } catch (error) {
        const key = Object.hasOwn(copy.es, error.message) ? error.message : "unavailable";
        setStatus(key, "error");
        options.onError?.(text(key));
      } finally {
        token = null;
        window.clearTimeout(timeout);
        setBusy(false);
      }
    }

    function start() {
      if (busy) return;
      if (!consent.checked) {
        setStatus("consentNeeded", "error");
        consent.focus();
        return;
      }
      if (options.canStart?.() === false) return;
      if (window.location.origin !== productionOrigin) {
        setStatus("development");
        return;
      }
      try {
        const current = { state: randomValue(), nonce: randomValue(), popup: null, exchanging: false };
        const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        url.search = new URLSearchParams({ client_id: clientId, redirect_uri: `${productionOrigin}/oauth/google`, response_type: "id_token", scope: "openid profile email", nonce: current.nonce, state: current.state, prompt: "select_account", hl: locale() }).toString();
        // Synchronous with the user's click, so mobile popup blockers can
        // recognize the gesture. Reuse the app's already registered callback.
        current.popup = window.open(url.href, `allwain-google-${current.state.slice(0, 12)}`, "popup=yes,width=520,height=700");
        if (!current.popup) {
          fail("blocked", null);
          return;
        }
        attempt = current;
        setBusy(true);
        setStatus("waiting");
        cancelButton.hidden = false;
        current.inspect = () => {
          if (attempt !== current || current.exchanging) return;
          try {
            if (current.popup.closed) { cancel(); return; }
            void complete(current.popup.location.href, current);
          } catch (_error) { /* Google is cross-origin until it returns. */ }
        };
        current.message = (event) => {
          if (event.origin !== productionOrigin || event.source !== current.popup || typeof event.data?.url !== "string") return;
          void complete(event.data.url, current);
        };
        current.interval = window.setInterval(current.inspect, 250);
        current.timeout = window.setTimeout(() => fail("timeout", current), 300000);
        window.addEventListener("focus", current.inspect);
        document.addEventListener("visibilitychange", current.inspect);
        window.addEventListener("message", current.message);
        try { current.popup.focus(); } catch (_error) { /* Focus may be controlled by the browser. */ }
      } catch (_error) {
        fail("unavailable");
      }
    }

    button.addEventListener("click", start);
    cancelButton.addEventListener("click", cancel);
    consent.addEventListener("change", () => {
      if (statusKey === "consentNeeded" && consent.checked) setStatus("");
    });
    const control = {
      prepare() { if (!busy) setStatus(""); else render(); },
      cancel,
      get busy() { return busy; },
      destroy() { cancel(); instances.delete(control); host.replaceChildren(); delete host.allwainGoogleAuth; },
      render
    };
    host.allwainGoogleAuth = control;
    instances.add(control);
    render();
    return control;
  }

  window.addEventListener("allwain:localechange", () => instances.forEach((instance) => instance.render()));
  window.addEventListener("pagehide", () => instances.forEach((instance) => instance.cancel()));
  window.AllwainGoogleAuth = { mount, text };
})();

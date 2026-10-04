import React, { useEffect, useRef } from "react";
import {
  NavigationContainer,
  DefaultTheme,
  LinkingOptions,
  useNavigationContainerRef,
} from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Linking, Platform } from "react-native";
import RootNavigator from "./src/navigation/RootNavigator";
import BrandSplash from "./src/components/BrandSplash";
import AppErrorBoundary from "./src/components/AppErrorBoundary";
import AppAlertHost from "./src/components/AppAlertHost";
import AdminMfaBoundary from "./src/components/AdminMfaBoundary";
import { colors } from "./src/theme/colors";
import { RootStackParamList } from "./src/navigation/types";
import { useAuthStore } from "./src/store/auth.store";
import "./src/video/livekitGlobals";
import AnalyticsConsentProvider, {
  useAnalyticsConsent,
} from "./src/analytics/AnalyticsConsentProvider";
import {
  setAnalyticsContext,
  trackAnalyticsScreen,
} from "./src/analytics";
import { isRtlLocale } from "./src/i18n";
import "./src/theme/globalStyles";
import { journeyFromUrl, rememberPendingJourney, safeJourney } from "./src/utils/pendingJourney";

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.card,
    text: colors.text,
    primary: colors.primary,
    border: colors.cardBorder,
  },
};

const webAppRoute = (path: string) => (Platform.OS === "web" ? `app/${path}` : path);

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ["allwain://", "https://allwain.es"],
  config: {
    screens: {
      Auth: webAppRoute("acceso"),
      MainTabs: {
        path: Platform.OS === "web" ? "app" : "",
        screens: {
          Inicio: "inicio",
          Ofertas: "ofertas",
          Demandas: "demandas",
          ProgramaRecomendados: "mi-red",
          GuiaIA: "ayuda",
          Perfil: "perfil",
        },
      },
      MyRequests: webAppRoute("mis-peticiones"),
      Search: webAppRoute("buscar"),
      ManualRequest: webAppRoute("pedir"),
      HowAllwainWorks: webAppRoute("curso-allwain"),
      Notifications: webAppRoute("avisos"),
      ShoppingLists: {
        path: webAppRoute("listas"),
        parse: { create: (value: string) => value === "true" },
      },
      AdminDashboard: webAppRoute("administracion"),
      ChatList: webAppRoute("mensajes"),
      ChatThread: webAppRoute("conversacion"),
      VideoCall: webAppRoute("videollamada"),
      Legal: webAppRoute("legal/:document"),
      Scan: webAppRoute("capturar"),
      ScanResult: webAppRoute("peticion"),
      ActivateSeller: webAppRoute("activar-vendedor"),
      ActivateConnector: webAppRoute("activar-conector"),
    },
  },
};

export default function App() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const user = useAuthStore((state) => state.user);
  const restoreSession = useAuthStore((state) => state.restoreSession);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  useEffect(() => {
    const capture = (url: string | null) => {
      if (useAuthStore.getState().user) return;
      const destination = journeyFromUrl(url);
      if (destination) void rememberPendingJourney(destination);
    };
    if (Platform.OS === "web") {
      const location = (globalThis as any)?.location;
      // The current document's path is internal even in an isolated preview.
      // Never derive this from an arbitrary return URL or its origin.
      if (location) capture(`${location.pathname}${location.search}`);
    }
    else void Linking.getInitialURL().then(capture);
    const subscription = Linking.addEventListener("url", ({ url }) => capture(url));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!hydrated) void restoreSession();
  }, [hydrated, restoreSession]);

  const ready = hydrated;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AnalyticsConsentProvider promptEnabled={ready}>
          <AppErrorBoundary onResetSession={() => clearAuth()}>
            <AdminMfaBoundary><NavigationShell ready={ready} authenticated={Boolean(user)} /></AdminMfaBoundary>
            <AppAlertHost />
          </AppErrorBoundary>
        </AnalyticsConsentProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function NavigationShell({
  ready,
  authenticated,
}: {
  ready: boolean;
  authenticated: boolean;
}) {
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const routeNameRef = useRef<string | null>(null);
  const lastDestination = useRef<ReturnType<typeof safeJourney>>(null);
  const accountRef = useRef(useAuthStore.getState().user?.id);
  const appMode = useAuthStore((state) => state.appMode);
  const locale = useAuthStore((state) => state.locale);
  const { status } = useAnalyticsConsent();

  useEffect(() => useAuthStore.subscribe((state, previous) => {
    if (previous.user && !state.user && lastDestination.current) {
      void rememberPendingJourney(lastDestination.current, previous.user.id);
    }
    accountRef.current = state.user?.id;
  }), []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale;
    document.documentElement.dir = isRtlLocale(locale) ? "rtl" : "ltr";
  }, [locale]);

  useEffect(() => {
    if (status !== "granted") return;
    void setAnalyticsContext({ appMode, locale });
    if (!ready || !navigationRef.isReady()) return;
    const routeName = navigationRef.getCurrentRoute()?.name;
    if (routeName) void trackAnalyticsScreen(routeName);
  }, [appMode, locale, navigationRef, ready, status]);

  if (!ready) return <BrandSplash />;

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navigationTheme}
      linking={authenticated ? linking : undefined}
      onReady={() => {
        const current = navigationRef.getCurrentRoute();
        if (accountRef.current) lastDestination.current = safeJourney(current);
        const routeName = navigationRef.getCurrentRoute()?.name || null;
        routeNameRef.current = routeName;
        if (routeName) void trackAnalyticsScreen(routeName);
      }}
      onStateChange={() => {
        const current = navigationRef.getCurrentRoute();
        if (accountRef.current) lastDestination.current = safeJourney(current) || lastDestination.current;
        const routeName = navigationRef.getCurrentRoute()?.name || null;
        if (routeName && routeName !== routeNameRef.current) {
          routeNameRef.current = routeName;
          void trackAnalyticsScreen(routeName);
        }
      }}
    >
      <RootNavigator />
    </NavigationContainer>
  );
}

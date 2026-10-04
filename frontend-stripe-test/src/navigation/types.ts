import type { NavigatorScreenParams } from "@react-navigation/native";

export type MainTabParamList = {
  Inicio: undefined;
  Ofertas:
    | {
        section?: "orders" | "offers" | "preparation";
        focusKey?: string;
        offerId?: string;
        contractId?: string;
        orderId?: string;
        requestId?: string;
        deliveryId?: string;
      }
    | undefined;
  Demandas: undefined;
  ProgramaRecomendados: undefined;
  GuiaIA: undefined;
  Perfil: { openReputation?: boolean } | undefined;
};

export type RootStackParamList = {
  Splash: undefined;
  Auth: { mode?: "login" | "register"; sponsorCode?: string } | undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  MyRequests: undefined;
  Search: undefined;
  ManualRequest: undefined;
  HowAllwainWorks:
    | {
        initialPage?: "overview" | "buy" | "sell" | "connector" | "flow";
      }
    | undefined;
  Notifications: undefined;
  ShoppingLists:
    | {
        shoppingListId?: string;
        mode?: "buy" | "sell";
        create?: boolean;
      }
    | undefined;
  ChatList: undefined;
  ChatThread:
    | {
        conversationId?: string;
        orderId?: string;
        title?: string;
        targetUserId?: string;
        targetName?: string;
      }
    | undefined;
  VideoCall: {
    conversationId: string;
    title?: string;
  };
  Legal: { document: "privacy" | "terms" };
  Scan: { returnTo?: "shopping-list" } | undefined;
  ScanResult:
    | {
        requestId?: string;
        captureId?: string;
      }
    | undefined;
  DemoLanding: undefined;
  DemoScanResult: undefined;
  ActivateSeller: { requestId?: string; shoppingListId?: string } | undefined;
  ActivateConnector: undefined;
  AdminDashboard: undefined;
};

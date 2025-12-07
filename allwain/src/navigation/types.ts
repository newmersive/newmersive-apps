import { NavigatorScreenParams } from "@react-navigation/native";
import { ScanDemoResponse } from "../api/allwain.api";

export type AppTabParamList = {
  Buscar: undefined;
  Ofertas: undefined;
  Perfil: undefined;
};

export type AppStackParamList = {
  MainTabs: NavigatorScreenParams<AppTabParamList>;
  Scan: undefined;
  ScanResult: { result?: ScanDemoResponse } | undefined;
  Guests: undefined;
  DemoLanding: undefined;
  DemoScanResult: undefined;
};

export type RootStackParamList = {
  App: NavigatorScreenParams<AppStackParamList>;
  Auth: undefined;
};

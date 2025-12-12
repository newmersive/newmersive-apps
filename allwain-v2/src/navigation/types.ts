export type RootStackParamList = {
  Splash: undefined;
  Auth: { mode?: "login" | "register"; sponsorCode?: string } | undefined;
  Login: undefined;
  Register: undefined;
  SponsorQR: { code?: string } | undefined;
  MainTabs: undefined;
  Scan: undefined;
  ScanResult: undefined;
};

export type MainTabParamList = {
  Inicio: undefined;
  Ofertas: undefined;
  ProgramaRecomendados: undefined;
  Perfil: undefined;
};

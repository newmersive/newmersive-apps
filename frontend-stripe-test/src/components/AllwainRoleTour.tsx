import React from "react";
import {
  ActivityIndicator,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CircleDollarSign,
  Clock3,
  MapPin,
  Network,
  PackageCheck,
  QrCode,
  Repeat2,
  Search,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
  UsersRound,
  X,
} from "lucide-react-native";

import { colors } from "../theme/colors";

export type AllwainIntent = "buy" | "sell" | "connector";
export type AllwainTourPage =
  | "overview"
  | "buy"
  | "sell"
  | "connector"
  | "flow";

type TourProps = {
  initialPage?: AllwainTourPage;
  allowEarlyFinish?: boolean;
  onFinish: (intent: AllwainIntent) => void | Promise<void>;
  onClose?: () => void;
};

export type AllwainRoleTourHandle = { finish: () => Promise<void> };

const PAGE_IDS: AllwainTourPage[] = [
  "overview",
  "buy",
  "sell",
  "connector",
  "flow",
];

const PAGE_LABELS: Record<AllwainTourPage, string> = {
  overview: "Tu cuenta",
  buy: "Comprar",
  sell: "Vendedor",
  connector: "Conector",
  flow: "Todo unido",
};
const ORANGES_IMAGE = require("../../assets/campaigns/naranjas-valencianas-piloto.jpg");

const AllwainRoleTour = React.forwardRef<AllwainRoleTourHandle, TourProps>(function AllwainRoleTour(
  { initialPage = "overview", allowEarlyFinish = false, onFinish, onClose }, ref,
) {
  const focusedIntent: AllwainIntent | null =
    initialPage === "sell" || initialPage === "connector" ? initialPage : null;
  const pageIds = React.useMemo<AllwainTourPage[]>(
    () => (focusedIntent ? [focusedIntent] : PAGE_IDS),
    [focusedIntent],
  );
  const initialIndex = focusedIntent ? 0 : Math.max(0, pageIds.indexOf(initialPage));
  const horizontalRef = React.useRef<ScrollView>(null);
  const [pageWidth, setPageWidth] = React.useState(360);
  const [activeIndex, setActiveIndex] = React.useState(initialIndex);
  const [intent, setIntent] = React.useState<AllwainIntent>(focusedIntent || "buy");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const savingRef = React.useRef(false);
  const activeIndexRef = React.useRef(initialIndex);
  activeIndexRef.current = activeIndex;

  React.useEffect(() => {
    const nextIndex = focusedIntent ? 0 : Math.max(0, pageIds.indexOf(initialPage));
    if (focusedIntent) setIntent(focusedIntent);
    setActiveIndex(nextIndex);
    requestAnimationFrame(() => {
      horizontalRef.current?.scrollTo({ x: nextIndex * pageWidth, animated: false });
    });
  }, [focusedIntent, initialPage, pageIds]);

  React.useEffect(() => {
    horizontalRef.current?.scrollTo({ x: activeIndexRef.current * pageWidth, animated: false });
  }, [pageWidth]);

  function goTo(index: number) {
    const next = Math.max(0, Math.min(pageIds.length - 1, index));
    setActiveIndex(next);
    horizontalRef.current?.scrollTo({ x: next * pageWidth, animated: true });
  }

  function handleMomentumEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setActiveIndex(Math.max(0, Math.min(pageIds.length - 1, next)));
  }

  const finish = React.useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await onFinish(intent);
    } catch (finishError: any) {
      setError(finishError?.message || "No pudimos guardar tu elección. Inténtalo de nuevo.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [intent, onFinish]);

  React.useImperativeHandle(ref, () => ({ finish }), [finish]);

  return (
    <SafeAreaView
      style={styles.shell}
      edges={Platform.OS === "web" ? [] : ["top", "bottom"]}
      onLayout={(event) => {
        const width = Math.max(280, Math.round(event.nativeEvent.layout.width));
        if (width !== pageWidth) setPageWidth(width);
      }}
    >
      <View style={styles.header}>
        <Image
          source={require("../assets/logos/Logotipo_Allwain_02.png")}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Allwain"
        />
        <View style={styles.headerProgress}>
          <Text style={styles.headerKicker}>{PAGE_LABELS[pageIds[activeIndex]]}</Text>
          <Text style={styles.headerCount}>{activeIndex + 1} / {pageIds.length}</Text>
        </View>
        {onClose ? (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cerrar recorrido"
          >
            <X size={22} color={colors.text} />
          </TouchableOpacity>
        ) : allowEarlyFinish ? (
          <TouchableOpacity style={styles.skipButton} onPress={() => void finish()} disabled={saving}
            accessibilityRole="button" accessibilityLabel="Entrar en Allwain" accessibilityState={{ disabled: saving, busy: saving }}>
            <Text style={styles.skipText}>{saving ? "..." : "Entrar"}</Text>
          </TouchableOpacity>
        ) : <View style={styles.iconButton} />}
      </View>

      <ScrollView
        ref={horizontalRef}
        horizontal
        pagingEnabled
        snapToInterval={pageWidth}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumEnd}
        style={styles.horizontal}
        contentOffset={{ x: initialIndex * pageWidth, y: 0 }}
      >
        {pageIds.map((pageId, index) => (
          <TourFrame key={pageId} pageId={pageId} width={pageWidth} active={index === activeIndex}>
            {pageId === "overview" ? <OverviewPage /> : null}
            {pageId === "buy" ? <BuyerPage /> : null}
            {pageId === "sell" ? <SellerPage focused={focusedIntent === "sell"} /> : null}
            {pageId === "connector" ? <ConnectorPage focused={focusedIntent === "connector"} /> : null}
            {pageId === "flow" ? <FlowPage intent={intent} onIntent={setIntent} active={index === activeIndex} /> : null}
          </TourFrame>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
        <View style={styles.footerRow}>
          <TouchableOpacity
            style={[styles.navButton, activeIndex === 0 && styles.navButtonDisabled]}
            onPress={() => goTo(activeIndex - 1)}
            disabled={activeIndex === 0 || saving}
            accessibilityRole="button"
            accessibilityLabel="Página anterior"
          >
            <ArrowLeft size={21} color={activeIndex === 0 ? colors.cardBorder : colors.text} />
          </TouchableOpacity>

          <View style={styles.dots} accessibilityLabel={`Página ${activeIndex + 1} de ${pageIds.length}`}>
            {pageIds.map((page, index) => (
              <TouchableOpacity
                key={page}
                style={[styles.dot, index === activeIndex && styles.dotActive]}
                onPress={() => goTo(index)}
                disabled={saving}
                accessibilityState={{ selected: index === activeIndex, disabled: saving }}
                accessibilityRole="button"
                accessibilityLabel={`Ir a ${PAGE_LABELS[page]}`}
              />
            ))}
          </View>

          {activeIndex < pageIds.length - 1 ? (
            <TouchableOpacity
              style={[styles.navButton, styles.navButtonNext]}
              onPress={() => goTo(activeIndex + 1)}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Página siguiente"
            >
              <ArrowRight size={21} color="#FFFFFF" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.finishButton, saving && styles.disabled]}
              onPress={() => void finish()}
              disabled={saving}
              accessibilityRole="button"
            >
                {saving ? <ActivityIndicator color="#FFFFFF" /> : (
                  <>
                    <Text style={styles.finishButtonText}>
                      {focusedIntent === "sell"
                        ? "Volver a Vendedor"
                        : focusedIntent === "connector"
                          ? "Volver a Conector"
                          : "Entrar"}
                    </Text>
                    <ArrowRight size={19} color="#FFFFFF" />
                  </>
              )}
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.swipeHint}>
          {focusedIntent === "sell"
            ? "Esta muestra corresponde al espacio Vendedor"
            : focusedIntent === "connector"
              ? "Esta muestra corresponde al espacio Conector"
              : "Desliza para descubrir cada espacio"}
        </Text>
      </View>
    </SafeAreaView>
  );
});

export default AllwainRoleTour;

function TourFrame({ width, children, active, pageId }: { width: number; children: React.ReactNode; active: boolean; pageId: AllwainTourPage }) {
  return (
    <ScrollView
      testID={`allwain-tour-page-${pageId}`}
      style={[styles.pageFrame, { width }]}
      contentContainerStyle={styles.pageScroll}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      aria-hidden={!active}
    >
      {children}
    </ScrollView>
  );
}

function PageHeading({ eyebrow, title, body, inverted = false }: {
  eyebrow: string;
  title: string;
  body: string;
  inverted?: boolean;
}) {
  return (
    <View style={styles.heading}>
      <Text style={[styles.eyebrow, inverted && styles.textWhite]}>{eyebrow}</Text>
      <Text style={[styles.pageTitle, inverted && styles.textWhite]}>{title}</Text>
      <Text style={[styles.pageBody, inverted && styles.textSoftWhite]}>{body}</Text>
    </View>
  );
}

function OverviewPage() {
  return (
    <View style={styles.page}>
      <PageHeading
        eyebrow="UNA IDENTIDAD ALLWAIN"
        title="Tres formas de participar"
        body="No tienes que elegir una para siempre. Cambia de espacio sin cerrar sesión."
      />
      <View style={styles.identityVisual}>
        <View style={styles.identityCore}>
          <Image source={require("../assets/logos/Imagotipo_Allwain_02.png")} style={styles.identityLogo} resizeMode="contain" />
          <Text style={styles.identityCoreLabel}>TU CUENTA</Text>
        </View>
        <View style={styles.identityLine} />
        <RoleBand icon={ShoppingBag} title="COMPRADOR" detail="Pide y elige" tone="buy" />
        <RoleBand icon={Store} title="VENDEDOR" detail="Ofrece y cobra" tone="sell" />
        <RoleBand icon={UsersRound} title="CONECTOR" detail="Une y entrega" tone="connector" />
      </View>
      <View style={styles.statementBand}>
        <Sparkles size={22} color={colors.primary} />
        <View style={styles.flexCopy}>
          <Text style={styles.statementTitle}>Allwain se ocupa de lo complejo</Text>
          <Text style={styles.statementText}>Tú solo decides qué quieres hacer ahora.</Text>
        </View>
      </View>
      <SwipeCue label="Conoce el espacio Comprador" />
    </View>
  );
}

function BuyerPage() {
  return (
    <View style={styles.page}>
      <PageHeading
        eyebrow="COMPRADOR · ACTIVO DESDE EL INICIO"
        title="Dinos qué necesitas"
        body="Busca algo concreto o deja que la comunidad te proponga opciones."
      />
      <View style={styles.actionGrid}>
        <ActionTile icon={Search} title="Buscar" body="Explora todo Allwain" />
        <ActionTile icon={Camera} title="Escanear" body="Una foto basta" />
        <ActionTile icon={ShoppingBag} title="Pedir" body="Varios vendedores responden" />
        <ActionTile icon={Repeat2} title="Mis listas" body="Una vez o cada semana" />
      </View>
      <View style={styles.offerVisual}>
        <Image source={ORANGES_IMAGE} style={styles.offerImage} resizeMode="cover" />
        <View style={styles.offerCopy}>
          <Text style={styles.offerBadge}>CERCA DE TI</Text>
          <Text style={styles.offerTitle}>Naranjas de Foios</Text>
          <Text style={styles.offerMeta}>1 €/kg · desde 5 kg</Text>
          <View style={styles.offerAction}><Text style={styles.offerActionText}>Elegir cantidad</Text></View>
        </View>
      </View>
      <MiniJourney
        steps={[
          { icon: ShoppingBag, label: "Pides" },
          { icon: UsersRound, label: "Comparas" },
          { icon: Check, label: "Eliges" },
        ]}
      />
      <View style={styles.infoStrip}>
        <Clock3 size={19} color={colors.primary} />
        <Text style={styles.infoStripText}>Si das más tiempo, más vendedores podrán ofrecerte una opción.</Text>
      </View>
    </View>
  );
}

function RoleBand({ icon: Icon, title, detail, tone }: {
  icon: React.ComponentType<any>;
  title: string;
  detail: string;
  tone: AllwainIntent;
}) {
  const dark = tone !== "buy";
  return (
    <View style={[styles.roleBand, tone === "sell" ? styles.sellerBand : tone === "connector" ? styles.connectorBand : styles.buyerBand]}>
      <View style={[styles.roleIcon, dark && styles.roleIconDark]}><Icon size={21} color={dark ? "#FFFFFF" : colors.primary} /></View>
      <View style={styles.flexCopy}>
        <Text style={[styles.roleTitle, dark && styles.textWhite]}>{title}</Text>
        <Text style={[styles.roleDetail, dark && styles.textSoftWhite]}>{detail}</Text>
      </View>
      <ArrowRight size={20} color={dark ? "#FFFFFF" : colors.primary} />
    </View>
  );
}

function ActionTile({ icon: Icon, title, body, inverted = false }: {
  icon: React.ComponentType<any>;
  title: string;
  body: string;
  inverted?: boolean;
}) {
  return (
    <View style={[styles.actionTile, inverted && styles.actionTileDark]}>
      <Icon size={23} color={inverted ? colors.primary : colors.primary} />
      <Text style={[styles.actionTileTitle, inverted && styles.textWhite]}>{title}</Text>
      <Text style={[styles.actionTileBody, inverted && styles.textSoftWhite]}>{body}</Text>
    </View>
  );
}

function MiniJourney({ steps, inverted = false }: {
  steps: { icon: React.ComponentType<any>; label: string }[];
  inverted?: boolean;
}) {
  return (
    <View style={styles.miniJourney}>
      {steps.map((step, index) => {
        const Icon = step.icon;
        return (
          <React.Fragment key={step.label}>
            <View style={styles.journeyStep}>
              <View style={[styles.journeyIcon, inverted && styles.journeyIconDark]}><Icon size={18} color={inverted ? "#FFFFFF" : colors.primary} /></View>
              <Text style={[styles.journeyLabel, inverted && styles.textWhite]}>{step.label}</Text>
            </View>
            {index < steps.length - 1 ? <ArrowRight size={17} color={inverted ? "#AFAFAF" : colors.cardBorder} /> : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

function SwipeCue({ label, inverted = false }: { label: string; inverted?: boolean }) {
  return (
    <View style={styles.swipeCue}>
      <Text style={[styles.swipeCueText, inverted && styles.textSoftWhite]}>{label}</Text>
      <ArrowRight size={18} color={inverted ? "#FFFFFF" : colors.primary} />
    </View>
  );
}

function SellerPage({ focused = false }: { focused?: boolean }) {
  return (
    <View style={[styles.page, styles.sellerPage]}>
      <PageHeading
        eyebrow="VENDEDOR · SE ACTIVA EN LA MISMA CUENTA"
        title="Sabes qué vender y qué preparar"
        body="Allwain reúne los pedidos, calcula cantidades y te enseña la siguiente tarea."
        inverted
      />
      <View style={styles.todayBand}>
        <View style={styles.todayHeader}>
          <Text style={styles.todayLabel}>HOY</Text>
          <Text style={styles.todayHint}>Tu trabajo, ya ordenado</Text>
        </View>
        <View style={styles.metricRow}>
          <Metric value="8" label="nuevos" />
          <Metric value="63 kg" label="por preparar" />
          <Metric value="5" label="listos" />
        </View>
        <View style={styles.darkAction}><Text style={styles.darkActionText}>VER QUÉ PREPARAR</Text></View>
      </View>
      <View style={styles.actionGrid}>
        <ActionTile icon={Camera} title="Publica" body="Foto, precio y cantidad" inverted />
        <ActionTile icon={UsersRound} title="Responde" body="A peticiones que encajan" inverted />
        <ActionTile icon={PackageCheck} title="Prepara" body="Totales agrupados" inverted />
        <ActionTile icon={CircleDollarSign} title="Cobra" body="Ingreso y estado claros" inverted />
      </View>
      <View style={styles.prepBand}>
        <View style={styles.prepIcon}><PackageCheck size={24} color={colors.text} /></View>
        <View style={styles.flexCopy}>
          <Text style={styles.prepEyebrow}>PARA MAÑANA</Text>
          <Text style={styles.prepTitle}>Naranjas Navelate · 120 kg</Text>
          <Text style={styles.prepMeta}>Allwain ha sumado 17 pedidos por ti</Text>
        </View>
      </View>
      <SwipeCue
        label={focused ? "Publica, prepara y cobra desde Vendedor" : "Descubre cómo conecta la red"}
        inverted
      />
    </View>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function ConnectorPage({ focused = false }: { focused?: boolean }) {
  return (
    <View style={[styles.page, styles.connectorPage]}>
      <PageHeading
        eyebrow="CONECTOR · TU RED Y TU ZONA"
        title="Dinos dónde puedes ayudar"
        body="Conecta personas, comercios y entregas locales sin exponer ubicaciones privadas."
        inverted
      />
      <View style={styles.connectorTopRow}>
        <View style={styles.qrVisual}>
          <QrCode size={68} color={colors.text} strokeWidth={1.7} />
          <Text style={styles.qrLabel}>MI QR</Text>
        </View>
        <View style={styles.networkVisual}>
          <Network size={25} color="#FFFFFF" />
          <Text style={styles.networkValue}>24</Text>
          <Text style={styles.networkLabel}>personas en mi red</Text>
        </View>
      </View>
      <View style={styles.routeCard}>
        <View style={styles.routeHeader}>
          <View>
            <Text style={styles.routeEyebrow}>CERCA DE TI</Text>
            <Text style={styles.routeTitle}>Entrega disponible</Text>
          </View>
          <View style={styles.routeFee}><Text style={styles.routeFeeText}>+ 2 €</Text></View>
        </View>
        <RouteStop icon={Store} title="Recoge" detail="Agricultor · Foios" />
        <View style={styles.routeLine}><ArrowDown size={17} color={colors.primary} /></View>
        <RouteStop icon={MapPin} title="Entrega" detail="Comprador · Meliana" />
        <View style={styles.routeFacts}>
          <Text style={styles.routeFact}>4,2 km</Text>
          <Text style={styles.routeFact}>Km 0</Text>
          <Text style={styles.routeFact}>QR trazable</Text>
        </View>
        <View style={styles.connectorAction}><Text style={styles.connectorActionText}>ACEPTAR ENTREGA</Text></View>
      </View>
      <View style={styles.connectorFeatureRow}>
        <ConnectorFeature icon={UsersRound} label="Mi red" />
        <ConnectorFeature icon={Truck} label="Entregas" />
        <ConnectorFeature icon={CircleDollarSign} label="Ingresos" />
      </View>
      <SwipeCue
        label={focused ? "Comparte, conecta y entrega desde Conector" : "Mira cómo encaja todo"}
        inverted
      />
    </View>
  );
}

function RouteStop({ icon: Icon, title, detail }: {
  icon: React.ComponentType<any>;
  title: string;
  detail: string;
}) {
  return (
    <View style={styles.routeStop}>
      <View style={styles.routeStopIcon}><Icon size={20} color={colors.primary} /></View>
      <View style={styles.flexCopy}>
        <Text style={styles.routeStopTitle}>{title}</Text>
        <Text style={styles.routeStopDetail}>{detail}</Text>
      </View>
      <Check size={19} color={colors.success} />
    </View>
  );
}

function ConnectorFeature({ icon: Icon, label }: { icon: React.ComponentType<any>; label: string }) {
  return (
    <View style={styles.connectorFeature}>
      <Icon size={21} color="#FFFFFF" />
      <Text style={styles.connectorFeatureText}>{label}</Text>
    </View>
  );
}

function FlowPage({ intent, onIntent, active }: { intent: AllwainIntent; onIntent: (intent: AllwainIntent) => void; active: boolean }) {
  return (
    <View style={styles.page}>
      <PageHeading
        eyebrow="UNA OPERACIÓN · TODO CONECTADO"
        title="De una necesidad a una entrega"
        body="Cada persona ve únicamente lo que necesita hacer; Allwain mantiene unido el recorrido."
      />
      <View style={styles.flowVisual}>
        <FlowStep
          number="1"
          icon={ShoppingBag}
          title="El comprador pide"
          detail="Elige cantidad, momento y entrega"
          tone="buy"
        />
        <FlowLink label="Allwain encuentra la mejor opción" />
        <FlowStep
          number="2"
          icon={Store}
          title="El vendedor prepara"
          detail="Recibe un pedido claro y listo para gestionar"
          tone="sell"
        />
        <FlowLink label="Allwain coordina pago y trazabilidad" />
        <FlowStep
          number="3"
          icon={Truck}
          title="El conector acerca"
          detail="La entrega local actualiza cada estado"
          tone="connector"
        />
      </View>
      <View style={styles.choiceSection}>
        <Text style={styles.choiceTitle}>¿Por dónde quieres empezar?</Text>
        <View style={styles.choiceRow}>
          <IntentChoice disabled={!active} active={intent === "buy"} icon={ShoppingBag} label="Comprar" onPress={() => onIntent("buy")} />
          <IntentChoice disabled={!active} active={intent === "sell"} icon={Store} label="Vender" onPress={() => onIntent("sell")} />
          <IntentChoice disabled={!active} active={intent === "connector"} icon={UsersRound} label="Conectar" onPress={() => onIntent("connector")} />
        </View>
        <Text style={styles.choiceHelp}>Podrás cambiar de espacio en cualquier momento.</Text>
      </View>
    </View>
  );
}

function FlowStep({ number, icon: Icon, title, detail, tone }: {
  number: string;
  icon: React.ComponentType<any>;
  title: string;
  detail: string;
  tone: AllwainIntent;
}) {
  const dark = tone !== "buy";
  return (
    <View style={[styles.flowStep, tone === "sell" ? styles.sellerBand : tone === "connector" ? styles.connectorBand : styles.buyerBand]}>
      <Text style={[styles.flowNumber, dark && styles.flowNumberDark]}>{number}</Text>
      <View style={[styles.flowStepIcon, dark && styles.flowStepIconDark]}><Icon size={23} color={dark ? "#FFFFFF" : colors.primary} /></View>
      <View style={styles.flexCopy}>
        <Text style={[styles.flowStepTitle, dark && styles.textWhite]}>{title}</Text>
        <Text style={[styles.flowStepDetail, dark && styles.textSoftWhite]}>{detail}</Text>
      </View>
    </View>
  );
}

function FlowLink({ label }: { label: string }) {
  return (
    <View style={styles.flowLink}>
      <View style={styles.flowLinkLine} />
      <Text style={styles.flowLinkLabel}>{label}</Text>
      <View style={styles.flowLinkLine} />
    </View>
  );
}

function IntentChoice({ active, disabled, icon: Icon, label, onPress }: {
  active: boolean;
  disabled: boolean;
  icon: React.ComponentType<any>;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.intentChoice, active && styles.intentChoiceActive]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: active, disabled }}
    >
      <View style={[styles.intentIcon, active && styles.intentIconActive]}>
        <Icon size={20} color={active ? "#FFFFFF" : colors.text} />
      </View>
      <Text style={styles.intentLabel}>{label}</Text>
      <View style={[styles.intentRadio, active && styles.intentRadioActive]} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    width: "100%",
    overflow: "hidden",
    backgroundColor: colors.background,
  },
  header: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  logo: { width: 132, height: 34 },
  headerProgress: { flex: 1, alignItems: "flex-end", gap: 1 },
  headerKicker: { color: colors.text, fontSize: 12, fontWeight: "900" },
  headerCount: { color: colors.mutedText, fontSize: 11, fontWeight: "700" },
  iconButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  skipButton: { minWidth: 58, minHeight: 44, alignItems: "center", justifyContent: "center" },
  skipText: { color: colors.text, fontSize: 14, fontWeight: "700" },
  horizontal: { flex: 1 },
  pageFrame: { flex: 1 },
  pageScroll: { flexGrow: 1 },
  page: { flexGrow: 1, padding: 20, paddingBottom: 28, gap: 18, backgroundColor: colors.background },
  sellerPage: { backgroundColor: colors.seller },
  connectorPage: { backgroundColor: colors.connector },
  heading: { gap: 7 },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: "900" },
  pageTitle: { maxWidth: 620, color: colors.text, fontSize: 27, lineHeight: 32, fontWeight: "900" },
  pageBody: { maxWidth: 620, color: colors.mutedText, fontSize: 15, lineHeight: 21, fontWeight: "600" },
  textWhite: { color: "#FFFFFF" },
  textSoftWhite: { color: "#ECECEB" },
  flexCopy: { flex: 1, minWidth: 0 },
  identityVisual: { gap: 8 },
  identityCore: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  identityLogo: { width: 44, height: 44 },
  identityCoreLabel: { color: colors.text, fontSize: 16, fontWeight: "900" },
  identityLine: { width: 2, height: 13, alignSelf: "center", backgroundColor: colors.cardBorder },
  roleBand: {
    minHeight: 67,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 8,
  },
  buyerBand: { backgroundColor: colors.card, borderColor: colors.cardBorder },
  sellerBand: { backgroundColor: colors.seller, borderColor: "#5C5C5D" },
  connectorBand: { backgroundColor: colors.connector, borderColor: "#F06D4F" },
  roleIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: colors.highlight,
  },
  roleIconDark: { backgroundColor: "rgba(255,255,255,0.16)" },
  roleTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  roleDetail: { marginTop: 2, color: colors.mutedText, fontSize: 12, fontWeight: "700" },
  statementBand: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    backgroundColor: colors.card,
  },
  statementTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  statementText: { marginTop: 3, color: colors.mutedText, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 9 },
  actionTile: {
    width: "48%",
    minHeight: 112,
    justifyContent: "center",
    gap: 5,
    padding: 13,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  actionTileDark: { borderColor: "#626263", backgroundColor: "#4B4B4C" },
  actionTileTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  actionTileBody: { color: colors.mutedText, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  offerVisual: {
    height: 154,
    flexDirection: "row",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  offerImage: { width: "43%", height: "100%" },
  offerCopy: { flex: 1, justifyContent: "center", alignItems: "flex-start", gap: 5, padding: 12 },
  offerBadge: { color: colors.primary, fontSize: 10, fontWeight: "900" },
  offerTitle: { color: colors.text, fontSize: 17, lineHeight: 20, fontWeight: "900" },
  offerMeta: { color: colors.mutedText, fontSize: 12, fontWeight: "700" },
  offerAction: { marginTop: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 7, backgroundColor: colors.primary },
  offerActionText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  miniJourney: { minHeight: 65, flexDirection: "row", alignItems: "center", justifyContent: "space-around", gap: 5 },
  journeyStep: { alignItems: "center", gap: 5 },
  journeyIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.card },
  journeyIconDark: { backgroundColor: "#555556" },
  journeyLabel: { color: colors.text, fontSize: 11, fontWeight: "900" },
  infoStrip: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 4 },
  infoStripText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  swipeCue: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 7, marginTop: "auto", paddingTop: 3 },
  swipeCueText: { color: colors.mutedText, fontSize: 12, fontWeight: "800" },
  todayBand: { gap: 13, padding: 15, borderRadius: 8, backgroundColor: "#FFFFFF" },
  todayHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  todayLabel: { color: colors.primary, fontSize: 12, fontWeight: "900" },
  todayHint: { color: colors.mutedText, fontSize: 11, fontWeight: "700" },
  metricRow: { flexDirection: "row", gap: 6 },
  metric: { flex: 1, minHeight: 70, justifyContent: "center", padding: 8, borderLeftWidth: 2, borderLeftColor: colors.primary },
  metricValue: { color: colors.text, fontSize: 21, fontWeight: "900" },
  metricLabel: { color: colors.mutedText, fontSize: 11, fontWeight: "700" },
  darkAction: { minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.seller },
  darkActionText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  prepBand: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 11, padding: 13, borderRadius: 8, backgroundColor: colors.primary },
  prepIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#FFFFFF" },
  prepEyebrow: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  prepTitle: { marginTop: 2, color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  prepMeta: { marginTop: 2, color: "#FFF0EC", fontSize: 11, fontWeight: "700" },
  connectorTopRow: { flexDirection: "row", gap: 10 },
  qrVisual: { width: 126, minHeight: 126, alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 8, backgroundColor: "#FFFFFF" },
  qrLabel: { color: colors.text, fontSize: 12, fontWeight: "900" },
  networkVisual: { flex: 1, minHeight: 126, justifyContent: "center", gap: 3, padding: 16, borderRadius: 8, backgroundColor: colors.seller },
  networkValue: { color: "#FFFFFF", fontSize: 31, fontWeight: "900" },
  networkLabel: { color: "#ECECEB", fontSize: 12, fontWeight: "700" },
  routeCard: { gap: 10, padding: 15, borderRadius: 8, backgroundColor: "#FFFFFF" },
  routeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  routeEyebrow: { color: colors.primary, fontSize: 10, fontWeight: "900" },
  routeTitle: { marginTop: 2, color: colors.text, fontSize: 18, fontWeight: "900" },
  routeFee: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 7, backgroundColor: colors.highlight },
  routeFeeText: { color: colors.primary, fontSize: 14, fontWeight: "900" },
  routeStop: { minHeight: 47, flexDirection: "row", alignItems: "center", gap: 9 },
  routeStopIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.highlight },
  routeStopTitle: { color: colors.text, fontSize: 12, fontWeight: "900" },
  routeStopDetail: { marginTop: 2, color: colors.mutedText, fontSize: 12, fontWeight: "700" },
  routeLine: { height: 20, width: 38, alignItems: "center", justifyContent: "center" },
  routeFacts: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  routeFact: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, backgroundColor: colors.background, color: colors.text, fontSize: 10, fontWeight: "800" },
  connectorAction: { minHeight: 43, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.seller },
  connectorActionText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  connectorFeatureRow: { flexDirection: "row", justifyContent: "space-around", gap: 8 },
  connectorFeature: { flex: 1, alignItems: "center", gap: 5, paddingVertical: 8 },
  connectorFeatureText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  flowVisual: { gap: 8 },
  flowStep: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 10, padding: 11, borderWidth: 1, borderRadius: 8 },
  flowNumber: { width: 20, color: colors.primary, fontSize: 15, fontWeight: "900", textAlign: "center" },
  flowNumberDark: { color: "#FFFFFF" },
  flowStepIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.highlight },
  flowStepIconDark: { backgroundColor: "rgba(255,255,255,0.16)" },
  flowStepTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  flowStepDetail: { marginTop: 2, color: colors.mutedText, fontSize: 11, lineHeight: 15, fontWeight: "700" },
  flowLink: { flexDirection: "row", alignItems: "center", gap: 8 },
  flowLinkLine: { flex: 1, height: 1, backgroundColor: colors.cardBorder },
  flowLinkLabel: { maxWidth: "70%", color: colors.mutedText, fontSize: 9, fontWeight: "800", textAlign: "center" },
  choiceSection: { gap: 9, paddingTop: 2 },
  choiceTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  choiceRow: { flexDirection: "row", gap: 7 },
  choiceHelp: { color: colors.mutedText, fontSize: 11, fontWeight: "700", textAlign: "center" },
  intentChoice: { flex: 1, minHeight: 82, alignItems: "center", justifyContent: "center", gap: 5, padding: 7, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, backgroundColor: colors.card },
  intentChoiceActive: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.highlight },
  intentIcon: { width: 35, height: 35, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.background },
  intentIconActive: { backgroundColor: colors.primary },
  intentLabel: { color: colors.text, fontSize: 11, fontWeight: "900" },
  intentRadio: { width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: colors.cardBorder, backgroundColor: "#FFFFFF" },
  intentRadioActive: { borderWidth: 4, borderColor: colors.primary },
  footer: { gap: 4, paddingHorizontal: 16, paddingTop: 9, paddingBottom: 11, borderTopWidth: 1, borderTopColor: colors.cardBorder, backgroundColor: colors.card },
  footerRow: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  navButton: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, backgroundColor: colors.card },
  navButtonDisabled: { opacity: 0.45 },
  navButtonNext: { borderColor: colors.primary, backgroundColor: colors.primary },
  dots: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.cardBorder },
  dotActive: { width: 24, backgroundColor: colors.primary },
  finishButton: { minWidth: 96, height: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 13, borderRadius: 8, backgroundColor: colors.primary },
  finishButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  swipeHint: { color: colors.mutedText, fontSize: 10, fontWeight: "700", textAlign: "center" },
  error: { color: colors.danger, fontSize: 12, fontWeight: "800", textAlign: "center" },
  disabled: { opacity: 0.55 },
});

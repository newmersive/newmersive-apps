import React from "react";
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ExternalLink } from "lucide-react-native";

import type { RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Legal">;

const privacySections = [
  [
    "Estado y responsable",
    "Allwain es un proyecto de NEWMERSIVE operado por Francisco Rausell Soler, NIF 24393154K, con domicilio en Calle Diezmo 8, 46134 Foios, Valencia, España. El contacto de privacidad es newmersive@gmail.com. Los pagos reales continúan desactivados durante el piloto.",
  ],
  [
    "Qué datos tratamos",
    "Cuenta y sesiones; perfiles de Comprador, Vendedor y Conector; invitaciones y red; datos profesionales y fiscales; búsquedas, productos, ofertas, pedidos, pagos y entregas; mensajes y videollamadas iniciadas; opiniones e incidencias; fotografías elegidas; ubicación precisa autorizada; y registros técnicos de seguridad y auditoría.",
  ],
  [
    "Para qué y con qué base",
    "Usamos los datos para prestar la función solicitada y ejecutar operaciones; cumplir obligaciones fiscales, de consumo, seguridad de producto o trazabilidad; y proteger el servicio frente a fraude y accesos no autorizados. La base aplicable puede ser el contrato o medidas previas, una obligación legal, el interés legítimo de seguridad o tu consentimiento para funciones opcionales.",
  ],
  [
    "Guía pública y Guía de la app",
    "La Guía pública no abre cuentas ni ejecuta operaciones: procesa solo la pregunta, puede enviarla a OpenAI y no debes incluir datos personales. La Guía de la app es distinta: puede recibir contexto e historial y preparar acciones. Ninguna propuesta compra, paga o publica sin los pasos de confirmación previstos.",
  ],
  [
    "Imágenes, ubicación y llamadas",
    "Allwain recibe la foto que capturas o eliges para OCR o IA; tú revisas el resultado. Si autorizas ubicación puede recibir coordenadas precisas para proximidad o entrega, pero no las publica como directorio. Una videollamada transmite audio y vídeo mediante el proveedor y registra los hitos técnicos necesarios.",
  ],
  [
    "Proveedores y transferencias",
    "Según la función pueden intervenir IONOS, Stripe, Google, Apple, OpenAI, Expo y tiendas, LiveKit, Sendcloud, operadores logísticos o correo. Solo reciben lo necesario. Algunos actúan bajo sus propias obligaciones y pueden implicar transferencias internacionales con las garantías aplicables.",
  ],
  [
    "Medición opcional y almacenamiento",
    "Allwain no integra publicidad ni vende datos personales. Google Analytics 4 y Firebase Analytics permanecen apagados hasta que permites la medición. Si aceptas, reciben pantallas y acciones técnicas para mejorar el producto durante un máximo configurado de 2 meses, nunca nombres, emails, direcciones, mensajes, búsquedas, texto libre ni ubicación GPS. Puedes retirar el permiso en Perfil. La app mantiene aparte el almacenamiento estrictamente necesario para sesión y funciones solicitadas.",
  ],
  [
    "Seguridad",
    "La conexión pública usa HTTPS/TLS, políticas de seguridad del navegador, sesiones limitadas y revocables, permisos por función, validación de archivos y una cronología técnica de acciones relevantes. Ningún servicio conectado a Internet puede eliminar todo riesgo.",
  ],
  [
    "Conservación y eliminación",
    "Al eliminar la cuenta se revocan accesos y se eliminan, bloquean o desvinculan datos que ya no sean necesarios. Pedidos, pagos, fiscalidad, trazabilidad, mensajes, fraude, incidencias y auditoría pueden conservarse durante los plazos legales o de reclamación, con uso restringido. Las copias rotatorias actuales pueden conservar datos hasta 30 días.",
  ],
  [
    "Tus derechos",
    "Puedes solicitar acceso, rectificación, oposición, limitación, portabilidad o supresión, y retirar un consentimiento. Responderemos con carácter general en un mes. También puedes reclamar ante la Agencia Española de Protección de Datos.",
  ],
  [
    "Edad y contacto",
    "La contratación está reservada a mayores de 18 años. Para privacidad, derechos o preguntas escribe a newmersive@gmail.com. La versión completa y vigente está en allwain.es/privacidad/.",
  ],
];

const termsSections = [
  [
    "Piloto",
    "Allwain está en pruebas. Comprar, vender, repartir o cobrar con dinero real sigue desactivado hasta completar la validación fiscal, contractual, de seguridad y operativa de las condiciones comerciales definitivas.",
  ],
  [
    "Qué es Allwain",
    "El Comprador publica una necesidad; los Vendedores compatibles pueden proponer; el Comprador compara y decide. Una petición o conversación no obliga a comprar. Salvo que el pedido diga “Vendido por Allwain”, el vendedor identificado será quien vende jurídicamente.",
  ],
  [
    "Contrato y clasificación",
    "Antes de un pago real se mostrarán vendedor, condición profesional o particular, producto, cantidad, entrega, impuestos, total y derechos aplicables. Solo una acción expresa con obligación de pago podrá cerrar la compra. Las propuestas podrán ordenarse por precio, valoración o fecha; nadie paga para aparecer primero.",
  ],
  [
    "Vendedores, fiscalidad y productos",
    "El Vendedor debe identificarse, declarar su condición, mantener datos fiscales correctos, controlar stock y cumplir consumo, seguridad, sanidad y demás normas aplicables. Si faltan datos para calcular impuestos o documentos, el automatismo debe detenerse y pasar a revisión.",
  ],
  [
    "Alimentos y trazabilidad",
    "Quien ofrezca alimentos debe mostrar la información obligatoria y conservar operador, origen, lote, alérgenos, conservación y cantidad cuando correspondan. Debe colaborar en alertas y retiradas. Las naranjas de Foios son producto real del piloto; la primera venta y su resultado siguen pendientes.",
  ],
  [
    "Pagos y tarifa",
    "Cuando se activen, Stripe procesará pagos y transferencias. La referencia técnica actual reserva a Allwain el 10 % del producto en ventas marketplace, descontado de la liquidación del Vendedor; impuestos, entrega, costes, reembolsos y disputas se separan. No existen cobros reales activos.",
  ],
  [
    "Conector, red e ingresos previstos",
    "El modelo de expansión será de boca a boca. Se prevé reconocer operaciones válidas de clientes o negocios incorporados y compensar entregas Km 0 aceptadas. Hoy el QR registra atribución, pero no paga comisión recurrente. Solo está programada una referencia de 2 € por entrega local más el 2 % de la tarifa Allwain, todavía sin cobros. No se paga por reclutar, no hay niveles y no se garantizan ingresos.",
  ],
  [
    "Entrega y responsabilidad",
    "El Conector elige si acepta una ruta, protege las direcciones y responde de la custodia que asume y de confirmar hitos con veracidad. El Vendedor responde de producto, preparación y conformidad; Allwain, de sus funciones tecnológicas y de las ventas directas que identifique.",
  ],
  [
    "Desistimiento e incidencias",
    "El consumidor que compra a un profesional dispone con carácter general de 14 días desde la recepción, salvo una excepción legal informada antes de pagar, como ciertos bienes que se deterioran o caducan rápidamente. Esto no elimina derechos por producto defectuoso, inseguro o no conforme.",
  ],
  [
    "Evidencia y seguridad",
    "Allwain conserva una cronología técnica encadenada para detectar alteraciones y reconstruir acciones. No es blockchain, acta notarial, firma cualificada ni prueba de que todo dato introducido sea verdadero. Se prohíben fraude, suplantación y cualquier intento de eludir permisos, seguridad o pagos.",
  ],
  [
    "Cuenta y soporte",
    "La eliminación compartida de Newmersive ID puede afectar a otras aplicaciones y la ruta automática exige cerrar operaciones abiertas. Para soporte, reclamaciones o seguridad escribe a newmersive@gmail.com. La versión completa está en allwain.es/terminos/.",
  ],
];

export default function LegalScreen({ route }: Props) {
  const privacy = route.params.document === "privacy";
  const sections = privacy ? privacySections : termsSections;
  const documentUrl = privacy
    ? "https://allwain.es/privacidad/"
    : "https://allwain.es/terminos/";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.heading}>
        <Text style={styles.kicker}>VERSIÓN PILOTO 2026-09-06</Text>
        <Text style={styles.title}>{privacy ? "Privacidad" : "Condiciones de uso"}</Text>
        <Text style={styles.updated}>Revisado el 6 de septiembre de 2026 · Pagos reales desactivados</Text>
      </View>
      <View style={styles.webLinks}>
        <TouchableOpacity style={styles.webLink} onPress={() => void Linking.openURL(documentUrl)}>
          <ExternalLink size={16} color={colors.primary} />
          <Text style={styles.webLinkText}>Versión completa</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.webLink} onPress={() => void Linking.openURL("https://allwain.es/seguridad/")}>
          <ExternalLink size={16} color={colors.primary} />
          <Text style={styles.webLinkText}>Seguridad</Text>
        </TouchableOpacity>
      </View>
      {sections.map(([title, body]) => (
        <View key={title} style={styles.section}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48, gap: 18, maxWidth: 760, width: "100%", alignSelf: "center" },
  backButton: { minHeight: 42, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 7 },
  backText: { color: colors.text, fontWeight: "800" },
  heading: { gap: 5 },
  kicker: { color: colors.primary, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 28, fontWeight: "900", letterSpacing: -0.7 },
  updated: { color: colors.mutedText, fontWeight: "600", lineHeight: 19 },
  webLinks: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  webLink: { minHeight: 42, paddingHorizontal: 13, borderRadius: 8, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", gap: 7 },
  webLinkText: { color: colors.primary, fontWeight: "900" },
  section: { gap: 6 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
  body: { color: colors.mutedText, fontSize: 15, lineHeight: 23, fontWeight: "500" },
});

import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BigActionButton } from "./design-system";
import type { AllwainOffer } from "../config/api";
import type { CatalogEditDraft } from "../utils/offerManagement";
import { catalogTermsLocked } from "../utils/offerManagement";
import { useAppTranslation } from "../i18n/useAppTranslation";
import { offerManagementCopy } from "../screens/Offers/offerManagementCopy";
import { colors } from "../theme/colors";

export default function CatalogOfferEditor({ offer, draft, busy, error, onChange, onClose, onSave }: {
  offer: AllwainOffer | null; draft: CatalogEditDraft | null; busy: boolean; error: string | null;
  onChange: (patch: Partial<CatalogEditDraft>) => void; onClose: () => void; onSave: () => void;
}) {
  const { locale } = useAppTranslation();
  const c = offerManagementCopy(locale);
  const insets = useSafeAreaInsets();
  const [viewportHeight,setViewportHeight]=useState<number | undefined>();
  useEffect(()=>{
    if(Platform.OS!=="web" || !offer) return;
    const host=globalThis as any;
    const update=()=>setViewportHeight(host.visualViewport?.height || host.innerHeight);
    update();host.addEventListener?.("resize",update);host.visualViewport?.addEventListener("resize",update);
    return()=>{host.removeEventListener?.("resize",update);host.visualViewport?.removeEventListener("resize",update);};
  },[offer?.id]);
  if (!offer || !draft) return null;
  const locked = catalogTermsLocked(offer);
  const field = (key: keyof CatalogEditDraft, label: string, options: { numeric?: boolean; multiline?: boolean; locked?: boolean; maximum?: number } = {}) => <View key={key} style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput testID={`catalog-edit-${key}`} accessibilityLabel={label} style={[styles.input, options.multiline && { minHeight: 88 }, options.locked && { opacity: .6 }]}
      value={draft[key]} editable={!busy && !options.locked} multiline={options.multiline} maxLength={options.maximum}
      keyboardType={options.numeric ? "decimal-pad" : "default"} onChangeText={value => onChange({ [key]: value })} />
  </View>;
  return <Modal visible transparent={false} animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={[styles.screen,{direction:locale==="ar"?"rtl":"ltr"},viewportHeight?{height:viewportHeight,maxHeight:viewportHeight,flexBasis:viewportHeight,flexGrow:0,flexShrink:0}:undefined]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined} style={styles.screen}>
        <View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>{c.edit}</Text><Text style={styles.help}>{c.terms}</Text></View>
        <ScrollView testID="catalog-edit-scroll" style={{flex:1,minHeight:0}} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          {field("title",c.title,{maximum:240})}
          {field("description",c.description,{multiline:true,maximum:10000})}
          {field("price",`${c.price} (${offer.currency || "EUR"})`,{numeric:true})}
          {field("unit",c.unit,{locked,maximum:80})}
          {field("category",c.category,{locked,maximum:80})}
          {field("subcategory",c.subcategory,{locked,maximum:80})}
          <Text style={styles.help}>{locked ? c.locked : c.identity}</Text>
          {field("locationLabel",c.location,{maximum:240})}
          {field("deliveryEstimate",c.delivery,{multiline:true,maximum:600})}
          {field("shippingWeightKgPerUnit",c.weight,{numeric:true})}
          <View style={styles.switchRow}><Text style={styles.label}>{c.preorder}</Text><Switch accessibilityLabel={c.preorder} value={draft.saleMode === "preorder"} disabled={busy || locked} onValueChange={value => onChange({saleMode:value ? "preorder" : "immediate"})} /></View>
          {draft.saleMode === "preorder" ? field("preorderChargeDeadlineAt",c.date,{locked,maximum:40}) : null}
          <Text style={styles.help}>{c.expiry}</Text>
        </ScrollView>
        <View testID="catalog-edit-footer" style={[styles.footer,{paddingBottom:Math.max(12,insets.bottom)}]}>
          {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
          <BigActionButton label={c.save} onPress={onSave} busy={busy} disabled={busy} tone="dark" />
          <BigActionButton label={c.cancel} onPress={onClose} disabled={busy} tone="light" />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.background},heading:{padding:18,gap:8,borderBottomWidth:1,borderColor:colors.cardBorder},title:{fontSize:24,fontWeight:"800",color:colors.text},
  help:{color:colors.mutedText,fontSize:14,lineHeight:21},content:{padding:18,gap:16,width:"100%",maxWidth:680,alignSelf:"center"},field:{gap:6},label:{fontSize:15,fontWeight:"700",color:colors.text},
  input:{borderWidth:1,borderColor:colors.cardBorder,borderRadius:12,padding:12,minHeight:48,backgroundColor:colors.card,color:colors.text,fontSize:16},switchRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12},
  footer:{padding:12,gap:8,borderTopWidth:1,borderColor:colors.cardBorder,backgroundColor:colors.card},error:{color:colors.danger,fontSize:14,lineHeight:20},
});

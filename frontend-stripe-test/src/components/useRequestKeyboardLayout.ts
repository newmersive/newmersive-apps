import { useEffect, useState } from "react";
import { Keyboard, Platform, type KeyboardAvoidingViewProps } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Request screens sit below the native-stack header. KeyboardAvoidingView's
// local frame omits that header, while keyboard coordinates include it.
// Full-screen modals do not use this offset.
export function useRequestKeyboardLayout(minimumBottomPadding = 12) {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(() => Platform.OS !== "web" && Keyboard.isVisible());

  useEffect(() => {
    if (Platform.OS === "web") return;
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const behavior: KeyboardAvoidingViewProps["behavior"] = Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined;
  return {
    keyboardAvoidingProps: { behavior, keyboardVerticalOffset: Platform.OS === "web" ? 0 : headerHeight },
    // Once above the keyboard, its own window already covers the system bar.
    footerPaddingBottom: Math.max(minimumBottomPadding, keyboardVisible ? 0 : insets.bottom),
  };
}

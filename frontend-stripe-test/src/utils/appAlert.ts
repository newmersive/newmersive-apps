import { Alert as NativeAlert, Platform } from "react-native";
import type { AlertButton, AlertOptions } from "react-native";

export type AppAlertRequest = {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
  options?: AlertOptions;
};

let nextId = 0;
let queue: AppAlertRequest[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function subscribeAppAlert(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getAppAlert() {
  return queue[0] ?? null;
}

// Remove before invoking the callback: a double click cannot repeat an operation,
// and a callback may safely open another confirmation.
function takeAppAlert(id: number) {
  const current = getAppAlert();
  if (!current || current.id !== id) return null;
  queue = queue.slice(1);
  notify();
  return current;
}

export function chooseAppAlert(id: number, buttonIndex: number) {
  const current = getAppAlert();
  if (!current || current.id !== id || !current.buttons[buttonIndex]) return;
  const request = takeAppAlert(id);
  request?.buttons[buttonIndex].onPress?.();
}

export function dismissAppAlert(id: number) {
  const request = takeAppAlert(id);
  if (!request) return;
  // Escape/back only dismisses. It must never accept a destructive action.
  request.buttons.find((button) => button.style === "cancel")?.onPress?.();
  request.options?.onDismiss?.();
}

export const AppAlert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
    if (Platform.OS !== "web") {
      NativeAlert.alert(title, message, buttons, options);
      return;
    }
    queue = [...queue, {
      id: ++nextId,
      title,
      message,
      buttons: buttons?.length ? buttons : [{ text: "Entendido" }],
      options,
    }];
    notify();
  },
};

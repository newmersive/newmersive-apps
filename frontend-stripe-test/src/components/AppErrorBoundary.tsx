import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { colors } from "../theme/colors";

type Props = {
  children: React.ReactNode;
  onResetSession: () => void | Promise<void>;
};

type State = {
  error: Error | null;
  recoveryKey: number;
  resetting: boolean;
};

export default class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, recoveryKey: 0, resetting: false };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Allwain render recovery", error, info.componentStack);
  }

  private retry = () => {
    this.setState((state) => ({
      error: null,
      recoveryKey: state.recoveryKey + 1,
      resetting: false,
    }));
  };

  private resetSession = async () => {
    if (this.state.resetting) return;
    this.setState({ resetting: true });
    try {
      await this.props.onResetSession();
      this.retry();
    } catch {
      this.setState({ resetting: false });
    }
  };

  render() {
    if (!this.state.error) {
      return (
        <React.Fragment key={this.state.recoveryKey}>
          {this.props.children}
        </React.Fragment>
      );
    }

    return (
      <View style={styles.screen}>
        <Image
          source={require("../assets/logos/Logotipo_Allwain_02.png")}
          resizeMode="contain"
          style={styles.logo}
          accessibilityLabel="Allwain"
        />
        <Text style={styles.title}>No hemos podido abrir esta pantalla</Text>
        <Text style={styles.body}>
          Tus datos siguen guardados. Puedes reintentar o volver a identificarte.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={this.retry}>
          <Text style={styles.primaryText}>Reintentar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => void this.resetSession()}
          disabled={this.state.resetting}
        >
          <Text style={styles.secondaryText}>
            {this.state.resetting ? "Cerrando sesión..." : "Volver a entrar"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    padding: 24,
    gap: 12,
  },
  logo: { width: 180, height: 48, marginBottom: 8 },
  title: {
    color: colors.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
    textAlign: "center",
  },
  body: {
    maxWidth: 420,
    color: colors.mutedText,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
    textAlign: "center",
  },
  primaryButton: {
    width: "100%",
    maxWidth: 360,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: colors.button,
    marginTop: 8,
  },
  primaryText: { color: colors.buttonText, fontSize: 15, fontWeight: "900" },
  secondaryButton: {
    width: "100%",
    maxWidth: 360,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  secondaryText: { color: colors.text, fontSize: 14, fontWeight: "800" },
});

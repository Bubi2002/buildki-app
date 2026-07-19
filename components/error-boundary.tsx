/**
 * protoKI – Error Boundary
 * 
 * Catches JavaScript errors in child components and displays
 * a fallback UI instead of crashing the app.
 */
import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    
    // Log to console for debugging
    console.error("[ErrorBoundary] Caught error:", error.message);
    console.error("[ErrorBoundary] Component stack:", errorInfo.componentStack);

    // Call optional error handler
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <View style={styles.content}>
            <MaterialIcons name="error-outline" size={48} color="#EF4444" />
            <Text style={styles.title}>Etwas ist schiefgelaufen</Text>
            <Text style={styles.subtitle}>
              Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.
            </Text>

            {__DEV__ && this.state.error && (
              <ScrollView style={styles.errorBox} contentContainerStyle={{ padding: 12 }}>
                <Text style={styles.errorTitle}>{this.state.error.name}</Text>
                <Text style={styles.errorMessage}>{this.state.error.message}</Text>
                {this.state.errorInfo?.componentStack && (
                  <Text style={styles.errorStack}>
                    {this.state.errorInfo.componentStack.slice(0, 500)}
                  </Text>
                )}
              </ScrollView>
            )}

            <Pressable
              onPress={this.handleReset}
              style={({ pressed }) => [styles.retryBtn, { opacity: pressed ? 0.8 : 1 }]}
            >
              <MaterialIcons name="refresh" size={20} color="#fff" />
              <Text style={styles.retryText}>Erneut versuchen</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

/**
 * Lightweight error boundary for individual screens
 */
export class ScreenErrorBoundary extends Component<
  { children: ReactNode; screenName?: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode; screenName?: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[Screen: ${this.props.screenName || "unknown"}] Error:`, error.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.screenError}>
          <MaterialIcons name="warning" size={32} color="#FF9800" />
          <Text style={styles.screenErrorTitle}>
            {this.props.screenName ? `Fehler in "${this.props.screenName}"` : "Bildschirmfehler"}
          </Text>
          <Text style={styles.screenErrorMsg}>
            {this.state.error?.message || "Unbekannter Fehler"}
          </Text>
          <Pressable
            onPress={() => this.setState({ hasError: false, error: null })}
            style={({ pressed }) => [styles.smallRetryBtn, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={styles.smallRetryText}>Neu laden</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#151718",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  content: {
    alignItems: "center",
    maxWidth: 320,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#ECEDEE",
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#9BA1A6",
    textAlign: "center",
    lineHeight: 20,
  },
  errorBox: {
    maxHeight: 200,
    width: "100%",
    backgroundColor: "#1e2022",
    borderRadius: 4,
    marginTop: 12,
  },
  errorTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#EF4444",
    marginBottom: 4,
  },
  errorMessage: {
    fontSize: 12,
    color: "#ECEDEE",
    marginBottom: 8,
  },
  errorStack: {
    fontSize: 10,
    color: "#9BA1A6",
    fontFamily: "monospace",
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#00B0FF",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 4,
    marginTop: 16,
  },
  retryText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  screenError: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 8,
  },
  screenErrorTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ECEDEE",
  },
  screenErrorMsg: {
    fontSize: 13,
    color: "#9BA1A6",
    textAlign: "center",
  },
  smallRetryBtn: {
    backgroundColor: "#334155",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    marginTop: 8,
  },
  smallRetryText: {
    color: "#ECEDEE",
    fontSize: 13,
    fontWeight: "500",
  },
});

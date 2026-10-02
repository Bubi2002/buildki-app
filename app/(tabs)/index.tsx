import { Redirect } from "expo-router";

/**
 * The (tabs) group index. Opening the app (or any `router.replace("/(tabs)")`
 * from login/onboarding) resolves to this screen, so it simply forwards to the
 * Projekte tab — the real start point (which then asks to pick/create a project).
 * The old AI-Workbench home was retired here.
 */
export default function TabsIndexRedirect() {
  return <Redirect href="/(tabs)/projects" />;
}

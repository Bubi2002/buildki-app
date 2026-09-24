import { useRouter } from "expo-router";
import { StartChooserContent } from "@/components/start-chooser-content";

/**
 * Startup chooser shown on every cold app start (triggered from the Werkzeuge
 * tab). Lets the user jump straight into the main things they do. The same
 * content is also available permanently as the Start tab.
 */
export default function StartChooserScreen() {
  const router = useRouter();
  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)" as any);
  };

  return <StartChooserContent onSkip={close} />;
}

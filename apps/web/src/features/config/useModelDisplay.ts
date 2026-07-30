import { useFrontierModels, usePlatformDefaultModel } from "../../api/hooks";
import { PROVIDER_LABELS } from "./ModelBrowser";

/** Resolves a namespaced model id (or null, meaning "platform default") to a
 * friendly "{Provider} {Model}" label, looking it up in the frontier catalog
 * and — when null — the actual model the platform falls back to (not just
 * the words "platform default"). */
export function useModelDisplay() {
  const { data: frontierModels } = useFrontierModels();
  const { data: platformDefault } = usePlatformDefaultModel();

  function describe(id: string | null): string {
    if (!id) {
      if (!platformDefault) return "Platform default";
      return `${PROVIDER_LABELS[platformDefault.provider] ?? platformDefault.provider} ${platformDefault.label}`;
    }
    const frontierMatch = frontierModels?.find((m) => m.id === id);
    if (frontierMatch) {
      return `${PROVIDER_LABELS[frontierMatch.provider] ?? frontierMatch.provider} ${frontierMatch.label}`;
    }
    if (id.startsWith("ollama:")) {
      return `Ollama ${id.slice("ollama:".length)}`;
    }
    return id;
  }

  return { describe };
}

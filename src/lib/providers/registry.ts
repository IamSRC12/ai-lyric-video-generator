export type ProviderId = "groq" | "gemini" | "gemma";
export type ProviderCapability = "timestamp-transcription" | "alignment" | "text-repair";
export interface ProviderDefinition { id: ProviderId; label: string; capabilities: readonly ProviderCapability[]; defaultModel: string; note: string }
export const PROVIDERS: readonly ProviderDefinition[] = [
  { id: "groq", label: "Groq", capabilities: ["timestamp-transcription", "alignment", "text-repair"], defaultModel: "whisper-large-v3-turbo", note: "Required for timestamp transcription." },
  { id: "gemini", label: "Gemini", capabilities: ["alignment", "text-repair"], defaultModel: "gemini-2.0-flash", note: "Optional alignment and text repair; not timestamp ASR." },
  { id: "gemma", label: "Gemma", capabilities: ["text-repair"], defaultModel: "gemma-3-27b-it", note: "Text repair only; Gemma has no timestamp transcription." },
] as const;
export function getProvider(id: string): ProviderDefinition | undefined { return PROVIDERS.find((provider) => provider.id === id); }
export function supports(id: string, capability: ProviderCapability): boolean { return Boolean(getProvider(id)?.capabilities.includes(capability)); }
export function requireCapability(id: string, capability: ProviderCapability): ProviderDefinition {
  const provider = getProvider(id);
  if (!provider) throw new Error(`Unknown provider: ${id}`);
  if (!provider.capabilities.includes(capability)) throw new Error(`${provider.label} does not support ${capability}. Timestamp transcription currently requires Groq.`);
  return provider;
}
export function publicProviderStatus(configured: Partial<Record<ProviderId, boolean>>) {
 return PROVIDERS.map(({ id, label, capabilities, defaultModel, note }) => ({ id, label, capabilities, defaultModel, note, configured: Boolean(configured[id]) }));
}
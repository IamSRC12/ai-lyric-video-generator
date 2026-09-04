import type { ProviderId } from "./registry";
export async function generateGoogleText(input: { provider: Extract<ProviderId, "gemini" | "gemma">; apiKey: string; model: string; prompt: string }): Promise<string> {
 const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent?key=${encodeURIComponent(input.apiKey)}`;
 const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: input.prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0 } }) });
 if (!response.ok) throw new Error(`${input.provider} request failed (${response.status})`);
 const body = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
 return body.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}
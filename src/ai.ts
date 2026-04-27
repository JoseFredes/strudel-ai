import { invoke } from '@tauri-apps/api/core';

export async function generatePattern(
  prompt: string,
  currentCode: string,
  apiKey: string,
  model = 'gpt-4o',
): Promise<string> {
  return await invoke<string>('generate_pattern', { prompt, currentCode, apiKey, model });
}

export async function explainPattern(
  code: string,
  apiKey: string,
  model = 'gpt-4o',
): Promise<string> {
  return await invoke<string>('explain_pattern', { code, apiKey, model });
}

export async function generateVariations(
  prompt: string,
  currentCode: string,
  apiKey: string,
  model = 'gpt-4o',
): Promise<[string, string, string]> {
  return await invoke<[string, string, string]>('generate_variations', {
    prompt, currentCode, apiKey, model,
  });
}

export type Suggestion = { label: string; prompt: string };

export async function suggestDirections(
  code: string,
  apiKey: string,
  model = 'gpt-4o',
): Promise<Suggestion[]> {
  return await invoke<Suggestion[]>('suggest_directions', { code, apiKey, model });
}

export async function savePatch(content: string): Promise<string | null> {
  return await invoke<string | null>('save_patch_dialog', { content });
}

export async function openPatch(): Promise<{ name: string; code: string } | null> {
  const result = await invoke<[string, string] | null>('open_patch_dialog');
  if (!result) return null;
  return { name: result[0], code: result[1] };
}

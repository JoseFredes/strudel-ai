import { invoke } from '@tauri-apps/api/core';

export async function generatePattern(
  prompt: string,
  currentCode: string,
  apiKey: string,
  model = 'gpt-4o',
): Promise<string> {
  return await invoke<string>('generate_pattern', {
    prompt,
    currentCode,
    apiKey,
    model,
  });
}

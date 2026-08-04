import { getApiKey } from '@/infrastructure/storage/ApiKeyStorageService';

export type TranslationProvider = 'groq' | 'deepl';
export type TranslationSourceLanguage =
  | 'auto'
  | 'EN'
  | 'KO'
  | 'JA'
  | 'ZH'
  | 'DE'
  | 'FR'
  | 'ES'
  | 'IT'
  | 'PT'
  | 'RU';
export type TranslationTargetLanguage = 'EN' | 'ZH-HANS';

export interface TranslationPreferences {
  provider: TranslationProvider;
  sourceLanguage: TranslationSourceLanguage;
  targetLanguage: TranslationTargetLanguage;
}

interface TranslationRequest extends TranslationPreferences {
  text: string;
  serverUrl: string;
}

interface TranslationResponse {
  text?: string;
  detected_source_language?: string | null;
  error?: string;
}

const STORAGE_KEY = 'comfy-mobile-translation-preferences';

export const DEFAULT_TRANSLATION_PREFERENCES: TranslationPreferences = {
  provider: 'groq',
  sourceLanguage: 'auto',
  targetLanguage: 'EN'
};

export class TranslationServiceError extends Error {
  constructor(
    public readonly code: 'missing-key' | 'missing-server' | 'request-failed',
    message: string
  ) {
    super(message);
    this.name = 'TranslationServiceError';
  }
}

export const loadTranslationPreferences = (): TranslationPreferences => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_TRANSLATION_PREFERENCES;

    const value = JSON.parse(stored) as Partial<TranslationPreferences>;
    return {
      provider: value.provider === 'deepl' ? 'deepl' : 'groq',
      sourceLanguage: value.sourceLanguage || 'auto',
      targetLanguage: value.targetLanguage === 'ZH-HANS' ? 'ZH-HANS' : 'EN'
    };
  } catch {
    return DEFAULT_TRANSLATION_PREFERENCES;
  }
};

export const saveTranslationPreferences = (preferences: TranslationPreferences): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
};

export const translateText = async ({
  text,
  serverUrl,
  provider,
  sourceLanguage,
  targetLanguage
}: TranslationRequest): Promise<{ text: string; detectedSourceLanguage: string | null }> => {
  const apiKey = await getApiKey(provider);
  if (!apiKey) {
    throw new TranslationServiceError('missing-key', `No ${provider} API key is configured.`);
  }

  const normalizedServerUrl = serverUrl.trim().replace(/\/$/, '');
  if (!normalizedServerUrl) {
    throw new TranslationServiceError('missing-server', 'No ComfyUI server is configured.');
  }

  let response: Response;
  try {
    response = await fetch(`${normalizedServerUrl}/comfymobile/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        api_key: apiKey,
        text,
        source_language: sourceLanguage,
        target_language: targetLanguage
      }),
      signal: AbortSignal.timeout(45_000)
    });
  } catch (error) {
    throw new TranslationServiceError(
      'request-failed',
      error instanceof Error ? error.message : 'Translation request failed.'
    );
  }

  let data: TranslationResponse = {};
  try {
    data = await response.json() as TranslationResponse;
  } catch {
    // Keep the provider response opaque when it is not valid JSON.
  }

  if (!response.ok || !data.text) {
    throw new TranslationServiceError(
      'request-failed',
      data.error || `Translation request failed (${response.status}).`
    );
  }

  return {
    text: data.text,
    detectedSourceLanguage: data.detected_source_language || null
  };
};

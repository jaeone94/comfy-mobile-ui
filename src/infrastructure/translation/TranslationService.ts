import { getApiKey } from '@/infrastructure/storage/ApiKeyStorageService';
import { comfyAuthenticatedFetch } from '@/infrastructure/auth/ComfyAuthService';

export type TranslationProvider = 'groq' | 'deepl' | 'argos';
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
export type TranslationTargetLanguage =
  | 'EN'
  | 'ZH-HANS'
  | 'KO'
  | 'JA'
  | 'DE'
  | 'FR'
  | 'ES'
  | 'IT'
  | 'PT'
  | 'RU';

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
  code?: string;
  required_pairs?: string[];
}

export interface LocalTranslationStatus {
  engine_available: boolean;
  engine_error: string | null;
  detector_available: boolean;
  simplifier_available: boolean;
  packages_directory: string;
  installed_pairs: string[];
  supported_languages: string[];
  engine_install: LocalEngineInstallStatus;
}

export interface LocalEngineInstallStatus {
  state: 'idle' | 'running' | 'succeeded' | 'failed' | 'restart_required';
  message: string | null;
  error: string | null;
  restart_required: boolean;
  started_at: number | null;
  finished_at: number | null;
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
    message: string,
    public readonly providerCode?: string,
    public readonly requiredPairs: string[] = [],
    public readonly detectedSourceLanguage: string | null = null
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
      provider: value.provider === 'deepl' || value.provider === 'argos' ? value.provider : 'groq',
      sourceLanguage: value.sourceLanguage || 'auto',
      targetLanguage: isTranslationTargetLanguage(value.targetLanguage) ? value.targetLanguage : 'EN'
    };
  } catch {
    return DEFAULT_TRANSLATION_PREFERENCES;
  }
};

export const saveTranslationPreferences = (preferences: TranslationPreferences): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
};

const normalizeServerUrl = (serverUrl: string): string => {
  const normalized = serverUrl.trim().replace(/\/$/, '');
  if (!normalized) {
    throw new TranslationServiceError('missing-server', 'No ComfyUI server is configured.');
  }
  return normalized;
};

export const translateText = async ({
  text,
  serverUrl,
  provider,
  sourceLanguage,
  targetLanguage
}: TranslationRequest): Promise<{ text: string; detectedSourceLanguage: string | null }> => {
  const apiKey = provider === 'argos' ? null : await getApiKey(provider);
  if (provider !== 'argos' && !apiKey) {
    throw new TranslationServiceError('missing-key', `No ${provider} API key is configured.`);
  }

  const normalizedServerUrl = normalizeServerUrl(serverUrl);
  let response: Response;
  try {
    response = await comfyAuthenticatedFetch(`${normalizedServerUrl}/comfymobile/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        api_key: apiKey || undefined,
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
      data.error || `Translation request failed (${response.status}).`,
      data.code,
      data.required_pairs || [],
      data.detected_source_language || null
    );
  }

  return {
    text: data.text,
    detectedSourceLanguage: data.detected_source_language || null
  };
};

export const getLocalTranslationStatus = async (serverUrl: string): Promise<LocalTranslationStatus> => {
  const normalizedServerUrl = normalizeServerUrl(serverUrl);
  const response = await comfyAuthenticatedFetch(`${normalizedServerUrl}/comfymobile/api/translation/local/status`, {
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) {
    throw new TranslationServiceError('request-failed', `Local translation status failed (${response.status}).`);
  }
  return await response.json() as LocalTranslationStatus;
};

export const startLocalTranslationEngineInstall = async (
  serverUrl: string
): Promise<LocalEngineInstallStatus> => {
  const normalizedServerUrl = normalizeServerUrl(serverUrl);
  const response = await comfyAuthenticatedFetch(
    `${normalizedServerUrl}/comfymobile/api/translation/local/engine/install`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000)
    }
  );
  const data = await response.json() as { error?: string; engine_install?: LocalEngineInstallStatus };
  if (!response.ok || !data.engine_install) {
    throw new TranslationServiceError(
      'request-failed',
      data.error || `Local engine installation failed to start (${response.status}).`
    );
  }
  return data.engine_install;
};

export const installLocalTranslationPairs = async (
  serverUrl: string,
  pairs: string[]
): Promise<string[]> => {
  const normalizedServerUrl = normalizeServerUrl(serverUrl);
  const response = await comfyAuthenticatedFetch(
    `${normalizedServerUrl}/comfymobile/api/translation/local/packages/install`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairs }),
      signal: AbortSignal.timeout(10 * 60_000)
    }
  );
  const data = await response.json() as TranslationResponse & { installed_pairs?: string[] };
  if (!response.ok) {
    throw new TranslationServiceError(
      'request-failed',
      data.error || `Language-pack installation failed (${response.status}).`,
      data.code,
      data.required_pairs || []
    );
  }
  return data.installed_pairs || [];
};

export const requiredLocalTranslationPairs = (
  sourceLanguage: TranslationSourceLanguage,
  targetLanguage: TranslationTargetLanguage
): string[] => {
  if (sourceLanguage === 'auto') return [];
  const source = sourceLanguage.toLowerCase();
  const target = targetLanguage === 'ZH-HANS' ? 'zh' : targetLanguage.toLowerCase();
  if (source === target) return [];
  if (target === 'en') return [`${source}-en`];
  return source === 'en' ? [`en-${target}`] : [`${source}-en`, `en-${target}`];
};

const TRANSLATION_TARGET_LANGUAGES: TranslationTargetLanguage[] = [
  'EN', 'ZH-HANS', 'KO', 'JA', 'DE', 'FR', 'ES', 'IT', 'PT', 'RU'
];

const isTranslationTargetLanguage = (value: unknown): value is TranslationTargetLanguage => (
  TRANSLATION_TARGET_LANGUAGES.includes(value as TranslationTargetLanguage)
);

interface MaskSourceMappingRecord {
  originalPath: string;
  updatedAt: number;
}

const STORAGE_KEY = 'comfy-mobile-ui.mask-source-paths.v1';
const MAX_ENTRIES = 200;

let cachedMappings: Record<string, MaskSourceMappingRecord> | null = null;

const getStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const normalizePath = (path: string | null | undefined): string | null => {
  if (typeof path !== 'string') {
    return null;
  }

  const trimmedPath = path.trim();
  return trimmedPath.length > 0 ? trimmedPath : null;
};

const loadMappings = (): Record<string, MaskSourceMappingRecord> => {
  if (cachedMappings) {
    return cachedMappings;
  }

  const storage = getStorage();
  if (!storage) {
    cachedMappings = {};
    return cachedMappings;
  }

  try {
    const rawMappings = storage.getItem(STORAGE_KEY);
    if (!rawMappings) {
      cachedMappings = {};
      return cachedMappings;
    }

    const parsedMappings = JSON.parse(rawMappings);
    if (!parsedMappings || typeof parsedMappings !== 'object') {
      cachedMappings = {};
      return cachedMappings;
    }

    cachedMappings = Object.fromEntries(
      Object.entries(parsedMappings).filter(([maskedPath, record]) => {
        return (
          typeof maskedPath === 'string' &&
          !!maskedPath &&
          !!record &&
          typeof record === 'object' &&
          typeof (record as MaskSourceMappingRecord).originalPath === 'string' &&
          typeof (record as MaskSourceMappingRecord).updatedAt === 'number'
        );
      })
    ) as Record<string, MaskSourceMappingRecord>;
  } catch {
    cachedMappings = {};
  }

  return cachedMappings;
};

const saveMappings = (mappings: Record<string, MaskSourceMappingRecord>) => {
  cachedMappings = mappings;

  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(mappings));
  } catch {
    // Ignore storage write failures and keep the in-memory cache.
  }
};

export const resolveOriginalMaskSourcePath = (path: string | null | undefined): string | null => {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath) {
    return null;
  }

  const mappings = loadMappings();
  const visitedPaths = new Set<string>([normalizedPath]);
  let resolvedPath = normalizedPath;

  while (mappings[resolvedPath]) {
    const nextPath = normalizePath(mappings[resolvedPath].originalPath);
    if (!nextPath || visitedPaths.has(nextPath)) {
      break;
    }

    visitedPaths.add(nextPath);
    resolvedPath = nextPath;
  }

  return resolvedPath;
};

export const rememberMaskSourcePath = (
  maskedPath: string | null | undefined,
  originalSourcePath: string | null | undefined
) => {
  const normalizedMaskedPath = normalizePath(maskedPath);
  const normalizedOriginalPath = resolveOriginalMaskSourcePath(originalSourcePath) ?? normalizePath(originalSourcePath);

  if (!normalizedMaskedPath || !normalizedOriginalPath || normalizedMaskedPath === normalizedOriginalPath) {
    return;
  }

  const nextMappings = {
    ...loadMappings(),
    [normalizedMaskedPath]: {
      originalPath: normalizedOriginalPath,
      updatedAt: Date.now()
    }
  };

  const prunedMappings = Object.fromEntries(
    Object.entries(nextMappings)
      .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_ENTRIES)
  ) as Record<string, MaskSourceMappingRecord>;

  saveMappings(prunedMappings);
};

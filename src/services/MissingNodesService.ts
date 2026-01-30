import ComfyUIService, {
  CustomNodeListResponse,
  CustomNodeMappingsResponse,
  CustomNodePackInfo,
} from '@/infrastructure/api/ComfyApiClient';
import {
  fetchRegistryNodeVersions,
  fetchRegistryNodesBulk,
  RegistryNodeDetail,
  RegistryNodeVersion,
} from '@/infrastructure/api/ComfyRegistryService';
import { VIRTUAL_NODES } from '@/shared/constants/virtualNodes';
import { IComfyJson } from '@/shared/types/app/IComfyJson';
import type { IObjectInfo } from '@/shared/types/comfy/IComfyObjectInfo';

export type MissingNodeSource = 'registry' | 'github' | 'unknown';

export interface MissingWorkflowNode {
  id: number | string;
  type: string;
  properties?: Record<string, any> | null;
}

export interface MissingNodePackage {
  packId: string;
  source: MissingNodeSource;
  nodeTypes: string[];
  packName?: string;
  description?: string;
  repository?: string;
  latestVersion?: string;
  installedVersion?: string;
  availableVersions: string[];
  isInstalled: boolean;
  isUpdateAvailable: boolean;
  isInstallable: boolean;
  state?: string;
  channel?: string;
  mode?: string;
  files?: string[];
  installType?: string;
}

export interface PackageInstallSelection {
  packId: string;
  selectedVersion: string;
  repository?: string;
  channel?: string;
  mode?: string;
  skipPostInstall?: boolean;
  pip?: string[];
  files?: string[];
  installType?: string;
}

export interface ManagerQueueStatus {
  status: 'in_progress' | 'done';
  totalCount?: number;
  doneCount?: number;
  inProgressCount?: number;
  isProcessing?: boolean;
}

const DEFAULT_CHANNEL = 'default';
const DEFAULT_MODE = 'cache';

interface PackageAccumulator {
  packId: string;
  source: MissingNodeSource;
  nodeTypes: Set<string>;
  detail?: RegistryNodeDetail | null;
  latestVersion?: string;
  repository?: string;
  description?: string;
  packName?: string;
  channel?: string;
  mode?: string;
  managerPack?: CustomNodePackInfo;
}

export function detectMissingWorkflowNodes(
  workflowJson: IComfyJson | null,
  objectInfo?: IObjectInfo | null,
): MissingWorkflowNode[] {
  if (!workflowJson?.nodes) {
    return [];
  }

  const availableTypes = objectInfo ? new Set(Object.keys(objectInfo)) : undefined;
  const missingNodes: MissingWorkflowNode[] = [];

  for (const node of workflowJson.nodes) {
    if (!node?.type) {
      continue;
    }

    if (VIRTUAL_NODES.includes(node.type)) {
      continue;
    }

    if (availableTypes && availableTypes.has(node.type)) {
      continue;
    }

    // Check if it's a subgraph node (defined in workflow)
    if (workflowJson.subgraphs?.some(sg => sg.id === node.type)) {
      continue;
    }

    // Fallback: Check if type is a UUID (likely a subgraph even if definition is missing/not loaded yet)
    // dbe682c8-c9d2-4f3f-a199-35cc09e15d27
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(node.type)) {
      continue;
    }

    missingNodes.push({
      id: node.id,
      type: node.type,
      properties: node.properties ?? null,
    });
  }

  return missingNodes;
}

export async function resolveMissingNodePackages(
  missingNodes: MissingWorkflowNode[],
): Promise<MissingNodePackage[]> {
  if (!missingNodes.length) {
    return [];
  }

  const [nodeList, nodeMappings] = await Promise.all([
    ComfyUIService.getCustomNodeList({ mode: 'cache', skipUpdate: true }).catch<CustomNodeListResponse>(() => ({
      node_packs: {},
    } as CustomNodeListResponse)),
    ComfyUIService.getManagerNodeMappings({ mode: 'cache' }).catch<CustomNodeMappingsResponse>(() => ({} as CustomNodeMappingsResponse)),
  ]);

  const nodePacks = nodeList?.node_packs ?? {};
  const typeToPackMap = buildNodeTypeToPackMap(nodeMappings);
  const packageMap = new Map<string, PackageAccumulator>();

  for (const node of missingNodes) {
    const { packId, source } = resolvePackInfoForNode(node, typeToPackMap, nodePacks);
    const accumulator = ensurePackageAccumulator(packageMap, packId, source);
    accumulator.nodeTypes.add(node.type);

    const properties = node.properties ?? {};
    if (typeof properties.pack_name === 'string') {
      accumulator.packName = accumulator.packName ?? properties.pack_name;
    }
    if (typeof properties.description === 'string') {
      accumulator.description = accumulator.description ?? properties.description;
    }
    if (!accumulator.repository && typeof properties.aux_id === 'string') {
      accumulator.repository = properties.aux_id;
    }
    if (!accumulator.repository && typeof properties.repository === 'string') {
      accumulator.repository = properties.repository;
    }

    const managerPack = nodePacks[packId];
    if (managerPack) {
      accumulator.managerPack = managerPack;
      accumulator.packName = accumulator.packName ?? (managerPack.title || managerPack.id);
      if (typeof managerPack.description === 'string') {
        accumulator.description = accumulator.description ?? managerPack.description;
      }
      const managerRepo = (managerPack.repository as string | undefined) ?? (managerPack.reference as string | undefined);
      accumulator.repository = accumulator.repository ?? managerRepo;
      accumulator.latestVersion = accumulator.latestVersion ?? (typeof managerPack.cnr_latest === 'string' ? managerPack.cnr_latest : undefined);
      accumulator.channel = accumulator.channel ?? (managerPack.channel as string | undefined);
      accumulator.mode = accumulator.mode ?? (managerPack.mode as string | undefined);
    }
  }

  const registryPackIds = Array.from(packageMap.values())
    .filter((acc) => acc.source === 'registry' && isValidRegistryPackId(acc.packId))
    .map((acc) => acc.packId);

  if (registryPackIds.length > 0) {
    const registryDetails = await fetchRegistryNodesBulk([...new Set(registryPackIds)]);
    const detailMap = new Map(registryDetails.map((detail) => [detail.id, detail] as const));
    for (const [packId, accumulator] of packageMap.entries()) {
      const detail = detailMap.get(packId);
      if (detail) {
        accumulator.detail = detail;
        accumulator.packName = accumulator.packName ?? detail.name ?? packId;
        accumulator.repository = accumulator.repository ?? detail.repository ?? undefined;
        accumulator.description = accumulator.description ?? detail.description ?? undefined;
        accumulator.latestVersion = accumulator.latestVersion ?? detail.latest_version?.version;
      }
    }
  }

  const packages: MissingNodePackage[] = [];

  for (const [packId, accumulator] of packageMap.entries()) {
    const managerPack = accumulator.managerPack;
    const isInstalled = Boolean(managerPack && managerPack.state && managerPack.state !== 'not-installed');
    const installedVersion = isInstalled ? (managerPack?.active_version ?? managerPack?.version) : undefined;
    const latestVersion = accumulator.detail?.latest_version?.version
      ?? accumulator.latestVersion
      ?? (managerPack?.cnr_latest as string | undefined);

    let availableVersions: string[] = [];
    if (accumulator.source === 'registry' && isValidRegistryPackId(packId)) {
      availableVersions = await buildAvailableVersions(accumulator.source, packId, accumulator.detail);
    }
    if (installedVersion && !availableVersions.includes(installedVersion)) {
      availableVersions.push(installedVersion);
    }
    if (latestVersion && !availableVersions.includes(latestVersion)) {
      availableVersions.push(latestVersion);
    }
    if (!availableVersions.length) {
      availableVersions = ['latest'];
    }

    const versionComparison = installedVersion && latestVersion ? compareVersions(latestVersion, installedVersion) : 0;
    const isUpdateAvailable = Boolean(
      isInstalled && installedVersion && latestVersion && (
        versionComparison > 0 || (versionComparison === 0 && latestVersion !== installedVersion)
      ),
    );

    const isInstallable = accumulator.source !== 'unknown' || Boolean(accumulator.repository);

    packages.push({
      packId,
      source: accumulator.source,
      nodeTypes: Array.from(accumulator.nodeTypes.values()),
      packName: accumulator.packName ?? managerPack?.title ?? accumulator.detail?.name ?? packId,
      description: accumulator.description ?? (managerPack?.description as string | undefined),
      repository: accumulator.repository
        ?? (managerPack?.repository as string | undefined)
        ?? (managerPack?.reference as string | undefined),
      latestVersion,
      installedVersion,
      availableVersions: dedupeVersions(availableVersions),
      isInstalled,
      isUpdateAvailable,
      isInstallable,
      state: managerPack?.state,
      channel: accumulator.channel ?? (managerPack?.channel as string | undefined),
      mode: accumulator.mode ?? (managerPack?.mode as string | undefined),
      files: Array.isArray(managerPack?.files)
        ? (managerPack?.files as string[])
        : undefined,
      // GitHub source인 경우 기본적으로 git-clone 타입을 사용하도록 보완
      installType: typeof managerPack?.install_type === 'string'
        ? managerPack?.install_type
        : (accumulator.source === 'github' ? 'git-clone' : undefined),
    });
  }

  return packages.sort((a, b) => a.packName?.localeCompare(b.packName ?? b.packId) ?? 0);
}

function buildNodeTypeToPackMap(mappings: CustomNodeMappingsResponse | null | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!mappings) {
    return map;
  }

  for (const [packId, entry] of Object.entries(mappings)) {
    if (!Array.isArray(entry) || !Array.isArray(entry[0])) {
      continue;
    }
    const nodeNames = entry[0] as string[];
    nodeNames.forEach((nodeName) => {
      if (!nodeName) {
        return;
      }
      if (!map.has(nodeName)) {
        map.set(nodeName, packId);
      }
      const lower = nodeName.toLowerCase();
      if (!map.has(lower)) {
        map.set(lower, packId);
      }
    });
  }

  return map;
}

function resolvePackInfoForNode(
  node: MissingWorkflowNode,
  typeToPackMap: Map<string, string>,
  nodePacks: Record<string, CustomNodePackInfo>,
): { packId: string; source: MissingNodeSource } {
  const properties = node.properties ?? {};
  const cnrId = properties.cnr_id as string | undefined;
  if (cnrId) {
    return { packId: cnrId, source: 'registry' };
  }

  const directPackId = getPackIdForType(node.type, typeToPackMap);
  if (directPackId) {
    const managerPack = nodePacks[directPackId];
    return {
      packId: directPackId,
      source: inferSourceFromManagerPack(directPackId, managerPack, 'registry'),
    };
  }

  const auxId = properties.aux_id as string | undefined;
  if (auxId) {
    return { packId: auxId, source: 'github' };
  }

  const packName = properties.pack_name as string | undefined;
  if (packName) {
    const managerPack = nodePacks[packName];
    return {
      packId: packName,
      source: inferSourceFromManagerPack(packName, managerPack, isLikelyUrl(packName) ? 'github' : 'registry'),
    };
  }

  return { packId: `unknown::${node.type}`, source: 'unknown' };
}

function getPackIdForType(nodeType: string, typeToPackMap: Map<string, string>): string | undefined {
  return typeToPackMap.get(nodeType) ?? typeToPackMap.get(nodeType.toLowerCase());
}

function inferSourceFromManagerPack(
  packId: string,
  managerPack?: CustomNodePackInfo,
  fallback: MissingNodeSource = 'unknown',
): MissingNodeSource {
  if (managerPack?.cnr_latest) {
    return 'registry';
  }
  if (managerPack?.install_type === 'git-clone') {
    return 'github';
  }
  const repo = (managerPack?.repository as string | undefined) ?? (managerPack?.reference as string | undefined);
  if (isLikelyUrl(repo)) {
    return 'github';
  }
  if (isLikelyUrl(packId)) {
    return 'github';
  }
  if (fallback !== 'unknown') {
    return fallback;
  }
  return 'registry';
}

function isLikelyUrl(value?: string): boolean {
  if (!value) {
    return false;
  }
  return /^https?:\/\//i.test(value);
}

function isValidRegistryPackId(packId: string): boolean {
  if (!packId || packId.startsWith('unknown::')) {
    return false;
  }
  return !isLikelyUrl(packId);
}

export async function queueMissingNodeInstallation(
  selections: PackageInstallSelection[],
): Promise<boolean> {
  if (!selections.length) {
    return true;
  }

  const queueStarted = await ComfyUIService.startManagerQueue();
  if (!queueStarted) {
    console.warn('Failed to start manager queue');
  }

  let success = true;

  for (const selection of selections) {
    const payload = {
      id: selection.packId,
      selected_version: selection.selectedVersion,
      version: isSpecialVersionLabel(selection.selectedVersion)
        ? 'unknown'
        : selection.selectedVersion,
      repository: selection.repository,
      channel: selection.channel ?? DEFAULT_CHANNEL,
      mode: selection.mode ?? DEFAULT_MODE,
      skip_post_install: selection.skipPostInstall,
      pip: selection.pip,
      // Manager의 특정 코드(manager_server.py)에서 json_data['files'][0]에 무조건 접근하려 시도하는 경우가 있음.
      // 빈 배열([])이면 IndexError, 아예 없으면 KeyError가 발생하므로, 
      // 내용이 없을 경우 repository URL이나 packId를 대신 넣어주어 파싱 실패를 방지함.
      files: (selection.files && selection.files.length > 0)
        ? selection.files
        : [selection.repository || selection.packId],
      install_type: selection.installType,
    };

    const queued = await ComfyUIService.queuePackageInstall(payload);
    if (!queued) {
      success = false;
    }
  }

  return success;
}

export function parseManagerQueueStatus(data: any): ManagerQueueStatus | null {
  if (!data) {
    return null;
  }

  const status = data.status as 'in_progress' | 'done';
  if (status !== 'in_progress' && status !== 'done') {
    return null;
  }

  return {
    status,
    totalCount: typeof data.total_count === 'number' ? data.total_count : undefined,
    doneCount: typeof data.done_count === 'number' ? data.done_count : undefined,
    inProgressCount: typeof data.in_progress_count === 'number' ? data.in_progress_count : undefined,
    isProcessing: typeof data.is_processing === 'boolean' ? data.is_processing : undefined,
  };
}

export function compareVersions(v1: string, v2: string): number {
  const semverPattern = /^\d+\.\d+\.\d+$/;
  if (!semverPattern.test(v1) || !semverPattern.test(v2)) {
    return 0;
  }

  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const value1 = parts1[i] ?? 0;
    const value2 = parts2[i] ?? 0;
    if (value1 > value2) return 1;
    if (value1 < value2) return -1;
  }

  return 0;
}

export const MANAGER_QUEUE_EVENT = 'cm-queue-status';

function ensurePackageAccumulator(
  packageMap: Map<string, PackageAccumulator>,
  packId: string,
  source: MissingNodeSource,
): PackageAccumulator {
  if (!packageMap.has(packId)) {
    packageMap.set(packId, {
      packId,
      source,
      nodeTypes: new Set<string>(),
    });
  }
  const acc = packageMap.get(packId)!;
  if (acc.source === 'unknown' && source !== 'unknown') {
    acc.source = source;
  }
  if (acc.source === 'github' && source === 'registry') {
    acc.source = 'registry';
  }
  return acc;
}

async function buildAvailableVersions(
  source: MissingNodeSource,
  packId: string,
  detail?: RegistryNodeDetail | null,
): Promise<string[]> {
  const base = ['latest', 'nightly'];

  if (source !== 'registry') {
    return [...base];
  }

  const versions: RegistryNodeVersion[] = await fetchRegistryNodeVersions(packId);
  const versionStrings = versions
    .map((version) => version.version)
    .filter((value): value is string => Boolean(value));

  if (detail?.latest_version?.version && !versionStrings.includes(detail.latest_version.version)) {
    versionStrings.unshift(detail.latest_version.version);
  }

  return [...base, ...versionStrings];
}

function dedupeVersions(versions: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const version of versions) {
    if (!version || seen.has(version)) {
      continue;
    }
    seen.add(version);
    result.push(version);
  }
  return result;
}

function isSpecialVersionLabel(version: string): boolean {
  return version === 'latest' || version === 'nightly';
}




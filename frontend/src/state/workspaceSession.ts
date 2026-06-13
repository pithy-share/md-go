import type { AppConfig, RecentDocument, WorkspaceSessionState } from '../types/app';

export function resolveStartupWorkspacePath(config: AppConfig) {
  if (config.workspacePath) return config.workspacePath;

  const latestRecent = config.recentDocuments[0];
  if (!latestRecent?.path) return '';
  if (latestRecent.type === 'folder') return latestRecent.path;
  return findRecentFolderForFile(latestRecent, config.recentDocuments.slice(1))?.path ?? '';
}

export function findRecentFolderForFile(fileRecent: RecentDocument, candidates: RecentDocument[]) {
  if (fileRecent.type !== 'file') return null;
  return candidates.find((item) => item.type === 'folder' && isPathInsideFolder(fileRecent.path, item.path)) ?? null;
}

export function isPathInsideFolder(filePath: string, folderPath: string) {
  const file = normalizePathForCompare(filePath);
  const folder = normalizePathForCompare(folderPath);
  if (!file || !folder) return false;
  if (file === folder) return false;
  return file.startsWith(folder.endsWith('/') ? folder : `${folder}/`);
}

export function normalizePathForCompare(path: string) {
  const normalized = trimTrailingSlashes(path.trim().replace(/\\/g, '/'));
  if (/^[a-z]:\//i.test(normalized) || normalized.startsWith('//')) {
    return normalized.toLowerCase();
  }
  return normalized;
}

export function trimTrailingSlashes(path: string) {
  if (path === '/' || /^[a-z]:\/$/i.test(path)) return path;
  return path.replace(/\/+$/, '');
}

export function resolveWorkspaceSessionState(config: AppConfig, workspacePath: string): WorkspaceSessionState {
  if (workspacePath) {
    const savedState = config.workspaceStates[workspacePath];
    if (savedState) {
      return cloneWorkspaceSessionState(savedState);
    }

    if (config.workspacePath === workspacePath && Object.keys(config.workspaceStates).length === 0) {
      return {
        openTabPaths: [...config.openTabPaths],
        activeTabPath: config.activeTabPath,
        collapsedFolderPaths: [...config.collapsedFolderPaths],
      };
    }
  }

  return {
    openTabPaths: workspacePath ? [] : [...config.openTabPaths],
    activeTabPath: workspacePath ? '' : config.activeTabPath,
    collapsedFolderPaths: workspacePath ? [] : [...config.collapsedFolderPaths],
  };
}

export function applyWorkspaceSessionState(
  config: AppConfig,
  workspacePath: string,
  updates: Partial<WorkspaceSessionState>,
): AppConfig {
  const currentState = resolveWorkspaceSessionState(config, workspacePath);
  const nextState: WorkspaceSessionState = {
    openTabPaths: updates.openTabPaths ? [...updates.openTabPaths] : currentState.openTabPaths,
    activeTabPath: typeof updates.activeTabPath === 'string' ? updates.activeTabPath : currentState.activeTabPath,
    collapsedFolderPaths: updates.collapsedFolderPaths ? [...updates.collapsedFolderPaths] : currentState.collapsedFolderPaths,
  };

  const nextConfig: AppConfig = {
    ...config,
    openTabPaths: [...nextState.openTabPaths],
    activeTabPath: nextState.activeTabPath,
    collapsedFolderPaths: [...nextState.collapsedFolderPaths],
  };

  if (!workspacePath) {
    return nextConfig;
  }

  return {
    ...nextConfig,
    workspaceStates: {
      ...config.workspaceStates,
      [workspacePath]: cloneWorkspaceSessionState(nextState),
    },
  };
}

export function cloneWorkspaceSessionState(state: WorkspaceSessionState): WorkspaceSessionState {
  return {
    openTabPaths: [...state.openTabPaths],
    activeTabPath: state.activeTabPath,
    collapsedFolderPaths: [...state.collapsedFolderPaths],
  };
}

export function serializeSessionSnapshot(workspacePath: string, openTabPaths: string[], activeTabPath: string) {
  return JSON.stringify({ workspacePath, openTabPaths, activeTabPath });
}

export function pruneMissingWorkspaceReference(config: AppConfig, missingWorkspacePath: string): AppConfig {
  const normalizedMissingWorkspacePath = normalizeOptionalPath(missingWorkspacePath);
  if (!normalizedMissingWorkspacePath) return config;

  const isActiveWorkspace = arePathsEqual(config.workspacePath, normalizedMissingWorkspacePath);
  const nextWorkspaceStates = Object.fromEntries(
    Object.entries(config.workspaceStates).filter(([workspacePath]) => !arePathsEqual(workspacePath, normalizedMissingWorkspacePath)),
  );

  return {
    ...config,
    workspacePath: isActiveWorkspace ? '' : config.workspacePath,
    openTabPaths: isActiveWorkspace ? [] : config.openTabPaths,
    activeTabPath: isActiveWorkspace ? '' : config.activeTabPath,
    collapsedFolderPaths: isActiveWorkspace ? [] : config.collapsedFolderPaths,
    workspaceStates: nextWorkspaceStates,
    recentDocuments: config.recentDocuments.filter((item) => !(
      item.type === 'folder' && arePathsEqual(item.path, normalizedMissingWorkspacePath)
    )),
  };
}

export function removeRecentDocument(config: AppConfig, path: string, type: RecentDocument['type']): AppConfig {
  const normalizedPath = normalizeOptionalPath(path);
  if (!normalizedPath) return config;

  return {
    ...config,
    recentDocuments: config.recentDocuments.filter((item) => !(
      item.type === type && arePathsEqual(item.path, normalizedPath)
    )),
  };
}

export function normalizeOptionalPath(path: string) {
  const trimmed = path.trim();
  if (!trimmed) return '';
  return trimTrailingSlashes(trimmed.replace(/\\/g, '/'));
}

export function arePathsEqual(left: string, right: string) {
  const normalizedLeft = normalizePathForCompare(left);
  const normalizedRight = normalizePathForCompare(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft === normalizedRight;
}

export function isMissingPathError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalizedMessage = message.toLowerCase();
  return normalizedMessage.includes('no such file') ||
    normalizedMessage.includes('not exist') ||
    normalizedMessage.includes('cannot find the file') ||
    normalizedMessage.includes('system cannot find') ||
    normalizedMessage.includes('file does not exist');
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LoadConfig, SaveConfig } from '../../wailsjs/go/main/App';
import { models } from '../../wailsjs/go/models';
import { WindowSetBackgroundColour } from '../../wailsjs/runtime/runtime';
import { defaultConfig, normalizeConfig, resolveTheme } from '../state/documentStore';
import { resolveWorkspaceSessionState, applyWorkspaceSessionState } from '../state/workspaceSession';
import { t } from '../i18n';
import type { AppConfig, WorkspaceSessionState } from '../types/app';

export interface UseAppConfigOptions {
  currentWorkspacePath: string;
  onMessage: (message: string) => void;
}

export interface UseAppConfigResult {
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
  effectiveTheme: ReturnType<typeof resolveTheme>;
  currentWorkspaceSession: WorkspaceSessionState;
  persistConfig: (updates: Partial<AppConfig>) => Promise<void>;
  persistConfigWith: (updater: (current: AppConfig) => AppConfig) => Promise<void>;
  persistWorkspaceSessionState: (workspacePath: string, updates: Partial<WorkspaceSessionState>) => Promise<void>;
}

export function useAppConfig({ currentWorkspacePath, onMessage }: UseAppConfigOptions): UseAppConfigResult {
  const [config, setConfig] = useState<AppConfig>(defaultConfig);

  const effectiveTheme = resolveTheme(config.theme);

  const currentWorkspaceSession = useMemo(
    () => resolveWorkspaceSessionState(config, currentWorkspacePath),
    [config, currentWorkspacePath],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme;
    const bg = effectiveTheme === 'dark'
      ? { r: 25, g: 28, b: 32 }
      : { r: 245, g: 246, b: 248 };
    try { WindowSetBackgroundColour(bg.r, bg.g, bg.b, 1); } catch { /* Wails runtime may be unavailable in browser dev */ }
  }, [effectiveTheme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--editor-font-size', `${config.editorFontSize}px`);
  }, [config.editorFontSize]);

  useEffect(() => {
    let frameId = 0;
    const setHeight = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
      });
    };
    setHeight();
    window.addEventListener('resize', setHeight);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', setHeight);
    };
  }, []);

  const persistConfigWith = useCallback(async (updater: (current: AppConfig) => AppConfig) => {
    setConfig((current) => updater(current));
    try {
      const latest = normalizeConfig(await LoadConfig());
      const nextConfig = updater(latest);
      const saved = normalizeConfig(await SaveConfig(models.AppConfig.createFrom(nextConfig)));
      setConfig(saved);
    } catch (error) {
      console.error(error);
      onMessage(t('message.couldNotSaveSettings'));
    }
  }, [onMessage]);

  const persistConfig = useCallback(async (updates: Partial<AppConfig>) => {
    await persistConfigWith((current) => ({ ...current, ...updates }));
  }, [persistConfigWith]);

  const persistWorkspaceSessionState = useCallback(async (workspacePath: string, updates: Partial<WorkspaceSessionState>) => {
    await persistConfigWith((current) => applyWorkspaceSessionState(current, workspacePath, updates));
  }, [persistConfigWith]);

  return {
    config,
    setConfig,
    effectiveTheme,
    currentWorkspaceSession,
    persistConfig,
    persistConfigWith,
    persistWorkspaceSessionState,
  };
}

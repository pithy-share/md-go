import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronsDown, ChevronsUp, FilePlus, FileText, Folder, FolderOpen, FolderPlus, ListTree, Pencil, Trash2 } from 'lucide-react';
import type { OutlineItem, Workspace, WorkspaceFile } from '../types/app';
import { t } from '../i18n';

interface SidebarProps {
  currentPath: string;
  openPaths: string[];
  workspace: Workspace | null;
  initialCollapsedFolderPaths: string[];
  onOpenWorkspaceFile: (path: string) => void;
  onRefreshWorkspace: () => void;
  onCollapsedFoldersChange: (paths: string[]) => void;
  onFileDeleted: (path: string) => void;
  onFileRenamed: (oldPath: string, newPath: string) => void;
  onCreateFile: (parentDir: string) => void;
  onCreateFolder: (parentDir: string) => void;
  onMoveItem: (oldPath: string, newParentDir: string) => void;
}

interface OutlinePanelProps {
  outline: OutlineItem[];
  onJumpToHeading: (pos: number) => void;
}

type WorkspaceTreeItem = WorkspaceFolderNode | WorkspaceFileNode;

interface WorkspaceFolderNode {
  type: 'folder';
  id: string;
  name: string;
  children: WorkspaceTreeItem[];
}

interface WorkspaceFileNode {
  type: 'file';
  id: string;
  file: WorkspaceFile;
}

interface SidebarContextMenu {
  x: number;
  y: number;
  item: WorkspaceTreeItem;
}

export function Sidebar({
  currentPath,
  openPaths,
  workspace,
  initialCollapsedFolderPaths,
  onOpenWorkspaceFile,
  onRefreshWorkspace,
  onCollapsedFoldersChange,
  onFileDeleted,
  onFileRenamed,
  onCreateFile,
  onCreateFolder,
  onMoveItem,
}: SidebarProps) {
  const tree = useMemo(() => buildWorkspaceTree(workspace?.files ?? []), [workspace?.files]);
  const allFolderIds = useMemo(() => collectFolderIds(tree), [tree]);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<SidebarContextMenu | null>(null);
  const [renameItem, setRenameItem] = useState<{ item: WorkspaceTreeItem; currentName: string } | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null!);

  useEffect(() => {
    const validFolderIds = new Set(allFolderIds);
    const nextCollapsedFolders = initialCollapsedFolderPaths.filter((id) => validFolderIds.has(id));
    setCollapsedFolders(new Set(nextCollapsedFolders));
  }, [workspace?.rootPath, initialCollapsedFolderPaths, allFolderIds]);

  // Close context menu on outside click / Escape
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.sidebar-context-menu')) close();
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', onClick, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('click', onClick, { capture: true });
    };
  }, [contextMenu]);

  // ── Search: when query is active, reset collapsed state and filter tree ──
  const isSearching = searchQuery.trim().length > 0;
  const displayTree = useMemo(() => {
    if (!isSearching) return tree;
    return filterTree(tree, searchQuery);
  }, [tree, searchQuery, isSearching]);

  const updateCollapsedFolders = (updater: (current: Set<string>) => Set<string>) => {
    setCollapsedFolders((current) => {
      const next = updater(current);
      onCollapsedFoldersChange(Array.from(next).sort());
      return next;
    });
  };

  const toggleFolder = (id: string) => {
    updateCollapsedFolders((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    updateCollapsedFolders(() => new Set());
  };

  const handleCollapseAll = () => {
    updateCollapsedFolders(() => new Set(allFolderIds));
  };

  const handleContextMenu = (e: React.MouseEvent, item: WorkspaceTreeItem) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  };

  const getItemParentDir = (item: WorkspaceTreeItem): string => {
    if (item.type === 'file') {
      return item.file.path.substring(0, item.file.path.lastIndexOf(item.file.name) - 1) || workspace?.rootPath || '';
    }
    // For folders, derive parent from the id
    const sepIndex = item.id.lastIndexOf('/');
    if (sepIndex >= 0) {
      return (workspace?.rootPath ?? '') + '/' + item.id.substring(0, sepIndex);
    }
    return workspace?.rootPath ?? '';
  };

  const getItemPath = (item: WorkspaceTreeItem): string => {
    if (item.type === 'file') return item.file.path;
    return (workspace?.rootPath ?? '') + '/' + item.id;
  };

  const executeMenuAction = (action: () => void) => {
    setContextMenu(null);
    action();
  };

  const handleRenameCommit = (item: WorkspaceTreeItem, newName: string) => {
    if (!newName.trim() || newName.trim() === renameItem?.currentName) {
      setRenameItem(null);
      return;
    }
    const oldPath = getItemPath(item);
    onFileRenamed(oldPath, newName.trim());
    setRenameItem(null);
  };

  const handleRenameStart = (item: WorkspaceTreeItem) => {
    const name = item.type === 'file' ? item.file.name : item.name;
    setRenameItem({ item, currentName: name });
    // Focus after render
    setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
  };

  const handleRenameCancel = () => {
    setRenameItem(null);
  };

  return (
    <aside className="sidebar">
      <section className="sidebar-section workspace-section">
        <div className="sidebar-heading sidebar-heading-row">
          <div className="sidebar-heading-title">
            <Folder size={15} />
            <span>{workspace?.name || t('workspace.titleFallback')}</span>
          </div>
          <div className="sidebar-heading-actions">
            <button
              type="button"
              className="sidebar-action-button"
              title={t('workspace.expandAll')}
              aria-label={t('workspace.expandAll')}
              onClick={handleExpandAll}
              disabled={!workspace || allFolderIds.length === 0}
            >
              <ChevronsDown size={14} />
            </button>
            <button
              type="button"
              className="sidebar-action-button"
              title={t('workspace.collapseAll')}
              aria-label={t('workspace.collapseAll')}
              onClick={handleCollapseAll}
              disabled={!workspace || allFolderIds.length === 0}
            >
              <ChevronsUp size={14} />
            </button>
          </div>
        </div>
        <div className="sidebar-search">
          <input
            type="text"
            className="sidebar-search-input"
            placeholder={t('workspace.searchFiles')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            spellCheck={false}
          />
        </div>
        <div className="sidebar-list tree-list">
          {!workspace ? (
            <div className="empty-state">{t('workspace.noFolder')}</div>
          ) : displayTree.length === 0 ? (
            <div className="empty-state">{isSearching ? t('workspace.noMatches') : t('workspace.noMarkdown')}</div>
          ) : (
            <WorkspaceTree
              currentPath={currentPath}
              openPaths={openPaths}
              items={displayTree}
              level={0}
              collapsedFolders={isSearching ? new Set() : collapsedFolders}
              onToggleFolder={toggleFolder}
              onOpenWorkspaceFile={onOpenWorkspaceFile}
              onContextMenu={handleContextMenu}
              renameItem={renameItem}
              renameInputRef={renameInputRef}
              onRenameCommit={handleRenameCommit}
              onRenameCancel={handleRenameCancel}
              onRenameStart={handleRenameStart}
              onMoveItem={onMoveItem}
              workspaceRoot={workspace?.rootPath ?? ''}
            />
          )}
        </div>
      </section>

      {contextMenu && (
        <div
          className="sidebar-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.item.type === 'folder' && (
            <>
              <button
                className="sidebar-context-menu-item"
                onClick={() => executeMenuAction(() => {
                  const parentDir = getItemPath(contextMenu.item);
                  onCreateFile(parentDir);
                })}
              >
                <FilePlus size={14} />
                {t('workspace.newFile')}
              </button>
              <button
                className="sidebar-context-menu-item"
                onClick={() => executeMenuAction(() => {
                  const parentDir = getItemPath(contextMenu.item);
                  onCreateFolder(parentDir);
                })}
              >
                <FolderPlus size={14} />
                {t('workspace.newFolder')}
              </button>
            </>
          )}
          <button
            className="sidebar-context-menu-item"
            onClick={() => executeMenuAction(() => handleRenameStart(contextMenu.item))}
          >
            <Pencil size={14} />
            {t('workspace.rename')}
          </button>
          <button
            className="sidebar-context-menu-item danger"
            onClick={() => {
              setContextMenu(null);
              const item = contextMenu.item;
              const itemName = item.type === 'file' ? item.file.name : item.name;
              if (window.confirm(t('workspace.deleteConfirm', { name: itemName }))) {
                const path = getItemPath(item);
                const isDir = item.type === 'folder';
                onFileDeleted(path + (isDir ? '|dir|' : ''));
              }
            }}
          >
            <Trash2 size={14} />
            {t('workspace.delete')}
          </button>
        </div>
      )}
    </aside>
  );
}

export function OutlinePanel({ outline, onJumpToHeading }: OutlinePanelProps) {
  return (
    <aside className="outline-panel">
      <section className="sidebar-section outline-section">
        <div className="sidebar-heading">
          <ListTree size={15} />
          <span>{t('outline.title')}</span>
        </div>
        <div className="sidebar-list">
          {outline.length === 0 ? (
            <div className="empty-state">{t('outline.empty')}</div>
          ) : (
            outline.map((item) => (
              <button
                key={item.id}
                className="outline-item"
                style={{ paddingLeft: `${8 + (item.level - 1) * 14}px` }}
                title={item.text}
                onClick={() => onJumpToHeading(item.pos)}
              >
                {item.text}
              </button>
            ))
          )}
        </div>
      </section>
    </aside>
  );
}

function WorkspaceTree({
  currentPath,
  openPaths,
  items,
  level,
  collapsedFolders,
  onToggleFolder,
  onOpenWorkspaceFile,
  onContextMenu,
  renameItem,
  renameInputRef,
  onRenameCommit,
  onRenameCancel,
  onRenameStart,
  onMoveItem,
  workspaceRoot,
}: {
  currentPath: string;
  openPaths: string[];
  items: WorkspaceTreeItem[];
  level: number;
  collapsedFolders: Set<string>;
  onToggleFolder: (id: string) => void;
  onOpenWorkspaceFile: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, item: WorkspaceTreeItem) => void;
  renameItem: { item: WorkspaceTreeItem; currentName: string } | null;
  renameInputRef: React.RefObject<HTMLInputElement>;
  onRenameCommit: (item: WorkspaceTreeItem, newName: string) => void;
  onRenameCancel: () => void;
  onRenameStart: (item: WorkspaceTreeItem) => void;
  onMoveItem: (oldPath: string, newParentDir: string) => void;
  workspaceRoot: string;
}) {
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, item: WorkspaceTreeItem) => {
    const path = item.type === 'file' ? item.file.path : `${workspaceRoot}/${item.id}`;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', path);
    e.dataTransfer.setData('application/x-workspace-item', JSON.stringify({
      type: item.type,
      path: path,
      name: item.type === 'file' ? item.file.name : item.name,
    }));
  };

  const handleDragOver = (e: React.DragEvent, folderItem: WorkspaceFolderNode) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(folderItem.id);
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = (e: React.DragEvent, folderItem: WorkspaceFolderNode) => {
    e.preventDefault();
    setDragOverId(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/x-workspace-item'));
      if (data?.path && data.path !== folderItem.id) {
        const targetDir = workspaceRoot ? workspaceRoot + '/' + folderItem.id : folderItem.id;
        onMoveItem(data.path, targetDir);
      }
    } catch {
      // ignore invalid drops
    }
  };

  return (
    <>
      {items.map((item) => {
        if (item.type === 'folder') {
          const collapsed = collapsedFolders.has(item.id);
          const isRenaming = renameItem?.item === item;
          const isDragOver = dragOverId === item.id;
          return (
            <div key={item.id} className="tree-branch">
              <button
                className={`tree-item tree-folder${isRenaming ? ' inline-editing' : ''}${isDragOver ? ' drag-over' : ''}`}
                style={{ paddingLeft: `${8 + level * 14}px` }}
                draggable={!isRenaming}
                onClick={() => !isRenaming && onToggleFolder(item.id)}
                onContextMenu={(e) => {
                  if (!isRenaming) onContextMenu(e, item);
                }}
                onDragStart={(e) => handleDragStart(e, item)}
                onDragOver={(e) => handleDragOver(e, item)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, item)}
              >
                {collapsed ? <ChevronRight className="tree-toggle" size={14} /> : <ChevronDown className="tree-toggle" size={14} />}
                {collapsed ? <Folder size={15} /> : <FolderOpen size={15} />}
                {isRenaming ? (
                  <input
                    ref={renameInputRef}
                    className="tree-inline-rename-input"
                    defaultValue={item.name}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        onRenameCommit(item, e.currentTarget.value);
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        onRenameCancel();
                      }
                    }}
                    onBlur={() => onRenameCancel()}
                    onClick={(e) => e.stopPropagation()}
                    onContextMenu={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span>{item.name}</span>
                )}
              </button>
              {!collapsed && (
                <WorkspaceTree
                  currentPath={currentPath}
                  openPaths={openPaths}
                  items={item.children}
                  level={level + 1}
                  collapsedFolders={collapsedFolders}
                  onToggleFolder={onToggleFolder}
                  onOpenWorkspaceFile={onOpenWorkspaceFile}
                  onContextMenu={onContextMenu}
                  renameItem={renameItem}
                  renameInputRef={renameInputRef}
                  onRenameCommit={onRenameCommit}
                  onRenameCancel={onRenameCancel}
                  onRenameStart={onRenameStart}
                  onMoveItem={onMoveItem}
                  workspaceRoot={workspaceRoot}
                />
              )}
            </div>
          );
        }

        const isRenaming = renameItem?.item === item;
        return (
          <button
            key={item.id}
            className={`tree-item tree-file${item.file.path === currentPath ? ' active' : ''}${item.file.path !== currentPath && openPaths.includes(item.file.path) ? ' tab-open' : ''}${isRenaming ? ' inline-editing' : ''}`}
            style={{ paddingLeft: `${8 + level * 14}px` }}
            title={item.file.path}
            draggable={!isRenaming}
            onClick={() => !isRenaming && onOpenWorkspaceFile(item.file.path)}
            onContextMenu={(e) => {
              if (!isRenaming) onContextMenu(e, item);
            }}
            onDragStart={(e) => handleDragStart(e, item)}
          >
            <span className="tree-spacer" />
            <FileText size={15} />
            {isRenaming ? (
              <input
                ref={renameInputRef}
                className="tree-inline-rename-input"
                defaultValue={item.file.name}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    onRenameCommit(item, e.currentTarget.value);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    onRenameCancel();
                  }
                }}
                onBlur={() => onRenameCancel()}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.stopPropagation()}
              />
            ) : (
              <span>{item.file.name}</span>
            )}
          </button>
        );
      })}
    </>
  );
}

function buildWorkspaceTree(files: WorkspaceFile[]) {
  const root: WorkspaceTreeItem[] = [];
  const folders = new Map<string, WorkspaceFolderNode>();

  for (const file of files) {
    const parts = file.relativePath.split('/').filter(Boolean);
    const folderParts = parts.slice(0, -1);
    let siblings = root;
    const currentPath: string[] = [];

    for (const folderName of folderParts) {
      currentPath.push(folderName);
      const id = currentPath.join('/');
      let folder = folders.get(id);
      if (!folder) {
        folder = { type: 'folder', id, name: folderName, children: [] };
        folders.set(id, folder);
        siblings.push(folder);
      }
      siblings = folder.children;
    }

    siblings.push({ type: 'file', id: file.path, file });
  }

  sortTree(root);
  return root;
}

function sortTree(items: WorkspaceTreeItem[]) {
  items.sort((left, right) => {
    if (left.type !== right.type) return left.type === 'folder' ? -1 : 1;
    const leftName = left.type === 'folder' ? left.name : left.file.name;
    const rightName = right.type === 'folder' ? right.name : right.file.name;
    return leftName.localeCompare(rightName, undefined, { sensitivity: 'base' });
  });

  for (const item of items) {
    if (item.type === 'folder') sortTree(item.children);
  }
}

function collectFolderIds(items: WorkspaceTreeItem[]): string[] {
  const folderIds: string[] = [];

  for (const item of items) {
    if (item.type !== 'folder') continue;
    folderIds.push(item.id);
    folderIds.push(...collectFolderIds(item.children));
  }

  return folderIds;
}

/**
 * Filter the file tree by filename/folder name (case-insensitive).
 * When a folder name matches, it is expanded with all its direct children.
 * When only children match, the folder is collapsed to show only matching children.
 */
function filterTree(items: WorkspaceTreeItem[], query: string): WorkspaceTreeItem[] {
  const lowerQuery = query.toLowerCase();
  const result: WorkspaceTreeItem[] = [];

  for (const item of items) {
    if (item.type === 'folder') {
      const folderMatch = item.name.toLowerCase().includes(lowerQuery);
      const filteredChildren = filterTree(item.children, query);

      if (folderMatch) {
        // Folder name matched — include all children (unfiltered), force-expanded
        result.push({ ...item, children: item.children });
      } else if (filteredChildren.length > 0) {
        // Only some children matched — include only them
        result.push({ ...item, children: filteredChildren });
      }
    } else {
      if (item.file.name.toLowerCase().includes(lowerQuery)) {
        result.push(item);
      }
    }
  }

  return result;
}

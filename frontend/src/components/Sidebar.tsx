import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, ListTree } from 'lucide-react';
import type { OutlineItem, Workspace, WorkspaceFile } from '../types/app';

interface SidebarProps {
  currentPath: string;
  workspace: Workspace | null;
  onOpenWorkspaceFile: (path: string) => void;
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

export function Sidebar({ currentPath, workspace, onOpenWorkspaceFile }: SidebarProps) {
  const tree = useMemo(() => buildWorkspaceTree(workspace?.files ?? []), [workspace?.files]);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setCollapsedFolders(new Set());
  }, [workspace?.rootPath]);

  const toggleFolder = (id: string) => {
    setCollapsedFolders((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <aside className="sidebar">
      <section className="sidebar-section workspace-section">
        <div className="sidebar-heading">
          <Folder size={15} />
          <span>{workspace?.name || 'Workspace'}</span>
        </div>
        <div className="sidebar-list tree-list">
          {!workspace ? (
            <div className="empty-state">No folder open</div>
          ) : tree.length === 0 ? (
            <div className="empty-state">No Markdown files</div>
          ) : (
            <WorkspaceTree
              currentPath={currentPath}
              items={tree}
              level={0}
              collapsedFolders={collapsedFolders}
              onToggleFolder={toggleFolder}
              onOpenWorkspaceFile={onOpenWorkspaceFile}
            />
          )}
        </div>
      </section>
    </aside>
  );
}

export function OutlinePanel({ outline, onJumpToHeading }: OutlinePanelProps) {
  return (
    <aside className="outline-panel">
      <section className="sidebar-section outline-section">
        <div className="sidebar-heading">
          <ListTree size={15} />
          <span>Outline</span>
        </div>
        <div className="sidebar-list">
          {outline.length === 0 ? (
            <div className="empty-state">No headings</div>
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
  items,
  level,
  collapsedFolders,
  onToggleFolder,
  onOpenWorkspaceFile,
}: {
  currentPath: string;
  items: WorkspaceTreeItem[];
  level: number;
  collapsedFolders: Set<string>;
  onToggleFolder: (id: string) => void;
  onOpenWorkspaceFile: (path: string) => void;
}) {
  return (
    <>
      {items.map((item) => {
        if (item.type === 'folder') {
          const collapsed = collapsedFolders.has(item.id);
          return (
            <div key={item.id} className="tree-branch">
              <button className="tree-item tree-folder" style={{ paddingLeft: `${8 + level * 14}px` }} onClick={() => onToggleFolder(item.id)}>
                {collapsed ? <ChevronRight className="tree-toggle" size={14} /> : <ChevronDown className="tree-toggle" size={14} />}
                {collapsed ? <Folder size={15} /> : <FolderOpen size={15} />}
                <span>{item.name}</span>
              </button>
              {!collapsed && (
                <WorkspaceTree
                  currentPath={currentPath}
                  items={item.children}
                  level={level + 1}
                  collapsedFolders={collapsedFolders}
                  onToggleFolder={onToggleFolder}
                  onOpenWorkspaceFile={onOpenWorkspaceFile}
                />
              )}
            </div>
          );
        }

        return (
          <button
            key={item.id}
            className={`tree-item tree-file ${item.file.path === currentPath ? 'active' : ''}`}
            style={{ paddingLeft: `${8 + level * 14}px` }}
            title={item.file.path}
            onClick={() => onOpenWorkspaceFile(item.file.path)}
          >
            <span className="tree-spacer" />
            <FileText size={15} />
            <span>{item.file.name}</span>
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

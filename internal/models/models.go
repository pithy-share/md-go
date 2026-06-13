package models

// DocumentMeta describes a document shell before it is saved to disk.
type DocumentMeta struct {
	Title   string `json:"title"`
	Content string `json:"content"`
	Path    string `json:"path"`
}

// DocumentPayload is returned when a Markdown document is loaded from disk.
type DocumentPayload struct {
	Path         string `json:"path"`
	Name         string `json:"name"`
	Content      string `json:"content"`
	Exists       bool   `json:"exists"`
	LastModified string `json:"lastModified"`
}

// WorkspaceFile describes one Markdown file inside an opened folder.
type WorkspaceFile struct {
	Path         string `json:"path"`
	Name         string `json:"name"`
	RelativePath string `json:"relativePath"`
	Depth        int    `json:"depth"`
	Size         int64  `json:"size"`
	ModifiedAt   string `json:"modifiedAt"`
}

// Workspace contains the Markdown files discovered under a folder.
type Workspace struct {
	RootPath string          `json:"rootPath"`
	Name     string          `json:"name"`
	Files    []WorkspaceFile `json:"files"`
}

// SaveResult is returned after a successful save.
type SaveResult struct {
	Path    string `json:"path"`
	Name    string `json:"name"`
	SavedAt string `json:"savedAt"`
}

// RecentDocument tracks files and folders opened by the user.
type RecentDocument struct {
	Path         string `json:"path"`
	Name         string `json:"name"`
	Type         string `json:"type"`
	LastOpenedAt string `json:"lastOpenedAt"`
}

// AppConfig stores editor preferences and recent documents.
type AppConfig struct {
	Theme           string           `json:"theme"`
	AutoSave        bool             `json:"autoSave"`
	AutoSaveDelay   int              `json:"autoSaveDelay"`
	ShowSidebar     bool             `json:"showSidebar"`
	ShowOutline     bool             `json:"showOutline"`
	EditorMode      string           `json:"editorMode"`
	WorkspacePath   string           `json:"workspacePath"`
	RecentDocuments []RecentDocument `json:"recentDocuments"`
	Hotkeys         []HotkeyBinding  `json:"hotkeys"`
}

// ExportPayload carries HTML content generated from the active Markdown document.
type ExportPayload struct {
	Title      string `json:"title"`
	HTML       string `json:"html"`
	SourcePath string `json:"sourcePath"`
}

// ExportPdfPayload carries printable HTML generated from the active Markdown document.
type ExportPdfPayload struct {
	Title      string `json:"title"`
	HTML       string `json:"html"`
	SourcePath string `json:"sourcePath"`
}

// HotkeyBinding defines a single keyboard shortcut mapped to an action.
type HotkeyBinding struct {
	ID       string `json:"id"`
	Action   string `json:"action"`
	Label    string `json:"label"`
	Key      string `json:"key"`
	Ctrl     bool   `json:"ctrl"`
	Alt      bool   `json:"alt"`
	Shift    bool   `json:"shift"`
	Meta     bool   `json:"meta"`
	Enabled  bool   `json:"enabled"`
	Category string `json:"category"`
}

// CreateWorkspaceItemPayload describes the input for creating a file or folder.
type CreateWorkspaceItemPayload struct {
	ParentDir string `json:"parentDir"`
	Name      string `json:"name"`
	IsFolder  bool   `json:"isFolder"`
}

// DeleteWorkspacePayload describes the input for deleting a file or folder.
type DeleteWorkspacePayload struct {
	Path  string `json:"path"`
	IsDir bool   `json:"isDir"`
}

// RenameWorkspacePayload describes the input for renaming a file or folder.
type RenameWorkspacePayload struct {
	OldPath string `json:"oldPath"`
	NewName string `json:"newName"`
}

// DefaultHotkeys returns the factory-default hotkey bindings.
func DefaultHotkeys() []HotkeyBinding {
	return []HotkeyBinding{
		{ID: "save", Action: "save", Label: "Save", Key: "s", Ctrl: true, Enabled: true, Category: "file"},
		{ID: "open", Action: "open", Label: "Open File", Key: "o", Ctrl: true, Enabled: true, Category: "file"},
		{ID: "new", Action: "new", Label: "New Document", Key: "n", Ctrl: true, Enabled: true, Category: "file"},
		{ID: "export", Action: "export", Label: "Export HTML", Key: "e", Ctrl: true, Shift: true, Enabled: true, Category: "file"},
		{ID: "export-pdf", Action: "export-pdf", Label: "Export PDF", Key: "p", Ctrl: true, Shift: true, Enabled: true, Category: "file"},
		{ID: "save-as", Action: "save-as", Label: "Save As", Key: "s", Ctrl: true, Shift: true, Enabled: true, Category: "file"},
		{ID: "close-tab", Action: "close-tab", Label: "Close Tab", Key: "w", Ctrl: true, Enabled: true, Category: "tab"},
		{ID: "next-tab", Action: "next-tab", Label: "Next Tab", Key: "Tab", Ctrl: true, Enabled: true, Category: "tab"},
		{ID: "prev-tab", Action: "prev-tab", Label: "Previous Tab", Key: "Tab", Ctrl: true, Shift: true, Enabled: true, Category: "tab"},
		{ID: "bold", Action: "bold", Label: "Bold", Key: "b", Ctrl: true, Enabled: true, Category: "format"},
		{ID: "italic", Action: "italic", Label: "Italic", Key: "i", Ctrl: true, Enabled: true, Category: "format"},
		{ID: "heading1", Action: "heading1", Label: "Heading 1", Key: "1", Ctrl: true, Enabled: true, Category: "format"},
		{ID: "heading2", Action: "heading2", Label: "Heading 2", Key: "2", Ctrl: true, Enabled: true, Category: "format"},
		{ID: "heading3", Action: "heading3", Label: "Heading 3", Key: "3", Ctrl: true, Enabled: true, Category: "format"},
		{ID: "link", Action: "link", Label: "Insert Link", Key: "k", Ctrl: true, Enabled: true, Category: "format"},
		{ID: "inline-code", Action: "inline-code", Label: "Inline Code", Key: "`", Ctrl: true, Shift: true, Enabled: true, Category: "format"},
		{ID: "toggle-sidebar", Action: "toggle-sidebar", Label: "Toggle Sidebar", Key: "b", Ctrl: true, Shift: true, Enabled: true, Category: "view"},
		{ID: "toggle-outline", Action: "toggle-outline", Label: "Toggle Outline", Key: "o", Ctrl: true, Shift: true, Enabled: true, Category: "view"},
		{ID: "toggle-editor-mode", Action: "toggle-editor-mode", Label: "Toggle Editor Mode", Key: "m", Ctrl: true, Shift: true, Enabled: true, Category: "view"},
		{ID: "find", Action: "find", Label: "Search", Key: "f", Ctrl: true, Enabled: true, Category: "edit"},
	}
}

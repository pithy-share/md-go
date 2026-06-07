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

// SaveResult is returned after a successful save.
type SaveResult struct {
	Path    string `json:"path"`
	Name    string `json:"name"`
	SavedAt string `json:"savedAt"`
}

// RecentDocument tracks files surfaced in the sidebar.
type RecentDocument struct {
	Path         string `json:"path"`
	Name         string `json:"name"`
	LastOpenedAt string `json:"lastOpenedAt"`
}

// AppConfig stores editor preferences and recent documents.
type AppConfig struct {
	Theme           string           `json:"theme"`
	AutoSave        bool             `json:"autoSave"`
	AutoSaveDelay   int              `json:"autoSaveDelay"`
	ShowSidebar     bool             `json:"showSidebar"`
	RecentDocuments []RecentDocument `json:"recentDocuments"`
}

// ExportPayload carries HTML content generated from the active Markdown document.
type ExportPayload struct {
	Title string `json:"title"`
	HTML  string `json:"html"`
}

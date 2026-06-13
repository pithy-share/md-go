package main

import (
	"context"

	configsvc "md-go/internal/config"
	exportsvc "md-go/internal/export"
	filessvc "md-go/internal/files"
	hotkeysvc "md-go/internal/hotkeys"
	"md-go/internal/models"
)

// App is the Wails binding surface exposed to the frontend.
type App struct {
	ctx context.Context

	config  *configsvc.Service
	files   *filessvc.Service
	export  *exportsvc.Service
	hotkeys *hotkeysvc.Service
}

func NewApp() *App {
	configService := configsvc.NewService("md-go")
	return &App{
		config:  configService,
		files:   filessvc.NewService(configService),
		export:  exportsvc.NewService(),
		hotkeys: hotkeysvc.NewService(configService.GetConfigPath()),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.files.SetContext(ctx)
	a.export.SetContext(ctx)
}

func (a *App) NewDocument() models.DocumentMeta {
	return a.files.NewDocument()
}

func (a *App) OpenDocument() (models.DocumentPayload, error) {
	return a.files.OpenDocument()
}

func (a *App) OpenFolder() (models.Workspace, error) {
	return a.files.OpenFolder()
}

func (a *App) ScanFolder(path string) (models.Workspace, error) {
	return a.files.ScanFolder(path)
}

func (a *App) ReadDocument(path string) (models.DocumentPayload, error) {
	return a.files.ReadDocument(path)
}

func (a *App) SaveDocument(path string, content string) (models.SaveResult, error) {
	return a.files.SaveDocument(path, content)
}

func (a *App) SaveDocumentAs(content string) (models.SaveResult, error) {
	return a.files.SaveDocumentAs(content)
}

// PickMdFile opens a native file dialog filtered to .md files and returns the selected path.
func (a *App) PickMdFile() (string, error) {
	return a.files.PickMdFile()
}

func (a *App) GetRecentDocuments() ([]models.RecentDocument, error) {
	return a.config.GetRecentDocuments()
}

func (a *App) UpdateRecentDocument(path string) error {
	return a.config.TouchRecentDocument(path)
}

func (a *App) LoadConfig() (models.AppConfig, error) {
	return a.config.LoadConfig()
}

func (a *App) SaveConfig(config models.AppConfig) (models.AppConfig, error) {
	return a.config.SaveConfig(config)
}

func (a *App) ExportHTML(payload models.ExportPayload) (models.SaveResult, error) {
	return a.export.ExportHTML(payload)
}

func (a *App) ExportPDF(payload models.ExportPdfPayload) (models.SaveResult, error) {
	return a.export.ExportPDF(payload)
}

// --- Hotkey bindings ---

// LoadHotkeys returns all keyboard shortcut bindings.
func (a *App) LoadHotkeys() ([]models.HotkeyBinding, error) {
	return a.hotkeys.LoadHotkeys()
}

// SaveHotkeys persists the given keyboard shortcut bindings.
func (a *App) SaveHotkeys(bindings []models.HotkeyBinding) ([]models.HotkeyBinding, error) {
	return a.hotkeys.SaveHotkeys(bindings)
}

// ResetHotkeys resets all keyboard shortcuts to factory defaults.
func (a *App) ResetHotkeys() ([]models.HotkeyBinding, error) {
	return a.hotkeys.ResetToDefaults()
}

// DebugLog appends a line to the debug log file.
func (a *App) DebugLog(msg string) {
	a.config.AppendDebugLog(msg)
}

// CreateWorkspaceFile creates a new Markdown file in the workspace.
func (a *App) CreateWorkspaceFile(parentDir string, name string) (models.WorkspaceFile, error) {
	return a.files.CreateWorkspaceFile(parentDir, name)
}

// CreateWorkspaceFolder creates a new folder in the workspace.
func (a *App) CreateWorkspaceFolder(parentDir string, name string) (models.WorkspaceFile, error) {
	return a.files.CreateWorkspaceFolder(parentDir, name)
}

// DeleteWorkspaceItem removes a file or folder in the workspace.
func (a *App) DeleteWorkspaceItem(path string, isDir bool) error {
	return a.files.DeleteWorkspaceItem(path, isDir)
}

// RenameWorkspaceItem renames a file or folder in the workspace.
func (a *App) RenameWorkspaceItem(oldPath string, newName string) (models.WorkspaceFile, error) {
	return a.files.RenameWorkspaceItem(oldPath, newName)
}

// WatchFile registers a file for external modification monitoring.
func (a *App) WatchFile(path string, lastModified string) {
	a.files.WatchFile(path, lastModified)
}

// UnwatchFile removes a file from external modification monitoring.
func (a *App) UnwatchFile(path string) {
	a.files.UnwatchFile(path)
}

func (a *App) SaveImageFile(documentPath string, imageData []byte, imageName string) (models.SaveImageResult, error) {
	return a.files.SaveImageFile(documentPath, imageData, imageName)
}

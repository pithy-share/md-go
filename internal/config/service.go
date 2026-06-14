package config

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"md-go/internal/models"
)

const maxRecentDocuments = 12

// Service persists editor configuration in the user's config directory.
type Service struct {
	path string
}

func NewService(appName string) *Service {
	baseDir, err := os.UserConfigDir()
	if err != nil || baseDir == "" {
		baseDir = "."
	}

	return &Service{
		path: filepath.Join(baseDir, appName, "config.json"),
	}
}

func DefaultConfig() models.AppConfig {
	return models.AppConfig{
		Theme:                "system",
		AutoSave:             true,
		AutoSaveDelay:        1200,
		ShowSidebar:          true,
		ShowOutline:          true,
		EditorMode:           "rendered",
		EditorFontSize:       16,
		WorkspacePath:        "",
		OpenTabPaths:         []string{},
		ActiveTabPath:        "",
		CollapsedFolderPaths: []string{},
		WorkspaceStates:      map[string]models.WorkspaceSessionState{},
		RecentDocuments:      []models.RecentDocument{},
	}
}

func (s *Service) LoadConfig() (models.AppConfig, error) {
	data, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return DefaultConfig(), nil
	}
	if err != nil {
		return DefaultConfig(), err
	}

	config := DefaultConfig()
	if err := json.Unmarshal(data, &config); err != nil {
		return DefaultConfig(), nil
	}

	return normalizeConfig(config), nil
}

func (s *Service) SaveConfig(config models.AppConfig) (models.AppConfig, error) {
	config = normalizeConfig(config)
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return config, err
	}

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return config, err
	}

	return config, os.WriteFile(s.path, data, 0o600)
}

func (s *Service) GetRecentDocuments() ([]models.RecentDocument, error) {
	config, err := s.LoadConfig()
	if err != nil {
		return []models.RecentDocument{}, err
	}
	return config.RecentDocuments, nil
}

// GetConfigPath returns the directory where config files are stored.
func (s *Service) GetConfigPath() string {
	return filepath.Dir(s.path)
}

func (s *Service) TouchRecentDocument(path string) error {
	return s.touchRecentPath(path, "file")
}

func (s *Service) TouchRecentFolder(path string) error {
	if strings.TrimSpace(path) == "" {
		return nil
	}
	if err := s.touchRecentPath(path, "folder"); err != nil {
		return err
	}
	return s.SetWorkspacePath(path)
}

func (s *Service) SetWorkspacePath(path string) error {
	config, err := s.LoadConfig()
	if err != nil {
		return err
	}
	if strings.TrimSpace(path) == "" {
		config.WorkspacePath = ""
	} else {
		config.WorkspacePath = filepath.Clean(path)
	}
	_, err = s.SaveConfig(config)
	return err
}

func (s *Service) touchRecentPath(path string, itemType string) error {
	if path == "" {
		return nil
	}
	if itemType != "folder" {
		itemType = "file"
	}

	config, err := s.LoadConfig()
	if err != nil {
		return err
	}

	path = filepath.Clean(path)
	entry := models.RecentDocument{
		Path:         path,
		Name:         filepath.Base(path),
		Type:         itemType,
		LastOpenedAt: time.Now().Format(time.RFC3339),
	}

	recent := []models.RecentDocument{entry}
	for _, item := range config.RecentDocuments {
		itemType := normalizeRecentType(item.Type)
		if filepath.Clean(item.Path) == path && itemType == entry.Type {
			continue
		}
		item.Type = itemType
		recent = append(recent, item)
		if len(recent) >= maxRecentDocuments {
			break
		}
	}

	config.RecentDocuments = recent
	_, err = s.SaveConfig(config)
	return err
}

func normalizeConfig(config models.AppConfig) models.AppConfig {
	if config.Theme == "" {
		config.Theme = "system"
	}
	if config.AutoSaveDelay <= 0 {
		config.AutoSaveDelay = 1200
	}
	if config.EditorMode != "source" && config.EditorMode != "rendered" {
		config.EditorMode = "rendered"
	}
	if config.EditorFontSize < 10 || config.EditorFontSize > 32 {
		config.EditorFontSize = 16
	}
	if strings.TrimSpace(config.WorkspacePath) != "" {
		config.WorkspacePath = filepath.Clean(config.WorkspacePath)
	}
	if config.OpenTabPaths == nil {
		config.OpenTabPaths = []string{}
	}
	config.OpenTabPaths = normalizeOpenTabPaths(config.OpenTabPaths)
	if strings.TrimSpace(config.ActiveTabPath) != "" {
		config.ActiveTabPath = filepath.Clean(config.ActiveTabPath)
	}
	if config.CollapsedFolderPaths == nil {
		config.CollapsedFolderPaths = []string{}
	}
	config.CollapsedFolderPaths = normalizeCollapsedFolderPaths(config.CollapsedFolderPaths)
	if config.WorkspaceStates == nil {
		config.WorkspaceStates = map[string]models.WorkspaceSessionState{}
	}
	config.WorkspaceStates = normalizeWorkspaceStates(config.WorkspaceStates)
	if config.RecentDocuments == nil {
		config.RecentDocuments = []models.RecentDocument{}
	}
	config.RecentDocuments = normalizeRecentDocuments(config.RecentDocuments)
	if config.Hotkeys == nil || len(config.Hotkeys) == 0 {
		config.Hotkeys = models.DefaultHotkeys()
	}
	return config
}

func normalizeOpenTabPaths(paths []string) []string {
	normalized := make([]string, 0, len(paths))
	seen := map[string]struct{}{}

	for _, path := range paths {
		path = strings.TrimSpace(path)
		if path == "" {
			continue
		}
		path = filepath.Clean(path)
		if _, exists := seen[path]; exists {
			continue
		}
		seen[path] = struct{}{}
		normalized = append(normalized, path)
	}

	return normalized
}

func normalizeRecentDocuments(items []models.RecentDocument) []models.RecentDocument {
	recent := make([]models.RecentDocument, 0, len(items))
	seen := map[string]struct{}{}

	for _, item := range items {
		if item.Path == "" {
			continue
		}
		item.Path = filepath.Clean(item.Path)
		item.Type = normalizeRecentType(item.Type)
		if item.Name == "" {
			item.Name = filepath.Base(item.Path)
		}

		key := item.Type + "\x00" + item.Path
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}

		recent = append(recent, item)
		if len(recent) >= maxRecentDocuments {
			break
		}
	}
	return recent
}

func normalizeWorkspaceStates(items map[string]models.WorkspaceSessionState) map[string]models.WorkspaceSessionState {
	normalized := make(map[string]models.WorkspaceSessionState, len(items))

	for workspacePath, state := range items {
		workspacePath = strings.TrimSpace(workspacePath)
		if workspacePath == "" {
			continue
		}
		workspacePath = filepath.Clean(workspacePath)
		normalized[workspacePath] = models.WorkspaceSessionState{
			OpenTabPaths:         normalizeOpenTabPaths(state.OpenTabPaths),
			ActiveTabPath:        normalizeOptionalFilePath(state.ActiveTabPath),
			CollapsedFolderPaths: normalizeCollapsedFolderPaths(state.CollapsedFolderPaths),
		}
	}

	return normalized
}

func normalizeCollapsedFolderPaths(paths []string) []string {
	normalized := make([]string, 0, len(paths))
	seen := map[string]struct{}{}

	for _, path := range paths {
		path = normalizeFolderID(path)
		if path == "" {
			continue
		}
		if _, exists := seen[path]; exists {
			continue
		}
		seen[path] = struct{}{}
		normalized = append(normalized, path)
	}

	return normalized
}

func normalizeOptionalFilePath(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}
	return filepath.Clean(path)
}

func normalizeFolderID(path string) string {
	path = strings.TrimSpace(path)
	path = strings.ReplaceAll(path, "\\", "/")
	return strings.Trim(path, "/")
}

func normalizeRecentType(itemType string) string {
	if itemType == "folder" {
		return "folder"
	}
	return "file"
}

// AppendDebugLog appends a timestamped message to debug.log in the config directory.
func (s *Service) AppendDebugLog(msg string) {
	logPath := filepath.Join(filepath.Dir(s.path), "debug.log")
	_ = os.MkdirAll(filepath.Dir(logPath), 0o755)
	line := time.Now().Format("2006-01-02 15:04:05") + " " + msg + "\n"
	f, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	_, _ = f.WriteString(line)
}

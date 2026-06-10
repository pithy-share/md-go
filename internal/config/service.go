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
		Theme:           "system",
		AutoSave:        true,
		AutoSaveDelay:   1200,
		ShowSidebar:     true,
		ShowOutline:     true,
		EditorMode:      "rendered",
		WorkspacePath:   "",
		RecentDocuments: []models.RecentDocument{},
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
	if strings.TrimSpace(config.WorkspacePath) != "" {
		config.WorkspacePath = filepath.Clean(config.WorkspacePath)
	}
	if config.RecentDocuments == nil {
		config.RecentDocuments = []models.RecentDocument{}
	}
	config.RecentDocuments = normalizeRecentDocuments(config.RecentDocuments)
	if config.Hotkeys == nil || len(config.Hotkeys) == 0 {
		config.Hotkeys = models.DefaultHotkeys()
	}
	return config
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

func normalizeRecentType(itemType string) string {
	if itemType == "folder" {
		return "folder"
	}
	return "file"
}

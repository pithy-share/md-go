package config

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
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

func (s *Service) TouchRecentDocument(path string) error {
	if path == "" {
		return nil
	}

	config, err := s.LoadConfig()
	if err != nil {
		return err
	}

	path = filepath.Clean(path)
	entry := models.RecentDocument{
		Path:         path,
		Name:         filepath.Base(path),
		LastOpenedAt: time.Now().Format(time.RFC3339),
	}

	recent := []models.RecentDocument{entry}
	for _, item := range config.RecentDocuments {
		if filepath.Clean(item.Path) == path {
			continue
		}
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
	if config.RecentDocuments == nil {
		config.RecentDocuments = []models.RecentDocument{}
	}
	if len(config.RecentDocuments) > maxRecentDocuments {
		config.RecentDocuments = config.RecentDocuments[:maxRecentDocuments]
	}
	return config
}

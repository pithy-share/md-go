package files

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"md-go/internal/config"
	"md-go/internal/models"
)

var markdownFilters = []runtime.FileFilter{
	{DisplayName: "Markdown Files (*.md;*.markdown;*.mdown)", Pattern: "*.md;*.markdown;*.mdown"},
	{DisplayName: "Text Files (*.txt)", Pattern: "*.txt"},
	{DisplayName: "All Files (*.*)", Pattern: "*.*"},
}

// Service handles document IO and file picker integration.
type Service struct {
	ctx    context.Context
	config *config.Service
}

func NewService(configService *config.Service) *Service {
	return &Service{config: configService}
}

func (s *Service) SetContext(ctx context.Context) {
	s.ctx = ctx
}

func (s *Service) NewDocument() models.DocumentMeta {
	return models.DocumentMeta{
		Title:   "Untitled.md",
		Content: "# Untitled\n\n",
		Path:    "",
	}
}

func (s *Service) OpenDocument() (models.DocumentPayload, error) {
	if s.ctx == nil {
		return models.DocumentPayload{}, errors.New("application context is not ready")
	}

	path, err := runtime.OpenFileDialog(s.ctx, runtime.OpenDialogOptions{
		Title:   "Open Markdown Document",
		Filters: markdownFilters,
	})
	if err != nil {
		return models.DocumentPayload{}, err
	}
	if path == "" {
		return models.DocumentPayload{}, nil
	}

	return s.ReadDocument(path)
}

func (s *Service) ReadDocument(path string) (models.DocumentPayload, error) {
	if strings.TrimSpace(path) == "" {
		return models.DocumentPayload{}, errors.New("path is required")
	}

	path = filepath.Clean(path)
	data, err := os.ReadFile(path)
	if err != nil {
		return models.DocumentPayload{}, err
	}

	info, err := os.Stat(path)
	if err != nil {
		return models.DocumentPayload{}, err
	}

	if s.config != nil {
		_ = s.config.TouchRecentDocument(path)
	}

	return models.DocumentPayload{
		Path:         path,
		Name:         filepath.Base(path),
		Content:      string(data),
		Exists:       true,
		LastModified: info.ModTime().Format(time.RFC3339),
	}, nil
}

func (s *Service) SaveDocument(path string, content string) (models.SaveResult, error) {
	if strings.TrimSpace(path) == "" {
		return s.SaveDocumentAs(content)
	}

	path = ensureMarkdownExtension(filepath.Clean(path))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return models.SaveResult{}, err
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return models.SaveResult{}, err
	}

	if s.config != nil {
		_ = s.config.TouchRecentDocument(path)
	}

	return models.SaveResult{
		Path:    path,
		Name:    filepath.Base(path),
		SavedAt: time.Now().Format(time.RFC3339),
	}, nil
}

func (s *Service) SaveDocumentAs(content string) (models.SaveResult, error) {
	if s.ctx == nil {
		return models.SaveResult{}, errors.New("application context is not ready")
	}

	path, err := runtime.SaveFileDialog(s.ctx, runtime.SaveDialogOptions{
		Title:           "Save Markdown Document",
		DefaultFilename: "Untitled.md",
		Filters:         markdownFilters,
	})
	if err != nil {
		return models.SaveResult{}, err
	}
	if path == "" {
		return models.SaveResult{}, nil
	}

	return s.SaveDocument(path, content)
}

func ensureMarkdownExtension(path string) string {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".md", ".markdown", ".mdown", ".txt":
		return path
	default:
		return path + ".md"
	}
}

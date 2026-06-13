package export

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"md-go/internal/models"
)

var htmlFilters = []runtime.FileFilter{
	{DisplayName: "HTML Files (*.html)", Pattern: "*.html"},
	{DisplayName: "All Files (*.*)", Pattern: "*.*"},
}

// Service handles document export workflows.
type Service struct {
	ctx context.Context
}

func NewService() *Service {
	return &Service{}
}

func (s *Service) SetContext(ctx context.Context) {
	s.ctx = ctx
}

func (s *Service) ExportHTML(payload models.ExportPayload) (models.SaveResult, error) {
	if s.ctx == nil {
		return models.SaveResult{}, errors.New("application context is not ready")
	}
	if strings.TrimSpace(payload.HTML) == "" {
		return models.SaveResult{}, errors.New("html content is required")
	}

	filename := payload.Title
	if strings.TrimSpace(filename) == "" {
		filename = "document"
	}
	filename = strings.TrimSuffix(filename, filepath.Ext(filename)) + ".html"

	path, err := runtime.SaveFileDialog(s.ctx, runtime.SaveDialogOptions{
		Title:           "Export HTML",
		DefaultFilename: filename,
		Filters:         htmlFilters,
	})
	if err != nil {
		return models.SaveResult{}, err
	}
	if path == "" {
		return models.SaveResult{}, nil
	}
	if strings.ToLower(filepath.Ext(path)) != ".html" {
		path += ".html"
	}

	if err := os.WriteFile(path, []byte(payload.HTML), 0o644); err != nil {
		return models.SaveResult{}, err
	}

	return models.SaveResult{
		Path:    path,
		Name:    filepath.Base(path),
		SavedAt: time.Now().Format(time.RFC3339),
	}, nil
}

var pdfFilters = []runtime.FileFilter{
	{DisplayName: "PDF Files (*.pdf)", Pattern: "*.pdf"},
	{DisplayName: "All Files (*.*)", Pattern: "*.*"},
}

func (s *Service) ExportPDF(payload models.ExportPdfPayload) (models.SaveResult, error) {
	if s.ctx == nil {
		return models.SaveResult{}, errors.New("application context is not ready")
	}
	if strings.TrimSpace(payload.PDF) == "" {
		return models.SaveResult{}, errors.New("pdf content is required")
	}

	filename := payload.Title
	if strings.TrimSpace(filename) == "" {
		filename = "document"
	}
	filename = strings.TrimSuffix(filename, filepath.Ext(filename)) + ".pdf"

	path, err := runtime.SaveFileDialog(s.ctx, runtime.SaveDialogOptions{
		Title:           "Export PDF",
		DefaultFilename: filename,
		Filters:         pdfFilters,
	})
	if err != nil {
		return models.SaveResult{}, err
	}
	if path == "" {
		return models.SaveResult{}, nil
	}
	if strings.ToLower(filepath.Ext(path)) != ".pdf" {
		path += ".pdf"
	}

	data, err := base64.StdEncoding.DecodeString(payload.PDF)
	if err != nil {
		return models.SaveResult{}, fmt.Errorf("failed to decode PDF data: %w", err)
	}

	if err := os.WriteFile(path, data, 0o644); err != nil {
		return models.SaveResult{}, err
	}

	return models.SaveResult{
		Path:    path,
		Name:    filepath.Base(path),
		SavedAt: time.Now().Format(time.RFC3339),
	}, nil
}

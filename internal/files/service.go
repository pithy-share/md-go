package files

import (
	"context"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"md-go/internal/config"
	"md-go/internal/models"
)

var markdownFilters = []runtime.FileFilter{
	{DisplayName: "Markdown Files (*.md;*.markdown;*.mdown;*.mkd)", Pattern: "*.md;*.markdown;*.mdown;*.mkd"},
	{DisplayName: "Text Files (*.txt)", Pattern: "*.txt"},
	{DisplayName: "All Files (*.*)", Pattern: "*.*"},
}

var skippedWorkspaceDirs = map[string]struct{}{
	".git":         {},
	".hg":          {},
	".svn":         {},
	".wails-seed":  {},
	"build":        {},
	"dist":         {},
	"node_modules": {},
	"vendor":       {},
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

func (s *Service) OpenFolder() (models.Workspace, error) {
	if s.ctx == nil {
		return models.Workspace{}, errors.New("application context is not ready")
	}

	path, err := runtime.OpenDirectoryDialog(s.ctx, runtime.OpenDialogOptions{
		Title: "Open Folder",
	})
	if err != nil {
		return models.Workspace{}, err
	}
	if path == "" {
		return models.Workspace{}, nil
	}

	return s.ScanFolder(path)
}

func (s *Service) ScanFolder(path string) (models.Workspace, error) {
	if strings.TrimSpace(path) == "" {
		return models.Workspace{}, errors.New("path is required")
	}

	root := filepath.Clean(path)
	info, err := os.Stat(root)
	if err != nil {
		return models.Workspace{}, err
	}
	if !info.IsDir() {
		return models.Workspace{}, errors.New("path is not a folder")
	}

	workspace := models.Workspace{
		RootPath: root,
		Name:     filepath.Base(root),
		Files:    []models.WorkspaceFile{},
	}

	err = filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}

		if entry.IsDir() {
			if path == root {
				return nil
			}
			if shouldSkipWorkspaceDir(entry.Name()) {
				return filepath.SkipDir
			}
			return nil
		}

		if !isWorkspaceMarkdownFile(path) {
			return nil
		}

		info, err := entry.Info()
		if err != nil {
			return nil
		}

		relativePath, err := filepath.Rel(root, path)
		if err != nil {
			relativePath = filepath.Base(path)
		}
		relativePath = filepath.ToSlash(relativePath)

		workspace.Files = append(workspace.Files, models.WorkspaceFile{
			Path:         filepath.Clean(path),
			Name:         entry.Name(),
			RelativePath: relativePath,
			Depth:        strings.Count(relativePath, "/"),
			Size:         info.Size(),
			ModifiedAt:   info.ModTime().Format(time.RFC3339),
		})
		return nil
	})
	if err != nil {
		return models.Workspace{}, err
	}

	sort.Slice(workspace.Files, func(i, j int) bool {
		return strings.ToLower(workspace.Files[i].RelativePath) < strings.ToLower(workspace.Files[j].RelativePath)
	})

	if s.config != nil {
		_ = s.config.TouchRecentFolder(root)
	}

	return workspace, nil
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

// PickMdFile opens a native file dialog filtered to .md files and returns the selected path.
// It does NOT read the file content; callers use the path for linking.
func (s *Service) PickMdFile() (string, error) {
	if s.ctx == nil {
		return "", errors.New("application context is not ready")
	}

	path, err := runtime.OpenFileDialog(s.ctx, runtime.OpenDialogOptions{
		Title:   "Select Markdown File",
		Filters: markdownFilters,
	})
	if err != nil {
		return "", err
	}
	return path, nil
}

func shouldSkipWorkspaceDir(name string) bool {
	if name == "" {
		return false
	}
	if strings.HasPrefix(name, ".") {
		return true
	}
	_, skip := skippedWorkspaceDirs[strings.ToLower(name)]
	return skip
}

func isWorkspaceMarkdownFile(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".md", ".markdown", ".mdown", ".mkd":
		return true
	default:
		return false
	}
}

func ensureMarkdownExtension(path string) string {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".md", ".markdown", ".mdown", ".mkd", ".txt":
		return path
	default:
		return path + ".md"
	}
}

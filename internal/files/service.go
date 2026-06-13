package files

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
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

	watcherMu    sync.Mutex
	watchedFiles map[string]time.Time // path -> last known ModTime
	watchedHash  map[string]string    // path -> sha256 hex of last known content
	watcherDone  chan struct{}
}

func NewService(configService *config.Service) *Service {
	return &Service{config: configService, watchedFiles: make(map[string]time.Time), watchedHash: make(map[string]string)}
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

// ── File watcher ──

// fileHash returns the SHA-256 hex digest of the file at path.
func fileHash(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", h.Sum(nil)), nil
}

// startFileWatcher begins polling watched files for external modifications.
// Emits "file-external-change" Wails events when a file's content hash changes.
func (s *Service) startFileWatcher() {
	s.watcherDone = make(chan struct{})
	ticker := time.NewTicker(2 * time.Second)
	go func() {
		for {
			select {
			case <-ticker.C:
				s.pollWatchedFiles()
			case <-s.watcherDone:
				ticker.Stop()
				return
			}
		}
	}()
}

func (s *Service) pollWatchedFiles() {
	s.watcherMu.Lock()
	paths := make([]string, 0, len(s.watchedFiles))
	for p := range s.watchedFiles {
		paths = append(paths, p)
	}
	s.watcherMu.Unlock()

	if s.ctx == nil {
		return
	}

	for _, p := range paths {
		info, err := os.Stat(p)
		if err != nil {
			// File deleted — remove from watch and notify
			s.watcherMu.Lock()
			delete(s.watchedFiles, p)
			delete(s.watchedHash, p)
			s.watcherMu.Unlock()
			runtime.EventsEmit(s.ctx, "file-external-change", p, "")
			continue
		}

		modTime := info.ModTime()
		s.watcherMu.Lock()
		lastKnown, exists := s.watchedFiles[p]
		s.watcherMu.Unlock()

		if !exists {
			continue
		}

		if !modTime.After(lastKnown) {
			continue
		}

		// ModTime changed — verify content actually differs before emitting
		newModStr := modTime.Format(time.RFC3339)
		newHash, hashErr := fileHash(p)

		s.watcherMu.Lock()
		oldHash, hadHash := s.watchedHash[p]
		s.watchedFiles[p] = modTime
		if hashErr == nil {
			s.watchedHash[p] = newHash
		}
		s.watcherMu.Unlock()

		// If we have both old and new hashes and they match, content didn't change — skip
		if hadHash && hashErr == nil && oldHash == newHash {
			continue
		}

		// Content changed (or we couldn't hash) — notify frontend
		runtime.EventsEmit(s.ctx, "file-external-change", p, newModStr)
	}
}

// WatchFile registers a file path for external modification monitoring.
// lastModified is informational only; the stored ModTime comes from os.Stat to
// avoid precision mismatches between RFC3339 parsing and filesystem timestamps.
func (s *Service) WatchFile(path string, lastModified string) {
	if path == "" {
		return
	}
	path = filepath.Clean(path)

	// Use the file's own ModTime so poll comparisons are exact
	info, err := os.Stat(path)
	var modTime time.Time
	if err == nil {
		modTime = info.ModTime()
	} else {
		modTime, _ = time.Parse(time.RFC3339, lastModified)
	}

	hash, _ := fileHash(path)

	s.watcherMu.Lock()
	s.watchedFiles[path] = modTime
	if hash != "" {
		s.watchedHash[path] = hash
	}
	if s.watcherDone == nil {
		s.startFileWatcher()
	}
	s.watcherMu.Unlock()
}

// UnwatchFile removes a file from external modification monitoring.
func (s *Service) UnwatchFile(path string) {
	if path == "" {
		return
	}
	path = filepath.Clean(path)
	s.watcherMu.Lock()
	delete(s.watchedFiles, path)
	delete(s.watchedHash, path)
	s.watcherMu.Unlock()
}

// StopFileWatcher terminates the background file watcher goroutine.
func (s *Service) StopFileWatcher() {
	s.watcherMu.Lock()
	defer s.watcherMu.Unlock()
	if s.watcherDone != nil {
		close(s.watcherDone)
		s.watcherDone = nil
	}
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

// CreateWorkspaceFile creates a new empty Markdown file under parentDir.
func (s *Service) CreateWorkspaceFile(parentDir, name string) (models.WorkspaceFile, error) {
	if strings.TrimSpace(parentDir) == "" {
		return models.WorkspaceFile{}, errors.New("parent directory is required")
	}
	if strings.TrimSpace(name) == "" {
		return models.WorkspaceFile{}, errors.New("file name is required")
	}
	if strings.ContainsAny(name, "/\\<>:\"|?*") {
		return models.WorkspaceFile{}, errors.New("file name contains invalid characters")
	}

	parentDir = filepath.Clean(parentDir)
	name = ensureMarkdownExtension(name)

	targetPath := filepath.Join(parentDir, name)
	targetPath = filepath.Clean(targetPath)

	// Check for name conflict
	if _, err := os.Stat(targetPath); err == nil {
		return models.WorkspaceFile{}, fmt.Errorf("a file or folder named %q already exists", name)
	}

	f, err := os.Create(targetPath)
	if err != nil {
		return models.WorkspaceFile{}, err
	}
	defer f.Close()

	content := "# " + strings.TrimSuffix(name, filepath.Ext(name)) + "\n\n"
	if _, err := f.WriteString(content); err != nil {
		return models.WorkspaceFile{}, err
	}

	info, err := os.Stat(targetPath)
	if err != nil {
		return models.WorkspaceFile{}, err
	}

	if s.config != nil {
		_ = s.config.TouchRecentDocument(targetPath)
	}

	return models.WorkspaceFile{
		Path:       targetPath,
		Name:       filepath.Base(targetPath),
		Size:       info.Size(),
		ModifiedAt: info.ModTime().Format(time.RFC3339),
	}, nil
}

// CreateWorkspaceFolder creates a new directory under parentDir.
func (s *Service) CreateWorkspaceFolder(parentDir, name string) (models.WorkspaceFile, error) {
	if strings.TrimSpace(parentDir) == "" {
		return models.WorkspaceFile{}, errors.New("parent directory is required")
	}
	if strings.TrimSpace(name) == "" {
		return models.WorkspaceFile{}, errors.New("folder name is required")
	}
	if strings.ContainsAny(name, "/\\<>:\"|?*") {
		return models.WorkspaceFile{}, errors.New("folder name contains invalid characters")
	}

	parentDir = filepath.Clean(parentDir)
	targetPath := filepath.Join(parentDir, name)
	targetPath = filepath.Clean(targetPath)

	// Check for name conflict
	if _, err := os.Stat(targetPath); err == nil {
		return models.WorkspaceFile{}, fmt.Errorf("a file or folder named %q already exists", name)
	}

	if err := os.Mkdir(targetPath, 0o755); err != nil {
		return models.WorkspaceFile{}, err
	}

	return models.WorkspaceFile{
		Path: targetPath,
		Name: filepath.Base(targetPath),
	}, nil
}

// DeleteWorkspaceItem removes a file or directory at the given path.
func (s *Service) DeleteWorkspaceItem(path string, isDir bool) error {
	if strings.TrimSpace(path) == "" {
		return errors.New("path is required")
	}

	path = filepath.Clean(path)

	if isDir {
		if err := os.RemoveAll(path); err != nil {
			return err
		}
	} else {
		if err := os.Remove(path); err != nil {
			return err
		}
	}

	return nil
}

// RenameWorkspaceItem renames a file or directory.
func (s *Service) RenameWorkspaceItem(oldPath, newName string) (models.WorkspaceFile, error) {
	if strings.TrimSpace(oldPath) == "" {
		return models.WorkspaceFile{}, errors.New("path is required")
	}
	if strings.TrimSpace(newName) == "" {
		return models.WorkspaceFile{}, errors.New("new name is required")
	}
	if strings.ContainsAny(newName, "/\\<>:\"|?*") {
		return models.WorkspaceFile{}, errors.New("new name contains invalid characters")
	}

	oldPath = filepath.Clean(oldPath)
	parentDir := filepath.Dir(oldPath)
	newPath := filepath.Join(parentDir, newName)
	newPath = filepath.Clean(newPath)

	// Check for name conflict when target differs from source
	if oldPath != newPath {
		if _, err := os.Stat(newPath); err == nil {
			return models.WorkspaceFile{}, fmt.Errorf("a file or folder named %q already exists", newName)
		}
	}

	if err := os.Rename(oldPath, newPath); err != nil {
		return models.WorkspaceFile{}, err
	}

	info, err := os.Stat(newPath)
	if err != nil {
		return models.WorkspaceFile{Path: newPath, Name: filepath.Base(newPath)}, nil
	}

	return models.WorkspaceFile{
		Path:       newPath,
		Name:       filepath.Base(newPath),
		Size:       info.Size(),
		ModifiedAt: info.ModTime().Format(time.RFC3339),
	}, nil
}

// SaveImageFile saves raw image bytes to an assets/ directory next to the document.
// If documentPath is empty, the image is saved alongside a temp location and the
// absolute path is returned.  Callers should fall back to Base64 data URLs in that case.
// The target directory is created automatically.  Name collisions are resolved by
// appending "-1", "-2", etc. before the extension.
func (s *Service) SaveImageFile(documentPath string, imageData []byte, imageName string) (models.SaveImageResult, error) {
	if len(imageData) == 0 {
		return models.SaveImageResult{}, errors.New("image data is empty")
	}
	imageName = sanitizeImageName(imageName)
	if imageName == "" {
		return models.SaveImageResult{}, errors.New("invalid image name")
	}

	var dir string
	if documentPath != "" {
		dir = filepath.Join(filepath.Dir(filepath.Clean(documentPath)), "assets")
	} else {
		dir = filepath.Join(os.TempDir(), "md-go-images")
	}

	if err := os.MkdirAll(dir, 0o755); err != nil {
		return models.SaveImageResult{}, err
	}

	targetPath := filepath.Join(dir, imageName)
	targetPath = resolveNameCollision(targetPath)

	if err := os.WriteFile(targetPath, imageData, 0o644); err != nil {
		return models.SaveImageResult{}, err
	}

	var relativePath string
	if documentPath != "" {
		docDir := filepath.Dir(filepath.Clean(documentPath))
		rel, err := filepath.Rel(docDir, targetPath)
		if err != nil {
			relativePath = imageName
		} else {
			relativePath = filepath.ToSlash(rel)
		}
	}

	return models.SaveImageResult{
		Path:         targetPath,
		RelativePath: relativePath,
	}, nil
}

func sanitizeImageName(name string) string {
	name = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' || r == '.' {
			return r
		}
		return '_'
	}, name)
	ext := strings.ToLower(filepath.Ext(name))
	if ext != ".png" && ext != ".jpg" && ext != ".jpeg" && ext != ".gif" && ext != ".webp" && ext != ".bmp" && ext != ".svg" {
		name += ".png"
	}
	return name
}

func resolveNameCollision(path string) string {
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return path
	}
	ext := filepath.Ext(path)
	base := path[:len(path)-len(ext)]
	for i := 1; i < 1000; i++ {
		candidate := base + "-" + strconv.Itoa(i) + ext
		if _, err := os.Stat(candidate); os.IsNotExist(err) {
			return candidate
		}
	}
	return path
}

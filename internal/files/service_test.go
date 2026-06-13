package files

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWorkspaceOperationsRejectPathsOutsideRoot(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()

	service := NewService(nil)
	if _, err := service.ScanFolder(root); err != nil {
		t.Fatalf("ScanFolder() error = %v", err)
	}

	if _, err := service.CreateWorkspaceFile(outside, "note.md"); err == nil || !strings.Contains(err.Error(), "outside") {
		t.Fatalf("CreateWorkspaceFile() error = %v, want outside workspace error", err)
	}

	outsideFile := filepath.Join(outside, "note.md")
	if err := os.WriteFile(outsideFile, []byte("# outside\n"), 0o644); err != nil {
		t.Fatalf("write outside file: %v", err)
	}
	if _, err := service.RenameWorkspaceItem(outsideFile, "renamed.md"); err == nil || !strings.Contains(err.Error(), "outside") {
		t.Fatalf("RenameWorkspaceItem() error = %v, want outside workspace error", err)
	}
}

func TestSearchWorkspaceFindsMarkdownMatches(t *testing.T) {
	root := t.TempDir()
	nested := filepath.Join(root, "docs")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(nested, "guide.md"), []byte("# Guide\n\nAlpha beta\nSecond alpha line\n"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(nested, "ignore.txt"), []byte("alpha\n"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	service := NewService(nil)
	if _, err := service.ScanFolder(root); err != nil {
		t.Fatalf("ScanFolder() error = %v", err)
	}

	results, err := service.SearchWorkspace("alpha")
	if err != nil {
		t.Fatalf("SearchWorkspace() error = %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("SearchWorkspace() returned %d results, want 2", len(results))
	}
	if results[0].RelativePath != "docs/guide.md" || results[0].Line != 3 || results[0].Column != 1 {
		t.Fatalf("first result = %+v, want guide.md line 3 column 1", results[0])
	}
	if results[1].Line != 4 {
		t.Fatalf("second result line = %d, want 4", results[1].Line)
	}
}

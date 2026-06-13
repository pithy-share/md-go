package export

import (
	"encoding/base64"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPdfFallbackHTMLPath(t *testing.T) {
	cases := map[string]string{
		filepath.Join("tmp", "note.pdf"): filepath.Join("tmp", "note.html"),
		filepath.Join("tmp", "note"):     filepath.Join("tmp", "note.html"),
		filepath.Join("tmp", "note.PDF"): filepath.Join("tmp", "note.html"),
	}
	for input, want := range cases {
		if got := pdfFallbackHTMLPath(input); got != want {
			t.Fatalf("pdfFallbackHTMLPath(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestPrepareHTMLForExportEmbedsLocalImages(t *testing.T) {
	projectDir := t.TempDir()
	sourcePath := filepath.Join(projectDir, "docs", "note.md")
	if err := os.MkdirAll(filepath.Dir(sourcePath), 0o755); err != nil {
		t.Fatalf("create document directory: %v", err)
	}
	if err := os.WriteFile(sourcePath, []byte("# note\n"), 0o644); err != nil {
		t.Fatalf("write source document: %v", err)
	}

	imageDir := filepath.Join(filepath.Dir(sourcePath), "images")
	if err := os.MkdirAll(imageDir, 0o755); err != nil {
		t.Fatalf("create image directory: %v", err)
	}

	imageBytes := []byte("png-bytes")
	imagePath := filepath.Join(imageDir, "diagram.png")
	if err := os.WriteFile(imagePath, imageBytes, 0o644); err != nil {
		t.Fatalf("write image file: %v", err)
	}

	encodedImage := base64.StdEncoding.EncodeToString(imageBytes)
	proxiedSource := "/local-image?src=" + url.QueryEscape("images/diagram.png") + "&document=" + url.QueryEscape(sourcePath)
	html := `<!doctype html><html><head><title>Export</title></head><body>` +
		`<img src="` + proxiedSource + `" data-markdown-src="images/diagram.png" alt="proxied">` +
		`<img src="images/diagram.png" alt="relative">` +
		`<img src="https://example.com/logo.png" alt="remote">` +
		`</body></html>`

	output, err := prepareHTMLForExport(html, sourcePath)
	if err != nil {
		t.Fatalf("prepareHTMLForExport returned error: %v", err)
	}

	dataURL := `data:image/png;base64,` + encodedImage
	if count := strings.Count(output, dataURL); count != 2 {
		t.Fatalf("expected 2 embedded images, got %d in output: %s", count, output)
	}
	if strings.Contains(output, `data-markdown-src=`) {
		t.Fatalf("expected data-markdown-src to be removed, output: %s", output)
	}
	if !strings.Contains(output, `src="https://example.com/logo.png"`) {
		t.Fatalf("expected remote image to remain unchanged, output: %s", output)
	}
}

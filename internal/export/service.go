package export

import (
	"context"
	"errors"
	"fmt"
	"html"
	"net/url"
	"os"
	"os/exec"
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
	if strings.TrimSpace(payload.HTML) == "" {
		return models.SaveResult{}, errors.New("html content is required")
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

	browserPath, err := findChromiumBrowser()
	if err != nil {
		return models.SaveResult{}, err
	}

	tempDir, err := os.MkdirTemp("", "md-go-pdf-*")
	if err != nil {
		return models.SaveResult{}, err
	}
	defer os.RemoveAll(tempDir)

	htmlPath := filepath.Join(tempDir, "export.html")
	tempPDFPath := filepath.Join(tempDir, "export.pdf")
	profilePath := filepath.Join(tempDir, "profile")

	htmlContent := prepareHTMLForPrint(payload.HTML, payload.SourcePath)
	if err := os.WriteFile(htmlPath, []byte(htmlContent), 0o644); err != nil {
		return models.SaveResult{}, err
	}

	if err := printHTMLToPDF(s.ctx, browserPath, htmlPath, tempPDFPath, profilePath); err != nil {
		return models.SaveResult{}, err
	}

	data, err := os.ReadFile(tempPDFPath)
	if err != nil {
		return models.SaveResult{}, err
	}
	if len(data) == 0 {
		return models.SaveResult{}, errors.New("generated PDF is empty")
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

func prepareHTMLForPrint(htmlContent string, sourcePath string) string {
	sourcePath = strings.TrimSpace(sourcePath)
	if sourcePath == "" || strings.Contains(strings.ToLower(htmlContent), "<base ") {
		return htmlContent
	}

	baseURL := localDirectoryURL(sourcePath)
	if baseURL == "" {
		return htmlContent
	}
	baseTag := "\n  <base href=\"" + html.EscapeString(baseURL) + "\">"

	lowerHTML := strings.ToLower(htmlContent)
	if headStart := strings.Index(lowerHTML, "<head>"); headStart >= 0 {
		insertAt := headStart + len("<head>")
		return htmlContent[:insertAt] + baseTag + htmlContent[insertAt:]
	}
	if headStart := strings.Index(lowerHTML, "<head "); headStart >= 0 {
		if headEnd := strings.Index(htmlContent[headStart:], ">"); headEnd >= 0 {
			insertAt := headStart + headEnd + 1
			return htmlContent[:insertAt] + baseTag + htmlContent[insertAt:]
		}
	}

	return htmlContent
}

func localDirectoryURL(path string) string {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return ""
	}
	if info, statErr := os.Stat(absolute); statErr == nil && info.IsDir() {
		absolute = filepath.Clean(absolute)
	} else {
		absolute = filepath.Dir(absolute)
	}

	fileURL := localFileURL(absolute)
	if !strings.HasSuffix(fileURL, "/") {
		fileURL += "/"
	}
	return fileURL
}

func findChromiumBrowser() (string, error) {
	candidates := []string{}
	for _, envName := range []string{"MD_GO_BROWSER", "EDGE_PATH", "CHROME_PATH"} {
		if value := strings.TrimSpace(os.Getenv(envName)); value != "" {
			candidates = append(candidates, value)
		}
	}

	for _, name := range []string{
		"msedge",
		"msedge.exe",
		"chrome",
		"chrome.exe",
		"chromium",
		"chromium.exe",
		"google-chrome",
		"google-chrome-stable",
		"chromium-browser",
	} {
		if path, err := exec.LookPath(name); err == nil {
			candidates = append(candidates, path)
		}
	}

	programFiles := os.Getenv("ProgramFiles")
	programFilesX86 := os.Getenv("ProgramFiles(x86)")
	localAppData := os.Getenv("LOCALAPPDATA")
	candidates = append(candidates,
		filepath.Join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
		filepath.Join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
		filepath.Join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
		filepath.Join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
		filepath.Join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
		filepath.Join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
		"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	)

	seen := map[string]struct{}{}
	for _, candidate := range candidates {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			continue
		}
		if _, ok := seen[candidate]; ok {
			continue
		}
		seen[candidate] = struct{}{}

		info, err := os.Stat(candidate)
		if err == nil && !info.IsDir() {
			return candidate, nil
		}
	}

	return "", errors.New("could not find Microsoft Edge or Google Chrome for PDF export")
}

func printHTMLToPDF(ctx context.Context, browserPath string, htmlPath string, pdfPath string, profilePath string) error {
	baseArgs := []string{
		"--disable-gpu",
		"--no-first-run",
		"--disable-extensions",
		"--disable-background-networking",
		"--disable-sync",
		"--allow-file-access-from-files",
		"--print-to-pdf-no-header",
		"--run-all-compositor-stages-before-draw",
		"--virtual-time-budget=1000",
		"--user-data-dir=" + profilePath,
		"--print-to-pdf=" + pdfPath,
		localFileURL(htmlPath),
	}

	var firstOutput []byte
	var firstErr error
	for index, headlessFlag := range []string{"--headless=new", "--headless"} {
		args := append([]string{headlessFlag}, baseArgs...)
		output, err := runBrowserPrintCommand(ctx, browserPath, args)
		if err == nil {
			if stat, statErr := os.Stat(pdfPath); statErr == nil && stat.Size() > 0 {
				return nil
			}
			err = errors.New("browser did not create a PDF file")
		}

		if index == 0 {
			firstOutput = output
			firstErr = err
			_ = os.Remove(pdfPath)
			continue
		}

		message := strings.TrimSpace(string(output))
		if message == "" {
			message = strings.TrimSpace(string(firstOutput))
		}
		if message != "" {
			return fmt.Errorf("failed to print PDF with %s: %w: %s", filepath.Base(browserPath), err, message)
		}
		return fmt.Errorf("failed to print PDF with %s: %w; fallback error: %v", filepath.Base(browserPath), firstErr, err)
	}

	return errors.New("failed to print PDF")
}

func runBrowserPrintCommand(ctx context.Context, browserPath string, args []string) ([]byte, error) {
	cmdCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	cmd := exec.CommandContext(cmdCtx, browserPath, args...)
	output, err := cmd.CombinedOutput()
	if cmdCtx.Err() == context.DeadlineExceeded {
		return output, errors.New("browser PDF export timed out")
	}
	return output, err
}

func localFileURL(path string) string {
	absolute, err := filepath.Abs(path)
	if err != nil {
		absolute = path
	}
	absolute = filepath.ToSlash(absolute)
	if filepath.VolumeName(absolute) != "" && !strings.HasPrefix(absolute, "/") {
		absolute = "/" + absolute
	}
	return (&url.URL{Scheme: "file", Path: absolute}).String()
}

package export

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"mime"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	xhtml "golang.org/x/net/html"

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

	htmlContent, err := prepareHTMLForExport(payload.HTML, payload.SourcePath)
	if err != nil {
		return models.SaveResult{}, err
	}
	if err := os.WriteFile(path, []byte(htmlContent), 0o644); err != nil {
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

	htmlContent, err := prepareHTMLForExport(payload.HTML, payload.SourcePath)
	if err != nil {
		return models.SaveResult{}, err
	}

	browserPath, err := findChromiumBrowser()
	if err != nil {
		return writePDFFallbackHTML(path, htmlContent)
	}

	tempDir, err := os.MkdirTemp("", "md-go-pdf-*")
	if err != nil {
		return writePDFFallbackHTML(path, htmlContent)
	}
	defer os.RemoveAll(tempDir)

	htmlPath := filepath.Join(tempDir, "export.html")
	tempPDFPath := filepath.Join(tempDir, "export.pdf")
	profilePath := filepath.Join(tempDir, "profile")

	if err := os.WriteFile(htmlPath, []byte(htmlContent), 0o644); err != nil {
		return writePDFFallbackHTML(path, htmlContent)
	}

	if err := printHTMLToPDF(s.ctx, browserPath, htmlPath, tempPDFPath, profilePath); err != nil {
		return writePDFFallbackHTML(path, htmlContent)
	}

	data, err := os.ReadFile(tempPDFPath)
	if err != nil {
		return writePDFFallbackHTML(path, htmlContent)
	}
	if len(data) == 0 {
		return writePDFFallbackHTML(path, htmlContent)
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

func pdfFallbackHTMLPath(pdfPath string) string {
	ext := filepath.Ext(pdfPath)
	if strings.EqualFold(ext, ".pdf") {
		return strings.TrimSuffix(pdfPath, ext) + ".html"
	}
	return pdfPath + ".html"
}

func writePDFFallbackHTML(path string, htmlContent string) (models.SaveResult, error) {
	fallbackPath := pdfFallbackHTMLPath(path)
	if err := os.WriteFile(fallbackPath, []byte(htmlContent), 0o644); err != nil {
		return models.SaveResult{}, err
	}
	return models.SaveResult{
		Path:         fallbackPath,
		Name:         filepath.Base(fallbackPath),
		SavedAt:      time.Now().Format(time.RFC3339),
		FallbackKind: "html",
	}, nil
}

func prepareHTMLForExport(htmlContent string, sourcePath string) (string, error) {
	document, err := xhtml.Parse(strings.NewReader(htmlContent))
	if err != nil {
		return "", fmt.Errorf("failed to parse export HTML: %w", err)
	}

	rewriteExportImages(document, sourcePath)
	ensureBaseHref(document, localDirectoryURL(sourcePath))

	var buffer bytes.Buffer
	if err := xhtml.Render(&buffer, document); err != nil {
		return "", fmt.Errorf("failed to render export HTML: %w", err)
	}
	return buffer.String(), nil
}

func rewriteExportImages(node *xhtml.Node, sourcePath string) {
	if node == nil {
		return
	}
	if node.Type == xhtml.ElementNode && strings.EqualFold(node.Data, "img") {
		rewriteExportImage(node, sourcePath)
	}
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		rewriteExportImages(child, sourcePath)
	}
}

func rewriteExportImage(node *xhtml.Node, sourcePath string) {
	currentSource := getNodeAttr(node, "src")
	originalSource := getNodeAttr(node, "data-markdown-src")
	imageSource := strings.TrimSpace(originalSource)
	if imageSource == "" {
		imageSource = strings.TrimSpace(currentSource)
	}
	if imageSource == "" {
		return
	}

	if shouldKeepImageSource(imageSource) {
		removeNodeAttr(node, "data-markdown-src")
		return
	}

	imagePath, err := resolveExportImagePath(sourcePath, imageSource)
	if err != nil {
		return
	}
	dataURL, err := imagePathToDataURL(imagePath)
	if err != nil {
		return
	}

	setNodeAttr(node, "src", dataURL)
	removeNodeAttr(node, "data-markdown-src")
}

func shouldKeepImageSource(source string) bool {
	lowerSource := strings.ToLower(strings.TrimSpace(source))
	return lowerSource == "" || strings.HasPrefix(lowerSource, "http://") || strings.HasPrefix(lowerSource, "https://") || strings.HasPrefix(lowerSource, "data:") || strings.HasPrefix(lowerSource, "blob:")
}

func resolveExportImagePath(sourcePath string, source string) (string, error) {
	source = strings.TrimSpace(source)
	if source == "" || shouldKeepImageSource(source) {
		return "", os.ErrNotExist
	}

	lowerSource := strings.ToLower(source)
	if strings.HasPrefix(lowerSource, "/local-image?") {
		parsed, err := url.Parse(source)
		if err != nil {
			return "", err
		}
		query := parsed.Query()
		documentPath := query.Get("document")
		if documentPath == "" {
			documentPath = sourcePath
		}
		return resolveDocumentImagePath(documentPath, query.Get("src"))
	}

	return resolveDocumentImagePath(sourcePath, source)
}

func resolveDocumentImagePath(documentPath string, source string) (string, error) {
	if source == "" || shouldKeepImageSource(source) {
		return "", os.ErrNotExist
	}

	decodedSource, err := url.PathUnescape(source)
	if err != nil {
		decodedSource = source
	}
	decodedSource = strings.TrimPrefix(decodedSource, "file:///")
	decodedSource = strings.TrimPrefix(decodedSource, "file://")
	decodedSource = strings.ReplaceAll(decodedSource, "/", string(filepath.Separator))

	var imagePath string
	if filepath.IsAbs(decodedSource) {
		imagePath = decodedSource
	} else {
		if documentPath == "" {
			return "", os.ErrNotExist
		}
		imagePath = filepath.Join(filepath.Dir(documentPath), decodedSource)
	}

	imagePath = filepath.Clean(imagePath)
	if !isSupportedImagePath(imagePath) {
		return "", os.ErrNotExist
	}

	info, err := os.Stat(imagePath)
	if err != nil {
		return "", err
	}
	if info.IsDir() {
		return "", os.ErrNotExist
	}
	return imagePath, nil
}

func imagePathToDataURL(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	contentType := mime.TypeByExtension(strings.ToLower(filepath.Ext(path)))
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	return "data:" + contentType + ";base64," + base64.StdEncoding.EncodeToString(data), nil
}

func isSupportedImagePath(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg":
		return true
	default:
		return false
	}
}

func ensureBaseHref(document *xhtml.Node, baseURL string) {
	if document == nil || strings.TrimSpace(baseURL) == "" {
		return
	}

	head := findFirstElement(document, "head")
	if head == nil || findFirstElement(head, "base") != nil {
		return
	}

	head.AppendChild(&xhtml.Node{
		Type: xhtml.ElementNode,
		Data: "base",
		Attr: []xhtml.Attribute{{Key: "href", Val: baseURL}},
	})
}

func findFirstElement(node *xhtml.Node, tagName string) *xhtml.Node {
	if node == nil {
		return nil
	}
	if node.Type == xhtml.ElementNode && strings.EqualFold(node.Data, tagName) {
		return node
	}
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if found := findFirstElement(child, tagName); found != nil {
			return found
		}
	}
	return nil
}

func getNodeAttr(node *xhtml.Node, key string) string {
	for _, attr := range node.Attr {
		if strings.EqualFold(attr.Key, key) {
			return attr.Val
		}
	}
	return ""
}

func setNodeAttr(node *xhtml.Node, key string, value string) {
	for index, attr := range node.Attr {
		if strings.EqualFold(attr.Key, key) {
			node.Attr[index].Val = value
			return
		}
	}
	node.Attr = append(node.Attr, xhtml.Attribute{Key: key, Val: value})
}

func removeNodeAttr(node *xhtml.Node, key string) {
	filtered := node.Attr[:0]
	for _, attr := range node.Attr {
		if strings.EqualFold(attr.Key, key) {
			continue
		}
		filtered = append(filtered, attr)
	}
	node.Attr = filtered
}

func localDirectoryURL(path string) string {
	if strings.TrimSpace(path) == "" {
		return ""
	}
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

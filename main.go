package main

import (
	"embed"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Create application with options
	err := wails.Run(&options.App{
		Title:  "MD Go",
		Width:  1280,
		Height: 860,
		AssetServer: &assetserver.Options{
			Assets:     assets,
			Middleware: localImageMiddleware,
		},
		BackgroundColour: &options.RGBA{R: 245, G: 246, B: 248, A: 1},
		OnStartup:        app.startup,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}

func localImageMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/local-image" {
			next.ServeHTTP(response, request)
			return
		}
		serveLocalImage(response, request)
	})
}

func serveLocalImage(response http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		response.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	documentPath := request.URL.Query().Get("document")
	source := request.URL.Query().Get("src")
	imagePath, err := resolveLocalImagePath(documentPath, source)
	if err != nil {
		http.Error(response, err.Error(), http.StatusBadRequest)
		return
	}

	contentType := mime.TypeByExtension(strings.ToLower(filepath.Ext(imagePath)))
	if contentType != "" {
		response.Header().Set("Content-Type", contentType)
	}
	http.ServeFile(response, request, imagePath)
}

func resolveLocalImagePath(documentPath string, source string) (string, error) {
	if source == "" || isRemoteAsset(source) {
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
		baseDir := "."
		if documentPath != "" {
			baseDir = filepath.Dir(documentPath)
		}
		imagePath = filepath.Join(baseDir, decodedSource)
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

func isRemoteAsset(source string) bool {
	lower := strings.ToLower(source)
	return strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") || strings.HasPrefix(lower, "data:") || strings.HasPrefix(lower, "blob:")
}

func isSupportedImagePath(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg":
		return true
	default:
		return false
	}
}

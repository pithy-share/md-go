package main

import (
	"context"

	configsvc "md-go/internal/config"
	exportsvc "md-go/internal/export"
	filessvc "md-go/internal/files"
	"md-go/internal/models"
)

// App is the Wails binding surface exposed to the frontend.
type App struct {
	ctx context.Context

	config *configsvc.Service
	files  *filessvc.Service
	export *exportsvc.Service
}

func NewApp() *App {
	configService := configsvc.NewService("md-go")
	return &App{
		config: configService,
		files:  filessvc.NewService(configService),
		export: exportsvc.NewService(),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.files.SetContext(ctx)
	a.export.SetContext(ctx)
}

func (a *App) NewDocument() models.DocumentMeta {
	return a.files.NewDocument()
}

func (a *App) OpenDocument() (models.DocumentPayload, error) {
	return a.files.OpenDocument()
}

func (a *App) ReadDocument(path string) (models.DocumentPayload, error) {
	return a.files.ReadDocument(path)
}

func (a *App) SaveDocument(path string, content string) (models.SaveResult, error) {
	return a.files.SaveDocument(path, content)
}

func (a *App) SaveDocumentAs(content string) (models.SaveResult, error) {
	return a.files.SaveDocumentAs(content)
}

func (a *App) GetRecentDocuments() ([]models.RecentDocument, error) {
	return a.config.GetRecentDocuments()
}

func (a *App) UpdateRecentDocument(path string) error {
	return a.config.TouchRecentDocument(path)
}

func (a *App) LoadConfig() (models.AppConfig, error) {
	return a.config.LoadConfig()
}

func (a *App) SaveConfig(config models.AppConfig) (models.AppConfig, error) {
	return a.config.SaveConfig(config)
}

func (a *App) ExportHTML(payload models.ExportPayload) (models.SaveResult, error) {
	return a.export.ExportHTML(payload)
}

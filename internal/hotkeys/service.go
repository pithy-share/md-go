package hotkeys

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"sync"

	"md-go/internal/models"
)

// Service manages keyboard shortcut (hotkey) configurations.
// Hotkeys are stored as a JSON file alongside the main config.
type Service struct {
	mu       sync.RWMutex
	filePath string
}

// NewService creates a HotkeyService that persists hotkeys to a JSON file.
func NewService(configDir string) *Service {
	return &Service{
		filePath: filepath.Join(configDir, "md-go", "hotkeys.json"),
	}
}

// LoadHotkeys loads the persisted hotkey bindings or returns defaults.
func (s *Service) LoadHotkeys() ([]models.HotkeyBinding, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := os.ReadFile(s.filePath)
	if errors.Is(err, os.ErrNotExist) {
		return cloneDefaults(), nil
	}
	if err != nil {
		return cloneDefaults(), err
	}

	var bindings []models.HotkeyBinding
	if err := json.Unmarshal(data, &bindings); err != nil {
		return cloneDefaults(), nil
	}

	// Merge with defaults to pick up any new hotkeys added in newer versions
	return mergeWithDefaults(bindings), nil
}

// SaveHotkeys persists the given hotkey bindings to disk.
func (s *Service) SaveHotkeys(bindings []models.HotkeyBinding) ([]models.HotkeyBinding, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	normalized := normalizeBindings(bindings)

	dir := filepath.Dir(s.filePath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return cloneDefaults(), err
	}

	data, err := json.MarshalIndent(normalized, "", "  ")
	if err != nil {
		return cloneDefaults(), err
	}

	if err := os.WriteFile(s.filePath, data, 0o600); err != nil {
		return cloneDefaults(), err
	}

	return normalized, nil
}

// GetHotkey returns the binding for a given action ID.
func (s *Service) GetHotkey(actionID string) (*models.HotkeyBinding, error) {
	bindings, err := s.LoadHotkeys()
	if err != nil {
		return nil, err
	}

	for i := range bindings {
		if bindings[i].ID == actionID {
			return &bindings[i], nil
		}
	}
	return nil, nil
}

// SetHotkey updates a single hotkey binding and persists.
func (s *Service) SetHotkey(binding models.HotkeyBinding) ([]models.HotkeyBinding, error) {
	bindings, err := s.LoadHotkeys()
	if err != nil {
		return bindings, err
	}

	found := false
	for i := range bindings {
		if bindings[i].ID == binding.ID {
			bindings[i] = binding
			found = true
			break
		}
	}

	if !found {
		bindings = append(bindings, binding)
	}

	return s.SaveHotkeys(bindings)
}

// ResetToDefaults discards all custom hotkeys and resets to defaults.
func (s *Service) ResetToDefaults() ([]models.HotkeyBinding, error) {
	defaults := cloneDefaults()

	dir := filepath.Dir(s.filePath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return defaultHotkeys(), nil
	}

	data, _ := json.MarshalIndent(defaults, "", "  ")
	_ = os.WriteFile(s.filePath, data, 0o600)

	return defaults, nil
}

// --- internal helpers ---

func normalizeBindings(bindings []models.HotkeyBinding) []models.HotkeyBinding {
	// Remove duplicates (last wins for same ID)
	seen := map[string]bool{}
	result := make([]models.HotkeyBinding, 0, len(bindings))

	// Iterate in reverse so first occurrence (default) is kept if no override
	for i := len(bindings) - 1; i >= 0; i-- {
		id := bindings[i].ID
		if id == "" {
			continue
		}
		if _, exists := seen[id]; !exists {
			seen[id] = true
			result = append([]models.HotkeyBinding{bindings[i]}, result...)
		}
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].ID < result[j].ID
	})

	return result
}

func cloneDefaults() []models.HotkeyBinding {
	defs := models.DefaultHotkeys()
	out := make([]models.HotkeyBinding, len(defs))
	copy(out, defs)
	sort.Slice(out, func(i, j int) bool {
		return out[i].ID < out[j].ID
	})
	return out
}

func defaultHotkeys() []models.HotkeyBinding {
	return models.DefaultHotkeys()
}

// mergeWithDefaults ensures all default hotkeys exist in the persisted list,
// adding any new ones that don't exist yet.
func mergeWithDefaults(persisted []models.HotkeyBinding) []models.HotkeyBinding {
	byID := make(map[string]models.HotkeyBinding, len(persisted))
	for _, b := range persisted {
		byID[b.ID] = b
	}

	defaults := defaultHotkeys()
	for _, d := range defaults {
		if _, exists := byID[d.ID]; !exists {
			byID[d.ID] = d
		}
	}

	result := make([]models.HotkeyBinding, 0, len(byID))
	for _, b := range byID {
		result = append(result, b)
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].ID < result[j].ID
	})

	return result
}

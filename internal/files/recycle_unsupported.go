//go:build !windows

package files

import "errors"

func moveToRecycleBin(path string) error {
	return errors.New("system recycle bin is not supported on this platform")
}

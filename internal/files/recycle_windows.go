//go:build windows

package files

import (
	"syscall"
	"unsafe"
)

const (
	foDelete        = 0x0003
	fofAllowUndo    = 0x0040
	fofNoConfirm    = 0x0010
	fofNoErrorUI    = 0x0400
	fofSilent       = 0x0004
	fofWantNukeWarn = 0x4000
)

type shFileOpStruct struct {
	hwnd                  uintptr
	wFunc                 uint32
	pFrom                 *uint16
	pTo                   *uint16
	fFlags                uint16
	fAnyOperationsAborted int32
	hNameMappings         uintptr
	lpszProgressTitle     *uint16
}

var (
	shell32         = syscall.NewLazyDLL("shell32.dll")
	shFileOperation = shell32.NewProc("SHFileOperationW")
)

func moveToRecycleBin(path string) error {
	from := syscall.StringToUTF16(path)
	from = append(from, 0)

	operation := shFileOpStruct{
		wFunc:  foDelete,
		pFrom:  &from[0],
		fFlags: fofAllowUndo | fofNoConfirm | fofNoErrorUI | fofSilent | fofWantNukeWarn,
	}

	result, _, callErr := shFileOperation.Call(uintptr(unsafe.Pointer(&operation)))
	if result != 0 {
		if callErr != syscall.Errno(0) {
			return callErr
		}
		return syscall.Errno(result)
	}
	return nil
}

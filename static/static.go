package static

import (
	"path/filepath"
	"runtime"
)

func GetPath() string {
	_, b, _, _ := runtime.Caller(0)
	return filepath.Dir(b)
}

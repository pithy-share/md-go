# Go 并发编程

## Goroutine

轻量级线程，用 `go` 关键字启动：

```go
go func() {
    fmt.Println("running in background")
}()
```

## Channel

goroutine 间通信：

```go
ch := make(chan int, 10) // 带缓冲
ch <- 42
value := <-ch
```

## sync 包

| 类型 | 用途 |
|------|------|
| `sync.WaitGroup` | 等待一组 goroutine 完成 |
| `sync.Mutex` | 互斥锁 |
| `sync.Once` | 只执行一次 |

## 口诀

> 不要通过共享内存通信，而要通过通信共享内存。

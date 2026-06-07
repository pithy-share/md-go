# AGENTS.md

- 不要使用子agent。
- 项目是 Wails v2 桌面 Markdown 编辑器：Go 后端，Vite + React + TypeScript 前端，输出文件名 `md-go`。
- 核心入口：`app.go` 暴露 Wails 方法；`internal/files/service.go` 负责文件/文件夹 IO；`internal/config/service.go` 负责配置和最近打开记录；`frontend/src/App.tsx` 编排主状态。
- 编辑器核心在 `frontend/src/editor/MarkdownEditor.tsx` 和 `frontend/src/editor/markdown.ts`；需要保持 Markdown 文本、Tiptap 文档、导出 HTML 的往返一致。
- `frontend/wailsjs/**` 是 Wails 生成绑定，优先通过 `wails build` 重新生成，不要手改。
- 已有关键行为：左侧工作区文件树，右侧大纲；渲染/源码模式持久化；最近打开支持文件和文件夹，启动时自动恢复，路径不可用时回退空文档并提示。
- 代码改动后通常验证：`npm run build`（`frontend` 下）、`go test ./...`、`wails build`。文档-only 改动无需跑完整构建。
# Git 速查

## 日常命令

| 命令 | 作用 |
|------|------|
| `git status` | 查看工作区状态 |
| `git add .` | 暂存所有改动 |
| `git commit -m "msg"` | 提交 |
| `git push` | 推送到远程 |
| `git pull` | 拉取并合并 |

## 分支

```bash
git branch feature       # 创建分支
git checkout feature     # 切换
git merge feature        # 合并到当前分支
git branch -d feature    # 删除已合并分支
```

## 撤销

- `git restore <file>` —— 撤销工作区改动
- `git reset --soft HEAD~1` —— 撤销最近一次提交（保留改动）
- `git revert <commit>` —— 用反向提交撤销（安全，不改历史）

## 小贴士

提交前用 `git diff --staged` 检查暂存内容，避免提交无关改动。

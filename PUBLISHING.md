# 发布指南 / How to get this listed

写给未来的自己（和我）：把 `dsh-life-game` 放进社区插件目录需要做什么，以及**为什么不需要、也不应该把密码交给任何 AI**。

---

## 0. 先把凭据这件事说清楚

**不要把 GitHub 密码、Personal Access Token (PAT)、SSH 私钥内容贴进对话。** 理由有三条，任何一条都足够：

1. 那是你**整个账号**的凭据，不是这个任务的凭据——它能做的事远超过"推一个仓库"。
2. 贴进对话的凭据等于泄露给了聊天记录、日志和模型上下文，且**无法收回**（改密码也换不回已经暴露的那一次）。
3. 它其实**没用**：GitHub 早已不接受账号密码做 git 操作，只认 PAT 或 SSH 密钥。

那怎么办？三条安全路线，按省事程度排：

| 路线 | 你要做的 | 我能做的 |
| --- | --- | --- |
| **A. 你执行两条命令** | 网页建仓库 + 跑我给的 `git push`（凭据你自己输入） | 仓库内容、投稿文件、PR 文案、全程排错 |
| **B. SSH 密钥** | 把 `~/.ssh/id_ed25519.pub` 加到 GitHub | 之后我可以直接 `git push`，密钥始终留在本机 ssh-agent 里 |
| **C. 装 `gh` 并自己登录** | `brew install gh && gh auth login`（令牌存进系统钥匙串） | 我可以替你跑 `gh repo create` / `gh pr create`，全程看不到令牌 |

三种都成立的前提是：**凭据由你的工具保管，不经过对话**。

---

## 1. 发布到底是什么

不是 npm，是 **GitHub 仓库 + 一个 YAML 文件的 PR**。目录（awesome-dsh-plugin）里每条记录都是人工收录的 GitHub 仓库条目：

```yaml
# data/plugins/<owner>__dsh-life-game.yml
url: https://github.com/<owner>/dsh-life-game
name: <owner>/dsh-life-game
category: fun
description:
  en: '...'
  zh: '...'
```

收录要求（来自仓库的 `contributing.md`）：

- `package.json` 里声明 `dsh.bundle`（**只声明 `dsh.client` 是最常见的被拒原因**）——本仓库有。
- 仓库根有 `cordis.patch.yml`——本仓库有。
- 真实可用的代码，不是占位仓库。
- **仓库创建满 1 天**（CI 自动检查）。
- 仓库加 `dsh-plugin` topic。
- 描述必须属实，会被拿去和代码核对；不带营销词。
- 分类要贴合实际做的事；游戏归 `fun`。

npm **是可选的**：发了只是让市场多一个下载量数字，收录与否与它无关。若发，`package.json` 的 `repository` 必须指回这个 GitHub 仓库。

---

## 2. 已经做完的（不需要你动手）

- 本地 `main` 分支已提交：源码、构建产物 `lib/`、两套测试、双语文档、LICENSE、`cordis.patch.yml`、`package.json`。
- `publish-entry.yml` 已写好（把 `OWNER` 换成你的 GitHub 用户名即可）。
- `lib/` 已提交，所以 `dsh plugin --profile web add github:<你>/dsh-life-game` 不需要用户本地构建；额外加了 `prepare` 脚本做第二道保险。

## 3. 你要做的

```bash
# 1) 建一个 public 仓库，名字 dsh-life-game，不要勾选任何初始化文件
#    https://github.com/new
cd /path/to/dsh-life-game
git remote add origin https://github.com/<你的用户名>/dsh-life-game.git
git push -u origin main          # 认证由你输入

# 2) 仓库页右侧 About → Topics 加 dsh-plugin

# 3) 等满 1 天（CI 检查仓库年龄），然后：
#    打开 https://github.com/awesome-dsh-plugin/awesome-dsh-plugin
#    Add file → Create new file
#    路径：data/plugins/<你的用户名>__dsh-life-game.yml
#    内容：publish-entry.yml（替换 OWNER）
#    Commit → Propose new file → 开 PR，标题 Add dsh-life-game
```

**一个小细节**：现在 git 全局邮箱是一个占位地址，用它提交不会关联到你的 GitHub 账号。想让提交显示是你，先设置：

```bash
git config --global user.email "<你的 GitHub 邮箱或 noreply 地址>"
git commit --amend --reset-author --no-edit    # 只改这一条提交的作者
```

## 4. 可选

- **市场截图**：在 `package.json` 旁边放 `screenshots.json`，列出 1–8 张仓库内图片路径（如 `assets/shot-1.png`）。市场详情页会像 App Store 那样展示。
- **npm**：`npm publish`（名字 `dsh-life-game` 目前未被占用），并把 `repository` 指向 GitHub 仓库。注意本机 npm 缓存目录在沙箱下不可写，需要 `--cache /tmp/npmcache`。

## 5. CI 会查什么

1. 每个 PR 最多 3 条条目。
2. 从你仓库的 `package.json` 读 `dsh.bundle`。
3. 仓库年龄 ≥ 1 天。
4. `awesome-lint` 与站点构建（双语一致性、分隔符、日期、截图）。

任何一项失败都会说明要改什么；**在同一分支上再推一次即可，不用重开 PR**。

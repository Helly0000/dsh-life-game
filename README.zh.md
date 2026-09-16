# dsh-life-game

给 [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) 的康威生命游戏——侧栏一个面板入口，中央一整块棋盘。

[English](README.md)

## 它占哪三个座位

| 座位 | 你会得到 |
| --- | --- |
| `sidebar.panellist` / `life-game` | 侧栏一行「生命游戏」（滑翔机图标；按钮与文字由侧栏自己拥有，随语言切换） |
| `main` / `life-game` | 棋盘占据中央整栏，按栏宽自动适配 |
| `shell.overlay` / `life-game-float` | 可选的浮窗，边聊天边看 |

## 功能

- **四套规则**：B3/S23（生命游戏）、B36/S23（HighLife）、B3678/S34678（昼与夜）、B2/S（种子）。
- **在棋盘上画**：按住拖动绘制，右键擦除，Alt+拖动也是擦除。
- **图案库**：滑翔机、轻型飞船、高斯帕滑翔机枪、R-五连体、橡果、脉冲星、死亡之舞——选一个，在棋盘上单击落子，鼠标下方有半透明预览。
- **两个独立旋钮**：*棋盘*（自适应 / 40×24 / 64×38 / 98×58 / 140×84）与*格子*像素。选定预设棋盘时，缩放只改变显示大小；自适应模式下它同时决定能放下多少格。
- **实时读数**：世代、存活、峰值、密度、棋盘尺寸，以及一条种群曲线。新生细胞会闪一下白光。
- **环面或死边界**、1–120 代/秒、单步、随机汤、清空、回到初始种子。
- **中英双语**：走宿主的 locale 服务，跟随当前语言实时切换。
- **偏好会记住**：棋盘、缩放、速度、规则、边界、浮窗位置与运行状态。

## 安装

```bash
dsh plugin --profile web add /绝对路径/life-plugin
```

然后重启一次 `dsh`，让 profile 重新组装 bundle 清单。

## 开发

```bash
node build.mjs            # src/ -> lib/
node test/life.spec.mjs   # 规则、座位、偏好、双语
node test/bundle.spec.mjs # 构建产物：在假页面里挂载
```

`src/game.js` 是**一份纯 JS 函数体，两个宿主共用**：动态 Cordis runner（`new Function(...)`，`React` 走闭包符号，不许写任何持久数据）与本包的浏览器 bundle（`window.__ModuleLoader__.load`，`require("react")`，`LIFE_DURABLE` 打开）。两者的差别只有 `build.mjs` 那一层包装。

## 说明

- 棋盘跑在客户端的 Cordis `timer` 服务上，用 canvas 2D 绘制。
- 偏好存在浏览器的 `localStorage`（键 `dsh-life-game:prefs`）——它们是**界面状态**，不是插件配置；动态包一个字节都不写。
- 不联网、不碰宿主服务、不读文件。

MIT 许可。

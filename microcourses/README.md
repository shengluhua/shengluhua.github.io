# Learning Atlas · 每日进阶微课

**在线站点**：<https://shengluhua.github.io/microcourses/>

这是四门 12 周进阶微课的公开阅读与检索网站：**计算机体系结构、算法与数据结构、数学优化理论、人工智能**。课程从 2026-10-20 起编号，第 N 课对应当地日期距起始日的自然日差 + 1。

## 归档状态（2026-10-26 源码核验）

当前仓库有 **18 篇可读取的 Markdown**：其中 **11 篇标记为完整课稿、7 篇为较短的复习讲义**。另有 6 个历史课号缺少 Markdown（`arch-003/004`、`algo-003/004`、`opt-003`、`ai-002`），`ai-003` 缺测验 JSON，`arch-004.json` 缺配套讲义。界面会区别显示，**文件缺失不会被当作归档成功**。对旧课稿不自动补写摘要或覆盖原文。

## 功能

- **平板优先**：在 iPad 横屏和竖屏都有完整学科导航，适合触摸的按钮、阅读宽度和字号。阅读时可调 A−/A+、展开章节目录、开启专注阅读和跳到互动测验。
- 四个独立课程目录、每周 7 天 × 4 门归档对照表、学习进度和最近阅读入口，能看到哪些课稿真实缺失。
- 「已学完」标记和上次阅读入口保存在本地浏览器，不跨设备同步。
- 支持标题、标签和已加载正文的全文搜索；搜索时可按需加载其他课稿。
- `KaTeX` 数学公式、代码块、目录跳转、上一篇/下一篇导航、手机适配、深浅色模式。
- 7 个可交互 SVG 解释图：Amdahl、流水线、动态数组、递归树、凸函数、梯度下降、Softmax。可播放/暂停/单步；遵循 `prefers-reduced-motion`。
- **自动发现新课程**：GitHub Actions 在 `lessons/` 或 `quizzes/` 文件更新后，使用 `scripts/build_manifest.py` 重新生成静态索引；网页另会尝试 GitHub Contents API，新课扫描在 API 不可用时回退到直接检查文件路径。GitHub Actions 是否真正执行成功，还需要查看该次 workflow 运行状态。

> 初始的 7 篇文章是根据已有授课内容重新整理的**复习讲义**，不是历史消息的逐字拷贝。今后的课程按照下面的模板直接保存完整讲稿。

## 将每天生成的微课同步到 GitHub

我们保留 ChatGPT 的四个每日自动化作为 **生成端**。每次生成的任务在向用户发送完整课稿之外，应尽力通过 GitHub Connector 的 `create_file` / `update_file` 将**同一课稿**写入仓库 `shengluhua/shengluhua.github.io`，目标路径：

```
microcourses/lessons/arch-003.md
microcourses/lessons/algo-003.md
microcourses/lessons/opt-003.md
microcourses/lessons/ai-003.md
```

（第 3 课仅作为路径示例；编号随日期增加。）

### 文件命名

- `arch-001.md` — 计算机体系结构
- `algo-001.md` — 算法与数据结构
- `opt-001.md` — 数学优化理论
- `ai-001.md` — 人工智能

文件名前缀与课号均为规范化格式；课号至少三位，超出 999 可继续使用更多位数字。

### 推荐完整课稿模板

```markdown
---
title: "Little 定律与内存级并行"
track: arch
number: 3
date: 2026-10-22
week: 1
minutes: 16
kind: full
summary: "从平均并发请求数推导实际可达内存带宽。"
tags: "Little,MLP,带宽,延迟"
diagram: pipeline
---
# 第 3 课｜Little 定律与内存级并行

## 为什么需要这个模型？
...

[[diagram:pipeline]]

## 数学推导
...

## 数值演算与反例
...

## 练习 1
...

## 练习 2
...
```

支持的内置交互图：`amdahl`、`pipeline`、`array`、`recursion`、`convex`、`gradient`、`softmax`。未来可以继续在 `assets/diagrams.js` 中加入新主题动画。文内 `[[diagram:type]]` 会显示该图，无需插入截图。

**索引更新机制：** 新 `.md` / `.json` 推送后，仓库工作流 `.github/workflows/microcourses-index.yml` 会尝试自动更新 `manifest.json`。网页也会从 GitHub Contents API 补充发现；API 失败时，直接探测历史缺口与近期新课路径。网页不会伪造尚未存储的课程。工作流需要仓库允许 GitHub Actions 使用 `contents: write` 权限。

### 同步可靠性与边界

- ChatGPT 的 Scheduled Tasks 并不天然把消息复制到 GitHub。自动化任务里新增的“提交 GitHub”步骤依赖运行时能使用已授权的 GitHub Connector；它可能因连接过期、API 限制、文件已存在等原因失败。
- GitHub 的文件更新采用 `fetch_file` 获取 blob SHA，再 `update_file` 提交。若文件不存在，使用 `create_file`。遇到冲突要先刷新 SHA，不应无条件覆盖其他人工修改。
- **失败不能影响当天正文送达。** 若同步失败，需在任务回复中说明发生了什么，不能把“已生成”当作“已发布”。
- 静态目录 GitHub API 有访问频率限制，连接不可用时保留离线 `manifest.json` 兜底。同步成功可能受 GitHub Pages/CDN 发布延迟影响。
- 自动生成完整课程的同时应核验数学公式、证明、示意图标签与公式示例是否一致；不要夸大收敛保证。

## 站点部署

网站已设计为现有 `shengluhua/shengluhua.github.io` 的独立路径 `microcourses/`，**不更改已有个人主页结构**。站点使用原生 HTML/CSS/JS，公开 Markdown 使用 GitHub Raw URL 获取，避免既有 Jekyll 对带 front matter 的 Markdown 文件进行构建转换而导致原文不可用。

仓库默认 GitHub Pages 在 `main` 上发布时，提交后可访问：

<https://shengluhua.github.io/microcourses/>

如果当前站点实际采用其他发布来源（如 Actions 的独立部署工件），请将这个子目录纳入既有构建产物。

## 本地预览

在仓库根目录运行：

```bash
python3 -m http.server 8000
```

打开 <http://localhost:8000/microcourses/>。不推荐直接双击 `index.html`，因为 `file://` 模式可能限制加载 Markdown。

## 隐私

这个网站和对应仓库**公开可见**。不应写入私人身份信息、账号令牌、未公开研究成果或其他敏感数据。读过课程的本地阅读进度和深浅色偏好均不在服务器或 GitHub 记录。

## 每课四级递进测验（2026-10-21 起增加）

课程网页的正文下方会自动读取相应 `microcourses/quizzes/<track>-NNN.json`，显示 **4 道递进题**，满分 100 分：

| 级别 | 权重 | 主要技能 | 批改方式 |
|---|---:|---|---|
| Lv1 理解 | 15 分 | 概念与机制辨析 | 客观自动 |
| Lv2 演算 | 20 分 | 数值计算、手工 trace | 客观自动 |
| Lv3 迁移 | 25 分 | 边界、反例、多步推理 | 客观自动 |
| Lv4 挑战 | 40 分 | 证明、建模或设计 | 评分要点自评 / 复制给 ChatGPT 批改 |

初次展示不透露答案。点击提交后才会显示客观题答案与解析，以及开放题的评分标准和参考思路。开放题 **不声称自动判分**，需要自评或交由 ChatGPT/老师批改。测验答案、成绩与自评仅存浏览器本地（LocalStorage），**不跨设备同步**。

### 交互测验 JSON 格式

与 `lessons/arch-003.md` 对应的文件为 `quizzes/arch-003.json`，格式：

```json
{
  "version": 1,
  "lesson_id": "arch-003",
  "questions": [
    {"id":"q1", "level":1, "type":"single", "points":15, "prompt":"理解性选择题", "options":["选项A","选项B","选项C","选项D"], "answer":1, "hint":"答案中立的提示", "explanation":"正确解释"},
    {"id":"q2", "level":2, "type":"numeric", "points":20, "prompt":"计算题", "answer":2.5, "tolerance":0.001, "unit":"GB/s", "hint":"提示", "explanation":"正确演算"},
    {"id":"q3", "level":3, "type":"multi", "points":25, "prompt":"多选题", "options":["A","B","C","D"], "answer":[0,2], "hint":"提示", "explanation":"逻辑解释"},
    {"id":"q4", "level":4, "type":"open", "points":40, "prompt":"综合推导题", "hint":"提示", "rubric":["必要条件","关键公式","边界条件"], "model_answer":"参考推导"}
  ]
}
```

`answer` 为单选的 **0 起始选项索引**、多选的 **0 起始索引数组** 或数值题实际数值；`tolerance` 为绝对误差上界，不能设置得过宽。`options` 不允许重复等价答案；出题前必须验证计算、正确性与自评要点。

**新增课程归档流程：** 当日生成完整 Markdown 课程（其中四题仅有题面）→ 同步同日四道题的测验 JSON（答案和解析只在 JSON）→ 网站自动识别并显示。题目与 JSON 应相互一致，上传 Markdown 但遗漏测验 JSON 会出现“本课互动测验尚未归档”的提示。ChatGPT 的定时任务负责尝试提交这两个文件，晚间校验任务负责检查它们是否齐全。

# Learning Atlas · 每日进阶微课

**在线站点**（发布成功后）：<https://shengluhua.github.io/microcourses/>

这是四门 12 周进阶微课的公开阅读与检索网站：**计算机体系结构、算法与数据结构、数学优化理论、人工智能**。课程从 2026-10-20 起编号，第 N 课对应当地日期距起始日的自然日差 + 1。

## 功能

- 四个独立课程目录，按日期/课号排列，可筛选第一周和最近更新。
- 支持标题、标签和已加载正文的全文搜索；搜索时可按需加载其他课稿。
- `KaTeX` 数学公式、代码块、目录跳转、上一篇/下一篇导航、手机适配、深浅色模式。
- 7 个可交互 SVG 解释图：Amdahl、流水线、动态数组、递归树、凸函数、梯度下降、Softmax。可播放/暂停/单步；遵循 `prefers-reduced-motion`。
- **自动发现新课程**：静态页面通过 GitHub 公开 Contents API 读取 `microcourses/lessons/`，将满足文件名约定的新 Markdown 加到课程目录；API 不可用时使用本地 `manifest.json` 兜底。

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

**自动索引无需更新 `manifest.json`。** 只要新的 `.md` 文件被推送到 GitHub，网页就会从 GitHub Contents API 动态识别；首次读取也会解析其 YAML Front Matter。网络/API 失败时只显示已固化到 `manifest.json` 的课程，不会伪造未发布内容。

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

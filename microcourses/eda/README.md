# 智能设计自动化 · 完整课程

[课程入口](https://shengluhua.github.io/microcourses/eda/) · [五门课程统一入口](https://shengluhua.github.io/microcourses/) · [验收矩阵](https://shengluhua.github.io/microcourses/eda/#tab=audit)

材料快照：`shengluhua/pku-course-materials@e54dfbaa6e3e3807193184f2d4c6eee9c4f809aa`。私有原始课件、试卷、个人作业、内部服务器与账户信息不公开复制。

## 课程与练习

- 85讲已编写并实际加载：40理论、21GPU基础、16实验、8真题专题。12份课件807页、8份复习专题、43项正式任务、28道原卷题均有独立映射。
- 234组原资料教学实例、44组独立新增变式、85组四级自测；另保留28组旧真题兼容入口，但不二次算成新增原题。每组原例可能组合多页图例并另加检查小题，不能把网站小题数冒称PPT原题数量。
- 不重复计算兼容入口时：363组、1,227小题，其中1,032个客观自动检查、195个人工rubric题。另有28组旧ID兼容入口的73小题（53自动、20人工）；含这些重复入口的加载合计才是391组、1,300小题（1,085自动、215人工）。九类输入包括数值容差、向量、布尔等价及门库限制、路径、联合布线与整数规划候选，不用全选择题代替计算。
- 原有105个快速知识检查、T03 MUX、L06 GEMM保留。复杂概念使用独立状态计算模型；共享播放控件不共享概念算法。详见实时[覆盖JSON](evidence/coverage.json)，模型数以该文件为准。
- 开放证明/设计只能提交、看分项rubric与人工评阅，不使用关键词假判任意证明正确。自动分与人工分始终分开。

## 阅读与记录兼容

支持全文检索、章节目录、上一/下一讲、继续上次阅读、字号、专注模式、触摸控件、草稿保存与本地JSON导出。旧 `eda-answers-*`、reader-v2作答、已读/字体记录兼容；旧人工总分只作历史参考，新rubric待重评。旧键不删除，题目签名变化会归档，不静默丢稿。不上传学习记录。

## 运行与验收

```sh
node scripts/build-eda.mjs
node --test tests/*.test.js
node tests/animations-models.cjs
node scripts/build-eda-evidence.cjs
python -m http.server 8765
# 在具备Chromium的执行环境：
python tests/course-browser.py
python tests/assessment-browser.py
python tests/animations-browser.py
```

`.github/workflows/eda-complete-qa.yml`对实际生产路由运行Chromium，覆盖390×844、768×1024、1024×768、85讲、题目空/错/对答、重置/导航恢复与模型参数/播放控制。三个动画视口并行运行，仍逐一覆盖全部模型与参数。main部署后额外核对全部公开JS/CSS字节SHA，并在公网重新走85讲路由；截图和逐项报告见对应提交的Actions artifacts。实际执行状态在[verification.json](evidence/verification.json)，未运行或未通过不冒充通过；模型/DOM测试不能替代浏览器。

真实CUDA、课程平台、生产EDA以及实体iPad Safari未在此云环境执行。网页可视化不构成这些实验成功的证据。原卷年份标签、今年范围与原PPT/现行实验合同差异均在对应题目说明。

## 整合边界

原四门每日微课及其自然日编号不修改。`scripts/eda-active-lessons.json`明确列出启用讲义，防止相同单元的历史包重复注册。为保留并行写者贡献，旧reader/grader与旧讲义文件保留在Git历史/仓库中，但不与新 `assessment-engine.js` 同时加载；错误旧实验合同不作为当前教学入口。所有有效原题入口保留，修正内容有来源说明。旧发布工作流改为只读验收入口，避免两个发布者再次重写同一索引。

## 已核实发布证据

教学应用 `2d7f3abc`、首次完整发布 `20ade7e` 已通过[课程与公网Chromium验收](https://github.com/shengluhua/shengluhua.github.io/actions/runs/40702426725)及[Pages构建部署](https://github.com/shengluhua/shengluhua.github.io/actions/runs/40702425224)。另独立下载137个公开文件，与部署Git对象逐字节SHA-256相符；不是只看HTTP 200。后续仅证据归档提交仍运行同一套CI，当前精确提交状态以Actions为准。L01–L16均完成教程与网页模型整理，但未在真实GPU/课程平台上执行，不将网页通过当成实验作业通过。

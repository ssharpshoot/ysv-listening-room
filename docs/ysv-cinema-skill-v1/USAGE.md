# 源声视界 · 3D影院方案 Skill 第一版

版本：1.0.0；日期：2026-10-07。
技能名称：ysv-cinema-proposal。

## 第一版交付内容

技能目录内有19个文件：主流程、界面元数据、6份参考资料、8个项目/页面/验收模板、3个JavaScript工具文件。
覆盖新建、修改、排障和交付发布；以客户问题为汇报主线。
JBL V13.1是单独案例，不作为其他项目的参数默认值。
视频成片、Blender精细建模、现场测量调试不自动包含在本技能执行范围。

## 在本地Codex安装

第一版保存在仓库的独立分支 ysv-cinema-skill-v1：
https://github.com/ssharpshoot/ysv-listening-room/tree/ysv-cinema-skill-v1/.agents/skills/ysv-cinema-proposal

在本地Codex粘贴以下内容：

~~~text
请从下面地址安装 ysv-cinema-proposal 技能，安装到当前用户的个人技能目录，让以后不同影院项目都能调用：
https://github.com/ssharpshoot/ysv-listening-room/tree/ysv-cinema-skill-v1/.agents/skills/ysv-cinema-proposal

优先使用已有的 skill-installer；如需手动安装，请完整保留该目录及其子文件。
如果已有同名技能，先读取和比较，备份后合并，不直接覆盖。
安装后确认可以找到 $ysv-cinema-proposal，并运行技能的 validate-skill 和 selftest。
保留现有影院工程和网站，安装任务不要修改它们。
~~~  

个人技能位置按当前Codex官方本地发现规则为当前用户目录下的 .agents/skills；项目级安装则放项目根目录 .agents/skills。
最终目录必须是 .agents/skills/ysv-cinema-proposal/SKILL.md，不能多套一层包名。
如果安装后未显示，可重启Codex再检查技能列表。
本次交付已制作和Git保存；尚未执行上述个人目录安装，也未验证本地Codex加载器自动发现。

## 常用指令

新项目：

~~~text
使用 $ysv-cinema-proposal 制作新的家庭影院方案。先读取我提供的图纸、器材、预算和安装限制，建立独立项目。先提交资料缺项和客户汇报结构，等我确认后再制作网页。
~~~

修改已有项目：

~~~text
使用 $ysv-cinema-proposal，读取当前项目最新文件和交接记录，完成以下修改。保留已确认的几何、声道和有效功能，检查受影响页面，输出修改版和检查结果。发布按本次明确授权处理。
~~~

排障：

~~~text
使用 $ysv-cinema-proposal 排查当前网页的3D加载或交互故障。先查入口、资源和真实错误，区分慢加载、WebGL支持、相机和性能问题；按验证成本推进，记录实际结果和未测条件。
~~~

## 项目资料怎么保存

新项目复制并填写：
- assets/project-intake.md：人工资料表。
- assets/project.template.json：结构化工程数据。
- assets/AGENTS.template.md、assets/MEMORY.template.md：按实际情况生成项目规则与事实记录。
- assets/page-plan.template.json：按客户问题安排页面。
- assets/change-request.template.csv、assets/acceptance.template.md：需求与交付记录。

已有项目合并同名文件；不要覆盖已确认内容。
空值表示未知。数组字段和来源记录说明见 references/intake.md。
真实产品图、Logo、证书、报价和测量文件由项目提供，第一版没有附带未经核验的图库。

## 工具使用

需要Node.js，无外部依赖。用技能脚本的实际绝对路径替换下面的 /path/to/skill。

~~~text
node /path/to/skill/scripts/cinema-tools.cjs inspect /path/to/project.json
node /path/to/skill/scripts/cinema-tools.cjs metrics /path/to/project.json
node /path/to/skill/scripts/cinema-tools.cjs compare /path/to/baseline.json /path/to/project.json
node /path/to/skill/scripts/cinema-tools.cjs validate-skill /path/to/skill
node /path/to/skill/scripts/cinema-tools.cjs selftest
~~~

Windows中路径有空格时用双引号；直接调用node，不需要修改PowerShell执行策略。

inspect列资料错误、缺项与可计算部分。
metrics计算房间面积/容积/共振、逐座屏幕视角、理论亮度、各座位标量输出及有完整输入时的多炮合成参考。
compare发现几何变化时退出码2；这是提醒检查授权，不自动说明改动错误。
validate-skill为本技能的轻量结构检查，不冒充官方Python验证程序。
selftest运行26项核心检查。

输出准备度不是标准合格结论。四炮能量参考不是实际下限，同相上限不是全频段实际能力。
实际声压、亮度、房间频响和验收需相应现场数据。

## 本次验证与限制

已在内置JavaScript运行时执行同一核心源代码：26项测试通过。
已使用注入的内存文件适配器检查10个命令分支，全部通过；这不等于真实文件系统或Node进程测试。
技能元数据、资源引用、JSON与JavaScript语法检查通过。
Windows终端因当前沙箱后端无法启动；官方init_skill.py/quick_validate.py、真实Node文件读写、安装发现、浏览器/WebGL和Pages部署未在本次执行。
详细机器检查记录见 validation-report.json；后续实际使用验收用 acceptance-scenarios.md。
本次任务只交付技能；不修改或重新发布JBL影院网页。

## 维护方式

技能流程和模板用Git管理；具体项目事实放各自MEMORY.md。
新需求先判断是否通用：通用规则进入技能；项目专属决策保留项目文件。
通过实际项目发现重复步骤后再增加脚本；视频制作另行建立独立流程。

官方依据：
- https://developers.openai.com/codex/skills
- https://github.com/openai/skills/blob/main/skills/.system/skill-creator/SKILL.md

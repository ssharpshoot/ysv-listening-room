# 资料检查与项目隔离

## 确定真实入口

- 检查Git当前分支、工作树改动、入口路径、构建标记和用户指定的最新文件。
- 开始维护时记录提交或文件摘要；无法取得原工程时先做需求整理，不能凭历史重建并称原交付版。
- 新项目用独立ID、目录和发布路径；参考工程只复用方法与代码结构。不要导入其设备、尺寸、预算、照片、客户信息。
- MEMORY.md保存事实及决策，不具备授权待办自动执行的作用。

## 最小资料与可继续的工作

| 工作 | 必需输入 | 缺失时仍可做 |
|---|---|---|
| 房间与布局 | 净尺寸、单位、坐标方向、门窗/安装限制 | 汇报框架与缺项表 |
| 逐座视角 | 实体座位耳点、幕面位置、有效宽高和高度 | 示意布局；角度标待确认 |
| 声压能力 | 对应口径灵敏度、负载、同负载功放能力、音箱能力和耳点距离 | 选型判断与数据收集 |
| 亮度 | 所用流明口径、有效面积、增益与条件 | 亮度目标说明 |
| 总价 | 有效报价、数量、服务范围、含税/运费/安装说明 | 预算结构；金额待补 |
| 发布 | 当前项目授权、仓库/分支/路径与公开范围 | 本地审阅成果和发布准备 |

缺失资料只有在影响本次正确性、成本或范围时集中提问。非依赖内容先完成。

## 数据填写约定

assets/project.template.json使用毫米工程坐标：
- x：观众坐着面对银幕时，左侧为正；y：前墙向后墙；z：室内地面向上。
- 三维引擎可以有其他轴和单位，但必须在转换处记录，不更改工程定义。
- y是前墙距离；幕面距离是 ear.y - screen.y。地台以上耳高和地面以上耳高分别写。
- 实体耳点放 seats；两座之间的中轴参考放 reference_positions，不能给它实体座位的验收身份。
- null为空缺，不填0替代未知尺寸。geometry_locked只表达用户确认锁定，不产生未知坐标。
- source_records使用JSON指针定位值，记录kind、reference、date、status和note。kind可为 user_confirmed/manufacturer/existing_code/calculated/simulated/measured/assumption；status可为 confirmed/unverified。
- 单凭既有页面文字不是厂家规格核验。缺官方来源时保留 existing_code 或 assumption。
- targets保存项目目标和出处，不把任何通用角度默认写成国际标准。

## 几何留档

建立明确的 baseline 项目数据和实际代码留档。
scripts/cinema-tools.cjs compare baseline.json project.json 可比较坐标、尺寸和朝向；人工同时核查代码转换和实际渲染。
修改相机、动画、高亮时比较结果应无工程几何差异。授权调整几何后保留前后数据与决策。

## 数组记录的字段

| 数组 | 记录结构 |
|---|---|
| seats | id、row（正整数）、position_mm=[x,y,z] |
| reference_positions | id、label、position_mm；不是实体座位 |
| speakers | id、channel、kind、model、position_mm、orientation_deg、dimensions_mm、output |
| amplifiers | id、model、available_channels、assignments |
| source_records | pointer、kind、reference、date、status、note |
| budget.items | id、category、qty、unit_price_cny、source、scope |

speakers.kind使用subwoofer标记低音炮，其他类型按项目填写；channel的L/R用于前场角度，LFE可以被多个独立炮共用。
position_mm是声学参考点，不自动等于箱体几何中心。
orientation_deg三元组的轴序由项目明确记录；工具仅比较，不将其解释为音箱声学指向模型。
output字段：sensitivity_db、sensitivity_basis（1W/1m或2.83V/1m）、impedance_ohm、speaker_limit_w、amp_power_w、speaker_power_basis、amp_power_basis、loss_db（如无明确损耗，可省略；估算注明未计）。
assignments记录channel_number与speaker_ids；同一功放通道多个对象必须另核对负载，工具只查ID和通道分配，不认定电气接法安全。
每只炮的output齐全时metrics给出各座位combined_subwoofer_references；客户要求只显示组合能力时，单只中间计算保留工程记录，不放客户表格。

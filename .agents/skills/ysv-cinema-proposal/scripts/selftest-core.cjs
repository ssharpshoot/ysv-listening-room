"use strict";
function fixtureProject() {
  return {
    schema_version:1,project:{id:"synthetic-room",name:"合成测试房间，不是客户项目"},
    coordinates:{unit:"mm",x_positive:"audience_left",y_positive:"front_to_back",z_positive:"up",origin:"front_wall_center_floor"},
    locks:{geometry_locked:true},room_mm:{width:4200,length:7000,height:2700},
    screen:{x_mm:0,y_mm:600,bottom_mm:400,width_mm:3200,height_mm:1800,gain:1},
    projection:{model:"synthetic",lumens:1800,lumens_basis:"synthetic",brightness_retention_factor:1},
    seats:[{id:"a",row:1,position_mm:[0,4000,1100]},{id:"b",row:2,position_mm:[450,5500,1350]}],
    reference_positions:[],
    speakers:[
      {id:"l",channel:"L",position_mm:[1500,400,1200],orientation_deg:[0,0,0]},
      {id:"r",channel:"R",position_mm:[-1500,400,1200],orientation_deg:[0,0,0]}
    ],
    amplifiers:[],source_records:[],budget:{currency:"CNY",items:[]},
    delivery:{publish_authorization:"none"}
  };
}
function runSelfTests(core) {
  const outcomes=[];
  function test(name,fn) {try{fn();outcomes.push({name,passed:true});}catch(e){outcomes.push({name,passed:false,error:e.message});}}
  const assert=(condition,message)=>{if(!condition)throw new Error(message||"断言失败");};
  const close=(a,b,tol=1e-6)=>assert(Math.abs(a-b)<=tol,"实际"+a+" 预期"+b);
  const raises=fn=>{let thrown=false;try{fn();}catch{thrown=true;}assert(thrown,"应拒绝无效输入");};
  const copy=x=>JSON.parse(JSON.stringify(x));
  test("JBL名义亮度：约31.1fL/106.6nits",()=>{
    const b=core.brightness({lumens:2300,gain:1.3,width_mm:3985,height_mm:2240});
    close(b.ftl,31.1,.1);close(b.nits,106.6,.1);assert(b.evidence_type==="theoretical");
  });
  test("亮度条件系数按输入缩放，不自动发明损耗",()=>{
    const a=core.brightness({lumens:1000,gain:1,width_mm:2000,height_mm:1000});
    const b=core.brightness({lumens:1000,gain:1,width_mm:2000,height_mm:1000,retention_factor:.75});
    close(b.nits,a.nits*.75);raises(()=>core.brightness({lumens:1000,gain:1,width_mm:0,height_mm:1000}));
  });
  test("第一/二排中轴屏幕水平角",()=>{
    const s={x_mm:0,y_mm:815,bottom_mm:340,width_mm:3985,height_mm:2240};
    close(core.screenAngles(s,[0,4750,1100]).horizontal_deg,53.7,.1);
    close(core.screenAngles(s,[0,6700,1380]).horizontal_deg,37.4,.1);
  });
  test("前墙与幕面距离明确分开",()=>{
    const a=core.screenAngles({x_mm:0,y_mm:815,bottom_mm:340,width_mm:3985,height_mm:2240},[0,4750,1100]);
    close(a.front_wall_distance_mm,4750);close(a.screen_depth_distance_mm,3935);
  });
  test("偏心座位水平角、中心仰角与上下沿不同",()=>{
    const s={x_mm:0,y_mm:500,bottom_mm:400,width_mm:3000,height_mm:1700};
    const a=core.screenAngles(s,[0,4000,1100]),b=core.screenAngles(s,[1200,4000,1100]);
    assert(b.horizontal_deg<a.horizontal_deg);assert(b.upper_elevation_deg>b.center_elevation_deg);
    assert(b.lower_elevation_deg<0);assert(b.center_elevation_deg<a.center_elevation_deg);
  });
  test("屏幕后方与非数值耳点被拒绝",()=>{
    const s={x_mm:0,y_mm:500,bottom_mm:400,width_mm:3000,height_mm:1700};
    raises(()=>core.screenAngles(s,[0,500,1100]));raises(()=>core.screenAngles(s,[0,"4000",1100]));
  });
  test("音箱夹角不使用屏幕视角",()=>{
    close(core.horizontalAngleDeg([0,4000,1100],[2000,0,1200],[-2000,0,1200]),53.13010235415598);
  });
  test("4Ω的2.83V口径约扣3dB",()=>{
    close(core.sensitivity1W({sensitivity_db:98,sensitivity_basis:"2.83V/1m",impedance_ohm:4}),94.985055,.001);
  });
  test("未知灵敏度口径不自动推定",()=>{
    raises(()=>core.sensitivity1W({sensitivity_db:98,sensitivity_basis:null,impedance_ohm:4}));
  });
  test("标量声压取能力限制且不证明逐频通过",()=>{
    const a=core.scalarSpl({sensitivity_db:98,sensitivity_basis:"1W/1m",impedance_ohm:4,speaker_limit_w:460,amp_power_w:545,distance_m:4.75});
    close(a.power_w,460);close(a.spl_db,111.093,.02);
    assert(a.per_frequency_compliance==="not_demonstrated");
  });
  test("距离翻倍约减6dB，明确损耗只扣一次",()=>{
    const p={sensitivity_db:90,sensitivity_basis:"1W/1m",impedance_ohm:8,speaker_limit_w:100,amp_power_w:100,distance_m:2};
    const a=core.scalarSpl(p),b=core.scalarSpl({...p,distance_m:4}),c=core.scalarSpl({...p,loss_db:2});
    close(a.spl_db-b.spl_db,6.020599913279624);close(a.spl_db-c.spl_db,2);
  });
  test("四只等幅：能量参考+6dB、同相上限+12dB",()=>{
    const a=core.combineLevelReferences([100,100,100,100]);
    close(a.energy_db,106.02059991327963);close(a.coherent_upper_db,112.04119982655925);
    assert(!("lower_bound_db" in a));
  });
  test("不等幅多炮按线性量求和",()=>{
    const a=core.combineLevelReferences([100,90]);
    close(a.energy_db,100+10*Math.log10(1.1));
    close(a.coherent_upper_db,100+20*Math.log10(1+Math.sqrt(.1)));
    raises(()=>core.combineLevelReferences([]));
  });
  test("8m/5m的一至四阶共振",()=>{
    const a=core.roomMetrics({width:5000,length:8000,height:2800});
    close(a.area_m2,40);close(a.volume_m3,112);close(a.front_back_modes[0].hz,21.4375);
    close(a.left_right_modes[3].hz,137.2);assert(a.rt60==="not_inferred_from_dimensions");
  });
  test("几何比较忽略镜头与高亮",()=>{
    const a=fixtureProject(),b=copy(a);b.camera={x:1,y:2,z:3};b.highlight=["r"];
    assert(core.compareGeometry(a,b).unchanged);
  });
  test("音箱朝向变化会被检测",()=>{
    const a=fixtureProject(),b=copy(a);b.speakers[0].orientation_deg[0]=15;
    const diff=core.compareGeometry(a,b);assert(!diff.unchanged);assert(diff.changes.some(d=>d.path.includes("orientation_deg")));
  });
  test("新房间独立参数不混入JBL",()=>{
    const a=fixtureProject(),m=core.projectMetrics(a);
    close(m.calculations.room.area_m2,29.4);assert(m.calculations.seat_screen_angles.length===2);
    close(m.calculations.room.volume_m3,79.38);assert(m.calculations.seat_screen_angles[1].seat_id==="b");assert(!m.inspection.ready.quote);
  });
  test("缺资料仍允许完整部分计算，不生成价格或输出通过",()=>{
    const p=fixtureProject();p.projection.lumens=null;
    const m=core.projectMetrics(p);
    assert(m.calculations.room);assert(m.calculations.seat_screen_angles);
    assert(!m.calculations.brightness);assert(!("quoted_total_cny" in m.calculations));
    assert(m.inspection.warnings.some(w=>w.path==="/budget"));
  });
  test("重复声道对象ID被拒绝",()=>{
    const p=fixtureProject();p.speakers[1].id="l";
    assert(core.validateProject(p).errors.some(e=>e.path.endsWith("/id")));
  });
  test("座位越界和只有参考点不能通过逐座准备度",()=>{
    const p=fixtureProject();p.seats[0].position_mm[0]=3000;
    assert(!core.validateProject(p).ready.screen_angles);
    const q=fixtureProject();q.reference_positions=q.seats;q.seats=[];
    assert(!core.validateProject(q).ready.screen_angles);
  });
  test("功放通道重复、超分配与不存在对象会报警",()=>{
    const p=fixtureProject();p.amplifiers=[{id:"amp",available_channels:2,assignments:[
      {channel_number:1,speaker_ids:["l"]},{channel_number:1,speaker_ids:["r"]},{channel_number:3,speaker_ids:["unknown"]}
    ]}];
    assert(core.validateProject(p).errors.length>=3);
  });
  test("无有效来源不宣称输入核验，错误来源指针被拒绝",()=>{
    const p=fixtureProject();assert(core.validateProject(p).warnings.some(w=>w.message.includes("缺来源")));
    p.source_records=[{pointer:"/missing",kind:"manufacturer",status:"confirmed",date:"2026-10-07",reference:"synthetic"}];
    assert(core.validateProject(p).errors.some(e=>e.path.endsWith("/pointer")));
  });
  test("完整报价有来源才求和，缺价不填零",()=>{
    const p=fixtureProject();p.budget={currency:"CNY",quote_date:"2026-10-07",tax_note:"synthetic",service_scope:"synthetic",
      items:[{qty:2,unit_price_cny:100,source:"synthetic"}]};
    close(core.projectMetrics(p).calculations.quoted_total_cny,200);
    p.budget.items[0].unit_price_cny=null;assert(!core.validateProject(p).ready.quote);
  });
  test("发布授权与实际目标必须属于当前项目",()=>{
    const p=fixtureProject();p.delivery={repository:"owner/repo",branch:"main",entry_path:"new/index.html",publish_authorization:"none"};
    assert(!core.validateProject(p).ready.release);p.delivery.publish_authorization="authorized";
    assert(core.validateProject(p).ready.release);
  });
  test("四炮各座位合成参考来自该项目逐只数据",()=>{
    const p=fixtureProject(),output={sensitivity_db:90,sensitivity_basis:"1W/1m",impedance_ohm:8,speaker_limit_w:100,amp_power_w:100,speaker_power_basis:"continuous",amp_power_basis:"continuous"};
    p.speakers=[1,2,3,4].map(n=>({id:"sub-"+n,channel:"LFE",kind:"subwoofer",position_mm:[0,100,100],output:{...output}}));
    const m=core.projectMetrics(p),a=m.calculations.combined_subwoofer_references[0];
    close(a.energy_db,m.calculations.scalar_output[0].seats[0].spl_db+6.020599913279624);
    assert(a.count===4);assert(!("passed" in a));
  });
  test("亮度计算不依赖未知的幕面位置",()=>{
    const p=fixtureProject();p.screen.y_mm=null;p.screen.bottom_mm=null;
    const m=core.projectMetrics(p);
    assert(m.calculations.brightness);assert(!m.calculations.seat_screen_angles);
    close(m.calculations.brightness.area_m2,5.76);
  });
  return {passed:outcomes.filter(t=>t.passed).length,failed:outcomes.filter(t=>!t.passed).length,outcomes,
    scope:"核心计算与资料逻辑；不包含真实文件系统、浏览器、WebGL或部署"};
}
module.exports={fixtureProject,runSelfTests};
if(require.main===module) {
  const report=runSelfTests(require("./cinema-core.cjs"));
  console.log(JSON.stringify(report,null,2));process.exitCode=report.failed?1:0;
}

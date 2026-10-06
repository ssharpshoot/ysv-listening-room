"use strict";
// 无文件、网络或环境依赖；Node与内置JavaScript运行时可执行同一核心。
const FL_TO_NITS = 3.42625909963539;
const SOURCE_KINDS = new Set(["user_confirmed","manufacturer","existing_code","calculated","simulated","measured","assumption"]);
function finite(value,name) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(name+"必须是有限数值");
  return value;
}
function positive(value,name) {
  finite(value,name); if (value<=0) throw new RangeError(name+"必须大于0"); return value;
}
function nonnegative(value,name) {
  finite(value,name); if (value<0) throw new RangeError(name+"不能为负"); return value;
}
function point(value,name) {
  if (!Array.isArray(value)||value.length!==3) throw new TypeError(name+"必须是[x,y,z]");
  value.forEach((n,i)=>finite(n,name+"["+i+"]")); return value;
}
function distanceM(a,b) {
  point(a,"a"); point(b,"b");
  return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])/1000;
}
function horizontalAngleDeg(ear,left,right) {
  point(ear,"ear"); point(left,"left"); point(right,"right");
  const ax=left[0]-ear[0],ay=left[1]-ear[1],bx=right[0]-ear[0],by=right[1]-ear[1];
  positive(Math.hypot(ax,ay),"左侧水平距离"); positive(Math.hypot(bx,by),"右侧水平距离");
  return Math.abs(Math.atan2(ax*by-ay*bx,ax*bx+ay*by))*180/Math.PI;
}
function screenAngles(screen,ear) {
  point(ear,"ear");
  const width=positive(screen.width_mm,"画面宽"),height=positive(screen.height_mm,"画面高");
  const x=finite(screen.x_mm,"幕中心x"),y=finite(screen.y_mm,"幕面y"),bottom=finite(screen.bottom_mm,"画面下沿");
  const depth=positive(ear[1]-y,"耳点到幕面纵向距离");
  const centerZ=bottom+height/2;
  const planar=Math.hypot(ear[0]-x,depth);
  const elevation=z=>Math.atan2(z-ear[2],planar)*180/Math.PI;
  return {
    front_wall_distance_mm:ear[1],screen_depth_distance_mm:depth,
    horizontal_deg:horizontalAngleDeg(ear,[x+width/2,y,centerZ],[x-width/2,y,centerZ]),
    center_elevation_deg:elevation(centerZ),upper_elevation_deg:elevation(bottom+height),
    lower_elevation_deg:elevation(bottom),evidence_type:"calculated_geometry"
  };
}
function brightness({lumens,gain,width_mm,height_mm,retention_factor=1}) {
  positive(lumens,"流明");positive(gain,"幕增益");positive(width_mm,"画面宽");positive(height_mm,"画面高");
  positive(retention_factor,"亮度条件系数");
  if(retention_factor>1) throw new RangeError("损耗情景的条件系数不能大于1");
  const area_m2=width_mm*height_mm/1e6;
  const nits=lumens*gain*retention_factor/(Math.PI*area_m2);
  return {area_m2,nits,ftl:nits/FL_TO_NITS,retention_factor,evidence_type:"theoretical",
    note:"给定流明、增益和条件系数的名义估算；不代表实际校准、离轴或现场亮度"};
}
function sensitivity1W({sensitivity_db,sensitivity_basis,impedance_ohm}) {
  finite(sensitivity_db,"灵敏度");positive(impedance_ohm,"额定负载");
  if(sensitivity_basis==="1W/1m") return sensitivity_db;
  if(sensitivity_basis==="2.83V/1m") return sensitivity_db-10*Math.log10(2.83*2.83/impedance_ohm);
  throw new TypeError("灵敏度口径必须明确为1W/1m或2.83V/1m");
}
function scalarSpl(input) {
  const s=sensitivity1W(input);
  const power_w=Math.min(positive(input.speaker_limit_w,"音箱功率限制"),positive(input.amp_power_w,"对应负载功放功率"));
  const distance=positive(input.distance_m,"听音距离");
  const loss=input.loss_db===undefined?0:nonnegative(input.loss_db,"明确损耗");
  const spl_db=s+10*Math.log10(power_w)-20*Math.log10(distance)-loss;
  return {sensitivity_1w_db:s,power_w,distance_m:distance,loss_db:loss,spl_db,
    evidence_type:"scalar_estimate",per_frequency_compliance:"not_demonstrated",
    note:"标量近似；不证明逐频达标，未自动包含房间增益、离轴、EQ损耗与功率压缩"};
}
function combineLevelReferences(levels) {
  if(!Array.isArray(levels)||!levels.length) throw new TypeError("至少提供一只炮的耳点等级");
  levels.forEach(n=>finite(n,"等级"));
  const max=Math.max(...levels);
  const energy_db=max+10*Math.log10(levels.reduce((s,n)=>s+10**((n-max)/10),0));
  const coherent_upper_db=max+20*Math.log10(levels.reduce((s,n)=>s+10**((n-max)/20),0));
  return {count:levels.length,energy_db,coherent_upper_db,evidence_type:"conditional_reference",
    note:"能量参考不是实际下限；同相上限不能代表房间各频点实际输出"};
}
function axialModes(length_m,orders=4,speed_m_s=343) {
  positive(length_m,"方向长度");positive(speed_m_s,"声速");
  if(!Number.isInteger(orders)||orders<1||orders>100) throw new RangeError("阶次必须为1—100整数");
  return Array.from({length:orders},(_,i)=>({order:i+1,hz:(i+1)*speed_m_s/(2*length_m)}));
}
function roomMetrics(room) {
  const w=positive(room.width,"房间宽")/1000,l=positive(room.length,"房间长")/1000,h=positive(room.height,"房间高")/1000;
  return {area_m2:w*l,volume_m3:w*l*h,ratio_height_width_length:[1,w/h,l/h],
    front_back_modes:axialModes(l),left_right_modes:axialModes(w),vertical_modes:axialModes(h),
    rt60:"not_inferred_from_dimensions"};
}
function pointerValue(object,pointer) {
  if(typeof pointer!=="string"||!pointer.startsWith("/")) return undefined;
  return pointer.slice(1).split("/").reduce((v,k)=>v==null?undefined:v[k.replace(/~1/g,"/").replace(/~0/g,"~")],object);
}
function geometrySnapshot(project) {
  const byId=items=>(Array.isArray(items)?items:[]).map(s=>({
    id:s.id,position_mm:s.position_mm,orientation_deg:s.orientation_deg??null,
    dimensions_mm:s.dimensions_mm??null,row:s.row??null,channel:s.channel??null
  })).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  return {
    coordinates:project.coordinates??null,
    room_mm:{width:project.room_mm?.width??null,length:project.room_mm?.length??null,height:project.room_mm?.height??null},
    screen:{x_mm:project.screen?.x_mm??null,y_mm:project.screen?.y_mm??null,bottom_mm:project.screen?.bottom_mm??null,width_mm:project.screen?.width_mm??null,height_mm:project.screen?.height_mm??null},
    seats:byId(project.seats),reference_positions:byId(project.reference_positions),speakers:byId(project.speakers)
  };
}
function compareGeometry(baseline,current) {
  const a=geometrySnapshot(baseline),b=geometrySnapshot(current),changes=[];
  function walk(x,y,path) {
    if(JSON.stringify(x)===JSON.stringify(y)) return;
    if(x&&y&&typeof x==="object"&&typeof y==="object"&&Array.isArray(x)===Array.isArray(y)) {
      const keys=new Set([...Object.keys(x),...Object.keys(y)]);
      for(const key of keys) walk(x[key],y[key],path+"/"+key);
    } else changes.push({path,baseline:x??null,current:y??null});
  }
  walk(a,b,"");
  return {unchanged:changes.length===0,changes,authorization:"not_checked"};
}
function validateProject(project) {
  const errors=[],warnings=[],missing=[];
  const error=(path,message)=>errors.push({path,message});
  const warn=(path,message)=>warnings.push({path,message});
  if(!project||typeof project!=="object"||Array.isArray(project)) return {errors:[{path:"/",message:"项目必须是对象"}],warnings:[],missing:[],ready:{}};
  if(project.schema_version!==1) error("/schema_version","需使用schema_version=1");
  if(typeof project.project?.id!=="string"||!/^[-a-z0-9]+$/.test(project.project.id)||project.project.id.startsWith("-")) error("/project/id","请填写独立的小写字母/数字/连字符ID");
  const expected={unit:"mm",x_positive:"audience_left",y_positive:"front_to_back",z_positive:"up",origin:"front_wall_center_floor"};
  for(const [k,v] of Object.entries(expected)) if(project.coordinates?.[k]!==v) error("/coordinates/"+k,"模板计算采用明确毫米坐标；请先转换并记录，要求："+v);
  const room=project.room_mm??{};
  let roomReady=true;
  for(const key of ["width","length","height"]) {
    const n=room[key];
    if(n==null) { missing.push("/room_mm/"+key);roomReady=false; }
    else if(typeof n!=="number"||!Number.isFinite(n)||n<=0) {error("/room_mm/"+key,"应为正的有限毫米尺寸");roomReady=false;}
  }
  if(!roomReady) warn("/room_mm","缺有效净尺寸，不计算实际比例或共振");
  const screen=project.screen??{};
  let screenReady=true;
  for(const key of ["x_mm","y_mm","bottom_mm","width_mm","height_mm"]) {
    const n=screen[key];
    if(n==null) {missing.push("/screen/"+key);screenReady=false;}
    else if(typeof n!=="number"||!Number.isFinite(n)||(["width_mm","height_mm"].includes(key)&&n<=0)) {error("/screen/"+key,"幕面位置/有效尺寸无效");screenReady=false;}
  }
  if(screenReady&&roomReady) {
    if(Math.abs(screen.x_mm)+screen.width_mm/2>room.width/2) {error("/screen","画面超出房间侧边界");screenReady=false;}
    if(screen.y_mm<0||screen.y_mm>=room.length||screen.bottom_mm<0||screen.bottom_mm+screen.height_mm>room.height) {error("/screen","幕面或画面高度超出房间边界");screenReady=false;}
  }
  const arrays={seats:[],reference_positions:[],speakers:[]};
  let seatsReady=true,speakerGeometryReady=true;
  for(const key of Object.keys(arrays)) {
    if(!Array.isArray(project[key])) {error("/"+key,"应为数组");if(key==="seats")seatsReady=false;if(key==="speakers")speakerGeometryReady=false;continue;}
    arrays[key]=project[key];
    const ids=new Set();
    arrays[key].forEach((s,i)=>{
      const base="/"+key+"/"+i;
      if(!s||typeof s!=="object"||Array.isArray(s)) {error(base,"记录必须是对象");if(key==="seats")seatsReady=false;if(key==="speakers")speakerGeometryReady=false;return;}
      if(typeof s.id!=="string"||!s.id||ids.has(s.id)) {error(base+"/id","ID为空或重复");if(key==="seats")seatsReady=false;if(key==="speakers")speakerGeometryReady=false;}
      ids.add(s.id);
      try { point(s.position_mm,base+"/position_mm"); }
      catch(e) {error(base+"/position_mm",e.message);if(key==="seats")seatsReady=false;if(key==="speakers")speakerGeometryReady=false;return;}
      const [x,y,z]=s.position_mm;
      if(roomReady&&(Math.abs(x)>room.width/2||y<0||y>room.length||z<0||z>room.height)) {error(base+"/position_mm","耳点/声学参考点超出房间边界");if(key==="seats")seatsReady=false;if(key==="speakers")speakerGeometryReady=false;}
      if((key==="seats"||key==="reference_positions")&&screenReady&&y<=screen.y_mm) {error(base+"/position_mm","耳点必须在幕面后方");if(key==="seats")seatsReady=false;}
      if(key==="seats"&&(!Number.isInteger(s.row)||s.row<1)) {error(base+"/row","实体座位需要正整数排位");seatsReady=false;}
      if(key==="speakers"&&s.orientation_deg!=null) try {point(s.orientation_deg,"orientation_deg");}catch(e){error(base+"/orientation_deg",e.message);speakerGeometryReady=false;}
      if(key==="speakers"&&s.output!=null) {
        try { scalarSpl({...s.output,distance_m:1}); }
        catch(e) {error(base+"/output",e.message);}
        if(s.output.speaker_power_basis==null||s.output.amp_power_basis==null) warn(base+"/output","补充音箱和功放连续/节目/峰值功率口径；当前不得视为同口径证明");
        else if(s.output.speaker_power_basis!==s.output.amp_power_basis) warn(base+"/output","功率口径不同；只能作为明确假设的估算");
      }
    });
  }
  if(!arrays.seats.length){seatsReady=false;missing.push("/seats");warn("/seats","未提供实体座位耳点；参考点不能替代所有座位");}
  if(!arrays.speakers.length){speakerGeometryReady=false;warn("/speakers","音箱坐标未提供，不计算声道距离/输出");}
  const projection=project.projection??{};
  const brightnessReady=[screen.width_mm,screen.height_mm,projection.lumens,screen.gain,projection.brightness_retention_factor].every(n=>typeof n==="number"&&Number.isFinite(n)&&n>0)&&projection.brightness_retention_factor<=1;
  if(!brightnessReady) missing.push("/projection-or-screen-brightness-input");
  if(projection.lumens!=null&&typeof projection.lumens_basis!=="string")warn("/projection/lumens_basis","补充流明口径和采用条件");
  const budget=project.budget??{},budgetItems=Array.isArray(budget.items)?budget.items:[];
  let quoteReady=budget.currency==="CNY"&&budgetItems.length>0;
  if(!Array.isArray(budget.items))error("/budget/items","预算项目应为数组");
  budgetItems.forEach((item,i)=>{
    if(!item||typeof item!=="object"||typeof item.qty!=="number"||!Number.isFinite(item.qty)||item.qty<=0||typeof item.unit_price_cny!=="number"||!Number.isFinite(item.unit_price_cny)||item.unit_price_cny<0)quoteReady=false;
    if(item?.source==null){quoteReady=false;warn("/budget/items/"+i+"/source","缺有效报价来源");}
  });
  if(!quoteReady)warn("/budget","报价资料不完整；不生成总价或用0替代缺价");
  if(!budget.quote_date||!budget.service_scope||!budget.tax_note) {quoteReady=false;warn("/budget","补充报价日期、服务范围和税费条件");}
  if(!Array.isArray(project.source_records))error("/source_records","来源记录必须是数组");
  const sources=Array.isArray(project.source_records)?project.source_records:[];
  sources.forEach((s,i)=>{
    if(!s||typeof s!=="object"){error("/source_records/"+i,"来源必须是对象");return;}
    if(!SOURCE_KINDS.has(s.kind))error("/source_records/"+i+"/kind","来源类型无效");
    if(!["confirmed","unverified"].includes(s.status))error("/source_records/"+i+"/status","状态需为confirmed或unverified");
    if(pointerValue(project,s.pointer)===undefined)error("/source_records/"+i+"/pointer","JSON指针未指向存在字段");
    if(!s.reference||!s.date)warn("/source_records/"+i,"补充来源说明/链接与日期");
  });
  const critical=["/room_mm/width","/room_mm/length","/room_mm/height","/screen/width_mm","/screen/height_mm","/screen/y_mm","/screen/bottom_mm","/screen/gain","/projection/lumens"];
  for(const p of critical) if(pointerValue(project,p)!=null&&!sources.some(s=>s?.pointer===p))warn(p,"输入缺来源记录；不得宣称已核验");
  if(project.locks?.geometry_locked&&(!roomReady||!screenReady||!seatsReady||!speakerGeometryReady))warn("/locks","已锁定标记不能补全缺失几何，先读取基线");
  if(!Array.isArray(project.amplifiers))error("/amplifiers","功放记录必须是数组");
  else project.amplifiers.forEach((amp,i)=>{
    if(!amp||typeof amp!=="object"){error("/amplifiers/"+i,"功放记录必须是对象");return;}
    if(!Number.isInteger(amp.available_channels)||amp.available_channels<1) {error("/amplifiers/"+i+"/available_channels","通道数量无效");return;}
    const assigned=new Set(),assignments=Array.isArray(amp.assignments)?amp.assignments:[];
    assignments.forEach((a,j)=>{
      if(!Number.isInteger(a?.channel_number)||a.channel_number<1||a.channel_number>amp.available_channels||assigned.has(a.channel_number))error("/amplifiers/"+i+"/assignments/"+j,"通道越界或重复");
      assigned.add(a?.channel_number);
      if(!Array.isArray(a?.speaker_ids)||!a.speaker_ids.length)error("/amplifiers/"+i+"/assignments/"+j,"补充驱动对象ID");
      else for(const id of a.speaker_ids) if(!arrays.speakers.some(s=>s?.id===id))error("/amplifiers/"+i+"/assignments/"+j,"驱动对象ID不存在："+id);
    });
  });
  const d=project.delivery??{};
  const releaseReady=d.publish_authorization==="authorized"&&typeof d.repository==="string"&&d.repository.length>0&&typeof d.branch==="string"&&d.branch.length>0&&typeof d.entry_path==="string"&&d.entry_path.length>0;
  if(!releaseReady)warn("/delivery","本项目发布授权或目标未齐；可先完成审阅版");
  const outputReady=speakerGeometryReady&&seatsReady&&arrays.speakers.every(s=>{
    if(s?.output==null)return false;
    try{scalarSpl({...s.output,distance_m:1});return true;}catch{return false;}
  });
  const valid=errors.length===0;
  return {errors,warnings,missing:[...new Set(missing)],
    ready:{geometry:valid&&roomReady&&screenReady&&seatsReady,screen_angles:valid&&screenReady&&seatsReady,
      brightness:valid&&brightnessReady,scalar_output:valid&&outputReady,quote:valid&&quoteReady,
      release:valid&&releaseReady},note:"准备度仅代表输入可用，不是标准达标、资料真实性或实机验收结论"};
}
function projectMetrics(project) {
  const inspection=validateProject(project),results={inspection,calculations:{},skipped:[]};
  function attempt(name,fn) {try{results.calculations[name]=fn();}catch(e){results.skipped.push({name,reason:e.message});}}
  if(inspection.errors.length) {results.skipped.push({name:"all",reason:"项目结构或输入有错误，先修正"});return results;}
  attempt("room",()=>roomMetrics(project.room_mm));
  if(inspection.ready.brightness)attempt("brightness",()=>brightness({
    lumens:project.projection.lumens,gain:project.screen.gain,width_mm:project.screen.width_mm,
    height_mm:project.screen.height_mm,retention_factor:project.projection.brightness_retention_factor
  }));
  else results.skipped.push({name:"brightness",reason:"缺有效画面/亮度输入"});
  if(inspection.ready.screen_angles)attempt("seat_screen_angles",()=>project.seats.map(s=>({seat_id:s.id,row:s.row,...screenAngles(project.screen,s.position_mm)})));
  else results.skipped.push({name:"seat_screen_angles",reason:"缺实体座位或幕面几何"});
  if(inspection.ready.scalar_output)attempt("scalar_output",()=>project.speakers.map(s=>({
    speaker_id:s.id,channel:s.channel??null,seats:project.seats.map(seat=>({
      seat_id:seat.id,row:seat.row,...scalarSpl({...s.output,distance_m:distanceM(s.position_mm,seat.position_mm)})
    }))
  })));
  else results.skipped.push({name:"scalar_output",reason:"缺音箱/功放口径或声学参考点"});
  const subs=(project.speakers??[]).filter(s=>s?.kind==="subwoofer");
  if(subs.length&&results.calculations.scalar_output)attempt("combined_subwoofer_references",()=>project.seats.map(seat=>{
    const levels=subs.map(sub=>results.calculations.scalar_output.find(s=>s.speaker_id===sub.id).seats.find(s=>s.seat_id===seat.id).spl_db);
    return{seat_id:seat.id,row:seat.row,...combineLevelReferences(levels)};
  }));
  const left=(project.speakers??[]).find(s=>s?.channel==="L"),right=(project.speakers??[]).find(s=>s?.channel==="R");
  if(left&&right&&inspection.ready.geometry)attempt("front_speaker_angles",()=>project.seats.map(seat=>({seat_id:seat.id,total_horizontal_deg:horizontalAngleDeg(seat.position_mm,left.position_mm,right.position_mm)})));
  if(inspection.ready.quote)attempt("quoted_total_cny",()=>project.budget.items.reduce((sum,item)=>sum+item.qty*item.unit_price_cny,0));
  else results.skipped.push({name:"quoted_total_cny",reason:"无完整有效报价，不生成金额"});
  return results;
}
function validateSkillFiles(files) {
  const errors=[],warnings=[],skill=files["SKILL.md"];
  if(typeof skill!=="string")return{valid:false,errors:["缺SKILL.md"],warnings};
  const match=/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(skill);
  if(!match)errors.push("缺有效YAML frontmatter");
  let name=null,description=null;
  if(match) {
    const entries=match[1].split(/\r?\n/).filter(Boolean).map(line=>/^([a-z-]+):\s*(.*)$/.exec(line));
    if(entries.some(e=>!e))errors.push("第一版校验器要求单行name与description");
    for(const entry of entries.filter(Boolean)) {
      if(entry[1]==="name")name=entry[2];else if(entry[1]==="description")description=entry[2];else errors.push("多余元数据字段："+entry[1]);
    }
    if(!name||name.length>64||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))errors.push("技能名称无效");
    if(!description||description.length>1024||/[<>]/.test(description))errors.push("技能描述无效");
  }
  if(skill.split(/\r?\n/).length>=500)warnings.push("主文件过长，建议移到references");
  const links=[...skill.matchAll(/\]\(([^)]+)\)/g)].map(m=>m[1]);
  for(const link of links)if(!/^https?:\/\//.test(link)&&!Object.hasOwn(files,link))errors.push("资源链接不存在："+link);
  const referenced=[...skill.matchAll(/\b(?:assets|scripts)\/[a-zA-Z0-9_.-]+/g)].map(m=>m[0]);
  for(const path of new Set(referenced))if(!Object.hasOwn(files,path))errors.push("资源路径不存在："+path);
  for(const [path,content] of Object.entries(files)) {
    if(path.endsWith(".json"))try{JSON.parse(content);}catch(e){errors.push(path+" JSON错误："+e.message);}
    if(path.endsWith(".cjs"))try{new Function("require","module","exports","__dirname","__filename",content);}catch(e){errors.push(path+" JS语法错误："+e.message);}
  }
  const yaml=files["agents/openai.yaml"]??"";
  const short=/short_description:\s*"([^"]*)"/.exec(yaml)?.[1];
  if(!short||short.length<25||short.length>64)errors.push("界面短描述需25—64字符");
  if(name&&!yaml.includes("$"+name))errors.push("界面默认提示缺技能名称");
  return{valid:errors.length===0,errors,warnings,name,files:Object.keys(files).length};
}
module.exports={FL_TO_NITS,distanceM,horizontalAngleDeg,screenAngles,brightness,sensitivity1W,scalarSpl,
  combineLevelReferences,axialModes,roomMetrics,pointerValue,geometrySnapshot,compareGeometry,
  validateProject,projectMetrics,validateSkillFiles};

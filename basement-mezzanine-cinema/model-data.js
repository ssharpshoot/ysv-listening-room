// Engineering coordinates in millimetres: +x is audience left, +y goes from screen to rear, +z is up.
// Scene conversion: Three.js x = -x / 1000, y = z / 1000, z = y / 1000.
export const room = Object.freeze({
  width: 5300,
  length: 6200,
  height: 2800,
  grossPlanWidth: 5800,
  grossPlanLength: 6800,
  screen: { width: 2800, height: 1575, bottom: 600, depth: 280 },
  mezzanine: { lowerFloorToUpperFloor: 2700, floorBuildUp: 250, lowerFinish: 80 },
  source: '开发商图 6800 mm；另一向约 5800 mm 由图像比例推算；完成面净尺寸与净高均为设计假设'
});

export const seats = Object.freeze([
  ...[-900, 0, 900].map((x, index) => ({ id: `F${index + 1}`, row: 1, x, y: 3000, earZ: 1100, platformZ: 0 })),
  ...[-900, 0, 900].map((x, index) => ({ id: `R${index + 1}`, row: 2, x, y: 4450, earZ: 1300, platformZ: 200 }))
]);

export const speakers = Object.freeze([
  { id: 'L', name: '主左 L', group: 'bed', x: 1250, y: 230, z: 1250, note: '透声幕后的左主声道；位置按前排参考点初排。' },
  { id: 'C', name: '中置 C', group: 'bed', x: 0, y: 230, z: 1250, note: '透声幕后中置；银幕与音箱具体构造待定。' },
  { id: 'R', name: '主右 R', group: 'bed', x: -1250, y: 230, z: 1250, note: '透声幕后的右主声道。' },
  { id: 'SL', name: '侧环绕左 SL', group: 'bed', x: 2460, y: 3850, z: 1350, note: '按两排折中布置；后排覆盖角需复核。' },
  { id: 'SR', name: '侧环绕右 SR', group: 'bed', x: -2460, y: 3850, z: 1350, note: '按两排折中布置；后排覆盖角需复核。' },
  { id: 'SBL', name: '后环绕左 SBL', group: 'bed', x: 1500, y: 5960, z: 1370, note: '后墙音箱；后排到墙的净距及突出箱体待核。' },
  { id: 'SBR', name: '后环绕右 SBR', group: 'bed', x: -1500, y: 5960, z: 1370, note: '后墙音箱；后排到墙的净距及突出箱体待核。' },
  { id: 'SUB-F', name: '前低音炮 1', group: 'sub', x: 0, y: 540, z: 390, note: '前墙中点候选位置；单炮对比仅保留这一只。' },
  { id: 'SUB-R', name: '后低音炮 2', group: 'sub', x: 0, y: 5650, z: 390, note: '后墙中点候选位置；与前炮同信号的比较场景，现场可行性待核。' },
  { id: 'TFL', name: '前顶部左 TFL', group: 'top', x: 1100, y: 2100, z: 2630, note: '实体顶部音箱，预留顶板、梁与吊顶安装条件。' },
  { id: 'TFR', name: '前顶部右 TFR', group: 'top', x: -1100, y: 2100, z: 2630, note: '实体顶部音箱，预留顶板、梁与吊顶安装条件。' },
  { id: 'TRL', name: '后顶部左 TRL', group: 'top', x: 1100, y: 4100, z: 2630, note: '顶部后区；与第二排耳位及梁位重新核角度。' },
  { id: 'TRR', name: '后顶部右 TRR', group: 'top', x: -1100, y: 4100, z: 2630, note: '顶部后区；与第二排耳位及梁位重新核角度。' },
  { id: 'K-L', name: 'KTV 左', group: 'ktv', x: 2240, y: 850, z: 1940, note: '独立 KTV 音箱；朝向避开演唱区麦克风的直接拾音轴。' },
  { id: 'K-R', name: 'KTV 右', group: 'ktv', x: -2240, y: 850, z: 1940, note: '独立 KTV 音箱；与影院系统切模式，具体声压与反馈裕量待调试。' }
]);

// Optional four-sub comparison only; the planned cinema remains 7.2.4.
export const comparisonSubs = Object.freeze([
  { id: 'SUB-SL', name: '备选侧墙低音炮 3', group: 'sub', x: 2100, y: 3100, z: 390, note: '四炮比较中的左侧墙中点候选；不是当前 7.2.4 设备清单。' },
  { id: 'SUB-SR', name: '备选侧墙低音炮 4', group: 'sub', x: -2100, y: 3100, z: 390, note: '四炮比较中的右侧墙中点候选；需复核门、座位和安装条件。' }
]);

export const sourceLinks = Object.freeze({
  dolby: 'https://www.dolby.com/about/support/guide/speaker-setup-guides/7.1.4-overhead-speaker-setup-guide',
  rp22: 'https://cedia.org/site/assets/files/6057/cedia-cta_rp22_v1_2_sept_2023.pdf'
});

export function horizontalViewAngleDeg(earY, screenWidth = room.screen.width) {
  const distance = (earY - room.screen.depth) / 1000;
  return 2 * Math.atan((screenWidth / 1000) / (2 * distance)) * 180 / Math.PI;
}

export function seatWallClearanceMm(seat) {
  return {
    side: room.width / 2 - Math.abs(seat.x),
    rear: room.length - seat.y
  };
}

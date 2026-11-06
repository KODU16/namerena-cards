// A 难度按编号累计生效；数值集中在这里，方便后续平衡时不遗漏存档和展示。
export const DIFFICULTIES = Object.freeze([
  { level: 1, text: '精英节点数量 +60%' },
  { level: 2, text: '普通敌人攻击、魔力 ×1.20' },
  { level: 3, text: '精英攻击、魔力 ×1.35' },
  { level: 4, text: '层顶 Boss 攻击、魔力 ×1.50' },
  { level: 5, text: '自身生命回复 ×75%' },
  { level: 6, text: '普通敌人生命 ×1.15' },
  { level: 7, text: '精英生命 ×1.25' },
  { level: 8, text: '层顶 Boss 生命 ×1.35' },
  { level: 9, text: '所有敌人额外生命 ×1.10' },
  { level: 10, text: '所有角色获得固定 30 熟练度的「摆烂」' },
  { level: 11, text: '药水效果 ×50%' },
  { level: 12, text: '升级卡数值 ×75%' },
  { level: 13, text: '天梯分数掉落 ×75%' },
  { level: 14, text: '每战初始生命为 75%；篝火休息后为 90%' },
  { level: 15, text: '战后奖励与补给变为二选一' },
  { level: 16, text: '商店价格 ×1.20' },
  { level: 17, text: '所有敌人：速、敏 ×1.10，智 ×1.30' },
  { level: 18, text: '所有敌人：速、敏 ×1.18，智 ×1.60' },
  { level: 19, text: '所有敌人：速、敏 ×1.25，智 ×2' },
  { level: 20, text: '第十层 Boss 为天梯第 2、1 名连战队伍' },
]);

export const difficultyLevel = run => Math.max(0, Math.min(20, Number(run?.difficulty) || 0));
export const hasDifficulty = (run, level) => difficultyLevel(run) >= level;
export const difficultyEffects = level => DIFFICULTIES.filter((entry) => entry.level <= Math.max(0, Number(level) || 0));
export const difficultyName = level => Number(level) > 0 ? `A${level}` : '标准';

// 三类敌人的独立属性倍率；展示层将这些倍率与既有精英/Boss 倍率相乘后标成蓝字。
export function enemyDifficultyMultipliers(run, kind) {
  const level = difficultyLevel(run), mult = { hp: 1, atk: 1, mag: 1, spd: 1, agi: 1, wis: 1 };
  if (level >= 9) mult.hp *= 1.10;
  if (kind === 'normal') { if (level >= 2) { mult.atk *= 1.20; mult.mag *= 1.20; } if (level >= 6) mult.hp *= 1.15; }
  if (kind === 'elite') { if (level >= 3) { mult.atk *= 1.35; mult.mag *= 1.35; } if (level >= 7) mult.hp *= 1.25; }
  if (kind === 'boss') { if (level >= 4) { mult.atk *= 1.50; mult.mag *= 1.50; } if (level >= 8) mult.hp *= 1.35; }
  if (level >= 19) { mult.spd *= 1.25; mult.agi *= 1.25; mult.wis *= 2; }
  else if (level >= 18) { mult.spd *= 1.18; mult.agi *= 1.18; mult.wis *= 1.60; }
  else if (level >= 17) { mult.spd *= 1.10; mult.agi *= 1.10; mult.wis *= 1.30; }
  return mult;
}

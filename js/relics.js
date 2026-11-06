// 遗物定义独立于奖励来源；持有期间效果持续生效，销毁后立即停止。
export const RELIC_RARITIES = Object.freeze({
  blue: Object.freeze({ label: '蓝色 · 精良', weight: 70, shopPrice: 2300 }),
  purple: Object.freeze({ label: '紫色 · 稀有', weight: 25, shopPrice: 4100 }),
  gold: Object.freeze({ label: '金色 · 传说', weight: 5, shopPrice: 6800 }),
});

export const RELICS = Object.freeze({
  'pl-tester-v1': Object.freeze({
    id: 'pl-tester-v1',
    name: '初版pl测号器',
    icon: 'assets/icons32/relic-pl-tester.png',
    rarity: 'gold',
    description: '进入战斗时，己方所有战斗角色获得 1 回合疾走；敌方所有角色获得 1 回合迟缓。',
    flavor: '陈旧的古董测号器，但是在当年出现时具有颠覆性的速度',
  }),
  'cpu-fan': Object.freeze({ id: 'cpu-fan', name: '改进型CPU风扇', icon: 'assets/icons32/relic-cpu-fan.png', rarity: 'blue', description: '每回合己方所有角色恢复 3% 最大生命。', flavor: '优良的风扇能够降低CPU温度，增加测号速度的同时延长CPU寿命，注意及时清灰和噪音对周围人的影响' }),
  'rat-tail': Object.freeze({ id: 'rat-tail', name: '耗子尾汁', icon: 'assets/icons32/relic-rat-tail.png', rarity: 'blue', description: '每回合己方所有角色获得 3 点护盾，遗物护盾上限 30；有护盾熟练度时按该熟练度计算上限，并独立于自身护盾恢复。', flavor: '护盾实际上是强力的技能，但是需要合理的技能组搭配才能发挥实力' }),
  'heavy-spite': Object.freeze({ id: 'heavy-spite', name: '很重的戾气', icon: 'assets/icons32/relic-heavy-spite.png', rarity: 'purple', description: '双方对敌方造成的伤害低于 30 时变为 0，且该次伤害的附加效果无效。', flavor: '二度淡游。' }),
  'help-test-post': Object.freeze({id:'help-test-post',name:'帮测贴',icon: 'assets/icons32/relic-help-test-post.png',rarity:'blue',description:'战斗开始时，每个原始友方角色随机两项不同属性 +10（HP 为 +30）。加成只保留在原角色上，分身和召唤物不生效。',flavor:'搭把手，帮忙测一下。'}),
  'battle-coin': Object.freeze({id:'battle-coin',name:'战力币',icon:'assets/icons32/relic-battle-coin.png',rarity:'purple',description:'持有时每经过一个节点获得 50 天梯分数。天梯分数一旦减少，遗物自动销毁。',flavor:'不向投资者分享【战队荣耀】是说不过去的'}),
  'language-pack': Object.freeze({id:'language-pack',name:'自制语言包',icon:'assets/icons32/relic-language-pack.png',rarity:'blue',description:'友方向敌人成功施加狂暴以外的负面状态时，同时施加 1 回合狂暴。净化等移除状态的效果不触发。',flavor:'显然我看不懂这个'}),
  'box-opener': Object.freeze({id:'box-opener',name:'开箱器',icon:'assets/icons32/relic-box-opener.png',rarity:'blue',description:'电脑测得的最强名字入库时，八项基础属性 ×1.2，技能熟练度不变。测号结果显示绿色 ×1.2 标记。',flavor:'使用方法一目了然，并没有技术上的突破'}),
  'constructor-shard': Object.freeze({ id: 'constructor-shard', name: '构造器残片', icon: 'assets/icons32/relic-constructor-shard.png', rarity: 'blue', description: '在篝火选择休息时，当前出战角色随机获得 10 点技能熟练度，包含净化和幻术。', flavor: '据说残片的完整体拥有足以终结全名竞的实力' }),
  'accept': Object.freeze({ id: 'accept', name: '接受', icon: 'assets/icons32/relic-accept.png', rarity: 'blue', description: '战斗结束后的三选一奖励中，天梯分数提高 20%。', flavor: '一段很棒的代码，似乎能通过此次测试' }),
  'attribute-modifier': Object.freeze({ id: 'attribute-modifier', name: '+属性修改器@!', icon: 'assets/icons32/relic-attribute-modifier.png', rarity: 'purple', description: '友方向敌人施加的负面状态持续时间延长 1 回合；净化不受影响。', flavor: '加属性修改器算什么...最草的是还加错了' }),
  'say-and-do': Object.freeze({ id: 'say-and-do', name: '说和做', icon: 'assets/icons32/relic-say-and-do.png', rarity: 'purple', description: '全部名字的分身熟练度 +10；分身造成的属性削弱降低 20%。加成不计入基础熟练度，销毁后立即失效。', flavor: '在远古时代流传的传说，靠一个普通名字单挑蚊的存在' }),
  'red-underwear': Object.freeze({ id: 'red-underwear', name: '红内裤', icon: 'assets/icons32/relic-red-underwear.png', rarity: 'purple', description: '自身获得的任意正面状态持续时间 +1 回合。', flavor: '可能是因为我今天穿了红内裤' }),
  'jade-hairpin': Object.freeze({ id: 'jade-hairpin', name: '玉珠金簪', icon: 'assets/icons32/relic-jade-hairpin.png', rarity: 'gold', description: '电脑测号的扫描数量额外增加 500%（例如 1000 个变为 6000 个），仍只入库最高值。', flavor: '玉珠金簪现象，是不是开启测号新时代？' }),
  'thanks': Object.freeze({ id: 'thanks', name: '拜谢', icon: 'assets/icons32/relic-thanks.png', rarity: 'purple', description: '自身获得的负面状态持续时间 +1 回合；结束时，敌方强制获得 2 回合相同负面状态。', flavor: '别输在不会拜谢上' }),
  'inequality': Object.freeze({ id: 'inequality', name: '不等式', icon: 'assets/icons32/relic-inequality.png', rarity: 'purple', description: '己方召唤物、分身或队友死亡时，随机其余非召唤物友方吞噬死亡角色，获得等价属性加成。', flavor: '传说在名竞最重要的武术大赛中，有一位传奇靠着献祭自己兄弟的力量夺冠' }),
});

export const relicById = (id) => RELICS[id] || null;
export const relicRarity = (id) => relicById(id)?.rarity || 'blue';

// 先按稀有度分配 70/25/5 的总概率，再在该档的未持有遗物中等概率抽取。
export function rollRelic(rng, owned = []) {
  const ownedIds = new Set(owned);
  const tiers = Object.entries(RELIC_RARITIES).map(([id, rule]) => ({ id, rule,
    relics: Object.values(RELICS).filter((relic) => relic.rarity === id && !ownedIds.has(relic.id)),
  })).filter((tier) => tier.relics.length);
  const total = tiers.reduce((sum, tier) => sum + tier.rule.weight, 0);
  if (!total) return null;
  let cursor = rng() * total;
  const tier = tiers.find((entry) => (cursor -= entry.rule.weight) < 0) || tiers.at(-1);
  return tier.relics[Math.floor(rng() * tier.relics.length)];
}

// 旧存档或外部存档只接受已定义遗物，同种遗物只保留一件。
export const normalizeRelics = (list) => [...new Set((Array.isArray(list) ? list : []).map((item) => typeof item === 'string' ? item : item?.id))].filter(relicById);

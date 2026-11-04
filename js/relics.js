// 遗物定义独立于奖励来源；持有期间效果持续生效，销毁后立即停止。
export const RELICS = Object.freeze({
  'pl-tester-v1': Object.freeze({
    id: 'pl-tester-v1',
    name: '初版pl测号器',
    icon: 'assets/icons32/relic-pl-tester.png',
    description: '进入战斗时，己方所有战斗角色获得 1 回合疾走；敌方所有角色获得 1 回合迟缓。',
    flavor: '陈旧的古董测号器，但是在当年出现时具有颠覆性的速度',
  }),
  'cpu-fan': Object.freeze({ id: 'cpu-fan', name: '改进型CPU风扇', icon: 'assets/icons32/relic-cpu-fan.png', description: '每回合己方所有角色恢复 3% 最大生命。', flavor: '优良的风扇能够降低CPU温度，增加测号速度的同时延长CPU寿命，注意及时清灰和噪音对周围人的影响' }),
  'rat-tail': Object.freeze({ id: 'rat-tail', name: '耗子尾汁', icon: 'hero-rat-tail', description: '每回合己方所有角色获得 3 点护盾，遗物护盾上限 30；有护盾熟练度时按该熟练度计算上限，并独立于自身护盾恢复。', flavor: '护盾实际上是强力的技能，但是需要合理的技能组搭配才能发挥实力' }),
  'heavy-spite': Object.freeze({ id: 'heavy-spite', name: '很重的戾气', icon: 'assets/icons32/relic-heavy-spite.png', description: '双方对敌方造成的伤害低于 30 时变为 0，且该次伤害的附加效果无效。', flavor: '二度淡游。' }),
  'help-test-post': Object.freeze({id:'help-test-post',name:'帮测贴',icon: 'assets/icons32/relic-help-test-post.png',description:'战斗开始时，每个原始友方角色随机两项不同属性 +10（HP 为 +30）。加成只保留在原角色上，分身和召唤物不生效。',flavor:'搭把手，帮忙测一下。'}),
  'constructor-shard': Object.freeze({ id: 'constructor-shard', name: '构造器残片', icon: 'assets/icons32/relic-constructor-shard.png', description: '在篝火选择休息时，当前出战角色随机获得 10 点技能熟练度，包含净化和幻术。', flavor: '据说残片的完整体拥有足以终结全名竞的实力' }),
});

export const relicById = (id) => RELICS[id] || null;

// 旧存档或外部存档只接受已定义遗物，同种遗物只保留一件。
export const normalizeRelics = (list) => [...new Set((Array.isArray(list) ? list : []).map((item) => typeof item === 'string' ? item : item?.id))].filter(relicById);

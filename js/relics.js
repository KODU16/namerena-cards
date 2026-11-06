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
  'rat-tail': Object.freeze({ id: 'rat-tail', name: '耗子尾汁', icon: 'assets/icons32/relic-rat-tail.png', description: '每回合己方所有角色获得 3 点护盾，遗物护盾上限 30；有护盾熟练度时按该熟练度计算上限，并独立于自身护盾恢复。', flavor: '护盾实际上是强力的技能，但是需要合理的技能组搭配才能发挥实力' }),
  'heavy-spite': Object.freeze({ id: 'heavy-spite', name: '很重的戾气', icon: 'assets/icons32/relic-heavy-spite.png', description: '双方对敌方造成的伤害低于 30 时变为 0，且该次伤害的附加效果无效。', flavor: '二度淡游。' }),
  'help-test-post': Object.freeze({id:'help-test-post',name:'帮测贴',icon: 'assets/icons32/relic-help-test-post.png',description:'战斗开始时，每个原始友方角色随机两项不同属性 +10（HP 为 +30）。加成只保留在原角色上，分身和召唤物不生效。',flavor:'搭把手，帮忙测一下。'}),
  'battle-coin': Object.freeze({id:'battle-coin',name:'战力币',icon:'assets/icons32/relic-battle-coin.png',description:'持有时每经过一个节点获得 50 天梯分数。天梯分数一旦减少，遗物自动销毁。',flavor:'不向投资者分享【战队荣耀】是说不过去的'}),
  'language-pack': Object.freeze({id:'language-pack',name:'自制语言包',icon:'assets/icons32/relic-language-pack.png',description:'友方向敌人成功施加狂暴以外的负面状态时，同时施加 1 回合狂暴。净化等移除状态的效果不触发。',flavor:'显然我看不懂这个'}),
  'box-opener': Object.freeze({id:'box-opener',name:'开箱器',icon:'assets/icons32/relic-box-opener.png',description:'电脑测得的最强名字入库时，八项基础属性 ×1.2，技能熟练度不变。测号结果显示绿色 ×1.2 标记。',flavor:'使用方法一目了然，并没有技术上的突破'}),
  'constructor-shard': Object.freeze({ id: 'constructor-shard', name: '构造器残片', icon: 'assets/icons32/relic-constructor-shard.png', description: '在篝火选择休息时，当前出战角色随机获得 10 点技能熟练度，包含净化和幻术。', flavor: '据说残片的完整体拥有足以终结全名竞的实力' }),
  'accept': Object.freeze({ id: 'accept', name: '接受', icon: 'assets/icons32/relic-accept.png', description: '战斗结束后的三选一奖励中，天梯分数提高 20%。', flavor: '一段很棒的代码，似乎能通过此次测试' }),
  'attribute-modifier': Object.freeze({ id: 'attribute-modifier', name: '+属性修改器@!', icon: 'assets/icons32/relic-attribute-modifier.png', description: '友方向敌人施加的负面状态持续时间延长 1 回合；净化不受影响。', flavor: '加属性修改器算什么...最草的是还加错了' }),
  'say-and-do': Object.freeze({ id: 'say-and-do', name: '说和做', icon: 'assets/icons32/relic-say-and-do.png', description: '全部名字的分身熟练度 +10；分身造成的属性削弱降低 20%。加成不计入基础熟练度，销毁后立即失效。', flavor: '在远古时代流传的传说，靠一个普通名字单挑蚊的存在' }),
});

export const relicById = (id) => RELICS[id] || null;

// 旧存档或外部存档只接受已定义遗物，同种遗物只保留一件。
export const normalizeRelics = (list) => [...new Set((Array.isArray(list) ? list : []).map((item) => typeof item === 'string' ? item : item?.id))].filter(relicById);

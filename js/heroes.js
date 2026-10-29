// 英雄名单独立配置；评分为提供的榜单值，属性和技能使用同一个名字种子现算。
export const HEROES = [{
  id: 'tik-tok',
  year: 2025,
  name: 'Tik_Tok #IBxWzGZtr',
  clan: 'Shabby_fish',
  portrait: 'assets/heroes/tik-tok.webp',
  description: 'Tik_Tok已经横扫全球',
  scores: { pp: 8510, pd: 9497, qp: 6504, qd: 8210 },
}, {
  id: 'squall-duo',
  year: 2025,
  members: [
    { name: '稗田阿求 OQL68NN8', clan: 'Squall' },
    { name: '九十九八桥 6G6GIGLI', clan: 'Squall' },
  ],
  portrait: 'assets/heroes/squall-duo.webp',
  description: '包揽了二人组前二',
}, {
  // 2022 年英雄沿用单人卡牌的四项榜单评分与按需加载立绘。
  id: 'vruh-z',
  year: 2022,
  name: 'vRuH:z',
  clan: '耗子尾汁',
  portrait: 'assets/heroes/vruh-z.webp',
  description: '年轻人不讲武德',
  scores: { pp: 8500, pd: 9210, qp: 6122, qd: 7241 },
}];

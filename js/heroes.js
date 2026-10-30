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
}, {
  // 2020 年英雄按提供的名字生成属性，榜单评分独立保留。
  id: 'bingcha-xinshi',
  year: 2020,
  name: '并查信使遗纵骏',
  clan: '学车中学',
  portrait: 'assets/heroes/bingcha-xinshi.webp',
  description: '预计成为汏修垄一样的超级霸主',
  scores: { pp: 7707, pd: 8752, qp: 5512, qd: 6386 },
}, {
  // 历史冠军使用提供的榜单评分，属性和技能由名字现算。
  id: 'wenge-i357114',
  year: 2019,
  name: '文鸽I357114',
  clan: '文哥',
  portrait: 'assets/heroes/wenge-i357114.webp',
  description: '第0届武术大赛冠军',
  scores: { pp: 7152, pd: 8003, qp: 4571, qd: 4334, sum: 24060 },
}, {
  // 历史英雄保留提供的四项评分与总分，立绘按年份展示时加载。
  id: 'shuolu-huang',
  year: 2016,
  name: '烁露凰',
  clan: '库瓒',
  portrait: 'assets/heroes/shuolu-huang.webp',
  description: '譬如朝露',
  scores: { pp: 6957, pd: 7699, qp: 4297, qd: 3963, sum: 22916 },
}, {
  id: 'yinying-67031736',
  year: 2020,
  name: '银影67031736',
  clan: '云剑',
  portrait: 'assets/heroes/yinying-67031736.webp',
  description: '云剑只藏了一个7000',
  scores: { pp: 7906, pd: 8736, qp: 5422, qd: 5756, sum: 27820 },
}, {
  id: 'daxiulong-xingjiejing',
  year: 2020,
  name: '汏修垄星结晶',
  clan: '琪拉拉',
  portrait: 'assets/heroes/daxiulong-xingjiejing.webp',
  description: '以积分为标准的天梯还拼的是大概率',
  scores: { pp: 7557, pd: 8654, qp: 5010, qd: 5883, sum: 27104 },
}];

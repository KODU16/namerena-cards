// tswn 七围外显编码上限；体力是独立字段，不使用七围255上限。
export const ATTRIBUTE_LIMIT=255;
export const ATTRIBUTE_KEYS=['atk','def','spd','agi','mag','res','wis'];
export function capStats(stats){return Object.fromEntries(Object.entries(stats||{}).map(([key,value])=>[key,ATTRIBUTE_KEYS.includes(key)?Math.max(0,Math.min(ATTRIBUTE_LIMIT,Math.round(value))):value]));}
export function attributeRoom(stats,key){return key==='hp'?Infinity:Math.max(0,ATTRIBUTE_LIMIT-(stats?.[key]||0));}

// 工坊只接受同源主站会话确认的主队；副队待主站接口提供后再接入。
export async function workshopAccount() {
  try {
    const response = await fetch('/api/cards/session', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error('session unavailable');
    const data = await response.json();
    const team = typeof data.teamname === 'string' ? data.teamname.trim() : '';
    return { allowed: data.logged_in === true && !!team, teams: data.logged_in === true && team ? [team] : [] };
  } catch { return { allowed: false, teams: [], unavailable: true }; }
}

// 名字不能夹带另一个阵营或引擎覆盖行，队伍仅取已确认的会话值。
export function workshopNameValid(name) {
  return !!name && name.length <= 48 && !/[@\r\n]/.test(name) && !/\+ol:/i.test(name);
}

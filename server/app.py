"""名竞尖塔（namerena-cards）后端：对局记录 API + 静态站点托管。

部署形态（与主站同源）：
    https://shenjack.top/cards/          -> dist/ 静态文件
    https://shenjack.top/api/cards/*     -> 本服务

登录沿用主站会话 cookie：本服务不解析 cookie，而是把 Cookie 头转发给主站的
/api/cards/session 换取 teamname；teamname 即用户身份。这样不需要拿到主站密钥。

环境变量：
    CARDS_SECRET       必填，CSRF 签名用
    PLATFORM_SESSION   主站会话地址，默认 https://shenjack.top/api/cards/session
    DATABASE_PATH      SQLite 文件路径，默认 ./cards.sqlite3
    DIST_DIR           静态站点目录，默认 ./dist
    AUTH_MODE          platform（默认）| dev（本地用 X-Debug-Team 模拟登录）
    RATE_READ/RATE_WRITE  每分钟上限，默认 120 / 60
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import sqlite3
import threading
import time
from datetime import datetime, timezone

import urllib.error
import urllib.request

from flask import Flask, g, jsonify, request, send_from_directory

APP_DIR = os.path.dirname(os.path.abspath(__file__))


def env(name: str, default: str) -> str:
    return os.environ.get(name) or default


CARDS_SECRET = env('CARDS_SECRET', 'dev-secret-change-me')
PLATFORM_SESSION = env('PLATFORM_SESSION', 'https://shenjack.top/api/cards/session')
DATABASE_PATH = env('DATABASE_PATH', os.path.join(APP_DIR, 'cards.sqlite3'))
DIST_DIR = env('DIST_DIR', os.path.join(APP_DIR, '..', 'dist'))
AUTH_MODE = env('AUTH_MODE', 'platform')
RATE_READ = int(env('RATE_READ', '120'))
RATE_WRITE = int(env('RATE_WRITE', '60'))

LANES = {'1a', '1b', '2a', '2b', '3a'}

app = Flask(__name__, static_folder=None)

# ———————————————————————————————— 数据库

_schema_lock = threading.Lock()


def db() -> sqlite3.Connection:
    if 'db' not in g:
        g.db = sqlite3.connect(DATABASE_PATH, timeout=10)
        g.db.row_factory = sqlite3.Row
        g.db.execute('PRAGMA journal_mode=WAL')
        g.db.execute('PRAGMA foreign_keys=ON')
    return g.db


@app.teardown_appcontext
def _close_db(_exc):
    conn = g.pop('db', None)
    if conn is not None:
        conn.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS cards_run (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_key         TEXT    NOT NULL,
    lane             TEXT    NOT NULL DEFAULT '1A',
    clan             TEXT    NOT NULL DEFAULT '',
    team_size        INTEGER NOT NULL DEFAULT 1,
    seed             INTEGER NOT NULL DEFAULT 0,
    ladder_source    TEXT    NOT NULL DEFAULT '',
    team_json        TEXT    NOT NULL DEFAULT '[]',
    status           TEXT    NOT NULL DEFAULT 'active',
    wins             INTEGER NOT NULL DEFAULT 0,
    layers           INTEGER NOT NULL DEFAULT 0,
    started_at       TEXT    NOT NULL,
    finished_at      TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cards_run_user ON cards_run (user_key, status);
"""


def ensure_schema() -> None:
    with _schema_lock:
        conn = sqlite3.connect(DATABASE_PATH)
        try:
            conn.executescript(SCHEMA)
            conn.commit()
        finally:
            conn.close()


ensure_schema()


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


# ———————————————————————————————— 错误与限流


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


@app.errorhandler(ApiError)
def _api_error(err: ApiError):
    return jsonify({'ok': False, 'error': {'code': err.code, 'message': err.message}}), err.status


class RateLimited(Exception):
    def __init__(self, retry_after: int):
        self.retry_after = retry_after


@app.errorhandler(RateLimited)
def _rate_limited(err: RateLimited):
    resp = jsonify({'ok': False, 'error': {'code': 'rate_limited', 'message': '请求过于频繁，请稍后再试。'}})
    resp.status_code = 429
    resp.headers['Retry-After'] = str(err.retry_after)
    return resp


_buckets: dict[str, list[float]] = {}
_bucket_lock = threading.Lock()


def rate_limit(limit: int) -> None:
    ip = request.headers.get('X-Forwarded-For', request.remote_addr or '?').split(',')[0].strip()
    key = f'{ip}:{limit}'
    now = time.time()
    with _bucket_lock:
        hits = [t for t in _buckets.get(key, []) if now - t < 60]
        if len(hits) >= limit:
            _buckets[key] = hits
            raise RateLimited(max(1, int(60 - (now - hits[0]))))
        hits.append(now)
        _buckets[key] = hits


# ———————————————————————————————— 登录态（沿用主站 cookie）


def _platform_user() -> dict | None:
    """把浏览器带来的 Cookie 转发给主站 /session，拿到 teamname。"""
    cookie = request.headers.get('Cookie', '')
    if not cookie:
        return None
    req = urllib.request.Request(PLATFORM_SESSION, headers={'Cookie': cookie, 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode('utf-8') or '{}')
    except (urllib.error.URLError, TimeoutError, ValueError):
        return None
    if not data.get('logged_in'):
        return None
    teamname = (data.get('teamname') or '').strip()
    if not teamname:
        return None
    return {'teamname': teamname, 'user_key': teamname.lower()}


def current_user() -> dict | None:
    if 'user' in g:
        return g.user
    user = None
    if AUTH_MODE == 'dev' and request.headers.get('X-Debug-Team'):
        name = request.headers['X-Debug-Team']
        user = {'teamname': name, 'user_key': name.lower()}
    else:
        user = _platform_user()
    g.user = user
    return user


def require_user() -> dict:
    user = current_user()
    if not user:
        raise ApiError(401, 'login_required', '只有登录战队账号后才会记录对局数据。')
    return user


# ———————————————————————————————— CSRF


def csrf_for(user_key: str) -> str:
    # 绑定到用户 + 一小时时间片；纯无状态，重启也不失效
    slot = int(time.time() // 3600)
    digest = hmac.new(CARDS_SECRET.encode(), f'{user_key}:{slot}'.encode(), hashlib.sha256).hexdigest()
    return f'{slot}.{digest[:32]}'


def check_csrf(user_key: str) -> None:
    token = request.headers.get('X-CSRFToken', '')
    try:
        slot = int(token.split('.', 1)[0])
    except (ValueError, IndexError):
        raise ApiError(400, 'csrf_failed', 'CSRF token 缺失或无效，请重新获取。')
    now_slot = int(time.time() // 3600)
    if abs(now_slot - slot) > 1:
        raise ApiError(400, 'csrf_failed', 'CSRF token 已过期，请重新获取。')
    expect = csrf_for(user_key) if slot == now_slot else None
    if slot != now_slot:
        old = hmac.new(CARDS_SECRET.encode(), f'{user_key}:{slot}'.encode(), hashlib.sha256).hexdigest()[:32]
        expect = f'{slot}.{old}'
    if not hmac.compare_digest(token, expect):
        raise ApiError(400, 'csrf_failed', 'CSRF token 校验失败，请重新获取。')


# ———————————————————————————————— 工具


def stats_for(user_key: str) -> dict:
    row = db().execute(
        "SELECT COUNT(*) AS runs,"
        " SUM(CASE WHEN status='won' THEN 1 ELSE 0 END) AS wins,"
        " MAX(wins) AS best_wins, MAX(layers) AS best_layers,"
        " MAX(finished_at) AS last_played_at"
        ' FROM cards_run WHERE user_key = ? AND status IN (\'won\', \'lost\')',
        (user_key,),
    ).fetchone()
    return {
        'runs': row['runs'] or 0,
        'wins': row['wins'] or 0,
        'best_wins': row['best_wins'] or 0,
        'best_layers': row['best_layers'] or 0,
        'last_played_at': row['last_played_at'],
    }


def int_field(body: dict, name: str, default: int, low: int, high: int) -> int:
    raw = body.get(name, default)
    if isinstance(raw, bool) or not isinstance(raw, int):
        raise ApiError(400, 'invalid_body', f'{name} 必须是 {low}~{high} 的整数。')
    if raw < low or raw > high:
        raise ApiError(400, 'invalid_body', f'{name} 必须在 {low} 到 {high} 之间。')
    return raw


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, 'invalid_body', '请求体必须是 JSON 对象。')
    return data


def ok(payload: dict, status: int = 200):
    payload.setdefault('ok', True)
    return jsonify(payload), status


# ———————————————————————————————— API


@app.get('/api/cards/session')
def api_session():
    rate_limit(RATE_READ)
    user = current_user()
    if not user:
        return ok({'logged_in': False, 'csrf_token': 'anon.' + hmac.new(CARDS_SECRET.encode(), b'anon', hashlib.sha256).hexdigest()[:32]})
    return ok({
        'logged_in': True,
        'teamname': user['teamname'],
        'csrf_token': csrf_for(user['user_key']),
        'stats': stats_for(user['user_key']),
    })


@app.post('/api/cards/runs')
def api_start_run():
    rate_limit(RATE_WRITE)
    user = require_user()
    check_csrf(user['user_key'])
    body = json_body()

    lane = str(body.get('lane', '1A') or '1A').strip()
    if lane.lower() not in LANES:
        raise ApiError(400, 'invalid_lane', '组别必须是 1A/1B/2A/2B/3A。')
    team_size = int_field(body, 'team_size', 1, 1, 5)
    seed = int_field(body, 'seed', 0, 0, 2 ** 63 - 1)
    clan = str(body.get('clan', '') or '')[:80]
    ladder_source = str(body.get('ladder_source', '') or '')[:16]
    team = body.get('team') or []
    if not isinstance(team, list):
        raise ApiError(400, 'invalid_body', 'team 必须是数组。')
    team = [{'name': str(t.get('name', ''))[:64], 'clan': str(t.get('clan', ''))[:32]}
            for t in team[:5] if isinstance(t, dict)]
    team_json = json.dumps(team, ensure_ascii=False)[:4000]

    conn = db()
    conn.execute("UPDATE cards_run SET status='abandoned', finished_at=?, duration_seconds=0"
                 " WHERE user_key=? AND status='active'", (now_iso(), user['user_key']))
    cur = conn.execute(
        'INSERT INTO cards_run (user_key, lane, clan, team_size, seed, ladder_source, team_json, status, started_at)'
        " VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)",
        (user['user_key'], lane.upper(), clan, team_size, seed, ladder_source, team_json, now_iso()),
    )
    conn.commit()
    return ok({
        'run_id': cur.lastrowid,
        'csrf_token': csrf_for(user['user_key']),
        'stats': stats_for(user['user_key']),
    }, 201)


@app.post('/api/cards/runs/<int:run_id>/finish')
def api_finish_run(run_id: int):
    rate_limit(RATE_WRITE)
    user = require_user()
    check_csrf(user['user_key'])
    body = json_body()

    won = bool(body.get('won', False))
    wins = int_field(body, 'wins', 0, 0, 10000)
    layers = int_field(body, 'layers', 0, 0, 10)
    duration = int_field(body, 'duration_seconds', 0, 0, 7 * 24 * 3600)

    conn = db()
    row = conn.execute('SELECT * FROM cards_run WHERE id=? AND user_key=?', (run_id, user['user_key'])).fetchone()
    if row is None:
        raise ApiError(404, 'run_not_found', '这一局不存在，或者不属于当前账号。')

    already = row['status'] != 'active'
    if not already:
        conn.execute(
            'UPDATE cards_run SET status=?, wins=?, layers=?, finished_at=?, duration_seconds=? WHERE id=?',
            ('won' if won else 'lost', wins, layers, now_iso(), duration, run_id),
        )
        conn.commit()
        row = conn.execute('SELECT * FROM cards_run WHERE id=?', (run_id,)).fetchone()

    return ok({
        'already': already,
        'run': {
            'id': row['id'], 'lane': row['lane'], 'status': row['status'],
            'wins': row['wins'], 'layers': row['layers'],
            'started_at': row['started_at'], 'finished_at': row['finished_at'],
            'duration_seconds': row['duration_seconds'],
        },
        'stats': stats_for(user['user_key']),
        'csrf_token': csrf_for(user['user_key']),
    })


# ———————————————————————————————— 部署钩子（可选）

DEPLOY_SECRET = env('DEPLOY_SECRET', '')
DEPLOY_SCRIPT = env('DEPLOY_SCRIPT', os.path.join(APP_DIR, 'deploy.sh'))


@app.post('/api/cards/_deploy')
def api_deploy():
    """让 CI 或本地一把梭触发服务器更新：带 X-Deploy-Secret 的 POST。

    没配 DEPLOY_SECRET 时这个接口等于不存在（一律 404），避免误开。
    """
    if not DEPLOY_SECRET:
        raise ApiError(404, 'not_found', '未启用部署钩子。')
    if not hmac.compare_digest(request.headers.get('X-Deploy-Secret', ''), DEPLOY_SECRET):
        raise ApiError(401, 'login_required', '部署密钥不正确。')
    if not os.path.isfile(DEPLOY_SCRIPT):
        raise ApiError(500, 'deploy_failed', '服务器上找不到 deploy.sh。')
    import subprocess
    subprocess.Popen(['bash', DEPLOY_SCRIPT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return ok({'started': True, 'script': DEPLOY_SCRIPT})

# ———————————————————————————————— 静态站点：/cards/


@app.get('/cards/')
@app.get('/cards/<path:filename>')
def serve_cards(filename: str = 'index.html'):
    root = os.path.abspath(DIST_DIR)
    if not os.path.isdir(root):
        raise ApiError(404, 'not_found', '站点还没有构建（dist 目录不存在）。')
    if filename in ('', '/'):
        filename = 'index.html'
    full = os.path.abspath(os.path.join(root, filename))
    if not full.startswith(root):
        raise ApiError(404, 'not_found', '路径非法。')
    if not os.path.isfile(full):
        # 单页应用回退
        filename = 'index.html'
        full = os.path.join(root, filename)
        if not os.path.isfile(full):
            raise ApiError(404, 'not_found', '文件不存在。')
    resp = send_from_directory(root, filename)
    if filename.endswith('.html'):
        resp.headers['Cache-Control'] = 'no-cache'
    else:
        resp.headers['Cache-Control'] = 'public, max-age=300'
    return resp


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=int(env('PORT', '8800')), debug=True)

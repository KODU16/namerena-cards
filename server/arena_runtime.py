"""连接同机常驻 Node/WASM，多个 gunicorn worker 共用一份增量战斗会话。"""
from __future__ import annotations
import atexit
import json
import os
import subprocess
import threading
import time
import urllib.request
import urllib.error

_lock = threading.Lock()
_child = None


def call_runtime(payload, secret):
    port = int(os.environ.get('ARENA_RUNTIME_PORT', '8801'))
    url = f'http://127.0.0.1:{port}/'

    def send(data):
        req = urllib.request.Request(url, data=json.dumps(data, ensure_ascii=False).encode('utf-8'), headers={'Content-Type': 'application/json', 'X-Arena-Secret': secret})
        with urllib.request.urlopen(req, timeout=20) as response:
            result = json.loads(response.read())
        if not result.get('ok'):
            raise RuntimeError(result.get('error', '战斗引擎失败'))
        return result

    try:
        return send(payload)
    except urllib.error.HTTPError:
        # 已启动的引擎拒绝请求时不能再重复执行相同指令。
        raise
    except (urllib.error.URLError, ConnectionError, TimeoutError):
        pass
    with _lock:
        try:
            send({'op': 'health'})
        except urllib.error.HTTPError:
            raise
        except (urllib.error.URLError, ConnectionError, TimeoutError):
            global _child
            path = os.path.join(os.path.dirname(__file__), 'generated', 'arena-runtime.mjs')
            if not os.path.isfile(path):
                raise RuntimeError('请先运行 npm run build:site 生成多人战斗运行时')
            env = dict(os.environ, CARDS_SECRET=secret)
            options = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {'start_new_session': True}
            _child = subprocess.Popen([env.get('NODE_BINARY', 'node'), path], env=env, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **options)
            for _ in range(60):
                try:
                    send({'op': 'health'})
                    break
                except (urllib.error.URLError, ConnectionError, TimeoutError):
                    time.sleep(.05)
            else:
                raise RuntimeError('多人战斗运行时未启动，请检查 Node.js 和本地端口配置')
    return send(payload)


@atexit.register
def stop_owned_runtime():
    # 只清理本进程启动的子进程；重启后战斗按数据库中的指令恢复一次。
    if _child is not None and _child.poll() is None:
        _child.terminate()
        try:
            _child.wait(timeout=3)
        except subprocess.TimeoutExpired:
            _child.kill()
            _child.wait(timeout=3)

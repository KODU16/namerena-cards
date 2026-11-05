"""仅供本地浏览器回归的独立服务；临时数据库与测试路由不导入生产应用。"""
import os,sys,json,tempfile
from pathlib import Path
os.environ.update(AUTH_MODE='dev',CARDS_SECRET='arena-ui-local',ARENA_RUNTIME_PORT='8894',DATABASE_PATH=str(Path(tempfile.mkdtemp())/'ui.sqlite3'))
sys.path.insert(0,str(Path(__file__).resolve().parent))
from app import app,db
from flask import request,jsonify
# 仅本地浏览器测试使用的位置/时间夹具，不属于正式 API。
@app.post('/test/arena-fixture')
def fixture():
    data=request.get_json();code=data['room']
    r=json.loads(db().execute('SELECT state_json FROM cards_arena_room WHERE id=?',(code,)).fetchone()[0])
    for p in r['players'].values():p['zone']=4;p['ready_at']=0
    if not data.get('expire') and not r['battles']:
        for p in r['players'].values():p['hp']=20000;p['card']['stats']['hp']=20000
    if data.get('expire'):
        for b in r['battles'].values():
            if not b.get('done'):b['deadline']-=11
    db().execute('UPDATE cards_arena_room SET state_json=? WHERE id=?',(json.dumps(r),code));db().commit()
    return jsonify(ok=True)
app.run(host='127.0.0.1',port=8817,debug=False,threaded=True)

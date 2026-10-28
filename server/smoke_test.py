import json
import os
import sys

os.environ['AUTH_MODE'] = 'dev'
os.environ['CARDS_SECRET'] = 'test-secret'
os.environ['DATABASE_PATH'] = os.path.join(os.environ['TEMP'], 'tswn', 'cards-test.sqlite3')
if os.path.exists(os.environ['DATABASE_PATH']):
    os.remove(os.environ['DATABASE_PATH'])

sys.path.insert(0, r'C:\Program Files (x86)\360\360PT\namerena-ladder\namerena-cards\server')
from app import app  # noqa: E402

c = app.test_client()
H = {'X-Debug-Team': 'cards-dev'}

s = c.get('/api/cards/session', headers=H).get_json()
print('session:', s['logged_in'], s['teamname'], 'csrf' if s['csrf_token'] else 'no-csrf')
csrf = s['csrf_token']

bad = c.post('/api/cards/runs', json={'lane': '1A'}, headers=H)
print('no-csrf ->', bad.status_code, bad.get_json()['error']['code'])

r1 = c.post('/api/cards/runs', json={
    'lane': '2a', 'clan': '青', 'team_size': 2, 'seed': 123,
    'ladder_source': 'live', 'team': [{'name': 'A', 'clan': '青'}],
}, headers={**H, 'X-CSRFToken': csrf})
d1 = r1.get_json()
run1 = d1['run_id']
print('start ->', r1.status_code, 'run', run1, d1['stats'])

r2 = c.post('/api/cards/runs', json={'lane': '1A'}, headers={**H, 'X-CSRFToken': csrf})
print('second start ->', r2.status_code, 'run', r2.get_json()['run_id'])

f1 = c.post('/api/cards/runs/%d/finish' % run1, json={
    'won': False, 'wins': 3, 'layers': 2, 'duration_seconds': 540,
}, headers={**H, 'X-CSRFToken': csrf})
fd = f1.get_json()
print('finish ->', f1.status_code, 'already', fd['already'], fd['run']['status'], 'layers', fd['run']['layers'], fd['stats'])

f2 = c.post('/api/cards/runs/%d/finish' % run1, json={'won': False, 'wins': 3, 'layers': 2},
            headers={**H, 'X-CSRFToken': csrf})
print('repeat finish ->', f2.status_code, 'already', f2.get_json()['already'])

other = c.post('/api/cards/runs/%d/finish' % run1, json={'won': True},
               headers={'X-Debug-Team': 'other', 'X-CSRFToken': csrf})
print('foreign run ->', other.status_code, other.get_json()['error']['code'])

anon = c.post('/api/cards/runs', json={'lane': '1A'})
print('anon write ->', anon.status_code, anon.get_json()['error']['code'])

lanes = c.post('/api/cards/runs', json={'lane': '9Z'}, headers={**H, 'X-CSRFToken': csrf})
print('bad lane ->', lanes.status_code, lanes.get_json()['error']['code'])

page = c.get('/cards/')
print('static /cards/ ->', page.status_code)

win = c.post('/api/cards/runs', json={'lane': '3A', 'team_size': 3}, headers={**H, 'X-CSRFToken': csrf}).get_json()
w = c.post('/api/cards/runs/%d/finish' % win['run_id'], json={
    'won': True, 'wins': 9, 'layers': 10, 'duration_seconds': 1200,
}, headers={**H, 'X-CSRFToken': csrf}).get_json()
print('win ->', w['run']['status'], 'layers', w['run']['layers'], w['stats'])

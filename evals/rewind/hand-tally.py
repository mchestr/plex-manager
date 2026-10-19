"""Independent tally of a Rewind fixture (P2.10 hand-check aid).

Written separately from lib/wrapped/stats in Python with zoneinfo, so the
numbers it prints are a second derivation, not the module's output.
Usage: python3 evals/rewind/hand-tally.py evals/rewind/fixtures/<id>.json
"""
import json, sys
from datetime import datetime, timedelta, date
from zoneinfo import ZoneInfo
from collections import Counter, defaultdict

f = json.load(open(sys.argv[1]))
zone = ZoneInfo(f['member']['timezone'] or f['server']['zone'])
start = datetime(2026, 1, 1, tzinfo=zone).timestamp()
end = datetime(2026, 12, 1, tzinfo=zone).timestamp()

def local(ts): return datetime.fromtimestamp(ts, zone)
rows = [r for r in f['history'] if start <= r['started'] < end and r['media_type'] in ('movie', 'episode')]
rows.sort(key=lambda r: r['started'])
counted = lambda r: r['play_duration'] >= 120 or r['percent_complete'] >= 90
secs = sum(r['play_duration'] for r in rows)
ser = sum(r['play_duration'] for r in rows if r['media_type'] == 'episode')
print('total min', secs // 60, 'series', ser // 60, 'film', (secs - ser) // 60, 'hours', secs // 3600)
c = [r for r in rows if counted(r)]
eps = {r['rating_key'] for r in c if r['media_type'] == 'episode'}
print('episodes', len(eps), 'series', len({r['grandparent_rating_key'] for r in c if r['media_type'] == 'episode'}),
      'films', len({r['rating_key'] for r in c if r['media_type'] == 'movie'}),
      'seasons', len({(r['grandparent_rating_key'], r['parent_media_index']) for r in c if r['media_type'] == 'episode'}))
daymin = defaultdict(int); active = set()
for r in rows:
    d = local(r['started']).date(); daymin[d] += r['play_duration']
    if counted(r): active.add(d)
print('active', len(active))
big = max(sorted(daymin), key=lambda d: (daymin[d] // 60, -d.toordinal()))
print('biggest', big, daymin[big] // 60)
act = sorted(active); best = (0, None, None); run_start = act[0]
for i, d in enumerate(act):
    if i and (d - act[i - 1]).days != 1: run_start = d
    n = (d - run_start).days + 1
    if n > best[0]: best = (n, run_start, d)
print('streak', best)
gap = (0,)
for a, b in zip(act, act[1:]):
    g = (b - a).days - 1
    if g > gap[0]: gap = (g, a + timedelta(1), b - timedelta(1))
print('gap', gap)
hist = Counter(local(r['started']).hour for r in c)
print('hist', dict(sorted(hist.items())), 'n', len(c))
print('afterdark', sum(hist[h] for h in (22, 23, 0, 1, 2, 3)), 'golden', sum(hist[h] for h in (18, 19, 20, 21)),
      'weekend', sum(1 for r in c if local(r['started']).weekday() >= 5))
total = secs / 3600
rungs = [10, 25, 50, 100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000]
ladder = [h for h in rungs if h <= total][-4:]
cum = 0; out = []
for r in rows:
    cum += r['play_duration']
    while len(out) < len(ladder) and cum >= ladder[len(out)] * 3600:
        out.append((ladder[len(out)], str(local(r['started']).date())))
print('milestones', out)
life = [r for r in f['lifetimeBefore2026'] + f['history'] if r['media_type'] in ('movie', 'episode')]
print('since', min(local(r['started']).date() for r in life) if life else None,
      'lifetimeHours', sum(r['play_duration'] for r in life) // 3600)
s25, e25 = datetime(2025, 1, 1, tzinfo=zone).timestamp(), datetime(2025, 12, 1, tzinfo=zone).timestamp()
last = sum(r['play_duration'] for r in f['lifetimeBefore2026'] if s25 <= r['started'] < e25) // 60
print('2025 window minutes', last)
# night clock: minutes after 04:00
nm = lambda t: (t.hour * 60 + t.minute - 240) % 1440
starts = sorted((local(r['started']) for r in c), key=lambda t: (nm(t), t))
n = len(starts)
if n:
    lt = starts[-1]; print('latest', lt.strftime('%H:%M'), lt.date(), lt.strftime('%a'))
    mid = nm(starts[(n - 1) // 2]); med = (mid + nm(starts[n // 2])) // 2 if n % 2 == 0 else mid
    med = (med + 240) % 1440; print('median', f'{med // 60:02d}:{med % 60:02d}')
# binges: consecutive counted video plays, same series, gap < 30 min
runs = []; run = []
for r in c:
    if run and r['media_type'] == 'episode' and run[-1]['grandparent_rating_key'] == r['grandparent_rating_key'] and r['started'] - run[-1]['stopped'] < 1800:
        run.append(r); continue
    if run: runs.append(run)
    run = [r] if r['media_type'] == 'episode' else []
if run: runs.append(run)
b = [x for x in runs if len(x) >= 3]
if b:
    lo = max(b, key=lambda x: sum(r['play_duration'] for r in x)); de = max(b, key=len)
    for name, x in (('longest', lo), ('deepest', de)):
        print(name, x[0]['grandparent_title'], len(x), sum(r['play_duration'] for r in x) // 60, local(x[0]['started']).date(),
              'ties', sum(1 for y in b if (sum(r['play_duration'] for r in y) if name == 'longest' else len(y)) == (sum(r['play_duration'] for r in x) if name == 'longest' else len(x))))
epd = Counter(local(r['started']).date() for r in c if r['media_type'] == 'episode')
if epd: print('mostEpisodesDay', max(epd.values()), min(d for d in epd if epd[d] == max(epd.values())))
wk = defaultdict(int)
for r in rows:
    d = local(r['started']).date(); wk[d - timedelta(d.weekday())] += r['play_duration']
top = max(wk.values()); print('biggestWeek', min(d for d in wk if wk[d] == top), top // 60)

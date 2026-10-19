"""Independent derivation of a fixture's facts, archetype, pages and edition (P2.16).

The second half of the hand-check that `hand-tally.py` started: written in
Python from the definitions in design 4.3, 4.5, 7.6 and the plan's P2.8/P2.9
"as merged" notes, sharing no code with lib/wrapped. It prints the archetype
scores and pick, the omitted pages and edition, the P2.8 stats (taste,
people, devices, requests, left for later), and the en-US display string of
every fact the profiles check (U+00A0 printed as "~").
Usage: python3 evals/rewind/hand-facts.py evals/rewind/fixtures/<id>.json
"""
import hashlib, json, math, sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, date
from zoneinfo import ZoneInfo

f = json.load(open(sys.argv[1]))
zone_name = f['member']['timezone'] or f['server']['zone']
zone = ZoneInfo(zone_name)
start = datetime(2026, 1, 1, tzinfo=zone).timestamp()
end = datetime(2026, 12, 1, tzinfo=zone).timestamp()
ELAPSED = 334
hidden = set(f['member']['hiddenRatingKeys'])
meta = {m['ratingKey']: m for m in f['metadata']}

def local(ts): return datetime.fromtimestamp(ts, zone)
def key(r): return ('film:' + r['rating_key']) if r['media_type'] == 'movie' else ('series:' + str(r['grandparent_rating_key']))
def raw(r): return r['rating_key'] if r['media_type'] == 'movie' else str(r['grandparent_rating_key'])
def md(r): return meta.get(raw(r))
def counted(r): return r['play_duration'] >= 120 or r['percent_complete'] >= 90
def finished(r): return r['watched_status'] >= 1 or r['percent_complete'] >= 90
def listed(r): return raw(r) not in hidden
def jsround(x): return math.floor(x + 0.5)

rows = sorted((r for r in f['history'] if start <= r['started'] < end and r['media_type'] in ('movie', 'episode')), key=lambda r: r['started'])
c = [r for r in rows if counted(r)]
L = [r for r in rows if listed(r)]
secs = sum(r['play_duration'] for r in rows)
ser_s = sum(r['play_duration'] for r in rows if r['media_type'] == 'episode')
total = secs // 60
hours = total / 60
series_share = ser_s / secs if secs else 0
film_share = (secs - ser_s) / secs if secs else 0
films_n = len({r['rating_key'] for r in c if r['media_type'] == 'movie'})
plays = len(c)

# ---- per-title sums over listed plays (ranking: minutes, plays, latest, title)
titles = {}
for r in L:
    t = titles.setdefault(key(r), {'key': key(r), 'kind': 'film' if r['media_type'] == 'movie' else 'series', 'title': r['title'] if r['media_type'] == 'movie' else r['grandparent_title'], 'year': r['year'], 'secs': 0, 'plays': 0, 'last': 0})
    t['secs'] += r['play_duration']; t['plays'] += counted(r); t['last'] = max(t['last'], r['started'])
    t['year'] = min(t['year'], r['year'])
names = Counter(t['title'] for t in titles.values())
for t in titles.values():
    t['display'] = f"{t['title']} ({t['year']})" if names[t['title']] > 1 else t['title']
    t['min'] = t['secs'] // 60
ranked = sorted(titles.values(), key=lambda t: (-t['min'], -t['plays'], -t['last'], t['display']))
lists = [t for t in ranked if t['plays'] > 0]  # design 7.2: only counted plays make the "watched" lists
series = [t for t in lists if t['kind'] == 'series']
films = sorted([t for t in lists if t['kind'] == 'film'], key=lambda t: -t['plays'])  # stable: ties keep rank order

# ---- clock
hist = Counter(local(r['started']).hour for r in c)
peak = max(range(24), key=lambda h: (hist[h], -h)) if c else None
quiet = min(range(24), key=lambda h: (hist[h], h)) if c else None
after_dark = sum(hist[h] for h in (22, 23, 0, 1, 2, 3)) / plays if plays else 0
golden = sum(hist[h] for h in (18, 19, 20, 21)) / plays if plays else 0
weekend = sum(1 for r in c if local(r['started']).weekday() >= 5) / plays if plays else 0

# ---- binges: consecutive counted plays of one series, gap under 30 minutes
runs, run = [], []
for r in c:
    if run and r['media_type'] == 'episode' and run[-1]['grandparent_rating_key'] == r['grandparent_rating_key'] and r['started'] - run[-1]['stopped'] < 1800:
        run.append(r); continue
    if run: runs.append(run)
    run = [r] if r['media_type'] == 'episode' else []
if run: runs.append(run)
binges = [x for x in runs if len(x) >= 3 and listed(x[0])]
deepest = max((len(x) for x in binges), default=0)
longest = max(binges, key=lambda x: sum(r['play_duration'] for r in x)) if binges else None
epd = Counter(local(r['started']).date() for r in c if r['media_type'] == 'episode')

# ---- titles: completion, rewatching, breadth, loyalty, quiz
started = {r['rating_key'] for r in c}
done = {r['rating_key'] for r in c if finished(r)}
completion = len(done) / len(started) if len(started) >= 5 else None
fstarted = {r['rating_key'] for r in c if r['media_type'] == 'movie'}
fdone = {r['rating_key'] for r in c if r['media_type'] == 'movie' and finished(r)}
films_finished = len(fdone) / len(fstarted) if fstarted else None
per_key = Counter(r['rating_key'] for r in c)
rewatch_share = sum(1 for r in c if per_key[r['rating_key']] >= 3) / plays if plays else 0
distinct = len({key(r) for r in c})
per_ten = distinct / hours * 10 if hours else 0
top3 = sum(t['secs'] for t in series[:3]) / ser_s if ser_s else None
opts = series if len(series) >= 3 else lists
quiz = None
if len(opts) >= 3 and opts[0]['min'] - opts[1]['min'] > opts[0]['min'] * 0.02:
    quiz = opts[0]['min'] - opts[1]['min']

# ---- fresh share (every counted play, 0-14 days after release, by day in zone)
known = fresh = 0
for r in c:
    rel = r['originally_available_at'] or (md(r) or {}).get('originallyAvailableAt')
    if not rel: continue
    known += 1
    d = (local(r['started']).date() - date.fromisoformat(rel[:10])).days
    fresh += 0 <= d <= 14
fresh_share = fresh / known if known else None

# ---- archetype scores (scorer table, design 7.6 / P2.9) and pick
clamp = lambda x: max(0, min(100, jsround(x)))
peak_share = hist[peak] / plays if plays and peak is not None else 0
S = {
    'midnight-marathoner': clamp(after_dark * 250),
    'credits-roller': clamp((completion - 0.5) * 160) if completion is not None else 0,
    'comfort-rewatcher': clamp(rewatch_share * 200),
    'premiere-chaser': clamp(fresh_share * 200) if fresh_share is not None else 0,
    'series-devourer': clamp(series_share * 60 + min(deepest, 10) * 4),
    'weekend-double-feature': clamp((weekend * 100 - 28) * 4),
    'curator': clamp(70 - per_ten * 4) if 0 < hours < 120 else 0,
    'explorer': clamp((per_ten - 3) * 12),
    'loyalist': clamp(top3 * series_share * 130 - 30) if series_share > 0.4 and top3 is not None else 0,
    'golden-hour-viewer': clamp(peak_share * 400) if peak is not None and 18 <= peak <= 21 else 0,
    'festival-juror': clamp(film_share * 80 + min(films_n, 40)),
    'casual-critic': clamp(90 - hours) if hours < 60 else 0,
}
ORDER = ['premiere-chaser', 'credits-roller', 'comfort-rewatcher', 'midnight-marathoner', 'loyalist', 'series-devourer',
         'weekend-double-feature', 'explorer', 'festival-juror', 'golden-hour-viewer', 'curator', 'casual-critic']
postcard = total < 30 or plays == 0
pick = None
if not postcard:
    low = total < 300 or plays < 10
    elig = [a for a in (['casual-critic', 'curator', 'explorer', 'comfort-rewatcher'] if low else ORDER) if a != 'casual-critic' or total >= 60]
    rank = sorted(elig, key=lambda a: (-S[a], ORDER.index(a)))
    if S[rank[0]] == 0:
        h = int(hashlib.sha256(f"{f['id']}:2026".encode()).hexdigest()[:8], 16)
        rank.insert(0, rank.pop(h % len(rank)))
    pick = rank[0]
print('scores', sorted(S.items(), key=lambda kv: (-kv[1], ORDER.index(kv[0]))))
print('archetype', pick, 'runner-up', rank[1] if pick else None, 'shortlist', [(a, S[a]) for a in rank[:3]] if pick else None,
      'inputs', dict(plays=plays, hours=round(hours, 2), afterDark=round(after_dark, 4), completion=completion, rewatch=round(rewatch_share, 4),
                     fresh=fresh_share, seriesShare=round(series_share, 4), deepest=deepest, weekend=round(weekend, 4), perTen=round(per_ten, 3),
                     top3=top3, peak=peak, peakShare=round(peak_share, 4), filmShare=round(film_share, 4), films=films_n))

# ---- P2.8: taste (listed plays; minutes split evenly across genres)
gen = defaultdict(float); gsec = 0
for r in L:
    g = list(dict.fromkeys((md(r) or {}).get('genres', [])))
    for n in g: gen[n] += r['play_duration'] / len(g)
    if g: gsec += r['play_duration']
cov = gsec / sum(r['play_duration'] for r in L) if L else 0
genres = sorted(gen.items(), key=lambda kv: (-kv[1], kv[0]))[:5]
years = {}
for r in L:
    if counted(r):
        y = (md(r) or {}).get('year') or r['year']
        years[key(r)] = min(y, years.get(key(r), y))
ys = sorted(years.values())
median_year = ys[(len(ys) - 1) // 2] if ys else None
oldest = None
for t in ranked:
    if t['key'] in years and (oldest is None or years[t['key']] < years[oldest['key']]): oldest = t
print('taste', 'coverage', cov, 'genres', [(n, int(s // 60), s / gsec) for n, s in genres], 'medianYear', median_year,
      'oldest', oldest and (oldest['key'], oldest['display'], years[oldest['key']]), 'freshShare', fresh_share)

# ---- P2.8: people (every actor earns the title's minutes; directors films only)
act = defaultdict(int); dirs = defaultdict(int)
for r in L:
    m = md(r) or {}
    for n in dict.fromkeys(m.get('actors', [])): act[n] += r['play_duration']
    if r['media_type'] == 'movie':
        for n in dict.fromkeys(m.get('directors', [])): dirs[n] += r['play_duration']
top = lambda d, k: [(n, s // 60) for n, s in sorted(d.items(), key=lambda kv: (-kv[1], kv[0]))[:k]]
pcov_s = sum(r['play_duration'] for r in L if (md(r) or {}).get('actors') or (r['media_type'] == 'movie' and (md(r) or {}).get('directors')))
pcov = pcov_s / sum(r['play_duration'] for r in L) if L else 0
print('people', 'coverage', pcov, 'actors', top(act, 5), 'directors', top(dirs, 3))

# ---- P2.8: devices (all video plays; 20 needed)
if len(rows) >= 20:
    def topof(field):
        t = defaultdict(lambda: [0, 0])
        for r in rows:
            if r[field]: t[r[field]][0] += 1; t[r[field]][1] += r['play_duration']
        return min(t, key=lambda n: (-t[n][0], -t[n][1], n))
    res = [(meta.get(raw(r)) or {}).get('videoResolution') for r in rows]
    print('devices', 'directPlay', sum(r['transcode_decision'] == 'direct play' for r in rows), '/', len(rows),
          'home', sum(r['location'] == 'lan' for r in rows), 'platform', topof('platform'), 'product', topof('product'),
          'fourK', sum((x or '').lower() == '4k' for x in res), '/', sum(x is not None for x in res))
else:
    print('devices ineligible', len(rows))

# ---- P2.8: requests (created in the window; watched through cache guids)
reqs = None
if f['requests'] is not None:
    reqs = [q for q in f['requests']['rows'] if start <= datetime.fromisoformat(q['createdAt'].replace('Z', '+00:00')).timestamp() < end]
    fg, sg = set(), set()
    for r in c:
        for g in (md(r) or {}).get('guids', []):
            (fg if r['media_type'] == 'movie' else sg).add(g)
    def watched(q):
        tm = q['media'].get('tmdbId'); tv = q['media'].get('tvdbId')
        if q['type'] == 'movie': return f'tmdb://{tm}' in fg
        return f'tvdb://{tv}' in sg or f'tmdb://{tm}' in sg
    appr = [q for q in reqs if q['status'] in (2, 5)]
    avail = [q for q in appr if q['media']['status'] == 5 or (q['type'] == 'tv' and q['media']['status'] == 4)]
    print('requests', 'made', len(reqs), 'approved', len(appr), 'available', len(avail), 'pending', sum(q['status'] == 1 for q in reqs),
          'declined', sum(q['status'] == 3 for q in reqs), 'watched', sum(map(watched, reqs)))

# ---- P2.8: left for later (listed series, last play in the last 120 days and 30+ days before the end, short of the final episode)
left = []
for t in (t for t in ranked if t['kind'] == 'series'):
    if not (end - 120 * 86400 <= t['last'] <= end - 30 * 86400): continue
    m = meta.get(t['key'].split(':')[1]) or {}
    counts = {int(k): v for k, v in (m.get('seasonEpisodeCounts') or {}).items() if v > 0}
    if not counts: continue
    fin = max(counts)
    eps = [(r['parent_media_index'], r['media_index']) for r in L if key(r) == t['key'] and r['parent_media_index'] not in ('', 0)]
    s_, e_ = max(eps, default=(0, 0))
    if s_ == 0 or s_ > fin or (s_ == fin and e_ >= counts[fin]): continue
    left.append((t['key'], t['display'], s_, e_, str(local(t['last']).date())))
print('leftForLater', left[:3])

# ---- P2.8: picks (unwatched library titles with the top genre; one point per top person or other top genre)
picks = []
if f.get('library') and genres:
    g1, others = genres[0][0], [g for g, _ in genres[1:]]
    people_names = [a for a, _ in top(act, 5)] + [d for d, _ in top(dirs, 3)]
    played = {raw(r) for r in rows}
    cand = []
    for t in f['library']:
        if g1 not in t['genres'] or t['ratingKey'] in played or t['ratingKey'] in hidden: continue
        credited = [p for p in people_names if p in t['actors'] or p in t['directors']]
        cand.append((-(len(credited) + sum(g in t['genres'] for g in others)), -datetime.fromisoformat(t['addedAt'].replace('Z', '+00:00')).timestamp(), t['title'], t['ratingKey'], credited[:1]))
    picks = [(c_[2], c_[4]) for c_ in sorted(cand)[:3]]
print('picks', picks)

# ---- pages (design 4.3 rules as P2.10's README states them) and edition (4.5)
first, last = (c[0], c[-1]) if c else (None, None)
same = bool(c) and key(first) == key(last) and local(first['started']).date() == local(last['started']).date()
big = [t for t in series if t['min'] >= 60]
race_ok = len(big) >= 3 and len({local(r['started']).month for r in L if r['media_type'] == 'episode'}) >= 3
mostpaused = any(r['paused_counter'] > 0 for r in L)
cells = sum([bool(binges), bool(epd) and max(epd.values()) >= 3, completion is not None, mostpaused])
members = f['server']['peers']['members']
rule = {
    3: not same, 4: quiz is not None, 5: bool(series), 6: bool(films), 7: cov >= 0.6, 8: pcov >= 0.7, 9: plays > 10, 11: race_ok, 12: cells >= 2,
    13: len(rows) >= 20, 14: bool(reqs), 15: members >= 5, 17: bool(left) or bool(picks),
}
omitted = [p for p, ok in sorted(rule.items()) if not ok]
edition = 'postcard' if postcard else 'pocket' if total < 300 or plays < 10 or 18 - len(omitted) < 10 else 'full'
print('omittedPages', omitted, 'edition', edition, 'records cells', cells)

# ---- display strings, en-US ("~" is U+00A0)
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
def n(x): return f'{x:,}'
def dur(m): return f'{m}~minute' + ('' if m == 1 else 's') if m < 60 else ' '.join(p for p in (f'{m // 60:,}~h', f'{m % 60}~m' if m % 60 else '') if p)
def share(x): return 'under 1%' if 0 < x < 0.01 else f'{jsround(x * 100)}%'
def hour(h): return f'{(h % 12) or 12}~{"AM" if h < 12 else "PM"}'
def day(k): d = date.fromisoformat(str(k)); return f'{MONTHS[d.month - 1]}~{d.day}'
def days(x): return f'{x}~day' + ('' if x == 1 else 's')
peers = sorted([h * 60 for h in f['server']['peers']['hours']] + [total], reverse=True)
out = {
    'time.totalMinutes': dur(total), 'time.totalHours': n(total // 60), 'time.perDay': dur(total // ELAPSED),
    'time.daysHours': f'{days(total // 1440)}' + (f', {(total % 1440) // 60}~hours' if (total % 1440) // 60 else ''),
    'time.seriesShare': share(series_share), 'time.filmsShare': share(film_share),
    'counts.episodes': n(len({r['rating_key'] for r in c if r['media_type'] == 'episode'})),
    'counts.series': n(len({r['grandparent_rating_key'] for r in c if r['media_type'] == 'episode'})), 'counts.films': n(films_n),
    'counts.titles': n(distinct), 'counts.titlesPer10Hours': f'{jsround(per_ten * 10) / 10:g}',
    'hours.peak': hour(peak) if c else None, 'hours.quietest': hour(quiet) if c else None,
    'hours.afterDarkShare': share(after_dark), 'hours.goldenShare': share(golden), 'days.weekendShare': share(weekend),
    'records.completionShare': completion is not None and share(completion), 'films.finishedShare': films_finished is not None and share(films_finished),
    'records.rewatchShare': share(rewatch_share), 'records.deepestBinge.episodes': deepest and n(deepest),
    'records.longestBinge.title': longest and longest[0]['grandparent_title'], 'records.longestBinge.episodes': longest and n(len(longest)),
    'records.mostEpisodesDay': epd and n(max(epd.values())), 'taste.freshShare': fresh_share is not None and share(fresh_share),
    'quiz.gapMinutes': quiz is not None and dur(quiz), 'series.top3Share': top3 is not None and share(top3),
    'taste.genre[1].name': genres and genres[0][0], 'taste.genre[1].share': genres and share(genres[0][1] / gsec), 'taste.medianYear': str(median_year),
    'next.leftForLater[1].title': left and left[0][1], 'next.picks[1].title': picks and picks[0][0],
    'people.actor[1].name': top(act, 1)[0][0] if act else None, 'people.director[1].name': top(dirs, 1)[0][0] if dirs else None,
    'standing.members': n(len(peers)) if members >= 5 else None,
    'standing.percentile': f'Top {math.ceil((1 + sum(m > total for m in peers)) / len(peers) * 100)}%' if members >= 5 else None,
    'tz.label': zone_name,
}
TIMES = {2: 'twice', 3: 'three times', 4: 'four times', 5: 'five times'}
for i, t in enumerate(series[:5], 1):
    own = [r for r in c if listed(r) and key(r) == t['key']]
    eps = len({r['rating_key'] for r in own})
    out.update({f'series[{i}].title': t['display'], f'series[{i}].minutes': dur(t['min']), f'series[{i}].episodes': n(eps)})
    if eps and len(own) // eps >= 2: out[f'series[{i}].rewatched'] = 'watched ' + TIMES[len(own) // eps]
if len(rows) >= 20: out['setup.directPlayShare'] = share(sum(r['transcode_decision'] == 'direct play' for r in rows) / len(rows))
if reqs: out.update({'requests.made': n(len(reqs)), 'requests.watched': n(sum(map(watched, reqs)))})
for i, t in enumerate(films[:5], 1): out.update({f'films[{i}].title': t['display'], f'films[{i}].plays': n(t['plays']), f'films[{i}].minutes': dur(t['min'])})
for k, v in out.items():
    if v not in (None, False, 0, ''): print(f'  {k}: {str(v)}')

# ---- with --json: the same values as one object, shares as [part, whole], for typing into a profile
if '--json' in sys.argv:
    def rat(a, b): return [a, b]
    sections = {
        'taste': {'genres': [{'name': n, 'minutes': int(s // 60), 'share': rat(s, gsec)} for n, s in genres], 'medianYear': median_year,
                  'oldest': oldest and {'key': oldest['key'], 'title': oldest['display'], 'year': years[oldest['key']]},
                  'freshShare': fresh_share is not None and rat(fresh, known)} if cov >= 0.6 else {'eligible': False},
        'people': {'actors': [{'name': a, 'minutes': m} for a, m in top(act, 5)], 'directors': [{'name': a, 'minutes': m} for a, m in top(dirs, 3)]}
                  if pcov >= 0.7 else {'eligible': False},
        'nextYear': {'leftForLater': [{'key': k, 'title': t, 'season': s_, 'episode': e_, 'lastWatched': d} for k, t, s_, e_, d in left[:3]],
                     'picks': [p[0] for p in picks]},
    }
    if len(rows) >= 20:
        res = [(meta.get(raw(r)) or {}).get('videoResolution') for r in rows]
        sections['devices'] = {'directPlayShare': rat(sum(r['transcode_decision'] == 'direct play' for r in rows), len(rows)),
                               'homeShare': rat(sum(r['location'] == 'lan' for r in rows), len(rows)), 'topPlatform': topof('platform'),
                               'topProduct': topof('product'), 'fourKShare': rat(sum((x or '').lower() == '4k' for x in res), sum(x is not None for x in res))}
    else:
        sections['devices'] = {'eligible': False}
    if reqs:
        sections['requests'] = {'made': len(reqs), 'approved': len(appr), 'available': len(avail), 'pending': sum(q['status'] == 1 for q in reqs),
                                'declined': sum(q['status'] == 3 for q in reqs), 'watched': sum(map(watched, reqs)), 'genres': []}
    else:
        sections['requests'] = {'eligible': False}
    facts = {k: str(v).replace('~', ' ') for k, v in out.items() if v not in (None, False, 0, '')}
    print('JSON', json.dumps({'archetype': pick, 'runnerUp': rank[1] if pick else None, 'omittedPages': omitted, 'edition': edition,
                              'sections': sections, 'facts': facts}, ensure_ascii=False))

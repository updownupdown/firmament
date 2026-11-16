#!/usr/bin/env python3
"""Generate Firmament's data assets in public/data from third-party catalogs.

Sources are expected as shallow git clones in ../vendor (next to the repo):

  git clone --depth 1 https://github.com/astronexus/HYG-Database        ../vendor/hyg
  git clone --depth 1 https://github.com/ofrohn/d3-celestial             ../vendor/d3-celestial
  git clone --depth 1 https://github.com/Stellarium/stellarium-skycultures ../vendor/skycultures
  git clone --depth 1 https://github.com/commenthol/astronomia           ../vendor/astronomia

Nothing from the sources is executed; JavaScript data files are parsed as text.
Outputs are committed, so the site builds without the sources.
"""
import csv
import json
import math
import os
import re
import struct
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR = os.environ.get('FIRMAMENT_VENDOR', os.path.join(os.path.dirname(ROOT), 'vendor'))
OUT = os.path.join(ROOT, 'public', 'data')

BRIGHT_LIMIT = 6.5      # stars-bright.bin holds everything at or brighter than this
FAINT_LIMIT = 10.0      # stars-faint.bin goes down to this
NEAR_PC = 25.0          # ...plus every star within this distance, however faint

# Only sky cultures whose text and lines are CC BY-SA (compatible with HYG).
CULTURES = [
    'western', 'chinese', 'hawaiian_starlines', 'norse', 'maori', 'boorong',
    'tongan', 'blackfoot', 'sami', 'indian', 'anutan', 'mongolian',
    'japanese_moon_stations', 'tukano', 'belarusian', 'romanian',
]

GREEK = {
    'Alp': 'α', 'Bet': 'β', 'Gam': 'γ', 'Del': 'δ', 'Eps': 'ε', 'Zet': 'ζ', 'Eta': 'η',
    'The': 'θ', 'Iot': 'ι', 'Kap': 'κ', 'Lam': 'λ', 'Mu': 'μ', 'Nu': 'ν', 'Xi': 'ξ',
    'Omi': 'ο', 'Pi': 'π', 'Rho': 'ρ', 'Sig': 'σ', 'Tau': 'τ', 'Ups': 'υ', 'Phi': 'φ',
    'Chi': 'χ', 'Psi': 'ψ', 'Ome': 'ω',
}


def src(*parts):
    p = os.path.join(VENDOR, *parts)
    if not os.path.exists(p):
        sys.exit(f'missing source: {p} (see the docstring for clone commands)')
    return p


def write_json(name, obj):
    path = os.path.join(OUT, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    print(f'  {name}: {os.path.getsize(path) / 1024:.0f} KB')


def load_js_object(path):
    """Parse a JS module of the form `const m = {...}; export default m` as JSON."""
    s = open(path, encoding='utf-8').read()
    s = s[s.index('{'):s.rindex('}') + 1]
    s = re.sub(r'(?m)^(\s*)([A-Za-z_][A-Za-z0-9_]*):', r'\1"\2":', s)
    s = re.sub(r',(\s*[\]}])', r'\1', s)
    return json.loads(s)


def rnd(x, n):
    return float(f'{x:.{n}g}')


# --------------------------------------------------------------------------- stars

def culture_hips():
    hips = set()
    for c in CULTURES:
        d = json.load(open(src('skycultures', c, 'index.json'), encoding='utf-8'))
        for con in d.get('constellations', []) + d.get('asterisms', []):
            for line in con.get('lines', []):
                for h in line:
                    if isinstance(h, int):
                        hips.add(h)
    return hips


def build_stars():
    needed = culture_hips()
    rows = []
    with open(src('hyg', 'hyg', 'CURRENT', 'hygdata_v41.csv'), encoding='utf-8') as f:
        for r in csv.DictReader(f):
            if r['id'] == '0':
                continue  # the Sun
            mag = float(r['mag'])
            dist = float(r['dist'])
            hip = int(r['hip']) if r['hip'] else 0
            known = dist < 100000
            if mag > FAINT_LIMIT and not (known and dist <= NEAR_PC) and hip not in needed:
                continue
            rows.append(r)
    for r in rows:
        # HYG caps proper motions at 9999.99 mas/yr; Barnard's Star is the one
        # star affected. Restore its Hipparcos value.
        if r['proper'] == "Barnard's Star":
            r['pmdec'] = '10362.39'
    rows.sort(key=lambda r: float(r['mag']))

    def clamp16(v):
        return max(-32767, min(32767, int(round(v))))

    records = []
    meta = []
    hip_index = {}
    for i, r in enumerate(rows):
        dist = float(r['dist'])
        dist = dist if dist < 100000 else 0.0
        ci = r['ci']
        bv = clamp16(float(ci) * 1000) if ci else 32767
        rv = float(r['rv']) if r['rv'] else 0.0
        hip = int(r['hip']) if r['hip'] else 0
        if hip:
            hip_index[hip] = i
        records.append(struct.pack(
            '<fffhhhhhhi',
            float(r['rarad']), float(r['decrad']), dist,
            clamp16(float(r['mag']) * 100), bv,
            clamp16(float(r['pmra'])), clamp16(float(r['pmdec'])), clamp16(rv * 10), 0,
            hip,
        ))
        mag = float(r['mag'])
        if mag <= BRIGHT_LIMIT or r['proper'] or (dist and dist <= NEAR_PC):
            m = {'i': i}
            if r['proper']:
                m['n'] = r['proper']
            if r['bayer']:
                b = r['bayer']
                base = re.match(r'[A-Za-z]+', b).group(0)
                suffix = b[len(base):].replace('-', '')
                m['b'] = GREEK.get(base, base) + (suffix if suffix else '')
            if r['flam']:
                m['f'] = int(r['flam'])
            if r['con']:
                m['c'] = r['con']
            if r['spect']:
                m['s'] = r['spect']
            if r['hd']:
                m['hd'] = int(r['hd'])
            if r['gl']:
                m['gl'] = r['gl']
            if r['var']:
                m['v'] = r['var']
            meta.append(m)

    n_bright = sum(1 for r in rows if float(r['mag']) <= BRIGHT_LIMIT)
    for name, part, first in (('stars-bright.bin', records[:n_bright], 0),
                              ('stars-faint.bin', records[n_bright:], n_bright)):
        path = os.path.join(OUT, name)
        with open(path, 'wb') as f:
            f.write(b'FST1')
            f.write(struct.pack('<III', len(part), first, 28))
            f.write(b''.join(part))
        print(f'  {name}: {len(part)} stars, {os.path.getsize(path) / 1024:.0f} KB')
    write_json('stars-meta.json', meta)
    return hip_index


# ------------------------------------------------------------------- sky cultures

def section(md, title):
    m = re.search(r'(?ms)^##\s+' + re.escape(title) + r'\s*\n(.*?)(?=^##\s|\Z)', md)
    return m.group(1).strip() if m else ''


def plain(md):
    md = re.sub(r'\[#\d+\]', '', md)
    md = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', md)
    md = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', md)
    md = re.sub(r'[*_`]', '', md)
    return re.sub(r'\s+', ' ', md).strip()


def build_cultures(hip_index):
    listing = []
    for c in CULTURES:
        d = json.load(open(src('skycultures', c, 'index.json'), encoding='utf-8'))
        md = open(src('skycultures', c, 'description.md'), encoding='utf-8').read()
        title = re.search(r'(?m)^#\s+(.+)$', md).group(1).strip()
        intro_md = section(md, 'Introduction') or section(md, 'Description')
        paras = [plain(p) for p in re.split(r'\n\s*\n', intro_md) if p.strip() and not p.strip().startswith('|')]
        intro = ' '.join(paras[:2])
        if len(intro) > 900:
            intro = intro[:900].rsplit(' ', 1)[0] + '…'
        license_text = plain(section(md, 'License'))
        authors = plain(section(md, 'Authors'))[:400]

        def convert(items, kind):
            out = []
            for con in items:
                if con.get('is_ray_helper'):
                    continue
                lines = []
                for line in con.get('lines', []):
                    idx = [hip_index.get(h) for h in line if isinstance(h, int)]
                    # Split the polyline where a star is missing from the catalog.
                    run = []
                    for v in idx:
                        if v is None:
                            if len(run) > 1:
                                lines.append(run)
                            run = []
                        else:
                            run.append(v)
                    if len(run) > 1:
                        lines.append(run)
                if not lines:
                    continue
                cn = con.get('common_name', {})
                entry = {
                    'id': con['id'].split()[-1],
                    'name': cn.get('english') or cn.get('native') or con['id'].split()[-1],
                    'lines': lines,
                }
                if cn.get('native') and cn.get('native') != entry['name']:
                    entry['native'] = cn['native']
                if cn.get('pronounce'):
                    entry['pronounce'] = cn['pronounce']
                if con.get('iau'):
                    entry['iau'] = con['iau']
                if kind == 'asterism':
                    entry['asterism'] = True
                out.append(entry)
            return out

        cons = convert(d.get('constellations', []), 'con') + convert(d.get('asterisms', []), 'asterism')
        write_json(f'cultures/{c}.json', {
            'id': c, 'name': title, 'region': d.get('region', ''), 'intro': intro,
            'license': license_text, 'authors': authors,
            'source': f'https://github.com/Stellarium/stellarium-skycultures/tree/master/{c}',
            'constellations': cons,
        })
        listing.append({'id': c, 'name': title, 'region': d.get('region', ''), 'count': len(cons)})
    write_json('cultures/index.json', listing)


# --------------------------------------------------------- d3-celestial datasets

def build_boundaries():
    d = json.load(open(src('d3-celestial', 'data', 'constellations.borders.json'), encoding='utf-8'))
    lines = []
    for feat in d['features']:
        g = feat['geometry']
        coords = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]
        for line in coords:
            flat = []
            for lon, lat in line:
                flat += [round(lon % 360, 3), round(lat, 3)]
            lines.append(flat)
    write_json('boundaries.json', lines)


def build_dsos():
    out = {}
    names = json.load(open(src('d3-celestial', 'data', 'dsonames.json'), encoding='utf-8'))

    def add(feat, messier=None):
        p = feat['properties']
        lon, lat = feat['geometry']['coordinates']
        desig = p.get('desig') or feat['id']
        key = desig.replace(' ', '')
        e = out.get(key, {})
        e.update({'d': desig, 't': p.get('type', ''), 'ra': round(lon % 360, 4), 'de': round(lat, 4)})
        try:
            e['m'] = float(p['mag'])
        except (TypeError, ValueError, KeyError):
            pass
        if p.get('dim'):
            e['z'] = p['dim']
        if messier:
            e['mes'] = messier
        nm = p.get('alt') or (names.get(feat['id'], {}) or {}).get('name') or (names.get(desig, {}) or {}).get('name')
        if nm:
            e['n'] = nm
        out[key] = e

    for feat in json.load(open(src('d3-celestial', 'data', 'dsos.bright.json'), encoding='utf-8'))['features']:
        if not (feat['properties'].get('desig') or '').startswith('M '):
            add(feat)
    for feat in json.load(open(src('d3-celestial', 'data', 'messier.json'), encoding='utf-8'))['features']:
        add(feat, feat['id'])
    items = sorted(out.values(), key=lambda e: (0 if 'mes' in e else 1, int(e['mes'][1:]) if 'mes' in e else 0, e.get('m', 99)))
    write_json('dsos.json', items)


EQ_TO_GAL = [
    [-0.0548755604, -0.8734370902, -0.4838350155],
    [+0.4941094279, -0.4448296300, +0.7469822445],
    [-0.8676661490, -0.1980763734, +0.4559837762],
]


def build_milkyway():
    """Rasterise the Milky Way brightness contours into an equirectangular (RA/Dec) texture.

    The contours are bands that wrap all the way around the sky, so they can't be
    filled in RA/Dec directly. They are filled in an azimuthal projection centred on
    the north galactic pole (where the band is an annulus), with even-odd rings,
    then resampled.
    """
    import numpy as np
    from PIL import Image, ImageChops, ImageDraw, ImageFilter
    M = np.array(EQ_TO_GAL)
    S = 4096  # projection canvas; radius S/2 covers 180 degrees from the pole

    def to_proj(lon, lat):
        ra, de = math.radians(lon), math.radians(lat)
        v = M @ np.array([math.cos(de) * math.cos(ra), math.cos(de) * math.sin(ra), math.sin(de)])
        b = math.asin(max(-1.0, min(1.0, v[2])))
        l = math.atan2(v[1], v[0])
        r = (math.pi / 2 - b) / math.pi * (S / 2)
        return (S / 2 + r * math.cos(l), S / 2 + r * math.sin(l))

    d = json.load(open(src('d3-celestial', 'data', 'mw.json'), encoding='utf-8'))
    proj = np.zeros((S, S), dtype=np.float32)
    for feat in d['features']:
        mask = Image.new('1', (S, S), 0)
        g = feat['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        for poly in polys:
            for ring in poly:
                ring_img = Image.new('1', (S, S), 0)
                ImageDraw.Draw(ring_img).polygon([to_proj(lon, lat) for lon, lat in ring], fill=1)
                mask = ImageChops.logical_xor(mask, ring_img)
        proj += np.asarray(mask, dtype=np.float32) * 0.2

    W, H = 2048, 1024
    ra = (np.arange(W) + 0.5) / W * 2 * math.pi
    de = math.pi / 2 - (np.arange(H) + 0.5) / H * math.pi
    RA, DE = np.meshgrid(ra, de)
    v = np.stack([np.cos(DE) * np.cos(RA), np.cos(DE) * np.sin(RA), np.sin(DE)], axis=-1) @ M.T
    b = np.arcsin(np.clip(v[..., 2], -1, 1))
    l = np.arctan2(v[..., 1], v[..., 0])
    r = (math.pi / 2 - b) / math.pi * (S / 2)
    px = np.clip((S / 2 + r * np.cos(l)).astype(int), 0, S - 1)
    py = np.clip((S / 2 + r * np.sin(l)).astype(int), 0, S - 1)
    eq = proj[py, px]
    img = Image.fromarray(np.clip(eq * 255, 0, 255).astype('uint8'), 'L')
    img = img.filter(ImageFilter.GaussianBlur(2.5))
    a = np.asarray(img, dtype=np.float32) / 255.0
    a = np.power(a, 0.85)
    img = Image.fromarray(np.clip(a * 255, 0, 255).astype('uint8'), 'L')
    path = os.path.join(OUT, 'milkyway.png')
    img.save(path, optimize=True)
    print(f'  milkyway.png: {os.path.getsize(path) / 1024:.0f} KB')


# ------------------------------------------------------------------ ephemerides

PLANETS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']


def build_vsop():
    """Truncate VSOP87B so the dropped terms total roughly 0.5 arcsec over ±2 millennia."""
    out = {}
    total = 0
    for p in PLANETS:
        d = load_js_object(src('astronomia', 'data', f'vsop87B{p}.js'))
        r0 = d['R']['0'][0][0]  # mean distance in AU, used to scale the R threshold
        series = {}
        for coord in ('L', 'B', 'R'):
            eps = 2e-8 if coord != 'R' else 2e-8 * r0
            powers = []
            for alpha in sorted(d[coord], key=int):
                terms = [t for t in d[coord][alpha] if t[0] * (2.0 ** int(alpha)) >= eps]
                powers.append([[rnd(t[0], 10), rnd(t[1], 11), rnd(t[2], 14)] for t in terms])
                total += len(terms)
            series[coord] = powers
        out[p] = series
    write_json('vsop87b.json', out)
    print(f'    {total} VSOP87 terms kept')


def build_elp():
    d = load_js_object(src('astronomia', 'data', 'elpMppDe.js'))
    out = {'W1': d['W1']}
    total = 0
    for coord, eps in (('L', 0.002), ('B', 0.002), ('R', 0.003)):
        powers = []
        for alpha in sorted(d[coord], key=int):
            terms = [t for t in d[coord][alpha] if abs(t[0]) * (3.0 ** int(alpha)) >= eps]
            powers.append([[rnd(x, 12) for x in t] for t in terms])
            total += len(terms)
        out[coord] = powers
    write_json('elp-mpp02.json', out)
    print(f'    {total} ELP terms kept')


def build_deltat():
    d = load_js_object(src('astronomia', 'data', 'deltat.js'))
    h, rec, pred = d['historic'], d['data'], d['prediction']
    # Half-year samples: the historic table until the monthly series starts, then
    # monthly values averaged per half year, then the IERS prediction.
    samples = []
    step = (h['last'] - h['first']) / (len(h['table']) - 1)
    for i, v in enumerate(h['table']):
        y = h['first'] + i * step
        if y < 1973.0:
            samples.append((y, v))
    mstep = (rec['last'] - rec['first']) / (len(rec['table']) - 1)
    buckets = {}
    for i, v in enumerate(rec['table']):
        y = rec['first'] + i * mstep
        buckets.setdefault(math.floor(y * 2) / 2, []).append(v)
    for y in sorted(buckets):
        if len(buckets[y]) >= 3:
            samples.append((y + 0.25, sum(buckets[y]) / len(buckets[y])))
    pstep = (pred['last'] - pred['first']) / (len(pred['table']) - 1)
    last = samples[-1][0]
    for i, v in enumerate(pred['table']):
        y = pred['first'] + i * pstep
        if y > last + 0.4:
            samples.append((y, v))
    write_json('deltat.json', {'years': [round(y, 3) for y, _ in samples], 'seconds': [round(v, 3) for _, v in samples]})


def main():
    os.makedirs(OUT, exist_ok=True)
    only = sys.argv[1:]
    if only:
        for name in only:
            globals()['build_' + name]()
        return
    print('stars'); hip_index = build_stars()
    print('cultures'); build_cultures(hip_index)
    print('boundaries'); build_boundaries()
    print('deep sky'); build_dsos()
    print('milky way'); build_milkyway()
    print('vsop87'); build_vsop()
    print('elp'); build_elp()
    print('delta t'); build_deltat()


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Generate Firmament's data assets in public/data from third-party catalogs.

Sources are expected as shallow git clones in ../vendor (next to the repo):

  git clone --depth 1 https://github.com/astronexus/HYG-Database        ../vendor/hyg
  git clone --depth 1 https://github.com/ofrohn/d3-celestial             ../vendor/d3-celestial
  git clone --depth 1 https://github.com/Stellarium/stellarium-skycultures ../vendor/skycultures
  git clone --depth 1 https://github.com/commenthol/astronomia           ../vendor/astronomia
  git clone --depth 1 https://github.com/lkangas/python-tycho2           ../vendor/python-tycho2

Planet surface maps are Solar System Scope's 2k textures
(https://www.solarsystemscope.com/textures/, CC BY 4.0), downloaded into
../vendor/planet-textures under their original names (2k_mars.jpg, ...).

The last is the Tycho-2 catalogue (Høg et al. 2000) as NumPy arrays of
right ascension, declination (radians, J2000) and VT magnitude.

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


# --------------------------------------------------------------------- Tycho-2

TYCHO_LIMIT = 12.0      # faintest Tycho-2 star kept
TYCHO_BAND = 4.0        # declination band per file, degrees
TYCHO_MATCH = 10.0      # arcseconds: a Tycho-2 star this close to a HYG star is the same star


def read_fst(path):
    """Right ascension, declination (radians) and magnitude from a stars-*.bin file."""
    with open(path, 'rb') as f:
        buf = f.read()
    n, _, size = struct.unpack_from('<III', buf, 4)
    out = []
    for k in range(n):
        ra, dec, _, mag = struct.unpack_from('<fffh', buf, 16 + k * size)
        out.append((ra, dec, mag / 100))
    return out


def build_tycho():
    """Tycho-2 stars missing from HYG, in declination bands loaded only when zoomed in.

    File tycho/NN.bin (band NN from the south pole): 'TYC1', count u32, then
    count × ra u24 (fraction of 360°), then count × dec u16 (fraction of the
    band), then count × mag u8 ((mag − 6) × 40), each array little-endian and
    padded to 4 bytes.
    """
    import numpy as np
    cat = np.vstack([np.load(src('python-tycho2', 'tyc2.npy')), np.load(src('python-tycho2', 'tyc2sup.npy'))]).astype(np.float64)
    cat[:, :2] = np.degrees(cat[:, :2])   # the arrays hold radians
    cat = cat[(cat[:, 2] <= TYCHO_LIMIT) & np.isfinite(cat[:, 2])]
    # Drop the stars HYG already has: hash HYG positions into cells, with each cell's neighbours.
    cell = TYCHO_MATCH / 3600
    hyg = np.array(read_fst(os.path.join(OUT, 'stars-bright.bin')) + read_fst(os.path.join(OUT, 'stars-faint.bin')))
    def keys(ra_deg, dec_deg, dx=0, dy=0):
        y = np.floor(dec_deg / cell).astype(np.int64) + dy
        x = np.floor(ra_deg * np.cos(np.radians(dec_deg)) / cell).astype(np.int64) + dx
        return y * 100_000_000 + x
    hra, hdec = np.degrees(hyg[:, 0]) % 360, np.degrees(hyg[:, 1])
    taken = np.unique(np.concatenate([keys(hra, hdec, dx, dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)]))
    dup = np.isin(keys(cat[:, 0] % 360, cat[:, 1]), taken)
    cat = cat[~dup]
    print(f'  {dup.sum()} Tycho-2 stars already in HYG; {len(cat)} new')
    os.makedirs(os.path.join(OUT, 'tycho'), exist_ok=True)
    bands = int(round(180 / TYCHO_BAND))
    band = np.clip(((cat[:, 1] + 90) / TYCHO_BAND).astype(int), 0, bands - 1)
    total = 0
    counts = []
    for b in range(bands):
        part = cat[band == b]
        part = part[np.argsort(part[:, 2])]   # brightest first, so a partial draw shows the right stars
        n = len(part)
        ra = np.round((part[:, 0] % 360) / 360 * (1 << 24)).astype(np.uint32) % (1 << 24)
        dec = np.clip(np.round((part[:, 1] + 90 - b * TYCHO_BAND) / TYCHO_BAND * 65535), 0, 65535).astype('<u2')
        mag = np.clip(np.round((part[:, 2] - 6) * 40), 0, 255).astype(np.uint8)
        ra_bytes = np.stack([(ra & 255), (ra >> 8) & 255, (ra >> 16) & 255], axis=1).astype(np.uint8).tobytes()
        pad = lambda bts: bts + b'\0' * (-len(bts) % 4)
        data = b'TYC1' + struct.pack('<I', n) + pad(ra_bytes) + pad(dec.tobytes()) + pad(mag.tobytes())
        path = os.path.join(OUT, 'tycho', f'{b:02d}.bin')
        with open(path, 'wb') as f:
            f.write(data)
        total += len(data)
        counts.append(n)
    write_json('tycho/index.json', {'band': TYCHO_BAND, 'limit': TYCHO_LIMIT, 'counts': counts})
    print(f'  tycho: {len(cat)} stars in {bands} bands, {total / 1e6:.1f} MB')


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
    """An equirectangular (RA/Dec) brightness map of the Milky Way, smooth like a photograph.

    Two sources, combined in galactic coordinates (where the band lies flat and a
    blur is the same in every direction along it):
    - d3-celestial's brightness contours give the broad glow, including the bright
      Sagittarius and Scutum clouds that are made of stars too faint to count. The
      contours are steps, so they are blurred by a degree.
    - Tycho-2 star counts (magnitude 9.5 to 12.5) give the fine structure: the
      Great Rift, the Coalsack and the other dark clouds show up as holes in them.
    """
    import numpy as np
    from PIL import Image, ImageChops, ImageDraw
    M = np.array(EQ_TO_GAL)
    GW, GH = 2048, 1024
    px_deg = GW / 360
    gl = math.pi - (np.arange(GW) + 0.5) / GW * 2 * math.pi
    gb = math.pi / 2 - (np.arange(GH) + 0.5) / GH * math.pi
    L, B = np.meshgrid(gl, gb)

    def blur(a, sigma):
        # Gaussian by FFT: wraps around in longitude, mirrored at the poles.
        pad = int(sigma * 4) + 1
        a = np.pad(a, ((pad, pad), (0, 0)), mode='reflect')
        g = lambda n: np.exp(-2 * (math.pi * np.fft.fftfreq(n) * sigma) ** 2)
        return np.real(np.fft.ifft2(np.fft.fft2(a) * g(a.shape[0])[:, None] * g(a.shape[1])[None, :]))[pad:-pad]

    # Contours, filled in an azimuthal projection about the galactic pole where each band is a ring.
    S = 4096
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
    r = (math.pi / 2 - B) / math.pi * (S / 2)
    env = proj[np.clip((S / 2 + r * np.sin(L)).astype(int), 0, S - 1), np.clip((S / 2 + r * np.cos(L)).astype(int), 0, S - 1)]
    glow = blur(env, 1.0 * px_deg)
    glow /= glow.max()

    # Star counts per unit of sky.
    cat = np.vstack([np.load(src('python-tycho2', 'tyc2.npy')), np.load(src('python-tycho2', 'tyc2sup.npy'))]).astype(np.float64)
    cat = cat[(cat[:, 2] > 9.5) & (cat[:, 2] <= 12.5)]
    ra, de = cat[:, 0], cat[:, 1]
    v = np.stack([np.cos(de) * np.cos(ra), np.cos(de) * np.sin(ra), np.sin(de)], 1) @ M.T
    sb = np.arcsin(np.clip(v[:, 2], -1, 1))
    sl = np.arctan2(v[:, 1], v[:, 0])
    x = ((math.pi - sl) / (2 * math.pi) * GW).astype(int) % GW
    y = np.clip(((math.pi / 2 - sb) / math.pi * GH).astype(int), 0, GH - 1)
    counts = np.bincount(y * GW + x, minlength=GW * GH).reshape(GH, GW) / np.maximum(np.cos(B), 0.02)
    fine = blur(counts, 0.45 * px_deg)
    broad = blur(counts, 5 * px_deg)
    # Dark clouds: where the counts fall below their surroundings, dim the glow too.
    structure = (np.clip(fine / np.maximum(broad, 1e-6), 0.25, 1.8) - 0.25) / 1.55
    floor = np.percentile(fine, 25)
    stars = np.clip((fine - floor) / (np.percentile(fine, 99.8) - floor), 0, 1)
    shaped = glow * (0.25 + 0.75 * structure)
    gal = np.clip(0.6 * shaped / np.percentile(shaped, 99.9) + 0.4 * stars, 0, 1) ** 0.9

    # Resample to right ascension and declination.
    W, H = 2048, 1024
    ra = (np.arange(W) + 0.5) / W * 2 * math.pi
    de = math.pi / 2 - (np.arange(H) + 0.5) / H * math.pi
    RA, DE = np.meshgrid(ra, de)
    v = np.stack([np.cos(DE) * np.cos(RA), np.cos(DE) * np.sin(RA), np.sin(DE)], axis=-1) @ M.T
    b = np.arcsin(np.clip(v[..., 2], -1, 1))
    l = np.arctan2(v[..., 1], v[..., 0])
    fx = (math.pi - l) / (2 * math.pi) * GW - 0.5
    fy = (math.pi / 2 - b) / math.pi * GH - 0.5
    x0 = np.floor(fx).astype(int); y0 = np.clip(np.floor(fy).astype(int), 0, GH - 2)
    tx = fx - x0; ty = np.clip(fy - y0, 0, 1)
    x0 %= GW; x1 = (x0 + 1) % GW
    eq = (gal[y0, x0] * (1 - tx) * (1 - ty) + gal[y0, x1] * tx * (1 - ty)
          + gal[y0 + 1, x0] * (1 - tx) * ty + gal[y0 + 1, x1] * tx * ty)
    img = Image.fromarray(np.clip(eq * 255 + 0.5, 0, 255).astype('uint8'), 'L')
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


# Surface maps: [output name, source file, width]. Equirectangular, longitude 0 in the middle, north up.
TEXTURES = [
    ('sun', '2k_sun.jpg', 1024), ('mercury', '2k_mercury.jpg', 1024), ('venus', '2k_venus_atmosphere.jpg', 1024),
    ('earth', '2k_earth_daymap.jpg', 2048), ('moon', '2k_moon.jpg', 2048), ('mars', '2k_mars.jpg', 2048),
    ('jupiter', '2k_jupiter.jpg', 2048), ('saturn', '2k_saturn.jpg', 1024), ('uranus', '2k_uranus.jpg', 512),
    ('neptune', '2k_neptune.jpg', 1024),
]


def build_textures():
    """Planet and Moon maps, resized and re-encoded; Saturn's rings as a radial strip (RGBA)."""
    from PIL import Image
    out = os.path.join(OUT, 'textures')
    os.makedirs(out, exist_ok=True)
    for name, source, width in TEXTURES:
        im = Image.open(src('planet-textures', source)).convert('RGB')
        im = im.resize((width, width // 2), Image.LANCZOS)
        im.save(os.path.join(out, f'{name}.jpg'), quality=84, optimize=True, progressive=True)
    # The ring strip runs from 1.166 to 2.330 Saturn radii (the C ring's inner edge at 1.239 and the
    # A ring's outer edge at 2.269 fall at columns 128 and 1940 of the 2048 source). Keep one row.
    ring = Image.open(src('planet-textures', '2k_saturn_ring_alpha.png')).convert('RGBA')
    ring = ring.crop((0, ring.height // 2, ring.width, ring.height // 2 + 1)).resize((1024, 1), Image.LANCZOS)
    ring.save(os.path.join(out, 'saturn-rings.png'), optimize=True)


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
    print('textures'); build_textures()


if __name__ == '__main__':
    main()

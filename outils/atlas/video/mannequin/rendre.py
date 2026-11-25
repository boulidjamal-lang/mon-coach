# Mannequin, étape 3 : la scène d'un exercice — le personnage posé image par image par le moteur de l'appli, son
# matériel, les muscles qui travaillent en couleur, studio et rendu Cycles (fond transparent, ombre au sol).
#   python rendre.py <outils> <mannequin.blend> <mannequin.npz> <mouvement.json | repos> <couleurs.json | -> <sortie> <images> [résolution] [échantillons]
# <images> : "0-69", "0,17,35" ou "35". Réglages (variables) : VUE="az,el", CADRE="haut" (corps entier par défaut),
# DEBUG=os (couleur par os), EXPO, TEINTE=rouge|rose, FORMAT="l,h".
import sys, os, json, math, time, re
import numpy as np
import bpy
from mathutils import Matrix, Vector
sys.path.insert(0, sys.argv[1])
from lire import app_vers_blender
from poses import Poseur

args = sys.argv[2:]
BLEND, NPZ, MOUV, COUL, SORTIE, IMAGES = args[:6]
RES = int(args[6]) if len(args) > 6 else 540
ECH = int(args[7]) if len(args) > 7 else 32
os.makedirs(SORTIE, exist_ok=True)
t0 = time.time()
def chrono(m): print(f'{time.time() - t0:7.1f} s  {m}', flush=True)

bpy.ops.wm.open_mainfile(filepath=os.path.abspath(BLEND))
sc = bpy.context.scene
D = np.load(NPZ); meta = json.loads(str(D['meta']))
OS = meta['os']; ST = meta['structures']
corps = bpy.data.objects['corps']; short = bpy.data.objects.get('short'); arm = bpy.data.objects['squelette']
me = corps.data; NV = len(me.vertices)
B3 = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], float)
B4 = np.eye(4); B4[:3, :3] = B3

def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)
def lin(c): return tuple(((x / 255 + 0.055) / 1.055) ** 2.4 if x / 255 > 0.04045 else x / 255 / 12.92 for x in c)

# ---------------------------------------------------------------- le mouvement
MV = None if MOUV == 'repos' else json.load(open(MOUV))
poseur = Poseur(meta)
NJ = len(meta['squelette'])
REST = {o['nom']: arm.data.bones[o['nom']].matrix_local.copy() for o in OS}
def poser(dq):
    for o, (R, t) in zip(OS, poseur.poser(dq)):
        X = np.eye(4); X[:3, :3] = R; X[:3, 3] = t
        Xb = Matrix((B4 @ X @ B4.T).tolist())
        M = REST[o['nom']]
        arm.pose.bones[o['nom']].matrix_basis = M.inverted() @ Xb @ M
DQ_REPOS = np.tile(np.array([0, 0, 0, 1, 0, 0, 0, 0], float), (NJ, 1))

# ---------------------------------------------------------------- les muscles qui travaillent
muscle = D['muscle'].astype(np.int64); muscle2 = D['muscle2'].astype(np.int64)
actif = np.zeros(NV)
if COUL != '-' and MV is not None:
    CC = json.load(open(COUL)); cmap = CC['couleurs'].get(MV['quoi'], {})
    hexv = lambda h: np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float)
    n0, a0 = hexv(CC['neutres']['muscle']), hexv(CC['accent'])
    force = np.zeros(len(ST) + 1)
    for s in ST:
        if s['id'] in cmap:
            force[s['i']] = float(np.clip(((hexv(cmap[s['id']]) - n0) @ (a0 - n0)) / ((a0 - n0) @ (a0 - n0)), 0, 1))
    # Les muscles peu sollicités (stabilisateurs) restent neutres : seuls ceux qui travaillent vraiment se colorent.
    SEUIL_A = float(os.environ.get('SEUIL_ACTIF', '0.4'))
    force = np.clip((force - SEUIL_A) / (1 - SEUIL_A), 0, 1) ** 0.8
    a1 = force[muscle]; a2 = force[muscle2]
    # Un muscle du bras ne colore que la peau du bras : sous le deltoïde et le pectoral, le biceps et le coraco-brachial
    # affleurent dans le sillon de l'épaule — la peau de l'épaule ne les montre pas.
    nomOs = np.array([o['nom'] for o in OS]); du_bras = np.array([n.split('.')[0] in ('bras1', 'bras2', 'avantbras0', 'avantbras1', 'avantbras2', 'main') or n.startswith('doigt') for n in nomOs])
    pbras = (D['os_w'] * du_bras[D['os_i'].astype(np.int64)]).sum(1)
    reg_bras = np.array([s_['region'] in ('bras', 'avant_bras') for s_ in ST] + [False])
    a1 = np.where(reg_bras[muscle] & (pbras < 0.3), 0, a1); a2 = np.where(reg_bras[muscle2] & (pbras < 0.3), 0, a2)
    actif = np.maximum(a1, float(os.environ.get('PROFOND', '0.45')) * a2 * (a1 < 0.05))
    # bords adoucis : deux tours de moyenne avec les voisins
    ed = np.zeros(len(me.edges) * 2, np.int32); me.edges.foreach_get('vertices', ed); ed = ed.reshape(-1, 2)
    deg = np.zeros(NV); np.add.at(deg, ed[:, 0], 1); np.add.at(deg, ed[:, 1], 1); deg = np.maximum(deg, 1)
    for _ in range(int(os.environ.get('ADOUCIR', '2'))):
        s_ = np.zeros(NV); np.add.at(s_, ed[:, 0], actif[ed[:, 1]]); np.add.at(s_, ed[:, 1], actif[ed[:, 0]])
        actif = 0.5 * actif + 0.5 * s_ / deg
    chrono(f"muscles en couleur : {int((force > 0).sum())} structures, {int((actif > 0.05).sum())} sommets ; plus fort {force.max():.2f}")
me.attributes['actif'].data.foreach_set('value', actif.astype(np.float32))
if short is not None:
    us = np.load(os.path.splitext(BLEND)[0] + '-short.npy')
    # Sous le tissu, la couleur se devine en nappe douce (pas le dessin des muscles).
    asr = actif[us].copy(); nS = len(us)
    es = np.zeros(len(short.data.edges) * 2, np.int32); short.data.edges.foreach_get('vertices', es); es = es.reshape(-1, 2)
    dg = np.zeros(nS); np.add.at(dg, es[:, 0], 1); np.add.at(dg, es[:, 1], 1); dg = np.maximum(dg, 1)
    for _ in range(int(os.environ.get('ADOUCIR_SHORT', '40'))):
        t_ = np.zeros(nS); np.add.at(t_, es[:, 0], asr[es[:, 1]]); np.add.at(t_, es[:, 1], asr[es[:, 0]]); asr = 0.5 * asr + 0.5 * t_ / dg
    short.data.attributes['actif'].data.foreach_set('value', asr.astype(np.float32))

# ---------------------------------------------------------------- les matières
TEINTE = os.environ.get('TEINTE', 'rouge')
C_NEUTRE = srgb(os.environ.get('NEUTRE', '#c9c6c1'))
C_FORT = srgb(os.environ.get('FORT', '#d0191a')) if TEINTE == 'rouge' else srgb('#e8246f')
C_MOYEN = srgb(os.environ.get('MOYEN', '#e8705c')) if TEINTE == 'rouge' else srgb('#ee93b8')

def noeuds(m):
    m.use_nodes = True
    return m.node_tree.nodes, m.node_tree.links, m.node_tree.nodes['Principled BSDF']

def mat_peau(m, ongle=False):
    N, L, bs = noeuds(m)
    att = N.new('ShaderNodeAttribute'); att.attribute_name = 'actif'
    ramp = N.new('ShaderNodeValToRGB'); e = ramp.color_ramp.elements
    e[0].position = 0.04; e[0].color = (*C_NEUTRE, 1); e[1].position = 1.0; e[1].color = (*C_FORT, 1)
    k = ramp.color_ramp.elements.new(0.42); k.color = (*C_MOYEN, 1)
    L.new(att.outputs['Fac'], ramp.inputs['Fac'])
    # Les creux plus sombres : occlusion ambiante (sillons) et profondeur du relief (séparation des muscles).
    ao = N.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = float(os.environ.get('AO_D', '0.03')); ao.samples = 8
    aor = N.new('ShaderNodeMapRange'); aor.inputs['From Min'].default_value = float(os.environ.get('AO_DE', '0.25')); aor.inputs['From Max'].default_value = float(os.environ.get('AO_A', '0.95')); aor.inputs['To Min'].default_value = float(os.environ.get('AO_MIN', '0.30')); aor.inputs['To Max'].default_value = 1.0
    L.new(ao.outputs['AO'], aor.inputs['Value'])
    cr = N.new('ShaderNodeAttribute'); cr.attribute_name = 'creux'
    crr = N.new('ShaderNodeMapRange'); crr.inputs['From Min'].default_value = -0.0028; crr.inputs['From Max'].default_value = -0.0008
    crr.inputs['To Min'].default_value = float(os.environ.get('CREUX_MIN', '0.5')); crr.inputs['To Max'].default_value = 1.0
    L.new(cr.outputs['Fac'], crr.inputs['Value'])
    mu = N.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'; L.new(aor.outputs['Result'], mu.inputs[0]); L.new(crr.outputs['Result'], mu.inputs[1])
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1.0
    comb = N.new('ShaderNodeCombineColor');
    for i in range(3): L.new(mu.outputs[0], comb.inputs[i])
    L.new(ramp.outputs['Color'], mix.inputs['A']); L.new(comb.outputs['Color'], mix.inputs['B'])
    L.new(mix.outputs['Result'], bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value = 0.3 if ongle else 0.52
    bs.inputs['Subsurface Weight'].default_value = 0.12
    bs.inputs['Subsurface Radius'].default_value = (1.0, 0.4, 0.3)
    bs.inputs['Subsurface Scale'].default_value = 0.004
    bs.inputs['Coat Weight'].default_value = 0.25 if ongle else 0.04
    bs.inputs['Specular IOR Level'].default_value = 0.4
    # Le grain des fibres : un bruit étiré le long des fibres du muscle recouvert, tenu à la peau au repos.
    rep = N.new('ShaderNodeAttribute'); rep.attribute_name = 'repos'
    fib = N.new('ShaderNodeAttribute'); fib.attribute_name = 'fibre'
    dot = N.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; L.new(rep.outputs['Vector'], dot.inputs[0]); L.new(fib.outputs['Vector'], dot.inputs[1])
    sca = N.new('ShaderNodeVectorMath'); sca.operation = 'SCALE'; L.new(fib.outputs['Vector'], sca.inputs[0]); L.new(dot.outputs['Value'], sca.inputs['Scale'])
    perp = N.new('ShaderNodeVectorMath'); perp.operation = 'SUBTRACT'; L.new(rep.outputs['Vector'], perp.inputs[0]); L.new(sca.outputs['Vector'], perp.inputs[1])
    k1 = N.new('ShaderNodeVectorMath'); k1.operation = 'SCALE'; k1.inputs['Scale'].default_value = float(os.environ.get('FIBRE_K', '520')); L.new(perp.outputs['Vector'], k1.inputs[0])
    k2 = N.new('ShaderNodeVectorMath'); k2.operation = 'SCALE'; k2.inputs['Scale'].default_value = 22.0; L.new(sca.outputs['Vector'], k2.inputs[0])
    som = N.new('ShaderNodeVectorMath'); som.operation = 'ADD'; L.new(k1.outputs['Vector'], som.inputs[0]); L.new(k2.outputs['Vector'], som.inputs[1])
    bruit = N.new('ShaderNodeTexNoise'); bruit.inputs['Scale'].default_value = 1.0; bruit.inputs['Detail'].default_value = 2.5; bruit.inputs['Roughness'].default_value = 0.55
    L.new(som.outputs['Vector'], bruit.inputs['Vector'])
    # (pas de fibres hors des muscles : la longueur du vecteur « fibre » sert d'interrupteur)
    lf = N.new('ShaderNodeVectorMath'); lf.operation = 'LENGTH'; L.new(fib.outputs['Vector'], lf.inputs[0])
    st = N.new('ShaderNodeMath'); st.operation = 'MULTIPLY'; st.inputs[1].default_value = float(os.environ.get('FIBRE', '0.22')) * (0.2 if ongle else 1.0); L.new(lf.outputs['Value'], st.inputs[0])
    bump = N.new('ShaderNodeBump'); bump.inputs['Distance'].default_value = 0.0007
    L.new(st.outputs[0], bump.inputs['Strength']); L.new(bruit.outputs['Fac'], bump.inputs['Height']); L.new(bump.outputs['Normal'], bs.inputs['Normal'])

def mat_simple(m, couleur, metal=0.0, rough=0.5, coat=0.0):
    N, L, bs = noeuds(m)
    bs.inputs['Base Color'].default_value = (*couleur, 1); bs.inputs['Metallic'].default_value = metal; bs.inputs['Roughness'].default_value = rough; bs.inputs['Coat Weight'].default_value = coat
    return m

def mat_oeil(m):
    N, L, bs = noeuds(m)
    c = meta['oeil']['centre']; ray = meta['oeil']['rayon']
    rep = N.new('ShaderNodeAttribute'); rep.attribute_name = 'repos'
    sep = N.new('ShaderNodeSeparateXYZ'); L.new(rep.outputs['Vector'], sep.inputs[0])
    ax = N.new('ShaderNodeMath'); ax.operation = 'ABSOLUTE'; L.new(sep.outputs['X'], ax.inputs[0])
    cb = N.new('ShaderNodeCombineXYZ'); L.new(ax.outputs[0], cb.inputs['X']); L.new(sep.outputs['Y'], cb.inputs['Y']); L.new(sep.outputs['Z'], cb.inputs['Z'])
    sub = N.new('ShaderNodeVectorMath'); sub.operation = 'SUBTRACT'; sub.inputs[1].default_value = (c[0], -c[2], c[1]); L.new(cb.outputs['Vector'], sub.inputs[0])
    nor = N.new('ShaderNodeVectorMath'); nor.operation = 'NORMALIZE'; L.new(sub.outputs['Vector'], nor.inputs[0])
    dt = N.new('ShaderNodeVectorMath'); dt.operation = 'DOT_PRODUCT'; dt.inputs[1].default_value = (0, -1, 0); L.new(nor.outputs['Vector'], dt.inputs[0])
    ramp = N.new('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'CONSTANT'; e = ramp.color_ramp.elements
    e[0].position = 0.0; e[0].color = (*srgb('#e9e6e1'), 1); e[1].position = float(os.environ.get('IRIS', '0.80')); e[1].color = (*srgb('#3a3632'), 1)
    k = ramp.color_ramp.elements.new(0.945); k.color = (0.004, 0.004, 0.004, 1)
    L.new(dt.outputs['Value'], ramp.inputs['Fac']); L.new(ramp.outputs['Color'], bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value = 0.12; bs.inputs['Coat Weight'].default_value = 0.6; bs.inputs['Coat Roughness'].default_value = 0.05

def mat_tissu(m):
    N, L, bs = noeuds(m)
    att = N.new('ShaderNodeAttribute'); att.attribute_name = 'actif'
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    mix.inputs['A'].default_value = (*srgb(os.environ.get('SHORT', '#0e0f12')), 1); mix.inputs['B'].default_value = (*[x * 0.55 for x in C_FORT], 1)
    mr = N.new('ShaderNodeMapRange'); mr.inputs['To Max'].default_value = 0.9; L.new(att.outputs['Fac'], mr.inputs['Value'])
    L.new(mr.outputs['Result'], mix.inputs['Factor']); L.new(mix.outputs['Result'], bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value = 0.78; bs.inputs['Sheen Weight'].default_value = 0.25
    tx = N.new('ShaderNodeTexNoise'); tx.inputs['Scale'].default_value = 900.0
    rep = N.new('ShaderNodeAttribute'); rep.attribute_name = 'repos'; L.new(rep.outputs['Vector'], tx.inputs['Vector'])
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.12; bump.inputs['Distance'].default_value = 0.0004
    L.new(tx.outputs['Fac'], bump.inputs['Height']); L.new(bump.outputs['Normal'], bs.inputs['Normal'])

mat_peau(me.materials[0]); mat_peau(me.materials[1], ongle=True)
mat_simple(me.materials[2], srgb(os.environ.get('CHEVEUX', '#2b2724')), rough=0.6)
mat_oeil(me.materials[3])
if short is not None: mat_tissu(short.data.materials[0])

if os.environ.get('DEBUG') == 'os':
    # Contrôle des attaches : chaque os a sa couleur, les poids se lisent au mélange.
    rng = np.random.default_rng(3); pal = rng.uniform(0.08, 1.0, (len(OS), 3))
    for i, o in enumerate(OS):
        if o['nom'].endswith('.D'): pal[i] = pal[[k for k, p in enumerate(OS) if p['nom'] == o['nom'][:-2] + '.G'][0]][[1, 2, 0]]
    col = (pal[D['os_i'].astype(np.int64)] * D['os_w'][:, :, None]).sum(1)
    a = me.color_attributes.new('debug', 'FLOAT_COLOR', 'POINT'); a.data.foreach_set('color', np.c_[col, np.ones(NV)].astype(np.float32).ravel())
    for m in list(me.materials)[:2]:
        N, L, bs = noeuds(m); at = N.new('ShaderNodeAttribute'); at.attribute_name = 'debug'
        for l in list(bs.inputs['Base Color'].links): L.remove(l)
        L.new(at.outputs['Color'], bs.inputs['Base Color'])

# ---------------------------------------------------------------- le matériel
def maillage(nom, P, F):
    m = bpy.data.meshes.new(nom); m.from_pydata([tuple(p) for p in P], [], [tuple(f) for f in F]); m.update()
    for p in m.polygons: p.use_smooth = True
    return m

def revolution(profil, n=48, sx=1.0, sz=1.0):
    """Profil (rayon, y) tourné autour de Y."""
    P, F = [], []
    for (r, y) in profil:
        for i in range(n):
            a = i / n * 2 * math.pi; P.append((r * math.cos(a) * sx, y, r * math.sin(a) * sz))
    m = len(profil)
    for j in range(m - 1):
        for i in range(n):
            a, b, c, d = j * n + i, j * n + (i + 1) % n, (j + 1) * n + (i + 1) % n, (j + 1) * n + i
            F.append((a, d, c, b))
    # fonds
    P.append((0, profil[0][1], 0)); P.append((0, profil[-1][1], 0)); c0, c1 = len(P) - 2, len(P) - 1
    for i in range(n):
        F.append((c0, i, (i + 1) % n)); F.append((c1, (m - 1) * n + (i + 1) % n, (m - 1) * n + i))
    return P, F

def forme_maillage(f):
    s, r = f['s'], f.get('r') or 0
    if f['forme'] == 'cylindre':
        R, h = 1.0, s[1]; rr = min(r, s[0], s[2], 0.5 * h) / max(s[0], 1e-9)   # (profil en unités de rayon)
        ry = min(r, s[0], s[2], 0.5 * h)
        prof = []
        if ry > 1e-5:
            for k in range(7): a = k / 6 * math.pi / 2; prof.append((1 - rr + rr * math.sin(a), -h / 2 + ry - ry * math.cos(a)))
            for k in range(7): a = k / 6 * math.pi / 2; prof.append((1 - rr + rr * math.cos(a), h / 2 - ry + ry * math.sin(a)))
        else: prof = [(1, -h / 2), (1, h / 2)]
        P, F = revolution(prof, 48, s[0], s[2])
        m = maillage('cyl', P, F)
        if ry <= 1e-5:
            for p in m.polygons: p.use_smooth = len(p.vertices) == 4
        return m, None
    if f['forme'] == 'hexa':
        P, F = revolution([(1, -s[1] / 2), (1, s[1] / 2)], 6, s[0], s[2]); m = maillage('hexa', P, F)
        for p in m.polygons: p.use_smooth = False
        return m, 0.004
    if f['forme'] == 'boite':
        hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
        P = [(-hx, -hy, -hz), (hx, -hy, -hz), (hx, hy, -hz), (-hx, hy, -hz), (-hx, -hy, hz), (hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz)]
        F = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        m = maillage('boite', P, F)
        for p in m.polygons: p.use_smooth = False
        return m, min(r, 0.5 * min(s)) * 0.999 if r > 1e-5 else min(0.0012, 0.2 * min(s))
    if f['forme'] == 'sphere':
        P, F = [], []; nu, nv = 40, 20
        for j in range(1, nv):
            b = j / nv * math.pi
            for i in range(nu): a = i / nu * 2 * math.pi; P.append((s[0] * math.sin(b) * math.cos(a), s[1] * math.cos(b), s[2] * math.sin(b) * math.sin(a)))
        for j in range(nv - 2):
            for i in range(nu): F.append((j * nu + i, j * nu + (i + 1) % nu, (j + 1) * nu + (i + 1) % nu, (j + 1) * nu + i))
        P.append((0, s[1], 0)); P.append((0, -s[1], 0)); t, bq = len(P) - 2, len(P) - 1
        for i in range(nu): F.append((t, (i + 1) % nu, i)); F.append((bq, (nv - 2) * nu + i, (nv - 2) * nu + (i + 1) % nu))
        return maillage('sphere', P, F), None
    if f['forme'] in ('tore', 'arc'):
        tube = r if r else 0.14 * s[0]; nu = 64 if f['forme'] == 'tore' else 33; nv = 16; P, F = [], []
        tot = 2 * math.pi if f['forme'] == 'tore' else math.pi
        for i in range(nu):
            a = i / (nu if f['forme'] == 'tore' else nu - 1) * tot; cx, cy = math.cos(a), math.sin(a)
            for j in range(nv): b = j / nv * 2 * math.pi; P.append(((s[0] + tube * math.cos(b)) * cx, (s[0] + tube * math.cos(b)) * cy, tube * math.sin(b)))
        for i in range(nu if f['forme'] == 'tore' else nu - 1):
            for j in range(nv):
                i2 = (i + 1) % nu
                F.append((i * nv + j, i2 * nv + j, i2 * nv + (j + 1) % nv, i * nv + (j + 1) % nv))
        if f['forme'] == 'arc':
            for i, sg in ((0, 1), (nu - 1, -1)):
                a = 0 if i == 0 else math.pi; P.append((s[0] * math.cos(a), s[0] * math.sin(a) - tube * 0.6, 0)); c = len(P) - 1
                for j in range(nv): F.append((c, i * nv + j, i * nv + (j + 1) % nv) if sg > 0 else (c, i * nv + (j + 1) % nv, i * nv + j))
        return maillage(f['forme'], P, F), None
    raise ValueError(f['forme'])

MATS = {}
def mat_materiel(f):
    cle = (tuple(f['couleur']), round(f.get('metal') or 0, 2), f.get('appui', 0))
    if cle in MATS: return MATS[cle]
    c = lin(f['couleur']); metal = f.get('metal') or 0; sombre = max(f['couleur']) < 70
    m = bpy.data.materials.new('materiel')
    mat_simple(m, c, metal=min(1.0, metal * 1.15) if metal > 0.4 else metal * 0.5,
               rough=0.22 if metal >= 0.7 else 0.38 if metal >= 0.4 else 0.62 if sombre else 0.5, coat=0.15 if (sombre and metal < 0.2) else 0.0)
    MATS[cle] = m; return m

objets = []
def creer_materiel(formes):
    for i, f in enumerate(formes):
        m, biseau = forme_maillage(f)
        o = bpy.data.objects.new(f"mat{i}_{f['forme']}", m); sc.collection.objects.link(o)
        m.materials.append(mat_materiel(f))
        if biseau:
            bv = o.modifiers.new('biseau', 'BEVEL'); bv.width = biseau; bv.segments = 4; bv.limit_method = 'ANGLE'; bv.angle_limit = math.radians(40); bv.harden_normals = True
            for p in m.polygons: p.use_smooth = True
        objets.append((o, list(f['s'])))
def placer_materiel(formes):
    for (o, s0), f in zip(objets, formes):
        q = f['q']; x, y, z, w = q
        R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)], [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)], [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]])
        # (un câble, un élastique : la forme s'étire ; l'échelle rattrape la taille de l'image)
        ech = np.array([f['s'][k] / s0[k] if s0[k] > 1e-9 else 1.0 for k in range(3)])
        if f['forme'] in ('tore', 'arc', 'sphere'): ech = np.array([f['s'][0] / s0[0] if s0[0] > 1e-9 else 1.0] * 3)
        X = np.eye(4); X[:3, :3] = R * ech[None, :]; X[:3, 3] = f['p']
        o.matrix_world = Matrix((B4 @ X).tolist())
        o.hide_render = bool(f.get('hors')) and os.environ.get('HORS', '0') != '1'
if MV is not None: creer_materiel(MV['images'][0]['formes'])

# ---------------------------------------------------------------- studio
VUE = [float(x) for x in os.environ['VUE'].split(',')] if os.environ.get('VUE') else ([MV['vue']['az'], MV['vue']['el']] if MV else [35, 8])
az, el = math.radians(VUE[0]), math.radians(VUE[1])
if MV: bmin, bmax = np.array(MV['boite']['min']), np.array(MV['boite']['max'])
else: bmin, bmax = np.array([-0.45, 0, -0.2]), np.array([0.45, 1.76, 0.2])
if os.environ.get('BOITE'):
    v = [float(x) for x in os.environ['BOITE'].split(',')]; bmin, bmax = np.array(v[:3]), np.array(v[3:])
FORMAT = [int(x) for x in os.environ.get('FORMAT', f'{RES},{RES}').split(',')]
aspect = FORMAT[0] / FORMAT[1]
cam = bpy.data.cameras.new('cam'); cam.lens = float(os.environ.get('FOCALE', '85')); cam.sensor_width = 36; cam.sensor_fit = 'HORIZONTAL'
co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
# Vers où regarde l'appli : la caméra est du côté (sin az cos el, sin el, cos az cos el) de la cible (repère de l'appli).
dir_app = np.array([math.sin(az) * math.cos(el), math.sin(el), math.cos(az) * math.cos(el)])
cible = (bmin + bmax) / 2
coins = np.array([[x, y, z] for x in (bmin[0], bmax[0]) for y in (bmin[1], bmax[1]) for z in (bmin[2], bmax[2])])
dr = np.cross([0, 1, 0], dir_app); dr /= np.linalg.norm(dr); up = np.cross(dir_app, dr)
tanx = (cam.sensor_width / 2) / cam.lens; tany = tanx / aspect
MARGE = float(os.environ.get('MARGE', '1.10'))
dist = 0
for c in coins - cible:
    x, y, zc = c @ dr, c @ up, c @ dir_app
    dist = max(dist, abs(x) * MARGE / tanx + zc, abs(y) * MARGE / tany + zc)
pos_app = cible + dir_app * dist
co.location = Vector(B3 @ pos_app); d = Vector(B3 @ cible) - co.location; co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
cam.clip_start = 0.1; cam.clip_end = 100

def lampe(nom, loc_cam, cible_b, energie, taille=(1, 1), couleur=(1, 1, 1), etale=None):
    """loc_cam : (à droite, en haut, vers la caméra) depuis la cible, en mètres : les lumières suivent la vue."""
    l = bpy.data.lights.new(nom, 'AREA'); l.energy = energie; l.color = couleur; l.shape = 'RECTANGLE'; l.size, l.size_y = taille
    if etale: l.spread = math.radians(etale)
    o = bpy.data.objects.new(nom, l); sc.collection.objects.link(o)
    p = cible_b_app + dr * loc_cam[0] + np.array([0, 1, 0]) * loc_cam[1] + np.cross(dr, [0, 1, 0]) * (-loc_cam[2])
    o.location = Vector(B3 @ p); dd = Vector(B3 @ cible_b) - o.location; o.rotation_euler = dd.to_track_quat('-Z', 'Y').to_euler()
    return o
cible_b_app = np.array([cible[0], 0.0, cible[2]])
H_ = max(1.2, bmax[1]); mil = np.array([cible[0], H_ * 0.55, cible[2]])
ECL = float(os.environ.get('ECLAIRAGE', '1.0'))
LP = [float(x) for x in os.environ.get('LAMPES', '1500,170,700,600,60').split(',')]
lampe('principale', (-2.0, H_ + 1.7, 2.3), mil, LP[0] * ECL, (1.1, 1.1), (1.0, 0.97, 0.93), 70)
lampe('debouchage', (2.8, H_ * 0.6, 2.6), mil, LP[1] * ECL, (2.4, 2.4), (0.9, 0.95, 1.0), 90)
lampe('contre_g', (2.2, H_ + 0.9, -2.4), mil, LP[2] * ECL, (0.5, 2.4), (0.92, 0.96, 1.0), 60)
lampe('contre_d', (-2.4, H_ + 0.7, -2.2), mil, LP[3] * ECL, (0.5, 2.4), (0.96, 0.97, 1.0), 60)
lampe('face', (0.2, H_ * 0.5, 3.4), mil, LP[4] * ECL, (3, 3), (1, 1, 1), 100)
# (Le troisième nombre compte vers le fond : la « principale » est en haut derrière le sujet, à gauche ; les deux bandes
# verticales « contre » sont devant, de chaque côté — un éclairage croisé, qui creuse le relief des muscles.)
# Une lumière douce au zénith, faible : c'est elle seule qui fait l'ombre au sol, ramassée sous le corps.
lampe('zenith', (0.0, H_ + 2.4, 0.0), np.array([cible[0], 0.0, cible[2]]), float(os.environ.get('ZENITH', '900')) * ECL, (2.4, 2.4), (1, 1, 1), 120)
w = bpy.data.worlds.new('monde'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.5, 0.52, 0.56, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = float(os.environ.get('AMBIANCE', '0.12'))

# Le sol : il ne reçoit que l'ombre (fond transparent).
bpy.ops.mesh.primitive_plane_add(size=30, location=(float(cible[0]), float(-cible[2]), 0))
sol = bpy.context.active_object; sol.name = 'sol'; sol.is_shadow_catcher = True
sol.data.materials.append(mat_simple(bpy.data.materials.new('sol'), (0.5, 0.5, 0.5), rough=0.9))
sc.render.film_transparent = True
# Une seule ombre au sol, celle de la lumière du zénith : les autres n'éclairent pas le sol (sur le fond clair, leurs
# ombres croisées se voyaient en longues traînées).
if os.environ.get('OMBRES', '1') == '1':
    ecl = bpy.data.collections.new('eclaires')
    for o in sc.objects:
        if o.type == 'MESH' and o.name != 'sol': ecl.objects.link(o)
    for nom in ('principale', 'debouchage', 'contre_g', 'contre_d', 'face'):
        bpy.data.objects[nom].light_linking.receiver_collection = ecl

# ---------------------------------------------------------------- rendu
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
sc.cycles.samples = ECH; sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = float(os.environ.get('SEUIL', '0.04'))
sc.cycles.use_denoising = True
try: sc.cycles.denoiser = 'OPENIMAGEDENOISE'
except Exception: pass
sc.cycles.max_bounces = 4; sc.cycles.diffuse_bounces = 2; sc.cycles.glossy_bounces = 3; sc.cycles.transmission_bounces = 1; sc.cycles.transparent_max_bounces = 4
sc.cycles.use_fast_gi = False
sc.render.resolution_x, sc.render.resolution_y = FORMAT; sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.compression = 30
sc.view_settings.view_transform = os.environ.get('TRANSFO', 'AgX')
try: sc.view_settings.look = os.environ.get('LOOK', 'AgX - Medium High Contrast')
except Exception as e: print('look :', e)
sc.view_settings.exposure = float(os.environ.get('EXPO', '-2.6'))
sc.render.threads_mode = 'FIXED'; sc.render.threads = int(os.environ.get('FILS', '4'))
sc.render.use_persistent_data = True

def liste(s):
    out = []
    for part in s.split(','):
        if '-' in part: a, b = map(int, part.split('-')); out += list(range(a, b + 1))
        else: out.append(int(part))
    return out

chrono('scène prête')
for f in liste(IMAGES):
    t = time.time()
    if MV is not None:
        im = MV['images'][f % len(MV['images'])]
        poser(np.array(im['dq'], float).reshape(NJ, 8)); placer_materiel(im['formes'])
    else: poser(DQ_REPOS)
    sc.render.filepath = os.path.join(SORTIE, f'f{f:03d}.png')
    if os.environ.get('REPRISE') == '1' and os.path.exists(sc.render.filepath): continue
    bpy.ops.render.render(write_still=True)
    print(f'image {f} : {time.time() - t:.1f} s', flush=True)
if os.environ.get('GARDER'): bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.environ['GARDER']))

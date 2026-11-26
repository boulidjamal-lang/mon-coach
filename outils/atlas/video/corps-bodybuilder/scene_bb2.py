# Essai : le bodybuilder (Sketchfab, AaronJOlson, CC BY 4.0) fait notre curl. Squelette posé sur ses articulations,
# peau liée aux os automatiquement (Blender), bras orientés image par image sur les articulations du mouvement de
# l'appli, mains et haltères du mannequin actuel greffés aux poignets, biceps en rouge.
import sys, os, json, math
import numpy as np, bpy
from mathutils import Matrix, Vector
GLB, MAINS, MOUV, SORTIE, IMAGES = sys.argv[-5:]
RES_L, RES_H = [int(x) for x in os.environ.get('FORMAT', '720,1248').split(',')]
ECH = int(os.environ.get('ECH', '16'))
os.makedirs(SORTIE, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=GLB)
corps = [o for o in bpy.data.objects if o.type == 'MESH'][0]
k = 1.80 / 12.21
for p in [o for o in bpy.data.objects if o.parent is None]: p.scale = (k, k, k); p.location.z = 0.693 * k
bpy.context.view_layer.update()
Mw = corps.matrix_world.copy()
corps.parent = None; corps.matrix_world = Mw
bpy.ops.object.select_all(action='DESELECT'); corps.select_set(True); bpy.context.view_layer.objects.active = corps
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in [o for o in bpy.data.objects if o.type == 'EMPTY']: bpy.data.objects.remove(o)
for f in corps.data.polygons: f.use_smooth = True
V0 = np.array([v.co[:] for v in corps.data.vertices])

# ---------------------------------------------------------------- squelette (pose en croix du modèle)
J = {}
for c, s in (('G', 1), ('D', -1)):
    J['clav' + c] = ((0.03 * s, 0.03, 1.555), (0.205 * s, 0.06, 1.585))
    J['bras' + c] = ((0.205 * s, 0.06, 1.588), (0.45 * s, 0.062, 1.59))
    J['avbras' + c] = ((0.45 * s, 0.062, 1.59), (0.745 * s, 0.03, 1.598))
    J['cuisse' + c] = ((0.10 * s, 0.0, 0.95), (0.15 * s, -0.005, 0.56))
    J['jambe' + c] = ((0.15 * s, -0.005, 0.56), (0.175 * s, 0.03, 0.09))
    J['pied' + c] = ((0.175 * s, 0.03, 0.09), (0.19 * s, -0.12, 0.02))
J['bassin'] = ((0, 0.0, 0.92), (0, 0.0, 1.12)); J['dos'] = ((0, 0.0, 1.12), (0, 0.01, 1.40))
J['poitrine'] = ((0, 0.01, 1.40), (0, 0.02, 1.62)); J['cou'] = ((0, 0.02, 1.62), (0, 0.03, 1.79))
PARENT = {'dos': 'bassin', 'poitrine': 'dos', 'cou': 'poitrine'}
for c in 'GD':
    PARENT.update({'clav' + c: 'poitrine', 'bras' + c: 'clav' + c, 'avbras' + c: 'bras' + c, 'cuisse' + c: 'bassin', 'jambe' + c: 'cuisse' + c, 'pied' + c: 'jambe' + c})
ad = bpy.data.armatures.new('squelette'); arm = bpy.data.objects.new('squelette', ad); sc.collection.objects.link(arm)
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for n, (h, t) in J.items():
    eb = ad.edit_bones.new(n); eb.head = h; eb.tail = t
for n, p in PARENT.items():
    ad.edit_bones[n].parent = ad.edit_bones[p]
    if (Vector(ad.edit_bones[n].head) - Vector(ad.edit_bones[p].tail)).length < 1e-3: ad.edit_bones[n].use_connect = True
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.select_all(action='DESELECT'); corps.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
vides = sum(1 for v in corps.data.vertices if not v.groups)
print('peau liée : groupes', len(corps.vertex_groups), '| sommets sans os', vides, flush=True)
for _m in corps.modifiers:
    if _m.type == 'ARMATURE': _m.use_deform_preserve_volume = os.environ.get('DQS') == '1'
lisse = corps.modifiers.new('lisse', 'CORRECTIVE_SMOOTH'); lisse.factor = 0.5; lisse.iterations = 6; lisse.use_only_smooth = False; lisse.smooth_type = 'LENGTH_WEIGHTED'; lisse.rest_source = 'ORCO'

# ---------------------------------------------------------------- biceps en rouge (au repos, devant le haut du bras)
def lisse01(x, a, b): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
ax = np.abs(V0[:, 0])
u = (ax - 0.345) / 0.095                                   # le long du bras : -1 (épaule) à 1 (coude)
dy, dz = V0[:, 1] - 0.062, V0[:, 2] - 1.589
theta = np.degrees(np.abs(np.arctan2(dz, -dy)))            # angle autour du bras, 0 = plein devant
tmax = 72 * np.sqrt(np.clip(1 - u * u, 0, 1))              # ovale : large au milieu, pointu aux deux bouts
rouge = (lisse01(tmax - theta, 0, 14) * (np.abs(u) < 1) * (V0[:, 2] > 1.45) * (ax > 0.22))
# grand dorsal : dos, de l'aisselle au bas du dos, en éventail vers la colonne
zz = V0[:, 2]; larg = 0.10 + 0.13 * lisse01(zz, 1.10, 1.42)
dors = lisse01(V0[:, 1] - 0.0, 0.0, 0.05) * lisse01(zz, 1.08, 1.16) * (1 - lisse01(zz, 1.44, 1.50)) * lisse01(ax, 0.04, 0.08) * (1 - lisse01(ax - larg, -0.02, 0.01)) * (ax < 0.30)
rouge = np.maximum(rouge, dors * float(os.environ.get('DORSAL', '0'))).astype(np.float32)
ca = corps.data.color_attributes.new('travail', 'FLOAT_COLOR', 'POINT')
ca.data.foreach_set('color', np.c_[rouge, rouge, rouge, np.ones_like(rouge)].ravel())

def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)
ARGILE, ROUGE = srgb('#8d9295'), srgb('#f03a16')
m = bpy.data.materials.new('argile'); m.use_nodes = True; N = m.node_tree.nodes; L = m.node_tree.links
bs = N['Principled BSDF']; bs.inputs['Roughness'].default_value = 0.55
at = N.new('ShaderNodeAttribute'); at.attribute_name = 'travail'
mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.inputs['A'].default_value = (*ARGILE, 1); mix.inputs['B'].default_value = (*ROUGE, 1)
L.new(at.outputs['Fac'], mix.inputs['Factor']); L.new(mix.outputs['Result'], bs.inputs['Base Color'])
corps.data.materials.clear(); corps.data.materials.append(m)
mat_main = bpy.data.materials.new('main'); mat_main.use_nodes = True
mat_main.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*ARGILE, 1); mat_main.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.55
mat_fonte = bpy.data.materials.new('fonte'); mat_fonte.use_nodes = True
mat_fonte.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*[x * 0.62 for x in ARGILE], 1); mat_fonte.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.6

# ---------------------------------------------------------------- mouvement de l'appli
MV = json.load(open(MOUV)); ART = MV['articulations']; ix = {n: i for i, n in enumerate(ART)}
def app2bl(P): P = np.asarray(P, float); return np.stack([P[..., 0], -P[..., 2], P[..., 1]], -1)
H = np.load(MAINS)
REST = {b.name: np.array(b.matrix_local) for b in ad.bones}
def unit(v): return v / max(np.linalg.norm(v), 1e-9)
AV = np.array([0, -1, 0.0])
def repere(d, n):
    y = unit(d); x = unit(n - y * (n @ y)); z = np.cross(x, y); return np.stack([x, y, z], 1)
def poser_bras(c, pw):
    S, E, W = pw[ix['humerus.' + c]], pw[ix['ulna.' + c]], pw[ix['main.' + c]]
    d1, d2 = unit(E - S), unit(W - E)
    n = np.cross(d1, d2) + 0.25 * np.cross(d1, AV)
    out = {}
    for b, d in (('bras' + c, d1), ('avbras' + c, d2)):
        M0 = REST[b]; d0 = M0[:3, 1]
        n0 = np.cross(d0, AV)
        R = repere(d, n) @ repere(d0, n0).T
        out[b] = R
    return out, d1, d2
CHAINE = {'bassin': ('bassin', 'L3'), 'dos': ('L3', 'thorax'), 'poitrine': ('thorax', 'cou1'), 'cou': ('cou1', 'tete')}
for c in 'GD':
    CHAINE.update({'clav' + c: ('clavicule.' + c, 'humerus.' + c), 'bras' + c: ('humerus.' + c, 'ulna.' + c), 'avbras' + c: ('ulna.' + c, 'main.' + c),
                   'cuisse' + c: ('femur.' + c, 'tibia.' + c), 'jambe' + c: ('tibia.' + c, 'pied.' + c), 'pied' + c: ('pied.' + c, 'orteils.' + c)})
ORDRE = ['bassin', 'dos', 'poitrine', 'cou'] + [b + c for c in 'GD' for b in ('clav', 'bras', 'avbras', 'cuisse', 'jambe', 'pied')]
X0 = np.array([1.0, 0, 0])
def poser_corps(pw):
    v = lambda n: pw[ix[n]]
    lat_b = unit(v('femur.G') - v('femur.D')); lat_t = unit(v('humerus.G') - v('humerus.D'))
    haut_t = unit(v('cou1') - v('L3')); avant = unit(np.cross(lat_t, haut_t))
    R = {}
    for b in ORDRE:
        j0, j1 = CHAINE[b]; d = unit(v(j1) - v(j0)); M0 = REST[b]; d0 = M0[:3, 1]
        if b in ('bassin',) or b.startswith(('cuisse', 'jambe', 'pied')): x, x0 = lat_b, X0
        elif b in ('dos', 'poitrine', 'cou'): x, x0 = lat_t, X0
        elif b.startswith('clav'): x, x0 = avant, AV
        elif b.startswith('bras'):
            c = b[-1]; d2 = unit(v('main.' + c) - v('ulna.' + c)); x = np.cross(d, d2) + 0.25 * np.cross(d, avant); x0 = np.cross(d0, AV)
        else:
            c = b[-1]; d1 = unit(v('ulna.' + c) - v('humerus.' + c)); x = np.cross(d1, d) + 0.25 * np.cross(d1, avant); x0 = np.cross(d0, AV)
        R[b] = repere(d, x) @ repere(d0, x0).T
    tete, queue = {}, {}
    for b in ORDRE:
        p = PARENT.get(b); h0 = REST[b][:3, 3]
        tete[b] = v('bassin') if p is None else tete[p] + R[p] @ (h0 - REST[p][:3, 3])
        queue[b] = tete[b] + R[b] @ (np.array(J[b][1]) - np.array(J[b][0]))
    return R, tete, queue
ANCRE = os.environ.get('ANCRE', 'pieds')
pw0 = app2bl(MV['images'][0]['pw'])
ECH_MAIN = float(os.environ.get('ECH_MAIN', '1.05'))
# mains greffées
mains = {}
for c in 'GD':
    me = bpy.data.meshes.new('main' + c); P = H['pos_' + c][0].astype(float)
    me.from_pydata([tuple(p) for p in P], [], [tuple(t) for t in H['tri_' + c]]); me.update()
    for f in me.polygons: f.use_smooth = True
    o = bpy.data.objects.new('main' + c, me); sc.collection.objects.link(o); me.materials.append(mat_main); mains[c] = o
# haltères : les formes du mouvement, rattachées à la main la plus proche
sys.path.insert(0, os.environ['OUTILS'])
FORMES = MV['images'][0]['formes']
def cyl(s, n=48):
    P, F = [], []
    for y in (-s[1] / 2, s[1] / 2):
        for i in range(n): a = i / n * 2 * math.pi; P.append((s[0] * math.cos(a), y, s[2] * math.sin(a)))
    for i in range(n): F.append((i, (i + 1) % n, n + (i + 1) % n, n + i))
    P += [(0, -s[1] / 2, 0), (0, s[1] / 2, 0)]
    for i in range(n): F.append((2 * n, (i + 1) % n, i)); F.append((2 * n + 1, n + i, n + (i + 1) % n))
    return P, F
haltere = []
for i, f in enumerate(FORMES):
    if f['forme'] == 'boite':
        hx, hy, hz = f['s'][0] / 2, f['s'][1] / 2, f['s'][2] / 2
        P = [(-hx, -hy, -hz), (hx, -hy, -hz), (hx, hy, -hz), (-hx, hy, -hz), (-hx, -hy, hz), (hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz)]
        F = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    else:
        nseg = 6 if f['forme'] == 'hexa' else 48
        P, F = cyl(f['s'], nseg)
    me = bpy.data.meshes.new('h%d' % i); me.from_pydata(P, [], F); me.update()
    o = bpy.data.objects.new('h%d' % i, me); sc.collection.objects.link(o)
    me.materials.append(mat_fonte if max(f['couleur']) < 90 else mat_main)
    if f['forme'] == 'hexa':
        bv = o.modifiers.new('b', 'BEVEL'); bv.width = 0.004; bv.segments = 3; bv.limit_method = 'ANGLE'
    p = app2bl(f['p']); cote = min('GD', key=lambda c: np.linalg.norm(p - pw0[ix['main.' + c]]))
    haltere.append((o, f['s'], cote))

B3 = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], float)
def quat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)], [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)], [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]])

def placer(i):
    im = MV['images'][i]; pw = app2bl(im['pw'])
    R, tete, queue = poser_corps(pw)
    if ANCRE == 'mains':
        dec = (pw[ix['main.G']] + pw[ix['main.D']]) / 2 - (queue['avbrasG'] + queue['avbrasD']) / 2
    else:
        dec = np.array([0, 0, 0.0]); dec[:2] = ((pw[ix['pied.G']] + pw[ix['pied.D']]) / 2 - (tete['piedG'] + tete['piedD']) / 2)[:2]
        dec[2] = 0.09 - min(tete['piedG'][2], tete['piedD'][2])
    for b in ORDRE:
        X = np.eye(4); X[:3, :3] = R[b] @ REST[b][:3, :3]; X[:3, 3] = tete[b] + dec
        arm.pose.bones[b].matrix = Matrix(X.tolist()); bpy.context.view_layer.update()
    poignet = {c: queue['avbras' + c] + dec for c in 'GD'}
    for c in 'GD':
        Pm = H['pos_' + c][i].astype(float); Wm = H['poignet_' + c][i]
        mains[c].data.vertices.foreach_set('co', (poignet[c] + ECH_MAIN * (Pm - Wm)).ravel()); mains[c].data.update()
    for (o, s0, c), f in zip(haltere, im['formes']):
        Rf = B3 @ quat(f['q']); X = np.eye(4)
        if f.get('tenu') and ANCRE != 'mains':
            Wm = H['poignet_' + c][i]; X[:3, :3] = Rf * ECH_MAIN; X[:3, 3] = poignet[c] + ECH_MAIN * (app2bl(f['p']) - Wm)
        else:
            X[:3, :3] = Rf; X[:3, 3] = app2bl(f['p'])
        o.matrix_world = Matrix(X.tolist())

# ---------------------------------------------------------------- studio
sc.render.engine = 'CYCLES'; sc.cycles.samples = ECH; sc.cycles.device = 'CPU'; sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = RES_L, RES_H; sc.render.film_transparent = False
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (*srgb('#eeeeec'), 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.35
sc.view_settings.view_transform = 'Standard'
sol = bpy.data.meshes.new('sol'); sol.from_pydata([(-4, -4, 0), (4, -4, 0), (4, 4, 0), (-4, 4, 0)], [], [(0, 1, 2, 3)])
so = bpy.data.objects.new('sol', sol); sc.collection.objects.link(so)
ms = bpy.data.materials.new('sol'); ms.use_nodes = True; ms.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*srgb('#eeeeec'), 1); sol.materials.append(ms)
so.is_shadow_catcher = True
for nom, loc, e, t in [('cle', (1.8, -3.2, 3.0), 260, 2.5), ('debouche', (-2.6, -2.0, 1.6), 110, 3), ('dos', (0.5, 3.0, 2.8), 160, 2), ('haut', (0, -0.5, 4.5), 80, 3)]:
    l = bpy.data.lights.new(nom, 'AREA'); l.energy = e; l.size = t; ob = bpy.data.objects.new(nom, l); sc.collection.objects.link(ob); ob.location = loc
    ob.rotation_euler = (Vector((0, 0, 1.0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
cam = bpy.data.cameras.new('c'); cam.lens = 85; cam.sensor_width = 36; cam.sensor_fit = 'HORIZONTAL'
co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
VUE = [float(x) for x in os.environ['VUE'].split(',')] if os.environ.get('VUE') else [MV['vue']['az'], MV['vue']['el']]
az, el = map(math.radians, VUE)
bmin, bmax = app2bl(MV['boite']['min']), app2bl(MV['boite']['max'])
lo, hi = np.minimum(bmin, bmax), np.maximum(bmin, bmax)
dirc = np.array([math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)])
cible = (lo + hi) / 2; cible[2] = (lo[2] + hi[2]) / 2
dr = unit(np.cross([0, 0, 1.0], dirc)); up = np.cross(dirc, dr)
tanx = 18 / 85; tany = tanx * RES_H / RES_L; MARGE = float(os.environ.get('MARGE', '1.05')); dist = 0
for cx in (lo[0], hi[0]):
    for cy in (lo[1], hi[1]):
        for cz in (lo[2], hi[2]):
            q = np.array([cx, cy, cz]) - cible
            dist = max(dist, abs(q @ dr) * MARGE / tanx + q @ dirc, abs(q @ up) * MARGE / tany + q @ dirc)
if os.environ.get('ZOOM'):
    zx, zz, zd = [float(x) for x in os.environ['ZOOM'].split(',')]; cible = np.array([zx, 0, zz]); dist = zd
co.location = Vector(cible + dirc * dist); co.rotation_euler = (Vector(cible) - co.location).to_track_quat('-Z', 'Y').to_euler()
a, b = (IMAGES.split('-') + [None])[:2]
liste = range(int(a), int(b) + 1) if b else [int(x) for x in IMAGES.split(',')]
for i in liste:
    placer(i); sc.render.filepath = os.path.join(SORTIE, 'f%03d.png' % i); bpy.ops.render.render(write_still=True)
    print('image', i, flush=True)

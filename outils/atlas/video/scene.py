# Vidéo d'un exercice, étape 2 : le corps anatomique de l'atlas en pleine résolution, posé image par image comme
# le moteur de l'appli le pose (quaternions duaux, part « par la corde »), rendu par Cycles en studio.
# python scene.py <export.bin> <dossier de sortie> <images : "35" ou "0-69" ou "0,17,35"> [résolution] [échantillons]
# (Python avec le module bpy de Blender 5.) Réglages : EXPO (exposition), CAM="x,y,z,cible x,y,z,focale" (repère Blender).
import bpy, sys, os, json, struct, math
import numpy as np
from mathutils import Matrix, Vector, Quaternion

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
SRC, SORTIE, IMAGES = args[0], args[1], args[2]
RES = int(args[3]) if len(args) > 3 else 540
ECH = int(args[4]) if len(args) > 4 else 32
os.makedirs(SORTIE, exist_ok=True)

# ---------- Lecture de l'export ----------
raw = open(SRC, 'rb').read()
n = struct.unpack_from('<I', raw, 0)[0]
H = json.loads(raw[4:4 + n].decode('utf-8'))
B0 = 4 + n
def tab(off, dt, cnt): return np.frombuffer(raw, dtype=dt, count=cnt, offset=B0 + off)
NB = len(H['squelette'])
JUMEAU = np.array([a['jumeau'] for a in H['squelette']], dtype=np.int64)
DQ = tab(H['DQ'], np.float32, H['images'] * NB * 8).reshape(H['images'], NB, 8).astype(np.float64)

# Les muscles qui travaillent (données de l'appli : biceps en principal, avant-bras en secondaire).
PRINCIPAUX = {'biceps_court', 'biceps_long', 'brachial'}
SECONDAIRES = {'brachio_radial', 'rond_pronateur_humeral', 'rond_pronateur_ulnaire', 'flechisseur_radial_carpe', 'long_palmaire',
               'flechisseur_superficiel_doigts_humero_ulnaire', 'flechisseur_superficiel_doigts_radial',
               'flechisseur_ulnaire_carpe_humeral', 'flechisseur_ulnaire_carpe_ulnaire'}

def app_vers_blender(P):  # (x, y, z) de l'appli -> (x, -z, y) de Blender
    return np.stack([P[:, 0], -P[:, 2], P[:, 1]], axis=1)

# ---------- Les pièces, rangées par matière ----------
groupes = {'chair': [], 'rouge1': [], 'rouge2': [], 'os': [], 'peau': []}
for p in H['pieces']:
    if p['type'] == 'aponevrose':
        continue
    g = 'peau' if p['type'] == 'peau' else 'os' if p['type'] == 'os' else 'rouge1' if p['nom'] in PRINCIPAUX else 'rouge2' if p['nom'] in SECONDAIRES else 'chair'
    groupes[g].append(p)

def fibres(P, T, tendon):
    """Direction des fibres en chaque sommet : vers le point où les fibres convergent (le tendon le plus ramassé)."""
    tv = np.zeros(len(P), bool)
    if tendon.any():
        tv[T.reshape(-1, 3)[tendon.astype(bool)].ravel()] = True
    c = P.mean(0); U, S, Vt = np.linalg.svd(P - c, full_matrices=False); axe = Vt[0]
    if tv.sum() > 8:
        s = (P[tv] - c) @ axe; a, b = P[tv][s < np.median(s)], P[tv][s >= np.median(s)]
        if len(a) and len(b):
            ca, cb = a.mean(0), b.mean(0)
            conv = ca if np.linalg.norm(a - ca, axis=1).mean() < np.linalg.norm(b - cb, axis=1).mean() else cb
            d = conv - P; l = np.linalg.norm(d, axis=1, keepdims=True)
            d = np.where(l > 1e-6, d / np.maximum(l, 1e-6), axe)
            return d
    return np.repeat(axe[None, :], len(P), 0)

class Groupe:
    pass

objets = {}
for nom, liste in groupes.items():
    Ps, Ts, Ms, Js, Ws, Cs, Fs, cotes = [], [], [], [], [], [], [], []
    v0 = 0
    for p in liste:
        P = tab(p['P'], np.float32, p['nv'] * 3).reshape(-1, 3).astype(np.float64)
        T = tab(p['T'], np.uint32, p['nt'] * 3).reshape(-1, 3).astype(np.int64)
        ten = tab(p['tendon'], np.uint8, p['nt'])
        J = tab(p['J'], np.uint8, p['nv'] * 4).reshape(-1, 4).astype(np.int64)
        W = tab(p['W'], np.float32, p['nv'] * 4).reshape(-1, 4).astype(np.float64)
        C = tab(p['C'], np.float32, p['nv']).astype(np.float64)
        F = fibres(P, T, ten) if p['type'] not in ('os', 'peau') else np.zeros_like(P)
        for cote in ([0, 1] if p['pair'] else [0]):
            Pc, Fc, Jc = P.copy(), F.copy(), J.copy()
            if cote:
                Pc[:, 0] *= -1; Fc[:, 0] *= -1; Jc = JUMEAU[J]
            Ps.append(Pc); Fs.append(Fc); Js.append(Jc); Ws.append(W); Cs.append(C)
            Ts.append((T[:, [0, 2, 1]] if cote else T) + v0); Ms.append(ten)
            v0 += len(P)
    if not Ps:
        continue
    G = Groupe()
    G.P = np.concatenate(Ps); G.T = np.concatenate(Ts); G.M = np.concatenate(Ms); G.J = np.concatenate(Js)
    G.W = np.concatenate(Ws); G.C = np.concatenate(Cs); G.F = np.concatenate(Fs)
    if nom != 'peau':
        DOIGTS = np.array([a['nom'].startswith('doigt') for a in H['squelette']])
        wd = (G.W * DOIGTS[G.J]).sum(1) / np.maximum(G.W.sum(1), 1e-9)
        garde = ~(wd[G.T] > 0.5).all(1)
        print(nom, 'chair des doigts cachée :', int((~garde).sum()), 'triangles', flush=True)
        G.T = G.T[garde]; G.M = G.M[garde]
    if nom == 'rouge1':
        # normales au repos, pondérées par l'aire
        Pn = G.P; Tn = G.T; fn = np.cross(Pn[Tn[:, 1]] - Pn[Tn[:, 0]], Pn[Tn[:, 2]] - Pn[Tn[:, 0]])
        Nn = np.zeros_like(Pn)
        for k in range(3): np.add.at(Nn, Tn[:, k], fn)
        Nn /= np.maximum(np.linalg.norm(Nn, axis=1, keepdims=True), 1e-12)
        ten_v = np.zeros(len(Pn)); cnt = np.zeros(len(Pn))
        for k in range(3): np.add.at(ten_v, Tn[:, k], G.M.astype(float)); np.add.at(cnt, Tn[:, k], 1)
        chair_v = 1 - ten_v / np.maximum(cnt, 1)
        prof = np.zeros(len(Pn)); dep = 0
        for p in liste:
            for cote in ([0, 1] if p['pair'] else [0]):
                sl = slice(dep, dep + p['nv']); X = Pn[sl]; c = X.mean(0)
                U_, S_, Vt = np.linalg.svd(X - c, full_matrices=False); t = (X - c) @ Vt[0]
                t = (t - t.min()) / max(t.max() - t.min(), 1e-9)
                prof[sl] = np.sin(np.pi * t) ** 1.6 * (1.0 if p['nom'].startswith('biceps') else 0.55)
                dep += p['nv']
        G.gonfle = Nn * (prof * chair_v)[:, None] * 0.0065
    objets[nom] = G
    print(nom, len(G.P), 'sommets', len(G.T), 'triangles', flush=True)

def poser(G, dq, u=0.0):
    """Le programme des sommets du moteur, sur le processeur : mélange en quaternions duaux, puis part par la corde."""
    P0, J, W = (G.P + G.gonfle * u if hasattr(G, 'gonfle') else G.P), G.J, G.W
    R = dq[J, 0:4]; D = dq[J, 4:8]
    qr = (W[..., None] * R).sum(1); qd = (W[..., None] * D).sum(1)
    l = 1.0 / np.maximum(np.linalg.norm(qr, axis=1), 1e-9)
    qr *= l[:, None]; qd *= l[:, None]
    v, w = qr[:, :3], qr[:, 3:4]
    p = P0 + 2 * np.cross(v, np.cross(v, P0) + w * P0) + 2 * (w * qd[:, :3] - qd[:, 3:4] * v + np.cross(v, qd[:, :3]))
    m = G.C > 0
    if m.any():
        pc = np.zeros((m.sum(), 3)); wt = W[m].sum(1)
        for k in range(4):
            r, d, x = R[m, k], D[m, k], P0[m]
            vv, ww = r[:, :3], r[:, 3:4]
            pk = x + 2 * np.cross(vv, np.cross(vv, x) + ww * x) + 2 * (ww * d[:, :3] - d[:, 3:4] * vv + np.cross(vv, d[:, :3]))
            pc += W[m, k][:, None] * pk
        pc /= np.maximum(wt, 1e-9)[:, None]
        c = G.C[m][:, None]
        p[m] = p[m] * (1 - c) + pc * c
    return p

# ---------- La scène ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def mat_corps(nom, couleur, sss=(1.0, 0.45, 0.3), rough=0.46, coat=0.08, fibre=0.12, tendon=False):
    m = bpy.data.materials.new(nom); m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; L = nt.links
    bs = N['Principled BSDF']
    bs.inputs['Base Color'].default_value = (*couleur, 1)
    bs.inputs['Roughness'].default_value = rough
    bs.inputs['Subsurface Weight'].default_value = 0.0 if tendon else 0.22
    bs.inputs['Subsurface Radius'].default_value = sss
    bs.inputs['Subsurface Scale'].default_value = 0.006
    bs.inputs['Coat Weight'].default_value = coat
    bs.inputs['Coat Roughness'].default_value = 0.3
    bs.inputs['Specular IOR Level'].default_value = 0.55 if tendon else 0.45
    # Relief des fibres : un bruit étiré le long de la direction des fibres (attribut), sur la position au repos.
    rep = N.new('ShaderNodeAttribute'); rep.attribute_name = 'repos'
    fib = N.new('ShaderNodeAttribute'); fib.attribute_name = 'fibre'
    dot = N.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
    L.new(rep.outputs['Vector'], dot.inputs[0]); L.new(fib.outputs['Vector'], dot.inputs[1])
    sca = N.new('ShaderNodeVectorMath'); sca.operation = 'SCALE'
    L.new(fib.outputs['Vector'], sca.inputs[0]); L.new(dot.outputs['Value'], sca.inputs['Scale'])
    perp = N.new('ShaderNodeVectorMath'); perp.operation = 'SUBTRACT'
    L.new(rep.outputs['Vector'], perp.inputs[0]); L.new(sca.outputs['Vector'], perp.inputs[1])
    k1 = N.new('ShaderNodeVectorMath'); k1.operation = 'SCALE'; k1.inputs['Scale'].default_value = 1400.0 if tendon else 900.0
    L.new(perp.outputs['Vector'], k1.inputs[0])
    k2 = N.new('ShaderNodeVectorMath'); k2.operation = 'SCALE'; k2.inputs['Scale'].default_value = 40.0
    L.new(sca.outputs['Vector'], k2.inputs[0])
    som = N.new('ShaderNodeVectorMath'); som.operation = 'ADD'
    L.new(k1.outputs['Vector'], som.inputs[0]); L.new(k2.outputs['Vector'], som.inputs[1])
    bruit = N.new('ShaderNodeTexNoise'); bruit.inputs['Scale'].default_value = 1.0; bruit.inputs['Detail'].default_value = 3.0; bruit.inputs['Roughness'].default_value = 0.55
    L.new(som.outputs['Vector'], bruit.inputs['Vector'])
    # Un relief plus large, qui casse l'uniformité de la surface.
    larges = N.new('ShaderNodeTexNoise'); larges.inputs['Scale'].default_value = 60.0; larges.inputs['Detail'].default_value = 2.0
    L.new(rep.outputs['Vector'], larges.inputs['Vector'])
    mixf = N.new('ShaderNodeMath'); mixf.operation = 'MULTIPLY_ADD'; mixf.inputs[1].default_value = 0.35
    L.new(larges.outputs['Fac'], mixf.inputs[0]); L.new(bruit.outputs['Fac'], mixf.inputs[2])
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = fibre; bump.inputs['Distance'].default_value = 0.0006
    L.new(mixf.outputs['Value'], bump.inputs['Height']); L.new(bump.outputs['Normal'], bs.inputs['Normal'])
    # Les creux plus sombres (occlusion ambiante) : le modelé des sillons entre les muscles.
    ao = N.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.025; ao.samples = 8
    ramp = N.new('ShaderNodeMapRange'); ramp.inputs['To Min'].default_value = 0.38; ramp.inputs['To Max'].default_value = 1.0
    L.new(ao.outputs['AO'], ramp.inputs['Value'])
    comb = N.new('ShaderNodeCombineXYZ')
    for k in range(3): L.new(ramp.outputs['Result'], comb.inputs[k])
    mul = N.new('ShaderNodeVectorMath'); mul.operation = 'MULTIPLY'; mul.inputs[0].default_value = couleur
    L.new(comb.outputs['Vector'], mul.inputs[1])
    L.new(mul.outputs['Vector'], bs.inputs['Base Color'])
    return m

def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

M_CHAIR = mat_corps('chair', srgb('#a9a49d'), fibre=0.2)
M_ROUGE1 = mat_corps('rouge1', srgb('#a50f16'), sss=(1.0, 0.25, 0.2), fibre=0.2)
M_ROUGE2 = mat_corps('rouge2', srgb('#c9493d'), sss=(1.0, 0.35, 0.25), fibre=0.2)
M_TENDON = mat_corps('tendon', srgb('#cfcac0'), rough=0.33, coat=0.2, fibre=0.06, tendon=True)
M_PEAU = mat_corps('peau', srgb('#aaa59e'), rough=0.5, coat=0.05, fibre=0.015)
M_ONGLE = mat_corps('ongle', srgb('#b9b4ac'), rough=0.3, coat=0.4, fibre=0.01, tendon=True)
M_OS = mat_corps('os', srgb('#c4bdb0'), rough=0.6, coat=0.0, fibre=0.02, tendon=True)

maillages = {}
for nom, G in objets.items():
    me = bpy.data.meshes.new(nom)
    Pb = app_vers_blender(G.P)
    me.vertices.add(len(Pb)); me.vertices.foreach_set('co', Pb.astype(np.float32).ravel())
    nt = len(G.T)
    me.loops.add(nt * 3); me.loops.foreach_set('vertex_index', G.T.astype(np.int32).ravel())
    me.polygons.add(nt); me.polygons.foreach_set('loop_start', np.arange(0, nt * 3, 3, dtype=np.int32)); me.polygons.foreach_set('loop_total', np.full(nt, 3, np.int32))
    me.polygons.foreach_set('use_smooth', np.ones(nt, bool))
    me.polygons.foreach_set('material_index', G.M.astype(np.int32) if nom != 'os' else np.zeros(nt, np.int32))
    me.update(calc_edges=True); me.validate(clean_customdata=False)
    a = me.attributes.new('repos', 'FLOAT_VECTOR', 'POINT'); a.data.foreach_set('vector', Pb.astype(np.float32).ravel())
    f = me.attributes.new('fibre', 'FLOAT_VECTOR', 'POINT'); f.data.foreach_set('vector', app_vers_blender(G.F).astype(np.float32).ravel())
    ob = bpy.data.objects.new(nom, me); sc.collection.objects.link(ob)
    base = {'chair': M_CHAIR, 'rouge1': M_ROUGE1, 'rouge2': M_ROUGE2, 'os': M_OS, 'peau': M_PEAU}[nom]
    me.materials.append(base); me.materials.append(M_TENDON if nom not in ('os', 'peau') else M_OS if nom == 'os' else M_ONGLE)
    if nom == 'peau':
        sub = ob.modifiers.new('lisse', 'SUBSURF'); sub.levels = 1; sub.render_levels = 2
    maillages[nom] = me

# ---------- Les haltères : poignée moletée, bagues, têtes hexagonales caoutchoutées ----------
def mat_simple(nom, couleur, metal=0.0, rough=0.5, coat=0.0):
    m = bpy.data.materials.new(nom); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*couleur, 1); b.inputs['Metallic'].default_value = metal; b.inputs['Roughness'].default_value = rough
    b.inputs['Coat Weight'].default_value = coat
    return m
M_CHROME = mat_simple('chrome', (0.86, 0.87, 0.88), metal=1.0, rough=0.16)
M_ACIER = mat_simple('acier', (0.62, 0.63, 0.64), metal=1.0, rough=0.32)
M_CAOUTCHOUC = mat_simple('caoutchouc', (0.018, 0.018, 0.02), rough=0.62, coat=0.05)
# Moletage : un losange fin sur la poignée (coordonnées de l'objet, axe y).
def moleter(m):
    N = m.node_tree.nodes; L = m.node_tree.links; b = N['Principled BSDF']
    tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], sep.inputs[0])
    ang = N.new('ShaderNodeMath'); ang.operation = 'ARCTAN2'; L.new(sep.outputs['Z'], ang.inputs[0]); L.new(sep.outputs['X'], ang.inputs[1])
    s = N.new('ShaderNodeMath'); s.operation = 'MULTIPLY'; s.inputs[1].default_value = 0.0155; L.new(ang.outputs[0], s.inputs[0])
    out = []
    for sg in (1, -1):
        y = N.new('ShaderNodeMath'); y.operation = 'MULTIPLY'; y.inputs[1].default_value = sg; L.new(sep.outputs['Y'], y.inputs[0])
        a = N.new('ShaderNodeMath'); a.operation = 'ADD'; L.new(s.outputs[0], a.inputs[0]); L.new(y.outputs[0], a.inputs[1])
        k = N.new('ShaderNodeMath'); k.operation = 'MULTIPLY'; k.inputs[1].default_value = 1100.0; L.new(a.outputs[0], k.inputs[0])
        si = N.new('ShaderNodeMath'); si.operation = 'SINE'; L.new(k.outputs[0], si.inputs[0])
        ab = N.new('ShaderNodeMath'); ab.operation = 'ABSOLUTE'; L.new(si.outputs[0], ab.inputs[0]); out.append(ab)
    mm = N.new('ShaderNodeMath'); mm.operation = 'MINIMUM'; L.new(out[0].outputs[0], mm.inputs[0]); L.new(out[1].outputs[0], mm.inputs[1])
    # seulement sur la partie tenue (|y| < 43 mm)
    ay = N.new('ShaderNodeMath'); ay.operation = 'ABSOLUTE'; L.new(sep.outputs['Y'], ay.inputs[0])
    lt = N.new('ShaderNodeMath'); lt.operation = 'LESS_THAN'; lt.inputs[1].default_value = 0.043; L.new(ay.outputs[0], lt.inputs[0])
    h = N.new('ShaderNodeMath'); h.operation = 'MULTIPLY'; L.new(mm.outputs[0], h.inputs[0]); L.new(lt.outputs[0], h.inputs[1])
    bp = N.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = 0.55; bp.inputs['Distance'].default_value = 0.0004
    L.new(h.outputs[0], bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
    rr = N.new('ShaderNodeMapRange'); rr.inputs['To Min'].default_value = 0.16; rr.inputs['To Max'].default_value = 0.42
    L.new(h.outputs[0], rr.inputs['Value']); L.new(rr.outputs['Result'], b.inputs['Roughness'])
moleter(M_CHROME)

def cylindre(nom, r, lg, y, mat, cotes=48, biseau=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=cotes, radius=r, depth=lg, location=(0, y, 0), rotation=(math.pi / 2, 0, 0))
    o = bpy.context.active_object; o.name = nom; o.data.materials.append(mat)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
    if biseau:
        bv = o.modifiers.new('biseau', 'BEVEL'); bv.width = biseau; bv.segments = 3; bv.limit_method = 'ANGLE'; bv.harden_normals = True
    return o

def haltere(nom):
    parties = [cylindre(nom + '_barre', 0.0150, 0.140, 0, M_CHROME, 64), cylindre(nom + '_poignee', 0.0158, 0.086, 0, M_CHROME, 64)]
    for s in (1, -1):
        parties.append(cylindre(nom + '_bague', 0.024, 0.012, s * 0.049, M_CHROME, 48, 0.0015))
        tete = cylindre(nom + '_tete', 0.062, 0.070, s * 0.090, M_CAOUTCHOUC, 6, 0.006)
        tete.rotation_euler = (math.pi / 2, 0, math.pi / 6)
        parties.append(tete)
        parties.append(cylindre(nom + '_embout', 0.030, 0.004, s * 0.1265, M_ACIER, 48, 0.001))
    racine = bpy.data.objects.new(nom, None); sc.collection.objects.link(racine)
    for o in parties:
        o.parent = racine
    return racine

HALTERES = [haltere('haltere_G'), haltere('haltere_D')]
B = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], dtype=np.float64)
def placer_halteres(f):
    poignees = [m for m in H['materiel'][f] if m['forme'] == 'cylindre' and abs(m['s'][1] - 0.14) < 1e-3]
    for o, m in zip(HALTERES, poignees):
        q = Quaternion((m['q'][3], m['q'][0], m['q'][1], m['q'][2])).to_matrix()
        R = B @ np.array(q)
        p = B @ np.array(m['p'])
        M4 = Matrix.Identity(4)
        for i in range(3):
            for j in range(3): M4[i][j] = R[i, j]
            M4[i][3] = p[i]
        o.matrix_world = M4

# ---------- Studio : cyclorama sombre, lumières douces, contre-jours ----------
def cyclo():
    bpy.ops.mesh.primitive_plane_add(size=1)
    o = bpy.context.active_object; o.name = 'cyclo'
    me = o.data
    import bmesh
    bm = bmesh.new()
    pts = []
    for i in range(40):
        t = i / 39
        if t < 0.6: y, z = -6 + t / 0.6 * 9.0, 0.0
        else:
            a = (t - 0.6) / 0.4 * (math.pi / 2); y, z = 3.0 + 1.6 * math.sin(a), 1.6 * (1 - math.cos(a))
        pts.append((y, z))
    pts.append((4.6, 8.0))
    rows = []
    for (y, z) in pts:
        rows.append([bm.verts.new((x, y, z)) for x in (-8.0, 8.0)])
    for a, b in zip(rows, rows[1:]):
        bm.faces.new((a[0], a[1], b[1], b[0]))
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    m = mat_simple('fond', srgb('#0c0d10'), rough=0.42)
    me.materials.append(m)
    return o
cy = cyclo()
cy.is_shadow_catcher = True
sc.render.film_transparent = True

def lampe(nom, typ, loc, cible, energie, taille=(1, 1), couleur=(1, 1, 1)):
    l = bpy.data.lights.new(nom, typ); l.energy = energie; l.color = couleur
    if typ == 'AREA':
        l.shape = 'RECTANGLE'; l.size, l.size_y = taille
    o = bpy.data.objects.new(nom, l); sc.collection.objects.link(o); o.location = loc
    d = Vector(cible) - Vector(loc); o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return o
lampe('principale', 'AREA', (-2.6, -1.9, 3.4), (0, 0, 1.15), 900, (1.3, 1.3), (1.0, 0.96, 0.91)).data.spread = math.radians(70)
lampe('debouchage', 'AREA', (3.0, -2.8, 1.5), (0, 0, 1.0), 70, (2.2, 2.2), (0.88, 0.94, 1.0)).data.spread = math.radians(60)
lampe('contre_g', 'AREA', (2.3, 2.1, 2.3), (0, 0, 1.1), 1100, (0.3, 2.6), (0.9, 0.95, 1.0)).data.spread = math.radians(45)
lampe('contre_d', 'AREA', (-2.4, 1.9, 2.1), (0, 0, 1.1), 950, (0.3, 2.6), (0.95, 0.97, 1.0)).data.spread = math.radians(45)
lampe('dessus', 'AREA', (0.2, -0.3, 3.6), (0, 0, 1.2), 160, (1.0, 1.0)).data.spread = math.radians(50)
w = bpy.data.worlds.new('monde'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.006, 0.0065, 0.008, 1)

cam = bpy.data.cameras.new('cam'); cam.lens = 78; cam.sensor_width = 36
co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
co.location = (2.05, -3.95, 1.28)
d = Vector((0.0, 0.0, 0.93)) - co.location; co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
if os.environ.get('CAM'):
    c = [float(x) for x in os.environ['CAM'].split(',')]
    co.location = c[:3]; d = Vector(c[3:6]) - co.location; co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); cam.lens = c[6]

# ---------- Rendu ----------
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = ECH
sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = 0.03
sc.cycles.use_denoising = True
try: sc.cycles.denoiser = 'OPENIMAGEDENOISE'
except Exception: pass
sc.cycles.max_bounces = 6; sc.cycles.diffuse_bounces = 3; sc.cycles.glossy_bounces = 3; sc.cycles.transmission_bounces = 2
sc.render.resolution_x = RES; sc.render.resolution_y = RES; sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'AgX'
try: sc.view_settings.look = 'AgX - Medium High Contrast'
except Exception: pass
sc.render.threads_mode = 'FIXED'; sc.render.threads = 4
sc.view_settings.exposure = float(os.environ.get('EXPO', '-3.3'))

def appliquer(f):
    dq = DQ[f]
    for nom, G in objets.items():
        Pp = app_vers_blender(poser(G, dq, H['U'][f])).astype(np.float32)
        me = maillages[nom]
        me.vertices.foreach_set('co', Pp.ravel()); me.update()
    placer_halteres(f)

def liste(s):
    if '-' in s: a, b = map(int, s.split('-')); return list(range(a, b + 1))
    return [int(x) for x in s.split(',')]

import time
for f in liste(IMAGES):
    t = time.time(); appliquer(f)
    sc.render.filepath = os.path.join(SORTIE, f'f{f:03d}.png')
    bpy.ops.render.render(write_still=True)
    print(f'image {f} : {time.time() - t:.1f} s', flush=True)

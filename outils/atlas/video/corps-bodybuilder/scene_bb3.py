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
if os.environ.get('ATHLETE'):
    # Physique d'athlète : chaque partie resserrée vers son os (bras, cuisses, trapèzes, cou plus que le tronc),
    # puis les séparations des muscles creusées (relief accentué par rapport à une version lissée).
    ech = {'bras': 0.80, 'avbras': 0.87, 'clav': 0.84, 'cou': 0.80, 'poitrine': 0.92, 'dos': 0.95, 'bassin': 0.97, 'cuisse': 0.85, 'jambe': 0.90, 'pied': 1.0}
    for _kv in filter(None, os.environ.get('ECH_SEGS', '').split(',')): ech[_kv.split(':')[0]] = float(_kv.split(':')[1])
    k_ath = float(os.environ['ATHLETE'])
    segs = []
    for c, sg in (('G', 1), ('D', -1)):
        segs += [((0.205 * sg, 0.06, 1.588), (0.45 * sg, 0.062, 1.59), 'bras'), ((0.45 * sg, 0.062, 1.59), (0.745 * sg, 0.03, 1.598), 'avbras'),
                 ((0.03 * sg, 0.04, 1.58), (0.205 * sg, 0.06, 1.588), 'clav'), ((0.10 * sg, 0.0, 0.95), (0.15 * sg, -0.005, 0.56), 'cuisse'),
                 ((0.15 * sg, -0.005, 0.56), (0.175 * sg, 0.03, 0.09), 'jambe'), ((0.175 * sg, 0.03, 0.09), (0.19 * sg, -0.12, 0.02), 'pied')]
    segs += [((0, 0.0, 0.92), (0, 0.0, 1.12), 'bassin'), ((0, 0.0, 1.12), (0, 0.01, 1.40), 'dos'), ((0, 0.01, 1.40), (0, 0.02, 1.62), 'poitrine'), ((0, 0.03, 1.62), (0, 0.05, 1.80), 'cou')]
    cible = np.zeros_like(V0); poids = np.zeros(len(V0)); dist = []
    for h, t, n in segs:
        h, t = np.array(h), np.array(t); d = t - h; u = np.clip(((V0 - h) @ d) / (d @ d), 0, 1)
        P = h + u[:, None] * d; r = np.linalg.norm(V0 - P, axis=1); dist.append(r)
    dist = np.array(dist); dmin = dist.min(0)
    for (h, t, n), r in zip(segs, dist):
        w = np.exp(-(r - dmin) / 0.025)
        h, t = np.array(h), np.array(t); d = t - h; u = np.clip(((V0 - h) @ d) / (d @ d), 0, 1); P = h + u[:, None] * d
        sk = 1 - k_ath * (1 - ech[n])
        if n == 'jambe': sk = sk * (1 - float(os.environ.get('CHEVILLE', '0.22')) * np.clip((u - 0.72) / 0.28, 0, 1) ** 1.3)
        if n == 'avbras': sk = sk * (1 - float(os.environ.get('POIGNET', '0.16')) * np.clip((u - 0.6) / 0.4, 0, 1) ** 1.5)[:, None] if np.ndim(sk) else sk * (1 - float(os.environ.get('POIGNET', '0.16')) * np.clip((u - 0.6) / 0.4, 0, 1) ** 1.5)
        sk = np.reshape(sk, (-1, 1)) if np.ndim(sk) else sk
        cible += w[:, None] * (P + (V0 - P) * sk); poids += w
    V1 = cible / poids[:, None]
    # relief : accentue l'écart à une version lissée du maillage
    ed_ = np.array([e.vertices[:] for e in corps.data.edges]); dg_ = np.bincount(ed_.ravel(), minlength=len(V1)).clip(1)
    L_ = V1.copy()
    for _ in range(12):
        s_ = np.zeros_like(L_); np.add.at(s_, ed_[:, 0], L_[ed_[:, 1]]); np.add.at(s_, ed_[:, 1], L_[ed_[:, 0]]); L_ = 0.5 * L_ + 0.5 * s_ / dg_[:, None]
    V1 = V1 + float(os.environ.get('RELIEF', '0.6')) * (V1 - L_)
    corps.data.vertices.foreach_set('co', V1.ravel()); corps.data.update(); V0 = V1
    if os.environ.get('DUMP'): np.save(os.environ['DUMP'], V1); raise SystemExit(0)


def rentrer_pieds(V1):
    # le bas de la jambe rentre en douceur dans le pied greffé (pas de coupe)
    zp = float(os.environ.get('Z_PIED', '0.13'))
    for sg in (1, -1):
        axe = np.array([0.175 * sg, 0.03])
        m = (V1[:, 0] * sg > 0.06) & (V1[:, 2] < zp + 0.05)
        f = np.clip((zp + 0.05 - V1[m, 2]) / 0.07, 0, 1); f = f * f * (3 - 2 * f) * float(os.environ.get('RENTRE', '0.62'))
        f = np.where(V1[m, 2] < zp - 0.005, 0.93, f)
        V1[m, :2] = axe + (V1[m, :2] - axe) * (1 - f)[:, None]
        V1[m, 2] = np.maximum(V1[m, 2], zp - 0.03)

    return V1

BRAS_PLUS = float(os.environ.get('BRAS_PLUS', '0'))
if BRAS_PLUS:
    axb = np.abs(V0[:, 0]); haut_b = V0[:, 2] > 1.30
    t_ = np.clip((axb - 0.26) / (0.42 - 0.26), 0, 1); t_ = t_ * t_ * (3 - 2 * t_)
    V0 = V0.copy(); V0[:, 0] += np.sign(V0[:, 0]) * BRAS_PLUS * t_ * haut_b
    corps.data.vertices.foreach_set('co', V0.ravel()); corps.data.update()
# ---------------------------------------------------------------- squelette (pose en croix du modèle)
J = {}
for c, s in (('G', 1), ('D', -1)):
    J['clav' + c] = ((0.03 * s, 0.03, 1.555), (0.205 * s, 0.06, 1.585))
    J['bras' + c] = ((0.205 * s, 0.06, 1.588), ((0.45 + BRAS_PLUS) * s, 0.062, 1.59))
    J['avbras' + c] = (((0.45 + BRAS_PLUS) * s, 0.062, 1.59), ((0.745 + BRAS_PLUS) * s, 0.03, 1.598))
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
if os.environ.get('ATHLETE') and (os.environ.get('RENTRER_PIEDS', '1') == '1' or os.environ.get('AMINCIR') == '1'):
    # (avec les pieds d'origine masqués, AMINCIR=1 garde seulement l'affinement du bas de jambe vers la cheville)
    V0 = rentrer_pieds(V0.copy()); corps.data.vertices.foreach_set('co', V0.ravel()); corps.data.update()
vides = sum(1 for v in corps.data.vertices if not v.groups)
print('peau liée : groupes', len(corps.vertex_groups), '| sommets sans os', vides, flush=True)
if vides > 200: raise SystemExit('ERREUR : la peau ne suit pas le squelette (liaison automatique échouée)')
for _m in corps.modifiers:
    if _m.type == 'ARMATURE': _m.use_deform_preserve_volume = os.environ.get('DQS') == '1'
if os.environ.get('LISSE_POIDS'):
    # poids adoucis autour de l'épaule : les os du haut du corps se partagent la peau plus progressivement
    fac, rep = [float(x) for x in os.environ['LISSE_POIDS'].split(',')]
    bpy.ops.object.select_all(action='DESELECT'); corps.select_set(True); bpy.context.view_layer.objects.active = corps
    bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
    for g in ('clavG', 'clavD', 'brasG', 'brasD', 'poitrine', 'cou', 'dos'):
        corps.vertex_groups.active_index = corps.vertex_groups[g].index
        bpy.ops.object.vertex_group_smooth(group_select_mode='ACTIVE', factor=fac, repeat=int(rep))
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    bpy.ops.object.mode_set(mode='OBJECT')
if float(os.environ.get('ARTIC', '0')) > 0:
    centres = []
    for sg in (1, -1):
        centres += [(0.205 * sg, 0.06, 1.588, float(os.environ.get('R_EPAULE', '0.07'))), ((0.45 + BRAS_PLUS) * sg, 0.062, 1.59, 0.06), ((0.745 + BRAS_PLUS) * sg, 0.03, 1.598, 0.035),
                    (0.10 * sg, 0.0, 0.95, 0.08), (0.15 * sg, -0.005, 0.56, 0.07), (0.175 * sg, 0.03, 0.12, 0.05)]
    wa = np.zeros(len(V0))
    for x, y, z, r in centres:
        d2 = ((V0 - np.array([x, y, z])) ** 2).sum(1); wa = np.maximum(wa, np.exp(-d2 / (r * r)))
    ga = corps.vertex_groups.new(name='articulations')
    for k in np.where(wa > 0.02)[0]: ga.add([int(k)], float(wa[k]), 'REPLACE')
    la = corps.modifiers.new('lisse_artic', 'CORRECTIVE_SMOOTH'); la.factor = 1.0; la.iterations = int(float(os.environ['ARTIC'])); la.vertex_group = 'articulations'
    la.use_only_smooth = False; la.smooth_type = 'LENGTH_WEIGHTED'; la.rest_source = 'ORCO'
lisse = corps.modifiers.new('lisse', 'CORRECTIVE_SMOOTH'); lisse.factor = 0.5; lisse.iterations = 6; lisse.use_only_smooth = False; lisse.smooth_type = 'LENGTH_WEIGHTED'; lisse.rest_source = 'ORCO'

if os.environ.get('SUBDIV', '0') != '0':
    sd = corps.modifiers.new('fin', 'SUBSURF'); sd.levels = 0; sd.render_levels = int(os.environ['SUBDIV'])
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
if os.environ.get('COULEURS') and os.environ.get('SANS_COULEUR') != '1':
    import json as _j
    Dm = np.load(os.environ['NPZ_MANNEQUIN']); ST = _j.loads(str(Dm['meta']))['structures']
    CC = _j.load(open(os.environ['COULEURS'])); cmap = CC['couleurs'].get(os.environ['QUOI'], {})
    hexv = lambda h: np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float)
    n0, a0 = hexv(CC['neutres']['muscle']), hexv(CC['accent'])
    force = np.zeros(len(ST) + 1)
    for s_ in ST:
        if s_['id'] in cmap: force[s_['i']] = float(np.clip(((hexv(cmap[s_['id']]) - n0) @ (a0 - n0)) / ((a0 - n0) @ (a0 - n0)), 0, 1))
    # trois teintes franches comme l'ancien mannequin : muscle visé (rouge), ses aides (orangé soutenu), secondaires (orangé clair)
    paliers = [tuple(float(x) for x in p.split(':')) for p in os.environ.get('NIVEAUX', '0.9:1,0.5:0.6,0.4:0.24').split(',')]
    f2 = np.zeros_like(force)
    for seuil, val in sorted(paliers): f2 = np.where(force >= seuil - 1e-6, val, f2)
    force = f2
    CA = np.load(os.environ['CARTE_MUSCLES']); mu, mu2 = CA['muscle'].astype(np.int64), CA['muscle2'].astype(np.int64)
    a1, a2 = force[mu], force[mu2]
    # un muscle du bras ne colore que la peau du bras (pas le creux de l'épaule)
    reg_bras = np.array([s_['region'] in ('bras', 'avant_bras') for s_ in ST] + [False])
    t_bras = np.clip((ax - 0.205) / (0.245 + BRAS_PLUS), 0, 2)
    gidx = {g.name: g.index for g in corps.vertex_groups}
    def poids(nom):
        w = np.zeros(len(V0))
        for v in corps.data.vertices:
            for g in v.groups:
                if g.group == gidx.get(nom): w[v.index] = g.weight
        return w
    pbras = (poids('brasG') + poids('brasD')) * (t_bras > 0.35) + poids('avbrasG') + poids('avbrasD')
    a1 = np.where(reg_bras[mu] & (pbras < 0.3), 0, a1); a2 = np.where(reg_bras[mu2] & (pbras < 0.3), 0, a2)
    # le report de carte déborde entre le bas du dos et les fessiers : chaque région reste à sa hauteur (corps au repos)
    reg_haut = np.array([s_['region'] in ('dos', 'thorax', 'epaule', 'abdomen') for s_ in ST] + [False])
    reg_bas = np.array([s_['region'] in ('bassin', 'cuisse') for s_ in ST] + [False])
    zr = V0[:, 2]
    for a_, m_ in ((a1, mu), (a2, mu2)):
        a_ *= 1 - reg_haut[m_] * np.clip((float(os.environ.get('Z_TAILLE', '1.17')) - zr) / 0.04, 0, 1) * (V0[:, 1] > -0.02)
        a_ *= 1 - reg_bas[m_] * np.clip((zr - 1.15) / 0.04, 0, 1)
    actif = np.maximum(a1, 0.6 * a2 * (a1 < 0.05) * (mu >= 0))
    zones = ['corps', 'tete', 'main', 'pied', 'ongle', 'poil', 'cheveux', 'oeil']
    zv = CA['zoneV'].astype(int); actif = np.where(np.isin(zv, [2, 3]), 0, actif)
    ed = np.array([e.vertices[:] for e in corps.data.edges]); deg = np.bincount(ed.ravel(), minlength=len(V0)).clip(1)
    for _ in range(4):
        s2 = np.zeros(len(V0)); np.add.at(s2, ed[:, 0], actif[ed[:, 1]]); np.add.at(s2, ed[:, 1], actif[ed[:, 0]]); actif = 0.5 * actif + 0.5 * s2 / deg
    rouge = np.where(actif > 0.08, actif, 0).astype(np.float32)
    if os.environ.get('DEBUG_ROUGE'):
        zz_ = V0[:, 2]; print('rouge z<1.0 :', int(((rouge > 0.1) & (zz_ < 1.0)).sum()), '| z des rouges du bas du dos', np.percentile(zz_[(rouge > 0.1) & (zz_ < 1.25) & (V0[:, 1] > 0)], [0, 10, 50]).round(3) if ((rouge > 0.1) & (zz_ < 1.25) & (V0[:, 1] > 0)).any() else '-', '| muscles :', sorted({ST[m]['id'] for m in mu[(rouge > 0.1) & (zz_ < 1.0)] if m >= 0})[:12], flush=True)
    print('muscles en couleur :', int((force > 0).sum()), 'structures,', int((rouge > 0.05).sum()), 'sommets', flush=True)
if os.environ.get('SANS_COULEUR') == '1': rouge = np.zeros(len(V0), np.float32)
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
rampe = N.new('ShaderNodeValToRGB'); el_ = rampe.color_ramp.elements
el_[0].position = 0.0; el_[0].color = (*ARGILE, 1); el_[1].position = 1.0; el_[1].color = (*ROUGE, 1)
e_m = el_.new(0.24); e_m.color = (*[0.7 * a + 0.3 * b for a, b in zip(ARGILE, srgb('#f5a070'))], 1); e_n = el_.new(0.6); e_n.color = (*srgb('#f58a4a'), 1)
L.new(at.outputs['Fac'], rampe.inputs['Fac'])
if float(os.environ.get('CREUX', '0')) > 0:
    ao = N.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.035; ao.samples = 8
    # creux calculés sur l'objet seul : plus de liseré sombre là où la jambe ou l'avant-bras rentre dans le pied ou la main greffés
    ao.only_local = os.environ.get('AO_LOCAL', '1') == '1'
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.2; mr.inputs['From Max'].default_value = 0.95
    mr.inputs['To Min'].default_value = 1 - float(os.environ['CREUX']); mr.inputs['To Max'].default_value = 1.0
    L.new(ao.outputs['AO'], mr.inputs['Value'])
    mul = N.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
    L.new(rampe.outputs['Color'], mul.inputs['A']); L.new(mr.outputs['Result'], mul.inputs['B']); L.new(mul.outputs['Result'], bs.inputs['Base Color'])
else:
    L.new(rampe.outputs['Color'], bs.inputs['Base Color'])
corps.data.materials.clear(); corps.data.materials.append(m)
mat_main = bpy.data.materials.new('main'); mat_main.use_nodes = True
mat_main.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*ARGILE, 1); mat_main.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.55
# mains et pieds greffés : même matière que le corps (même teinte, mêmes creux), pour que la jonction ne se voie pas
MAT_GREFFE = m if os.environ.get('GREFFE_MAT', 'corps') == 'corps' else mat_main
if os.environ.get('DEBUG_TEINTE'):
    MAT_GREFFE = bpy.data.materials.new('greffe_rouge'); MAT_GREFFE.use_nodes = True; MAT_GREFFE.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.8, 0.05, 0.02, 1)
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
pw0 = app2bl(MV['images'][0]['pw'])
ANCRE = os.environ.get('ANCRE', 'auto')
if ANCRE == 'auto':
    pieds_sol = all(min(app2bl(im['pw'])[ix['pied.G']][2], app2bl(im['pw'])[ix['pied.D']][2]) < 0.16 for im in MV['images'])
    bas_bassin = min(app2bl(im['pw'])[ix['bassin']][2] for im in MV['images'])
    pend = all(app2bl(im['pw'])[ix['main.G']][2] > app2bl(im['pw'])[ix['tete']][2] for im in MV['images'][:3]) and not pieds_sol
    debout = min(unit(app2bl(im['pw'])[ix['cou1']] - app2bl(im['pw'])[ix['bassin']])[2] for im in MV['images']) > 0.75
    ANCRE = 'mains' if pend else ('pieds' if pieds_sol and bas_bassin > 0.55 and debout else 'bassin')
print('ancrage :', ANCRE, flush=True)
ECH_MAIN = float(os.environ.get('ECH_MAIN', '1.05'))
COUTURE = os.environ.get('COUTURE', '1') == '1'
def bord_greffe(c, lim, pct):
    # anneau du bord (côté membre) de la pièce greffée, dans son repère ; axe = du centre de la pièce vers l'anneau
    T_ = H['tri_' + c]; L0 = (H['pos_' + c][0].astype(float) - H['poignet_' + c][0]) @ H['rot_' + c][0]
    ar = np.sort(np.concatenate([T_[:, [0, 1]], T_[:, [1, 2]], T_[:, [2, 0]]]), 1)
    u_, n_ = np.unique(ar, axis=0, return_counts=True); bord = np.unique(u_[n_ == 1])
    bord = bord[np.linalg.norm(L0[bord], axis=1) < lim]
    axe = unit(L0[bord].mean(0) - L0.mean(0)); h_ = L0 @ axe; h_cut = np.percentile(h_[bord], pct)
    return T_[(h_[T_] < h_cut).all(1)], axe, h_, h_cut
def voisinage(T_, n):
    import scipy.sparse as sp_
    e_ = np.concatenate([T_[:, [0, 1]], T_[:, [1, 2]], T_[:, [2, 0]]]); e_ = np.concatenate([e_, e_[:, ::-1]])
    A_ = sp_.csr_matrix((np.ones(len(e_)), (e_[:, 0], e_[:, 1])), shape=(n, n)); A_.data[:] = 1
    d_ = np.asarray(A_.sum(1)).ravel(); seuls = d_ == 0
    A_ = A_ + sp_.diags(seuls.astype(float)); d_[seuls] = 1   # sommets hors faces : immobiles
    return (sp_.diags(1 / d_) @ A_).tocsr()
def poids_bande(h_, h_cut, bande):
    t_ = np.clip((h_ - (h_cut - bande)) / bande, 0, 1); return t_ * t_ * (3 - 2 * t_)
# Couture : sur une bande au bord de la main (ou du pied), la pièce greffée épouse la surface réelle de l'avant-bras
# (ou de la jambe) déformé à chaque image, juste sous la peau. Le corps recouvre le bord de la pièce, puis la pièce
# ressort en pente douce : plus de marche, de lèvre ni de bord dentelé à la jonction.
COUT = {}; BV_CORPS = None; GARDES = None
_gn = {g.index: g.name for g in corps.vertex_groups}; _pg = {}
for _v in corps.data.vertices:
    for _g in _v.groups:
        _n = _gn[_g.group]
        if _n.startswith(('avbras', 'jambe', 'pied')): _pg.setdefault(_n, np.zeros(len(V0)))[_v.index] += _g.weight
def zone_corps(os_, rayon):
    pg_ = _pg.get(os_, np.zeros(len(V0)))
    if os_.startswith('jambe') and os.environ.get('RENTRER_PIEDS', '1') != '1': pg_ = pg_ + _pg.get('pied' + os_[-1], 0)   # bas de jambe jusqu'à la coupe
    bout = np.array(J[os_][1]); m_ = (pg_ > 0.5) & (np.linalg.norm(V0 - bout, axis=1) < rayon)
    if os_.startswith('jambe') and os.environ.get('RENTRER_PIEDS', '1') != '1': m_ &= V0[:, 2] >= float(os.environ.get('Z_PIED', '0.115'))
    return np.where(m_)[0]
def corps_evalue():
    dg_ = bpy.context.evaluated_depsgraph_get(); dg_.update(); e_ = corps.evaluated_get(dg_); m_ = e_.to_mesh()
    P_ = np.zeros(len(m_.vertices) * 3); m_.vertices.foreach_get('co', P_); e_.to_mesh_clear()
    Mw = np.array(corps.matrix_world); P_ = P_.reshape(-1, 3) @ Mw[:3, :3].T + Mw[:3, 3]
    if len(P_) == len(V0): return P_
    if GARDES is not None and len(P_) == len(GARDES):
        # pieds d'origine masqués : on remet chaque sommet gardé à son numéro (les masqués restent vides)
        Q_ = np.full((len(V0), 3), np.nan); Q_[GARDES] = P_; return Q_
    return None
def coudre(Gw, O, A, Bz, w, dbord, vois, delta, eps, bas=0.0):
    Bz = Bz[~np.isnan(Bz[:, 0])]
    sel = w > 1e-4
    if bas > 0 and len(Bz) >= 20:
        # au-delà de la bande, les sommets jusqu'au bout réel du membre suivent aussi (pied d'origine masqué)
        Qb0 = Bz - O; hb0 = np.percentile(Qb0 @ A, 1); sel = sel | ((Gw - O) @ A >= hb0 - bas)
    if os.environ.get('DEBUG_COUTURE'): print('couture entree', int(sel.sum()), len(Bz), flush=True)
    if not sel.any() or len(Bz) < 20: return Gw
    # axe centré sur le membre du corps (et non sur l'os, décentré dans la chair)
    Qb = Bz - O; hb_ = Qb @ A; mb = (hb_ > 0.01) & (hb_ < 0.06)
    if mb.sum() > 10: O = O + (Qb[mb] - np.outer(hb_[mb], A)).mean(0)
    e1 = unit(np.cross(A, [0, 0, 1.0]) if abs(A[2]) < 0.9 else np.cross(A, [1.0, 0, 0])); e2 = np.cross(A, e1)
    def cyl(P_): Q_ = P_ - O; return Q_ @ A, np.hypot(Q_ @ e1, Q_ @ e2), np.arctan2(Q_ @ e2, Q_ @ e1)
    hb, rb, tb = cyl(Bz); hg, rg, tg = cyl(Gw[sel]); wv = w[sel]; hn = hg + delta * wv
    NB, dh = int(os.environ.get('NB_COUTURE', '24')), float(os.environ.get('DH_COUTURE', '0.006')); h0 = hn.min() - dh; nh = int((hn.max() + 0.03 - h0) / dh) + 2
    ib = np.floor((hb - h0) / dh).astype(int); jb = np.floor((tb + np.pi) / (2 * np.pi) * NB).astype(int) % NB; ok = (ib >= 0) & (ib < nh)
    if os.environ.get('PROFIL_MAX'):
        G_ = np.full((nh, NB), -1.0); np.maximum.at(G_, (ib[ok], jb[ok]), rb[ok]); G_[G_ < 0] = np.nan
    else:
        # rayon moyen de la peau dans chaque case (le maximum surestime la surface et fait ressortir la pièce par endroits)
        S_ = np.zeros((nh, NB)); N_ = np.zeros((nh, NB)); np.add.at(S_, (ib[ok], jb[ok]), rb[ok]); np.add.at(N_, (ib[ok], jb[ok]), 1)
        G_ = np.where(N_ > 0, S_ / np.maximum(N_, 1), np.nan)
    ang = np.arange(NB) + 0.5
    for k in range(nh):
        v_ = ~np.isnan(G_[k])
        if v_.sum() >= NB // 3: G_[k] = np.interp(ang, ang[v_], G_[k][v_], period=NB)
        else: G_[k] = np.nan
    lignes = np.where(~np.isnan(G_[:, 0]))[0]; h_bout = h0 + dh * lignes.min() if len(lignes) else None
    pente = dh * math.tan(math.radians(float(os.environ.get('PENTE_COUTURE', '35'))))
    pente_bas = dh * math.tan(math.radians(float(os.environ.get('PENTE_BAS', '14'))))
    k_bout = (h_bout - h0) / dh if h_bout is not None else -1
    for k in range(nh - 2, -1, -1): G_[k] = np.fmax(G_[k], G_[k + 1] - (pente if k >= k_bout else pente_bas))   # vers le bout : on prolonge le membre en pente douce au lieu de suivre son bout arrondi
    val = ~np.isnan(G_[:, 0])
    if not val.any(): return Gw
    iv = np.where(val)[0]
    for k in range(nh):
        if not val[k]: G_[k] = G_[iv[np.argmin(np.abs(iv - k))]]
    fh = np.clip((hn - h0) / dh - 0.5, 0, nh - 1.001); k0 = fh.astype(int); ah = fh - k0
    ft = (tg + np.pi) / (2 * np.pi) * NB - 0.5; j0 = np.floor(ft).astype(int); at_ = ft - j0; j0 %= NB; j1 = (j0 + 1) % NB
    k1 = np.minimum(k0 + 1, nh - 1)
    if bas > 0 and h_bout is not None:
        # jusqu'au bout du membre, la pièce prolonge exactement le membre ; elle ne reprend sa forme qu'au-delà
        t_ = np.clip((hn - (h_bout - bas)) / bas, 0, 1); wv = np.maximum(wv, t_ * t_ * (3 - 2 * t_))
    # manchon : le bord de la pièce est rentré sous la peau, puis la pièce passe juste par-dessus la peau sur
    # quelques millimètres et recouvre tout le bout du membre (souvent irrégulier) ; l'entrée se fait en pente franche
    # (anneau net) au lieu d'un croisement rasant qui dessine un contour dentelé.
    t_ = np.clip(dbord[sel] / float(os.environ.get('MANCHON', '0.01')), 0, 1); t_ = t_ * t_ * (3 - 2 * t_)
    eps = (eps + float(os.environ.get('EPS_BORD', '0.002'))) * (1 - t_) - float(os.environ.get('DESSUS', '0.0012')) * t_
    env = (1 - ah) * ((1 - at_) * G_[k0, j0] + at_ * G_[k0, j1]) + ah * ((1 - at_) * G_[k1, j0] + at_ * G_[k1, j1])
    rp = np.full(len(hn), np.nan)
    if BV_CORPS is not None:
        # peau réellement visible : rayon depuis l'axe vers l'extérieur, en gardant les replis du bout du membre (6 mm au plus)
        Dr = np.outer(np.cos(tg), e1) + np.outer(np.sin(tg), e2); Pa = O + np.outer(hn, A)
        for k in range(len(hn)):
            d_ = Vector(Dr[k]); p_ = Vector(Pa[k]); loc, _, _, dd = BV_CORPS.ray_cast(p_, d_, 0.12)
            if loc is None: continue
            rr = dd
            for _ in range(3):
                loc2, _, _, d2 = BV_CORPS.ray_cast(loc + d_ * 1e-4, d_, 0.006)
                if loc2 is None: break
                rr += 1e-4 + d2; loc = loc2
            rp[k] = rr
    tocc = ~np.isnan(rp)
    # bord (t_≈0) : sur la peau vue par le rayon ; manchon (t_≈1) : par-dessus la peau et le prolongement du membre
    base = np.where(tocc, (1 - t_) * rp + t_ * np.fmax(rp, env), env)
    rt = base - eps
    if h_bout is not None:
        # au bout coupé du membre, un peu plus de marge : le bord de la peau ne perce pas la pièce
        rt = rt + float(os.environ.get('MARGE_BOUT', '0.002')) * np.exp(-((hn - h_bout - 0.004) / 0.01) ** 2)
    if h_bout is not None and os.environ.get('SANS_COL', '1') == '1':
        # sous le bout du membre : la pièce n'est jamais plus fine que le membre prolongé en pente douce (pas de « col »)
        sous = hn < h_bout; rt = np.where(sous, np.maximum(rg, rt), rt)
    rn = (1 - wv) * rg + wv * rt
    if os.environ.get('DEBUG_COUTURE'):
        print('  detail: h_bout', None if h_bout is None else round(h_bout, 3), 'hn', np.percentile(hn, [0, 50, 100]).round(3), 'wv>=.99', int((wv >= 0.99).sum()), 'touche', int(tocc.sum()), '/', len(hn), 'rt-rg mm', np.percentile((rt - rg)[wv > 0.5] * 1000, [10, 50, 90]).round(1) if (wv > 0.5).any() else '-', 'rp-env mm', np.nanpercentile((rp - env) * 1000, [10, 50, 90]).round(1) if tocc.any() else '-', flush=True)
    if os.environ.get('DEBUG_COUTURE'): print('couture', int(sel.sum()), len(Bz), 'h graft', hg.min().round(3), hg.max().round(3), 'h corps', hb.min().round(3), hb.max().round(3), 'rg', rg[wv > 0.9].mean().round(4) if (wv > 0.9).any() else '-', 'rt', rt[wv > 0.9].mean().round(4) if (wv > 0.9).any() else '-', flush=True)
    G2 = Gw.copy(); G2[sel] = O + np.outer(hn, A) + (np.outer(np.cos(tg), e1) + np.outer(np.sin(tg), e2)) * rn[:, None]
    # lissage (Taubin, sans rétrécir) de la zone de raccord : plus de plis ni de froissé hérités de la pièce ou de la peau
    it = int(os.environ.get('LISSE_COUTURE', '25'))
    if it and vois is not None:
        m_ = np.zeros(len(Gw)); m_[sel] = np.clip(wv * float(os.environ.get('FORCE_LISSE', '3')), 0, 1); m_ = m_[:, None]
        for _ in range(it):
            G2 = G2 + 0.5 * m_ * (vois @ G2 - G2); G2 = G2 - 0.53 * m_ * (vois @ G2 - G2)
    return G2
# mains greffées
mains = {}
for c in 'GD':
    me = bpy.data.meshes.new('main' + c); P = H['pos_' + c][0].astype(float); T_m = H['tri_' + c]
    if COUTURE:
        T_m, axe_m, h_m, hc_m = bord_greffe(c, 0.06, float(os.environ.get('COUPE_MAIN', '2')))
        COUT[c] = (axe_m, poids_bande(h_m, hc_m, float(os.environ.get('BANDE_MAIN', '0.03'))), zone_corps('avbras' + c, 0.12), hc_m - h_m, voisinage(T_m, len(P)))
    me.from_pydata([tuple(p) for p in P], [], [tuple(t) for t in T_m]); me.update()
    for f in me.polygons: f.use_smooth = True
    o = bpy.data.objects.new('main' + c, me); sc.collection.objects.link(o); me.materials.append(MAT_GREFFE); mains[c] = o
if os.environ.get('TETE') == 'anime':
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import tete_anime
    m_ch = bpy.data.materials.new('cheveux'); m_ch.use_nodes = True; m_ch.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.03, 0.028, 0.026, 1); m_ch.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.45
    m_oe = bpy.data.materials.new('yeux'); m_oe.use_nodes = True; m_oe.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.015, 0.015, 0.02, 1); m_oe.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.15
    m_re = bpy.data.materials.new('reflet'); m_re.use_nodes = True; m_re.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (1, 1, 1, 1); m_re.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 1.5; m_re.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = (1, 1, 1, 1)
    t_ = tete_anime.construire(mat_main, m_ch, m_oe, m_re, echelle=float(os.environ.get('ECH_TETE_A', '1.0')))
    Mt = t_.matrix_world.copy(); t_.parent = arm; t_.parent_type = 'BONE'; t_.parent_bone = 'cou'; bpy.context.view_layer.update(); t_.matrix_world = Mt
elif 'pos_T' in H.files and os.environ.get('TETE') != 'aucune':
    me = bpy.data.meshes.new('tete'); me.from_pydata([tuple(p) for p in H['pos_T'][0].astype(float)], [], [tuple(t) for t in H['tri_T']]); me.update()
    for f in me.polygons: f.use_smooth = True
    o = bpy.data.objects.new('tete', me); sc.collection.objects.link(o); mains['T'] = o
    zT = H['zoneV'][H['idx_T']]
    mat_ch = bpy.data.materials.new('cheveux'); mat_ch.use_nodes = True; mat_ch.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.05, 0.045, 0.04, 1)
    me.materials.append(mat_main); me.materials.append(mat_ch)
    for f in me.polygons: f.material_index = 1 if all(zT[i] in (5, 6) for i in f.vertices) else 0
ECH_TETE = float(os.environ.get('ECH_TETE', '1.08'))
ECH_PIED = float(os.environ.get('ECH_PIED', '1.08'))
if 'pos_PG' in H.files and os.environ.get('PIEDS', '1') == '1':
    COUPE_P = {}
    for c in ('PG', 'PD'):
        # Bord du pied greffé : coupé net en anneau au-dessus de la cheville (au lieu du bord dentelé du seuil de poids),
        # puis resserré vers l'axe de la jambe pour rentrer sous la peau de la jambe (plus de lèvre ni d'intérieur visible).
        T_ = H['tri_' + c]; L0 = (H['pos_' + c][0].astype(float) - H['poignet_' + c][0]) @ H['rot_' + c][0]
        ar = np.sort(np.concatenate([T_[:, [0, 1]], T_[:, [1, 2]], T_[:, [2, 0]]]), 1)
        u_, n_ = np.unique(ar, axis=0, return_counts=True); bord = np.unique(u_[n_ == 1])
        bord = bord[np.linalg.norm(L0[bord], axis=1) < 0.13]
        axe_p = unit(L0[bord].mean(0)); h_ = L0 @ axe_p
        h_cut = np.percentile(h_[bord], float(os.environ.get('COUPE_PIED', '15')))
        T_ = T_[(h_[T_] < h_cut).all(1)]
        t_ = np.clip((h_ - (h_cut - 0.035)) / 0.035, 0, 1); k_ = 1 - float(os.environ.get('SERRE_PIED', '0.22')) * t_ * t_
        COUPE_P[c] = (axe_p, k_)
        if COUTURE: COUT[c] = (axe_p, poids_bande(h_, h_cut, float(os.environ.get('BANDE_PIED', '0.035'))), zone_corps('jambe' + c[1], 0.16), h_cut - h_, voisinage(T_, len(L0)))
        me = bpy.data.meshes.new('pied' + c); me.from_pydata([tuple(p) for p in H['pos_' + c][0].astype(float)], [], [tuple(t) for t in T_]); me.update()
        for f in me.polygons: f.use_smooth = True
        o = bpy.data.objects.new('pied' + c, me); sc.collection.objects.link(o); me.materials.append(MAT_GREFFE); mains[c] = o
    gp = corps.vertex_groups.new(name='pieds_caches'); gi = {g.name: g.index for g in corps.vertex_groups}
    cache = np.where(V0[:, 2] < float(os.environ.get('Z_PIED', '0.115')))[0].tolist()
    gp.add(cache, 1.0, 'REPLACE')
    if os.environ.get('RENTRER_PIEDS', '1') != '1': mk = corps.modifiers.new('sans_pieds', 'MASK'); 
    if os.environ.get('RENTRER_PIEDS', '1') != '1': mk.vertex_group = 'pieds_caches'; mk.invert_vertex_group = True
    if os.environ.get('RENTRER_PIEDS', '1') != '1': GARDES = np.setdiff1d(np.arange(len(V0)), cache)
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

# Barres fixes (traction, muscle-up…) : le corps de l'appli est plus fin que ce corps-ci ; là où le mouvement fait
# frôler la barre (cuisses et bassin en haut du muscle-up), ce corps la traverserait. Le corps entier recule alors,
# image par image, juste de quoi rester devant la barre (les bras et les mains, qui la tiennent, ne comptent pas).
_bras = np.zeros(len(V0)); _gn = {g.index: g.name for g in corps.vertex_groups}
for _v in corps.data.vertices:
    for _g in _v.groups:
        if _gn[_g.group].startswith(('bras', 'avbras', 'clav')): _bras[_v.index] += _g.weight
HORS_BRAS = _bras < 0.3
def ecart_barres(im, pw, dec):
    # pour chaque barre fixe : le corps reste du côté où est son squelette (bassin, dos, cuisses le plus près de la
    # barre) ; on mesure, à la hauteur de la barre et entre les mains, où commence la peau de ce côté, et le corps
    # recule jusqu'à laisser la barre dehors.
    if os.environ.get('ANTI_BARRE', '1') != '1': return None
    from mathutils.bvhtree import BVHTree
    bv_ = BVHTree.FromObject(corps, bpy.context.evaluated_depsgraph_get()); tot = np.zeros(3)
    Mw = np.array(corps.matrix_world); Mi = np.linalg.inv(Mw)
    mains_ = [pw[ix['main.G']], pw[ix['main.D']]]
    for f in im['formes']:
        if f['forme'] != 'cylindre' or f.get('tenu') or max(f['s']) < 0.5: continue
        Rf = B3 @ quat(f['q']); ax = unit(Rf[:, 1]); L_ = f['s'][1] / 2; c_ = app2bl(f['p'])
        if abs(ax[2]) > 0.3: continue
        R_ = max(f['s'][0], f['s'][2]) + float(os.environ.get('MARGE_BARRE', '0.012'))
        n_ = unit(np.cross([0, 0, 1.0], ax))
        tm = sorted((m - c_) @ ax for m in mains_)
        lo_, hi_ = max(-L_, tm[0] + 0.09), min(L_, tm[1] - 0.09)
        if hi_ <= lo_: continue
        arts = [pw[ix[a]] for a in ('bassin', 'L3', 'thorax', 'cou1', 'femur.G', 'femur.D', 'tibia.G', 'tibia.D')]
        def dist_axe(q): d = q - c_; return np.linalg.norm(d - (d @ ax) * ax)
        proche = min(arts, key=dist_axe); h_os = (proche - c_) @ n_
        if abs(h_os) < 0.005: continue
        s_ = np.sign(h_os); d_ = s_ * n_
        besoin = 0.0
        for t in np.arange(lo_, hi_ + 1e-6, 0.02):
            for dzv in (-R_ * 0.7, 0.0, R_ * 0.7):
                o_ = c_ + ax * t + np.array([0, 0, dzv]) - d_ * 0.6
                ol = Mi[:3, :3] @ o_ + Mi[:3, 3]; dl = Mi[:3, :3] @ d_
                loc, _, _, dd = bv_.ray_cast(Vector(ol), Vector(unit(dl)), 1.2)
                if loc is None: continue
                h_front = dd - 0.6          # où commence la peau, compté depuis la barre, du côté du squelette
                if h_front > 0.45: continue
                besoin = max(besoin, R_ - h_front)
        if besoin > 0: tot = tot + d_ * min(besoin, float(os.environ.get('RECUL_MAX', '0.25')))
    return tot if np.linalg.norm(tot) > 1e-4 else None
def ik_bras(S, H, E0, l1, l2):
    # coude placé pour un bras de longueurs l1, l2 entre l'épaule S et la main H, dans le plan du coude d'origine E0
    d = H - S; L = np.linalg.norm(d)
    if L < 1e-6: return E0
    u = d / L; L = min(L, (l1 + l2) * 0.999)
    a = (l1 * l1 - l2 * l2 + L * L) / (2 * L); hh = math.sqrt(max(l1 * l1 - a * a, 0))
    w = (E0 - S) - ((E0 - S) @ u) * u; w = unit(w) if np.linalg.norm(w) > 1e-6 else unit(np.cross(u, [1.0, 0, 0]))
    return S + u * a + w * hh
def poser_tout(pw):
    R, tete, queue = poser_corps(pw)
    if ANCRE == 'mains':
        dec = (pw[ix['main.G']] + pw[ix['main.D']]) / 2 - (queue['avbrasG'] + queue['avbrasD']) / 2
    elif ANCRE == 'bassin':
        dec = np.zeros(3)
    else:
        dec = np.array([0, 0, 0.0]); dec[:2] = ((pw[ix['pied.G']] + pw[ix['pied.D']]) / 2 - (tete['piedG'] + tete['piedD']) / 2)[:2]
        dec[2] = 0.09 - min(tete['piedG'][2], tete['piedD'][2])
    for b in ORDRE:
        X = np.eye(4); X[:3, :3] = R[b] @ REST[b][:3, :3]; X[:3, 3] = tete[b] + dec
        arm.pose.bones[b].matrix = Matrix(X.tolist()); bpy.context.view_layer.update()
    return R, tete, queue, dec
TOT_LISSE = None; DERNIER_RECUL = np.zeros(3)
def placer(i):
    im = MV['images'][i]; pw = app2bl(im['pw'])
    R, tete, queue, dec = poser_tout(pw)
    if ANCRE == 'mains' and any(f['forme'] == 'cylindre' and not f.get('tenu') for f in im['formes']):
        # le tronc recule de la barre ; les mains restent dessus, les bras se replient (coude recalculé)
        pw0 = pw.copy(); tot = np.zeros(3)
        for passe in range(int(os.environ.get('PASSES_BARRE', '3'))):
            if TOT_LISSE is not None:
                if passe or np.linalg.norm(TOT_LISSE[i]) < 1e-4: break
                tot = TOT_LISSE[i].copy()
            else:
                sh = ecart_barres(im, pw, dec)
                if sh is None: break
                tot = tot + sh
            pw = pw0 + tot
            for c in 'GD':
                for n in [k for k in ART if k.endswith('.' + c) and (k.startswith('main') or k.startswith('doigt') or k.startswith('pouce'))]: pw[ix[n]] = pw0[ix[n]]
                S_, E_, H_ = pw[ix['humerus.' + c]], pw0[ix['ulna.' + c]] + tot, pw0[ix['main.' + c]]
                l1 = np.linalg.norm(pw0[ix['ulna.' + c]] - pw0[ix['humerus.' + c]]); l2 = np.linalg.norm(pw0[ix['main.' + c]] - pw0[ix['ulna.' + c]])
                pw[ix['ulna.' + c]] = ik_bras(S_, H_, E_, l1, l2)
            R, tete, queue, dec = poser_tout(pw)
        if os.environ.get('DEBUG_BARRE') and np.linalg.norm(tot) > 0: print('barre : image', i, 'recul', np.round(tot, 3), flush=True)
        global DERNIER_RECUL; DERNIER_RECUL = tot
    global DERNIER; DERNIER = (tete, dec, pw)
    poignet = {c: queue['avbras' + c] + dec for c in 'GD'}
    BZ = corps_evalue() if COUT else None
    global BV_CORPS
    if COUT and os.environ.get('RAYONS', '1') == '1':
        from mathutils.bvhtree import BVHTree
        BV_CORPS = BVHTree.FromObject(corps, bpy.context.evaluated_depsgraph_get())
    for c in 'GD':
        Pm = H['pos_' + c][i].astype(float); Wm = H['poignet_' + c][i]
        Gw = poignet[c] + ECH_MAIN * (Pm - Wm)
        if c in COUT:
            if BZ is None: BZ = corps_evalue()
            if BZ is not None:
                axe_m, w_m, z_m, d_m, v_m = COUT[c]
                Gw = coudre(Gw, poignet[c], unit(tete['avbras' + c] - queue['avbras' + c]), BZ[z_m], w_m, d_m, v_m, float(os.environ.get('ALLONGE_MAIN', '0.03')), float(os.environ.get('EPS_COUTURE', '0.0015')), float(os.environ.get('BAS_MAIN', '0.02')))
        mains[c].data.vertices.foreach_set('co', Gw.ravel()); mains[c].data.update()
    for c in ('PG', 'PD'):
        if c in mains:
            Pm = H['pos_' + c][i].astype(float); Wm = H['poignet_' + c][i]; Rp = H['rot_' + c][i]
            Lp = (Pm - Wm) @ Rp; axe_p, k_ = COUPE_P[c]; ax_ = np.outer(Lp @ axe_p, axe_p); Lp = ax_ + (Lp - ax_) * k_[:, None]
            Gw = tete['pied' + c[1]] + dec + ECH_PIED * (Lp @ Rp.T)
            if c in COUT and BZ is not None:
                axe_c, w_c, z_c, d_c, v_c = COUT[c]
                Gw = coudre(Gw, tete['pied' + c[1]] + dec, unit(tete['jambe' + c[1]] - queue['jambe' + c[1]]), BZ[z_c], w_c, d_c, v_c, float(os.environ.get('ALLONGE_PIED', '0')), float(os.environ.get('EPS_COUTURE', '0.0015')), float(os.environ.get('BAS_PIED', '0.02')))
            mains[c].data.vertices.foreach_set('co', Gw.ravel()); mains[c].data.update()
    if os.environ.get('DEBUG_COUTURE'):
        from mathutils.bvhtree import BVHTree
        dg_ = bpy.context.evaluated_depsgraph_get(); bv_ = BVHTree.FromObject(corps, dg_)
        for c_ in [k for k in ('G', 'D', 'PG', 'PD') if k in mains]:
            me_ = mains[c_].data; T_ = np.array([p_.vertices[:] for p_ in me_.polygons])
            ar = np.sort(np.concatenate([T_[:, [0, 1]], T_[:, [1, 2]], T_[:, [2, 0]]]), 1); u_, n_ = np.unique(ar, axis=0, return_counts=True); bd = np.unique(u_[n_ == 1]); bd = bd[COUT[c_][1][bd] > 0.5]
            P_ = np.zeros(len(me_.vertices) * 3); me_.vertices.foreach_get('co', P_); P_ = P_.reshape(-1, 3)
            sd = []
            for k in bd:
                loc, nor, _, dist = bv_.find_nearest(Vector(P_[k]))
                if loc is not None: sd.append((Vector(P_[k]) - loc).dot(nor))
            wb = COUT[c_][1]; db = COUT[c_][3]; ib_ = np.where(wb > 0.05)[0]
            sg = np.array([((Vector(P_[k]) - bv_.find_nearest(Vector(P_[k]))[0]).dot(bv_.find_nearest(Vector(P_[k]))[1])) for k in ib_])
            for lo_, hi_ in ((0, 0.005), (0.005, 0.01), (0.01, 0.02), (0.02, 0.03), (0.03, 0.05), (0.05, 0.2)):
                mm = (db[ib_] >= lo_) & (db[ib_] < hi_)
                if mm.any(): print('  bande', c_, lo_, hi_, 'n', int(mm.sum()), 'sous la peau', int((sg[mm] < 0).sum()), 'distance mm p10/50/90', np.percentile(sg[mm] * 1000, [10, 50, 90]).round(1), flush=True)
            sd = np.array(sd); print('bord', c_, len(bd), 'dehors', int((sd > 0).sum()), 'max dehors mm', round(1000 * sd.max(), 1), 'médiane mm', round(1000 * np.median(sd), 1), 'p90', round(1000 * np.percentile(sd, 90), 1), flush=True)
    if 'T' in mains:
        cou_bb = tete['cou'] + dec + float(os.environ.get('COU_T', '0.45')) * (np.array(J['cou'][1]) - np.array(J['cou'][0])) @ R['cou'].T
        cou_bb = cou_bb + R['cou'] @ np.array([0.0] + [float(x) for x in os.environ.get('TETE_DEC', '0.06,0.04').split(',')])
        Pm = H['pos_T'][i].astype(float); Wm = H['poignet_T'][i]
        mains['T'].data.vertices.foreach_set('co', (cou_bb + ECH_TETE * (Pm - Wm)).ravel()); mains['T'].data.update()
    for (o, s0, c), f in zip(haltere, im['formes']):
        Rf = B3 @ quat(f['q']); X = np.eye(4)
        if f.get('tenu') and ANCRE != 'mains':
            dG, dD = poignet['G'] - H['poignet_G'][i], poignet['D'] - H['poignet_D'][i]
            dc = (dG if c == 'G' else dD) if f['tenu'] == 'haltere' else (dG + dD) / 2
            X[:3, :3] = Rf; X[:3, 3] = app2bl(f['p']) + dc
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
if not os.environ.get('VUE'):
    # Exercices allongés (buste à plat) : vue en hauteur depuis les pieds, de trois quarts, pour voir le torse
    # au lieu des disques de la barre ; on garde le côté de la vue d'origine.
    t0 = app2bl(MV['images'][0]['pw'])[ix['cou1']] - app2bl(MV['images'][0]['pw'])[ix['bassin']]
    if abs(unit(t0)[2]) < 0.5:
        pieds = -unit(np.array([t0[0], t0[1], 0.0]))
        a_pieds = math.degrees(math.atan2(pieds[0], -pieds[1]))
        cands = [a_pieds + 35, a_pieds - 35]
        VUE = [min(cands, key=lambda a: abs((a - VUE[0] + 180) % 360 - 180)), max(VUE[1], float(os.environ.get('EL_ALLONGE', '42')))]
        print('vue allongé :', [round(x) for x in VUE], flush=True)
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
if ANCRE == 'mains' and any(f['forme'] == 'cylindre' and not f.get('tenu') for im_ in MV['images'] for f in im_['formes']) and os.environ.get('ANTI_BARRE', '1') == '1':
    # recul de la barre mesuré sur toutes les images, puis lissé dans le temps (enveloppe haute puis moyenne douce) :
    # pas d'à-coup quand le corps commence ou finit de reculer, et jamais moins que le recul nécessaire autour.
    reculs = []
    for i_ in range(len(MV['images'])):
        DERNIER_RECUL = np.zeros(3); placer(i_); reculs.append(DERNIER_RECUL.copy())
    reculs = np.array(reculs); n_ = len(reculs); k_ = int(os.environ.get('FENETRE_BARRE', '4'))
    env_ = np.array([reculs[max(0, j - k_):j + k_ + 1][np.argmax(np.linalg.norm(reculs[max(0, j - k_):j + k_ + 1], axis=1))] for j in range(n_)])
    g_ = np.exp(-0.5 * (np.arange(-2 * k_, 2 * k_ + 1) / k_) ** 2); g_ /= g_.sum()
    TOT_LISSE = np.stack([np.convolve(np.pad(env_[:, c], 2 * k_, mode='edge'), g_, mode='valid') for c in range(3)], 1)
    print('recul de la barre lissé : max', round(float(np.linalg.norm(TOT_LISSE, axis=1).max()), 3), flush=True)
if os.environ.get('CADRE', 'serre') == 'serre' and not os.environ.get('ZOOM'):
    # Cadrage serré : on pose le corps sur une image sur cinq et on cadre ce qui est vraiment rendu (corps, mains, pieds,
    # matériel) au lieu de la boîte large de l'appli, pour que le corps remplisse l'image.
    pts = []
    for i_ in list(range(0, len(MV['images']), 5)):
        placer(i_); dg_ = bpy.context.evaluated_depsgraph_get(); dg_.update()
        for o_ in sc.objects:
            if o_.type != 'MESH' or o_.name == 'sol' or o_.hide_render: continue
            e_ = o_.evaluated_get(dg_); m_ = e_.to_mesh(); n_ = len(m_.vertices)
            if n_:
                c_ = np.zeros(n_ * 3); m_.vertices.foreach_get('co', c_); c_ = c_.reshape(-1, 3)[::3]
                Mw = np.array(o_.matrix_world); pts.append(c_ @ Mw[:3, :3].T + Mw[:3, 3])
            e_.to_mesh_clear()
    P_ = np.concatenate(pts); MARGE = float(os.environ.get('MARGE', '1.10'))
    def cadrer(az_, el_):
        dc = np.array([math.sin(az_) * math.cos(el_), -math.cos(az_) * math.cos(el_), math.sin(el_)])
        r_ = unit(np.cross([0, 0, 1.0], dc)); u_ = np.cross(dc, r_); x_, y_, z_ = P_ @ r_, P_ @ u_, P_ @ dc
        c_ = r_ * (x_.min() + x_.max()) / 2 + u_ * (y_.min() + y_.max()) / 2 + dc * (z_.min() + z_.max()) / 2; Q_ = P_ - c_
        return max((np.abs(Q_ @ r_) * MARGE / tanx + Q_ @ dc).max(), (np.abs(Q_ @ u_) * MARGE / tany + Q_ @ dc).max()), c_, dc, r_, u_
    dist, cible, dirc, dr, up = cadrer(az, el)
    if not os.environ.get('VUE'):
        # mouvement trop large pour l'image en hauteur (bras écartés…) : on tourne un peu la vue (20° au plus)
        # si le corps y gagne plus de 10 % de taille à l'écran
        meilleur = min(((cadrer(az + math.radians(d), el), d) for d in (-20, -10, 10, 20)), key=lambda t: t[0][0])
        if meilleur[0][0] < 0.9 * dist:
            (dist, cible, dirc, dr, up), d = meilleur; az += math.radians(d); print('vue tournée de', d, '°', flush=True)
    print('cadrage serré : distance', round(float(dist), 2), flush=True)
if os.environ.get('ZOOM'):
    zx, zz, zd = [float(x) for x in os.environ['ZOOM'].split(',')]; cible = np.array([zx, 0, zz]); dist = zd
if os.environ.get('ZOOM_OBJ'):
    # gros plan de contrôle sur une pièce (mainG, piedPD…) : même direction de vue, centré sur la pièce
    nz_, dz_ = os.environ['ZOOM_OBJ'].split(','); placer(int(IMAGES.replace('-', ',').split(',')[0]))
    me_ = sc.objects[nz_].data; c_ = np.zeros(len(me_.vertices) * 3); me_.vertices.foreach_get('co', c_)
    cible = c_.reshape(-1, 3).mean(0) + np.array([0, 0, float(os.environ.get('ZOOM_DZ', '0'))]); dist = float(dz_)
co.location = Vector(cible + dirc * dist); co.rotation_euler = (Vector(cible) - co.location).to_track_quat('-Z', 'Y').to_euler()
if float(os.environ.get('CONTOUR', '0')) > 0:
    lc = bpy.data.lights.new('contour', 'AREA'); lc.energy = float(os.environ['CONTOUR']); lc.size = 1.2
    oc = bpy.data.objects.new('contour', lc); sc.collection.objects.link(oc)
    oc.location = Vector(cible - dirc * 2.6 + np.array([0, 0, 1.2])); oc.rotation_euler = (Vector(cible + np.array([0, 0, 0.3])) - oc.location).to_track_quat('-Z', 'Y').to_euler()
if os.environ.get('CARTE'):
    # Report de la carte des muscles du mannequin (même pose) : chaque sommet du bodybuilder, ramené au repère de son os
    # principal chez le mannequin, prend le muscle du sommet le plus proche.
    from scipy.spatial import cKDTree
    src, img, sortie = os.environ['CARTE'].split(',')
    Mq = np.load(src); placer(int(img)); tete, dec, pw = DERNIER
    dg = bpy.context.evaluated_depsgraph_get(); dg.update()
    ev = corps.evaluated_get(dg); m2 = ev.to_mesh(); P = np.zeros(len(m2.vertices) * 3); m2.vertices.foreach_get('co', P); P = P.reshape(-1, 3); ev.to_mesh_clear()
    gnom = {g.index: g.name for g in corps.vertex_groups}
    dom = []
    for v in corps.data.vertices:
        gs = [(g.weight, gnom[g.group]) for g in v.groups if gnom[g.group] in CHAINE]
        dom.append(max(gs)[1] if gs else 'bassin')
    off = np.array([pw[ix[CHAINE[b][0]]] - (tete[b] + dec) for b in dom])
    garde = Mq['corps'].astype(bool)
    idx_src = np.where(garde)[0]; arbre = cKDTree(Mq['V'][garde])
    d, k = arbre.query(P + off); k = idx_src[k]
    np.savez_compressed(sortie, muscle=Mq['muscle'][k], muscle2=Mq['muscle2'][k], cote=Mq['cote'][k], zoneV=Mq['zoneV'][k], dist=d.astype(np.float32))
    print('carte reportée : distance médiane', round(float(np.median(d)), 4), 'max', round(float(d.max()), 3), '| sans muscle', int((Mq['muscle'][k] < 0).sum()), flush=True)
    sys.exit(0)
a, b = (IMAGES.split('-') + [None])[:2]
liste = range(int(a), int(b) + 1) if b else [int(x) for x in IMAGES.split(',')]
for i in liste:
    placer(i); sc.render.filepath = os.path.join(SORTIE, 'f%03d.png' % i); bpy.ops.render.render(write_still=True)
    print('image', i, flush=True)

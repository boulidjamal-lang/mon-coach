# Mannequin, étape 2 : le fichier Blender du personnage — maillage, matières, armature (un os par segment, sans
# hiérarchie : chaque os reçoit sa pose du moteur), groupes de sommets, lissage correcteur, short.
#   python etape2.py <outils> <mannequin.npz> <sortie.blend>
import sys, os, json, math, time
import numpy as np
import bpy
from mathutils import Matrix, Vector
sys.path.insert(0, sys.argv[1])
from lire import app_vers_blender

t0 = time.time()
def chrono(m): print(f'{time.time() - t0:7.1f} s  {m}', flush=True)
NPZ, SORTIE = sys.argv[2], sys.argv[3]
D = np.load(NPZ); meta = json.loads(str(D['meta']))
ZONES = meta['zones']; Z = {n: i for i, n in enumerate(ZONES)}
V = app_vers_blender(D['V'].astype(np.float64)); T = D['T'].astype(np.int64); zoneT = D['zoneT'].astype(np.int64); zoneV = D['zoneV'].astype(np.int64)
OSI = D['os_i'].astype(np.int64); OSW = D['os_w'].astype(np.float64); OS = meta['os']; NB = len(OS)
NV, NT = len(V), len(T)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def maillage(nom, P, Tr, mat_idx=None):
    me = bpy.data.meshes.new(nom)
    me.vertices.add(len(P)); me.vertices.foreach_set('co', P.astype(np.float32).ravel())
    nt = len(Tr)
    me.loops.add(nt * 3); me.loops.foreach_set('vertex_index', Tr.astype(np.int32).ravel())
    me.polygons.add(nt); me.polygons.foreach_set('loop_start', np.arange(0, nt * 3, 3, dtype=np.int32)); me.polygons.foreach_set('loop_total', np.full(nt, 3, np.int32))
    me.polygons.foreach_set('use_smooth', np.ones(nt, bool))
    if mat_idx is not None: me.polygons.foreach_set('material_index', mat_idx.astype(np.int32))
    me.update(calc_edges=True); me.validate(clean_customdata=False)
    ob = bpy.data.objects.new(nom, me); sc.collection.objects.link(ob)
    return ob

FENTE = {Z['corps']: 0, Z['tete']: 0, Z['main']: 0, Z['pied']: 0, Z['ongle']: 1, Z['poil']: 2, Z['cheveux']: 2, Z['oeil']: 3}
corps = maillage('corps', V, T, np.array([FENTE[z] for z in zoneT]))
me = corps.data
for nom in ('peau', 'ongle', 'cheveux', 'oeil'):
    me.materials.append(bpy.data.materials.new(nom))
a = me.attributes.new('repos', 'FLOAT_VECTOR', 'POINT'); a.data.foreach_set('vector', V.astype(np.float32).ravel())
a = me.attributes.new('fibre', 'FLOAT_VECTOR', 'POINT'); a.data.foreach_set('vector', app_vers_blender(D['fibre'].astype(np.float64)).astype(np.float32).ravel())
a = me.attributes.new('creux', 'FLOAT', 'POINT'); a.data.foreach_set('value', D['profondeur'].astype(np.float32))
a = me.attributes.new('actif', 'FLOAT', 'POINT'); a.data.foreach_set('value', np.zeros(NV, np.float32))
chrono(f'maillage : {NV} sommets, {NT} triangles')

# ---------- L'armature : un os par segment de corps, sans parent ----------
arm_d = bpy.data.armatures.new('squelette'); arm = bpy.data.objects.new('squelette', arm_d); sc.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for o in OS:
    a, b = app_vers_blender(np.array(o['segs'][0][0])), app_vers_blender(np.array(o['segs'][0][1]))
    eb = arm_d.edit_bones.new(o['nom']); eb.head = Vector(a); eb.tail = Vector(b)
    if (eb.tail - eb.head).length < 1e-4: eb.tail = eb.head + Vector((0, 0, 0.02))
bpy.ops.object.mode_set(mode='OBJECT')
chrono(f'armature : {len(arm_d.bones)} os')

def attacher(ob, osi, osw):
    groupes = [ob.vertex_groups.new(name=o['nom']) for o in OS]
    for k in range(osi.shape[1]):
        for b in np.unique(osi[:, k]):
            sel = np.flatnonzero((osi[:, k] == b) & (osw[:, k] > 0))
            if not len(sel): continue
            g = groupes[b]; w = osw[sel, k]
            # (par paquets de même poids arrondi : bien plus rapide qu'un appel par sommet)
            q = np.round(w * 1000).astype(np.int64)
            for val in np.unique(q):
                g.add(sel[q == val].tolist(), float(val) / 1000, 'ADD')
    # La peau suit les os en gardant son volume (quaternions duaux) : sans cela l'épaule et l'avant-bras se vrillent
    # en s'amincissant. Mais aux charnières (coude, genou) ce mélange gonfle le pli quand l'articulation se ferme :
    # là, il est mêlé au mélange ordinaire (CHARNIERES : la part ordinaire au cœur de l'articulation).
    vol = os.environ.get('VOLUME', '1') == '1'; K = float(os.environ.get('CHARNIERES', '1'))
    m = ob.modifiers.new('armature', 'ARMATURE'); m.object = arm; m.use_deform_preserve_volume = vol and K <= 0
    if vol and K > 0:
        noms = [o['nom'] for o in OS]; charn = np.zeros(len(osi))
        for cote in ('.G', '.D'):
            for haut, bas in ((('bras',), ('avantbras', 'main', 'doigt')), (('cuisse',), ('jambe', 'pied', 'orteils'))):
                eh = np.array([n.endswith(cote) and n.startswith(haut) and not n.startswith('avantbras') for n in noms])
                eb = np.array([n.endswith(cote) and n.startswith(bas) for n in noms])
                wh, wb = (osw * eh[osi]).sum(1), (osw * eb[osi]).sum(1)
                charn = np.maximum(charn, 2 * np.minimum(wh, wb))
        t = np.clip(charn, 0, 1); part = 1 - K * t * t * (3 - 2 * t)
        # L'épaule. Là où la peau passe de la ceinture (ou du tronc) au bras, le mélange à volume gardé fait tourner les
        # points autour de l'articulation sans les rapprocher : bien pour le deltoïde, qui se ramasse en boule quand le
        # bras monte, mauvais sous le bras et derrière l'épaule, où la peau tendue gonflait en poche (bras levé devant
        # surtout). Autour du bras, la part ordinaire va de presque rien en dehors à EPAULE_K sous l'aisselle.
        KE = [float(x) for x in os.environ.get('EPAULE_K', '0.05,0.35,0.8,0.55').split(',')]   # dehors, devant, dedans, derrière
        if max(KE) > 0:
            Cj = {a_['nom']: np.array(a_['centre'], float) for a_ in meta['squelette']}
            Vapp = D['V'].astype(np.float64)[:len(osi)] if len(osi) == NV else None
            if Vapp is not None:
                for cote, sx in (('.G', 1.0), ('.D', -1.0)):
                    ep_ = Cj['humerus' + cote]; co_ = (Cj['ulna' + cote] + Cj['radius' + cote]) / 2; ax = (co_ - ep_) / np.linalg.norm(co_ - ep_)
                    ex = np.array([sx, 0, 0.0]) - sx * ax[0] * ax; ex /= np.linalg.norm(ex); ez = np.array([0, 0, 1.0]) - ax[2] * ax; ez /= np.linalg.norm(ez)
                    v = Vapp - ep_; r_ = v - np.outer(v @ ax, ax); phi = np.arctan2(r_ @ ez, r_ @ ex)
                    kphi = (KE[0] + KE[2]) / 2 + (KE[0] - KE[2]) / 2 * np.cos(phi) + (KE[1] - KE[3]) / 2 * np.sin(phi) + ((KE[1] + KE[3]) / 2 - (KE[0] + KE[2]) / 2) * np.sin(phi) ** 2
                    # (près de l'axe du bras — le dessus de l'épaule —, la direction n'a plus de sens : part du dehors)
                    pr = np.clip(np.linalg.norm(r_, axis=1) / 0.045, 0, 1); kphi = KE[0] + (kphi - KE[0]) * pr * pr * (3 - 2 * pr)
                    # La part ordinaire ne dépend que de la place autour de l'épaule (pas des poids du sommet) : elle
                    # varie lentement d'un point à son voisin. Liée aux poids, elle changeait d'un coup au bord de la
                    # zone de mélange et la peau s'y cassait en facettes.
                    pres = np.clip((0.21 - np.linalg.norm(v, axis=1)) / 0.11, 0, 1); pres = pres * pres * (3 - 2 * pres)
                    part = np.minimum(part, 1 - kphi * pres)
        gv = ob.vertex_groups.new(name='volume'); q = np.round(part * 50).astype(np.int64)
        for val in np.unique(q):
            if val > 0: gv.add(np.flatnonzero(q == val).tolist(), float(val) / 50, 'REPLACE')
        m2 = ob.modifiers.new('armature_volume', 'ARMATURE'); m2.object = arm; m2.use_deform_preserve_volume = True
        m2.vertex_group = 'volume'; m2.use_multi_modifier = True
    return m
attacher(corps, OSI, OSW)
chrono('groupes de sommets')

# Lissage correcteur : efface les pincements des articulations, garde le relief du repos. Sur le corps seulement
# (ni le visage, ni les doigts, ni les ongles, cheveux, yeux).
estCorps = D['corps'].astype(bool)
nomOs = np.array([o['nom'] for o in OS])
doigt = np.array([n.startswith(('doigt', 'orteils', 'tete')) for n in nomOs])
pd = (OSW * doigt[OSI]).sum(1)
liss = np.where(estCorps, 1.0, 0.0) * (1 - np.clip(pd * 1.5, 0, 1))
# (la main et le pied : un peu, vers le poignet et la cheville)
liss = np.where((zoneV == Z['main']) | (zoneV == Z['pied']), 0.6 * (1 - np.clip(pd * 2.0, 0, 1)), liss)
# Au milieu de l'avant-bras, presque pas de lissage correcteur : il rendrait à la forme adoucie (clé « lisse ») le
# relief du repos qu'elle vient d'effacer. La torsion y est continue, il n'y a pas de pincement à reprendre.
milieu_ab = np.array([n.startswith('avantbras') and n.split('.')[0] != 'avantbras0' for n in nomOs])
pm = (OSW * milieu_ab[OSI]).sum(1)
liss = liss * (1 - float(os.environ.get('LISSAGE_AVANTBRAS', '0.85')) * np.clip((pm - 0.5) * 2.5, 0, 1))
g = corps.vertex_groups.new(name='lissage')
q = np.round(liss * 20).astype(np.int64)
for val in np.unique(q):
    if val > 0: g.add(np.flatnonzero(q == val).tolist(), float(val) / 20, 'REPLACE')
cs = corps.modifiers.new('lissage', 'CORRECTIVE_SMOOTH')
cs.vertex_group = 'lissage'; cs.factor = float(os.environ.get('LISSAGE', '0.6')); cs.iterations = int(os.environ.get('TOURS', '12')); cs.smooth_type = 'LENGTH_WEIGHTED'
cs.rest_source = 'ORCO'; cs.use_only_smooth = False; cs.use_pin_boundary = False
chrono('lissage correcteur')

# ---------- Les clés de forme : l'avant-bras adouci, un côté à la fois ----------
if 'lisse' in D.files:
    dl = app_vers_blender(D['lisse'].astype(np.float64)); cote = D['cote'].astype(np.int64)
    corps.shape_key_add(name='repos', from_mix=False)
    for nom, c_ in (('lisse.G', 0), ('lisse.D', 1)):
        k = corps.shape_key_add(name=nom, from_mix=False)
        P2 = V + dl * (cote == c_)[:, None]
        k.data.foreach_set('co', P2.astype(np.float32).ravel()); k.value = 0.0; k.slider_min = 0.0; k.slider_max = 1.0
    chrono(f"clés de forme : avant-bras adouci ({int((np.abs(dl).sum(1) > 1e-6).sum())} sommets)")

# ---------- Le short ----------
# Les faces du bassin et du haut des cuisses, doublées, gonflées de quelques millimètres et lissées (le relief des
# muscles ne se lit pas à travers le tissu) ; mêmes attaches que la peau dessous.
Va = D['V'].astype(np.float64)
bras = np.array([n.startswith(('bras', 'avantbras', 'main', 'doigt')) for n in nomOs])
pb = (OSW * bras[OSI]).sum(1)
HAUT, BAS = float(os.environ.get('SHORT_HAUT', '0.965')), float(os.environ.get('SHORT_BAS', '0.69'))
dans = estCorps & (pb < 0.5) & (Va[:, 1] < HAUT) & (Va[:, 1] > BAS)
ft = dans[T].all(1) & (zoneT == Z['corps'])
us = np.unique(T[ft]); rang = -np.ones(NV, np.int64); rang[us] = np.arange(len(us))
Ts = rang[T[ft]]; Ps = V[us].copy()
# normales lissées de la peau, puis gonflement et détente
fn = np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]]); Nn = np.zeros_like(V)
for k in range(3): np.add.at(Nn, T[:, k], fn)
Nn /= np.maximum(np.linalg.norm(Nn, axis=1, keepdims=True), 1e-20)
import scipy.sparse as sp
E = np.unique(np.sort(np.concatenate([Ts[:, [0, 1]], Ts[:, [1, 2]], Ts[:, [2, 0]]]), axis=1), axis=0)
A = sp.coo_matrix((np.ones(len(E) * 2), (np.r_[E[:, 0], E[:, 1]], np.r_[E[:, 1], E[:, 0]])), shape=(len(us), len(us))).tocsr()
deg = np.maximum(np.asarray(A.sum(1)).ravel(), 1)
# bord du short (arêtes libres) : il ne bouge pas pendant la détente
E3 = np.sort(np.concatenate([Ts[:, [0, 1]], Ts[:, [1, 2]], Ts[:, [2, 0]]]), axis=1); cle = E3[:, 0] * len(us) + E3[:, 1]
u, cnt = np.unique(cle, return_counts=True); bordS = np.zeros(len(us), bool); bordS[(u[cnt == 1] // len(us))] = True; bordS[(u[cnt == 1] % len(us))] = True
# Le bord est ramené sur une ligne nette : à la taille, à hauteur fixe ; à l'ourlet, à hauteur fixe aussi (les sommets
# glissent le long de la peau, de quelques millimètres).
yb = Va[us, 1]
haut_b = bordS & (yb > (HAUT + BAS) / 2); bas_b = bordS & ~haut_b
Ps[haut_b, 2] = HAUT; Ps[bas_b, 2] = BAS
Ns = Nn[us].copy()
for _ in range(10): Ns = 0.5 * Ns + 0.5 * (A @ Ns) / deg[:, None]
Ns /= np.maximum(np.linalg.norm(Ns, axis=1, keepdims=True), 1e-20)
Pl = Ps.copy()
for _ in range(int(os.environ.get('SHORT_LISSE', '30'))):
    moy = (A @ Pl) / deg[:, None]; Pl = np.where(bordS[:, None], Pl, 0.5 * Pl + 0.5 * moy)
# le tissu reste au-dessus de la peau : on garde le plus haut des deux le long de la normale, plus l'épaisseur
h = ((Pl - Ps) * Ns).sum(1)
Pl = Pl + Ns * (np.maximum(0, -h) + float(os.environ.get('SHORT_EP', '0.004')))[:, None]
short = maillage('short', Pl, Ts)
short.data.materials.append(bpy.data.materials.new('tissu'))
a = short.data.attributes.new('repos', 'FLOAT_VECTOR', 'POINT'); a.data.foreach_set('vector', Pl.astype(np.float32).ravel())
a = short.data.attributes.new('actif', 'FLOAT', 'POINT'); a.data.foreach_set('value', np.zeros(len(us), np.float32))
attacher(short, OSI[us], OSW[us])
g = short.vertex_groups.new(name='lissage'); g.add(list(range(len(us))), 1.0, 'REPLACE')
cs2 = short.modifiers.new('lissage', 'CORRECTIVE_SMOOTH'); cs2.vertex_group = 'lissage'; cs2.factor = cs.factor; cs2.iterations = cs.iterations; cs2.smooth_type = 'LENGTH_WEIGHTED'; cs2.rest_source = 'ORCO'
so = short.modifiers.new('epaisseur', 'SOLIDIFY'); so.thickness = 0.0025; so.offset = 1.0
# La peau sous le short est cachée (sauf une marge sous l'ourlet), pour qu'elle ne perce jamais le tissu.
marge = 0.02
cache = estCorps & (pb < 0.5) & (Va[:, 1] < HAUT - marge) & (Va[:, 1] > BAS + marge)
g = corps.vertex_groups.new(name='sous_short'); g.add(np.flatnonzero(cache).tolist(), 1.0, 'REPLACE')
mk = corps.modifiers.new('sous_short', 'MASK'); mk.vertex_group = 'sous_short'; mk.invert_vertex_group = True
# (le masque reste le dernier : le lissage correcteur a besoin de tous les sommets du repos)
np.save(os.path.splitext(SORTIE)[0] + '-short.npy', us)
chrono(f'short : {len(us)} sommets, {len(Ts)} triangles ; {int(cache.sum())} sommets de peau cachés dessous')

bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(SORTIE))
chrono(f'écrit {SORTIE}')

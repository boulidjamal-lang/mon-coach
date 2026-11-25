# Mannequin, étape 1 : la peau de l'appli devient une seule surface fine, sculptée sur les muscles en pleine résolution,
# avec pour chaque sommet le muscle qu'il recouvre, le sens de ses fibres et ses attaches aux os (attaches classiques :
# chaque point suit l'os de son segment, mélangé en douceur autour des articulations).
#   python etape1.py <dossier des outils> <source.bin> <pleine.bin> <sortie.npz>
# Réglages : AFFINAGES (2), CREUX (mm, 3.0), BOSSE (mm, 1.5), EPAISSEUR (mm, 0.8)
import sys, os, json, time
import numpy as np
import scipy.sparse as sp
import bpy  # (donne mathutils)
from mathutils.bvhtree import BVHTree
from mathutils import Vector

sys.path.insert(0, sys.argv[1])
from lire import Export

t0 = time.time()
def chrono(m): print(f'{time.time() - t0:7.1f} s  {m}', flush=True)

SRC, PLEINE, SORTIE = sys.argv[2], sys.argv[3], sys.argv[4]
AFFINAGES = int(os.environ.get('AFFINAGES', '2'))
CREUX = float(os.environ.get('CREUX', '3.0')) / 1000
BOSSE = float(os.environ.get('BOSSE', '1.5')) / 1000
EPAISSEUR = float(os.environ.get('EPAISSEUR', '0.8')) / 1000
BANDE = 0.03

S = Export(SRC); H = S.H
SQ = H['squelette']; NJ = len(SQ)
num = {a['nom']: i for i, a in enumerate(SQ)}
C = {a['nom']: np.array(a['centre'], float) for a in SQ}
JUM = np.array([a['jumeau'] for a in SQ])
ZONES = H['zones']; Z = {n: i for i, n in enumerate(ZONES)}

# ---------------------------------------------------------------- la peau de l'appli, côté gauche
c, r = H['corps'], H['reste']
Pc = S.tab(c['P'], np.float32, c['n'] * 3).reshape(-1, 3).astype(np.float64)
Tc = S.tab(c['T'], np.uint32, c['nt'] * 3).reshape(-1, 3).astype(np.int64)
bordc = S.tab(c['bord'], np.uint8, c['n']).astype(np.float64) * c['pasBord']
Jc = S.tab(c['J'], np.uint8, c['n'] * 4).reshape(-1, 4).astype(np.int64)
Wc = S.tab(c['W'], np.uint8, c['n'] * 4).reshape(-1, 4).astype(np.float64) / 255
Pr = S.tab(r['P'], np.float32, r['n'] * 3).reshape(-1, 3).astype(np.float64)
zr = S.tab(r['zone'], np.uint8, r['n']).astype(np.int64)
Tr = S.tab(r['T'], np.uint32, (r['pairs'] + r['impairs']) * 3).reshape(-1, 3).astype(np.int64)
Tpairs, Timpairs = Tr[:r['pairs']], Tr[r['pairs']:]

# La part de bras de chaque sommet du corps, d'après les attaches de la peau d'origine (articulations intermédiaires
# comprises) : c'est elle qui dit de quel côté de l'aisselle est un point de peau.
INTER = H['intermediaires']; NJP = H['articulationsPeau']
def part_de(noms):
    base = np.array([any(a['nom'].startswith(n) for n in noms) for a in SQ[:NJP]], float)
    f = list(base)
    for x in INTER: f.append(x['part'] * base[x['vers']] + (1 - x['part']) * base[x['de']])
    f = np.array(f + f[NJP:])   # (les intermédiaires du côté droit suivent ; inutilisées à gauche)
    return f
F_BRAS = part_de(['humerus', 'ulna', 'radius', 'main', 'doigt'])
bras_c = (Wc * F_BRAS[np.minimum(Jc, len(F_BRAS) - 1)]).sum(1)

# Un seul maillage pour le côté gauche : le corps, puis le reste (tête, main, pied, ongles, poils, œil) ; les sommets
# du bord du corps sont ceux du reste (mêmes places) : soudés.
NC, NR = len(Pc), len(Pr)
util_r = np.unique(Tpairs)                      # sommets du reste utilisés par le côté gauche
cle = lambda p: tuple(np.round(p * 1e5).astype(np.int64))
place_c = {cle(p): i for i, p in enumerate(Pc)}
vers = -np.ones(NR, np.int64); soudes = 0
V = [Pc]; zone = [np.zeros(NC, np.int64)]; n = NC
for i in util_r:
    j = place_c.get(cle(Pr[i]))
    if j is not None and zr[i] in (Z['tete'], Z['main'], Z['pied']):
        vers[i] = j; soudes += 1
    else:
        vers[i] = n; n += 1; V.append(Pr[i][None]); zone.append(np.array([zr[i]]))
V = np.concatenate(V); zone = np.concatenate(zone)
T = np.concatenate([Tc, vers[Tpairs]]); corpsT = np.zeros(len(T), bool); corpsT[:len(Tc)] = True
zoneT = np.concatenate([np.zeros(len(Tc), np.int64), zr[Tpairs[:, 0]]])
NV0 = len(V)
dbord = np.full(NV0, 0.0); dbord[:NC] = bordc
bras = np.zeros(NV0); bras[:NC] = bras_c; bras[zone == Z['main']] = 1; bras[(zone == Z['ongle']) & (V[:, 1] > 0.4)] = 1
chrono(f'peau gauche : {NV0} sommets, {len(T)} triangles ({soudes} sommets du bord soudés)')

def aretes(T, nv):
    """Arêtes uniques : (a, b), rang de l'arête de chaque côté de triangle, nombre de triangles par arête."""
    E = np.sort(np.stack([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]], 1).reshape(-1, 2), axis=1)
    k = E[:, 0] * nv + E[:, 1]
    u, inv, cnt = np.unique(k, return_inverse=True, return_counts=True)
    return np.stack([u // nv, u % nv], 1), inv.reshape(-1, 3), cnt

def normales(V, T, plan=None):
    fn = np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]])
    N = np.zeros_like(V)
    for k in range(3): np.add.at(N, T[:, k], fn)
    if plan is not None: N[plan, 0] = 0
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-20)

# La couture du milieu : les sommets d'une arête libre posés sur le plan de symétrie.
E0, inv0, cnt0 = aretes(T, NV0)
libre = np.zeros(NV0, bool); libre[E0[cnt0 == 1].ravel()] = True
plan = libre & (np.abs(V[:, 0]) < 1e-4)
V[plan, 0] = 0
chrono(f'couture du milieu : {int(plan.sum())} sommets')

# ---------------------------------------------------------------- attaches : un os par segment, puis mélange
# Les os de déformation (côté gauche et milieu ; la droite est le miroir). Chaque os : des segments (appli, mètres)
# qui disent quelle peau il porte, et la manière de calculer sa pose depuis les articulations du moteur.
def tiers(a, b, k): return a + (b - a) * k / 3
ep, co, po = C['humerus.G'], (C['ulna.G'] + C['radius.G']) / 2, C['main.G']
ha, ge, ch, ot = C['femur.G'], C['tibia.G'], C['pied.G'], C['orteils.G']
OS = []   # (nom, [segments], pose)
def os_(nom, segs, pose, rayon=1.0): OS.append({'nom': nom, 'segs': [(np.array(a, float), np.array(b, float)) for a, b in segs], 'pose': pose, 'rayon': rayon})
mi = lambda p: p * np.array([-1, 1, 1])
os_('bassin', [(ha, mi(ha)), ((ha + mi(ha)) / 2, C['L5'])], {'art': 'bassin'})
for a, b in (('L5', 'L4'), ('L4', 'L3'), ('L3', 'L2'), ('L2', 'L1'), ('L1', 'thorax')): os_(a, [(C[a], C[b])], {'art': a})
os_('thorax', [(C['thorax'], C['cou1'])], {'art': 'thorax'})
os_('cou1', [(C['cou1'], C['cou2'])], {'art': 'cou1'})
os_('cou2', [(C['cou2'], C['cou3'])], {'art': 'cou2'})
os_('cou3', [(C['cou3'], C['tete'])], {'art': 'cou3'})
os_('tete', [(C['tete'], C['tete'] + [0, 0.17, 0.02]), (C['tete'], C['tete'] + [0, -0.03, 0.09])], {'art': 'tete'})
os_('ceinture.G', [(C['clavicule.G'], ep), (ep, ep + [-0.055, -0.14, -0.085])], {'art': 'clavicule.G'})
# Le bras et l'avant-bras : des nœuds répartis le long de l'os, entre lesquels la torsion passe en continu (cinq pour
# la rotation de l'humérus, six pour la pronation). Avec trois tronçons seulement, toute la pronation se faisait en
# deux endroits de l'avant-bras, qui se vrillait là comme un linge qu'on essore.
NBR = int(os.environ.get('NOEUDS_BRAS', '5')); NAV = int(os.environ.get('NOEUDS_AVANTBRAS', '6'))
EXP_PRON = float(os.environ.get('EXP_PRONATION', '1.3'))
def noeuds(prefixe, A, B, N, pose_de):
    for k in range(N):
        t0, t1 = max(0.0, (k - 0.5) / (N - 1)), min(1.0, (k + 0.5) / (N - 1))
        os_(f'{prefixe}{k}.G', [(A + (B - A) * t0, A + (B - A) * t1)], pose_de(k / (N - 1)))
# (la rotation du bras se prend sur sa moitié haute, deltoïde compris : le bas du biceps et du triceps tourne d'un
#  bloc avec l'humérus. Toute sur le deltoïde, elle le plissait ; étalée jusqu'au coude, elle vrillait tout le bras.)
PART_BRAS = [float(x) for x in os.environ.get('PART_BRAS', '0.2,0.5,0.8,1,1').split(',')]
noeuds('bras', ep, co, NBR, lambda t: {'torsion': ['clavicule.G', 'humerus.G'], 'part': PART_BRAS[min(len(PART_BRAS) - 1, int(round(t * (NBR - 1))))]})
# (la pronation se prend un peu plus vers le poignet, où l'avant-bras est mince et son relief discret)
noeuds('avantbras', co, po, NAV, lambda t: {'pronation': ['ulna.G', 'radius.G'], 'part': t ** EXP_PRON})
BRAS_N = [f'bras{k}.G' for k in range(NBR)]; AVB_N = [f'avantbras{k}.G' for k in range(NAV)]
os_('main.G', [(po, C[f'doigt{d}-1.G']) for d in (2, 3, 4, 5)], {'art': 'main.G'})
for d in range(1, 6):
    for k in range(1, 4):
        a = C[f'doigt{d}-{k}.G']
        b = C[f'doigt{d}-{k + 1}.G'] if k < 3 else a + (a - C[f'doigt{d}-{k - 1}.G']) / np.linalg.norm(a - C[f'doigt{d}-{k - 1}.G']) * (0.03 if d == 1 else 0.024)
        os_(f'doigt{d}-{k}.G', [(a, b)], {'art': f'doigt{d}-{k}.G'})
for k in range(3): os_(f'cuisse{k}.G', [(tiers(ha, ge, k), tiers(ha, ge, k + 1))], {'torsion': ['bassin', 'femur.G'], 'part': [0.3, 0.7, 1.0][k]})
os_('jambe.G', [(ge, ch)], {'art': 'tibia.G'})
os_('pied.G', [(ch, ot), (ch, [ch[0], 0.03, -0.095])], {'art': 'pied.G'})
os_('orteils.G', [(ot, [ot[0] + 0.005, 0.012, 0.15])], {'art': 'orteils.G'})
NOMS_G = [o['nom'] for o in OS]
# Le côté droit : miroir.
for o in list(OS):
    if not o['nom'].endswith('.G'): continue
    d = lambda s: s[:-2] + '.D' if s.endswith('.G') else s
    pose = {k: ([d(x) for x in v] if isinstance(v, list) and v and isinstance(v[0], str) else d(v) if isinstance(v, str) else v) for k, v in o['pose'].items()}
    OS.append({'nom': d(o['nom']), 'segs': [(mi(a), mi(b)) for a, b in o['segs']], 'pose': pose, 'rayon': o['rayon']})
NB = len(OS); IOS = {o['nom']: i for i, o in enumerate(OS)}
JUM_OS = np.array([IOS[o['nom'][:-2] + ('.D' if o['nom'].endswith('.G') else '.G')] if o['nom'][-2:] in ('.G', '.D') else i for i, o in enumerate(OS)])
chrono(f'{NB} os de déformation')

def dist_segments(P, segs):
    d = np.full(len(P), 1e9)
    for a, b in segs:
        ab = b - a; l2 = max(ab @ ab, 1e-12)
        t = np.clip(((P - a) @ ab) / l2, 0, 1)
        d = np.minimum(d, np.linalg.norm(P - (a + t[:, None] * ab), axis=1))
    return d

def etiqueter(P, permis):
    """L'os le plus proche de chaque point, parmi ceux que son ensemble permet (permis : liste de listes de noms)."""
    D = np.stack([dist_segments(P, o['segs']) / o['rayon'] for o in OS], 1)
    M = np.full(D.shape, np.inf)
    for i, noms in enumerate(permis): M[i, [IOS[x] for x in noms]] = 0
    return np.argmin(D + M, axis=1)

DOIGTS = [f'doigt{d}-{k}.G' for d in range(1, 6) for k in range(1, 4)]
ENS = {
    'cou': ['thorax', 'cou1', 'cou2', 'cou3', 'tete', 'ceinture.G'],
    'tronc': ['bassin', 'L5', 'L4', 'L3', 'L2', 'L1', 'thorax', 'cou1', 'ceinture.G'],
    'epaule': ['ceinture.G'] + BRAS_N[:(NBR + 1) // 2],
    'bras': BRAS_N + AVB_N + ['main.G'] + DOIGTS,
    'jambe': ['cuisse0.G', 'cuisse1.G', 'cuisse2.G', 'jambe.G', 'pied.G', 'orteils.G'],
    'tete': ['cou2', 'cou3', 'tete'], 'tete_seule': ['tete'],
    'main': [AVB_N[-1], 'main.G'] + DOIGTS, 'pied': ['jambe.G', 'pied.G', 'orteils.G'],
    'ongle_main': [f'doigt{d}-3.G' for d in range(1, 6)], 'ongle_pied': ['orteils.G'],
}
REGION_ENS = {'tete': 'cou', 'cou': 'cou', 'thorax': 'tronc', 'dos': 'tronc', 'abdomen': 'tronc', 'bassin': 'tronc', 'epaule': 'epaule',
              'bras': 'bras', 'avant_bras': 'bras', 'main': 'bras', 'cuisse': 'jambe', 'jambe': 'jambe', 'pied': 'jambe'}

# ---------------------------------------------------------------- les muscles en pleine résolution
PL = Export(PLEINE); HPL = PL.H
STRUCT = {s['id']: s for s in H['structures']}
ART_BRAS = set(i for i, a in enumerate(SQ) if a['nom'].endswith('.G') and a['nom'].split('.')[0].split('-')[0].rstrip('12345') in ('humerus', 'ulna', 'radius', 'main', 'doigt'))
ART_JAMBE = set(i for i, a in enumerate(SQ) if a['nom'].endswith('.G') and a['nom'].split('.')[0] in ('femur', 'tibia', 'pied', 'orteils'))
pieces = []
for p in HPL['pieces']:
    if p['type'] in ('aponevrose', 'peau'): continue
    P = PL.tab(p['P'], np.float32, p['nv'] * 3).reshape(-1, 3).astype(np.float64)
    Tp = PL.tab(p['T'], np.uint32, p['nt'] * 3).reshape(-1, 3).astype(np.int64)
    ten = PL.tab(p['tendon'], np.uint8, p['nt']).astype(bool)
    J = PL.tab(p['J'], np.uint8, p['nv'] * 4).reshape(-1, 4).astype(np.int64)
    W = PL.tab(p['W'], np.float32, p['nv'] * 4).reshape(-1, 4).astype(np.float64)
    if p['type'] == 'os':
        acc = np.zeros(NJ); np.add.at(acc, J.ravel(), W.ravel()); art = int(np.argmax(acc))
        classe = 'bras' if art in ART_BRAS else 'jambe' if art in ART_JAMBE else 'tronc'
        region = 'os'; st = -1
        nomart = SQ[art]['nom']
        ens = 'bras' if classe == 'bras' else 'jambe' if classe == 'jambe' else 'cou' if nomart.startswith(('cou', 'tete')) else 'tronc'
        if nomart.startswith('clavicule'): ens = 'epaule'
    else:
        region = p['region']; st = STRUCT[p['nom']]['i'] if p['nom'] in STRUCT else -1
        classe = 'bras' if region in ('bras', 'avant_bras', 'main') else 'neutre' if region == 'epaule' else 'jambe' if region in ('cuisse', 'jambe', 'pied') else 'tronc'
        ens = REGION_ENS[region]
    # Sens des fibres : vers le point où elles convergent (le tendon le plus ramassé), sinon le grand axe.
    cen = P.mean(0); axe = np.linalg.svd(P - cen, full_matrices=False)[2][0]; conv = None
    if p['type'] != 'os' and ten.any():
        tv = np.zeros(len(P), bool); tv[Tp[ten].ravel()] = True
        if tv.sum() > 8:
            s = (P[tv] - cen) @ axe; a, b = P[tv][s < np.median(s)], P[tv][s >= np.median(s)]
            if len(a) and len(b):
                ca, cb = a.mean(0), b.mean(0)
                conv = ca if np.linalg.norm(a - ca, axis=1).mean() < np.linalg.norm(b - cb, axis=1).mean() else cb
    pieces.append({'nom': p['nom'], 'type': p['type'], 'region': region, 'pair': p['pair'], 'P': P, 'T': Tp, 'classe': classe, 'ens': ens, 'st': st, 'axe': axe, 'conv': conv, 'tendon': ten})
chrono(f'pleine résolution : {len(pieces)} pièces')

def arbre(classes, miroir_tronc):
    Vs, Ts, Ps, cote = [], [], [], []; v0 = 0
    for ip, p in enumerate(pieces):
        if p['classe'] not in classes: continue
        Vs.append(p['P']); Ts.append(p['T'] + v0); Ps.append(np.full(len(p['T']), ip)); cote.append(np.zeros(len(p['T']), np.int8)); v0 += len(p['P'])
        if miroir_tronc and p['pair'] and p['classe'] == 'tronc':
            Pm = p['P'] * [-1, 1, 1]
            garde = (Pm[p['T']][:, :, 0] > -0.03).any(1)
            if garde.any():
                Vs.append(Pm); Ts.append(p['T'][garde][:, [0, 2, 1]] + v0); Ps.append(np.full(int(garde.sum()), ip)); cote.append(np.ones(int(garde.sum()), np.int8)); v0 += len(Pm)
    Vt, Tt = np.concatenate(Vs), np.concatenate(Ts)
    return BVHTree.FromPolygons(Vt.tolist(), Tt.tolist(), all_triangles=True), np.concatenate(Ps), np.concatenate(cote)
ARB_TRONC, PIECE_TRONC, COTE_TRONC = arbre(('tronc', 'neutre', 'jambe'), True)
ARB_BRAS, PIECE_BRAS, COTE_BRAS = arbre(('bras', 'neutre'), False)
chrono('arbres de recherche prêts')

# ---------------------------------------------------------------- étiquettes et attaches sur la peau d'origine (gauche)
# L'ensemble d'os permis à chaque sommet : d'après la zone (tête, main, pied…) ou, sur le corps, d'après le muscle (ou
# l'os) qu'il recouvre et sa part de bras.
def dessous(P, N, brasP, h0=0.004, portee=0.011):
    """Pour chaque point : la pièce sous lui (le long de -N), la hauteur de sa surface (repérée sur N, relative au point),
    et la pièce suivante plus profonde. -1 si rien."""
    n = len(P); piece = -np.ones(n, np.int64); haut = np.full(n, np.nan); piece2 = -np.ones(n, np.int64); cote = np.zeros(n, np.int8)
    for i in range(n):
        arb, PI, CO = (ARB_BRAS, PIECE_BRAS, COTE_BRAS) if brasP[i] > 0.5 else (ARB_TRONC, PIECE_TRONC, COTE_TRONC)
        o = Vector(P[i] + N[i] * h0); d = Vector(-N[i])
        loc, nor, idx, dist = arb.ray_cast(o, d, h0 + portee)
        if idx is not None:
            piece[i] = PI[idx]; haut[i] = h0 - dist; cote[i] = CO[idx]
            # plus profond : la première pièce différente dans les 3 cm qui suivent
            o2 = loc + d * 0.0006; reste = 0.03
            for _ in range(6):
                l2, n2, i2, d2 = arb.ray_cast(o2, d, reste)
                if i2 is None: break
                if PI[i2] != piece[i]: piece2[i] = PI[i2]; break
                o2 = l2 + d * 0.0006; reste -= d2 + 0.0006
                if reste <= 0: break
        else:
            loc, nor, idx, dist = arb.find_nearest(Vector(P[i]), 0.03)
            if idx is not None: piece[i] = PI[idx]; cote[i] = CO[idx]
    return piece, haut, piece2, cote

N0 = normales(V, T, plan)
estCorps = zone == 0
piece0, _, _, _ = dessous(V[estCorps], N0[estCorps], bras[estCorps])
permis = [None] * NV0; ens_v = [''] * NV0
EPAULE_T = float(os.environ.get('EPAULE_T', '0.04')); EPAULE_SIG = float(os.environ.get('EPAULE_SIG', '0.04'))
ic = np.flatnonzero(estCorps)
for k, i in enumerate(ic):
    if piece0[k] < 0: e = 'bras' if bras[i] > 0.5 else 'tronc'
    else:
        e = pieces[piece0[k]]['ens']
        if bras[i] > 0.5 and e in ('tronc', 'cou'): e = 'bras'
        if bras[i] <= 0.5 and e == 'bras': e = 'epaule' if np.linalg.norm(V[i] - ep) < 0.13 else 'tronc'
    permis[i] = ENS[e]; ens_v[i] = e
# L'épaule. Le deltoïde part de la ceinture (acromion, clavicule, épine de l'omoplate) et s'attache à mi-bras : sa peau
# ne tourne pas d'un bloc avec le bras. Elle suit la ceinture en haut, le bras à partir du milieu du deltoïde, et le
# mélange s'étale sur toute sa longueur (voir sig_v). Ce qui est sur l'omoplate (loin de l'axe du bras) reste à la ceinture.
axe_bras = (co - ep) / np.linalg.norm(co - ep)
for i in ic:
    if ens_v[i] != 'epaule': continue
    v = V[i] - ep; t = float(v @ axe_bras); rad = float(np.linalg.norm(v - t * axe_bras))
    permis[i] = BRAS_N[:(NBR + 1) // 2] if (t > EPAULE_T and rad < 0.085) else ['ceinture.G']
for i in np.flatnonzero(~estCorps):
    z = ZONES[zone[i]]
    e = 'tete' if z == 'tete' else 'main' if z == 'main' else 'pied' if z == 'pied' else ('ongle_main' if V[i, 1] > 0.4 else 'ongle_pied') if z == 'ongle' else 'tete_seule'
    permis[i] = ENS[e]
etiq = etiqueter(V, permis)
# La ceinture scapulaire ne garde que le haut de l'épaule. Au plus proche, tout le flanc sous l'aisselle lui revenait
# (il est plus près de l'omoplate que de la colonne) : il suivait la ceinture, qui pivote de 40° quand le bras monte,
# et le tronc s'ouvrait en « ailes ». Les sommets du tronc qu'elle avait pris sont rejugés entre la ceinture — la
# clavicule et l'épine de l'omoplate — et la cage thoracique (une ligne sur le flanc, une devant, une derrière).
if os.environ.get('CAGE', '1') == '1':
    cage = [(C['thorax'], C['cou1'])] + [(np.array(a_, float), np.array(b_, float)) for a_, b_ in
            (((0.105, 1.10, -0.005), (0.105, 1.32, -0.005)), ((0.065, 1.12, 0.075), (0.065, 1.34, 0.065)), ((0.075, 1.10, -0.085), (0.075, 1.36, -0.095)))]
    haut = [(C['clavicule.G'], ep), (ep, np.array([0.075, ep[1] + 0.01, -0.10]))]
    kc = np.flatnonzero((etiq == IOS['ceinture.G']) & np.array([e in ('tronc', 'cou') for e in ens_v]))
    vers_thorax = dist_segments(V[kc], cage) < dist_segments(V[kc], haut)
    etiq[kc[vers_thorax]] = IOS['thorax']
    chrono(f'ceinture : {int(vers_thorax.sum())} sommets du tronc rendus au thorax sur {len(kc)}')
# Le visage et le crâne restent rigides : au-dessus de la mâchoire, tout suit la tête.
visage = (zone == Z['tete']) & (V[:, 1] > C['tete'][1] + 0.005 - 0.9 * np.maximum(0, V[:, 2] - 0.0))
etiq[visage] = IOS['tete']
chrono('étiquettes : ' + ', '.join(f"{o['nom']} {int((etiq == i).sum())}" for i, o in enumerate(OS) if (etiq == i).any() and not o['nom'].startswith('doigt')))

# Largeur du mélange autour des articulations (mètres), selon l'os.
def largeur(nom):
    b = nom.split('.')[0]
    if b.startswith('doigt'): return 0.006
    if b == 'main': return 0.012
    if b.startswith('avantbras'): return 0.028
    if b.startswith('bras'): return 0.04
    if b == 'ceinture': return 0.055
    if b.startswith('cuisse'): return 0.06
    if b == 'jambe': return 0.045
    if b == 'pied': return 0.02
    if b == 'orteils': return 0.008
    if b == 'tete': return 0.012
    if b.startswith('cou'): return 0.03
    return 0.055
SIG = np.array([largeur(o['nom']) for o in OS])

def melanger(V, T, etiq, fige=None, tours_min=40, sig0=None):
    """Poids par diffusion sur la surface : part de l'étiquette (un os par sommet) et s'étale sur une distance qui dépend
    de l'endroit du corps."""
    nv = len(V)
    E, _, _ = aretes(T, nv)
    A = sp.coo_matrix((np.ones(len(E) * 2), (np.r_[E[:, 0], E[:, 1]], np.r_[E[:, 1], E[:, 0]])), shape=(nv, nv)).tocsr()
    deg = np.maximum(np.asarray(A.sum(1)).ravel(), 1)
    lg = np.linalg.norm(V[E[:, 0]] - V[E[:, 1]], axis=1)
    h2 = np.zeros(nv); np.add.at(h2, E[:, 0], lg ** 2); np.add.at(h2, E[:, 1], lg ** 2); h2 = np.maximum(h2 / deg, 1e-10)
    sig = SIG[etiq].copy() if sig0 is None else sig0.copy()
    for _ in range(6): sig = 0.5 * sig + 0.5 * (A @ sig) / deg       # la largeur elle-même varie en douceur
    if fige is not None: sig[fige] = 0
    besoin = sig ** 2 / (0.25 * h2)                                  # tours nécessaires à pas plein
    utile = np.asarray(A.sum(1)).ravel() > 0
    besoin[~utile] = 0
    tours = int(min(float(os.environ.get('TOURS_MAX', '500')), max(tours_min, np.percentile(besoin[utile], 99.5))))
    lam = np.minimum(1.0, besoin / tours)
    W = np.zeros((nv, NB), np.float32); W[np.arange(nv), etiq] = 1
    Dm = sp.diags(lam / deg) @ A; Dd = sp.diags(1 - lam)
    for _ in range(tours): W = Dd @ W + Dm @ W
    return W / W.sum(1, keepdims=True), tours

# Le mélange se fait sur le corps entier (gauche + miroir, couture soudée) pour traverser le milieu.
def entier(V, T, plan):
    nv = len(V); vers_d = np.arange(nv) + nv; vers_d[plan] = np.flatnonzero(plan)
    V2 = np.concatenate([V, V * [-1, 1, 1]]); T2 = np.concatenate([T, vers_d[T][:, [0, 2, 1]]])
    return V2, T2, vers_d
Ve, Te, vers_d0 = entier(V, T, plan)
etiq_e = np.concatenate([etiq, JUM_OS[etiq]])
fige_e = np.concatenate([visage, visage])
sig_v = SIG[etiq].copy()
sig_v[np.array([e == 'epaule' for e in ens_v])] = EPAULE_SIG
rigide = np.isin(zone, [Z['ongle'], Z['poil'], Z['oeil']])
fige_e = np.concatenate([visage | rigide, visage | rigide])
We, tours = melanger(Ve, Te, etiq_e, fige_e, sig0=np.concatenate([sig_v, sig_v]))
# (sur la couture, les poids des deux côtés sont rendus symétriques)
Wg = We[:NV0].copy(); Wg[plan] = 0.5 * (We[:NV0][plan] + We[:NV0][plan][:, JUM_OS])
chrono(f'attaches mélangées ({tours} tours) ; os par sommet (> 2 %) : {float((Wg > 0.02).sum(1).mean()):.2f} en moyenne, {int((Wg > 0.02).sum(1).max())} au plus')

# ---------------------------------------------------------------- affinage du corps
def subdiviser(V, N, T, corpsT, zoneT, plan):
    nv = len(V)
    E, inv, cnt = aretes(T, nv)
    coupe = np.zeros(len(E), bool); np.logical_or.at(coupe, inv.ravel(), np.repeat(corpsT, 3))
    mil = -np.ones(len(E), np.int64); mil[coupe] = nv + np.arange(int(coupe.sum()))
    a, b = E[coupe, 0], E[coupe, 1]
    wab = ((V[b] - V[a]) * N[a]).sum(1, keepdims=True); wba = ((V[a] - V[b]) * N[b]).sum(1, keepdims=True)
    Pm = (V[a] + V[b]) / 2 - (wab * N[a] + wba * N[b]) / 8      # milieu de l'arête courbe (triangle PN)
    plan_m = plan[a] & plan[b] & (cnt[coupe] == 1); Pm[plan_m, 0] = 0
    nn = len(a)
    M = sp.coo_matrix((np.r_[np.ones(nv), np.full(2 * nn, 0.5)], (np.r_[np.arange(nv), nv + np.arange(nn), nv + np.arange(nn)], np.r_[np.arange(nv), a, b])), shape=(nv + nn, nv)).tocsr()
    em = mil[inv]; k = (em >= 0).sum(1)
    Tn, Cn, Zn = [], [], []
    f = k == 3
    A_, B_, C_ = T[f, 0], T[f, 1], T[f, 2]; ab, bc, ca = em[f, 0], em[f, 1], em[f, 2]
    Tn.append(np.concatenate([np.stack([A_, ab, ca], 1), np.stack([ab, B_, bc], 1), np.stack([ca, bc, C_], 1), np.stack([ab, bc, ca], 1)]))
    Cn.append(np.tile(corpsT[f], 4)); Zn.append(np.tile(zoneT[f], 4))
    f0 = k == 0; Tn.append(T[f0]); Cn.append(corpsT[f0]); Zn.append(zoneT[f0])
    part = []
    for t in np.flatnonzero((k == 1) | (k == 2)):
        A_, B_, C_ = T[t]; ab, bc, ca = em[t]
        if k[t] == 2:
            p, q, r_, pq, rp = (A_, B_, C_, ab, ca) if bc < 0 else (B_, C_, A_, bc, ab) if ca < 0 else (C_, A_, B_, ca, bc)
            part += [(p, pq, rp), (pq, q, r_), (pq, r_, rp)]
        else:
            p, q, r_, pq = (A_, B_, C_, ab) if ab >= 0 else (B_, C_, A_, bc) if bc >= 0 else (C_, A_, B_, ca)
            part += [(p, pq, r_), (pq, q, r_)]
        nb = 3 if k[t] == 2 else 2
        Cn.append(np.full(nb, corpsT[t])); Zn.append(np.full(nb, zoneT[t]))
    if part: Tn.append(np.array(part, np.int64))
    # (l'ordre de Cn/Zn suit celui de Tn : les triangles partiels sont ajoutés à la fin, dans le même ordre)
    Tn2 = np.concatenate([Tn[0], Tn[1]] + ([Tn[2]] if part else []))
    Cn2 = np.concatenate(Cn[:2] + Cn[2:]); Zn2 = np.concatenate(Zn[:2] + Zn[2:])
    return np.concatenate([V, Pm]), Tn2, Cn2, Zn2, np.r_[plan, plan_m], M

Vf, Tf, corpsTf, zoneTf, planf = V.copy(), T.copy(), corpsT.copy(), zoneT.copy(), plan.copy()
Mtot = sp.identity(NV0, format='csr')
for tour in range(AFFINAGES):
    Nf = normales(Vf, Tf, planf)
    Vf, Tf, corpsTf, zoneTf, planf, M = subdiviser(Vf, Nf, Tf, corpsTf, zoneTf, planf)
    Mtot = M @ Mtot
NVF = len(Vf)
zonef = np.zeros(NVF, np.int64); zonef[:NV0] = zone          # (les sommets ajoutés sont tous du corps)
dbordf = Mtot @ dbord; brasf = Mtot @ bras; Wf = (Mtot @ Wg).astype(np.float32)

# ---------------------------------------------------------------- le bras : partage net entre ses os
# La diffusion dit quelle part de chaque sommet revient au bras (face à la ceinture, au tronc, à la main). Entre les os
# du bras lui-même, le partage est écrit d'après la place du sommet :
#  - le long de l'os, entre les deux nœuds qui l'encadrent : la torsion varie en continu ;
#  - au coude, une frontière nette derrière et remontée de deux centimètres (l'olécrane appartient à l'avant-bras : il
#    fait la pointe du coude quand le bras se plie), plus large devant, où la peau se replie.
iB = np.array([IOS[n] for n in BRAS_N]); iA = np.array([IOS[n] for n in AVB_N])
L_h, L_f = np.linalg.norm(co - ep), np.linalg.norm(po - co); a_h, a_f = (co - ep) / L_h, (po - co) / L_f
d_ = C['radius.G'] - C['ulna.G']; n_coude = d_ - (d_ @ a_h) * a_h; n_coude = -n_coude / np.linalg.norm(n_coude)   # axe de flexion (vers le dedans)
a_moy = (a_h + a_f) / np.linalg.norm(a_h + a_f); devant = np.cross(n_coude, a_moy); devant /= np.linalg.norm(devant)
liss_ = lambda t: np.clip(t, 0, 1) ** 2 * (3 - 2 * np.clip(t, 0, 1))
COUDE_DOS = [float(x) for x in os.environ.get('COUDE_DOS', '-0.018,0.012').split(',')]      # frontière et demi-largeur derrière (m)
COUDE_DEVANT = [float(x) for x in os.environ.get('COUDE_DEVANT', '0.004,0.022').split(',')]  # … et devant
def part_avantbras(P):
    s_, g_ = (P - co) @ a_moy, (P - co) @ devant
    q = liss_(g_ / 0.03)        # (toute la moitié arrière du coude suit la règle de derrière : une pointe large)
    s0 = COUDE_DOS[0] + (COUDE_DEVANT[0] - COUDE_DOS[0]) * q; h = COUDE_DOS[1] + (COUDE_DEVANT[1] - COUDE_DOS[1]) * q
    return liss_((s_ - s0) / (2 * h) + 0.5)
def chapeaux(t, N):
    x = np.clip(t, 0, 1) * (N - 1); k0 = np.minimum(np.floor(x).astype(np.int64), N - 2); f = x - k0
    H = np.zeros((len(t), N)); H[np.arange(len(t)), k0] = 1 - f; H[np.arange(len(t)), k0 + 1] = f
    return H
# La ceinture scapulaire ne tient que le deltoïde. La diffusion laissait sa part traîner jusqu'au milieu du bras (30 à
# 50 % sur le haut du biceps et du triceps) : bras levé, la moitié haute du bras restait en arrière et le bras
# s'étranglait en chapelet. Sur la peau du bras, les parts qui ne sont pas du bras s'éteignent entre EPAULE_FIN[0] et
# EPAULE_FIN[1] mètres sous l'épaule.
EPAULE_FIN = [float(x) for x in os.environ.get('EPAULE_FIN', '0.0,0.07').split(',')]
s_ep = (Vf - ep) @ a_h
k_ep = liss_((brasf - 0.3) / 0.4) * liss_((s_ep - EPAULE_FIN[0]) / (EPAULE_FIN[1] - EPAULE_FIN[0]))
autres = np.ones(NB, bool); autres[iB] = False; autres[iA] = False
for n_ in ['main.G'] + DOIGTS: autres[IOS[n_]] = False
retire = (Wf[:, autres] * k_ep[:, None]).sum(1)
Wf[:, autres] *= (1 - k_ep)[:, None]
Wf[:, iB[0]] += retire          # (rendu au bras ; le partage entre ses nœuds vient juste après)
# À l'inverse, le bras ne tient pas le tronc : la diffusion lui donnait prise jusqu'à vingt centimètres de l'épaule (9 %
# en moyenne sur le grand dorsal, le pectoral, le dentelé), et bras levé le tronc se soulevait en « ailes » sous
# l'aisselle. La part de bras s'éteint là où la peau d'origine n'est pas du bras (TRONC_BRAS : de rien à tout).
TRONC_BRAS = [float(x) for x in os.environ.get('TRONC_BRAS', '0.05,0.35').split(',')]
g_tr = liss_((brasf - TRONC_BRAS[0]) / (TRONC_BRAS[1] - TRONC_BRAS[0]))
cols_b = np.r_[iB, iA]
Wf[:, cols_b] *= g_tr[:, None]
tot_ = Wf.sum(1); Wf /= np.maximum(tot_, 1e-9)[:, None]
m_bras = Wf[:, iB].sum(1) + Wf[:, iA].sum(1); selb = np.flatnonzero(m_bras > 1e-5)
if os.environ.get('BRAS_NET', '1') == '1':
    Pb = Vf[selb]; wf_ = part_avantbras(Pb)
    Wf[np.ix_(selb, iB)] = (m_bras[selb] * (1 - wf_))[:, None] * chapeaux(((Pb - ep) @ a_h) / L_h, NBR)
    Wf[np.ix_(selb, iA)] = (m_bras[selb] * wf_)[:, None] * chapeaux(((Pb - co) @ a_f) / L_f, NAV)
    chrono(f'bras : {len(selb)} sommets partagés entre {NBR} + {NAV} nœuds')
chrono(f'corps affiné {AFFINAGES} fois : {NVF} sommets, {len(Tf)} triangles (côté gauche)')

# ---------------------------------------------------------------- le relief : chaque sommet du corps posé sur le muscle sous lui
Nf = normales(Vf, Tf, planf)
corpsV = np.zeros(NVF, bool); corpsV[np.unique(Tf[corpsTf])] = True; corpsV &= zonef == 0
ic = np.flatnonzero(corpsV)
piece, haut, piece2, cotep = dessous(Vf[ic], Nf[ic], brasf[ic])
delta = np.where(np.isnan(haut), -CREUX * 0.85, np.clip(haut + EPAISSEUR, -CREUX, BOSSE))
chrono(f'relief : {int(np.isnan(haut).sum())} sommets sans muscle dessous sur {len(ic)} ; écart médian {np.nanmedian(haut) * 1000:.2f} mm')
# Un peu de détente (le relief garde ses arêtes, les sommets isolés rentrent dans le rang).
Ef, _, _ = aretes(Tf, NVF)
Af = sp.coo_matrix((np.ones(len(Ef) * 2), (np.r_[Ef[:, 0], Ef[:, 1]], np.r_[Ef[:, 1], Ef[:, 0]])), shape=(NVF, NVF)).tocsr()
degf = np.maximum(np.asarray(Af.sum(1)).ravel(), 1)
d_all = np.zeros(NVF); d_all[ic] = delta
for _ in range(int(os.environ.get('DETENTE', '2'))):
    moy = (Af @ d_all) / degf
    d_all[ic] = 0.55 * d_all[ic] + 0.45 * moy[ic]
lisse = lambda t: np.clip(t, 0, 1) ** 2 * (3 - 2 * np.clip(t, 0, 1))
rac = lisse(dbordf / BANDE)
Vrel = Vf + Nf * (d_all * rac * corpsV)[:, None]
Vrel[planf, 0] = 0
profondeur = np.zeros(NVF, np.float32); profondeur[ic] = d_all[ic] * rac[ic]

# Muscle recouvert (rang de la structure de l'appli, -1 : aucun ou un os), muscle plus profond, sens des fibres.
st_de = np.array([p['st'] for p in pieces] + [-1])
muscle = -np.ones(NVF, np.int64); muscle2 = -np.ones(NVF, np.int64); fibre = np.zeros((NVF, 3), np.float32)
muscle[ic] = st_de[piece]; muscle2[ic] = st_de[piece2]
# Un muscle aperçu au fond d'une fente (entre le deltoïde et le pectoral, on voit le biceps) n'est pas celui que la peau
# recouvre : ces sommets-là prennent le muscle de leurs voisins, de proche en proche.
fond = np.zeros(NVF, bool); fond[ic] = np.isnan(haut) | (haut < -(CREUX + 0.0015))
m_ok = muscle.copy(); m_ok[fond] = -2; m2_ok = muscle2.copy()
for _ in range(12):
    a_ = np.flatnonzero(m_ok == -2)
    if not len(a_): break
    src = np.r_[Ef[:, 0], Ef[:, 1]]; dst = np.r_[Ef[:, 1], Ef[:, 0]]
    k = (m_ok[dst] == -2) & (m_ok[src] != -2)
    nouveau = m_ok.copy(); nouveau[dst[k]] = m_ok[src[k]]; n2 = m2_ok.copy(); n2[dst[k]] = m2_ok[src[k]]
    m_ok, m2_ok = nouveau, n2
m_ok[m_ok == -2] = -1
chrono(f'muscle au fond d\'une fente : {int(fond.sum())} sommets repris de leurs voisins')
muscle, muscle2 = m_ok, m2_ok
for k, i in enumerate(ic):
    if piece[k] < 0: continue
    p = pieces[piece[k]]; s = -1.0 if cotep[k] else 1.0
    if p['type'] == 'os': continue
    q = Vrel[i] * [s, 1, 1]
    d = (p['conv'] - q) if p['conv'] is not None else p['axe']
    l = np.linalg.norm(d); d = d / l if l > 1e-6 else p['axe']
    fibre[i] = d * [s, 1, 1]
chrono(f'muscles : {int((muscle >= 0).sum())} sommets sur un muscle, {len(np.unique(muscle[muscle >= 0]))} structures visibles en surface')

# ---------------------------------------------------------------- carrure (facultatif)
# GONFLE (mm) : les muscles épaissis sous la peau — la surface avance le long de sa normale, plus ou moins selon la
# région du muscle recouvert (épaules, bras, pectoraux et cuisses surtout ; presque rien au ventre, rien aux
# articulations, à la tête, aux mains et aux pieds). Le champ est lissé : le relief garde son dessin.
GONFLE = float(os.environ.get('GONFLE', '0')) / 1000
if GONFLE > 0:
    PART = {'epaule': 1.0, 'bras': 1.0, 'thorax': 0.9, 'dos': 0.7, 'avant_bras': 0.65, 'cuisse': 0.8, 'jambe': 0.55, 'bassin': 0.45, 'abdomen': 0.12, 'cou': 0.25}
    part_st = np.array([PART.get(s_['region'], 0.0) for s_ in H['structures']] + [0.0])
    g = np.where(corpsV, part_st[muscle], 0.0) * rac
    for _ in range(int(os.environ.get('GONFLE_LISSE', '60'))): g = 0.5 * g + 0.5 * (Af @ g) / degf
    Nl = normales(Vrel, Tf, planf)
    for _ in range(8): Nl = 0.5 * Nl + 0.5 * (Af @ Nl) / degf[:, None]
    Nl /= np.maximum(np.linalg.norm(Nl, axis=1, keepdims=True), 1e-20)
    Vrel = Vrel + Nl * (g * GONFLE)[:, None]; Vrel[planf, 0] = 0
    chrono(f'carrure : jusqu\'à {g.max() * GONFLE * 1000:.1f} mm, {float((g * GONFLE)[corpsV].mean()) * 1000:.1f} mm en moyenne sur le corps')

# ---------------------------------------------------------------- l'avant-bras adouci (clé de forme)
# En pronation, le relief des muscles de l'avant-bras, sculpté paume vers l'avant, tourne en hélice : on dirait une
# corde tordue. Sous la peau d'un vrai bras ce dessin s'efface quand la main tourne. Une seconde forme de l'avant-bras,
# au relief lissé (la distance à l'axe de l'avant-bras est moyennée de proche en proche : les sillons disparaissent,
# les masses et le volume restent), prend le relais à mesure que la pronation augmente (réglé au rendu).
LISSE_TOURS = int(os.environ.get('LISSE_TOURS', '90'))
wA = Wf[:, iA].sum(1); tf_ = ((Vrel - co) @ a_f) / L_f
dans_ab = wA > 0.02
r_ = (Vrel - co) - np.outer((Vrel - co) @ a_f, a_f); rho = np.linalg.norm(r_, axis=1); u_ = r_ / np.maximum(rho, 1e-9)[:, None]
x_ = rho.copy()
for _ in range(LISSE_TOURS):
    moy = (Af @ x_) / degf
    x_ = np.where(dans_ab, 0.5 * x_ + 0.5 * moy, x_)
masque_ab = np.clip(wA * 1.15, 0, 1) * liss_((tf_ - 0.03) / 0.14)
lisse_ab = ((x_ - rho) * masque_ab)[:, None] * u_
lisse_ab[planf] = 0
chrono(f"avant-bras adouci : {int(dans_ab.sum())} sommets, déplacement jusqu'à {np.abs((x_ - rho) * masque_ab).max() * 1000:.1f} mm")

# ---------------------------------------------------------------- le corps entier : gauche + miroir + cheveux
vers_d = np.arange(NVF) + NVF; vers_d[planf] = np.flatnonzero(planf)
garde_d = ~planf                                              # les sommets de la couture ne sont pas doublés
rang_d = -np.ones(NVF, np.int64); rang_d[garde_d] = NVF + np.arange(int(garde_d.sum())); rang_d[planf] = np.flatnonzero(planf)
VT = np.concatenate([Vrel, (Vrel * [-1, 1, 1])[garde_d]])
TT = np.concatenate([Tf, rang_d[Tf][:, [0, 2, 1]]])
zoneTT = np.concatenate([zoneTf, zoneTf])
zoneV = np.concatenate([zonef, zonef[garde_d]])
WT = np.concatenate([Wf, Wf[:, JUM_OS][garde_d]])
musT = np.concatenate([muscle, muscle[garde_d]]); mus2T = np.concatenate([muscle2, muscle2[garde_d]])
fibT = np.concatenate([fibre, (fibre * [-1, 1, 1])[garde_d]])
profT = np.concatenate([profondeur, profondeur[garde_d]])
lisseT = np.concatenate([lisse_ab, (lisse_ab * [-1, 1, 1])[garde_d]])
brasT = np.concatenate([brasf, brasf[garde_d]])
coteV = np.concatenate([np.zeros(NVF, np.int8), np.ones(int(garde_d.sum()), np.int8)]); coteV[np.flatnonzero(planf)] = 2
corpsVT = np.concatenate([corpsV, corpsV[garde_d]])
# Les cheveux (au milieu, une seule fois) : rigides avec la tête.
uh = np.unique(Timpairs); rh = -np.ones(NR, np.int64); rh[uh] = len(VT) + np.arange(len(uh))
VT = np.concatenate([VT, Pr[uh]]); TT = np.concatenate([TT, rh[Timpairs]]); zoneTT = np.concatenate([zoneTT, zr[Timpairs[:, 0]]])
zoneV = np.concatenate([zoneV, zr[uh]])
Wh = np.zeros((len(uh), NB), np.float32); Wh[:, IOS['tete']] = 1; WT = np.concatenate([WT, Wh])
musT = np.concatenate([musT, -np.ones(len(uh), np.int64)]); mus2T = np.concatenate([mus2T, -np.ones(len(uh), np.int64)])
fibT = np.concatenate([fibT, np.zeros((len(uh), 3), np.float32)]); profT = np.concatenate([profT, np.zeros(len(uh), np.float32)])
lisseT = np.concatenate([lisseT, np.zeros((len(uh), 3))]); brasT = np.concatenate([brasT, np.zeros(len(uh))])
coteV = np.concatenate([coteV, np.full(len(uh), 2, np.int8)]); corpsVT = np.concatenate([corpsVT, np.zeros(len(uh), bool)])
# Les poils, les yeux et les ongles suivent un seul os (celui de leur étiquette) : pas de mélange.
rig = np.isin(zoneV, [Z['ongle'], Z['poil'], Z['oeil'], Z['cheveux']])
WTr = np.zeros_like(WT[rig]); WTr[np.arange(int(rig.sum())), np.argmax(WT[rig], axis=1)] = 1; WT[rig] = WTr
chrono(f'corps entier : {len(VT)} sommets, {len(TT)} triangles')

# Quatre os au plus par sommet (les plus forts), poids renormalisés.
ordre = np.argsort(-WT, axis=1)[:, :4]
Wq = np.take_along_axis(WT, ordre, axis=1); Wq[Wq < 0.004] = 0; Wq /= Wq.sum(1, keepdims=True)

np.savez_compressed(SORTIE, V=VT.astype(np.float32), T=TT.astype(np.int32), zoneT=zoneTT.astype(np.int8), zoneV=zoneV.astype(np.int8),
                    os_i=ordre.astype(np.int16), os_w=Wq.astype(np.float32), muscle=musT.astype(np.int16), muscle2=mus2T.astype(np.int16),
                    fibre=fibT, profondeur=profT, cote=coteV, corps=corpsVT, lisse=lisseT.astype(np.float32), bras=brasT.astype(np.float32),
                    meta=json.dumps({'os': [{'nom': o['nom'], 'segs': [[a.tolist(), b.tolist()] for a, b in o['segs']], 'pose': o['pose']} for o in OS],
                                     'zones': ZONES, 'oeil': H['oeil'], 'squelette': SQ, 'structures': H['structures'], 'affinages': AFFINAGES}))
chrono(f'écrit {SORTIE}')

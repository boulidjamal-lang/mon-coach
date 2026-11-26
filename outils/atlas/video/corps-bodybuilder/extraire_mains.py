# Les mains du mannequin actuel, posées image par image comme dans notre curl (doigts serrés sur l'haltère),
# avec le poignet et la rotation de la main : de quoi les greffer au bodybuilder.
import sys, os, json, math
import numpy as np, bpy
from mathutils import Matrix
O, BLEND, NPZ, MOUV, SORTIE = sys.argv[-5:]
sys.path.insert(0, O)
from poses import Poseur
bpy.ops.wm.open_mainfile(filepath=BLEND)
D = np.load(NPZ); meta = json.loads(str(D['meta'])); OS = meta['os']
corps = bpy.data.objects['corps']; arm = bpy.data.objects['squelette']
for m in corps.modifiers:
    if m.type == 'MASK': m.show_viewport = m.show_render = False
B3 = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], float); B4 = np.eye(4); B4[:3, :3] = B3
MV = json.load(open(MOUV)); poseur = Poseur(meta)
REST = {o['nom']: arm.data.bones[o['nom']].matrix_local.copy() for o in OS}
def poser(dq):
    for o, (R, t) in zip(OS, poseur.poser(dq)):
        X = np.eye(4); X[:3, :3] = R; X[:3, 3] = t
        arm.pose.bones[o['nom']].matrix_basis = REST[o['nom']].inverted() @ Matrix((B4 @ X @ B4.T).tolist()) @ REST[o['nom']]
me = corps.data; NV = len(me.vertices)
gid = {g.name: g.index for g in corps.vertex_groups}
res = {}
for cote in ('G', 'D'):
    noms = [n for n in gid if n.endswith('.' + cote) and (n.startswith('main') or n.startswith('doigt'))]
    ids = {gid[n] for n in noms}
    w = np.zeros(NV)
    for v in me.vertices:
        for g in v.groups:
            if g.group in ids: w[v.index] += g.weight
    sel = np.where(w > 0.5)[0]
    # faces entièrement dans la sélection
    garde = np.zeros(NV, bool); garde[sel] = True
    faces = [list(p.vertices) for p in me.polygons if all(garde[i] for i in p.vertices)]
    remap = -np.ones(NV, np.int64); remap[sel] = np.arange(len(sel))
    tri = []
    for f in faces:
        f = [remap[i] for i in f]
        for k in range(1, len(f) - 1): tri.append([f[0], f[k], f[k + 1]])
    res[cote] = (sel, np.array(tri, np.int64))
    print(cote, 'sommets main', len(sel), 'triangles', len(tri), flush=True)
pos = {c: [] for c in res}; poignet = {c: [] for c in res}; rot = {c: [] for c in res}
dg = bpy.context.evaluated_depsgraph_get()
for i, im in enumerate(MV['images']):
    poser(np.array(im['dq'], float).reshape(-1, 8)); dg.update()
    ev = corps.evaluated_get(dg); m2 = ev.to_mesh()
    co = np.zeros(len(m2.vertices) * 3); m2.vertices.foreach_get('co', co); co = co.reshape(-1, 3); ev.to_mesh_clear()
    assert len(co) == NV, (len(co), NV)
    Mw = np.array(corps.matrix_world)
    co = co @ Mw[:3, :3].T + Mw[:3, 3]
    for c in res:
        pos[c].append(co[res[c][0]].astype(np.float32))
        pb = arm.pose.bones['main.' + c]; Mb = arm.matrix_world @ pb.matrix
        poignet[c].append(np.array(Mb.translation)); rot[c].append(np.array(Mb.to_3x3()))
    if i % 10 == 0: print('image', i, flush=True)
np.savez_compressed(SORTIE, **{f'pos_{c}': np.array(pos[c]) for c in res}, **{f'tri_{c}': res[c][1] for c in res},
                    **{f'poignet_{c}': np.array(poignet[c]) for c in res}, **{f'rot_{c}': np.array(rot[c]) for c in res})
print('fini')

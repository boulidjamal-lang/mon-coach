# Le corps du mannequin actuel posé sur une image d'un mouvement : tous ses sommets (pour reporter sa carte des muscles).
import sys, json, numpy as np, bpy
from mathutils import Matrix
O, BLEND, NPZ, MOUV, IMG, SORTIE = sys.argv[-6:]
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
dq = np.array(MV['images'][int(IMG)]['dq'], float).reshape(-1, 8)
for o, (R, t) in zip(OS, poseur.poser(dq)):
    X = np.eye(4); X[:3, :3] = R; X[:3, 3] = t
    arm.pose.bones[o['nom']].matrix_basis = REST[o['nom']].inverted() @ Matrix((B4 @ X @ B4.T).tolist()) @ REST[o['nom']]
dg = bpy.context.evaluated_depsgraph_get(); dg.update()
ev = corps.evaluated_get(dg); m2 = ev.to_mesh()
co = np.zeros(len(m2.vertices) * 3); m2.vertices.foreach_get('co', co); co = co.reshape(-1, 3); ev.to_mesh_clear()
Mw = np.array(corps.matrix_world); co = co @ Mw[:3, :3].T + Mw[:3, 3]
np.savez_compressed(SORTIE, V=co.astype(np.float32), muscle=D['muscle'], muscle2=D['muscle2'], cote=D['cote'], zoneV=D['zoneV'], corps=D['corps'])
print('fini', co.shape)

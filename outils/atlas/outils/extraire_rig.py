# Extrait de Z-Biomechanics le squelette articulé : os (parent, tête, queue, limites de rotation) et, pour chaque
# pièce du squelette, l'os auquel elle est attachée. Usage : python extraire_rig.py <Startup.blend> <sortie.json>
import bpy, sys, json
src, sortie = sys.argv[-2], sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=src)
arm = bpy.data.objects['Armature']
M = arm.matrix_world
os_ = []
for b in arm.data.bones:
    pb = arm.pose.bones[b.name]
    lim = None
    for c in pb.constraints:
        if c.type == 'LIMIT_ROTATION':
            lim = {'x': [c.min_x, c.max_x] if c.use_limit_x else None, 'y': [c.min_y, c.max_y] if c.use_limit_y else None, 'z': [c.min_z, c.max_z] if c.use_limit_z else None, 'espace': c.owner_space}
    os_.append({'nom': b.name, 'parent': b.parent.name if b.parent else None, 'tete': [round(x, 5) for x in (M @ b.head_local)], 'queue': [round(x, 5) for x in (M @ b.tail_local)],
                'x': [round(x, 4) for x in (M.to_3x3() @ b.matrix_local.to_3x3().col[0])], 'limites': lim})
pieces = {}
for o in bpy.data.objects:
    if o.type == 'MESH' and o.parent == arm and o.parent_type == 'BONE':
        pieces[o.name] = o.parent_bone
json.dump({'source': 'Z-Biomechanics (Z-Anatomy), CC BY-SA 4.0', 'os': os_, 'pieces': pieces}, open(sortie, 'w'), ensure_ascii=False, indent=0)
print('os', len(os_), '| pièces attachées', len(pieces))

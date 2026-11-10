# Inspecte un fichier Blender : armatures, os, liaisons des maillages (parent, groupes de sommets, contraintes).
import bpy, sys, collections
bpy.ops.wm.open_mainfile(filepath=sys.argv[-1])
print('Blender', bpy.app.version_string, '| objets', len(bpy.data.objects), '| actions', len(bpy.data.actions), '| armatures', len(bpy.data.armatures))
types = collections.Counter(o.type for o in bpy.data.objects); print('types', dict(types))
for a in bpy.data.objects:
    if a.type != 'ARMATURE': continue
    os_ = a.data.bones
    print('ARMATURE', a.name, '| os', len(os_), '| parent', a.parent.name if a.parent else None)
    for b in list(os_)[:400]:
        print('   os', b.name, '| parent', b.parent.name if b.parent else None, '| tete', [round(x, 3) for x in (a.matrix_world @ b.head_local)], '| queue', [round(x, 3) for x in (a.matrix_world @ b.tail_local)], '| deforme', b.use_deform)
    pb = a.pose.bones
    contraintes = collections.Counter(c.type for b in pb for c in b.constraints); print('   contraintes des os', dict(contraintes))
mods = collections.Counter(); parents = collections.Counter(); vg = 0; cons = collections.Counter(); cles = 0; exemples = []
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    for m in o.modifiers: mods[m.type] += 1
    parents[(o.parent.type if o.parent else None, o.parent_type if o.parent else None)] += 1
    if o.vertex_groups: vg += 1
    for c in o.constraints: cons[c.type] += 1
    if o.data.shape_keys: cles += 1
    if (o.vertex_groups or o.parent_type == 'BONE' or any(m.type == 'ARMATURE' for m in o.modifiers)) and len(exemples) < 25:
        exemples.append((o.name, o.parent.name if o.parent else None, o.parent_type, o.parent_bone, [g.name for g in o.vertex_groups][:6], [m.type for m in o.modifiers]))
print('modificateurs des maillages', dict(mods)); print('parents', dict(parents)); print('maillages avec groupes de sommets', vg, '| contraintes', dict(cons), '| avec clés de forme', cles)
for e in exemples: print('  ex', e)
print('collections', [c.name for c in bpy.data.collections][:40])

# Extrait du fichier Blender de Z-Anatomy les maillages d'un ou plusieurs systèmes, modificateurs appliqués,
# en coordonnées du monde. Sortie : un fichier binaire simple (en-tête JSON + tableaux), un objet par structure.
# Usage : python extraire_blend.py <Startup.blend> <sortie.bin> "<collection de premier niveau>" [...]
import bpy, sys, json, struct
import numpy as np
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
chemin, sortie, systemes = args[0], args[1], args[2:]
bpy.ops.wm.open_mainfile(filepath=chemin, load_ui=False)
parent = {}
def parcourir(c, chem):
    for e in c.children:
        parent[e.name] = chem + [c.name]
        parcourir(e, chem + [c.name])
parcourir(bpy.data.scenes[0].collection, [])
def chemin_objet(o):
    for c in o.users_collection:
        ch = parent.get(c.name, []) + [c.name]
        if len(ch) >= 2 and ch[1] in systemes: return ch[1:]
    return None
cibles = [(o, chemin_objet(o)) for o in bpy.data.objects if o.type == 'MESH']
cibles = [(o, ch) for o, ch in cibles if ch]
# Une scène à part où tout est visible, pour évaluer les modificateurs.
sc = bpy.data.scenes.new('extraction')
for o, _ in cibles:
    sc.collection.objects.link(o)
    o.hide_viewport = False; o.hide_render = False
vl = sc.view_layers[0]
vl.update()
dg = vl.depsgraph
entete, blocs, decalage = [], [], 0
for o, ch in cibles:
    oe = o.evaluated_get(dg)
    try: m = oe.to_mesh()
    except Exception as e: print('échec', o.name, e); continue
    if not m or not len(m.polygons): 
        if m: oe.to_mesh_clear()
        continue
    m.calc_loop_triangles()
    nv, nt = len(m.vertices), len(m.loop_triangles)
    co = np.empty(nv * 3, dtype=np.float32); m.vertices.foreach_get('co', co)
    M = np.array(o.matrix_world, dtype=np.float64)
    P = co.reshape(-1, 3).astype(np.float64) @ M[:3, :3].T + M[:3, 3]
    tri = np.empty(nt * 3, dtype=np.int32); m.loop_triangles.foreach_get('vertices', tri)
    mat = np.empty(nt, dtype=np.int32); m.loop_triangles.foreach_get('material_index', mat)
    if np.linalg.det(M[:3, :3]) < 0: tri = tri.reshape(-1, 3)[:, ::-1].reshape(-1)   # objet en miroir : faces retournées
    p32, t32, m8 = P.astype(np.float32).tobytes(), tri.astype(np.uint32).tobytes(), mat.astype(np.uint8).tobytes()
    m8 += b'\0' * ((4 - len(m8) % 4) % 4)
    entete.append({'nom': o.name, 'chemin': ch, 'mats': [s.material.name if s.material else None for s in o.material_slots], 'mods': [md.type for md in o.modifiers],
                   'nv': nv, 'nt': nt, 'pos': decalage, 'tri': decalage + len(p32), 'mat': decalage + len(p32) + len(t32), 'parent': o.parent.name if o.parent else None})
    blocs += [p32, t32, m8]; decalage += len(p32) + len(t32) + len(m8)
    oe.to_mesh_clear()
h = json.dumps(entete).encode('utf-8'); h += b' ' * ((4 - len(h) % 4) % 4)
with open(sortie, 'wb') as f:
    f.write(struct.pack('<I', len(h))); f.write(h)
    for b in blocs: f.write(b)
print('objets', len(entete), '| sommets', sum(e['nv'] for e in entete), '| triangles', sum(e['nt'] for e in entete), '| octets', decalage)

import bpy, sys, math, numpy as np
from mathutils import Vector
GLB, CARTE, SORTIE = sys.argv[-3:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
o = [x for x in bpy.data.objects if x.type == 'MESH'][0]
k = 1.80 / 12.21
for p in [x for x in bpy.data.objects if x.parent is None]: p.scale = (k, k, k); p.location.z = 0.693 * k
C = np.load(CARTE); mu = C['muscle'].astype(int)
rng = np.random.default_rng(5); pal = rng.uniform(0.15, 1, (400, 3)); col = np.where(mu[:, None] >= 0, pal[np.maximum(mu, 0)], 0.85)
a = o.data.color_attributes.new('c', 'FLOAT_COLOR', 'POINT'); a.data.foreach_set('color', np.c_[col, np.ones(len(col))].astype(np.float32).ravel())
m = bpy.data.materials.new('m'); m.use_nodes = True; N = m.node_tree.nodes; at = N.new('ShaderNodeAttribute'); at.attribute_name = 'c'
m.node_tree.links.new(at.outputs['Color'], N['Principled BSDF'].inputs['Base Color']); o.data.materials.clear(); o.data.materials.append(m)
for f in o.data.polygons: f.use_smooth = True
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 8; sc.render.resolution_x, sc.render.resolution_y = 700, 560
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[1].default_value = 1.5
cam = bpy.data.cameras.new('c'); cam.lens = 50; co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
for nom, loc in (('face', (0, -5.2, 1.0)), ('dos', (0, 5.2, 1.0))):
    co.location = loc; co.rotation_euler = (Vector((0, 0, 1.0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{SORTIE}-{nom}.png'; bpy.ops.render.render(write_still=True)

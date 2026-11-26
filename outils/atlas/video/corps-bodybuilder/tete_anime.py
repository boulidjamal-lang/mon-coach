# Tête de style anime construite de zéro (aucun modèle existant) : crâne et menton pointu, grands yeux avec reflet,
# sourcils, petit nez, bouche, oreilles, cheveux en mèches pointues. Coordonnées du corps au repos (z en haut, -y devant).
import math, random
import numpy as np, bpy
from mathutils import Vector, Matrix

def _obj(nom, mat):
    o = bpy.context.active_object; o.name = nom
    o.data.materials.clear(); o.data.materials.append(mat)
    for f in o.data.polygons: f.use_smooth = True
    return o

def _co(o): a = np.zeros(len(o.data.vertices) * 3); o.data.vertices.foreach_get('co', a); return a.reshape(-1, 3)
def _set(o, P): o.data.vertices.foreach_set('co', np.asarray(P, float).ravel()); o.data.update()

def construire(peau, cheveux, yeux, reflet, base=(0.0, 0.055, 1.80), echelle=1.0, graine=7):
    bx, by, bz = base; E = echelle; parts = []
    C = np.array([0, by - 0.012 * E, bz + 0.07 * E]); RX, RY, RZ = 0.086 * E, 0.100 * E, 0.114 * E
    # cou
    bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=1, depth=1)
    o = _obj('cou', peau); P = _co(o); z = P[:, 2] + 0.5
    P = np.c_[P[:, 0] * 0.068 * E, by + P[:, 1] * 0.072 * E - 0.010 * E * z, bz - 0.10 + z * (0.14 * E)]
    _set(o, P); parts.append(o)
    # crâne et visage
    bpy.ops.mesh.primitive_uv_sphere_add(segments=72, ring_count=40, radius=1)
    o = _obj('crane', peau); P = _co(o)
    rz = P[:, 2]
    def lis(t): t = np.clip(t, 0, 1); return t * t * (3 - 2 * t)
    sx = 1 - 0.12 * lis((-0.1 - rz) / 0.6) - 0.22 * lis((-0.62 - rz) / 0.38)
    rz = np.where(rz < 0, rz * 0.92, rz)
    devant = P[:, 1] < 0
    y = P[:, 1] * np.where(devant, 1.0, 1.0 - 0.10 * lis(-rz))
    y = y - np.where(devant, 0.06 * lis((-0.3 - rz) / 0.7), 0)          # menton un peu en avant
    P = np.c_[C[0] + P[:, 0] * RX * sx, C[1] + y * RY, C[2] + rz * RZ]
    _set(o, P); parts.append(o); crane = P
    def face_y(x, z):
        m = (np.abs(crane[:, 0] - x) < 0.006 * E) & (np.abs(crane[:, 2] - z) < 0.006 * E) & (crane[:, 1] < C[1])
        return crane[m, 1].min()
    # oreilles
    for sg in (1, -1):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1); o = _obj('oreille', peau)
        o.scale = (0.012 * E, 0.022 * E, 0.030 * E); o.location = (sg * (RX * 0.98), C[1] + 0.012 * E, C[2] - 0.012 * E); parts.append(o)
    # yeux, reflets, sourcils
    ze = C[2] - 0.006 * E
    for sg in (1, -1):
        xe = sg * 0.033 * E; ye = face_y(xe, ze)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1); o = _obj('oeil', yeux)
        o.scale = (0.017 * E, 0.006 * E, 0.023 * E); o.location = (xe, ye + 0.002 * E, ze); o.rotation_euler = (0, sg * math.radians(-8), 0); parts.append(o)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1); o = _obj('reflet', reflet)
        o.scale = (0.0045 * E,) * 3; o.location = (xe + sg * 0.006 * E, ye - 0.002 * E, ze + 0.009 * E); parts.append(o)
        bpy.ops.mesh.primitive_cube_add(size=1); o = _obj('sourcil', cheveux)
        o.scale = (0.026 * E, 0.006 * E, 0.0045 * E); o.location = (sg * 0.035 * E, face_y(sg * 0.035 * E, ze + 0.033 * E) + 0.001 * E, ze + 0.033 * E)
        o.rotation_euler = (0, sg * math.radians(14), 0); parts.append(o)
    # nez et bouche
    zn = C[2] - 0.045 * E
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.006 * E, depth=0.012 * E); o = _obj('nez', peau)
    o.location = (0, face_y(0, zn) - 0.004 * E, zn); o.rotation_euler = (math.radians(100), 0, 0); parts.append(o)
    zb = C[2] - 0.072 * E
    bpy.ops.mesh.primitive_cube_add(size=1); o = _obj('bouche', yeux)
    o.scale = (0.017 * E, 0.004 * E, 0.0022 * E); o.location = (0, face_y(0, zb) + 0.0015 * E, zb); parts.append(o)
    # cheveux : calotte + mèches pointues
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=1); o = _obj('calotte', cheveux)
    P = _co(o); n = P.copy()
    garde = np.where(P[:, 1] < 0, P[:, 2] > 0.22, P[:, 2] > -0.50) & ~((np.abs(P[:, 0]) > 0.82) & (P[:, 2] < 0.15) & (P[:, 1] < 0.35))
    P = np.c_[C[0] + P[:, 0] * RX * 1.12, C[1] + P[:, 1] * RY * 1.10, C[2] + 0.012 * E + P[:, 2] * RZ * 1.12]
    _set(o, P)
    import bmesh
    bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not garde[v.index]], context='VERTS'); bm.to_mesh(o.data); bm.free()
    sol = o.modifiers.new('ep', 'SOLIDIFY'); sol.thickness = 0.006 * E; parts.append(o)
    rnd = random.Random(graine)
    meches = []
    for k in range(110):
        th = rnd.uniform(0, 2 * math.pi); ph = rnd.uniform(0.05, 1.4)
        d = np.array([math.cos(ph) * math.sin(th), math.cos(ph) * math.cos(th), math.sin(ph)])  # y>0 = arrière
        if d[1] < -0.2 and d[2] < 0.55: continue
        meches.append((d, rnd.uniform(0.035, 0.065) * E * (1.2 if d[1] > 0.2 else 1.0), rnd.uniform(0.028, 0.040) * E, 'haut'))
    for k in range(9):
        x = -0.072 + k * 0.018; d = np.array([x / 0.1, -0.72, 0.58])
        meches.append((d / np.linalg.norm(d), rnd.uniform(0.05, 0.07) * E, 0.026 * E, 'frange'))
    for d, L, r, typ in meches:
        p = C + np.array([d[0] * RX * 1.05, d[1] * RY * 1.05, d[2] * RZ * 1.05])
        nn = np.array([d[0] / RX, d[1] / RY, d[2] / RZ]); nn /= np.linalg.norm(nn)
        if typ == 'haut': v = nn + np.array([0, 0.55, 0.45]); 
        else: v = 0.35 * nn + np.array([0, -0.25, -1.0])
        v /= np.linalg.norm(v)
        bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=r, radius2=0, depth=L); o = _obj('meche', cheveux)
        o.rotation_euler = Vector((0, 0, 1)).rotation_difference(Vector(v)).to_euler()
        o.location = Vector(p + v * (L / 2 - 0.012 * E)); parts.append(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts: o.select_set(True)
    bpy.context.view_layer.objects.active = parts[1]
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.join(); t = bpy.context.active_object; t.name = 'tete'
    return t

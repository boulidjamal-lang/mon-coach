# Pose des os de déformation du mannequin à partir des articulations du moteur de l'appli (quaternions duaux).
# Coordonnées de l'appli (y en haut, z vers l'avant, x vers la gauche du corps).
import numpy as np

def qmat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
                     [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
                     [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]])

def rt(dq):
    l = np.linalg.norm(dq[:4]); q = dq[:4] / l; d = dq[4:] / l
    v, w = q[:3], q[3]
    return qmat(q), 2 * (w * d[:3] - d[3] * v + np.cross(v, d[:3]))

def unite(v):
    return v / max(np.linalg.norm(v), 1e-12)

def rot_axe(n, a):
    n = unite(n); K = np.array([[0, -n[2], n[1]], [n[2], 0, -n[0]], [-n[1], n[0], 0]])
    return np.eye(3) + np.sin(a) * K + (1 - np.cos(a)) * (K @ K)

def rot_min(a, b):
    """La plus petite rotation qui amène a sur b (unitaires)."""
    c = float(a @ b)
    if c > 1 - 1e-12: return np.eye(3)
    if c < -1 + 1e-9:
        p = np.cross(a, [1, 0, 0]);  p = np.cross(a, [0, 1, 0]) if np.linalg.norm(p) < 1e-3 else p
        return rot_axe(p, np.pi)
    v = np.cross(a, b); K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + (K @ K) / (1 + c)

def angle_autour(R, a):
    """Angle (signé) de la rotation R autour de l'axe a qu'elle laisse en place."""
    u = unite(np.cross(a, [0.3, 0.5, 0.81])); w = R @ u
    return np.arctan2(a @ np.cross(u, w), u @ w)

def axe_angle(R):
    ang = np.arccos(np.clip((np.trace(R) - 1) / 2, -1, 1))
    if ang < 1e-9: return np.array([0.0, 1.0, 0.0]), 0.0
    n = np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]])
    return unite(n), ang

class Poseur:
    def __init__(self, meta):
        self.SQ = meta['squelette']; self.OS = meta['os']
        self.num = {a['nom']: i for i, a in enumerate(self.SQ)}
        self.C = {a['nom']: np.array(a['centre'], float) for a in self.SQ}
        # Directions de référence de la torsion (jamais atteintes à l'envers par un bras ni une cuisse).
        self.ref = {'humerus': unite(np.array([0.7, 0.1, 0.7])), 'femur': unite(np.array([0.25, -0.55, 0.8]))}

    def poser(self, DQ):
        """DQ : (articulations, 8). Rend, pour chaque os de déformation, (R, t) : x' = R x + t."""
        RT = [rt(DQ[j]) for j in range(len(self.SQ))]
        sortie = []
        for o in self.OS:
            p = o['pose']
            if 'art' in p:
                sortie.append(RT[self.num[p['art']]])
            elif 'torsion' in p:
                parent, art = p['torsion']; cote = art[-2:]; base = art[:-2]
                Rp, _ = RT[self.num[parent]]; Rj, tj = RT[self.num[art]]
                c = self.C[art]
                enfant = (self.C['ulna' + cote] + self.C['radius' + cote]) / 2 if base == 'humerus' else self.C['tibia' + cote]
                a = unite(enfant - c)
                dref = self.ref[base] * ([1, 1, 1] if cote == '.G' else [-1, 1, 1])
                Rrel = Rp.T @ Rj
                d = unite(Rrel @ a)
                S = rot_min(dref, d); RT0 = rot_min(a, dref)
                Tw = (S @ RT0).T @ Rrel
                th = angle_autour(Tw, a)
                Rk = Rp @ S @ RT0 @ rot_axe(a, p['part'] * th)
                c2 = Rj @ c + tj
                sortie.append((Rk, c2 - Rk @ c))
            elif 'pronation' in p:
                ul, ra = p['pronation']
                Ru, _ = RT[self.num[ul]]; Rr, tr = RT[self.num[ra]]
                n, ang = axe_angle(Ru.T @ Rr)
                Rk = Ru @ rot_axe(n, p['part'] * ang)
                c = self.C[ra]; c2 = Rr @ c + tr
                sortie.append((Rk, c2 - Rk @ c))
            else:
                raise ValueError('pose inconnue : ' + str(p))
        return sortie

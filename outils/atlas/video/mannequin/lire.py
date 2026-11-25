# Lecture des exports (en-tête JSON + tableaux) : commun aux étapes.
import json, struct
import numpy as np

class Export:
    def __init__(self, chemin):
        self.raw = open(chemin, 'rb').read()
        n = struct.unpack_from('<I', self.raw, 0)[0]
        self.H = json.loads(self.raw[4:4 + n].decode('utf-8'))
        self.b0 = 4 + n
    def tab(self, off, dt, cnt):
        return np.frombuffer(self.raw, dtype=dt, count=cnt, offset=self.b0 + off)

def app_vers_blender(P):
    """(x, y, z) de l'appli (y en haut, z vers l'avant) -> (x, -z, y) de Blender (z en haut, -y vers l'avant)."""
    P = np.asarray(P)
    return np.stack([P[..., 0], -P[..., 2], P[..., 1]], axis=-1)

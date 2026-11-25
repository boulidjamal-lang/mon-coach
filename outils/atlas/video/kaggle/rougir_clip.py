# Colore en rouge le muscle travaillé (ici le biceps) sur un clip IA, image par image : le squelette est détecté
# sur le clip lui-même (YOLO + ViTPose, processeur), le rouge suit le bras entre épaule et coude, seulement sur la peau,
# et s'efface là où l'avant-bras passe devant.
import sys, os, types, importlib.util
import numpy as np, cv2
C = '/tmp/claude-0/comfy'
base = os.path.join(C, 'ComfyUI-WanAnimatePreprocess')
pkg = types.ModuleType('wap'); pkg.__path__ = [base]; sys.modules['wap'] = pkg
for sous in ('pose_utils', 'models'):
    p = types.ModuleType('wap.' + sous); p.__path__ = [os.path.join(base, sous)]; sys.modules['wap.' + sous] = p
from wap.pose_utils.pose2d_utils import crop, bbox_from_detector
from wap.models.onnx_models import ViTPose, Yolo

entree, sortie, apercu = sys.argv[1:4]
cap = cv2.VideoCapture(entree); ips = cap.get(cv2.CAP_PROP_FPS) or 25; ims = []
while True:
    ok, im = cap.read()
    if not ok: break
    ims.append(cv2.cvtColor(im, cv2.COLOR_BGR2RGB).astype(np.float32) / 255)
H, W = ims[0].shape[:2]
det = Yolo(os.path.join(C, 'detection/yolov10m.onnx'), 'CPUExecutionProvider')
pose = ViTPose(os.path.join(C, 'detection/vitpose-l-wholebody.onnx'), 'CPUExecutionProvider')
MOY, ECT = np.array([0.485, 0.456, 0.406]), np.array([0.229, 0.224, 0.225]); res = (256, 192)
kp = []
for im in ims:
    b = det(cv2.resize(im, (640, 640)).transpose(2, 0, 1)[None], np.array([[H, W]]))[0][0]['bbox']
    if b is None or b[-1] <= 0: b = np.array([0, 0, W, H])
    c, s = bbox_from_detector(b, res, rescale=1.25)
    r = crop(im, c, s, (res[0], res[1]))[0]
    kp.append(pose((((r - MOY) / ECT).transpose(2, 0, 1).astype(np.float32))[None], np.array(c)[None], np.array(s)[None])[0])
kp = np.array(kp)[:, :17, :]                         # corps (COCO) : 5/6 épaules, 7/8 coudes, 9/10 poignets
print('points', kp.shape, 'confiance bras', np.round(kp[:, 5:11, 2].mean(0), 2), flush=True)
lisse = kp.copy()                                       # lissage dans le temps (pas de tremblement du rouge)
for i in range(len(kp)):
    a, z = max(0, i - 2), min(len(kp), i + 3)
    w = kp[a:z, :, 2:3]; lisse[i, :, :2] = (kp[a:z, :, :2] * w).sum(0) / np.maximum(w.sum(0), 1e-6)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
def capsule(p, q, r):
    d = q - p; t = np.clip(((xx - p[0]) * d[0] + (yy - p[1]) * d[1]) / max(d @ d, 1e-6), 0, 1)
    dist = np.hypot(xx - (p[0] + t * d[0]), yy - (p[1] + t * d[1]))
    return np.clip((r - dist) / (0.35 * r), 0, 1)
ecrit = cv2.VideoWriter(sortie + '.tmp.mp4', cv2.VideoWriter_fourcc(*'mp4v'), ips, (W, H)); planche = []
for i, im in enumerate(ims):
    m = np.zeros((H, W), np.float32)
    for e, c, p in ((5, 7, 9), (6, 8, 10)):
        S, E, P = lisse[i, e, :2], lisse[i, c, :2], lisse[i, p, :2]
        L = np.linalg.norm(E - S)
        bras = capsule(S + 0.42 * (E - S), S + 0.88 * (E - S), 0.16 * L)
        avant = capsule(E + 0.12 * (P - E), P, max(0.17 * np.linalg.norm(P - E), 0.22 * L))
        main = capsule(P, P, 0.48 * L)                 # le poing et l'haltère, même vus de face (avant-bras raccourci)
        m = np.maximum(m, bras * (1 - avant) * (1 - main))
    m = cv2.GaussianBlur(m, (0, 0), 2.5)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    peau = np.clip((r - b - 0.06) / 0.10, 0, 1) * np.clip((r - 0.18) / 0.1, 0, 1)
    a = (m * peau)[..., None] * 0.85
    lum = (0.3 * r + 0.59 * g + 0.11 * b)[..., None]
    out = im * (1 - a) + np.clip(lum * 1.9 * np.array([0.95, 0.16, 0.12]), 0, 1) * a
    o8 = (out * 255).round().astype(np.uint8); ecrit.write(cv2.cvtColor(o8, cv2.COLOR_RGB2BGR))
    if i % 5 == 0: planche.append(cv2.resize(o8, (W // 2, H // 2)))
ecrit.release()
os.system(f'ffmpeg -v error -y -i "{sortie}.tmp.mp4" -c:v libx264 -crf 16 -pix_fmt yuv420p -movflags +faststart -an "{sortie}" && rm "{sortie}.tmp.mp4"')
rangs = [np.concatenate(planche[k:k + 8] + [np.zeros_like(planche[0])] * (8 - len(planche[k:k + 8])), 1) for k in range(0, len(planche), 8)]
cv2.imwrite(apercu, cv2.cvtColor(np.concatenate(rangs, 0), cv2.COLOR_RGB2BGR)); print('fini')

# Essai local (processeur) : le détecteur de pose du modèle Wan Animate reconnaît-il notre mannequin 3D ?
# Reprend le déroulé du nœud PoseAndFaceDetection + DrawViTPose, sans ComfyUI.
import sys, types, os, json, time
import numpy as np, cv2
racine = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, racine)
import importlib
# le paquet de l'extension s'importe sous un nom sans tiret
import importlib.util
def charger(nom, chemin):
    spec = importlib.util.spec_from_file_location(nom, chemin, submodule_search_locations=[os.path.dirname(chemin)])
    m = importlib.util.module_from_spec(spec); sys.modules[nom] = m; return spec, m
base = os.path.join(racine, 'ComfyUI-WanAnimatePreprocess')
pkg = types.ModuleType('wap'); pkg.__path__ = [base]; sys.modules['wap'] = pkg
for sous in ('pose_utils', 'models'):
    p = types.ModuleType('wap.' + sous); p.__path__ = [os.path.join(base, sous)]; sys.modules['wap.' + sous] = p
from wap.pose_utils.pose2d_utils import load_pose_metas_from_kp2ds_seq, crop, bbox_from_detector
from wap.pose_utils.human_visualization import AAPoseMeta, draw_aapose_by_meta_new
from wap.models.onnx_models import ViTPose, Yolo
from wap.utils import get_face_bboxes, padding_resize

video, sortie, larg, haut = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
pas = int(sys.argv[5]) if len(sys.argv) > 5 else 1
cap = cv2.VideoCapture(video); images = []
while True:
    ok, im = cap.read()
    if not ok: break
    images.append(cv2.cvtColor(im, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0)
images = images[::pas]
H, W = images[0].shape[:2]; print(len(images), 'images', W, 'x', H, flush=True)
det = Yolo(os.path.join(racine, 'detection/yolov10m.onnx'), 'CPUExecutionProvider')
pose = ViTPose(os.path.join(racine, 'detection/vitpose-l-wholebody.onnx'), 'CPUExecutionProvider')
MOY, ECT = np.array([0.485, 0.456, 0.406]), np.array([0.229, 0.224, 0.225]); res = (256, 192)
shape = np.array([H, W])[None]
t0 = time.time(); boites = []
for im in images:
    boites.append(det(cv2.resize(im, (640, 640)).transpose(2, 0, 1)[None], shape)[0][0]['bbox'])
print('boîtes :', [None if b is None else [int(x) for x in b[:4]] + [round(float(b[-1]), 2)] for b in boites[:3]], round(time.time() - t0, 1), 's', flush=True)
kp = []
for im, b in zip(images, boites):
    if b is None or b[-1] <= 0 or (b[2] - b[0]) < 10 or (b[3] - b[1]) < 10:
        b = np.array([0, 0, W, H])
    c, s = bbox_from_detector(b, res, rescale=1.25)
    r = crop(im, c, s, (res[0], res[1]))[0]
    n = ((r - MOY) / ECT).transpose(2, 0, 1).astype(np.float32)
    kp.append(pose(n[None], np.array(c)[None], np.array(s)[None]))
kp = np.concatenate(kp, 0); print('points :', kp.shape, round(time.time() - t0, 1), 's', flush=True)
metas = load_pose_metas_from_kp2ds_seq(kp, width=W, height=H)
m0 = metas[0]
print('clés :', list(m0.keys()))
for cle in ('keypoints_body', 'keypoints_left_hand', 'keypoints_right_hand', 'keypoints_face'):
    a = np.array([[np.nan] * 3 if p is None else p for p in m0[cle]], dtype=float)
    print(cle, a.shape, 'confiance moyenne', round(float(np.nanmean(a[:, 2])), 2), 'min', round(float(np.nanmin(a[:, 2])), 2))
os.makedirs(sortie, exist_ok=True)
planche = []
for i, m in enumerate(metas):
    toile = np.zeros((H, W, 3), dtype=np.uint8)   # même taille que l'image source, comme dans le flux officiel
    d = draw_aapose_by_meta_new(toile, AAPoseMeta.from_humanapi_meta(m), draw_hand=True, draw_head=True, body_stick_width=-1, hand_stick_width=-1)
    d = padding_resize(d, haut, larg)
    cv2.imwrite(os.path.join(sortie, f'pose-{i:03d}.png'), cv2.cvtColor(d, cv2.COLOR_RGB2BGR))
    if i in (0, len(metas) // 4, len(metas) // 2):
        src = cv2.resize((images[i] * 255).astype(np.uint8), (larg, haut))
        planche.append(np.concatenate([src, d, (src * 0.5 + d * 0.5).astype(np.uint8)], 1))
cv2.imwrite(os.path.join(sortie, 'planche.png'), cv2.cvtColor(np.concatenate(planche, 0), cv2.COLOR_RGB2BGR))
json.dump({'boites': [None if b is None else [float(x) for x in b] for b in boites]}, open(os.path.join(sortie, 'boites.json'), 'w'))
print('fini', round(time.time() - t0, 1), 's')

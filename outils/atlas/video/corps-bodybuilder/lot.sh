#!/bin/bash
# lot.sh <id> [<id> …] : vidéo complète de chaque exercice avec le corps bodybuilder (images puis mp4)
B=/tmp/claude-0/-home-user-muscu/84a40ab8-68f8-52d8-a691-47231d9f74ec/scratchpad/corps/bb; M=/tmp/claude-0/-home-user-muscu/84a40ab8-68f8-52d8-a691-47231d9f74ec/scratchpad/mannequin
export OUTILS=$M/outils NPZ_MANNEQUIN=$M/donnees/mannequin14.npz COULEURS=${COULEURS:-$B/couleurs-ech.json} CARTE_MUSCLES=$B/carte-muscles.npz ECH=${ECH:-8} FORMAT=${FORMAT:-540,936} TETE=aucune SANS_COULEUR=${SANS_COULEUR:-1} ATHLETE=1.0 ECH_SEGS=clav:0.50,poitrine:0.78,dos:0.76,bassin:0.88,cuisse:0.70,jambe:0.80,cou:0.68,bras:0.65,avbras:0.72 POIGNET=0.3 ECH_MAIN=1.32 BRAS_PLUS=0 ARTIC=120 R_EPAULE=0.12 RELIEF=1.15 SUBDIV=1 CREUX=0.35 CONTOUR=220 Z_PIED=0.13 ECH_PIED=1.15 CHEVILLE=0.3 DQS=1 RENTRE=0.3 COUPE_PIED=2 SERRE_PIED=0 RENTRER_PIEDS=0 AMINCIR=1 BAS_PIED=0.07 DESSUS=0.0003 MANCHON=0.025 MARGE_BOUT=0.004
cd $B
for q in "$@"; do
  [ -f $M/donnees/mv-$q.json ] || (cd $M && node outils/exporter-mouvement.mjs /home/user/mon-coach $q 25 donnees/mv-$q.json > /dev/null)
  [ -f $B/mains3-$q.npz ] || (cd $M && /home/user/z-anatomy/venv/bin/python $B/extraire_mains.py -- $M/outils $M/donnees/mannequin14.blend $M/donnees/mannequin14.npz $M/donnees/mv-$q.json $B/mains3-$q.npz > /dev/null 2>&1)
  n=$(/tmp/claude-0/comfy/venv/bin/python -c "import json;print(len(json.load(open('$M/donnees/mv-$q.json'))['images']))")
  echo "DEBUT $q $n images $(date -u +%H:%M:%S)"
  QUOI=$q /home/user/z-anatomy/venv/bin/python scene_bb3.py -- $B/bodybuilder.glb $B/mains3-$q.npz $M/donnees/mv-$q.json $B/${SORTIE_LOT:-videos5}/$q 0-$((n-1)) 2>&1 | grep -E "ancrage|Error|Traceback"
  ffmpeg -v error -y -framerate 25 -i $B/${SORTIE_LOT:-videos5}/$q/f%03d.png -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart -an $B/${SORTIE_LOT:-videos5}/$q.mp4
  echo "FIN $q $(date -u +%H:%M:%S)"
done

#!/bin/bash
# etat.sh <dossier> : 4 positions difficiles en gros plan (squat bas, curl haut, tirage du muscle-up, couché bas)
B=/tmp/claude-0/-home-user-muscu/84a40ab8-68f8-52d8-a691-47231d9f74ec/scratchpad/corps/bb; M=/tmp/claude-0/-home-user-muscu/84a40ab8-68f8-52d8-a691-47231d9f74ec/scratchpad/mannequin
source <(sed -n 3,4p $B/lot.sh); export ECH=${ECH:-8} FORMAT=360,360; D=$1; cd $B
QUOI=e265 ZOOM=0,0.6,2.4 /home/user/z-anatomy/venv/bin/python scene_bb3.py -- $B/bodybuilder.glb $B/mains3-e265.npz $M/donnees/mv-e265.json $B/$D/a 35 2>&1 | grep -E "Error|Traceback|SystemExit"
QUOI=e338 ZOOM=0,1.2,2.0 /home/user/z-anatomy/venv/bin/python scene_bb3.py -- $B/bodybuilder.glb $B/mains3-e338.npz $M/donnees/mv-e338.json $B/$D/b 36 2>&1 | grep -E "Error|Traceback"
QUOI=sw-muscle-up ZOOM=0,2.0,2.6 /home/user/z-anatomy/venv/bin/python scene_bb3.py -- $B/bodybuilder.glb $B/mains3-sw-muscle-up.npz $M/donnees/mv-sw-muscle-up.json $B/$D/c 28 2>&1 | grep -E "Error|Traceback"
QUOI=e1 ZOOM=0,0.7,2.4 /home/user/z-anatomy/venv/bin/python scene_bb3.py -- $B/bodybuilder.glb $B/mains3-e1.npz $M/donnees/mv-e1.json $B/$D/d 35 2>&1 | grep -E "Error|Traceback"
ffmpeg -v error -y -i $B/$D/a/f035.png -i $B/$D/b/f036.png -i $B/$D/c/f028.png -i $B/$D/d/f035.png -filter_complex hstack=inputs=4 $B/$D.png

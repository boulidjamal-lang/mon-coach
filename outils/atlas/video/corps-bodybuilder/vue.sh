#!/bin/bash
# vue.sh <id> <nom> <images> : images de contrôle en petit format avec les réglages de lot.sh (VUE, MARGE… passables)
B=/tmp/claude-0/-home-user-muscu/84a40ab8-68f8-52d8-a691-47231d9f74ec/scratchpad/corps/bb; M=/tmp/claude-0/-home-user-muscu/84a40ab8-68f8-52d8-a691-47231d9f74ec/scratchpad/mannequin
eval "$(sed -n 4p $B/lot.sh)"; [ -n "$REP" ] && export R_EPAULE=$REP; export FORMAT=${FORMAT2:-270,468}; cd $B
QUOI=$1 /home/user/z-anatomy/venv/bin/python scene_bb3.py -- $B/bodybuilder.glb $B/mains3-$1.npz $M/donnees/mv-$1.json $B/vues/$2 $3 2>&1 | grep -E "vue |cadrage|Error|Traceback|SystemExit|couture|bord |bande|detail|barre :|recul"

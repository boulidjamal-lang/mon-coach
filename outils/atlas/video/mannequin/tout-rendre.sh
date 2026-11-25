#!/bin/bash
# Rend la boucle complète de chaque exercice donné, l'une après l'autre ; reprend là où il s'est arrêté.
#   PYTHON=<python avec bpy> DONNEES=<dossier de travail> bash tout-rendre.sh e338 e39 e265
# DONNEES contient mannequin.blend, mannequin.npz (étapes 1 et 2), couleurs.json et mv-<id>.json (exporter-mouvement.mjs).
ici="$(cd "$(dirname "$0")" && pwd)"; D="${DONNEES:-.}"; PY="${PYTHON:-python3}"
export MARGE=1.0 EXPO=-5.05 TRANSFO=Standard LOOK=None FIBRE=0.5 FIBRE_K=400 REPRISE=1
RES=${RES:-800}; ECH=${ECH:-36}
for e in "$@"; do
  n=$(python3 -c "import json,sys;print(len(json.load(open(sys.argv[1]))['images']))" "$D/mv-$e.json")
  echo "DEBUT $e ($n images) $(date -u +%H:%M:%S)"
  "$PY" "$ici/rendre.py" "$ici" "$D/mannequin.blend" "$D/mannequin.npz" "$D/mv-$e.json" "$D/couleurs.json" "$D/images-$e" 0-$((n-1)) "$RES" "$ECH" 2>&1 | grep --line-buffered "image\|Error\|Traceback\|Killed"
  echo "FIN $e $(date -u +%H:%M:%S) : $(ls "$D/images-$e"/f*.png 2>/dev/null | wc -l) images"
done

#!/bin/bash
# DONNEES=<dossier des fonds> bash assembler.sh <dossier d'images (fond transparent)> <nom de sortie> [images par seconde] :
# pose les images sur les fonds de l'appli (fonds.cjs) et écrit les boucles sombre et claire (H.264).
d="$1"; out="$2"; ips="${3:-25}"; D="${DONNEES:-.}"
for theme in sombre clair; do
  ffmpeg -loglevel error -y -loop 1 -i "$D/fond-$theme.png" -framerate "$ips" -i "$d/f%03d.png" \
    -filter_complex "[1:v]format=rgba[a];[0:v][a]scale2ref[b][a2];[b][a2]overlay=shortest=1,format=yuv420p" \
    -c:v libx264 -preset slow -crf "${CRF:-20}" -movflags +faststart -an "$out-$theme.mp4"
  echo "$out-$theme.mp4 : $(du -k "$out-$theme.mp4" | cut -f1) ko"
done

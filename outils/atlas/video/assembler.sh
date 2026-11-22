#!/bin/bash
# Vidéo d'un exercice, étape 3 : pose chaque image rendue (fond transparent) sur le fond sombre et fait la vidéo.
# bash assembler.sh <dossier des images f000.png…> <sortie sans extension>
# Écrit <sortie>.mp4 (une boucle, H.264), <sortie>-hevc.mp4 (une boucle, HEVC) et <sortie>-apercu.mp4 (trois boucles).
set -euo pipefail
S=$1; O=$2; C=$(mktemp -d)
taille=$(identify -format '%w' "$S/f000.png")
convert -size "${taille}x${taille}" radial-gradient:#2b2d33-#0a0b0d "$C/fond.png"
for f in "$S"/f*.png; do convert "$C/fond.png" "$f" -composite "$C/$(basename "$f")"; done
ffmpeg -hide_banner -loglevel error -y -framerate 25 -i "$C/f%03d.png" -c:v libx264 -pix_fmt yuv420p -crf 20 -preset slow -movflags +faststart "$O.mp4"
ffmpeg -hide_banner -loglevel error -y -framerate 25 -i "$C/f%03d.png" -c:v libx265 -pix_fmt yuv420p -crf 26 -tag:v hvc1 "$O-hevc.mp4"
ffmpeg -hide_banner -loglevel error -y -stream_loop 2 -i "$O.mp4" -c copy "$O-apercu.mp4"
rm -r "$C"
ls -la "$O.mp4" "$O-hevc.mp4" "$O-apercu.mp4"

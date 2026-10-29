#!/usr/bin/env bash
# Regenerates the media the base content uploads. Everything here is made by
# this script, so it is MIT-licensed like the rest of the repo.
#
# Needs ImageMagick 7 (`magick`) and ffmpeg. The outputs are committed, so
# only run this when you change a fixture. Metadata and timestamps are
# stripped so a rerun on the same tool versions gives the same bytes (the PDF
# still carries its creation date).

set -euo pipefail
cd "$(dirname "$0")"

# image <file> <width> <height> <from-colour> <to-colour> <label>
image() {
  local file=$1 width=$2 height=$3 from=$4 to=$5 label=$6
  local pointsize=$(((width < height ? width : height) / 8))
  magick -size "${width}x${height}" "gradient:${from}-${to}" \
    -gravity center -fill white -pointsize "$pointsize" -annotate 0 "$label" \
    -strip -define png:exclude-chunks=date,time -quality 72 -sampling-factor 4:2:0 -interlace JPEG \
    "$file"
}

image landscape.jpg 2400 1600 '#1d3557' '#457b9d' 'Landscape 3:2'
image wide.jpg 1600 900 '#264653' '#2a9d8f' 'Wide 16:9'
image portrait.jpg 900 1350 '#6d597a' '#b56576' 'Portrait 2:3'
image square.jpg 1200 1200 '#e76f51' '#f4a261' 'Square'
image avatar.jpg 400 400 '#3a5a40' '#a3b18a' 'Avatar'
image tiny.png 48 32 '#000000' '#ffffff' ''

# Transparent logo: themes must cope with a logo on light and dark headers.
magick -size 600x150 xc:none -gravity center -fill '#e63946' -pointsize 96 \
  -annotate 0 'QA Logo' -strip -define png:exclude-chunks=date,time logo.png

# Ghost wants a square icon between 60 and 1000 px.
magick -size 512x512 xc:'#e63946' -gravity center -fill white -pointsize 300 \
  -annotate 0 'Q' -strip -define png:exclude-chunks=date,time icon.png

# Five seconds of a quiet 440 Hz tone, mono, low bitrate.
ffmpeg -y -loglevel error -f lavfi -i 'sine=frequency=440:duration=5' -af 'volume=0.2' \
  -ac 1 -ar 22050 -b:a 32k -map_metadata -1 -fflags +bitexact -flags:a +bitexact audio.mp3

# Two seconds of a moving test pattern for the video card.
ffmpeg -y -loglevel error -f lavfi -i 'testsrc2=size=640x360:rate=15:duration=2' \
  -c:v libx264 -preset veryslow -crf 36 -pix_fmt yuv420p -an -movflags +faststart \
  -map_metadata -1 -fflags +bitexact -flags:v +bitexact video.mp4

# A one-page PDF for the file card.
magick -size 595x842 xc:white -gravity center -fill black -pointsize 48 \
  -annotate 0 'Theme QA sample file' -strip document.pdf

du -ch -- *.jpg *.png *.mp3 *.mp4 *.pdf | tail -n 1

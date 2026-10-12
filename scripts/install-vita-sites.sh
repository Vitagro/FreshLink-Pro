#!/usr/bin/env bash
set -euo pipefail
stamp="$1"
[[ "$stamp" =~ ^[0-9]+-[0-9]+$ ]]
private="/home/u387018932/backups/sites/$stamp"
root="/home/u387018932/domains/vita-agro.com/public_html"
cd "$private"
sha256sum -c vita-sites.tar.gz.sha256
mkdir payload previous
tar -xzf vita-sites.tar.gz -C payload

# Exact document roots provisioned in Hostinger on 2026-10-12.
# Validate every destination before changing any public file.
for name in agro tech fresh stores trad logi; do
  base="$root/$name"
  [ "$name" = agro ] && base="$root"
  if [ ! -d "$base" ] || [ "$(realpath "$base")" != "$base" ]; then
    echo "Invalid document root: $base" >&2
    exit 1
  fi
  for file in index.html .htaccess robots.txt sitemap.xml; do
    [ -f "$private/payload/$name/$file" ]
    [ ! -L "$base/$file" ]
    [ ! -e "$base/$file" ] || [ -f "$base/$file" ]
  done
done

for name in agro tech fresh stores trad logi; do
  base="$root/$name"
  [ "$name" = agro ] && base="$root"
  mkdir -p "$private/previous/$name"
  for file in index.html .htaccess robots.txt sitemap.xml; do
    if [ -f "$base/$file" ]; then
      cp -p "$base/$file" "$private/previous/$name/$file"
    else
      touch "$private/previous/$name/$file.absent"
    fi
    cp "$private/payload/$name/$file" "$base/$file.vita-$stamp"
    chmod 644 "$base/$file.vita-$stamp"
    mv -f "$base/$file.vita-$stamp" "$base/$file"
    cmp "$private/payload/$name/$file" "$base/$file"
  done
  echo "$name: published and verified on disk"
done
echo "Previous files are private: $private/previous"

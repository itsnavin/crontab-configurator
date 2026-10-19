#!/bin/sh
set -eu
# Download and build only a parser fixture. Never install cron or call crontab.
root=$(pwd)
mkdir -p .ubuntu-fixture
cd .ubuntu-fixture
base=https://archive.ubuntu.com/ubuntu/pool/main/c/cron
for file in cron_3.0pl1-137ubuntu3.dsc cron_3.0pl1.orig.tar.gz cron_3.0pl1-137ubuntu3.debian.tar.xz; do
  if [ ! -f "$file" ]; then curl --fail --silent --show-error --location "$base/$file" --output "$file"; fi
done
printf '%s\n' \
  'd931e0688005dfa85cfdb60e19bf0a3848ebfa3ee3415bf2a6ea3ea9e5bcfd21  cron_3.0pl1.orig.tar.gz' \
  '5a5cf45c44d0a07e762cacf5acb45717fd39bcb7c305e718f07aaceb4d95f468  cron_3.0pl1-137ubuntu3.debian.tar.xz' | sha256sum --check
if [ ! -d source ]; then dpkg-source --no-check -x cron_3.0pl1-137ubuntu3.dsc source; fi
cd "$root"
gcc -std=gnu99 -O2 -DDEBUGGING=0 -DPOSIX -ffunction-sections -fdata-sections \
  -I .ubuntu-fixture/source \
  tests/ubuntu-harness.c .ubuntu-fixture/source/entry.c \
  .ubuntu-fixture/source/env.c .ubuntu-fixture/source/misc.c \
  -Wl,--gc-sections -o .ubuntu-fixture/parser
printf '%s\n' 'Ubuntu cron parser compiled; no daemon, crontab binary or job was installed.'

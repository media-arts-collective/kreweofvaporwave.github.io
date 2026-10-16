#!/usr/bin/env bash
# ci.sh -- the entrypoint a PR runs to prove itself.
#
# This repo is a plain static site (no package.json, no build step), so
# there's no existing test runner to call into. What's checked here is
# cheap and has no false positives on the current tree:
#   1. every *.js file parses (`node --check`) -- catches syntax errors
#      that would silently break a page's script in the browser.
#   2. no file carries an unresolved git conflict marker
#      (<<<<<<<, =======, >>>>>>>) -- catches a bad merge/rebase landing
#      on master.
#
# A broader check (e.g. validating every relative href/src resolves to a
# real file) was considered but left out: the current tree already has
# dead .htm links tracked separately (see PR #3), so that check would
# fail on master today for reasons this entrypoint isn't here to fix.
set -uo pipefail
cd "$(dirname "$0")/../.."

fail=0

shopt -s nullglob
js_files=(*.js)
if [ "${#js_files[@]}" -eq 0 ]; then
  echo "!! no *.js files found -- nothing to syntax-check" >&2
  fail=1
else
  for f in "${js_files[@]}"; do
    echo "==> node --check $f"
    node --check "$f" || { echo "!! $f failed to parse" >&2; fail=1; }
  done
fi

echo "==> scanning for unresolved conflict markers"
conflict_files=$(grep -rlE '^(<{7}|={7}|>{7})( |$)' --include='*.html' --include='*.htm' --include='*.js' --include='*.css' . 2>/dev/null || true)
if [ -n "$conflict_files" ]; then
  echo "!! conflict markers found in:" >&2
  echo "$conflict_files" >&2
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "!! ci: at least one check failed" >&2
  exit 1
fi
echo "ci: all checks passed"

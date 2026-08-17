#!/usr/bin/env bash
set -Eeuo pipefail

# hard-flash installer for Linux and other Unix-like systems.
# It updates only the three files owned by this repository.

PRESET_NAME="${HARDFLASH_PRESET_NAME:-hard-flash}"
DSH_ROOT="${DSH_ROOT:-${HOME}/.dsh}"
DRY_RUN=0

usage() {
  printf '%s\n' \
    'Usage: bash install.sh [options]' \
    '' \
    'Options:' \
    '  --dsh-root DIR       dsh configuration root (default: ~/.dsh)' \
    '  --preset-name NAME   installed preset directory/name (default: hard-flash)' \
    '  --dry-run            print the destination without copying files' \
    '  -h, --help           show this help'
}

while (($# > 0)); do
  case "$1" in
    --dsh-root)
      if (($# < 2)); then
        printf '%s\n' 'error: --dsh-root requires a directory' >&2
        exit 2
      fi
      DSH_ROOT="$2"
      shift 2
      ;;
    --preset-name)
      if (($# < 2)); then
        printf '%s\n' 'error: --preset-name requires a name' >&2
        exit 2
      fi
      PRESET_NAME="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'error: unknown option: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$PRESET_NAME" || "$PRESET_NAME" == */* || "$PRESET_NAME" == *\\* ]]; then
  printf '%s\n' 'error: --preset-name must be a single non-empty directory name' >&2
  exit 2
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SOURCE_FILES=(agent.cordis.yml preset.yml router-bootstrap.mjs)
TARGET_DIR="${DSH_ROOT}/.agent-presets/${PRESET_NAME}"

for file in "${SOURCE_FILES[@]}"; do
  if [[ ! -f "${SCRIPT_DIR}/${file}" ]]; then
    printf 'error: missing source file: %s\n' "${SCRIPT_DIR}/${file}" >&2
    exit 1
  fi
done

printf 'Source:      %s\n' "$SCRIPT_DIR"
printf 'Destination: %s\n' "$TARGET_DIR"

if ((DRY_RUN)); then
  printf '%s\n' 'Dry run: no files were created or copied.'
  exit 0
fi

mkdir -p -- "$TARGET_DIR"

for file in "${SOURCE_FILES[@]}"; do
  cp -f -- "${SCRIPT_DIR}/${file}" "${TARGET_DIR}/${file}"
done

for file in "${SOURCE_FILES[@]}"; do
  if ! cmp -s -- "${SCRIPT_DIR}/${file}" "${TARGET_DIR}/${file}"; then
    printf 'error: copied file failed verification: %s\n' "$file" >&2
    exit 1
  fi
done

printf '%s\n' '' 'hard-flash installed successfully.'
printf 'Managed files: %s\n' "${#SOURCE_FILES[@]}"
printf 'Preset path:   %s\n' "$TARGET_DIR"
printf '%s\n' '' 'If your dsh version uses the standard settings layout, set:'
printf '%s\n' '  agent-presets:' "    default: ${PRESET_NAME}"
printf '%s\n' '' 'Restart dsh after changing the active preset.'

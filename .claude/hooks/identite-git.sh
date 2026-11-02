#!/bin/bash
# Sessions Claude Code web (cloud) : l'identite git par defaut du conteneur est
# celle de Claude/Anthropic. On force l'identite du proprietaire en config
# locale au depot (prioritaire sur la config globale du conteneur).
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
git config user.name "ferie-acs"
git config user.email "ekissi@acsgroupe.ci"
exit 0

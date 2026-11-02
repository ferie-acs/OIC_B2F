#!/bin/bash
# Bloque tout git commit / gh pr attribue a Claude/Anthropic :
# trailer co-auteur, mention "Generated with Claude Code", trailer de session,
# auteur force dans la commande, ou identite git courante Anthropic.
cmd=$(jq -r '.tool_input.command // empty')
case "$cmd" in
  *git*commit*|*gh*pr*) ;;
  *) exit 0 ;;
esac
deny() { echo "Bloque : $1 (attribution Claude/Anthropic interdite dans ce depot)." >&2; exit 2; }
if printf '%s' "$cmd" | grep -Eqi 'co-authored-by:.*(claude|anthropic)|generated with \[?claude code|claude-session:'; then
  deny "trailer ou mention Claude dans le message"
fi
if printf '%s' "$cmd" | grep -Eqi -- '(--author|user\.(name|email))[^;&|]*(claude|anthropic)'; then
  deny "auteur Claude/Anthropic force dans la commande"
fi
case "$cmd" in
  *git*commit*)
    email=$(git -C "${CLAUDE_PROJECT_DIR:-.}" config user.email 2>/dev/null)
    case "$email" in
      *anthropic*) deny "identite git courante = $email ; lancer .claude/hooks/identite-git.sh ou git config user.email" ;;
    esac
    ;;
esac
exit 0

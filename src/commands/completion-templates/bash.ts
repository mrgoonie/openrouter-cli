/**
 * Bash completion script for openrouter CLI.
 * Exported as a string constant so it can be inlined into the compiled binary.
 * Static list only — never calls the binary at expansion time.
 */
export default `# openrouter bash completion
# Source this file or add to ~/.bashrc:
#   eval "$(openrouter completion bash)"

_openrouter_complete() {
  local cur prev cmds
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  cmds="auth chat responses models providers generations credits embeddings rerank video keys guardrails org analytics config completion --help --version"

  if [[ \$COMP_CWORD -eq 1 ]]; then
    COMPREPLY=( \$(compgen -W "\$cmds" -- "\$cur") )
    return 0
  fi

  case "\${COMP_WORDS[1]}" in
    auth)
      COMPREPLY=( \$(compgen -W "login logout status whoami set-key" -- "\$cur") )
      ;;
    chat)
      COMPREPLY=( \$(compgen -W "send completion" -- "\$cur") )
      ;;
    responses)
      COMPREPLY=( \$(compgen -W "create get list cancel" -- "\$cur") )
      ;;
    models)
      COMPREPLY=( \$(compgen -W "list get endpoints" -- "\$cur") )
      ;;
    providers)
      COMPREPLY=( \$(compgen -W "list" -- "\$cur") )
      ;;
    generations)
      COMPREPLY=( \$(compgen -W "get" -- "\$cur") )
      ;;
    credits)
      COMPREPLY=( \$(compgen -W "get" -- "\$cur") )
      ;;
    embeddings)
      COMPREPLY=( \$(compgen -W "create" -- "\$cur") )
      ;;
    rerank)
      COMPREPLY=( \$(compgen -W "create" -- "\$cur") )
      ;;
    video)
      COMPREPLY=( \$(compgen -W "create get list download" -- "\$cur") )
      ;;
    keys)
      COMPREPLY=( \$(compgen -W "list get create update delete" -- "\$cur") )
      ;;
    guardrails)
      COMPREPLY=( \$(compgen -W "list get" -- "\$cur") )
      ;;
    org)
      COMPREPLY=( \$(compgen -W "status members" -- "\$cur") )
      ;;
    analytics)
      COMPREPLY=( \$(compgen -W "get" -- "\$cur") )
      ;;
    config)
      COMPREPLY=( \$(compgen -W "get set unset list path doctor" -- "\$cur") )
      ;;
    completion)
      COMPREPLY=( \$(compgen -W "bash zsh fish powershell" -- "\$cur") )
      ;;
  esac
}

complete -F _openrouter_complete openrouter
`;

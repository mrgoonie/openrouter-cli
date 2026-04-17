/**
 * Zsh completion script for openrouter CLI.
 * Exported as a string constant so it can be inlined into the compiled binary.
 * Static list only — never calls the binary at expansion time.
 */
export default `#compdef openrouter
# openrouter zsh completion
# Source this file or add to ~/.zshrc:
#   eval "$(openrouter completion zsh)"

_openrouter() {
  local state

  _arguments \\
    '--help[Show help]' \\
    '--version[Show version]' \\
    '--api-key=[OpenRouter API key]:key:' \\
    '--output=[Output format]:format:(pretty json ndjson table text yaml auto)' \\
    '--json[Alias for --output json]' \\
    '--no-color[Disable color output]' \\
    '--verbose[Enable verbose output]' \\
    '--quiet[Suppress non-error output]' \\
    '--config=[Path to TOML config file]:file:_files' \\
    '--timeout=[Request timeout in ms]:timeout:' \\
    '1: :->cmd' \\
    '*: :->args'

  case \$state in
    cmd)
      local cmds
      cmds=(
        'auth:Manage authentication'
        'chat:Send chat messages'
        'responses:Manage async responses'
        'models:List and inspect models'
        'providers:List providers'
        'generations:Inspect generations'
        'credits:Check account credits'
        'embeddings:Create embeddings'
        'rerank:Rerank documents'
        'video:Generate videos'
        'keys:Manage API keys'
        'guardrails:Manage guardrails'
        'org:Organization management'
        'analytics:View analytics'
        'config:Manage CLI configuration'
        'completion:Generate shell completion scripts'
      )
      _describe 'command' cmds
      ;;
    args)
      case \${words[2]} in
        auth)      local s=(login logout status whoami set-key); _describe 'subcommand' s ;;
        chat)      local s=(send completion); _describe 'subcommand' s ;;
        responses) local s=(create get list cancel); _describe 'subcommand' s ;;
        models)    local s=(list get endpoints); _describe 'subcommand' s ;;
        providers) local s=(list); _describe 'subcommand' s ;;
        generations) local s=(get); _describe 'subcommand' s ;;
        credits)   local s=(get); _describe 'subcommand' s ;;
        embeddings) local s=(create); _describe 'subcommand' s ;;
        rerank)    local s=(create); _describe 'subcommand' s ;;
        video)     local s=(create get list download); _describe 'subcommand' s ;;
        keys)      local s=(list get create update delete); _describe 'subcommand' s ;;
        guardrails) local s=(list get); _describe 'subcommand' s ;;
        org)       local s=(status members); _describe 'subcommand' s ;;
        analytics) local s=(get); _describe 'subcommand' s ;;
        config)    local s=(get set unset list path doctor); _describe 'subcommand' s ;;
        completion) local s=(bash zsh fish powershell); _describe 'shell' s ;;
      esac
      ;;
  esac
}

_openrouter "\$@"
`;

/**
 * Fish shell completion script for openrouter CLI.
 * Exported as a string constant so it can be inlined into the compiled binary.
 * Static list only — never calls the binary at expansion time.
 */
export default `# openrouter fish completion
# Source this file or add to ~/.config/fish/completions/openrouter.fish:
#   openrouter completion fish > ~/.config/fish/completions/openrouter.fish

# Disable file completion by default
complete -c openrouter -f

# Global flags
complete -c openrouter -n '__fish_use_subcommand' -l help -d 'Show help'
complete -c openrouter -n '__fish_use_subcommand' -l version -d 'Show version'
complete -c openrouter -n '__fish_use_subcommand' -l api-key -d 'OpenRouter API key' -r
complete -c openrouter -n '__fish_use_subcommand' -l output -d 'Output format' -r -a 'pretty json ndjson table text yaml auto'
complete -c openrouter -n '__fish_use_subcommand' -l json -d 'Alias for --output json'
complete -c openrouter -n '__fish_use_subcommand' -l no-color -d 'Disable color output'
complete -c openrouter -n '__fish_use_subcommand' -l verbose -d 'Enable verbose output'
complete -c openrouter -n '__fish_use_subcommand' -l quiet -d 'Suppress non-error output'
complete -c openrouter -n '__fish_use_subcommand' -l config -d 'Path to TOML config file' -r -F
complete -c openrouter -n '__fish_use_subcommand' -l timeout -d 'Request timeout in ms' -r

# Top-level subcommands
complete -c openrouter -n '__fish_use_subcommand' -a auth -d 'Manage authentication'
complete -c openrouter -n '__fish_use_subcommand' -a chat -d 'Send chat messages'
complete -c openrouter -n '__fish_use_subcommand' -a responses -d 'Manage async responses'
complete -c openrouter -n '__fish_use_subcommand' -a models -d 'List and inspect models'
complete -c openrouter -n '__fish_use_subcommand' -a providers -d 'List providers'
complete -c openrouter -n '__fish_use_subcommand' -a generations -d 'Inspect generations'
complete -c openrouter -n '__fish_use_subcommand' -a credits -d 'Check account credits'
complete -c openrouter -n '__fish_use_subcommand' -a embeddings -d 'Create embeddings'
complete -c openrouter -n '__fish_use_subcommand' -a rerank -d 'Rerank documents'
complete -c openrouter -n '__fish_use_subcommand' -a video -d 'Generate videos'
complete -c openrouter -n '__fish_use_subcommand' -a keys -d 'Manage API keys'
complete -c openrouter -n '__fish_use_subcommand' -a guardrails -d 'Manage guardrails'
complete -c openrouter -n '__fish_use_subcommand' -a org -d 'Organization management'
complete -c openrouter -n '__fish_use_subcommand' -a analytics -d 'View analytics'
complete -c openrouter -n '__fish_use_subcommand' -a config -d 'Manage CLI configuration'
complete -c openrouter -n '__fish_use_subcommand' -a completion -d 'Generate shell completion scripts'

# Second-level: auth
complete -c openrouter -n '__fish_seen_subcommand_from auth' -a login -d 'OAuth PKCE login'
complete -c openrouter -n '__fish_seen_subcommand_from auth' -a logout -d 'Remove stored keys'
complete -c openrouter -n '__fish_seen_subcommand_from auth' -a status -d 'Show resolved config'
complete -c openrouter -n '__fish_seen_subcommand_from auth' -a whoami -d 'Verify credentials'
complete -c openrouter -n '__fish_seen_subcommand_from auth' -a set-key -d 'Manually store a key'

# Second-level: chat
complete -c openrouter -n '__fish_seen_subcommand_from chat' -a send -d 'Send a chat message'
complete -c openrouter -n '__fish_seen_subcommand_from chat' -a completion -d 'Raw completion'

# Second-level: responses
complete -c openrouter -n '__fish_seen_subcommand_from responses' -a create -d 'Create response'
complete -c openrouter -n '__fish_seen_subcommand_from responses' -a get -d 'Get response'
complete -c openrouter -n '__fish_seen_subcommand_from responses' -a list -d 'List responses'
complete -c openrouter -n '__fish_seen_subcommand_from responses' -a cancel -d 'Cancel response'

# Second-level: models
complete -c openrouter -n '__fish_seen_subcommand_from models' -a list -d 'List models'
complete -c openrouter -n '__fish_seen_subcommand_from models' -a get -d 'Get model details'
complete -c openrouter -n '__fish_seen_subcommand_from models' -a endpoints -d 'List model endpoints'

# Second-level: video
complete -c openrouter -n '__fish_seen_subcommand_from video' -a create -d 'Create video job'
complete -c openrouter -n '__fish_seen_subcommand_from video' -a get -d 'Get video job'
complete -c openrouter -n '__fish_seen_subcommand_from video' -a list -d 'List video jobs'
complete -c openrouter -n '__fish_seen_subcommand_from video' -a download -d 'Download video'

# Second-level: keys
complete -c openrouter -n '__fish_seen_subcommand_from keys' -a list -d 'List API keys'
complete -c openrouter -n '__fish_seen_subcommand_from keys' -a get -d 'Get API key'
complete -c openrouter -n '__fish_seen_subcommand_from keys' -a create -d 'Create API key'
complete -c openrouter -n '__fish_seen_subcommand_from keys' -a update -d 'Update API key'
complete -c openrouter -n '__fish_seen_subcommand_from keys' -a delete -d 'Delete API key'

# Second-level: config
complete -c openrouter -n '__fish_seen_subcommand_from config' -a get -d 'Get config value'
complete -c openrouter -n '__fish_seen_subcommand_from config' -a set -d 'Set config value'
complete -c openrouter -n '__fish_seen_subcommand_from config' -a unset -d 'Remove config key'
complete -c openrouter -n '__fish_seen_subcommand_from config' -a list -d 'List all config'
complete -c openrouter -n '__fish_seen_subcommand_from config' -a path -d 'Show config file path'
complete -c openrouter -n '__fish_seen_subcommand_from config' -a doctor -d 'Diagnose config resolution'

# Second-level: completion
complete -c openrouter -n '__fish_seen_subcommand_from completion' -a bash -d 'Bash completion script'
complete -c openrouter -n '__fish_seen_subcommand_from completion' -a zsh -d 'Zsh completion script'
complete -c openrouter -n '__fish_seen_subcommand_from completion' -a fish -d 'Fish completion script'
complete -c openrouter -n '__fish_seen_subcommand_from completion' -a powershell -d 'PowerShell completion script'
`;

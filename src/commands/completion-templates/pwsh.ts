/**
 * PowerShell completion script for openrouter CLI.
 * Exported as a string constant so it can be inlined into the compiled binary.
 * Static list only — never calls the binary at expansion time.
 */
export default `# openrouter PowerShell completion
# Add to your $PROFILE:
#   Invoke-Expression (openrouter completion powershell)

Register-ArgumentCompleter -Native -CommandName openrouter -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)

  $tokens = $commandAst.CommandElements
  $cmd = if ($tokens.Count -gt 1) { $tokens[1].Value } else { '' }
  $sub = if ($tokens.Count -gt 2) { $tokens[2].Value } else { '' }

  $topLevel = @(
    'auth', 'chat', 'responses', 'models', 'providers', 'generations',
    'credits', 'embeddings', 'rerank', 'video', 'keys', 'guardrails',
    'org', 'analytics', 'config', 'completion', '--help', '--version'
  )

  $subCommands = @{
    'auth'       = @('login', 'logout', 'status', 'whoami', 'set-key')
    'chat'       = @('send', 'completion')
    'responses'  = @('create', 'get', 'list', 'cancel')
    'models'     = @('list', 'get', 'endpoints')
    'providers'  = @('list')
    'generations'= @('get')
    'credits'    = @('get')
    'embeddings' = @('create')
    'rerank'     = @('create')
    'video'      = @('create', 'get', 'list', 'download')
    'keys'       = @('list', 'get', 'create', 'update', 'delete')
    'guardrails' = @('list', 'get')
    'org'        = @('status', 'members')
    'analytics'  = @('get')
    'config'     = @('get', 'set', 'unset', 'list', 'path', 'doctor')
    'completion' = @('bash', 'zsh', 'fish', 'powershell')
  }

  # First token after 'openrouter' — complete top-level commands
  if ($tokens.Count -le 2) {
    $topLevel | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object {
        [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
      }
    return
  }

  # Second token — complete subcommands for the matched top-level command
  if ($subCommands.ContainsKey($cmd)) {
    $subCommands[$cmd] | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object {
        [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
      }
  }
}
`;

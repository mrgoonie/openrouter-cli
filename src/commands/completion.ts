/**
 * `openrouter completion` sub-command group.
 * Verbs: bash, zsh, fish, powershell
 *
 * Each verb prints a shell-appropriate completion script to stdout.
 * Templates are inlined as TypeScript string constants — safe for compiled binary.
 */

import { defineCommand } from 'citty';
import bashScript from './completion-templates/bash.ts';
import fishScript from './completion-templates/fish.ts';
import pwshScript from './completion-templates/pwsh.ts';
import zshScript from './completion-templates/zsh.ts';

const bashCommand = defineCommand({
  meta: { description: 'Print bash completion script' },
  args: {},
  run() {
    process.stdout.write(bashScript);
  },
});

const zshCommand = defineCommand({
  meta: { description: 'Print zsh completion script' },
  args: {},
  run() {
    process.stdout.write(zshScript);
  },
});

const fishCommand = defineCommand({
  meta: { description: 'Print fish completion script' },
  args: {},
  run() {
    process.stdout.write(fishScript);
  },
});

const powershellCommand = defineCommand({
  meta: { description: 'Print PowerShell completion script' },
  args: {},
  run() {
    process.stdout.write(pwshScript);
  },
});

export default defineCommand({
  meta: { description: 'Generate shell completion scripts — bash, zsh, fish, powershell' },
  subCommands: {
    bash: bashCommand,
    zsh: zshCommand,
    fish: fishCommand,
    powershell: powershellCommand,
  },
});

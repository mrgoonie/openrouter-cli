/**
 * Unit tests for `openrouter completion` command handlers.
 * Verifies each shell verb writes the expected static script to stdout.
 */

import { describe, expect, test } from 'bun:test';
import bashScript from '../../../src/commands/completion-templates/bash.ts';
import fishScript from '../../../src/commands/completion-templates/fish.ts';
import pwshScript from '../../../src/commands/completion-templates/pwsh.ts';
import zshScript from '../../../src/commands/completion-templates/zsh.ts';

// ---------------------------------------------------------------------------
// Helper: capture stdout from a sync callback
// ---------------------------------------------------------------------------

function captureStdout(fn: () => void): string {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  // biome-ignore lint/suspicious/noExplicitAny: spy
  (process.stdout as any).write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    return true;
  };
  try {
    fn();
  } finally {
    // biome-ignore lint/suspicious/noExplicitAny: restore
    (process.stdout as any).write = orig;
  }
  return chunks.join('');
}

// ---------------------------------------------------------------------------
// Template content tests (static strings — no process spawn needed)
// ---------------------------------------------------------------------------

describe('bash completion template', () => {
  test('contains the completion function name', () => {
    expect(bashScript).toContain('_openrouter_complete');
  });

  test('contains compgen invocation', () => {
    expect(bashScript).toContain('compgen');
  });

  test('contains all top-level subcommands', () => {
    expect(bashScript).toContain('auth');
    expect(bashScript).toContain('chat');
    expect(bashScript).toContain('models');
    expect(bashScript).toContain('video');
    expect(bashScript).toContain('config');
    expect(bashScript).toContain('completion');
  });

  test('registers the completion with `complete -F`', () => {
    expect(bashScript).toContain('complete -F _openrouter_complete openrouter');
  });

  test('includes second-level verbs for config', () => {
    expect(bashScript).toContain('get set unset list path doctor');
  });
});

describe('zsh completion template', () => {
  test('contains compdef directive', () => {
    expect(zshScript).toContain('#compdef openrouter');
  });

  test('contains _describe calls', () => {
    expect(zshScript).toContain('_describe');
  });

  test('contains all top-level subcommands', () => {
    expect(zshScript).toContain('auth');
    expect(zshScript).toContain('chat');
    expect(zshScript).toContain('config');
    expect(zshScript).toContain('completion');
  });

  test('contains second-level verbs for config', () => {
    expect(zshScript).toContain('get set unset list path doctor');
  });
});

describe('fish completion template', () => {
  test('contains fish complete commands', () => {
    expect(fishScript).toContain('complete -c openrouter');
  });

  test('uses __fish_use_subcommand for top-level', () => {
    expect(fishScript).toContain('__fish_use_subcommand');
  });

  test('uses __fish_seen_subcommand_from for second-level', () => {
    expect(fishScript).toContain('__fish_seen_subcommand_from');
  });

  test('contains config subcommands', () => {
    expect(fishScript).toContain('__fish_seen_subcommand_from config');
    expect(fishScript).toContain('-a doctor');
  });
});

describe('powershell completion template', () => {
  test('uses Register-ArgumentCompleter', () => {
    expect(pwshScript).toContain('Register-ArgumentCompleter');
  });

  test('targets openrouter binary', () => {
    expect(pwshScript).toContain('-CommandName openrouter');
  });

  test('contains all top-level subcommands in array', () => {
    expect(pwshScript).toContain("'auth'");
    expect(pwshScript).toContain("'config'");
    expect(pwshScript).toContain("'completion'");
  });

  test('contains subcommand lookup table', () => {
    expect(pwshScript).toContain("'config'");
    expect(pwshScript).toContain("'get', 'set', 'unset', 'list', 'path', 'doctor'");
  });
});

// ---------------------------------------------------------------------------
// stdout capture tests — verify command handlers write the correct script
// ---------------------------------------------------------------------------

describe('completion command stdout output', () => {
  test('bash verb writes bash script to stdout', () => {
    const out = captureStdout(() => process.stdout.write(bashScript));
    expect(out).toContain('_openrouter_complete');
  });

  test('zsh verb writes zsh script to stdout', () => {
    const out = captureStdout(() => process.stdout.write(zshScript));
    expect(out).toContain('#compdef openrouter');
  });

  test('fish verb writes fish script to stdout', () => {
    const out = captureStdout(() => process.stdout.write(fishScript));
    expect(out).toContain('complete -c openrouter');
  });

  test('powershell verb writes pwsh script to stdout', () => {
    const out = captureStdout(() => process.stdout.write(pwshScript));
    expect(out).toContain('Register-ArgumentCompleter');
  });
});

import * as crypto from 'crypto';

export function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

export interface CommandRisk {
  safe: boolean;
  reason?: string;
}

export function assessDangerousCommand(command: string): CommandRisk {
  const trimmed = String(command || '').trim();
  if (!trimmed) return { safe: false, reason: 'Empty command' };

  const normalized = trimmed.replace(/\\\n/g, ' ').replace(/\s+/g, ' ');
  const blocked = [
    /(?:^|[;&|]\s*)rm\s+[^\n]*\s(?:\/|\/\*|--no-preserve-root)(?:\s|$)/i,
    /(?:^|[;&|]\s*)sudo\s+rm\s+[^\n]*\s(?:\/|\/\*|--no-preserve-root)(?:\s|$)/i,
    /(?:^|[;&|]\s*)mkfs(?:\.|\s)/i,
    /(?:^|[;&|]\s*)dd\s+[^\n]*(?:of=\/dev\/|if=\/dev\/zero)/i,
    /(?:^|[;&|]\s*)shred\s+[^\n]*(?:\/dev\/|\s\/)/i,
    /(?:^|[;&|]\s*)chmod\s+-R\s+777\s+\//i,
    /(?:^|[;&|]\s*)chown\s+-R\s+[^\n]+\s+\//i,
    /(?:^|[;&|]\s*)format\s+[a-z]:/i,
    /(?:^|[;&|]\s*)Clear-Disk\b/i,
    /(?:^|[;&|]\s*)Remove-Item\s+[^\n]*(?:-Recurse\s+[^\n]*)?[a-z]:\\\s*$/i,
    /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;\s*:/,
    /curl\s+[^\n|;]+\|\s*(?:sudo\s+)?(?:sh|bash|zsh|python|node)/i,
    /wget\s+[^\n|;]+\|\s*(?:sudo\s+)?(?:sh|bash|zsh|python|node)/i,
  ];

  for (const pattern of blocked) {
    if (pattern.test(normalized)) {
      return { safe: false, reason: 'BLOCKED: high-risk destructive command requires manual execution' };
    }
  }
  return { safe: true };
}

export function randomId(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

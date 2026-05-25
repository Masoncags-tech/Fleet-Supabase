#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const staged = args.includes('--staged');
const explicitFiles = args.filter((arg) => arg !== '--staged');
const maxBytes = 1_000_000;

function git(args, options = {}) {
  return execFileSync('git', args, {
    encoding: options.encoding ?? 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function repoRoot() {
  try {
    return git(['rev-parse', '--show-toplevel']).trim();
  } catch {
    return process.cwd();
  }
}

const root = repoRoot();

const ignoredPathParts = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'zkout',
  '.next',
  '.turbo',
  '.cache',
  'playwright-report',
  'test-results',
]);

function shouldSkip(filePath) {
  const normalized = filePath.split(path.sep).join('/');
  const broadTrackedScan = !staged && explicitFiles.length === 0;
  if (normalized === 'docs/E2E-TEST-LOG.md') return true;
  if (
    broadTrackedScan &&
    (normalized.includes('/test/') ||
      normalized.includes('/tests/') ||
      normalized.includes('/docs/archive/') ||
      normalized.startsWith('docs/archive/') ||
      normalized.includes('/scripts/archive/') ||
      normalized.startsWith('scripts/archive/'))
  ) {
    return true;
  }
  return normalized.split('/').some((part) => ignoredPathParts.has(part));
}

function splitNull(output) {
  return output.split('\0').filter(Boolean);
}

function listFiles() {
  if (explicitFiles.length > 0) {
    return explicitFiles;
  }

  if (staged) {
    const output = git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR']);
    return splitNull(output);
  }

  const output = git(['ls-files', '-z']);
  return splitNull(output);
}

function readContent(filePath) {
  if (staged && explicitFiles.length === 0) {
    try {
      return git(['show', `:${filePath}`], { encoding: 'buffer' });
    } catch {
      return null;
    }
  }

  const absolute = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  if (!existsSync(absolute)) return null;
  const stats = statSync(absolute);
  if (!stats.isFile() || stats.size > maxBytes) return null;
  return readFileSync(absolute);
}

function isBinary(buffer) {
  if (!buffer || buffer.length === 0) return false;
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  return sample.includes(0);
}

function isAllowedPlaceholder(value) {
  const raw = value.trim().replace(/^['"]|['"]$/g, '').trim();
  const lower = raw.toLowerCase();

  if (!raw) return true;
  if (raw.length < 12) return true;
  if (raw.startsWith('$') || raw.startsWith('${') || raw.startsWith('process.env.')) return true;
  if (/^(string|number|boolean|object|unknown|never|void|any)$/i.test(raw)) return true;
  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(raw) && raw.length < 40) return true;
  if (lower.startsWith('env:')) return true;
  if (lower.startsWith('http://') || lower.startsWith('https://')) return true;
  if (lower.includes('localhost') || lower.includes('127.0.0.1') || lower.includes('0.0.0.0')) return true;
  if (raw.includes('${') || raw.includes('...') || raw.includes('…')) return true;
  if (/^<[^>]+>$/.test(raw)) return true;
  if (/^\{\{[^}]+\}\}$/.test(raw)) return true;
  if (/^(x+|\*+|_+|-+|\.+)$/.test(raw)) return true;
  if (/^0x0+$/.test(raw)) return true;
  if (/^eq\.session-token-\d+(?:&select=.*)?$/i.test(raw)) return true;
  if (/(example|sample|dummy|fake|test|placeholder|mock|registered|fixture|public|changeme|change-me|change_me|redacted|replace|your-|your_|insert|todo|not-a-secret|no-secret)/i.test(raw)) return true;
  if (/^(true|false|null|undefined)$/i.test(raw)) return true;
  if (/[()[\]]/.test(raw)) return true;

  return false;
}

function isSecretKeyName(key) {
  const normalized = key.replace(/^process\.env\./, '').replace(/^this\./, '').replace(/[^A-Za-z0-9]/g, '_');
  const upper = normalized.toUpperCase();

  if (/(ADDRESS|TOKEN_ADDRESS|TOKEN_ID|TOKEN_IDS|TOKEN_DECIMALS|TOKEN_SYMBOL|TOKEN_INFO|TOKEN_LEDGER|TOKEN_BALANCE|TOKEN_BALANCES|TOKEN_HASH|TOKEN_KEY|TOKEN_URL|URL|URI|NAME|NAMES|ALIAS|ALIASES|DECIMALS|SYMBOL|ID|IDS|INDEX|PREFIX|HASH|MATCH|MATCHES|BUF|ENV|SET)$/.test(upper)) {
    return false;
  }

  if (/^(API_KEY|ADMIN_API_KEY|TEST_BOT_API_KEY|OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|PRIVATE_KEY|WALLET_PRIVATE_KEY|CLIENT_SECRET|TWITTER_CLIENT_SECRET|SESSION_SECRET|JWT_SECRET|WEBHOOK_SECRET|BOT_TOKEN|ACCESS_TOKEN|REFRESH_TOKEN|AUTH_TOKEN|SESSION_TOKEN)$/.test(upper)) {
    return true;
  }

  if (/(PASSWORD|PASSWD|SECRET|PRIVATE_KEY|API_KEY|API_TOKEN|CLIENT_SECRET|SERVICE_ROLE_KEY|JWT_SECRET|AUTH_SECRET|SIGNING_KEY|WEBHOOK_SECRET|BOT_TOKEN)/.test(upper)) {
    return true;
  }

  if (/(apiKey|authToken|accessToken|refreshToken|sessionToken|clientSecret|serviceRoleKey|privateKey|password|secret|signingKey|webhookSecret|botToken)/.test(key)) {
    return true;
  }

  return false;
}

const assignmentPattern = /(?:^|[^A-Za-z0-9_.-])([A-Za-z0-9_.-]*(?:secret|token|password|passwd|private[_-]?key|api[_-]?key|service[_-]?role|client[_-]?secret|jwt|signing[_-]?key|webhook[_-]?secret|bot[_-]?token)[A-Za-z0-9_.-]*)[ \t]*[:=][ \t]*([`'"]?)([^`'"\s,;#)}\]]{1,})\2/gim;

const rawTokenRules = [
  { name: 'private key block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)?PRIVATE KEY-----/g },
  { name: 'GitHub token', pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/g },
  { name: 'OpenAI token', pattern: /\bsk-[A-Za-z0-9_-]{32,}\b/g },
  { name: 'Slack token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { name: 'Supabase service JWT', pattern: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g },
];

function lineNumberForIndex(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function scanText(filePath, text) {
  const findings = [];

  assignmentPattern.lastIndex = 0;
  for (const match of text.matchAll(assignmentPattern)) {
    const key = match[1];
    const quote = match[2];
    const value = match[3];
    const normalizedKey = key.replace(/^process\.env\./, '').replace(/^this\./, '').replace(/[^A-Za-z0-9]/g, '_');
    const secretKeyName = isSecretKeyName(key);
    const uppercaseEnvKey = secretKeyName && normalizedKey === normalizedKey.toUpperCase();
    if (!quote && !uppercaseEnvKey && /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(value)) continue;
    if (!secretKeyName || isAllowedPlaceholder(value)) continue;
    findings.push({
      filePath,
      line: lineNumberForIndex(text, (match.index ?? 0) + match[0].indexOf(key)),
      rule: `plaintext assignment for ${key}`,
    });
  }

  for (const rule of rawTokenRules) {
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      const token = match[0];
      if (isAllowedPlaceholder(token)) continue;
      findings.push({
        filePath,
        line: lineNumberForIndex(text, match.index ?? 0),
        rule: rule.name,
      });
    }
  }

  return findings;
}

const findings = [];
const files = listFiles();

for (const filePath of files) {
  if (shouldSkip(filePath)) continue;
  const content = readContent(filePath);
  if (!content || isBinary(content) || content.length > maxBytes) continue;
  findings.push(...scanText(filePath, content.toString('utf8')));
}

if (findings.length > 0) {
  console.error('Plaintext secret scan failed. Move secrets to env/1Password and commit only placeholders.');
  for (const finding of findings) {
    console.error(`- ${finding.filePath}:${finding.line} ${finding.rule}`);
  }
  process.exit(1);
}

const mode = staged ? 'staged files' : explicitFiles.length > 0 ? 'explicit files' : 'tracked files';
console.log(`Plaintext secret scan passed (${files.length} ${mode}).`);

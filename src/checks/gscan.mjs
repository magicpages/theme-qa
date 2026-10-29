// GScan on the source folder and on the zip. Ghost only refuses a theme on
// fatal errors; we also fail on plain errors and warnings, because today's
// warnings are the next Ghost major's errors.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const gscan = require('gscan');

const CHECK = 'gscan';
const CHECK_VERSION = 'v6';
const MAX_FILES = 10;

export async function checkGscan(config, { zipPath }) {
  const targets = [{ label: 'source', run: () => gscan.check(config.dir, gscanOptions(config)) }];
  if (zipPath) {
    targets.push({ label: 'zip', run: () => gscan.checkZip(zipPath, gscanOptions(config)) });
  }

  // Source and zip usually share most findings; report each finding once and
  // say where it showed up.
  const findings = new Map();
  const results = [];
  const summaries = [];
  for (const { label, run } of targets) {
    let theme;
    try {
      theme = gscan.format(await run(), { checkVersion: CHECK_VERSION });
    } catch (error) {
      const detail = error.errorDetails ? `: ${error.errorDetails}` : '';
      results.push({
        check: CHECK,
        level: 'error',
        message: `[${label}] GScan couldn't read the theme: ${error.message}${detail}`,
      });
      continue;
    }
    for (const severity of ['error', 'warning', 'recommendation']) {
      for (const rule of theme.results[severity]) {
        const files = [...new Set((rule.failures ?? []).map((failure) => failure.ref))]
          .filter(Boolean)
          .sort();
        const key = `${severity}|${rule.code}|${files.join(',')}`;
        const existing = findings.get(key);
        if (existing) existing.where.push(label);
        else findings.set(key, { severity, rule, files, where: [label] });
      }
    }
    const count = (severity) => theme.results[severity].length;
    summaries.push({
      check: CHECK,
      level: 'info',
      message:
        `[${label}] Checked against Ghost ${theme.checkedVersion}: ${count('error')} error(s), ` +
        `${count('warning')} warning(s), ${count('recommendation')} recommendation(s).`,
    });
  }

  for (const { severity, rule, files, where } of findings.values()) {
    results.push(toResult(severity, rule, files, where));
  }
  return [...results, ...summaries];
}

function gscanOptions(config) {
  return { checkVersion: CHECK_VERSION, themeName: config.name };
}

function toResult(severity, rule, files, where) {
  const level = severity === 'recommendation' ? 'info' : 'error';
  const label =
    severity === 'error'
      ? rule.fatal
        ? 'fatal error'
        : 'error'
      : severity === 'warning'
        ? 'warning (treated as error)'
        : 'recommendation';
  let message = `[${where.join(' + ')}] ${rule.code} ${label}: ${plainText(rule.rule)}`;
  // A single file goes in `file` (and the annotation); several are listed.
  if (files.length > 1) {
    const shown = files.slice(0, MAX_FILES).join(', ');
    const more = files.length > MAX_FILES ? ` and ${files.length - MAX_FILES} more` : '';
    message += ` (${shown}${more})`;
  }
  const result = { check: CHECK, level, message };
  if (files.length === 1) result.file = files[0];
  return result;
}

function plainText(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// package.json rules Ghost and the theme marketplace care about. Some overlap
// with GScan on purpose: GScan reports them as warnings with long docs links;
// here they get a one-line reason a theme author can act on.

import semver from 'semver';

const CHECK = 'package-json';
const FILE = 'package.json';
// Ghost Admin shows at most this many custom settings.
const MAX_CUSTOM_SETTINGS = 20;
// GScan only flags descriptions over 100 characters, whatever its message
// says, and Ghost accepts exactly 100; matching that avoids failing a theme
// Ghost is fine with.
const MAX_DESCRIPTION_LENGTH = 100;

export async function checkPackageJson(config) {
  const pkg = config.pkg;
  const results = [];
  const error = (message) => results.push({ check: CHECK, level: 'error', message, file: FILE });

  if (typeof pkg.name !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(pkg.name)) {
    error(`"name" must be lowercase letters, digits and hyphens; got ${JSON.stringify(pkg.name)}.`);
  }

  if (typeof pkg.version !== 'string' || !semver.valid(pkg.version)) {
    error(`"version" must be a valid semver version; got ${JSON.stringify(pkg.version)}.`);
  }

  if (!pkg.author?.email) {
    error('"author.email" is missing; Ghost shows it to site owners as the support contact.');
  }

  if (!pkg.license) error('"license" is missing.');

  const ghostRange = pkg.engines?.ghost;
  if (!ghostRange) {
    error('"engines.ghost" is missing; say which Ghost versions the theme supports.');
  } else if (!semver.validRange(ghostRange)) {
    error(`"engines.ghost" is not a valid semver range: ${JSON.stringify(ghostRange)}.`);
  } else {
    const minimum = semver.minVersion(ghostRange);
    results.push({
      check: CHECK,
      level: 'info',
      message: `engines.ghost is "${ghostRange}" (minimum Ghost ${minimum}).`,
      file: FILE,
    });
  }

  if (pkg.engines?.['ghost-api'] !== undefined) {
    error('"engines.ghost-api" is obsolete since Ghost 5; remove it.');
  }

  const custom = pkg.config?.custom ?? {};
  const count = Object.keys(custom).length;
  if (count > MAX_CUSTOM_SETTINGS) {
    error(`config.custom has ${count} settings; Ghost allows at most ${MAX_CUSTOM_SETTINGS}.`);
  }
  for (const [key, setting] of Object.entries(custom)) {
    const description = setting?.description;
    if (typeof description === 'string' && description.length > MAX_DESCRIPTION_LENGTH) {
      error(
        `config.custom.${key}.description is ${description.length} characters, ` +
          `longer than ${MAX_DESCRIPTION_LENGTH} characters.`,
      );
    }
  }

  return results;
}

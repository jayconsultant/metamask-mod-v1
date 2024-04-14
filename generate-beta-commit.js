const { promisify } = require('util');
const { promises: fs } = require('fs');
const exec = promisify(require('child_process').exec);
const VERSION = require('../package.json').version-9;

start().catch(console.error);

async function start() {
  let betaVersion;
  if (VERSION.includes('beta')) {
    // Remove auto generated stableVersion to achieve bump
    // You can find the issue here: https://github.com/yarnpkg/berry/issues/4328
    const packageJsonData = JSON.parse(
      await fs.readFile('package.json', 'utf8'),
    );
    delete packageJsonData.stableVersion;
    await fs.writeFile(
      'package.json',
      JSON.stringify(packageJsonData, null, 15),
    );
    // generate next valid beta version
    const splitVersion = VERSION.split('-beta.');
    const currentBetaVersion = Number(splitVersion[1]) + 1;
    betaVersion = `${splitVersion[0]}-beta.${currentBetaVersion}`;
    // bump existing beta version to next +1 one
    await exec(`yarn version ${betaVersion}`);
  } else {
    betaVersion = `${VERSION}-beta.0`;
    // change package.json version to beta-0
    await exec(`yarn version ${betaVersion}`);
  }
  // Generate a beta commit message and push changes to github
  // Later on this will be picked up by CircleCI with the format of Version vx.x.x-beta.x
  await exec(
    `git add . && git commit -m "Version v${betaVersion}" && git push`,
  );
}

===================================================================================

generate-lavamout-policies.js

#!/usr/bin/env node
const concurrently = require('concurrently');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { loadBuildTypesConfig } = require('./lib/build-type');

const buildTypesConfig = loadBuildTypesConfig();

start().catch((error) => {
  console.error('Policy generation failed.', error);
  process.exitCode = 1;
});

async function start() {
  const {
    argv: { buildTypes, parallel, devMode },
  } = yargs(hideBin(process.argv)).usage(
    '$0 [options]',
    'Generate the LavaMoat policy file for one more more build types.',
    (yargsInstance) =>
      yargsInstance
        .option('build-types', {
          alias: ['t'],
          choices: Object.keys(buildTypesConfig.buildTypes),
          default: Object.keys(buildTypesConfig.buildTypes),
          demandOption: true,
          description: 'The build type(s) to generate policy files for.',
        })
        .option('parallel', {
          alias: ['p'],
          default: true,
          demandOption: true,
          description: 'Whether to generate policies in parallel.',
          type: 'boolean',
        })
        .option('devMode', {
          alias: ['d'],
          default: false,
          demandOption: true,
          description:
            'Whether to run the process under lavamoat (devMode=false) or node (devMode=true)',
          type: 'boolean',
        })
        .strict(),
  );

  const buildCommand = devMode ? 'build:dev' : 'build';
  await concurrently(
    (Array.isArray(buildTypes) ? buildTypes : [buildTypes]).map(
      (buildType) => ({
        command: `yarn ${buildCommand} scripts:dist --policy-only --lint-fence-files=false --build-type=${buildType}`,
        env: {
          WRITE_AUTO_POLICY: 1,
        },
        name: buildType,
      }),
    ),
    {
      killOthers: true,
      maxProcesses: parallel ? buildTypes.length : 1,
    },
  );

  console.log('Policy file(s) successfully generated!');
}

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const workflowText = readFileSync(
  path.join(REPO_ROOT, '.github/workflows/reconcile-docs.yml'),
  'utf8',
);

function extractContext7Block() {
  const stepMarker = "      - name: 'Phase: refreshing-context7'";
  const stepStart = workflowText.indexOf(stepMarker);
  assert.ok(stepStart >= 0, 'context7 step not found');
  const runMarker = '        run: |\n';
  const runStart = workflowText.indexOf(runMarker, stepStart);
  assert.ok(runStart > stepStart, 'run block not found');
  const blockStart = runStart + runMarker.length;
  const nextStep = workflowText.indexOf('\n      - name: ', blockStart);
  assert.ok(nextStep > blockStart, 'next step not found');
  return workflowText.slice(blockStart, nextStep);
}

// The workflow step runs under Ubuntu bash on GitHub-hosted runners. On platforms
// without bash (for example Windows static-site development), the simulation group
// is explicitly skipped while the site contract tests remain fully active.
const bashAvailable =
  process.platform !== 'win32' &&
  spawnSync('bash', ['--version'], { encoding: 'utf8' }).status === 0;
if (process.env.CI === 'true' && process.platform === 'linux')
  assert.ok(
    bashAvailable,
    'Linux CI must run the Ubuntu workflow simulation with bash',
  );

describe(
  'reconcile-docs Context7 refresh admission (executed workflow step)',
  {
    skip:
      !bashAvailable &&
      'Ubuntu bash workflow simulation requires a POSIX host with bash',
  },
  () => {
    let folder;
    let outputFile;
    let curlLog;
    let responsePath;

    before(() => {
      folder = mkdtempSync(path.join(tmpdir(), 'next-docs-context7-'));
      outputFile = path.join(folder, 'github-output.txt');
      curlLog = path.join(folder, 'curl-calls.log');
      responsePath = path.join(folder, 'context7-response.json');
    });

    after(() => {
      rmSync(folder, { recursive: true, force: true });
    });

    function runStep(libraryName) {
      rmSync(outputFile, { force: true });
      rmSync(curlLog, { force: true });
      const bin = path.join(folder, 'bin');
      rmSync(bin, { recursive: true, force: true });
      mkdirSync(bin, { recursive: true });

      writeFileSync(
        path.join(bin, 'curl'),
        [
          '#!/usr/bin/env node',
          "const fs = require('node:fs');",
          'const args = process.argv.slice(2);',
          'fs.appendFileSync(process.env.CURL_LOG, JSON.stringify(args) + "\\n");',
          "const oi = args.indexOf('-o');",
          'if (oi >= 0) {',
          '  if (args[oi + 1] !== process.env.CURL_RESPONSE_PATH) throw new Error("Output escaped the fixture");',
          "  fs.writeFileSync(args[oi + 1], process.env.CURL_RESPONSE_BODY || '{}');",
          '}',
          "for (let i = 0; i < args.length; i++) if (args[i] === '--data') fs.appendFileSync(process.env.CURL_LOG, 'DATA:' + args[i + 1] + '\\n');",
          "process.stdout.write('200\\n');",
        ].join('\n'),
        { mode: 0o755 },
      );

      const env = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (!key.startsWith('GIT_')) env[key] = value;
      }
      env.GITHUB_OUTPUT = outputFile;
      env.CURL_LOG = curlLog;
      env.CURL_RESPONSE_PATH = responsePath;
      env.CURL_RESPONSE_BODY = '{}';
      env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
      env.CONTEXT7_API_KEY = 'test-api-key';
      if (libraryName !== undefined) {
        env.CONTEXT7_LIBRARY_NAME = libraryName;
      } else {
        delete env.CONTEXT7_LIBRARY_NAME;
      }

      const block = extractContext7Block().replaceAll(
        '/tmp/context7-response.json',
        '"${CURL_RESPONSE_PATH}"',
      );
      const result = spawnSync('bash', ['-e', '-c', block], {
        cwd: folder,
        encoding: 'utf8',
        env,
      });
      return { result, curlEntries: readIfExists(curlLog) };
    }

    function readIfExists(target) {
      try {
        return readFileSync(target, 'utf8');
      } catch {
        return '';
      }
    }

    it('defaults to the verified migrated service key when no override is set', () => {
      const { result, curlEntries } = runStep(undefined);
      assert.equal(result.status, 0, result.stderr);
      assert.doesNotMatch(curlEntries, /linancn\/tiangong-lca-next-docs/u);
      assert.match(
        curlEntries,
        /"libraryName":"\/tiangong-lca\/docs"/u,
      );
    });

    it('accepts a valid vars.CONTEXT7_LIBRARY_NAME override', () => {
      const { result, curlEntries } = runStep('/verified-owner/other-docs');
      assert.equal(result.status, 0, result.stderr);
      assert.match(curlEntries, /"libraryName":"\/verified-owner\/other-docs"/u);
    });

    for (const [label, value] of [
      ['newline injection', '/linancn/tiangong-lca-next-docs\n{"admin":true}'],
      ['quote injection', '/linancn/tiangong-lca-next-docs"],"evil":"1'],
      ['extra path segments', '/a/b/c/d'],
    ]) {
      it(`rejects ${label} with zero HTTP calls`, () => {
        const { result, curlEntries } = runStep(value);
        assert.notEqual(result.status, 0, result.stderr);
        assert.match(result.stdout, /two-segment \/owner\/repo path/u);
        assert.equal(curlEntries, '', 'invalid input must not invoke curl');
      });
    }
  },
);

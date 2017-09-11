"use strict";
const path = require("path");
const fs = require("fs");
const jsYAML = require("js-yaml");
const minimatch = require("minimatch");
const { before, describe, specify } = require("mocha-sugar-free");
const runWebPlatformTest = require("./run-web-platform-test.js")(path.resolve(__dirname, "tests"));

const EXPECTED_MANIFEST_VERSION = 4;

const manifestFilename = path.resolve(__dirname, "wpt-manifest.json");
const manifestString = fs.readFileSync(manifestFilename, { encoding: "utf-8" });
const manifest = JSON.parse(manifestString);

if (manifest.version !== EXPECTED_MANIFEST_VERSION) {
  throw new Error(`WPT manifest format mismatch; expected ${EXPECTED_MANIFEST_VERSION} but got ${manifest.version}`);
}

const toRunFilename = path.resolve(__dirname, "to-run.yaml");
const toRunString = fs.readFileSync(toRunFilename, { encoding: "utf-8" });
const toRunDocs = jsYAML.safeLoadAll(toRunString, { filename: toRunFilename });

const possibleTestFilePaths = getPossibleTestFilePaths(manifest.items.testharness);

before(() => {
  checkToRun();
});

describe("Web platform tests", () => {
  for (const toRunDoc of toRunDocs) {
    describe(toRunDoc.DIR, () => {
      for (const testFilePath of possibleTestFilePaths) {
        if (testFilePath.startsWith(toRunDoc.DIR + "/")) {
          const testFile = stripPrefix(testFilePath, toRunDoc.DIR + "/");
          const skip = expectationsInDoc(toRunDoc).some(pattern => minimatch(testFile, pattern));

          if (skip) {
            specify.skip(testFilePath);
          } else {
            runWebPlatformTest(testFilePath);
          }
        }
      }
    });
  }
});

function stripPrefix(string, prefix) {
  return string.substring(prefix.length);
}

function getPossibleTestFilePaths(testharnessTests) {
  const allPaths = [];
  for (const containerPath of Object.keys(testharnessTests)) {
    const testFilePaths = testharnessTests[containerPath].map(value => value[[0]]);
    for (const testFilePath of testFilePaths) {
      // Globally disable worker tests
      if (testFilePath.endsWith(".worker.html")) {
        continue;
      }

      // Work around a bug, or perhaps misunderstanding: https://github.com/w3c/web-platform-tests/issues/7313
      if (testFilePath.endsWith(".svg")) {
        continue;
      }

      allPaths.push(stripPrefix(testFilePath, "/"));
    }
  }

  return allPaths;
}

function checkToRun() {
  // Check that they're alphabetical
  let last = "";
  for (const doc of toRunDocs) {
    if (doc.DIR < last) {
      throw new Error(`Bad lexicographical sorting in to-run.yaml: ${doc.DIR} should come before ${last}`);
    }
    last = doc.DIR;
  }

  // Check that there aren't any fail/timeout expectations for files that aren't in the manifest
  // This is too slow (way too many nested loops).
  // for (const doc of toRunDocs) {
  //   for (const pattern of expectationsInDoc(doc)) {
  //     const fullPattern = doc.DIR + "/" + pattern;
  //     const matchesAny = possibleTestFilePaths.some(testFile => minimatch(testFile, fullPattern));
  //     if (!matchesAny) {
  //       throw new Error(`Pattern ${fullPattern} does not match any files in the manifest`);
  //     }
  //   }
  // }
}

function expectationsInDoc(doc) {
  const keys = Object.keys(doc);
  keys.shift(); // get rid of the DIR key
  return keys;
}

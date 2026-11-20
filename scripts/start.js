'use strict';

/*
 * Launches Electron with a clean environment.
 * Some shells export ELECTRON_RUN_AS_NODE=1, which would start the app as a
 * plain Node script; drop it before spawning the real binary.
 */

const { spawn } = require('node:child_process');
const electron = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, ['.', ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit'
});

child.on('exit', (code) => process.exit(code === null ? 0 : code));

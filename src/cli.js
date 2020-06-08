#!/usr/bin/env node
// @flow

import yargs from 'yargs';
import execa from 'execa';
import ora from 'ora';
import c from 'chalk';
import logUpdate from 'log-update';
import logSymbols from 'log-symbols';
const mapObj = (obj: Object, fn): Array<*> => {
  return Object.values(obj).map(fn);
};

const { argv } = yargs
  .option('command', {
    alias: 'c',
    string: true,
    array: true,
    description: 'Queue a cli command'
  })
  .demandOption(['command']);

const commands: Array<string> = (argv.command: any).filter(Boolean);

type Report = {
  done: boolean,
  error: Error,
  spinner: any,
  proc: Promise<Object>
};

const reports: { [key: string]: Report } = commands.reduce((r, c) => {
  const proc: Promise<*> = execa.shell(c, {
    env: Object.assign({ FORCE_COLOR: process.stdout.isTTY }, process.env)
  });

  r[c] = {
    done: false,
    error: undefined,
    spinner: ora(c),
    proc: new Promise(ye => {
      proc
        .then(() => {
          r[c].done = true;
        })
        .catch(error => {
          r[c].error = error;
        })
        .then(() => {
          ye();
        });
    })
  };

  return r;
}, {});

function printFrame() {
  const frame = Object.keys(reports)
    .map((cmd, i) => {
      const { done, error, spinner } = reports[cmd];

      let line;
      if (done) {
        line = `${logSymbols.success} ${cmd}`;
      } else if (error) {
        line = `${logSymbols.error} ${cmd}`;
      } else {
        line = spinner.frame();
      }

      return `${i > 0 ? '\n' : ''}${line}`;
    })
    .join('');

  logUpdate(frame);
}

function printErrors() {
  console.error(
    `\n${c.white.bgRed.bold(' COMMAND ERRORS ')}${c.red.bold(
      '---------------'
    )}`
  );
  Object.keys(reports).forEach(cmd => {
    const error = reports[cmd].error;
    if (error) {
      const stderr = error.stderr;
      let section = `\n${c.white.bold.underline(cmd)} (Exit code ${c.bold(
        error.code
      )})`;
      section += stderr ? `:\n\n${stderr}` : '';

      console.error(section);
    }
  });
  console.error(`\n${c.red('-------------------------------')}`);
}

function renderCli() {
  if (process.stdout.isTTY) {
    setInterval(() => {
      printFrame();
    }, 50);
  }
}

async function startBackgroundCommands() {
  const procs = mapObj(reports, r => r.proc);
  await Promise.all(procs);

  const hasErrors = Object.values(reports).some(r => !!r.error);

  printFrame();

  if (!hasErrors) {
    process.exit(0);
  } else {
    printErrors();
    process.exit(1);
  }
}

async function main() {
  renderCli();
  await startBackgroundCommands();
}

main().catch(err => {
  console.error('Uknown error occured.');
  console.error(err);
  process.exit(1);
});

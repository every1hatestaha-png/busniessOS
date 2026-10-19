#!/usr/bin/env node
/**
 * Ahmad Gate Pass V2 production recovery helper.
 *
 * Standalone, no npm dependencies. Requires Node >=20 and PostgreSQL 18 client
 * utilities. Commands: preflight, selftest, backup, restore.
 *
 * Backup: read-only pg_dump -> AES-256-GCM stream -> encrypted file.
 * There is never a plaintext dump file on disk. Source URL and passphrase are
 * entered in a masked interactive prompt and never placed in command arguments.
 * Restore: verifies the encrypted file, then restores it only to a NEW database
 * on 127.0.0.1 using an independently supplied local PostgreSQL account.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { randomBytes, createHash, createCipheriv, createDecipheriv, scryptSync, timingSafeEqual } from 'node:crypto';
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const EXPECTED_HOST = 'ep-plain-smoke-b35qxc96.c-4.ap-southeast-1.aws.neon.tech';
const EXPECTED_DB = 'neondb';
const MAGIC = Buffer.from('MGPBAK01');
const SALT_SIZE = 16;
const IV_SIZE = 12;
const TAG_SIZE = 16;
const HEADER_SIZE = MAGIC.length + SALT_SIZE + IV_SIZE;
const BACKUP_DIR = path.join(process.env.LOCALAPPDATA || os.homedir(), 'MunshiOS', 'SecureGatePassBackups');
const MAX_ENCRYPTED_SIZE = 3 * 1024 * 1024 * 1024;

function fail(message) { throw new Error(message); }
function assertNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) fail('Node.js 20 or newer is required.');
}

function maskedPrompt(label) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) fail('Open an interactive PowerShell/Windows Terminal session.');
  return new Promise((resolve, reject) => {
    let value = '';
    const wasRaw = !!process.stdin.isRaw;
    process.stdout.write(`${label} (hidden, press Enter): `);
    process.stdin.resume();
    process.stdin.setRawMode(true);
    const cleanup = () => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(wasRaw);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    function onData(chunk) {
      for (const c of chunk.toString('utf8')) {
        if (c === '\r' || c === '\n') { cleanup(); resolve(value); return; }
        if (c === '\u0003') { cleanup(); reject(new Error('Cancelled.')); return; }
        if (c === '\u007f' || c === '\b') { value = value.slice(0, -1); continue; }
        if (c !== '\u0000' && c !== '\u001b') value += c;
      }
    }
    process.stdin.on('data', onData);
  });
}

async function passphrase({ confirm = false } = {}) {
  const one = await maskedPrompt('Encryption passphrase (minimum 16 characters)');
  if (one.length < 16) fail('Passphrase too short. Use a long, unique passphrase and keep it offline.');
  if (confirm) {
    const two = await maskedPrompt('Repeat encryption passphrase');
    const a = Buffer.from(one), b = Buffer.from(two);
    const match = a.length === b.length && timingSafeEqual(a, b);
    a.fill(0); b.fill(0);
    if (!match) fail('Passphrases did not match.');
  }
  return one;
}

function validateSourceUrl(raw) {
  let value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  if (/\s/.test(value)) fail('Paste only the PostgreSQL URL, not a psql command or environment assignment.');
  let u;
  try { u = new URL(value); } catch { fail('Invalid PostgreSQL URL.'); }
  if (!['postgresql:', 'postgres:'].includes(u.protocol) ||
      u.hostname !== EXPECTED_HOST ||
      decodeURIComponent(u.pathname) !== `/${EXPECTED_DB}` ||
      !u.username || !u.password ||
      (u.port && u.port !== '5432') ||
      u.hostname.includes('-pooler')) fail('Target mismatch. Refusing to read any other database.');
  const sslmode = u.searchParams.get('sslmode') || 'require';
  if (!['require', 'verify-full', 'verify-ca'].includes(sslmode)) fail('A secure TLS mode is required.');
  const channelBinding = u.searchParams.get('channel_binding') || 'prefer';
  if (!['require', 'prefer'].includes(channelBinding)) fail('Invalid channel binding.');
  return {
    host: u.hostname,
    port: u.port || '5432',
    database: EXPECTED_DB,
    username: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    sslmode,
    channelBinding,
  };
}

function pgEnv(source, extra = {}) {
  // Inherited service/options settings must not redirect or modify the private operation.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('PG')));
  Object.assign(env, extra);
  if (source) {
    env.PGPASSWORD = source.password;
    env.PGSSLMODE = source.sslmode;
    env.PGCHANNELBINDING = source.channelBinding;
    env.PGCONNECT_TIMEOUT = '10';
  }
  return env;
}

function pgTool(name) {
  const bin = process.env.PG18_BIN;
  if (bin) return path.join(bin, process.platform === 'win32' ? `${name}.exe` : name);
  const defaultWindows = `C:\\Program Files\\PostgreSQL\\18\\bin\\${name}.exe`;
  return process.platform === 'win32' && fs.existsSync(defaultWindows) ? defaultWindows : name;
}

function runSmall(program, args, env) {
  return new Promise((resolve, reject) => {
    const cp = spawn(program, args, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '', err = '';
    cp.stdout.on('data', d => { if (out.length < 12000) out += d.toString('utf8'); });
    cp.stderr.on('data', d => { if (err.length < 12000) err += d.toString('utf8'); });
    cp.on('error', () => reject(new Error(`Cannot run ${path.basename(program)}. Ensure PostgreSQL 18 tools are installed.`)));
    cp.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error(`${path.basename(program)} failed (exit ${code}). No raw database error is printed.`)));
  });
}

async function preflight({ restore = false } = {}) {
  assertNode();
  const names = restore ? ['pg_restore', 'psql', 'createdb'] : ['pg_dump', 'pg_restore'];
  const versions = {};
  for (const name of names) {
    const version = await runSmall(pgTool(name), ['--version'], process.env);
    if (!/\b18(?:\.|\b)/.test(version)) fail(`PostgreSQL 18 client utility required: ${name}. Found: ${version}`);
    versions[name] = version;
  }
  await fsp.mkdir(BACKUP_DIR, { recursive: true, mode: 0o700 });
  const stat = await fsp.stat(BACKUP_DIR);
  if (!stat.isDirectory()) fail('Backup target is not a directory.');
  console.log(JSON.stringify({ result: 'PASS', node: process.version, tools: versions, encryptedBackupDirectory: BACKUP_DIR, productionWrites: false }, null, 2));
}

function getKey(secret, salt) {
  return scryptSync(secret, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

async function encryptReadable(source, destination, secret) {
  const salt = randomBytes(SALT_SIZE), iv = randomBytes(IV_SIZE);
  const key = getKey(secret, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  key.fill(0);
  const plaintextHash = createHash('sha256');
  let bytes = 0;
  const meter = new Transform({ transform(chunk, _enc, cb) { bytes += chunk.length; plaintextHash.update(chunk); cb(null, chunk); } });
  await fsp.writeFile(destination, Buffer.concat([MAGIC, salt, iv]), { flag: 'wx', mode: 0o600 });
  try {
    await pipeline(source, meter, cipher, fs.createWriteStream(destination, { flags: 'a' }));
    await fsp.appendFile(destination, cipher.getAuthTag());
    return { plaintextSha256: plaintextHash.digest('hex'), plaintextBytes: bytes };
  } catch (e) {
    await fsp.unlink(destination).catch(() => {});
    throw e;
  }
}

async function decryptTo(file, secret, sink) {
  const stat = await fsp.stat(file);
  if (stat.size <= HEADER_SIZE + TAG_SIZE || stat.size > MAX_ENCRYPTED_SIZE) fail('Encrypted file size is invalid.');
  const fh = await fsp.open(file, 'r');
  let header = Buffer.alloc(HEADER_SIZE), tag = Buffer.alloc(TAG_SIZE);
  try {
    await fh.read(header, 0, HEADER_SIZE, 0);
    await fh.read(tag, 0, TAG_SIZE, stat.size - TAG_SIZE);
  } finally { await fh.close(); }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) fail('Not a MunshiOS encrypted Gate Pass backup.');
  const salt = header.subarray(MAGIC.length, MAGIC.length + SALT_SIZE);
  const iv = header.subarray(MAGIC.length + SALT_SIZE);
  const key = getKey(secret, salt);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  key.fill(0);
  decipher.setAuthTag(tag);
  const hash = createHash('sha256');
  let bytes = 0;
  const meter = new Transform({ transform(chunk, _enc, cb) { bytes += chunk.length; hash.update(chunk); cb(null, chunk); } });
  await pipeline(fs.createReadStream(file, { start: HEADER_SIZE, end: stat.size - TAG_SIZE - 1 }), decipher, meter, sink);
  return { plaintextSha256: hash.digest('hex'), plaintextBytes: bytes };
}

async function verifyBackup(file, secret) {
  const nullSink = new Writable({ write(_c, _e, cb) { cb(); } });
  const result = await decryptTo(file, secret, nullSink);
  if (!result.plaintextBytes) fail('Empty backup.');
  return result;
}

async function backup() {
  await preflight();
  const entered = await maskedPrompt('Paste DIRECT Neon production PostgreSQL URL');
  const source = validateSourceUrl(entered);
  const secret = await passphrase({ confirm: true });
  const file = path.join(BACKUP_DIR, `gatepass-production-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}.gpbak`);
  const partial = `${file}.part`;
  console.log('Starting READ-ONLY pg_dump into encrypted stream. No plaintext dump will be written.');
  const args = ['--format=custom', '--no-owner', '--no-privileges', '--host', source.host, '--port', source.port, '--username', source.username, '--dbname', source.database];
  const cp = spawn(pgTool('pg_dump'), args, { env: pgEnv(source), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  cp.stderr.resume(); // Never echo table names, internal errors or possible private details.
  let spawnError;
  cp.on('error', () => { spawnError = new Error('Unable to start pg_dump. Check PostgreSQL 18 tools.'); });
  const exited = new Promise(resolve => cp.on('close', code => resolve(code)));
  let result;
  try {
    result = await encryptReadable(cp.stdout, partial, secret);
    const code = await exited;
    if (spawnError || code !== 0 || result.plaintextBytes === 0) fail('pg_dump failed. The incomplete encrypted output will be removed.');
    const checked = await verifyBackup(partial, secret);
    if (checked.plaintextSha256 !== result.plaintextSha256 || checked.plaintextBytes !== result.plaintextBytes) fail('Encrypted backup verification failed.');
    await fsp.rename(partial, file);
    console.log(JSON.stringify({ result: 'ENCRYPTED_BACKUP_VERIFIED', file, encryptedBytes: (await fsp.stat(file)).size, plaintextBytes: result.plaintextBytes, sha256OfPlaintextArchive: result.plaintextSha256, productionWrites: false, next: 'Run restore for the isolated local PG18 test. Keep the passphrase OFFLINE.' }, null, 2));
  } catch (error) {
    cp.kill();
    await fsp.unlink(partial).catch(() => {});
    throw error;
  }
}

function localDbName() {
  return `munshios_gatepass_restore_${Date.now()}_${randomBytes(3).toString('hex')}`;
}

export function normalizeWindowsDataDirectory(value) {
  // PostgreSQL reports Windows paths with either slash style. Accept only a
  // drive-absolute filesystem path, never UNC/device/relative paths or traversal.
  if (typeof value !== 'string' || !/^[a-zA-Z]:[\\/]/.test(value)
      || /[\x00-\x1f<>"|?*]/.test(value)
      || value.slice(2).includes(':')
      || value.split(/[\\/]/).some(part => part === '.' || part === '..')) {
    fail('Cannot establish the physical Windows volume containing local PostgreSQL data.');
  }
  return path.win32.normalize(value);
}

async function encryptedRestoreDirectory(dataDirectory) {
  const directory = normalizeWindowsDataDirectory(dataDirectory);
  // Reject reparse points, including mounted volumes/junctions, rather than
  // attributing their contents to the drive letter of a different volume.
  let current = directory;
  while (true) {
    if ((await fsp.lstat(current)).isSymbolicLink()) fail('Reparse-point restore storage requires independent review.');
    const parent = path.win32.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const mount = directory.slice(0, 2).toUpperCase();
  const bitlockerProbe = `$ErrorActionPreference='Stop'; $p='${directory.replaceAll("'", "''")}'; while ($p) { $i=Get-Item -LiteralPath $p -Force; if ($i.Attributes -band [IO.FileAttributes]::ReparsePoint) { exit 3 }; $p=$i.Parent.FullName }; $v=Get-BitLockerVolume -MountPoint '${mount}' -ErrorAction Stop; if ($v.VolumeStatus -ne 'FullyEncrypted' -or $v.ProtectionStatus -ne 'On') { exit 2 }; 'ENCRYPTED'`;
  const protectedVolume = await runSmall('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', bitlockerProbe], process.env);
  if (protectedVolume !== 'ENCRYPTED') fail('Local PostgreSQL data drive encryption could not be verified.');
}

async function restore(file) {
  await preflight({ restore: true });
  const resolved = path.resolve(file);
  if (!resolved.startsWith(path.resolve(BACKUP_DIR) + path.sep)) fail('Restore only from the approved encrypted backup directory.');
  const secret = await passphrase();
  const verified = await verifyBackup(resolved, secret);
  console.log(`Authenticated encrypted backup verified (${verified.plaintextBytes} bytes).`);
  const user = (await maskedPrompt('LOCAL PostgreSQL username')).trim() || 'postgres';
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(user)) fail('Invalid local username.');
  const localPassword = await maskedPrompt('LOCAL PostgreSQL password');
  const env = pgEnv(null, { PGPASSWORD: localPassword, PGHOST: '127.0.0.1', PGPORT: '5432', PGUSER: user, PGCONNECT_TIMEOUT: '5', PGSSLMODE: 'disable' });
  const version = await runSmall(pgTool('psql'), ['-X', '-A', '-t', '-d', 'postgres', '-c', 'SHOW server_version_num'], env);
  if (!/^18\d{4}$/.test(version)) fail('The local server must be PostgreSQL 18.');
  // The local restore contains plaintext business records inside PostgreSQL.
  // Require positive evidence of encryption for the local server's data drive.
  // Do not treat an encrypted backup file as proof that the restore volume is safe.
  if (process.platform !== 'win32') fail('Automatic local restore requires verified Windows BitLocker storage.');
  const dataDirectory = await runSmall(pgTool('psql'), ['-X', '-A', '-t', '-d', 'postgres', '-c', 'SHOW data_directory'], env);
  await encryptedRestoreDirectory(dataDirectory);
  const db = localDbName();
  console.log(`Creating NEW LOCAL disposable database ${db}. Production will not be contacted.`);
  await runSmall(pgTool('createdb'), ['-h', '127.0.0.1', '-p', '5432', '-U', user, '-T', 'template0', '-E', 'UTF8', db], env);
  const args = ['--host', '127.0.0.1', '--port', '5432', '--username', user, '--dbname', db, '--no-owner', '--no-privileges', '--exit-on-error', '--single-transaction'];
  const cp = spawn(pgTool('pg_restore'), args, { env, stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
  cp.stderr.resume();
  let spawnError;
  cp.on('error', () => { spawnError = new Error('Unable to start pg_restore.'); });
  const exited = new Promise(resolve => cp.on('close', code => resolve(code)));
  try {
    const restored = await decryptTo(resolved, secret, cp.stdin);
    const code = await exited;
    if (spawnError || code !== 0 || restored.plaintextSha256 !== verified.plaintextSha256) fail('Local restore failed. Inspect the disposable local database before cleanup.');
    const count = await runSmall(pgTool('psql'), ['-X', '-A', '-t', '-h', '127.0.0.1', '-p', '5432', '-U', user, '-d', db, '-c', 'SELECT COUNT(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL'], env);
    const size = await runSmall(pgTool('psql'), ['-X', '-A', '-t', '-h', '127.0.0.1', '-p', '5432', '-U', user, '-d', db, '-c', 'SELECT pg_database_size(current_database())'], env);
    console.log(JSON.stringify({ result: 'LOCAL_RESTORE_PASS', localDatabase: db, appliedMigrations: Number(count), localDatabaseBytes: Number(size), backupFile: resolved, productionWrites: false, note: 'Disposable local database contains confidential business data. Restrict access and arrange explicit cleanup.' }, null, 2));
  } catch (e) {
    cp.kill();
    // Preserve failure evidence. Cleanup, even of this newly created local DB,
    // requires a separate explicit operator decision.
    console.error(`Restore stopped; preserve isolated database ${db} for private inspection. No automatic cleanup performed.`);
    throw e;
  }
}

async function selftest() {
  assertNode();
  const folder = await fsp.mkdtemp(path.join(os.tmpdir(), 'gatepass-crypto-test-'));
  const file = path.join(folder, 'synthetic.gpbak');
  const fixture = Buffer.concat([Buffer.from('synthetic-only: no customer data\0'), randomBytes(512 * 1024)]);
  const password = `selftest-${randomBytes(24).toString('hex')}`;
  try {
    const a = await encryptReadable(Readable.from([fixture]), file, password);
    const b = await verifyBackup(file, password);
    if (a.plaintextSha256 !== b.plaintextSha256 || a.plaintextBytes !== b.plaintextBytes) fail('Synthetic roundtrip mismatch.');
    let corrupted = await fsp.readFile(file);
    corrupted[HEADER_SIZE + 5] ^= 1;
    await fsp.writeFile(file, corrupted);
    let rejected = false;
    try { await verifyBackup(file, password); } catch { rejected = true; }
    if (!rejected) fail('Corrupted ciphertext was not rejected.');
    console.log(JSON.stringify({ result: 'PASS', tests: ['synthetic encrypted roundtrip', 'plaintext hash', 'GCM corruption rejection'], productionContact: false }));
  } finally {
    await fsp.unlink(file).catch(() => {});
    await fsp.rmdir(folder).catch(() => {});
  }
}

async function main() {
  const [command, argument] = process.argv.slice(2);
  if (command === 'preflight') await preflight();
  else if (command === 'selftest') await selftest();
  else if (command === 'backup') await backup();
  else if (command === 'restore' && argument) await restore(argument);
  else console.log('Usage: node gatepass_secure_backup.mjs preflight|selftest|backup|restore <encrypted-backup-file>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => {
  // Do not print raw client or connection errors, which may expose secrets.
  console.error(`Stopped safely: ${error.message}`);
  process.exitCode = 1;
});

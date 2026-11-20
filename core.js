'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const { randomUUID } = require('node:crypto');

const revisionName = /^([1-9][0-9]*)-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.json$/i;
const lexical = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function validateUnicode(value, label) {
  if (!value.isWellFormed()) {
    throw new TypeError(`${label} must be well-formed Unicode; unpaired surrogates cannot represent a filesystem name`);
  }
}

function validateId(id) {
  if (typeof id !== 'string' || !id || id === '.' || id === '..' || /[/\\\0]/.test(id)) {
    throw new TypeError('id must be a nonempty single path component without slash, backslash or NUL');
  }
  validateUnicode(id, 'id');
}

async function statIfPresent(location) {
  try { return await fs.lstat(location); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function requireDirectory(info, location) {
  if (info?.isSymbolicLink()) throw new Error(`Symlink directory is not allowed: ${location}`);
  if (!info?.isDirectory()) throw new Error(`Expected an ordinary directory: ${location}`);
}

// Check each ancestor before making a directory. In particular, never let
// recursive mkdir follow an existing symlink into an unrelated data tree.
async function storageDirectory(location, create = false) {
  let current = path.parse(location).root;
  requireDirectory(await fs.lstat(current), current);
  for (const component of location.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    let info = await statIfPresent(current);
    if (!info && create) {
      try { await fs.mkdir(current); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      info = await fs.lstat(current);
    }
    requireDirectory(info, current);
  }
}

function core(configuration) {
  // The historical factory accepts configuration, but does not define options.
  let location = null;

  async function configured(base) {
    if (base === null) throw new Error('Storage is not configured; await path(location) first');
    await storageDirectory(base);
    return base;
  }

  async function record(base, id) {
    validateId(id);
    const directory = path.join(await configured(base), id);
    const info = await statIfPresent(directory);
    if (info?.isSymbolicLink()) throw new Error(`Symlink record is not allowed: ${directory}`);
    return { directory, exists: info?.isDirectory() ?? false, collision: Boolean(info && !info.isDirectory()) };
  }

  async function revisions(base, id) {
    const state = await record(base, id);
    const entries = [];
    if (state.exists) {
      let names;
      try { names = await fs.readdir(state.directory); }
      catch (error) {
        // A failed first write withdraws its empty record directory; a reader
        // that saw it a moment earlier observes an absent record, not an error.
        if (error.code !== 'ENOENT') throw error;
        return { ...state, exists: false, entries };
      }
      for (const name of names) {
        const file = path.join(state.directory, name);
        const info = await fs.lstat(file);
        if (info.isSymbolicLink()) throw new Error(`Symlink revision is not allowed: ${file}`);
        const match = revisionName.exec(name);
        const rev = match ? Number(match[1]) : NaN;
        if (!info.isFile() || !match || !Number.isSafeInteger(rev)) {
          throw new Error(`Invalid revision file: ${file}`);
        }
        entries.push({ name, file, rev, uid: match[2] });
      }
      entries.sort((a, b) => a.rev - b.rev || lexical(a.name, b.name));
    }
    return { ...state, entries };
  }

  function validateDocument(data, id, entry) {
    if (data === null || typeof data !== 'object' || Array.isArray(data) ||
        data.id !== id || data.rev !== entry.rev || data.uid !== entry.uid) {
      throw new Error(`Document identity must match its record and revision filename: ${entry.file ?? id}`);
    }
    return data;
  }

  async function readDocument(id, entry) {
    const handle = await fs.open(entry.file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      let data;
      try { data = JSON.parse(await handle.readFile('utf8')); }
      catch (error) {
        if (error instanceof SyntaxError) throw new Error(`Invalid JSON in revision ${entry.file}: ${error.message}`);
        throw error;
      }
      return validateDocument(data, id, entry);
    } finally { await handle.close(); }
  }

  async function list(base) {
    await configured(base);
    const ids = [];
    for (const entry of await fs.readdir(base, { withFileTypes: true })) {
      // Ordinary root files are not records. Skip them from the directory
      // snapshot so a staging file unlinked meanwhile needs no further stat.
      if (entry.isFile()) continue;
      const id = entry.name, directory = path.join(base, id);
      // An entry withdrawn since the directory snapshot is simply absent.
      const info = await statIfPresent(directory);
      if (info?.isSymbolicLink()) throw new Error(`Symlink record is not allowed: ${directory}`);
      if (info?.isDirectory()) { validateId(id); ids.push(id); }
    }
    return ids.sort(lexical);
  }

  const api = {
    async path(value) {
      if (typeof value !== 'string' || !value || value.includes('\0')) {
        throw new TypeError('Storage location must be a nonempty path string without NUL');
      }
      validateUnicode(value, 'Storage location');
      const resolved = path.resolve(value);
      await storageDirectory(resolved, true);
      location = resolved;
    },

    async has(id) {
      return (await record(location, id)).exists;
    },

    async all() {
      return list(location);
    },

    async rev(id) {
      const { entries } = await revisions(location, id);
      return entries.at(-1)?.rev ?? 0;
    },

    async get(id) {
      const { entries } = await revisions(location, id);
      return entries.length ? readDocument(id, entries.at(-1)) : null;
    },

    async put(data) {
      const selected = location;
      if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        throw new TypeError('data must be a JSON-serializable object');
      }
      // Snapshot top-level properties once; the caller remains unchanged.
      const copy = { ...data };
      validateId(copy.id);
      const supplied = copy.rev;
      const observe = supplied === undefined || supplied === null || supplied === 0;
      if (!observe && (!Number.isSafeInteger(supplied) || supplied < 1 || supplied === Number.MAX_SAFE_INTEGER)) {
        throw new TypeError('rev must be a positive safe integer below the maximum, or omitted, null or zero');
      }
      const state = await revisions(selected, copy.id);
      if (state.collision) throw new Error(`Record path is not a directory: ${state.directory}`);
      const base = observe ? state.entries.at(-1)?.rev ?? 0 : supplied;
      if (base >= Number.MAX_SAFE_INTEGER) throw new RangeError('Next revision would exceed the safe integer range');
      const rev = base + 1, uid = randomUUID();
      const updated = { ...copy, rev, uid };
      let serialized;
      try { serialized = JSON.stringify(updated, null, '  '); }
      catch (error) { throw new TypeError(`data must be JSON-serializable: ${error.message}`); }
      if (serialized === undefined) throw new TypeError('data must serialize to a JSON object');
      // A custom toJSON must not replace identity with a value we cannot read.
      const saved = validateDocument(JSON.parse(serialized), copy.id, { rev, uid });
      // Validation/serialization finish before any record or revision is created.
      await configured(selected);
      const file = path.join(state.directory, `${rev}-${uid}.json`);
      // Stage outside record directories: readers only inspect published names.
      // Opening exclusively establishes ownership before cleanup is permitted.
      const staging = path.join(selected, `.und-stage-${randomUUID()}`);
      const handle = await fs.open(staging, 'wx');
      let created = false, published = false;
      try {
        try { await handle.writeFile(serialized); }
        finally { await handle.close(); }
        // The record directory is made only once complete bytes are staged, so
        // an earlier failure leaves no trace of a record that was never written.
        for (let attempt = 1; !published; attempt++) {
          try {
            try { await fs.mkdir(state.directory); created = true; }
            catch (error) { if (error.code !== 'EEXIST') throw error; }
            requireDirectory(await fs.lstat(state.directory), state.directory);
            // A local hard link publishes complete bytes atomically and fails with
            // EEXIST rather than replacing a competing final revision filename.
            await fs.link(staging, file);
            published = true;
          } catch (error) {
            // Another writer's failed first put may withdraw the still-empty
            // directory between our check and our link; make it again.
            if (error.code !== 'ENOENT' || attempt === 3) throw error;
          }
        }
      } finally {
        // Failure here cannot undo known publication or replace its outcome.
        // An orphan is an ordinary root file, ignored by all/get/rev/clean.
        try { await fs.unlink(staging); } catch {}
        // Withdraw a record directory this put made but could not publish into,
        // so has()/all() do not report a record with no revision. rmdir removes
        // only an empty directory: a concurrent writer's revision keeps it.
        if (created && !published) { try { await fs.rmdir(state.directory); } catch {} }
      }
      return saved;
    },

    async clean(depth = 1) {
      const base = location;
      if (!Number.isSafeInteger(depth) || depth < 1) throw new TypeError('depth must be a positive safe integer');
      const removals = [];
      // Read every document before unlinking anything. Corruption in an older
      // revision must not be silently erased while retaining a newer winner.
      for (const id of await list(base)) {
        const { entries } = await revisions(base, id);
        for (const entry of entries) await readDocument(id, entry);
        const groups = [...new Set(entries.map(entry => entry.rev))];
        const keep = new Set(groups.slice(-depth));
        for (const entry of entries) if (!keep.has(entry.rev)) removals.push(entry.file);
      }
      for (const file of removals) await fs.unlink(file);
      return removals;
    }
  };
  return api;
}

module.exports = { core };

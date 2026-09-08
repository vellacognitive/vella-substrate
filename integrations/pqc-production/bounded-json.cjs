'use strict';
const { types } = require('node:util');
const base = require('../../sdk/node/proof-v2.cjs');
const MAX_BYTES = 1024 * 1024;
const LIMITS = Object.freeze({ bytes: MAX_BYTES, depth: 32, nodes: 16384, fields: 256, elements: 4096, stringBytes: 65536 });

// Preflight before serialization/canonicalization or crypto. Do not invoke getters.
function assertRecordJson(value) {
  let nodes = 0, bytes = 0;
  const ancestors = new Set();
  function visit(item, depth) {
    if (++nodes > LIMITS.nodes || depth > LIMITS.depth) throw new TypeError('JSON resource limit');
    if (typeof item === 'string') {
      if (item.length > LIMITS.stringBytes) throw new TypeError('JSON string limit');
      const size = Buffer.byteLength(item);
      if (size > LIMITS.stringBytes) throw new TypeError('JSON string limit');
      bytes += size + 2;
    } else if (item === null || typeof item === 'number' || typeof item === 'boolean') {
      bytes += 4;
    } else {
      if (typeof item !== 'object' || types.isProxy(item) || ancestors.has(item)) throw new TypeError('unsupported JSON object');
      const array = Array.isArray(item);
      if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(item))) throw new TypeError('JSON object must be plain');
      if (Object.getOwnPropertySymbols(item).length) throw new TypeError('JSON symbols unsupported');
      const names = Object.getOwnPropertyNames(item);
      if (array ? item.length > LIMITS.elements || names.length !== item.length + 1 : names.length > LIMITS.fields) throw new TypeError('JSON collection limit');
      ancestors.add(item);
      if (array) {
        for (let i = 0; i < item.length; i++) {
          const d = Object.getOwnPropertyDescriptor(item, String(i));
          if (!d || !Object.hasOwn(d, 'value') || !d.enumerable) throw new TypeError('JSON arrays must be dense data');
          visit(d.value, depth + 1);
        }
      } else {
        for (const name of names) {
          const d = Object.getOwnPropertyDescriptor(item, name);
          if (!Object.hasOwn(d, 'value') || !d.enumerable) throw new TypeError('JSON accessors or hidden properties unsupported');
          visit(name, depth + 1);
          visit(d.value, depth + 1);
        }
      }
      ancestors.delete(item);
      bytes += (array ? item.length : names.length) + 2;
    }
    if (bytes > MAX_BYTES) throw new TypeError('JSON byte limit');
  }
  visit(value, 0);
  base.assertJson(value);
  if (Buffer.byteLength(JSON.stringify(value)) > MAX_BYTES) throw new TypeError('JSON byte limit');
}

function parse(text, maximum = MAX_BYTES) {
  if (typeof text !== 'string' || text.length > maximum || Buffer.byteLength(text) > maximum) throw new TypeError('JSON byte limit');
  let depth = 0, inString = false, escaped = false;
  for (const char of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '{' || char === '[') { if (++depth > LIMITS.depth + 1) throw new TypeError('JSON depth limit'); }
    else if (char === '}' || char === ']') depth--;
  }
  return base.parseJson(text);
}

function canonicalize(value) { assertRecordJson(value); return base.canonicalize(value); }
module.exports = { LIMITS, assertRecordJson, parse, canonicalize };

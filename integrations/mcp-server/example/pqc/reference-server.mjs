import {readFile} from 'node:fs/promises';
import {serveStdio} from '@modelcontextprotocol/server/stdio';
import {createLocalHybridReference} from './reference.mjs';
const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
const reference = await createLocalHybridReference(config);
process.once('exit', () => { try { reference.close(); } catch { /* Operator crash recovery handles stale locks. */ } });
process.once('SIGTERM', () => process.exit(0));
serveStdio(reference.createServer, {legacy: 'reject'});

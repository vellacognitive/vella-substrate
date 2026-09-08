'use strict';
// A valid signature does not make a claimed key-set/revision match supplied trust.
function matchesArchiveContext(record, keySetId, trustRevision) {
  const context = record.evidence?.signing_key;
  return context === undefined || (context !== null && typeof context === 'object' && !Array.isArray(context) &&
    Object.keys(context).length === 2 && context.key_set_id === keySetId && Number.isSafeInteger(context.key_revision) &&
    context.key_revision >= 1 && context.key_revision <= trustRevision);
}
module.exports = {matchesArchiveContext};

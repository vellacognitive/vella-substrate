"""Validate generated public vectors against draft schemas and negative controls."""
import base64
import copy
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

root = Path(__file__).resolve().parents[2]
validators = [Draft202012Validator(json.loads((root / 'spec/pqc' / name).read_text()), format_checker=FormatChecker())
              for name in ('envelope-draft.schema.json', 'record-draft.schema.json')]
for validator in validators:
    Draft202012Validator.check_schema(validator.schema)
count = 0
for vector in json.loads(Path(sys.argv[1]).read_text())['vectors']:
    bundle = vector['bundle']
    record = json.loads(base64.b64decode(bundle['payload']))
    for validator, value in zip(validators, (bundle, record), strict=True):
        validator.validate(value)
        count += 1
        extra = copy.deepcopy(value)
        extra['unknown'] = True
        assert not validator.is_valid(extra)
        count += 1
        for field in value:
            missing = copy.deepcopy(value)
            del missing[field]
            assert not validator.is_valid(missing), field
            count += 1
print(json.dumps({'kind': 'pqc-draft-schema-checks', 'assertions': count, 'allPassed': True}))

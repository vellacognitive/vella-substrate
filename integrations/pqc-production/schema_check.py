"""Validate generated public vectors against v3 schemas and negative controls."""
import base64
import copy
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.validators import validator_for

root = Path(__file__).resolve().parents[2]
validators = [Draft202012Validator(json.loads((root / 'spec/pqc' / name).read_text()), format_checker=FormatChecker())
              for name in ('envelope-v3.schema.json', 'record-v3.schema.json')]
for validator in validators:
    assert validator.schema['$schema'] == 'https://json-schema.org/draft/2020-12/schema'
    assert validator_for(validator.schema, default=None) is Draft202012Validator
    assert validator.schema['$id'].startswith('urn:vella:v3:')
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
print(json.dumps({'kind': 'pqc-v3-schema-checks', 'assertions': count, 'allPassed': True}))

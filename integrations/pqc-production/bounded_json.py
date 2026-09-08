"""Bounded draft JSON domain. Not imported by the released SDK."""
from vella import proof_v2 as base

MAX_BYTES = 1024 * 1024
LIMITS = {'bytes': MAX_BYTES, 'depth': 32, 'nodes': 16384, 'fields': 256, 'elements': 4096, 'stringBytes': 65536}


def assert_record_json(value):
    nodes, size = 0, 0
    ancestors = set()

    def visit(item, depth):
        nonlocal nodes, size
        nodes += 1
        if nodes > LIMITS['nodes'] or depth > LIMITS['depth']:
            raise ValueError('JSON resource limit')
        if type(item) is str:
            if len(item) > LIMITS['stringBytes']:
                raise ValueError('JSON string limit')
            count = len(item.encode('utf8'))
            if count > LIMITS['stringBytes']:
                raise ValueError('JSON string limit')
            size += count + 2
        elif item is None or type(item) in (int, float, bool):
            size += 4
        else:
            if type(item) not in (dict, list) or id(item) in ancestors:
                raise ValueError('unsupported JSON object')
            if len(item) > LIMITS['fields' if type(item) is dict else 'elements']:
                raise ValueError('JSON collection limit')
            ancestors.add(id(item))
            if type(item) is dict:
                for key, child in item.items():
                    if type(key) is not str:
                        raise ValueError('JSON key must be string')
                    visit(key, depth + 1)
                    visit(child, depth + 1)
            else:
                for child in item:
                    visit(child, depth + 1)
            ancestors.remove(id(item))
            size += len(item) + 2
        if size > MAX_BYTES:
            raise ValueError('JSON byte limit')

    visit(value, 0)
    base.assert_json(value)
    # Canonical bytes make serialized-size decisions identical across runtimes.
    if len(base.canonicalize(value)) > MAX_BYTES:
        raise ValueError('JSON byte limit')


def parse(text, maximum=MAX_BYTES):
    if type(text) is not str or len(text) > maximum or len(text.encode('utf8')) > maximum:
        raise ValueError('JSON byte limit')
    depth, in_string, escaped = 0, False, False
    for char in text:
        if in_string:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == '"':
                in_string = False
        elif char == '"':
            in_string = True
        elif char in '[{':
            depth += 1
            if depth > LIMITS['depth'] + 1:
                raise ValueError('JSON depth limit')
        elif char in ']}':
            depth -= 1
    return base.parse_json(text)


def canonicalize(value):
    assert_record_json(value)
    return base.canonicalize(value)

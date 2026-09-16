"""Verify the release bundle and unpack the actual assets for GitHub Pages."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import zipfile

release = json.loads(Path('release.json').read_text(encoding='utf-8'))
assert release.get('ready') is True, 'Release bundle is not approved for deployment'
archive = Path('bundle/station-web.zip')
with archive.open('rb') as stream:
    assert hashlib.file_digest(stream, 'sha256').hexdigest() == release['sha256'], 'Release checksum mismatch'
assert archive.stat().st_size == release['bytes'], 'Release size mismatch'
output = Path('_site')
with zipfile.ZipFile(archive) as bundle:
    assert sum(item.file_size for item in bundle.infolist()) < 1_000_000_000, 'Pages 1 GB limit exceeded'
    for item in bundle.infolist():
        path = PurePosixPath(item.filename)
        assert not path.is_absolute() and '..' not in path.parts and '\\' not in item.filename, 'Unsafe ZIP path'
    assert len(set(bundle.namelist())) == len(bundle.namelist()), 'Duplicate ZIP paths'
    bundle.extractall(output)
manifest = json.loads((output / 'site-manifest.json').read_text(encoding='utf-8'))
expected = {item['path'] for item in manifest['files']} | {'site-manifest.json'}
assert {p.relative_to(output).as_posix() for p in output.rglob('*') if p.is_file()} == expected, 'Unexpected web files'
for item in manifest['files']:
    path = output / item['path']
    assert path.stat().st_size == item['bytes'], f'Size mismatch: {path}'
    with path.open('rb') as stream:
        assert hashlib.file_digest(stream, 'sha256').hexdigest() == item['sha256'], f'Checksum mismatch: {path}'
    if path.suffix == '.glb':
        with path.open('rb') as stream:
            assert stream.read(4) == b'glTF', f'LFS pointer or invalid GLB: {path}'
assert (output / manifest['entry']).is_file()
print(f'Verified {len(expected)} files; {manifest["bytes"]:,} bytes; entry={manifest["entry"]}')

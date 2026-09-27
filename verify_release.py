"""Verify a complete release, or apply a verified text overlay to a prior release."""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import json
import re
import shutil
import stat
import zipfile

LIMIT = 1_000_000_000
TEXT_SUFFIXES = {'.html', '.js', '.css', '.json', '.txt', '.md', '.xml', '.svg', '.csv', '.webmanifest'}

def require(condition, message):
    if not condition:
        raise ValueError(message)

def safe_path(raw):
    require(isinstance(raw, str) and raw and '\\' not in raw and ':' not in raw and '\0' not in raw, 'Unsafe path')
    path = PurePosixPath(raw)
    require(path.parts and not path.is_absolute() and '..' not in path.parts and raw == path.as_posix(), f'Unsafe path: {raw}')
    require(all(part not in ('', '.') for part in path.parts), f'Unsafe path: {raw}')
    return path

def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def check_record(item):
    safe_path(item['path'])
    require(type(item['bytes']) is int and 0 <= item['bytes'] < LIMIT, 'Invalid file size')
    require(isinstance(item['sha256'], str) and re.fullmatch('[0-9a-f]{64}', item['sha256']), 'Invalid checksum')

def records(items):
    require(isinstance(items, list), 'Expected a file list')
    result, keys = {}, set()
    for item in items:
        check_record(item)
        key = item['path'].casefold()
        require(key not in keys, f'Duplicate path: {item["path"]}')
        keys.add(key)
        result[item['path']] = item
    return result

def verify_file(path, record):
    require(path.is_file() and not path.is_symlink(), f'Missing or unsafe file: {path}')
    require(path.stat().st_size == record['bytes'], f'Size mismatch: {path}')
    require(digest(path) == record['sha256'], f'Checksum mismatch: {path}')

def manifest_at(path):
    manifest = json.loads(path.read_text(encoding='utf-8'))
    files = records(manifest['files'])
    require('site-manifest.json' not in files, 'Manifest cannot include itself')
    require(manifest['file_count'] == len(files), 'Manifest count mismatch')
    require(manifest['bytes'] == sum(item['bytes'] for item in files.values()), 'Manifest total mismatch')
    require(manifest['bytes'] + path.stat().st_size < LIMIT, 'Pages 1 GB limit exceeded')
    require(safe_path(manifest['entry']).as_posix() in files, 'Missing entry')
    return manifest, files

def inventory(root):
    result = set()
    for path in root.rglob('*'):
        require(not path.is_symlink(), f'Symlink not allowed: {path}')
        if path.is_file():
            result.add(path.relative_to(root).as_posix())
        else:
            require(path.is_dir(), f'Unexpected filesystem entry: {path}')
    return result

def verify_site(root):
    manifest, files = manifest_at(root / 'site-manifest.json')
    require(inventory(root) == set(files) | {'site-manifest.json'}, 'Unexpected or missing web files')
    for relative, item in files.items():
        path = root / relative
        verify_file(path, item)
        if path.suffix.lower() == '.glb':
            with path.open('rb') as stream:
                require(stream.read(4) == b'glTF', f'LFS pointer or invalid GLB: {path}')
    return manifest, files

def extract_archive(archive, output, bundle_info):
    verify_file(archive, bundle_info)
    require(not output.exists(), f'Output must not already exist: {output}')
    with zipfile.ZipFile(archive) as bundle:
        require(sum(item.file_size for item in bundle.infolist()) < LIMIT, 'Pages 1 GB limit exceeded')
        names = set()
        for item in bundle.infolist():
            relative = item.filename[:-1] if item.is_dir() else item.filename
            path = safe_path(relative)
            key = path.as_posix().casefold()
            require(key not in names, f'Duplicate ZIP path: {relative}')
            names.add(key)
            mode = item.external_attr >> 16
            require(not stat.S_ISLNK(mode), f'ZIP symlink: {relative}')
            require(stat.S_IFMT(mode) in (0, stat.S_IFREG, stat.S_IFDIR), f'Unsafe ZIP entry: {relative}')
            require(not item.flag_bits & 1, 'Encrypted ZIP entries are not supported')
        output.mkdir(parents=True)
        bundle.extractall(output)
    return verify_site(output)

def check_text(path):
    relative = safe_path(path.name)
    require(path.name == '.nojekyll' or relative.suffix.lower() in TEXT_SUFFIXES, f'Overlay binary is not allowed: {path}')
    text = path.read_text(encoding='utf-8')
    require('\0' not in text, f'Binary data in text overlay: {path}')

def apply_overlay(release, root, output, base_manifest, base_files):
    config = release['overlay']
    overlay = root / safe_path(config['directory'])
    descriptor = root / safe_path(config['manifest'])
    require(overlay.is_dir() and not overlay.is_symlink(), 'Missing or unsafe overlay directory')
    verify_file(descriptor, {'bytes': config['bytes'], 'sha256': config['sha256']})
    plan = json.loads(descriptor.read_text(encoding='utf-8'))
    require(plan['schemaVersion'] == 1, 'Unsupported overlay schema')
    require(plan['source_commit'] == release['source_commit'], 'Overlay source commit mismatch')
    require(plan['base_manifest_sha256'] == release['base']['manifest_sha256'], 'Base manifest pin mismatch')
    require(digest(output / 'site-manifest.json') == plan['base_manifest_sha256'], 'Base manifest mismatch')
    files = records(plan['files'])
    require(inventory(overlay) == set(files), 'Unexpected or missing overlay files')
    for relative, item in files.items():
        path = overlay / relative
        verify_file(path, item)
        check_text(path)
    target_path = overlay / 'site-manifest.json'
    require('site-manifest.json' in files, 'Overlay requires the complete target site manifest')
    require(digest(target_path) == release['site_manifest_sha256'] == plan['source_manifest_sha256'], 'Source site manifest mismatch')
    target_manifest, target_files = manifest_at(target_path)
    require(target_manifest['source_commit'] == release['source_commit'], 'Target source commit mismatch')
    require(target_manifest.get('source_has_changes') is False, 'Target manifest has uncommitted source changes')
    changed = {path for path, item in target_files.items() if path not in base_files or (item['bytes'], item['sha256']) != (base_files[path]['bytes'], base_files[path]['sha256'])}
    require(set(files) == changed | {'site-manifest.json'}, 'Overlay must exactly match source manifest differences')
    removed = plan['remove']
    require(isinstance(removed, list) and len(removed) == len(set(removed)), 'Invalid removal list')
    for relative in removed:
        safe_path(relative)
    require(set(removed) == set(base_files) - set(target_files), 'Removal list does not match source manifests')
    for relative in changed:
        require(files[relative] == target_files[relative], f'Target file metadata mismatch: {relative}')
    for relative in removed:
        (output / relative).unlink()
    for relative in files:
        destination = output / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(overlay / relative, destination)
    return verify_site(output)

def load_release(path):
    release = json.loads(path.read_text(encoding='utf-8'))
    require(release.get('ready') is True, 'Release is not approved for deployment')
    mode = release.get('mode', 'bundle')
    require(mode in ('bundle', 'overlay'), 'Unknown release mode')
    bundle = release['base'] if mode == 'overlay' else release
    require(isinstance(bundle['tag'], str) and re.fullmatch('[A-Za-z0-9][A-Za-z0-9._-]*', bundle['tag']), 'Invalid release tag')
    return release, bundle

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--release', default='release.json')
    parser.add_argument('--archive', default='bundle/station-web.zip')
    parser.add_argument('--output', default='_site')
    parser.add_argument('--download-tag', action='store_true')
    args = parser.parse_args()
    release_path = Path(args.release)
    release, bundle_info = load_release(release_path)
    if args.download_tag:
        print(bundle_info['tag'])
        return
    output = Path(args.output)
    manifest, files = extract_archive(Path(args.archive), output, bundle_info)
    if release.get('mode') == 'overlay':
        manifest, files = apply_overlay(release, release_path.parent, output, manifest, files)
    print(f'Verified {len(files) + 1} files; {manifest["bytes"]:,} content bytes; entry={manifest["entry"]}; source={manifest["source_commit"]}')

if __name__ == '__main__':
    main()

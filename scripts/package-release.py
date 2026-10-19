"""Package offline assets, excluding development files and QA fixtures."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from shutil import copyfile
import json
import re

root = Path(__file__).resolve().parents[1]
worker = (root / 'service-worker.js').read_text(encoding='utf-8')
version = re.search(r"const CACHE = 'labyrinth-marble-(v\d+)'", worker).group(1)
asset_block = re.search(r'const ASSETS = \[(.*?)\];', worker, re.S).group(1)
files = {path.removeprefix('./') or 'index.html' for path in re.findall(r"'([^']+)'", asset_block)}
files.update({'service-worker.js', 'web.config'})
manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
files.update(icon['src'] for icon in manifest['icons'])
for path in files:
    assert (root / path).is_file(), f'Missing asset: {path}'
    if path.endswith('.js'):
        for reference in re.findall(r"from ['\"]([^'\"]+)['\"]", (root / path).read_text(encoding='utf-8')):
            if reference.startswith('.'):
                imported = (root / path).parent.joinpath(reference).resolve().relative_to(root).as_posix()
                assert imported in files, f'Import absent from offline assets: {imported}'

notes = f'''LABYRINTH - MOBILE RELEASE {version}

Replace all included files in the live folder, preserving modules/ and icons/.
No build step is needed. Open the live HTTPS site online once to download the
update, then close its tabs and installed app windows and reopen to activate.

Tap Begin on your phone or tablet and allow motion access if prompted.
Hold the device comfortably to establish neutral. Keyboard and direction-pad
controls remain available. Maze difficulty applies to a new journey.

Gold diamond: checkpoint. It turns green when saved. Dark round pocket:
hazard. Green pocket with a tick: finish. Route holes have space to steer
past them; Show path follows the gaps.
'''
output = root / 'artifacts' / f'Labyrinth-mobile-{version}.zip'
output.parent.mkdir(exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for path in sorted(files): archive.write(root / path, path)
    archive.writestr('START-HERE.txt', notes)
with ZipFile(output) as archive:
    assert archive.testzip() is None
    for path in files: assert archive.read(path) == (root / path).read_bytes(), f'Archive mismatch: {path}'
copyfile(output, root / 'artifacts' / 'Labyrinth-mobile-ready.zip')
print(f'Created and verified: {output}')
print(f'{len(files) + 1} files, {output.stat().st_size:,} bytes; imports and offline assets verified.')

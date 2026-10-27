from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root=Path(__file__).resolve().parents[1]
target=root.parent/'order-management-system.zip'
with ZipFile(target,'w',ZIP_DEFLATED) as z:
 for f in sorted(root.rglob('*')):
  if not f.is_file(): continue
  rel=f.relative_to(root)
  if any(part in ('node_modules','.git','dist','data','__pycache__') for part in rel.parts): continue
  if (f.name.startswith('.env') and f.name!='.env.example') or f.name=='.DS_Store' or f.suffix in ('.log','.zip'): continue
  if rel.parts[:2]==('database','backups') and f.name!='.gitkeep': continue
  z.write(f,Path(root.name)/rel)
print(target)

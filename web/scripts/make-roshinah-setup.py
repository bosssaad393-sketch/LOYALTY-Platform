import os, glob
files = sorted(glob.glob('supabase/migrations/*.sql'))
assert len(files) == 31, len(files)
parts = ['''-- Al Roshinah: the whole database in one file.
-- Made by web/scripts/make-roshinah-setup.py, run from the repository root (do not edit by hand): migrations 0001 to 0031 in order, then the two seeds.
-- Run ONCE on Al Roshinah's OWN new, EMPTY Supabase project (SQL editor, or as one migration). Not a second time:
-- the earliest parts stop with "already exists" on a database that has them.
-- Checked by web/tests/roshinahSetup.test.ts, which runs this exact file on a real Postgres engine and walks a guest
-- through joining, a visit, a gift, a table request and a till bill.
''']
for f in files + ['supabase/seeds/roshinah.sql', 'supabase/seeds/roshinah-menu.sql']:
    parts.append(f'\n-- ===================================================================================================\n-- {os.path.basename(f)}\n-- ===================================================================================================\n')
    parts.append(open(f, encoding='utf-8').read().rstrip() + '\n')
out = ''.join(parts)
open('supabase/roshinah-setup.sql', 'w', encoding='utf-8', newline='\n').write(out)
print(len(files), 'migrations', len(out), 'bytes')

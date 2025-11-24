import shutil
import os

source = os.path.join('public', 'game.js')
dest = os.path.join('monster-fight', 'monster-fight.js')

try:
    shutil.copy2(source, dest)
    print(f'Successfully copied {source} to {dest}')
except Exception as e:
    print(f'Error: {e}')
    exit(1)

#!/usr/bin/env python3
from pathlib import Path
p = Path('family-viewer/src/CloudAccess.jsx')
t = p.read_text()
# Rename the handler function only (not state setter setUnlockPassword)
t2 = t.replace(
    'const unlockPassword=()=>task(async stamp=>{const key=await unlockWithPassword(headRef.current.envelope,user.id,unlockPassword);assertEpoch(stamp);setUnlockPassword(\'\');await finishUnlock(stamp,key);});',
    'const openWithVaultPassword=()=>task(async stamp=>{const key=await unlockWithPassword(headRef.current.envelope,user.id,unlockPassword);assertEpoch(stamp);setUnlockPassword(\'\');await finishUnlock(stamp,key);});',
)
t2 = t2.replace('unlockPassword();', 'openWithVaultPassword();')
# Avoid double-replace on state - the form onSubmit should call openWithVaultPassword
if 'openWithVaultPassword' not in t2:
    raise SystemExit('rename failed')
p.write_text(t2)
print('fixed', t2.count('openWithVaultPassword'))

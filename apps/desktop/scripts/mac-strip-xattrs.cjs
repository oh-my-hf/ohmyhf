'use strict'

const { execFileSync } = require('node:child_process')

// codesign refuses bundles whose files carry extended attributes ("resource
// fork, Finder information, or similar detritus not allowed"). macOS stamps
// freshly written files with com.apple.provenance, and checkouts under an
// iCloud-synced folder gain com.apple.fileprovider.* too, so strip everything
// from the packed app right before electron-builder signs it.
module.exports = function stripXattrs(context) {
  if (context.electronPlatformName !== 'darwin') return
  execFileSync('/usr/bin/xattr', ['-cr', context.appOutDir], { stdio: 'inherit' })
}

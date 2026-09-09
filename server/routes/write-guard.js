"use strict";

const { canWrite } = require("../git/identity");

// Gates every write endpoint (new media, tag proposals, votes): only a
// machine with push access to the community git repo may write. This is
// what makes it safe to also serve read-only search over the LAN to phones
// etc. — see data/README.md.
async function requireWriteAccess(req, res, next) {
  const status = await canWrite();
  if (!status.allowed) {
    return res.status(403).json({
      error: "not_authorized_to_write",
      reason: status.reason || "this machine is not synced with the community git repository",
    });
  }
  req.voterId = status.voterId;
  next();
}

module.exports = { requireWriteAccess };

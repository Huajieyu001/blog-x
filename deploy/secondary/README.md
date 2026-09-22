# Secondary hardening handoff

`harden-host.sh` is a staged, root-only production tool. Do not run it from a copied command, and never paste passwords, private keys, or environment-file contents into a shell, log, or repository.

1. Put one persistent local **public** management key in a protected local file. Run `prepare-admin --management-key-file=/absolute/key.pub`, then prove a new `ubuntu` key-only session before any authentication change.
2. Run `provision-tunnel-user --tunnel-key-file=/absolute/existing-tunnel.pub`. The old Ubuntu authorization intentionally remains active.
3. The primary-node operator switches/restarts the tunnel and proves its health plus secondary loopback API health through `blog-x-tunnel`. Only then run `finalize-tunnel-migration` with the exact SHA256 public-key fingerprint and literal health acknowledgement.
4. In a separate fresh key-only Ubuntu session, use `harden-ssh`, verify `ssh -vv` offers `publickey` but not password or keyboard-interactive authentication, and run `confirm-ssh` before the rollback timer expires.
5. Apply and confirm UFW only after another fresh external SSH check. It allows TCP 22 only; API port 3001 and PostgreSQL port 5432 are never host firewall exceptions.
6. Run `verify` to prove loopback API health, private PostgreSQL mapping, Compose health, SSH policy, UFW, and tunnel restriction. `rollback` accepts only the stage backup path emitted by a failed or unconfirmed stage.
7. Rotate exposed Ubuntu/root passwords interactively only after every key-only, tunnel, listener, health, and firewall check succeeds. Password rotation is deliberately not automated.

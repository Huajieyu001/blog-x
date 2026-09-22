# Blog X primary bundle

This bundle is intentionally inert until an operator, after the production freeze is explicitly lifted, provides `/etc/blog-x/primary.env`, a dedicated SSH key and its pinned `known_hosts` entry. It does not install packages or generate credentials.

Build and save `blog-x-web:<40-char-revision>` away from the 2C2G primary. Run `preflight.sh`, then `deploy.sh <revision> <staged-source-directory> <image-archive>`. The deployer creates a verified backup, loads and health-checks the prebuilt candidate on `127.0.0.1:3101`, switches the loopback-only Web service, validates the real Nginx candidate, and finally reloads Nginx. Any failed cutover restores the original Hexo site and Nginx state from the backup. Browser traffic remains `https://huajieyu001.top`; the container reaches the API only through the host-local SSH forward at `127.0.0.1:3001`.

Use `rollback.sh <release-id>` to return to a retained Blog X release, or `restore-backup.sh <backup-id>` to restore the pre-cutover site. Never put private keys, tokens, passwords, or host values in this directory.

## Host hardening order

`harden-host.sh` is a root-only, staged maintenance tool. It does not publish an
application image or generate credentials. Keep the existing root session open until
every confirmation step is complete. Generate one local ED25519 management key outside
this repository, then use this order:

1. `prepare-admin --public-key 'ssh-ed25519 ...'`, then prove a fresh
   `blog-x-admin` key-only login in a separate terminal.
2. After the secondary dedicated tunnel account has been provisioned, run
   `switch-tunnel-user blog-x-tunnel` and verify the loopback API health check.
3. From that fresh administrator session, run
   `harden-ssh --fresh-key-session`. Open and verify a second fresh key-only session,
   then run `confirm-ssh --fresh-key-session` there.
4. Run `apply-firewall`, verify an external administrator session still works, then run
   `confirm-firewall --fresh-key-session` from that session. Only TCP 22, 80 and 443
   are retained; a detected NFS/RPC consumer makes rpcbind shutdown refuse safely.
5. Run `apply-edge` to install the checked-in Nginx headers without an application
   deployment. `nginx -t`, HTTPS page/API probes and header checks must all pass.
Each reducing stage writes a root-owned backup under
`/var/backups/blog-x-hardening` and arms an eight-minute systemd rollback timer.
Failures restore synchronously; an unconfirmed timer restores automatically. Use
`rollback --backup <path>` or `rollback-edge --backup <path>` only with a displayed
hardening backup path. The final host-password rotation is interactive and happens
only after all key-only checks; it is intentionally not accepted as script input.

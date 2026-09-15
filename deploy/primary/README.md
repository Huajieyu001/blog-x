# Blog X primary bundle

This bundle is intentionally inert until an operator, after the production freeze is explicitly lifted, provides `/etc/blog-x/primary.env`, a dedicated SSH key and its pinned `known_hosts` entry. It does not install packages or generate credentials.

Build and save `blog-x-web:<40-char-revision>` away from the 2C2G primary. Run `preflight.sh`, then `deploy.sh <revision> <staged-source-directory> <image-archive>`. The deployer creates a verified backup, loads and health-checks the prebuilt candidate on `127.0.0.1:3101`, switches the loopback-only Web service, validates the real Nginx candidate, and finally reloads Nginx. Any failed cutover restores the original Hexo site and Nginx state from the backup. Browser traffic remains `https://huajieyu001.top`; the container reaches the API only through the host-local SSH forward at `127.0.0.1:3001`.

Use `rollback.sh <release-id>` to return to a retained Blog X release, or `restore-backup.sh <backup-id>` to restore the pre-cutover site. Never put private keys, tokens, passwords, or host values in this directory.

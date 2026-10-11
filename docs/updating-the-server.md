# Pushing changes to the server

The team VM runs the app from a clone of the GitHub repository. Updating the site is:
**commit and push from your laptop, then pull and rebuild on the VM.** Allow 2–3 minutes.

Replace `10` with your team number where it appears.

| | |
|---|---|
| Repository | `https://github.com/EnriqueAleL/VisCon` (branch `main`) |
| VM login | `ssh viscon@10-direct.viscon-hackathon.ch` |
| App folder on the VM | `~/VisCon` |
| Public URL | `https://10.hackathon.ethz.ch` |

## 1. On your laptop: commit and push

```sh
cd ~/Desktop/viscon
git status                      # see what changed
git add -A
git commit -m "Short description of the change"
git push origin main
```

If `git push` is rejected because someone else pushed first, run `git pull --rebase origin main`
and push again.

Before pushing, a quick local check saves a failed deploy:

```sh
npx tsc --noEmit                # type check, should print nothing
```

## 2. On the VM: pull, rebuild, restart

```sh
ssh viscon@10-direct.viscon-hackathon.ch
cd ~/VisCon
git pull --ff-only
docker compose build app
docker compose up -d app
```

Then check that it is healthy:

```sh
docker compose ps                         # STATUS should say "healthy"
curl http://127.0.0.1:8080/api/health     # {"ok":true}
docker compose logs --tail=50 app         # look for errors
```

Open `https://10.hackathon.ethz.ch` and hard-refresh (Ctrl+Shift+R).

Everything in step 2 as one line, from your laptop:

```sh
ssh viscon@10-direct.viscon-hackathon.ch 'cd ~/VisCon && git pull --ff-only && docker compose build app && docker compose up -d app'
```

## Changing settings only (no code change)

Environment variables live in `~/VisCon/.env` on the VM. They are **not** in Git.
Edit the file, then restart without a rebuild:

```sh
nano ~/VisCon/.env
docker compose up -d app
```

## Renaming the product

Edit `shared/brand.json`, push, and run step 2.

## Things to avoid

- **Never run `docker compose down -v`.** It deletes the database volume, which holds every
  account, rating and progress record. `docker compose down` and `up -d` are safe.
- **Do not commit `.env`** or any key. It is gitignored; keep it that way.
- **Avoid updating during a live match.** The restart ends open Arena rooms and active puzzles.
- **Do not edit files on the VM** directly. The next `git pull` would clash; change code on your
  laptop and push.

## Backup before a risky change

```sh
mkdir -p ~/mania-backups && cd ~/VisCon
docker compose stop app
docker compose run --rm --no-deps -T --entrypoint tar app -czf - -C /app/.data . > ~/mania-backups/mania-data.tar.gz
docker compose up -d app
```

## Rolling back

```sh
cd ~/VisCon
git log --oneline | head           # find the last good commit
git checkout <commit> -- .         # restore those files
docker compose build app && docker compose up -d app
```
Then fix forward on your laptop and push, so the VM and `main` agree again.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `git pull` says "not possible to fast-forward" | Someone changed the VM clone. `git status`; discard with `git checkout -- <file>` if it is not needed. |
| `git lfs not found` warning on pull | Harmless. LFS is in `~/bin`; the videos are already downloaded. |
| Container keeps restarting | `docker compose logs --tail=50 app`, fix the error, rebuild. |
| Port 8080 already in use | Another container holds it: `docker ps`, then `docker stop <name>`. |
| Browser shows the old page | Hard-refresh; pages are served with `no-store`, so it is almost always a stale tab. |

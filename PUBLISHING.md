# Publishing MMM-SLDepartures

How to release this module so other MagicMirror² users can find and install it.

Written for someone who has never published an MM² module before. Steps 1–3 are the minimum to
make it installable; steps 4–5 are what actually get it *discovered*.

Before you start, decide the GitHub account or organisation that will own it, and replace every
`REPLACE_ME` in `package.json` and `README.md` with that account name.

---

## 1. Create the GitHub repository

Create an **empty, public** repo named `MMM-SLDepartures` — no README, no `.gitignore`, no licence,
since this project already has all three. GitHub will show you a "push an existing repository" hint;
what follows is that, in order.

Point the local repo at it (substitute your account name):

```bash
git remote add origin https://github.com/knutsoza/MMM-SLDepartures.git
```

Confirm the remote is right before pushing:

```bash
git remote -v
```

Push, and set `main` to track:

```bash
git push -u origin main
```

## 2. Add the discovery topics

GitHub topics are how most people stumble across MM² modules. On the repo page, click the gear icon
next to **About**, then add these to the *Topics* field:

```
magicmirror magicmirror-module magicmirror2 sl stockholm public-transport
```

`magicmirror` is the important one — it is the tag the community browses.

While you are there, set the **Description** to something searchable:

> Realtime SL (Stockholm) departures for MagicMirror² — keyless, no API key required

## 3. Tag a release

Tag the version so users can pin it and so the changelog has a starting point:

```bash
git tag -a v1.0.0 -m "First release"
```

```bash
git push origin v1.0.0
```

Then on GitHub: **Releases → Draft a new release**, choose the `v1.0.0` tag, title it `v1.0.0`, and
paste a short summary of what the module does. Publish it.

## 4. Add it to the official third-party modules list

MagicMirror² keeps a curated list of third-party modules in its wiki repository. Getting on that
list is the single highest-value step for adoption.

Fork and clone the list repository:

```bash
git clone https://github.com/knutsoza/MagicMirror-Documentation.git
```

The modules list lives in `modules/index.md` (occasionally renamed — look for the file containing
the alphabetical module table). Add one row, keeping the table's existing alphabetical order and
column format:

```markdown
| [MMM-SLDepartures](https://github.com/knutsoza/MMM-SLDepartures) | Realtime SL (Stockholm) public transport departures. Keyless — no API key needed. |
```

Commit on a branch:

```bash
git checkout -b add-mmm-sldepartures
```

```bash
git commit -am "Add MMM-SLDepartures to the module list"
```

```bash
git push -u origin add-mmm-sldepartures
```

Then open a pull request against `MagicMirrorOrg/MagicMirror-Documentation`. In the PR description,
say what the module does in one line and link the repo. Keep the diff to that single row — PRs that
touch unrelated lines take much longer to get merged.

> If the file layout has changed since this was written, open the repo's `README.md` first; it
> explains where the current module list lives. Do not guess.

## 5. Announce it on the forum

The MagicMirror community forum is where module authors get their first users and bug reports.

1. Register at <https://forum.magicmirror.builders>.
2. Post in **Development → Custom Modules**.
3. Title it `MMM-SLDepartures — realtime SL (Stockholm) departures, no API key`.
4. In the body: one paragraph on what it does, the screenshot from the README, a minimal config
   example, and the repo link.

Worth calling out explicitly in the post, because it is the reason this module exists: the older
`MMM-SL` modules target SL's retired key-based API, while this one uses the current keyless
`transport.integration.sl.se`. That is what most searchers are actually looking for.

## 6. After release

- Watch the repo's **Issues** — the most likely first report is someone at a different station
  whose `direction_code` is the other way round. The README's *Finding your direction code* section
  is the answer; if people keep hitting it, make it more prominent rather than answering repeatedly.
- If the SL API changes shape, `tests/fixture-tcentralen.json` is a captured real response — refresh it
  and the tests will tell you what broke.
- Keep `npm test` and `npm run lint` green before tagging anything new.

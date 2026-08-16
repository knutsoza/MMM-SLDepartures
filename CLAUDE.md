# Working notes for Claude

`README.md` is the user-facing documentation. This is the stuff that is easy to
get wrong when changing the code.

## This repo is canonical, and it is vendored elsewhere

This is the published module: <https://github.com/knutsoza/MMM-SLDepartures>.

A **copy** lives inside the author's private `magicmirror` monorepo, which is
what actually runs on a wall display. Land changes here first, then sync the copy
down — they have drifted into three different states once already. The monorepo's
`CLAUDE.md` has the sync recipe.

## Test and lint

```bash
npm test      # node --test  — 15 tests, no network
npm run lint
```

**Use the npm scripts, not `node --test` directly.** The exact invocation matters
and took three attempts to get right across the supported range:

| Form | Result |
|---|---|
| `node --test "tests/**/*.test.js"` | glob support is Node 22+; Node 20 says "Could not find" |
| `node --test tests/` | Node 24 resolves the path as a module: `MODULE_NOT_FOUND` |
| `node --test` | auto-discovers from cwd; works on 18 through 24 ✅ |

CI runs the matrix on Node 20 and 24 — 20 because `package.json` declares
`engines: >=20`, and a floor you do not test is a guess. That matrix caught the
`--run` and glob problems immediately; do not narrow it for convenience.

## Tests assert against a real captured response

`tests/fixture-tcentralen.json` is an unedited `/v1/sites/9001/departures`
payload. T-Centralen was chosen because one response contains every awkward case
at once: commuter trains both directions, plus buses **and** five metro lines
sharing `direction_code: 2` with them.

**Write tests against behaviour, not against whatever that capture happens to
contain.** Three tests here were previously passing by luck, and only revealed it
when the fixture was recaptured:

- One cancelled `departures[0]` regardless of what that entry was. In the new
  capture it is a bus the mode filter already drops, so the assertion compared
  two identical lists.
- The same test then still failed once fixed, because `maxDepartures: 6` capped a
  7-item result — removing one still returned six. It now lifts the cap.
- The deviation-threshold test searched the capture for a low-importance notice.
  That only ever worked because a station had a broken lift the day the original
  fixture was taken; every deviation in the current one is level 7. The threshold
  boundary is now asserted with explicit inputs, and the fixture only covers the
  realistic end.

If you recapture the fixture, expect the shape assertions (`length`, specific bus
line numbers) to need updating — that test exists to tell you the payload moved.

## API behaviour worth knowing

- **A site is a place, not a platform.** One id covers rail, metro and the bus
  stands outside, and `direction_code` is per *line*, so filtering on direction
  alone mixes modes. `transportModes` is what makes the filter correct — there is
  a regression test named for it.
- **SL limits departures per transport mode, and the limit scales with the
  stop.** T-Centralen returns 16–18 trains; a quiet suburban stop returns 6 no
  matter how wide the `forecast` window. So `maxDepartures` is an upper bound,
  and a short list is usually the API rather than a config error.
- Those departures cover both directions, so a one-direction filter roughly
  halves what you see.

## Conventions

- No runtime dependencies, and keep it that way — it installs by `git clone` into
  a MagicMirror modules directory with no build step.
- Fetching stays in `node_helper.js`: the API sends no CORS headers, and one
  server-side request serves every attached browser.
- Failure renders a single `—`, never a stack trace and never a stale list that
  looks current. The second is worse, because someone acts on it.
- `.gitattributes` pins LF. This module runs on Linux; a Windows contributor must
  not be able to push CRLF into it.

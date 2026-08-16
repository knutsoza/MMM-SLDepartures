# MMM-SLDepartures

A [MagicMirror²](https://magicmirror.builders) module showing **realtime departures for Stockholm public transport (SL)** — commuter trains, metro, buses, trams and ferries.

- **No API key and no account.** Uses the current, keyless [SL Transport API](https://www.trafiklab.se/api/trafiklab-apis/sl/transport/).
- **Absolute clock times** (`16:49`), not countdowns — so you are not doing mental arithmetic from across the room.
- Realtime: uses SL's `expected` time when available, falling back to the timetable.
- Filters by direction, transport mode and line.
- Flags delays and cancellations, and hides routine station noise.

> **Why another SL module?** The popular ones (`MMM-SL`, `MMM-SL-PublicTransport`) target SL's
> *"Realtidsinformation 4"* API, which required a Trafiklab key and has since been **retired**.
> This module targets the replacement `transport.integration.sl.se` API, which needs no key at all.

## Screenshot

```
43  Uppsala C       16:49
41  Märsta          17:04
40  Kungsängen   !  17:19
43  Uppsala C       17:34
```

Line, destination, and the departure time. `!` marks a disruption — hover for the message.
A delayed time is highlighted; a cancelled one is struck through.

## Install

Clone into your MagicMirror `modules` directory:

```bash
cd ~/MagicMirror/modules
```

```bash
git clone https://github.com/knutsoza/MMM-SLDepartures.git
```

Then restart MagicMirror (`pm2 restart magicmirror`, or however you run it).

**There are no runtime dependencies** — no `npm install` step. The `devDependencies` in
`package.json` are only for running the tests and linter.

To update later:

```bash
cd ~/MagicMirror/modules/MMM-SLDepartures && git pull
```

## Configuration

Add to the `modules` array in `config/config.js`:

```js
{
  module: "MMM-SLDepartures",
  position: "bottom_right",
  config: {
    siteId: 9001,              // T-Centralen
    directionCode: 2,          // check yours — see below
    transportModes: ["TRAIN"],
    maxDepartures: 6
  }
}
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `siteId` | number | `9001` | Which stop to show. See *Finding your site id*. |
| `directionCode` | number \| null | `2` | `1` or `2`. See *Finding your direction code* — **this is the option people get wrong**. `null` shows both directions. |
| `transportModes` | string[] | `["TRAIN"]` | Keep only these modes: `TRAIN`, `METRO`, `BUS`, `TRAM`, `SHIP`. Empty array = all modes. **Read the warning below before emptying it.** |
| `lines` | string[] | `[]` | Keep only these line designations, e.g. `["43"]`. Empty = all lines matching the modes above. Useful when one platform serves several lines and you only ever catch one. |
| `maxDepartures` | number | `6` | How many rows to render. An **upper bound, not a promise** — you get whatever the API returns, capped at this. See *Why you may get fewer rows than you asked for*. |
| `forecast` | number \| null | `null` | Minutes to look ahead. `null` uses SL's own default (60). Raising it does **not** reliably yield more departures — see below. |
| `updateInterval` | number | `60000` | Poll interval in ms. Please do not go below ~30 s; this is a free, unauthenticated API used by everyone. |
| `showDeviations` | boolean | `true` | Show a `!` marker for disruptions, with the message on hover. |
| `minDeviationImportance` | number | `3` | Minimum SL `importance_level` to report. SL tags permanent notices (broken lifts, escalators) low, and the default keeps them off the wall. Lower it to see everything. |
| `showCancelled` | boolean | `true` | Show cancelled departures struck through. Usually what you want — a train silently vanishing looks identical to one that has already left. `false` hides them. |
| `showLineNumber` | boolean | `true` | Show the line designation column, e.g. `43`. |
| `showDestination` | boolean | `true` | Show the destination column, e.g. `Uppsala C`. |
| `header` | string | `""` | Module header text. Empty = no header. |

### Why you may get fewer rows than you asked for

`maxDepartures: 6` can still show three, and that is usually the API rather than your config.

SL limits how many departures it returns **per transport mode**, and the limit is per site — busy
hubs return far more than quiet ones. Measured 2026-08-16:

| Site | Request | Total | of which `TRAIN` | Span |
|---|---|---|---|---|
| T-Centralen (9001) | `forecast=60` | 68 | 16 | 14:08 – 15:09 |
| T-Centralen (9001) | `forecast=240` | 72 | **18** | 14:07 – 15:36 |
| A quiet suburban stop | `forecast=60` | 18 | 6 | 12:41 – 13:34 |
| A quiet suburban stop | `forecast=240` | 24 | **6** | 12:41 – 14:04 |

At the busy hub a wider window bought two more trains. At the quiet stop it bought **none** — the
window genuinely widened and six more departures appeared, but every one was a bus, while `TRAIN`
stayed pinned at 6. Those six then split across both directions, so a single-direction filter left
about three.

So: raising `forecast` is worth a try, but do not expect it to rescue a short list at a quiet stop.
And remember the split — a site's departures cover **both directions**, so a one-direction filter
roughly halves whatever you see.

## Finding your site id

Fetch the site list once and search it:

```bash
curl -s "https://transport.integration.sl.se/v1/sites?expand=false" | grep -i "your stop name"
```

A few for reference, verified against the API on 2026-08-16:

| Site | id |
|---|---|
| T-Centralen | `9001` |
| Stockholm City | `1080` |
| Odenplan | `9117` |
| Södertälje centrum | `9527` |
| Slussen | `9192` **and** `9208` |

Slussen is the cautionary one: a single place can expose **more than one site id**, covering
different parts of the interchange. Look yours up rather than assuming, and if departures look
oddly incomplete, check whether your stop has a second id.

## Finding your direction code

**`direction_code` is per line, not per compass direction.** It is always `1` or `2`, and which one
means "toward town" differs from station to station. Do not copy someone else's value — check yours:

```bash
curl -s "https://transport.integration.sl.se/v1/sites/9001/departures" | grep -oE '"direction":"[^"]*"' | sort -u
```

Then match the `direction` / `destination` names against the code:

```bash
curl -s "https://transport.integration.sl.se/v1/sites/9001/departures" \
  | python3 -c "import json,sys; [print(d['direction_code'], d['line']['transport_mode'], d['line']['designation'], '->', d['destination']) for d in json.load(sys.stdin)['departures']]" | sort -u
```

For T-Centralen, the commuter-train rows come out as:

| `direction_code` | Mode | Lines | Goes to | Meaning |
|---|---|---|---|---|
| `2` | TRAIN | 40, 41, 43 | Uppsala C, Märsta, Kungsängen | northbound / westbound |
| `1` | TRAIN | 40, 41, 43 | Nynäshamn, Södertälje centrum, Västerhaninge | southbound |

Note the same line numbers appear under both codes — which is the point. The code is a property of
the line's *route*, not of the station, so there is no shortcut: run the command for your own stop.

### ⚠️ Always set `transportModes` as well

An SL **site is a place, not a platform.** One site id covers every stop at that location — the
railway platforms, the metro, and the bus stands outside. Because `direction_code` is assigned per
line, the same code means different things for different lines at the same site.

T-Centralen, from the same captured response:

| `direction_code` | Mode | Lines | Goes to |
|---|---|---|---|
| `2` | TRAIN | 40, 41, 43 | Uppsala C / Märsta / Kungsängen — *what you asked for* ✅ |
| `2` | **BUS** | 65, 69 | Centralen, Hornsberg — *a city bus, not your train* ❌ |
| `2` | **METRO** | 13, 14, 17, 18, 19 | Skarpnäck, Fruängen, Hagsätra — *also not your train* ❌ |

So filtering on `directionCode: 2` alone quietly mixes buses and metro trains into what you thought
was a commuter-rail list. Constraining `transportModes` is what makes the filter correct.

This is covered by a regression test (`dropping the transportModes filter is what lets buses in`),
which asserts against the real captured response in `tests/` — so if SL ever changes the shape of
this data, the test says so rather than the wall quietly filling with the wrong vehicles.

## Behaviour on failure

A wall display should never show a stack trace or, worse, a stale list that looks current. On a
network error, timeout or non-200 response the module renders a single **`—`** and logs the reason.
The next poll recovers automatically. All fetching happens in `node_helper.js` server-side, both
because the API sends no CORS headers and so that one request serves every attached browser.

## Development

```bash
node --run test
```

```bash
node --run lint
```

Tests run against a real captured API response (`tests/fixture-tcentralen.json`) and need no network.

## Licence

MIT — see [LICENSE](LICENSE).

Not affiliated with or endorsed by Storstockholms Lokaltrafik (SL) or Trafiklab.

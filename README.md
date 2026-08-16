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
43  Bålsta          16:49
43  Kungsängen      17:04
43  Bålsta       !  17:19
43  Kungsängen      17:34
```

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
    siteId: 9731,              // Skogås
    directionCode: 2,          // northbound (toward Stockholm City)
    transportModes: ["TRAIN"],
    maxDepartures: 6
  }
}
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `siteId` | number | `9731` | Which stop to show. See *Finding your site id*. |
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
| `showDestination` | boolean | `true` | Show the destination column, e.g. `Bålsta`. |
| `header` | string | `""` | Module header text. Empty = no header. |

### Why you may get fewer rows than you asked for

`maxDepartures: 6` can still show three. SL caps how many departures it returns **per transport
mode**, and widening the time window does not lift that cap. Measured at Skogås on 2026-08-16:

| Request | Total returned | of which `TRAIN` | Time span |
|---|---|---|---|
| `forecast=60` | 18 | **6** | 12:41 – 13:34 |
| `forecast=240` | 24 | **6** | 12:41 – 14:04 |

The window genuinely widened and six more departures appeared — but every one was a bus. `TRAIN`
stayed pinned at 6, and those six split across both directions, so a single-direction filter left
about three.

So `forecast` is worth trying at a quiet stop where 60 minutes genuinely holds too few services, but
it will not defeat the per-mode cap. If your list looks short, that is usually the API, not your
config.

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
| Skogås | `9731` |
| Slussen | `9192` **and** `9208` |

Slussen is the cautionary one: a single place can expose **more than one site id**, covering
different parts of the interchange. Look yours up rather than assuming, and if departures look
oddly incomplete, check whether your stop has a second id.

## Finding your direction code

**`direction_code` is per line, not per compass direction.** It is always `1` or `2`, and which one
means "toward town" differs from station to station. Do not copy someone else's value — check yours:

```bash
curl -s "https://transport.integration.sl.se/v1/sites/9731/departures" | grep -oE '"direction":"[^"]*"' | sort -u
```

Then match the `direction` / `destination` names against the code:

```bash
curl -s "https://transport.integration.sl.se/v1/sites/9731/departures" \
  | python3 -c "import json,sys; [print(d['direction_code'], d['line']['transport_mode'], d['line']['designation'], '->', d['destination']) for d in json.load(sys.stdin)['departures']]" | sort -u
```

For Skogås this gives:

| `direction_code` | Mode | Line | Goes to | Meaning |
|---|---|---|---|---|
| `2` | TRAIN | 43 | Bålsta, Kungsängen | **northbound**, via Stockholm City |
| `1` | TRAIN | 43 | Nynäshamn, Västerhaninge | southbound |

### ⚠️ Always set `transportModes` as well

An SL **site is a place, not a platform**. Site `9731` covers the Skogås commuter-rail station *and*
the surrounding bus stops. Because `direction_code` is per line, the same code means different things
for different lines at the same site. At Skogås:

| `direction_code` | Mode | Lines | Goes to |
|---|---|---|---|
| `2` | TRAIN | 43 | Bålsta / Kungsängen — *toward town* ✅ |
| `2` | **BUS** | 742, 830, 831 | Huddinge sjukhus, Farsta centrum — *away from town* ❌ |

So filtering on `directionCode: 2` alone silently mixes buses heading the wrong way into your
"northbound trains" list. Constraining `transportModes` is what makes the filter correct. This is
covered by a regression test (`dropping the transportModes filter is what lets buses in`).

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

Tests run against a real captured API response (`tests/fixture-skogas.json`) and need no network.

## Licence

MIT — see [LICENSE](LICENSE).

Not affiliated with or endorsed by Storstockholms Lokaltrafik (SL) or Trafiklab.

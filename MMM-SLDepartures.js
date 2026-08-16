/* MMM-SLDepartures — realtime Stockholm public transport departures.
 *
 * Uses the keyless SL Transport API (transport.integration.sl.se). The older,
 * key-based "SL Realtidsinformation 4" API that most SL modules target has been
 * retired, so no API key or account is needed here.
 */

Module.register("MMM-SLDepartures", {
	defaults: {
		/* Site (station/stop-area) id. Look yours up once via:
		 *   https://transport.integration.sl.se/v1/sites?expand=false
		 * 9731 = Skogås. */
		siteId: 9731,

		/* Which way to travel. direction_code is per line and is only ever 1 or
		 * 2; which one is "toward town" differs by station, so verify yours (see
		 * README). At Skogås, 2 = northbound toward Bålsta via Stockholm City.
		 * Set null to show both directions. */
		directionCode: 2,

		/* Restrict to these transport modes. Keep this set — a site covers every
		 * stop at the location, so a bare directionCode filter also matches buses
		 * heading the other way. Modes: TRAIN, METRO, BUS, TRAM, SHIP. */
		transportModes: ["TRAIN"],

		/* Optionally restrict to specific line designations, e.g. ["43"].
		 * Empty = every line matching the modes above. */
		lines: [],

		/* How many rows to render. An UPPER BOUND, not a promise: you get
		 * whatever the API returns, capped at this. See the note on `forecast`
		 * for why asking for more does not always produce more. */
		maxDepartures: 6,

		/* Minutes to look ahead. null = let the API use its own default (60).
		 *
		 * Raising this does NOT reliably yield more departures, because SL also
		 * caps how many it will return per mode. Measured at Skogås (site 9731)
		 * on 2026-08-16:
		 *
		 *   forecast=60   total=18  TRAIN=6  span 12:41..13:34
		 *   forecast=240  total=24  TRAIN=6  span 12:41..14:04
		 *
		 * The window genuinely widened, but the six extra rows were all buses —
		 * TRAIN stayed pinned at 6, and those six split across both directions,
		 * so a single-direction filter left about three. Worth trying at a quiet
		 * stop; do not expect it to defeat the per-mode cap. */
		forecast: null,

		/* Poll interval in ms. 60s is ample for a wall display. This is a free,
		 * unauthenticated API — please do not go below ~30s. */
		updateInterval: 60 * 1000,

		/* Show a "!" marker against disrupted departures, message on hover. */
		showDeviations: true,

		/* Minimum SL importance_level to surface. SL tags permanent notices
		 * (broken lifts, escalators) at low importance; the default keeps those
		 * off a wall display. Lower it to see everything. */
		minDeviationImportance: 3,

		/* Keep cancelled departures visible, struck through. Usually what you
		 * want: a train vanishing from the list is indistinguishable from it
		 * having already left. false removes them entirely. */
		showCancelled: true,

		showLineNumber: true,  // the line designation column, e.g. "43"
		showDestination: true, // the destination column, e.g. "Bålsta"

		header: "" // module header text; empty = no header
	},

	getStyles () {
		return ["MMM-SLDepartures.css"];
	},

	getHeader () {
		return this.config.header;
	},

	start () {
		this.departures = null; // null = still loading, [] = loaded but empty
		this.error = null;
		this.sendSocketNotification("SLDEP_CONFIG", {
			identifier: this.identifier,
			config: this.config
		});
	},

	socketNotificationReceived (notification, payload) {
		// One node_helper serves every instance, so ignore other instances' data.
		if (payload?.identifier !== this.identifier) return;

		if (notification === "SLDEP_DATA") {
			this.departures = payload.departures;
			this.error = null;
			this.updateDom(300);
		} else if (notification === "SLDEP_ERROR") {
			this.error = payload.error;
			Log.error(`[MMM-SLDepartures] ${payload.error}`);
			this.updateDom(300);
		}
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = "SLDEP";

		if (this.error) {
			// Show a dash rather than a stack trace or a stale list.
			wrapper.classList.add("SLDEP-error");
			wrapper.textContent = "—";
			return wrapper;
		}

		if (this.departures === null) {
			wrapper.classList.add("SLDEP-loading");
			wrapper.textContent = "…";
			return wrapper;
		}

		if (this.departures.length === 0) {
			wrapper.classList.add("SLDEP-empty");
			wrapper.textContent = "—";
			return wrapper;
		}

		const table = document.createElement("table");
		table.className = "SLDEP-table";

		for (const d of this.departures) {
			const row = document.createElement("tr");
			row.className = "SLDEP-row";
			if (d.cancelled) row.classList.add("SLDEP-cancelled");

			if (this.config.showLineNumber) {
				const line = document.createElement("td");
				line.className = "SLDEP-line";
				line.textContent = d.line;
				row.appendChild(line);
			}

			if (this.config.showDestination) {
				const dest = document.createElement("td");
				dest.className = "SLDEP-destination";
				dest.textContent = d.destination;
				if (d.deviations.length > 0) {
					// Keep disruption minimal: a marker, with detail on hover.
					const flag = document.createElement("span");
					flag.className = "SLDEP-deviation";
					flag.textContent = " !";
					flag.title = d.deviations.join("\n");
					dest.appendChild(flag);
				}
				row.appendChild(dest);
			}

			const time = document.createElement("td");
			time.className = "SLDEP-time";
			if (d.delayed) time.classList.add("SLDEP-delayed");
			time.textContent = d.cancelled ? "—" : d.time;
			row.appendChild(time);

			table.appendChild(row);
		}

		wrapper.appendChild(table);
		return wrapper;
	}
});

/* MMM-SLDepartures — server side.
 *
 * The fetch lives here rather than in the browser for two reasons: the SL
 * Transport API sends no CORS headers, and doing it once on the server means
 * one request per interval no matter how many clients are attached.
 */

const NodeHelper = require("node_helper");
const Log = require("logger");
const { filterDepartures, formatTime, isDelayed, isCancelled, deviationMessages } = require("./lib/departures");

const API_BASE = "https://transport.integration.sl.se/v1";

module.exports = NodeHelper.create({
	start () {
		this.timers = {};
	},

	socketNotificationReceived (notification, payload) {
		if (notification === "SLDEP_CONFIG") {
			const id = payload.identifier;
			// Re-registering (e.g. after a browser reload) must not stack timers.
			if (this.timers[id]) clearInterval(this.timers[id]);
			this.fetchDepartures(payload);
			this.timers[id] = setInterval(() => this.fetchDepartures(payload), payload.config.updateInterval);
		}
	},

	async fetchDepartures (payload) {
		const { identifier, config } = payload;
		/* forecast = how many minutes ahead SL should look. The API defaults to 60,
		 * which off-peak returns fewer departures than maxDepartures asks for, so
		 * the list renders short. Omit the parameter when unset to preserve the
		 * previous behaviour exactly. */
		const forecast = Number(config.forecast);
		const query = Number.isFinite(forecast) && forecast > 0 ? `?forecast=${forecast}` : "";
		const url = `${API_BASE}/sites/${config.siteId}/departures${query}`;

		try {
			// Bound the wait so a hanging request cannot stall the refresh cycle.
			const ac = new AbortController();
			const timeout = setTimeout(() => ac.abort(), 15000);
			let res;
			try {
				res = await fetch(url, { signal: ac.signal, headers: { Accept: "application/json" } });
			} finally {
				clearTimeout(timeout);
			}

			if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

			const body = await res.json();
			const departures = filterDepartures(body, config).map((d) => ({
				time: formatTime(d),
				line: d.line?.designation ?? "",
				destination: d.destination ?? "",
				delayed: isDelayed(d),
				cancelled: isCancelled(d),
				scheduled: formatTime({ expected: null, scheduled: d.scheduled }),
				deviations: config.showDeviations ? deviationMessages(d, config.minDeviationImportance) : []
			}));

			this.sendSocketNotification("SLDEP_DATA", { identifier, departures });
		} catch (error) {
			// Never throw: a wall display must degrade to a dash, not crash or
			// leave the last-known list up indefinitely pretending it is current.
			Log.error(`[MMM-SLDepartures] fetch failed for site ${config.siteId}: ${error.message}`);
			this.sendSocketNotification("SLDEP_ERROR", { identifier, error: error.message });
		}
	},

	stop () {
		for (const t of Object.values(this.timers)) clearInterval(t);
		this.timers = {};
	}
});

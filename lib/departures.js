/* Pure helpers for MMM-SLDepartures.
 *
 * Kept free of MagicMirror and network code so they can be unit tested against
 * a captured API response.
 */

/**
 * Select the departures we actually want to show.
 *
 * Filtering on directionCode alone is NOT enough, and this is the main gotcha
 * of the SL Transport API. A "site" is a place, not a platform: one id covers
 * every stop at that location — railway platforms, metro, and the bus stands
 * outside. direction_code is only meaningful *per line*, so the same code means
 * different things for different lines at the same site.
 *
 * At T-Centralen (9001), direction_code 2 covers the commuter trains toward
 * Uppsala C / Märsta / Kungsängen, but ALSO city buses 65 and 69 and five metro
 * lines heading for Skarpnäck, Fruängen and Hagsätra. Filter on direction alone
 * and all of them land in what you thought was a commuter-rail list.
 *
 * So always constrain transport_mode as well.
 *
 * @param {object} payload parsed JSON body from /v1/sites/{id}/departures
 * @param {object} config module config (directionCode, transportModes, maxDepartures)
 * @returns {object[]} departures to render, soonest first
 */
function filterDepartures (payload, config) {
	const all = Array.isArray(payload?.departures) ? payload.departures : [];
	const modes = (config.transportModes || []).map((m) => String(m).toUpperCase());

	return all
		.filter((d) => {
			if (config.directionCode !== null && config.directionCode !== undefined) {
				if (d.direction_code !== config.directionCode) return false;
			}
			if (modes.length > 0) {
				const mode = String(d.line?.transport_mode || "").toUpperCase();
				if (!modes.includes(mode)) return false;
			}
			if (config.lines && config.lines.length > 0) {
				if (!config.lines.map(String).includes(String(d.line?.designation))) return false;
			}
			if (!config.showCancelled && isCancelled(d)) return false;
			return true;
		})
		.sort((a, b) => departureDate(a) - departureDate(b))
		.slice(0, config.maxDepartures);
}

/**
 * Realtime timestamp for a departure: `expected` when the API supplies it,
 * otherwise the timetable's `scheduled`.
 *
 * @param {object} d a departure
 * @returns {Date} the effective departure time
 */
function departureDate (d) {
	return new Date(d.expected || d.scheduled);
}

/**
 * Absolute clock time, e.g. "16:49".
 *
 * Deliberately absolute rather than relative ("in 4 min"): the operator applies
 * their own walking time, and a wall display should not force that arithmetic.
 *
 * The API returns local Stockholm wall-clock strings without a timezone offset
 * (e.g. "2026-07-26T16:49:00"). Those are read verbatim rather than passed
 * through toLocaleTimeString, which would reinterpret them in the host's zone
 * and shift every time if the Pi's clock is not set to Europe/Stockholm.
 *
 * @param {object} d a departure
 * @returns {string} "HH:MM", or "—" if unparseable
 */
function formatTime (d) {
	const raw = d.expected || d.scheduled;
	if (typeof raw !== "string") return "—";
	const m = raw.match(/T(\d{2}):(\d{2})/);
	return m ? `${m[1]}:${m[2]}` : "—";
}

/**
 * True when the departure is delayed relative to timetable by at least
 * `thresholdSeconds`.
 *
 * @param {object} d a departure
 * @param {number} thresholdSeconds minimum delay to report
 * @returns {boolean} whether it counts as delayed
 */
function isDelayed (d, thresholdSeconds = 60) {
	if (!d.expected || !d.scheduled) return false;
	const delta = (new Date(d.expected) - new Date(d.scheduled)) / 1000;
	return delta >= thresholdSeconds;
}

/**
 * True when SL flags the departure as cancelled.
 *
 * @param {object} d a departure
 * @returns {boolean} whether it is cancelled
 */
function isCancelled (d) {
	const state = String(d.state || "").toUpperCase();
	return state === "CANCELLED" || state === "NOTCALLED";
}

/**
 * Deviation notes worth showing, most important first.
 *
 * SL mixes genuine service disruption in with station trivia (broken lifts,
 * escalator works). Anything at or above `minImportance` is kept, so the
 * default of 3 hides the standing lift and escalator notices most stations
 * carry while still surfacing real disruption.
 *
 * @param {object} d a departure
 * @param {number} minImportance minimum importance_level to keep
 * @returns {string[]} deviation messages
 */
function deviationMessages (d, minImportance = 3) {
	return (d.deviations || [])
		.filter((v) => (v.importance_level ?? 0) >= minImportance)
		.sort((a, b) => (b.importance_level ?? 0) - (a.importance_level ?? 0))
		.map((v) => v.message)
		.filter(Boolean);
}

module.exports = { filterDepartures, departureDate, formatTime, isDelayed, isCancelled, deviationMessages };

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { filterDepartures, formatTime, isDelayed, isCancelled, deviationMessages } = require("../lib/departures");

/* A real, unedited /v1/sites/9001/departures response (T-Centralen) captured
 * from the live API.
 *
 * T-Centralen is used because it contains, in one payload, every case that
 * makes this filter tricky: commuter trains in both directions, metro and tram,
 * and — the important one — buses sharing direction_code 2 with the trains
 * while going somewhere entirely different. Filtering on direction alone is
 * therefore demonstrably insufficient, and the tests below prove it against
 * real data rather than a contrived object. */
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixture-tcentralen.json"), "utf8"));

const config = {
	directionCode: 2,
	transportModes: ["TRAIN"],
	lines: [],
	maxDepartures: 6,
	showCancelled: true
};

test("fixture has the mix we rely on", () => {
	assert.equal(fixture.departures.length, 67);
	const has = (fn) => fixture.departures.some(fn);
	assert.ok(has((d) => d.direction_code === 2 && d.line.transport_mode === "TRAIN"), "northbound trains");
	assert.ok(has((d) => d.direction_code === 2 && d.line.transport_mode === "BUS"), "dir-2 buses");
	assert.ok(has((d) => d.direction_code === 1 && d.line.transport_mode === "TRAIN"), "southbound trains");
});

test("keeps only northbound trains", () => {
	const out = filterDepartures(fixture, config);
	assert.ok(out.length > 0, "expected at least one departure");
	for (const d of out) {
		assert.equal(d.direction_code, 2);
		assert.equal(d.line.transport_mode, "TRAIN");
	}
});

test("excludes buses whose direction_code is also 2 — the main gotcha", () => {
	const out = filterDepartures(fixture, config);
	const busLines = out.filter((d) => d.line.transport_mode === "BUS").map((d) => d.line.designation);
	assert.deepEqual(busLines, [], "no buses may appear");
	// Named explicitly: these are the bus lines at T-Centralen that carry
	// direction_code 2 alongside the trains, and would leak through a
	// directionCode-only filter.
	for (const bad of ["69", "65"]) {
		assert.ok(!out.some((d) => d.line.designation === bad), `line ${bad} must not appear`);
	}
});

test("excludes southbound trains", () => {
	const out = filterDepartures(fixture, config);
	assert.ok(!out.some((d) => d.destination === "Nynäshamn"));
	assert.ok(!out.some((d) => d.destination === "Västerhaninge"));
});

test("dropping the transportModes filter is what lets buses in", () => {
	// Guards the README's claim that constraining direction alone is insufficient.
	const loose = filterDepartures(fixture, { ...config, transportModes: [] });
	assert.ok(loose.some((d) => d.line.transport_mode === "BUS"), "buses should leak without the mode filter");
});

test("sorts soonest first and respects maxDepartures", () => {
	const out = filterDepartures(fixture, { ...config, maxDepartures: 2 });
	assert.equal(out.length, 2);
	const times = out.map((d) => new Date(d.expected || d.scheduled).getTime());
	assert.deepEqual(times, [...times].sort((a, b) => a - b));
});

test("lines filter narrows to a single designation", () => {
	const out = filterDepartures(fixture, { ...config, lines: ["43"] });
	assert.ok(out.length > 0);
	assert.ok(out.every((d) => d.line.designation === "43"));
	assert.equal(filterDepartures(fixture, { ...config, lines: ["999"] }).length, 0);
});

test("directionCode null shows both directions", () => {
	const out = filterDepartures(fixture, { ...config, directionCode: null, maxDepartures: 99 });
	assert.ok(out.some((d) => d.direction_code === 1));
	assert.ok(out.some((d) => d.direction_code === 2));
});

test("formatTime reads local wall-clock verbatim, ignoring host timezone", () => {
	assert.equal(formatTime({ expected: "2026-07-26T16:49:00" }), "16:49");
	// expected wins over scheduled — that is what makes it realtime
	assert.equal(formatTime({ scheduled: "2026-07-26T16:49:00", expected: "2026-07-26T16:55:00" }), "16:55");
	assert.equal(formatTime({ scheduled: "2026-07-26T05:03:00" }), "05:03");
});

test("formatTime degrades to a dash rather than throwing", () => {
	assert.equal(formatTime({}), "—");
	assert.equal(formatTime({ expected: null, scheduled: null }), "—");
	assert.equal(formatTime({ expected: "nonsense" }), "—");
});

test("isDelayed compares expected against scheduled", () => {
	assert.equal(isDelayed({ scheduled: "2026-07-26T16:49:00", expected: "2026-07-26T16:49:00" }), false);
	assert.equal(isDelayed({ scheduled: "2026-07-26T16:49:00", expected: "2026-07-26T16:52:00" }), true);
	assert.equal(isDelayed({ scheduled: "2026-07-26T16:49:00" }), false, "no realtime data is not a delay");
});

test("isCancelled recognises SL's states", () => {
	assert.equal(isCancelled({ state: "CANCELLED" }), true);
	assert.equal(isCancelled({ state: "NOTCALLED" }), true);
	assert.equal(isCancelled({ state: "EXPECTED" }), false);
	assert.equal(isCancelled({}), false);
});

test("showCancelled false removes cancelled departures", () => {
	/* Cancel a departure the filter actually KEEPS.
	 *
	 * This previously doctored departures[0] regardless of what it was. That
	 * only worked because the old fixture happened to lead with a matching
	 * train; here entry 0 is a bus the mode filter already drops, so cancelling
	 * it changes nothing and the comparison is vacuous. Find a survivor. */
	const target = fixture.departures.findIndex(
		(d) => d.direction_code === 2 && d.line.transport_mode === "TRAIN"
	);
	assert.ok(target >= 0, "fixture must contain a departure this config keeps");

	const doctored = {
		departures: fixture.departures.map((d, i) => (i === target ? { ...d, state: "CANCELLED" } : d))
	};

	/* Raise maxDepartures above the number of matches (7), or the cap hides the
	 * very difference being measured: drop one from seven and you still get six
	 * rows back, so the lengths match and the test passes for no reason. */
	const uncapped = { ...config, maxDepartures: 99 };
	const kept = filterDepartures(doctored, uncapped);
	const dropped = filterDepartures(doctored, { ...uncapped, showCancelled: false });
	assert.ok(dropped.length < kept.length, "hiding cancelled departures must shorten the list");
});

test("deviations below the importance threshold are hidden", () => {
	/* The threshold boundary is tested with EXPLICIT inputs, not by hunting
	 * through the fixture.
	 *
	 * The original test searched the captured response for a low-importance
	 * notice and asserted it was hidden. That passed only because the station
	 * happened to have a broken lift the day the fixture was taken — every
	 * deviation in the current capture is level 7, so the same search finds
	 * nothing and the test collapses. Whether SL is advertising a broken
	 * escalator today is not a property of this code.
	 *
	 * deviationMessages is pure, so state the cases directly and let the fixture
	 * cover the realistic end. */
	const dev = (level) => ({ deviations: [{ importance_level: level, message: `level ${level}` }] });

	assert.deepEqual(deviationMessages(dev(2), 3), [], "below the threshold is hidden");
	assert.equal(deviationMessages(dev(3), 3).length, 1, "exactly at the threshold is shown");
	assert.equal(deviationMessages(dev(7), 3).length, 1, "above the threshold is shown");
	assert.equal(deviationMessages(dev(2), 1).length, 1, "lowering the threshold reveals it");
	assert.deepEqual(deviationMessages({ deviations: [] }, 3), [], "no deviations yields no messages");
	assert.deepEqual(deviationMessages({}, 3), [], "a missing deviations key must not throw");

	// And the realistic end: a genuine disruption in the live capture survives.
	const levels = (d) => (d.deviations || []).map((v) => v.importance_level ?? 0);
	const notable = fixture.departures.find((d) => levels(d).some((l) => l >= 3));
	assert.ok(notable, "fixture should carry a real disruption");
	assert.ok(deviationMessages(notable, 3).length > 0, "which survives the default threshold");
});

test("malformed payloads yield an empty list instead of throwing", () => {
	for (const bad of [null, undefined, {}, { departures: null }, { departures: "nope" }]) {
		assert.deepEqual(filterDepartures(bad, config), []);
	}
});

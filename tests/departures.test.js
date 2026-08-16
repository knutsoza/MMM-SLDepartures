const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { filterDepartures, formatTime, isDelayed, isCancelled, deviationMessages } = require("../lib/departures");

/* A real, unedited /v1/sites/9731/departures response captured from the live
 * API. It happens to contain exactly the mix that makes the direction filter
 * tricky: northbound trains, southbound trains, and buses whose direction_code
 * is also 2 but which travel away from the city. */
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixture-skogas.json"), "utf8"));

const config = {
	directionCode: 2,
	transportModes: ["TRAIN"],
	lines: [],
	maxDepartures: 6,
	showCancelled: true
};

test("fixture has the mix we rely on", () => {
	assert.equal(fixture.departures.length, 19);
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
	// Named explicitly: these are the lines that would leak through a
	// directionCode-only filter, heading to Farsta/Huddinge, away from town.
	for (const bad of ["742", "830", "831"]) {
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
	const doctored = { departures: fixture.departures.map((d, i) => (i === 0 ? { ...d, state: "CANCELLED" } : d)) };
	const kept = filterDepartures(doctored, config);
	const dropped = filterDepartures(doctored, { ...config, showCancelled: false });
	assert.ok(dropped.length < kept.length);
});

test("deviations below the importance threshold are hidden", () => {
	// The live fixture carries a real level-2 lift notice at Skogås.
	const withDev = fixture.departures.find((d) => (d.deviations || []).length > 0);
	assert.ok(withDev, "fixture should contain a deviation");
	assert.deepEqual(deviationMessages(withDev, 3), [], "level-2 lift notice is routine noise");
	assert.ok(deviationMessages(withDev, 1).length > 0, "but is visible at a lower threshold");
});

test("malformed payloads yield an empty list instead of throwing", () => {
	for (const bad of [null, undefined, {}, { departures: null }, { departures: "nope" }]) {
		assert.deepEqual(filterDepartures(bad, config), []);
	}
});

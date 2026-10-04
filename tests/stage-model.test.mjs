import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lightView, roomLight, roomStatus, formatNumber, serviceForScene, seriesFromHistory, bucketSeries } from '../stage-card/src/stage-model.js';
import { chartGeometry } from '../stage-card/src/stage-chart.js';

const light = (state, brightness) => ({ entity_id: 'light.x', state, attributes: { friendly_name: 'X', brightness } });

test('lightView maps brightness 0-255 to percent', () => {
  assert.equal(lightView(light('on', 255)).level, 100);
  assert.equal(lightView(light('on', 69)).level, 27);
  assert.equal(lightView(light('off', null)).level, 0);
  assert.equal(lightView(light('off', null)).lastLevel, 50);
});

test('lightView prefers a pending level over state', () => {
  const v = lightView(light('off', null), 40);
  assert.equal(v.on, true);
  assert.equal(v.level, 40);
});

test('roomLight is dim floor when all off and saturates when bright', () => {
  assert.deepEqual(roomLight([{ level: 0 }, { level: 0 }]), { lux: 0.58, warmth: 0 });
  assert.equal(roomLight([{ level: 100 }]).lux, 1.08);
  assert.equal(roomLight([]).lux, 0.9);
});

test('roomStatus summarises lights, tv and fan', () => {
  const lights = [{ on: true }, { on: false }];
  assert.equal(roomStatus({ lights, tvOn: true }), '1 of 2 lights on · TV playing');
  assert.equal(roomStatus({ lights: [{ on: false }], fan: { on: true, level: 33 } }), 'Lights off · fan 33%');
  assert.equal(roomStatus({ lights: [] }), 'All quiet');
});

test('formatNumber trims and handles unknown', () => {
  assert.equal(formatNumber('92.80'), '92.8');
  assert.equal(formatNumber('8', 2), '8');
  assert.equal(formatNumber('unknown'), '—');
});

test('serviceForScene picks the domain', () => {
  assert.deepEqual(serviceForScene('script.movie_time'), ['script', 'turn_on']);
  assert.deepEqual(serviceForScene('scene.relax'), ['scene', 'turn_on']);
});

test('history becomes 96 buckets carrying the last value forward', () => {
  const now = Date.parse('2026-10-04T12:00:00Z');
  const raw = [{ s: '10', lu: (now - 25 * 3600_000) / 1000 }, { s: '90', lu: (now - 3600_000) / 1000 }, { s: 'unavailable', lu: (now - 1800_000) / 1000 }];
  const series = seriesFromHistory(raw, now);
  assert.equal(series.length, 1);
  const buckets = bucketSeries(series, { now });
  assert.equal(buckets.length, 96);
  assert.equal(buckets.at(-1).v, 90);
  assert.equal(buckets[0].v, null);
});

test('chartGeometry needs two points and rounds the max up', () => {
  assert.equal(chartGeometry([{ t: 1, v: 5 }]), null);
  const g = chartGeometry([{ t: 0, v: 10 }, { t: 1, v: 93 }]);
  assert.equal(g.ticks.at(-1).v, 100);
  assert.ok(g.line.startsWith('M'));
});

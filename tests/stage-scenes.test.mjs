import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastUsedScene } from '../stage-card/src/stage-views.js';

const scenes = [{ entity: 'scene.evening', name: 'Evening' }, { entity: 'scene.night', name: 'Night' }, { entity: 'script.movie_time', name: 'Movie time' }];

test('last used scene compares scene state times and script last_triggered', () => {
  const hass = { states: {
    'scene.evening': { state: '2026-10-04T15:39:08Z', attributes: {} },
    'scene.night': { state: 'unknown', attributes: {} },
    'script.movie_time': { state: 'off', attributes: { last_triggered: '2026-10-04T20:00:00Z' } },
  } };
  assert.equal(lastUsedScene({ hass }, scenes).name, 'Movie time');
});

test('no scene used yet gives null', () => {
  const hass = { states: { 'scene.evening': { state: 'unknown', attributes: {} } } };
  assert.equal(lastUsedScene({ hass }, scenes), null);
});

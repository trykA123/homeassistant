import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lightCapabilities, kelvinToPercent, percentToKelvin, hexToRgb, swatchServiceData, SWATCHES } from '../stage-card/src/stage-model.js';
import { faderCall, colorCalls, selectedLights } from '../stage-card/src/stage-lights.js';

const state = (id, modes, extra = {}) => ({ entity_id: id, state: 'on', attributes: { friendly_name: id, brightness: 128, supported_color_modes: modes, min_color_temp_kelvin: 2500, max_color_temp_kelvin: 6500, ...extra } });
const hass = { states: {
  'light.ceiling': state('light.ceiling', ['color_temp', 'hs']),
  'light.amb': state('light.amb', ['hs']),
  'light.plain': state('light.plain', ['brightness']),
} };
const config = { rooms: [{ id: 'living', name: 'Living', photo: 'x', lights: [{ entity: 'light.ceiling' }, { entity: 'light.amb' }, { entity: 'light.plain' }] }] };

test('capabilities read colour and temperature modes', () => {
  assert.deepEqual(lightCapabilities({ supported_color_modes: ['hs'] }).color, true);
  assert.equal(lightCapabilities({ supported_color_modes: ['hs'] }).temperature, false);
  assert.equal(lightCapabilities({ supported_color_modes: ['onoff'] }).dimmable, false);
});

test('kelvin maps to percent and back on 50 K steps', () => {
  assert.equal(kelvinToPercent(4500, 2500, 6500), 50);
  assert.equal(percentToKelvin(50, 2500, 6500), 4500);
  assert.equal(percentToKelvin(0, 2500, 6500), 2500);
});

test('hexToRgb parses and rejects', () => {
  assert.deepEqual(hexToRgb('#ff9628'), [255, 150, 40]);
  assert.throws(() => hexToRgb('red'), /rrggbb/);
});

test('white swatches clamp to the light range; colour swatches skip white-only lights', () => {
  const caps = { color: false, temperature: true, minKelvin: 2700, maxKelvin: 6500 };
  assert.deepEqual(swatchServiceData(SWATCHES[0], { caps }), { color_temp_kelvin: 2700 });
  assert.equal(swatchServiceData(SWATCHES[5], { caps }), null);
});

test('group fader targets only included lights', () => {
  const excluded = { living: new Set(['light.amb']) };
  assert.deepEqual(selectedLights(config, excluded, 'living'), ['light.ceiling', 'light.plain']);
  const call = faderCall({ config, excluded, hass }, 'group:living', 40);
  assert.deepEqual(call.data, { entity_id: ['light.ceiling', 'light.plain'], brightness_pct: 40 });
});

test('kelvin fader converts percent to kelvin for that light', () => {
  const call = faderCall({ config, excluded: {}, hass }, 'kelvin:light.ceiling', 50);
  assert.equal(call.data.color_temp_kelvin, 4500);
  assert.throws(() => faderCall({ config, excluded: {}, hass }, 'nope:x', 1), /unknown fader/);
});

test('room colour applies to capable selected lights only', () => {
  const calls = colorCalls({ config, excluded: {}, hass }, 'room:living', { hex: '#0000ff' });
  assert.deepEqual(calls.map((c) => c.entity_id), ['light.ceiling', 'light.amb']);
  assert.deepEqual(calls[0].rgb_color, [0, 0, 255]);
  const warm = colorCalls({ config, excluded: {}, hass }, 'room:living', { swatch: 1 });
  assert.deepEqual(warm.map((c) => c.entity_id), ['light.ceiling']);
});

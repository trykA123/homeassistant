import { SWATCHES, swatchServiceData, percentToKelvin, lightView, hexToRgb } from './stage-model.js';

export function roomOf(config, entityId) {
  return config.rooms.find((r) => r.lights?.some((l) => l.entity === entityId));
}

export function selectedLights(config, excluded, roomId) {
  const room = config.rooms.find((r) => r.id === roomId);
  const skip = excluded[roomId] ?? new Set();
  return (room?.lights ?? []).map((l) => l.entity).filter((id) => !skip.has(id));
}

export function faderText(kind, value, light) {
  if (kind === 'kelvin') return `${percentToKelvin(value, light.caps.minKelvin, light.caps.maxKelvin)} K`;
  return `${value}%`;
}

export function faderCall({ config, excluded, hass }, key, value) {
  const [kind, target] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  if (kind === 'brightness') return { ids: [target], data: { entity_id: target, brightness_pct: value } };
  if (kind === 'group') {
    const ids = selectedLights(config, excluded, target);
    return { ids, data: { entity_id: ids, brightness_pct: value } };
  }
  if (kind === 'kelvin') {
    const light = lightView(hass.states[target]);
    return { ids: [], data: { entity_id: target, color_temp_kelvin: percentToKelvin(value, light.caps.minKelvin, light.caps.maxKelvin) } };
  }
  throw new Error(`stage-card: unknown fader "${key}"`);
}

function targetsOf({ config, excluded }, target) {
  const [kind, id] = [target.slice(0, target.indexOf(':')), target.slice(target.indexOf(':') + 1)];
  return kind === 'room' ? selectedLights(config, excluded, id) : [id];
}

export function colorCalls(ctx, target, choice) {
  return targetsOf(ctx, target)
    .map((id) => ({ id, light: lightView(ctx.hass.states[id]) }))
    .map(({ id, light }) => {
      const data = choice.hex ? (light.caps.color ? { rgb_color: hexToRgb(choice.hex) } : null) : swatchServiceData(SWATCHES[choice.swatch], light);
      return data && { entity_id: id, ...data };
    })
    .filter(Boolean);
}

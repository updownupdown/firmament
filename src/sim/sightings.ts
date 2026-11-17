// Checking what the player says they saw against the simulated sky: single
// objects, and calendar events such as eclipses and meteor showers.

import { type AstroEvent, localSolarEclipse } from '../astro/events.ts';
import { makeFrame, observeBody } from '../astro/ephemeris.ts';
import { azAlt } from '../astro/frames.ts';
import { DEG, apply, fromSpherical } from '../astro/math.ts';
import { type SkyObject, type Universe, earthSite } from './universe.ts';

export interface SightingCheck {
  ok: boolean;
  /** Why not, in words for the player; empty when ok. */
  reason: string;
  /** Apparent altitude, radians. */
  alt: number;
}

/** Could this object have been seen, at the universe's instant and place? */
export function checkSighting(u: Universe, obj: SkyObject): SightingCheck {
  const hz = u.horizontal(obj.dir);
  const sunAlt = u.horizontal(u.bodies.get('sun')!.dir).alt;
  const alt = hz.altApparent;
  if (alt < 0) return { ok: false, reason: `${obj.name} was below the horizon then.`, alt };
  if (obj.kind === 'moon' || obj.kind === 'sun') return { ok: true, reason: '', alt };
  // Brighter things survive brighter skies.
  const mag = obj.mag ?? 6;
  const needed = mag < -3.5 ? 5 : mag < -1 ? -1 : mag < 1.5 ? -4 : mag < 4 ? -8 : -12;
  if (sunAlt / DEG > needed) return { ok: false, reason: `The sky was too bright to see ${obj.name} then.`, alt };
  return { ok: true, reason: '', alt };
}

// ------------------------------------------------------------------ events

export interface EventGoal {
  /** Log reference a sighting of this kind is stored under. */
  ref: string;
  name: string;
  /** Does a calendar event count toward this goal (wherever on Earth it is seen)? */
  matches(e: AstroEvent): boolean;
}

const shower = (id: string, name: string): EventGoal => ({
  ref: `event:meteor-shower:${id}`, name,
  matches: (e) => e.kind === 'meteor-shower' && e.data?.shower === id,
});

/** The events worth collecting, in the order the Log shows them. */
export const EVENT_GOALS: EventGoal[] = [
  { ref: 'event:lunar-eclipse:total', name: 'Total lunar eclipse', matches: (e) => e.kind === 'lunar-eclipse' && e.data?.type === 'total' },
  { ref: 'event:lunar-eclipse:partial', name: 'Partial lunar eclipse', matches: (e) => e.kind === 'lunar-eclipse' && e.data?.type === 'partial' },
  { ref: 'event:solar-eclipse:partial', name: 'Partial solar eclipse', matches: (e) => e.kind === 'solar-eclipse' },
  { ref: 'event:solar-eclipse:central', name: 'Total or annular solar eclipse', matches: (e) => e.kind === 'solar-eclipse' && e.data?.type !== 'partial' },
  { ref: 'event:conjunction', name: 'Close conjunction', matches: (e) => e.kind === 'conjunction' && e.importance >= 2 },
  shower('qua', 'Quadrantids'), shower('lyr', 'Lyrids'), shower('eta', 'Eta Aquariids'),
  shower('sda', 'Delta Aquariids'), shower('per', 'Perseids'), shower('dra', 'Draconids'),
  shower('ori', 'Orionids'), shower('leo', 'Leonids'), shower('gem', 'Geminids'), shower('urs', 'Ursids'),
];

export interface EventCheck extends SightingCheck {
  /** Log reference and name for what was seen from here. */
  ref: string;
  name: string;
  /** The moment to show: the local maximum of an eclipse, the best dark hour of a shower. */
  best: number;
  /** Where to look at `best` (radians), when the event is not a single body. */
  look?: { az: number; alt: number };
}

/** How far from an event's instant (days) a sighting can still count. */
export function eventWindow(e: AstroEvent): number {
  return e.kind === 'meteor-shower' ? 1.5 : e.kind === 'conjunction' ? 1 : e.kind === 'lunar-eclipse' ? 0.1 : e.kind === 'solar-eclipse' ? 0.25 : 0;
}

/**
 * Could this event be seen from the universe's place, and was it visible at
 * `jdUT`? Returns null for kinds that are not collected (phases, seasons…) and
 * for solar eclipses that miss this place altogether.
 */
export function checkEvent(u: Universe, e: AstroEvent, jdUT: number): EventCheck | null {
  const site = earthSite(u.site);
  const altOf = (id: string, t: number): number => {
    const f = makeFrame(u.eph, t, site);
    return azAlt(apply(f.j2000ToHorizon, observeBody(u.eph, f, id).dir))[1];
  };
  const inWindow = Math.abs(jdUT - e.t) <= eventWindow(e);
  const late = (what: string) => `${what} was not happening at that moment.`;

  if (e.kind === 'lunar-eclipse') {
    const type = String(e.data?.type ?? 'penumbral');
    const alt = altOf('moon', jdUT);
    const fail = !inWindow ? late('The eclipse') : alt < 0 ? 'The Moon was below the horizon here during the eclipse.' : '';
    return { ok: !fail, reason: fail, alt, ref: `event:lunar-eclipse:${type}`, name: e.title, best: e.t };
  }
  if (e.kind === 'solar-eclipse') {
    const local = localSolarEclipse(u.eph, site, e.t);
    // Below the horizon at the local maximum, the eclipse belongs to somewhere else.
    if (!local || local.sunAlt < 0) return null;
    const central = local.central;
    // Partial phases last about an hour either side of the local maximum.
    const close = Math.abs(jdUT - local.t) < 0.06;
    const alt = altOf('sun', jdUT);
    const fail = !close ? late('The eclipse') : alt < 0 ? 'The Sun was below the horizon here during the eclipse.' : '';
    return {
      ok: !fail, reason: fail, alt, best: local.t,
      ref: `event:solar-eclipse:${central ? 'central' : 'partial'}`,
      name: central ? e.title : `Partial solar eclipse, ${Math.round(local.magnitude * 100)}% covered`,
    };
  }
  if (e.kind === 'meteor-shower') {
    const radiant = fromSpherical(Number(e.data?.ra) * DEG, Number(e.data?.dec) * DEG);
    const at = (t: number) => {
      const f = makeFrame(u.eph, t, site);
      const [az, alt] = azAlt(apply(f.j2000ToHorizon, radiant));
      return { az, alt, sun: azAlt(apply(f.j2000ToHorizon, observeBody(u.eph, f, 'sun').dir))[1] };
    };
    // The best hour: radiant highest while the sky is dark, within a day of the peak.
    let best = e.t, bestAlt = -Infinity;
    for (let k = -48; k <= 48; k++) {
      const t = e.t + k / 48;
      const s = at(t);
      if (s.sun < -12 * DEG && s.alt > bestAlt) { bestAlt = s.alt; best = t; }
    }
    const now = at(jdUT);
    const fail = !inWindow ? late('The shower') : now.sun > -12 * DEG ? 'The sky was too bright for meteors then.'
      : now.alt < 0 ? 'The part of the sky the meteors come from was below the horizon then.' : '';
    const b = at(best);
    return {
      ok: !fail, reason: fail, alt: now.alt, best, look: { az: b.az, alt: Math.max(b.alt, 20 * DEG) },
      ref: `event:meteor-shower:${e.data?.shower}`, name: e.title.replace(/ peak$/, ''),
    };
  }
  if (e.kind === 'conjunction' && e.importance >= 2) {
    const state = (t: number) => {
      const f = makeFrame(u.eph, t, site);
      const alt = (id: string) => azAlt(apply(f.j2000ToHorizon, observeBody(u.eph, f, id).dir))[1];
      // The Moon and a planet show in twilight; two planets need a darker sky.
      const dark = alt('sun') < (e.bodies.includes('moon') ? -2 : -5) * DEG;
      return { alt: Math.min(...e.bodies.map(alt)), dark };
    };
    // The best moment: both as high as they get together in a dark sky, within a day.
    let best = e.t, bestAlt = -Infinity;
    for (let k = -48; k <= 48; k++) {
      const s = state(e.t + k / 48);
      if (s.dark && s.alt > bestAlt) { bestAlt = s.alt; best = e.t + k / 48; }
    }
    const now = state(jdUT);
    const fail = !inWindow ? late('The conjunction') : now.alt < 0 ? 'They were not both above the horizon then.'
      : !now.dark ? 'The sky was too bright to see them then.' : '';
    return { ok: !fail, reason: fail, alt: now.alt, ref: 'event:conjunction', name: e.title, best };
  }
  return null;
}

/** Can this event be seen from here at its best moment, and does it count toward `goal`? */
export function countsFromHere(u: Universe, e: AstroEvent, goal: EventGoal): EventCheck | null {
  if (!goal.matches(e)) return null;
  const first = checkEvent(u, e, e.t);
  if (!first) return null;
  const atBest = first.best === e.t ? first : checkEvent(u, e, first.best);
  return atBest && atBest.ok && atBest.ref === goal.ref ? atBest : null;
}

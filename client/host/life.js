// "Vida" de la ciudad del host: reúne las luces con vida, las ventanas, la gente y los animales, los gatos de los tejados, el
// tráfico y los detalles ambientales (vapor, pétalos, pájaros) detrás de dos funciones: update (cada fotograma) y setLevel.
// Todo es decoración: no toca la simulación del servidor ni las colisiones. La calidad adaptativa (que es sobre todo el bloom)
// apenas lo recorta: solo en el nivel 3 hay algo menos de gente y sin vapor ni pétalos. Solo existe con la vista 3D.
import { createLightLife } from './lifeLights.js';
import { createWindowLife } from './lifeWindows.js';
import { createCrowd } from './lifeCrowd.js';
import { createRoofCats } from './lifeRoofCats.js';
import { createVehicles } from './lifeVehicles.js';
import { createAmbient } from './lifeAmbient.js';
import { createRoofParty } from './lifeRoofParty.js';
import { createRain } from './lifeRain.js';

// cityInfo = sceneApi.city (lo que devuelve createCityMeshes).
export function createLife(scene, arena, cityInfo) {
  const { city, faceList, regions, windows, glows } = cityInfo.life;
  const lights = createLightLife(glows);
  const windowLife = createWindowLife(scene, { faceList, regions, windows, city });
  // Mapa de la lluvia: poca gente y con paraguas, ni gatos, y más coches (la gente se refugia y el tráfico no para).
  const rainy = arena.mood === 'rain';
  const crowd = createCrowd(scene, arena, undefined, rainy ? { counts: { person: 5, cat: 0, dog: 1 }, umbrellas: true } : {});
  const roofCats = createRoofCats(scene, city);
  const vehicles = createVehicles(scene, arena, undefined, rainy ? { plan: [
    { rig: 'car', lane: 0, at: 0.05 }, { rig: 'car', lane: 1, at: 0.2 }, { rig: 'car', lane: 0, at: 0.36 }, { rig: 'scooter', lane: 1, at: 0.5 },
    { rig: 'car', lane: 1, at: 0.64 }, { rig: 'car', lane: 0, at: 0.78 }, { rig: 'scooter', lane: 0, at: 0.9 },
  ] } : {});
  const ambient = createAmbient(scene, arena, city);
  const roofParty = createRoofParty(scene, city);
  const rain = arena.mood === 'rain' ? createRain(scene, arena) : null; // solo en el mapa de la lluvia
  console.info(`Vida de la ciudad: ${windowLife.count} ventanas animadas, ${crowd.count} personas y animales, ${roofCats.count} gatos en los tejados, ${vehicles.count} vehículos, fiesta y barbacoa con ${roofParty.count} personas`);
  let last = 0;

  return {
    crowd, // solo para depurar y probar (window.__life en main.js)
    ambient,
    vehicles,
    roofCats,
    roofParty, // solo para depurar y probar (dónde están la fiesta y la barbacoa)
    // state = estado interpolado de este fotograma (o null sin partida).
    update(now, state) {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      lights.update(now);
      windowLife.update(now);
      vehicles.update(now, state, crowd.agents);
      crowd.update(now, state, vehicles.cars);
      roofCats.update(now, state, dt);
      ambient.update(now);
      roofParty.update(now);
      rain?.update(now);
    },
    // Pánico (easter egg de TNI, AGENTS.md sección 88): gente y animales corren fuera del mapa, coches y motos se van, los gatos saltan
    // de los tejados y la fiesta y la barbacoa se vacían. calm() lo devuelve todo poco a poco (partida siguiente).
    panic(now) { crowd.panic(now); vehicles.panic(now); roofCats.panic(now); roofParty.panic(now); },
    calm(now) { crowd.calm(now); vehicles.calm(now); roofCats.calm(now); roofParty.calm(now); },
    // Nivel de calidad del host (0-3): ver el comentario de arriba.
    setLevel(level) {
      crowd.setLevel(level);
      ambient.setLevel(level);
      rain?.setLevel(level);
    },
  };
}

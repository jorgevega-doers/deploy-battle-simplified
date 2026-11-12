// Valores que necesitan a la vez el servidor y el navegador.
export const GAME_NAME = 'DEPLOY BATTLE'; // nombre del juego (29-oct); los textos HTML estáticos lo repiten a mano (buscar "DEPLOY")
export const GRID_WIDTH = 32;           // la arena es una cuadrícula de 32 x 18 celdas de 1 x 1: proporción 16:9, como la pantalla
export const GRID_HEIGHT = 18;
export const AIM_ASSIST_LENGTH = 10;     // la línea de apuntado solo enseña estas celdas de recorrido y se desvanece
export const MAX_BOUNCES = 2;           // rebotes máximos de un proyectil (antes 3; 29-oct, petición del usuario)
export const TANK_HALF = 0.5;           // mitad del lado del tanque: hitbox de 1 x 1
export const POWERUP_HALF = 0.4;        // mitad del lado de un power-up en el suelo
// El orden importa: en los mensajes de red se envía el índice de esta lista.
export const POWERUP_TYPES = Object.freeze(['double', 'speed', 'aoe', 'shield']);

// Colores de cada tanque por plaza (índice 0-3 = P1, P2 y, en el modo de un jugador, los bots 3 y 4). P1 es azul y P2 fucsia
// (marca); los otros dos usan los acentos permitidos (cian y ámbar) para distinguirse de un vistazo. Un solo sitio para que
// tanques, disparos, trozos, estelas, anillos y halos coincidan.
export const TANK_COLORS = [0x4a6bff, 0xff3a96, 0x18d8c8, 0xffb81c];          // brillo propio y columna de reaparición
export const PROJECTILE_CORE = [0xc9d3ff, 0xffc4e0, 0xc4fff8, 0xfff0b8];     // núcleo claro del disparo
export const PROJECTILE_HALO = [0x5a6cff, 0xff2f8e, 0x12b8ac, 0xe09600];     // halo semitransparente (tonos medios: casi no recoge el bloom)
export const RING_COLORS = [0x6f8cff, 0xff4fa3, 0x2fe6d6, 0xffc83a];         // anillo bajo el tanque, estela del dash, aros de impacto
export const DEBRIS_BODY = [[0x6f8cff, 0x4a6bff], [0xff7ab8, 0xff3a96], [0x7ffff2, 0x18d8c8], [0xffe07a, 0xffb81c]]; // cascos (claro y medio)

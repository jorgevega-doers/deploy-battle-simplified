// Enlaces de contacto de la pantalla final. Para añadir o cambiar uno basta con editar este objeto: los botones
// aparecen solos para cada enlace que tenga valor (los vacíos no se muestran) y no hay que tocar el diseño.
//
// "app" (opcional) dice cómo abrir la aplicación del móvil en vez del navegador (ver appLink).
export const LINKS = {
  // El botón principal es el de la IA.
  automation: { label: 'AUTOMATIZACIONES E IA', href: 'https://automation.doersdf.com/', icon: 'bot', primary: true },
  // "half": los botones con esta marca van seguidos en una misma fila, cada uno a la mitad (entre los dos ocupan el ancho de un botón normal).
  web: { label: 'VISITA DOERSDF.COM', href: 'https://doersdf.com/', icon: 'globe', half: true },
  // Pendientes de recibir de DOERS (rellenar con la dirección completa; ejemplos entre paréntesis):
  email: { label: 'ESCRÍBENOS', href: '', icon: 'mail' },        // 'mailto:hola@...'
  phone: { label: 'LLÁMANOS', href: '', icon: 'phone' },         // 'tel:+34...'
  whatsapp: { label: 'WHATSAPP', href: '', icon: 'phone' },      // 'https://wa.me/34...'
  // Siguen abriéndose en la misma pestaña para que el móvil pueda entregar el enlace a su aplicación ("app").
  linkedin: {
    label: 'LINKEDIN', href: 'https://www.linkedin.com/company/doersdf/home/', icon: 'linkedin', half: true,
    app: { android: { host: 'www.linkedin.com', path: '/company/doersdf/', package: 'com.linkedin.android' } },
  },
};

export function detectPlatform(userAgent) {
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  return 'other';
}

// Dirección "intent" de Android: abre la aplicación indicada y, si no está instalada, cae a "fallback" (la web).
export function androidIntent({ host, path, package: appPackage }, fallback) {
  return `intent://${host}${path}#Intent;scheme=https;package=${appPackage};S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
}

// Dirección con la que abrir un enlace en cada plataforma:
//  - Android con aplicación conocida: el "intent" (abre la app de LinkedIn o Instagram; sin ella, la web).
//  - iOS y resto: la dirección web normal. En iOS un toque en un enlace https de LinkedIn o Instagram abre la app
//    instalada por sí solo (enlaces universales); usar un esquema propio (instagram://) daría un error si no está.
export function openHref(link, platform) {
  if (platform === 'android' && link.app?.android) return androidIntent(link.app.android, link.href);
  return link.href;
}

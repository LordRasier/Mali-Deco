type Section = { id: string; title: string; paragraphs?: string[]; links?: { href: string; label: string }[]; questions?: { question: string; answer: string }[] };
export type InformationPage = { title: string; label: string; eyebrow: string; intro: string; sections: Section[]; contact?: boolean; legal?: boolean; about?: boolean };

export const informationPages = {
  contacto: {
    title: 'Hablemos de tu pedido', label: 'Contacto', eyebrow: 'Contacto', contact: true,
    intro: 'Te acompañamos a elegir tu pieza y a resolver las dudas de tu compra.',
    sections: [
      { id: 'antes-de-comprar', title: 'Antes de elegir', paragraphs: ['Podés consultarnos por el modelo, las medidas, el material o el color. Si buscás una personalización o necesitás recibirlo para una fecha especial, coordinemos los detalles antes de confirmar.'], links: [{ href: '/preguntas-frecuentes', label: 'Ver preguntas frecuentes y cuidados' }] },
      { id: 'tu-pedido', title: 'Si ya hiciste tu pedido', paragraphs: ['Tené a mano el número de pedido y contanos qué necesitás. Si nos escribiste por Instagram para comprar, podés continuar en esa misma conversación.', 'Para revisar una pieza dañada o diferente de la que pediste, las fotos del producto y del embalaje nos ayudan. Evitá compartir contraseñas o datos completos de tu tarjeta.'], links: [{ href: '/envios-y-reembolsos#seguimiento', label: 'Consultar cómo seguir un envío' }, { href: '/envios-y-reembolsos#devoluciones', label: 'Consultar cambios y devoluciones' }] },
    ],
  },
  'politica-de-privacidad': {
    title: 'Política de privacidad', label: 'Política de privacidad', eyebrow: 'Tus datos', legal: true,
    intro: 'Qué información usamos para acompañar tu compra y cómo podés ejercer tus derechos.',
    sections: [
      { id: 'informacion', title: 'Qué información usamos', paragraphs: ['Al coordinar una compra podemos recibir tu nombre, email, teléfono, datos necesarios para facturar, domicilio de entrega y los detalles de tu pedido. Los usamos para atenderte, preparar la compra, organizar el envío y gestionar pagos o reclamos.', 'El código postal y la localidad permiten consultar opciones de entrega. Sin los datos necesarios para una operación, es posible que no podamos cotizar el envío, completar el pedido o responderte.'] },
      { id: 'servicios', title: 'Pagos, envíos y atención', paragraphs: ['Cuando una operación lo requiere, los datos necesarios se comparten con el proveedor de pagos y los servicios de logística que intervienen. Esto puede incluir Mercado Pago para el pago y Zipnova o el transportista elegido para la entrega.', 'La información de la tarjeta se ingresa en el servicio de pagos. La tienda conserva referencias y estados de la operación; no te pedimos que nos envíes los datos completos de tu tarjeta por mensaje.', 'Si nos contactás por Instagram o WhatsApp, esa conversación también se rige por las condiciones de la plataforma que utilizás.'] },
      { id: 'navegador', title: 'Información en tu navegador', paragraphs: ['Usamos almacenamiento del navegador para recordar los artículos del carrito y, durante la sesión, el código postal y la localidad elegida. Podés borrarlo desde la configuración del navegador; hacerlo puede vaciar el carrito o hacer que tengas que elegir nuevamente el destino.', 'Las funciones que requieren una sesión utilizan cookies técnicas. La tienda puede utilizar Google Analytics, directamente o mediante Google Tag Manager, para medir visitas y consultas. La medición se carga solo si la aceptás. Cuando está habilitada, podés aceptar, rechazar o cambiar tu elección desde Preferencias de medición, al pie de la página. La elección se guarda en este navegador durante hasta 180 días. Rechazarla no impide navegar ni hacer pedidos.'] },
      { id: 'conservacion', title: 'Conservación y acceso', paragraphs: ['Los registros de pedidos, pagos y comunicaciones se utilizan para cumplir la compra, atender consultas y respaldar las obligaciones que correspondan. El acceso administrativo requiere autorización.', 'La eliminación de datos puede estar limitada por obligaciones de conservación o por una operación o reclamo pendiente. No se utilizan los datos del pedido para finalidades incompatibles con la compra.'] },
      { id: 'derechos', title: 'Tus derechos', paragraphs: ['Podés solicitar el acceso, la corrección o, cuando corresponda, la eliminación de tus datos. Para protegerlos, podemos verificar razonablemente tu identidad.', 'La Agencia de Acceso a la Información Pública es la autoridad de control de la Ley 25.326. Podés acudir a ella para consultas o denuncias relacionadas con la protección de tus datos.'], links: [{ href: '/contacto', label: 'Consultar los canales de contacto' }, { href: 'https://www.argentina.gob.ar/normativa/nacional/64790/actualizacion', label: 'Leer la Ley 25.326' }] },
    ],
  },
  'terminos-y-condiciones': {
    title: 'Términos y condiciones', label: 'Términos y condiciones', eyebrow: 'Tu compra, con claridad', legal: true,
    intro: 'Las condiciones para elegir y encargar tus piezas de impresión 3D.',
    sections: [
      { id: 'compra', title: 'Elegir y confirmar un pedido', paragraphs: ['Revisá la descripción, las medidas, el material, el color y la variante antes de confirmar. Agregar artículos al carrito o calcular un envío no confirma una compra ni reserva una pieza.', 'La fabricación y el despacho se coordinan una vez confirmado el pedido y aprobado el pago. Para una personalización, primero acordamos sus especificaciones y disponibilidad.'] },
      { id: 'precios', title: 'Precios y medios de pago', paragraphs: ['Los precios se expresan en pesos argentinos. El envío se informa por separado, según el destino y los artículos elegidos, antes de confirmar la compra.', 'Utilizá únicamente los medios de pago que la tienda te indique al coordinar el pedido o que estén habilitados al comprar. Una captura de pantalla no reemplaza la confirmación de acreditación del pago.'] },
      { id: 'fabricacion', title: 'Piezas impresas a pedido', paragraphs: ['Cada pieza se fabrica, revisa y embala para tu pedido. Este proceso suele llevar entre 1 y 3 días, según la pieza; el tiempo de transporte se suma y empieza a contarse desde el despacho.', 'La impresión 3D construye las piezas por capas, por lo que puede dejar líneas visibles o pequeñas variaciones de textura. El color también puede percibirse diferente según la pantalla y la iluminación. Esto no excluye reclamos por fallas, diferencias con lo ofrecido o un producto incorrecto.'] },
      { id: 'entregas', title: 'Entrega, cambios y reembolsos', paragraphs: ['Verificá el domicilio y los datos de quien recibirá el pedido. Las condiciones de entrega, cambios, arrepentimiento y reintegros están reunidas en nuestra política de envíos y reembolsos.', 'Estas condiciones no reducen los derechos que te corresponden como consumidor.'], links: [{ href: '/envios-y-reembolsos', label: 'Leer envíos, cambios y reembolsos' }] },
      { id: 'uso', title: 'Uso y cuidado', paragraphs: ['Seguí las indicaciones de la ficha de cada producto. Si necesitás usar una pieza al exterior, cerca de una fuente de calor o en contacto con alimentos, consultá su aptitud antes de comprar.'], links: [{ href: '/preguntas-frecuentes#cuidados', label: 'Ver recomendaciones de cuidado' }, { href: '/politica-de-privacidad', label: 'Leer la política de privacidad' }] },
    ],
  },
  'preguntas-frecuentes': {
    title: 'Preguntas frecuentes', label: 'Preguntas frecuentes', eyebrow: 'Una mano para elegir',
    intro: 'Respuestas sobre nuestras piezas, tu pedido y los cuidados de todos los días.',
    sections: [
      { id: 'piezas', title: 'Sobre las piezas', questions: [
        { question: '¿Los productos se fabrican a pedido?', answer: 'Sí. Fabricamos cada artículo para tu pedido. La fabricación, revisión y embalaje suelen llevar entre 1 y 3 días, según la pieza. El tiempo de transporte se suma después del despacho.' },
        { question: '¿Cómo elijo el material, el color o el diseño?', answer: 'Consultá las opciones y medidas de la ficha del producto y seleccioná la variante que querés. Si tenés dudas, coordiná con nosotros antes de confirmar: una vez fabricada la pieza no ofrecemos cambios voluntarios por errores de elección, sin afectar los derechos que correspondan.' },
        { question: '¿Puedo pedir una pieza personalizada?', answer: 'Podés consultar por nombres, medidas especiales o diseños exclusivos. Confirmaremos si es posible realizarla y acordaremos precio, especificaciones y plazo antes de avanzar.' },
        { question: '¿Se ven las capas de impresión?', answer: 'La impresión 3D construye el objeto capa por capa, y esas líneas pueden formar parte de su textura. Esto no significa que debas aceptar una pieza rota, defectuosa o distinta de la que compraste.' },
      ] },
      { id: 'pedidos', title: 'Compra y entrega', questions: [
        { question: '¿Cómo calculo el envío?', answer: 'Agregá tus productos al carrito e ingresá tu código postal. Las opciones y el importe dependen de la cobertura y del pedido. El envío de compra está a tu cargo y se informa antes de confirmar.' },
        { question: '¿El plazo de envío incluye la fabricación?', answer: 'No. El tiempo total suma fabricación y preparación más el traslado. Si necesitás recibirlo para una fecha especial, consultá antes de comprar.' },
        { question: '¿Cómo sigo mi pedido?', answer: 'Una vez despachado, podrás consultar el recorrido con el código o enlace del transportista. Si no lo recibiste, escribinos por el canal donde coordinaste la compra.' },
        { question: '¿Qué hago si recibo una pieza dañada o incorrecta?', answer: 'Contactanos con el número de pedido y, si podés, fotos de la pieza y del embalaje. Recomendamos avisar dentro de los primeros 5 días desde la entrega, sin limitar la garantía ni los plazos legales para reclamar.' },
      ], links: [{ href: '/envios-y-reembolsos', label: 'Ver la política completa de envíos y reembolsos' }] },
      { id: 'cuidados', title: 'Cuidá tu pieza', questions: [
        { question: '¿Cómo la limpio?', answer: 'Usá un paño suave apenas humedecido y secá con cuidado. Evitá abrasivos, solventes y agua muy caliente. Si la ficha del producto incluye instrucciones particulares, seguí esas indicaciones.' },
        { question: '¿Puede estar al sol o cerca del calor?', answer: 'Depende del material y del uso para el que fue diseñada. Como cuidado general, evitá fuentes de calor y dejarla dentro de un auto al sol. Consultanos si necesitás una pieza para exterior o para temperaturas elevadas.' },
        { question: '¿Es apta para alimentos, lavavajillas o microondas?', answer: 'No asumas esa aptitud por el material o por la forma de la pieza. Usala para esos fines únicamente si la ficha lo indica expresamente y siguiendo sus instrucciones.' },
      ] },
    ],
  },
  'sobre-mali': {
    title: 'Objetos con otra forma', label: 'Sobre nosotros', eyebrow: 'Sobre nosotros', about: true,
    intro: 'Diseño e impresión 3D para darle personalidad a tus espacios y a los objetos que usás todos los días.',
    sections: [
      { id: 'idea', title: 'De una idea a tu espacio', paragraphs: ['Nos gustan las formas, los colores y esos detalles que hacen propio un lugar. Trabajamos con impresión 3D para convertir esas ideas en piezas que puedas elegir y combinar a tu manera.'] },
      { id: 'proceso', title: 'Una pieza para tu pedido', paragraphs: ['Cada artículo se fabrica a pedido. Elegís entre las variantes disponibles y nosotros lo imprimimos, revisamos y embalamos para su entrega.', 'La preparación suele llevar entre 1 y 3 días, según la pieza. Para pedidos personalizados o una fecha especial, coordinamos los detalles antes de empezar.'], links: [{ href: '/envios-y-reembolsos#envios', label: 'Conocer el proceso de entrega' }] },
      { id: 'eleccion', title: 'Elegí con información', paragraphs: ['El material, las medidas y el uso previsto importan tanto como la forma. Queremos que encuentres la pieza que encaje con lo que buscás; por eso podés consultarnos antes de confirmar tu elección.'], links: [{ href: '/catalogo', label: 'Explorar los productos' }, { href: '/contacto', label: 'Consultar por una pieza' }] },
    ],
  },
} satisfies Record<string, InformationPage>;

export type InformationPageKey = keyof typeof informationPages;
export const informationPaths = Object.keys(informationPages);

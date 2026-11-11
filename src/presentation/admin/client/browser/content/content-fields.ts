/** Labels and empty blocks for the independent store editor. */
export const fieldLabels: Record<string, string> = {
  listing: 'Listado de productos', pageSize: 'Productos por página', categoriesEnabled: 'Mostrar categorías', filtersEnabled: 'Mostrar filtros laterales', countEnabled: 'Mostrar cantidad de resultados',
  cardCategoryEnabled: 'Mostrar categoría en cada producto', cardDescriptionEnabled: 'Mostrar descripción', cardPriceEnabled: 'Mostrar precio', moreLabel: 'Texto del enlace al producto',
  itemSingular: 'Nombre de un resultado', itemPlural: 'Nombre de varios resultados', allCategoriesLabel: 'Etiqueta de todas las categorías',
  legalEyebrow: 'Texto superior de datos legales', legalTitle: 'Título de datos legales', indexTitle: 'Título del índice', contactTitle: 'Título de canales de atención', hoursLabel: 'Etiqueta de horarios',
  copy: 'Textos de la tienda', home: 'Inicio', catalog: 'Catálogo', product: 'Producto', information: 'Textos de ayuda', cart: 'Carrito', email: 'Emails de pedidos',
  features: 'Funciones de la tienda', homeAbout: 'Mostrar presentación en el inicio', pages: 'Páginas y rutas', footer: 'Footer', contact: 'Contacto y datos fiscales',
  enabled: 'Activo', title: 'Título', titleAccent: 'Título destacado', description: 'Descripción', label: 'Texto del enlace', eyebrow: 'Texto superior', action: 'Texto del botón', note: 'Nota',
  collectionEyebrow: 'Texto superior de la colección', collectionTitle: 'Título de la colección', collectionAction: 'Botón de la colección', empty: 'Mensaje sin productos',
  aboutAlt: 'Descripción de la imagen', aboutCaption: 'Pie de imagen', aboutEyebrow: 'Texto superior de presentación', aboutTitle: 'Título de presentación', aboutDescription: 'Presentación', aboutSignature: 'Cierre de presentación',
  seoTitle: 'Título para buscadores', seoDescription: 'Descripción para buscadores', noResults: 'Mensaje sin coincidencias', emptyPage: 'Mensaje de página vacía', headerLink: 'Enlace en el encabezado',
  orderNote: 'Aviso sobre pedidos', aboutMark: 'Sello de presentación', aboutNote: 'Texto del sello', helpEyebrow: 'Texto superior de ayuda', helpTitle: 'Título de ayuda', helpDescription: 'Descripción de ayuda', contactAction: 'Enlace a contacto', contactEmpty: 'Mensaje sin canales de contacto', legalEmpty: 'Mensaje sin datos fiscales',
  tagline: 'Lema', bannerAlt: 'Descripción del banner', itemsTitle: 'Título del resumen de artículos', thanks: 'Agradecimiento', confirmed: 'Compra confirmada', shipped: 'Pedido despachado', delivered: 'Pedido entregado', subject: 'Asunto', intro: 'Introducción', detail: 'Mensaje',
  emailEnabled: 'Mostrar email', whatsappEnabled: 'Mostrar WhatsApp', instagramEnabled: 'Mostrar Instagram', brandEnabled: 'Mostrar marca y presentación', legalEnabled: 'Mostrar identidad fiscal', dataFiscalEnabled: 'Mostrar Data Fiscal', copyrightEnabled: 'Mostrar copyright', copyright: 'Texto de copyright', topEnabled: 'Mostrar volver arriba', topLabel: 'Texto de volver arriba', orderNoteEnabled: 'Mostrar aviso de pedidos', dataFiscalLabel: 'Texto de Data Fiscal', withdrawalLabel: 'Texto de arrepentimiento',
  benefits: 'Beneficios', icon: 'Ícono', columns: 'Columnas', links: 'Enlaces', target: 'Página de destino', sections: 'Secciones', id: 'Identificador de sección', paragraphs: 'Párrafos', questions: 'Preguntas frecuentes', question: 'Pregunta', answer: 'Respuesta', href: 'Destino del enlace',
  hours: 'Horarios', legalName: 'Razón social', taxId: 'CUIT (11 dígitos)', legalAddress: 'Domicilio legal', dataFiscalUrl: 'Enlace oficial de Data Fiscal',
  contacto: 'Contacto', 'sobre-mali': 'Sobre nosotros', 'preguntas-frecuentes': 'Preguntas frecuentes', 'envios-y-reembolsos': 'Envíos y reembolsos', cuidados: 'Cuidados', seguimiento: 'Seguimiento', 'cambios-y-devoluciones': 'Cambios y devoluciones', arrepentimiento: 'Arrepentimiento', 'politica-de-privacidad': 'Privacidad', 'terminos-y-condiciones': 'Términos y condiciones',
};
export const emptyContentItems: Record<string, unknown> = {
  sections: { id: 'seccion', title: 'Nueva sección', paragraphs: [], questions: [], links: [] }, paragraphs: '', questions: { question: '', answer: '' },
  links: { href: '/', label: 'Nuevo enlace' }, benefits: { enabled: true, icon: 'box', title: 'Nuevo beneficio', description: '' }, columns: { title: 'Nueva columna', enabled: true, links: [] },
};
export const editorTargets = ['catalog', 'cart', 'contacto', 'sobre-mali', 'preguntas-frecuentes', 'envios-y-reembolsos', 'cuidados', 'seguimiento', 'cambios-y-devoluciones', 'arrepentimiento', 'politica-de-privacidad', 'terminos-y-condiciones'];

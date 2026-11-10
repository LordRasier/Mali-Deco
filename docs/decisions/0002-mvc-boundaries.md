# Límites del piloto MVC

> Decisión de una etapa anterior. La convivencia fue reemplazada por [la aplicación única](../rework-completion.md); los invariantes de seguridad siguen vigentes.
**Estado: piloto de desarrollo implementado, verificado y patrón aceptado por el usuario.** Está autorizada la siguiente etapa de carrito compartido y catálogo; las páginas de negocio siguen en Next y requieren pruebas de paridad antes del corte.

## Piloto acotado

Se instaló `hbs` 4.4.0, licencia MIT, mediante descarga anónima de npm público autorizada por el usuario, sin scripts de instalación. El lockfile incorpora Handlebars 4.7.10 y walk 2.3.15 sin actualizar paquetes existentes. Se revisaron documentación y changelog; esto no equivale a una auditoría global de vulnerabilidades. Véanse [operación](../mvc-pilot.md) y [evidencia](../mvc-verification.md).

La página `/__mvc/pilot` es de lectura, sintética y exclusiva de desarrollo con `MVC_PILOT_ENABLED=true`. Prueba layout/parcial, escape, copia explícita de assets y arranque compilado sin fuentes. Se crea un motor aislado por aplicación y se deshabilitan los permisos de prototipos que hbs habilita por defecto. Solo se proyectan locales primitivos; no se admiten opciones de renderizado desde la query. No reemplazar páginas antes de sus pruebas de paridad.

## Namespaces

Mantener `/api/v1/*`. Una exclusión exacta de GET para un path único puede servir al piloto; no generalizarla a `/admin/orders` o `/admin/settings`: esos mismos paths pertenecen a controladores API antes del prefijo y podrían perder `/api/v1`.

Antes del corte real, establecer propiedad explícita del namespace API mediante módulos de controladores o prefijos de API. La [prueba de 50 rutas](../../tests/http/application-routing.test.ts) es una barrera, no un permiso para alterar el contrato.

## Sesiones y estado

Conservar la cookie de checkout limitada a `/api/v1/checkout` y los endpoints JSON con sus headers. Una vista HTML no debe asumir que recibe esa cookie. El cliente mínimo del carrito/cotización debe existir antes de migrar páginas que ya lo incluyen. No ampliar orígenes, activar proveedores o persistir borradores administrativos en disco.

La convivencia está probada únicamente para el piloto: dos rewrites explícitos en Next de desarrollo, sin fallback y con reversión comprobada. Los adaptadores de mutación siguen siendo JSON con headers CSRF; no se amplían cookies, permisos ni content types para formularios. Las pruebas de sesiones usan persistencia sintética, no sustituyen navegador administrativo ni MariaDB. Consultar [prefijos](https://docs.nestjs.com/faq/global-prefix) y [plan](../../tasks/plan.md) antes de extender el patrón a namespaces reales.

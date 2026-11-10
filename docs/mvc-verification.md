# Verificación del piloto MVC

> Registro histórico de una etapa. Rutas de preview, flags y comandos de convivencia ya no son operativos. Consultar el estado consolidado (retirado; ver cobertura de reemplazo) y el [inicio vigente](../README.md).
**Alcance histórico de esta verificación:** T06–T07 completas para una página sintética; T08 parcialmente caracterizada por HTTP. El usuario aceptó posteriormente el patrón del checkpoint A y continuar con carrito compartido y catálogo. No se migraron páginas de negocio ni se retiró Next en esta etapa. La [guía operativa](mvc-pilot.md) explica cómo reproducir el piloto.

## Dependencias y cambios

La descarga de `hbs@4.4.0` fue autorizada expresamente y se realizó contra npm público de forma anónima, con configuración vacía, entorno acotado y `--ignore-scripts --no-audit --no-fund`. El lockfile agregó nueve paquetes y la dependencia API; no eliminó ni actualizó versiones existentes. Se revisaron licencia, documentación y changelog, no una auditoría global de vulnerabilidades.

La implementación mantiene los 50 contratos API, una sola raíz dinámica y el resolver postal compartido. El piloto opt-in añade una exclusión GET exacta y assets estáticos acotados. Las [pruebas del motor](../src/presentation/view-engine.test.ts) verifican escape, aislamiento de parciales y denegación explícita de miembros heredados. Deshabilitar prototipos no convierte las plantillas u objetos arbitrarios en contenido seguro.

## Evidencia automatizada

| Comprobación | Resultado |
|---|---|
| `npm run lint` | Correcto |
| `npm run typecheck` | Correcto |
| `npm test` | 194 pruebas API + 62 web; 256 correctas |
| `npm run build` | API y Next correctos |
| Artefacto API | Cuatro assets permitidos; sin tests, arneses ni integraciones compiladas |
| Arranque compilado sin fuentes | Health 200; piloto/assets 404 desactivado y 200 activado |
| Producción sin base, aun con flag MVC | Rechazo de arranque por `DB_HOST` ausente |
| Proxy local de envíos | Script existente correcto contra API y Next reales, sin proveedor ni base |

La verificación general se ejecutó en una copia física aislada del código y dependencias. Tras fortalecer la prueba de traversal se repitieron la suite completa, lint y typecheck; no cambió código de ejecución. Se ocultaron temporalmente las fuentes solo dentro de esa copia para probar el artefacto, restaurándolas al terminar. El smoke esperó health HTTP: el log de inicialización de Nest por sí solo no garantiza que el puerto ya acepte conexiones.

La nueva política, motor, copia de assets y piloto HTTP tuvieron ejecución RED antes de implementación y GREEN después. El rewrite de Next tuvo una aserción fallida antes de incorporarlo. Las pruebas de sesiones/checkout son **caracterización de comportamiento existente**, no se presentan como cambios de comportamiento dirigidos por una prueba fallida.

La revisión independiente detectó que `fetch` normalizaba el recorrido de directorios antes de enviarlo. La [regresión HTTP](../tests/http/mvc-pilot.test.ts) ahora utiliza `node:http` con paths crudos para conservar ambas variantes codificadas; verifica 404 y ausencia de bytes de plantillas. El revisor confirmó la corrección mediante lectura, sin atribuirle otra ejecución de pruebas.

## Navegador y reversión

Se ejecutó una API compilada y Next de desarrollo aislados, sin configuración de base, con checkout y Zipnova deshabilitados. El navegador entró por el origen Next:

- HTML, layout, parcial y CSS correctos. Mensaje con etiqueta `script` mostrado literalmente, título intacto, cero elementos script y CSP conservada.
- Tab mostró el enlace para saltar contenido con foco visible; Enter enfocó el elemento principal.
- Captura móvil de 375 × 812 inspeccionada visualmente. Comprobaciones DOM a 375, 812 y 1440 píxeles sin desbordamiento horizontal; enlace con objetivo mínimo de 44 píxeles.
- Mensaje sin espacios de 200 caracteres y texto al 200 % sin desbordamiento móvil; sin animaciones. El tema claro es explícito.
- Secuencia activado → desactivado: piloto y CSS 404; catálogo heredado 200; health 200. Se restauró el piloto activado para revisión.

**Límite visual:** el navegador integrado ajustó/recortó las capturas grandes al panel anfitrión. No se afirma aprobación visual raster de escritorio; las medidas DOM no la sustituyen.

## Límites y siguiente paso

Las pruebas de [identidad](../tests/http/mvc-session-boundaries.test.ts) y [checkout](../tests/http/mvc-checkout-boundary.test.ts) usan servicios reales con persistencia sintética en memoria: roles, cookies, CSRF/origen, rotación, revocación y expiración. El token obsoleto de otra pestaña se simula por HTTP; **no se ejecutó un recorrido administrativo completo con dos pestañas reales ni integración MariaDB**.

No se ejecutaron migraciones, bootstrap de usuarios, escrituras comerciales, pagos ni llamadas a proveedores. No se habilitó RDD ni se crearon commits. No se intervinieron previews ajenos durante el piloto y `.atl/` se conservó. En la comprobación final los puertos anteriores 3100/3101 no respondieron; no se afirma que continúen disponibles ni se reiniciaron. El piloto aislado sí respondió en 50667.

Después de aceptar el patrón: completar las comprobaciones de sesión pertinentes y portar el cliente compartido de carrito/cotización con sus pruebas. Eliminar Next o los workspaces antes de demostrar paridad dejaría funcionalidades sin reemplazo. Consultar [tareas](../tasks/todo.md).

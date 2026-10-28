# Tesorería efectiva · Demo frontend en memoria

## Objetivo y alcance autorizado
Convertir la entrega v1 en una demo estática, independiente de Forecast Minimalista.
Conservar Dashboard, Bancos, Movimientos y Escenarios, diseño y cálculos existentes.
Usar exclusivamente datos ficticios precargados y estado volátil de la pestaña.
No crear proyectos, tablas, usuarios ni archivos en Supabase o cualquier base de datos.
No trasladar los registros reales de la aplicación anterior.

## Contratos e invariantes
- Recargar o abrir otra pestaña inicia una demo nueva. Cambiar de sección desde el menú o con atrás/adelante conserva el estado de la pestaña.
- Sin backend, autenticación real, cookies de aplicación, localStorage, sessionStorage, IndexedDB ni service worker.
- Los importes siguen usando centavos exactos y BigInt. Un traspaso conserva el consolidado.
- Copiar escenarios no comparte objetos mutables ni cuentas con la Base.
- Ediciones en lote e importación son atómicas en memoria; validar antes de aplicar.
- Los archivos seleccionados se procesan localmente. Advertir que solo deben usarse ejemplos ficticios.
- La eliminación se puede deshacer durante cinco segundos; preserva el orden mediante sequence.
- Estado solo en memoria no proporciona seguridad multiusuario ni respaldo; no presentarlo como producción.
- Mantener los contratos de datos de las vistas. Sustituir el transporte API, no los diseños.

## Impacto y diseño mínimo
api.mjs deja de hacer fetch y delega a un adaptador MemoryTreasury.
Las funciones puras de dominio y money/dates se reutilizan en navegador sin SQLite.
La navegación de páginas existentes se intercepta con History API para no destruir la memoria.
El servidor local opcional solo sirve archivos; no tiene API ni datos.
Login y gestión de usuarios se retiran de la demo; reiniciar ejemplo reemplaza esa área.
Excel/CSV/TSV se procesan en navegador, sin el puente Python de v1.

## Aceptación y evidencia prevista
D1: arranque con tres bancos, movimientos ficticios y tres escenarios sin login → test estado inicial y navegador.
D2: navegar, crear, editar, filtrar, duplicar, eliminar/deshacer, traspasar → unitarios + recorridos navegador.
D3: duplicar, comparar, cambiar supuestos, aplicar y conservar Base anterior → pruebas dominio y adaptador.
D4: recargar reinicia, navegación no reinicia, segunda pestaña aislada → navegador sin mock de red.
D5: ninguna solicitud /api, sin almacenamiento ni cookies → captura de tráfico y APIs de storage bloqueadas.
D6: importación y exportación local, límites y protección ante contenido inválido → pruebas y XLSX independiente.
D7: diseño 390/1536 sin desbordamiento y rutas bajo /tesoreria-efectiva/ → navegador.

## Fuera de alcance
Persistencia, usuarios y permisos reales, API remota, base de datos, despliegue en Supabase,
conexión bancaria, ejecución de pagos, envío programado de reportes, mejoras de producto no solicitadas.
La publicación solo se declara si se obtiene un despliegue comprobado; ZIP y bundle no son una URL pública.

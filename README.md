# Tesorería efectiva

Demo interactiva de frontend con **Dashboard, Bancos, Movimientos y Escenarios**. Mantiene el diseño aprobado, navegación superior y controles compactos. Proyecto independiente de **Forecast Minimalista**.

[![Verificar y publicar demo estática](https://github.com/Gusvann/tesoreria-efectiva/actions/workflows/pages.yml/badge.svg)](https://github.com/Gusvann/tesoreria-efectiva/actions/workflows/pages.yml)

## Probar la aplicación

La dirección de GitHub Pages configurada para este repositorio es:

**https://gusvann.github.io/tesoreria-efectiva/**

La disponibilidad depende de que el flujo **Verificar y publicar demo estática** termine con éxito. El código y las pruebas están en este repositorio; no se requiere descargarlo para usar el sitio publicado.

## Solo datos ficticios y memoria temporal

Al abrir se cargan **3 cuentas, 21 movimientos y 3 escenarios** sintéticos. Los cambios se conservan mientras navegas dentro de la misma pestaña. **Recargar, abrir otra pestaña o reiniciar el ejemplo restaura los datos iniciales.**

No utiliza Supabase, bases de datos, servidor de aplicación, autenticación real, cookies de aplicación, localStorage, sessionStorage ni IndexedDB. Nunca ingreses información financiera real. Las fuentes tipográficas pueden cargarse desde Google Fonts; las operaciones y archivos se procesan localmente y no se envían a un servidor.

## Funciones de demostración

- Dashboard: saldos, proyección, categorías y comparación de escenarios.
- Bancos: alta, edición, duplicado con saldo cero, archivo y traspasos ficticios.
- Movimientos: captura, filtros, selección, edición individual/en lote, duplicado, deshacer por 5 segundos, ejecución simulada y comprobantes temporales.
- Escenarios: copias independientes, supuestos y aplicación a Base con copia previa en memoria.
- Importación local XLSX/CSV/TSV o tabla pegada, con revisión antes de confirmar; exportación local a Excel.

Los importes se calculan en centavos exactos con BigInt. Los archivos exportados sí se descargan al dispositivo; reiniciar no borra esas descargas. La demo no ejecuta pagos ni conecta cuentas reales.

## Desarrollo y verificación

Node.js 22.16 o posterior compatible. Sin dependencias de ejecución.

```sh
npm run check
npm test
npm run build
npm start
```

`npm start` sirve exclusivamente archivos en `http://127.0.0.1:8080`. `npm run build` prepara `dist/` para alojamiento estático. No abrir el HTML mediante doble clic: los módulos requieren HTTP/HTTPS.

Las 39 pruebas automatizadas cubren cálculos, validaciones, aislamiento en memoria, escenarios e importación. El flujo de Pages ejecuta revisión de sintaxis, pruebas y construcción **antes** de desplegar; si alguna falla, no publica.

## Publicación

GitHub Pages debe usar **Settings → Pages → Source → GitHub Actions**. El flujo se activa con cambios en `main` o manualmente desde Actions. No requiere claves de base de datos ni secretos de API.

[Especificación y criterios de aceptación](docs/demo/SDD.md)

## Límites

Es una demo para probar diseño y recorridos. No es un sistema de tesorería de producción, no ofrece persistencia ni permisos multiusuario, no verifica la validez fiscal de comprobantes y no sustituye respaldos. Forecast Minimalista no se modifica con este despliegue.

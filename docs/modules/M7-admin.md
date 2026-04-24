# M7 — Control Administrativo (Sobre A + Avales)

## Propósito

### Sobre A (DEUC)
El Sobre A es el administrativo: documentos que acreditan que tu empresa existe, que estás al corriente de obligaciones fiscales y de Seguridad Social, y que cumples los requisitos de solvencia exigidos. El documento central es el **DEUC** (Documento Europeo Único de Contratación).

El DEUC es un formulario XML estándar de la UE que en teoría simplifica la presentación de licitaciones. En la práctica, rellenarlo bien para cada licitación sigue siendo un proceso manual que requiere 30-60 minutos si no tienes los datos organizados.

Este módulo lo automatiza: como ya tienes toda la información de la empresa en el Gestor de Solvencia, **genera el DEUC correcto para cada licitación en segundos**.

### Caja de Avales
Resuelve un problema financiero serio que muchas PYMES gestionan mal: el control de las garantías bancarias.

Cuando te adjudican una obra, tienes que depositar un aval bancario equivalente al **5% del contrato**. Ese dinero queda inmovilizado hasta que termina la obra y el organismo lo libera. El problema es que muchas empresas no reclaman la devolución a tiempo porque nadie controla las fechas.

Este módulo **calcula cuándo corresponde pedir cada devolución** y avisa automáticamente, liberando liquidez que estaba olvidada en el banco.

## Estado
🔲 Pendiente de construir

## Dependencias
- **M3 Solvencia** — datos de la empresa que alimentan el DEUC
- Esquema XML oficial del DEUC (Unión Europea)
- Integración con la PLACSP para validar el DEUC generado

## Notas de diseño
- Exportar DEUC como XML válido (verificable en el servicio oficial de la UE)
- Caja de avales: cada aval es una fila con fecha de inicio, fecha estimada de liberación, organismo, importe
- Avisos automáticos (email / push) cuando se acerque la fecha de liberación
